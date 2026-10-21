import { useState, useMemo, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Activity,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Dumbbell,
  Ellipsis,
  FileUp,
  Flame,
  LogOut,
  Pencil,
  Plus,
  Scale,
  ShieldCheck,
  Trash,
  Trophy,
  Users,
  Weight,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import { db, exportBackup, importBackup, type User, type Workout } from '../db';
import {
  UserDirectoryModal,
  CompareStrengthModal,
  FriendProfileModal,
} from '../components/SocialComparison.tsx';
import {
  calculateBMR,
  calculateLBM,
} from '../lib/calories';
import {
  cn,
  downloadJSON,
  fmtDate,
  fmtDuration,
  fmtNum,
  fmtTime,
  fmtVolume,
  startOfWeek,
} from '../lib/utils';
import {
  activeExerciseFrom,
  activeFromWorkout,
  toWorkoutExercises,
  totalsOf,
  type ActiveExercise,
} from '../lib/workout';
import { toast } from '../lib/hooks';
import { useAuth } from '../state/AuthContext';
import {
  ActionSheet,
  Alert,
  EmptyState,
  PageHeader,
  PrimaryButton,
  Sheet,
  SheetTextButton,
  type AlertConfig,
} from '../components/ui';
import { WorkoutExercisesEditor } from '../components/workout/ExerciseCard';
import { ExerciseDetailSheet } from '../components/ExerciseDetail';
import { BodyDistributionModal } from '../components/AnatomyMap';

type ChartMetric = 'duration' | 'volume' | 'reps';

export function ProfilePage({ onNavigateTab }: { onNavigateTab?: (tab: 'workout' | 'routines' | 'exercises' | 'profile') => void }) {
  const {
    currentUser,
    users,
    switchUser,
    updateBiometrics,
    registerUser,
    deleteUser,
    logout,
    getFollowersCount,
    getFollowingCount,
  } = useAuth();

  // Load all workouts for the current user
  const workouts = useLiveQuery<Workout[]>(
    async () => {
      if (!currentUser) return [];
      return db.workouts.where('userId').equals(currentUser.id).reverse().sortBy('startedAt');
    },
    [currentUser?.id],
  );

  const allExercises = useLiveQuery(() => db.exercises.toArray(), []);

  // UI state
  const [metric, setMetric] = useState<ChartMetric>('duration');
  const [bodyDistOpen, setBodyDistOpen] = useState(false);
  const [biometricsOpen, setBiometricsOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [accountSwitcherOpen, setAccountSwitcherOpen] = useState(false);
  const [backupSheetOpen, setBackupSheetOpen] = useState(false);

  // Social & Friend Comparison state
  const [socialDirectoryOpen, setSocialDirectoryOpen] = useState(false);
  const [compareStrengthOpen, setCompareStrengthOpen] = useState(false);
  const [selectedFriendForProfile, setSelectedFriendForProfile] = useState<User | null>(null);
  const [selectedFriendForCompare, setSelectedFriendForCompare] = useState<User | null>(null);

  // Workout item options & detail sheet
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
  const [editingWorkout, setEditingWorkout] = useState<Workout | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [alert, setAlert] = useState<AlertConfig | null>(null);
  const [detailExerciseId, setDetailExerciseId] = useState<number | null>(null);

  // Overall calculations
  const totalWorkouts = workouts?.length ?? 0;

  const bmr = useMemo(() => {
    if (!currentUser) return 1800;
    return calculateBMR(currentUser);
  }, [currentUser]);

  const lbm = useMemo(() => {
    if (!currentUser) return 60;
    return calculateLBM(currentUser.weightKg, currentUser.bodyFatPercentage);
  }, [currentUser]);

  // Average workout calories
  const avgWorkoutCalories = useMemo(() => {
    if (!workouts || workouts.length === 0) return 0;
    const withCalories = workouts.filter((w) => (w.caloriesBurned ?? 0) > 0);
    if (withCalories.length === 0) return 0;
    const sum = withCalories.reduce((acc, w) => acc + (w.caloriesBurned || 0), 0);
    return Math.round(sum / withCalories.length);
  }, [workouts]);

  // Workouts this month
  const workoutsThisMonth = useMemo(() => {
    if (!workouts) return 0;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return workouts.filter((w) => w.startedAt >= startOfMonth).length;
  }, [workouts]);

  // 12-week activity chart data
  const { chartData, thisWeekStat } = useMemo(() => {
    const list: { weekIndex: number; label: string; durationHours: number; volumeKg: number; reps: number }[] = [];
    const nowTs = Date.now();
    const currentWeekStart = startOfWeek(nowTs);
    const ONE_WEEK_MS = 7 * 86400000;

    for (let i = 11; i >= 0; i--) {
      const wStart = currentWeekStart - i * ONE_WEEK_MS;
      const wEnd = wStart + ONE_WEEK_MS;
      const weekWorkouts = (workouts ?? []).filter((w) => w.startedAt >= wStart && w.startedAt < wEnd);

      const durationSec = weekWorkouts.reduce((s, w) => s + (w.durationSec || 0), 0);
      const volumeKg = weekWorkouts.reduce((s, w) => s + (w.totalVolume || 0), 0);
      const reps = weekWorkouts.reduce(
        (s, w) =>
          s +
          w.exercises.reduce(
            (es, e) => es + e.sets.reduce((ss, set) => ss + (set.reps || 0), 0),
            0,
          ),
        0,
      );

      const d = new Date(wStart);
      const label = i === 0 ? 'This Wk' : `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })}`;
      list.push({
        weekIndex: 11 - i,
        label,
        durationHours: Number((durationSec / 3600).toFixed(1)),
        volumeKg,
        reps,
      });
    }

    const currentWeekItem = list[list.length - 1];
    let statText = '';
    if (metric === 'duration') {
      statText = `${currentWeekItem?.durationHours ?? 0} hrs this week`;
    } else if (metric === 'volume') {
      statText = `${fmtVolume(currentWeekItem?.volumeKg ?? 0)} lifted this week`;
    } else {
      statText = `${fmtNum(currentWeekItem?.reps ?? 0)} reps this week`;
    }

    return { chartData: list, thisWeekStat: statText };
  }, [workouts, metric]);

  // Muscle sets breakdown for BodyDistributionModal
  const { workoutMuscleSets, totalSetsWorked, workoutDaysThisWeek } = useMemo(() => {
    const muscleSets: Record<string, number> = {};
    let totalSets = 0;
    const daysSet = new Set<number>();
    const nowTs = Date.now();
    const wStart = startOfWeek(nowTs);
    const thisWeekWorkouts = (workouts ?? []).filter((w) => w.startedAt >= wStart);

    thisWeekWorkouts.forEach((w) => {
      const dayIdx = (new Date(w.startedAt).getDay() + 6) % 7;
      daysSet.add(dayIdx);
    });

    const exMap = new Map((allExercises ?? []).map((e) => [e.id, e]));

    // We aggregate from all workouts (or past 4 weeks) for good anatomical coverage
    const recentWorkouts = (workouts ?? []).slice(0, 15);
    recentWorkouts.forEach((w) => {
      w.exercises.forEach((we) => {
        const ex = exMap.get(we.exerciseId);
        const count = we.sets.filter((s) => s.reps > 0).length;
        if (ex && count > 0) {
          totalSets += count;
          ex.primaryMuscles?.forEach((m) => {
            muscleSets[m] = (muscleSets[m] || 0) + count;
          });
          ex.secondaryMuscles?.forEach((m) => {
            muscleSets[m] = (muscleSets[m] || 0) + Math.round(count * 0.5);
          });
        }
      });
    });

    return {
      workoutMuscleSets: muscleSets,
      totalSetsWorked: totalSets,
      workoutDaysThisWeek: Array.from(daysSet),
    };
  }, [workouts, allExercises]);

  const handleDeleteWorkout = (w: Workout) => {
    setAlert({
      title: 'Delete workout log?',
      message: `“${w.name}” from ${fmtDate(w.startedAt)} will be deleted. This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: async () => {
        await db.workouts.delete(w.id);
        toast('Workout deleted', 'info');
      },
    });
  };

  return (
    <div className="pb-28">
      <PageHeader
        title="Profile"
        subtitle={currentUser ? `@${currentUser.username}` : 'Personal Profile'}
        right={
          <div className="flex items-center gap-2">
            <button
              id="switch-account-header-btn"
              onClick={() => setAccountSwitcherOpen(true)}
              aria-label="Switch User"
              className="flex items-center gap-1.5 rounded-xl bg-zinc-800/90 px-3 py-1.5 text-[13px] font-semibold text-zinc-200 transition active:scale-95"
            >
              <Users size={16} className="text-brand" />
              <span>Accounts</span>
            </button>
            <button
              id="backup-button"
              onClick={() => setBackupSheetOpen(true)}
              aria-label="Backup"
              className="grid h-8 w-8 place-items-center rounded-xl bg-zinc-800/90 text-zinc-300 transition active:scale-95"
            >
              <ShieldCheck size={17} className="text-emerald-400" />
            </button>
            <button
              id="logout-button"
              onClick={logout}
              aria-label="Sign Out"
              title="Sign Out"
              className="grid h-8 w-8 place-items-center rounded-xl bg-zinc-800/90 text-zinc-400 hover:text-red-400 transition active:scale-95"
            >
              <LogOut size={16} />
            </button>
          </div>
        }
      />

      <div className="space-y-5 px-4 pt-1">
        {/* Profile Card Header */}
        <section className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <div
                className="grid h-16 w-16 place-items-center rounded-2xl text-[22px] font-bold text-white shadow-lg"
                style={{ backgroundColor: currentUser?.avatarColor || '#3b82f6' }}
              >
                {currentUser?.name ? currentUser.name.slice(0, 2).toUpperCase() : 'U'}
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-[20px] font-bold text-zinc-100">{currentUser?.name || 'Athlete'}</h2>
                <div className="text-[13px] text-zinc-400">@{currentUser?.username || 'user'}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-2.5 py-0.5 text-[11px] font-semibold text-brand">
                    <Flame size={12} /> {totalWorkouts} Workouts
                  </div>
                  <div className="flex items-center gap-2 text-[12px] text-zinc-400">
                    <button
                      onClick={() => setSocialDirectoryOpen(true)}
                      className="hover:text-brand transition cursor-pointer"
                    >
                      <strong className="text-zinc-200">
                        {currentUser ? getFollowersCount(currentUser.id) : 0}
                      </strong>{' '}
                      Followers
                    </button>
                    <span>·</span>
                    <button
                      onClick={() => setSocialDirectoryOpen(true)}
                      className="hover:text-brand transition cursor-pointer"
                    >
                      <strong className="text-zinc-200">
                        {currentUser ? getFollowingCount(currentUser.id) : 0}
                      </strong>{' '}
                      Following
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <button
              id="edit-biometrics-btn"
              onClick={() => setBiometricsOpen(true)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zinc-800 text-zinc-300 transition active:scale-95 active:bg-zinc-700"
              aria-label="Edit Biometrics"
            >
              <Pencil size={17} />
            </button>
          </div>

          {/* Biometrics Badges Strip */}
          <div className="mt-4 grid grid-cols-4 gap-2 border-t border-white/5 pt-3.5 text-center">
            <div className="rounded-xl bg-zinc-950/60 py-2 px-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Weight</div>
              <div className="mt-0.5 text-[14px] font-bold text-zinc-200 tabular">{currentUser?.weightKg ?? 75} kg</div>
            </div>
            <div className="rounded-xl bg-zinc-950/60 py-2 px-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Height</div>
              <div className="mt-0.5 text-[14px] font-bold text-zinc-200 tabular">{currentUser?.heightCm ?? 178} cm</div>
            </div>
            <div className="rounded-xl bg-zinc-950/60 py-2 px-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Body Fat</div>
              <div className="mt-0.5 text-[14px] font-bold text-zinc-200 tabular">
                {currentUser?.bodyFatPercentage ? `${currentUser.bodyFatPercentage}%` : '—'}
              </div>
            </div>
            <div className="rounded-xl bg-zinc-950/60 py-2 px-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">BMR</div>
              <div className="mt-0.5 text-[14px] font-bold text-amber-300 tabular">{bmr} kcal</div>
            </div>
          </div>
        </section>

        {/* Social & Strength Comparison Hub */}
        <section className="grid grid-cols-2 gap-3">
          <button
            id="compare-strength-banner-btn"
            onClick={() => setCompareStrengthOpen(true)}
            className="flex flex-col justify-between rounded-2xl border border-brand/40 bg-gradient-to-br from-brand/20 via-zinc-900 to-zinc-900 p-4 text-left shadow-lg shadow-brand/10 transition active:scale-[0.98]"
          >
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-white shadow-md shadow-brand/40">
              <Trophy size={20} />
            </div>
            <div className="mt-4">
              <div className="flex items-center gap-1.5 text-[15px] font-extrabold text-zinc-100">
                <span>Gücünü Karşılaştır</span>
              </div>
              <div className="mt-0.5 text-[12px] text-zinc-400">
                1RM, Max Weight & Best Set vs Friends
              </div>
            </div>
          </button>

          <button
            id="social-directory-banner-btn"
            onClick={() => setSocialDirectoryOpen(true)}
            className="flex flex-col justify-between rounded-2xl border border-white/[0.06] bg-zinc-900/90 p-4 text-left transition active:scale-[0.98] active:bg-zinc-800"
          >
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-purple-500/15 text-purple-400 shadow-sm">
              <Users size={20} />
            </div>
            <div className="mt-4">
              <div className="text-[15px] font-bold text-zinc-100">Social & Friends</div>
              <div className="mt-0.5 text-[12px] text-zinc-400">
                Athlete Directory, Follows & Friend Logs
              </div>
            </div>
          </button>
        </section>

        {/* Weekly Activity Bar Chart (Last 12 Weeks) */}
        <section className="rounded-3xl border border-white/[0.06] bg-zinc-900/90 p-5">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[17px] font-bold text-zinc-100">Weekly Activity</h3>
            <span className="text-[13px] font-semibold text-brand tabular">{thisWeekStat}</span>
          </div>

          <div className="mt-4 h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 4, left: -25, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  stroke="#71717a"
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: '#27272a' }}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      const valStr =
                        metric === 'duration'
                          ? `${data.durationHours} hrs`
                          : metric === 'volume'
                          ? `${fmtVolume(data.volumeKg)}`
                          : `${fmtNum(data.reps)} reps`;
                      return (
                        <div className="rounded-xl border border-white/10 bg-zinc-950/95 px-3 py-2 text-[12px] shadow-xl">
                          <div className="font-semibold text-zinc-400">{data.label}</div>
                          <div className="mt-0.5 font-bold text-brand text-[14px]">{valStr}</div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar
                  dataKey={
                    metric === 'duration'
                      ? 'durationHours'
                      : metric === 'volume'
                      ? 'volumeKg'
                      : 'reps'
                  }
                  fill="#3b82f6"
                  radius={[5, 5, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 3 Metric Toggle Pills */}
          <div className="mt-4 flex rounded-xl bg-zinc-950/80 p-1">
            <button
              onClick={() => setMetric('duration')}
              className={cn(
                'flex-1 rounded-lg py-2 text-[13px] font-semibold transition active:scale-95',
                metric === 'duration'
                  ? 'bg-brand text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200',
              )}
            >
              Duration
            </button>
            <button
              onClick={() => setMetric('volume')}
              className={cn(
                'flex-1 rounded-lg py-2 text-[13px] font-semibold transition active:scale-95',
                metric === 'volume'
                  ? 'bg-brand text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200',
              )}
            >
              Volume
            </button>
            <button
              onClick={() => setMetric('reps')}
              className={cn(
                'flex-1 rounded-lg py-2 text-[13px] font-semibold transition active:scale-95',
                metric === 'reps'
                  ? 'bg-brand text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200',
              )}
            >
              Reps
            </button>
          </div>
        </section>

        {/* 2x2 Dashboard Grid (Pano) */}
        <section>
          <h3 className="mb-3 text-[17px] font-bold text-zinc-100">Dashboard</h3>
          <div className="grid grid-cols-2 gap-3">
            {/* Tile 1: Statistics -> Body Distribution */}
            <button
              id="dashboard-statistics-tile"
              onClick={() => setBodyDistOpen(true)}
              className="flex flex-col justify-between rounded-2xl border border-white/[0.06] bg-zinc-900/90 p-4 text-left transition active:scale-[0.98] active:bg-zinc-800"
            >
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand/15 text-brand shadow-sm">
                <Activity size={20} />
              </div>
              <div className="mt-4">
                <div className="text-[16px] font-bold text-zinc-100">Statistics</div>
                <div className="mt-0.5 text-[12px] text-zinc-400">Body Distribution & Heatmap</div>
              </div>
            </button>

            {/* Tile 2: Exercises -> Jump to Library */}
            <button
              id="dashboard-exercises-tile"
              onClick={() => onNavigateTab?.('exercises')}
              className="flex flex-col justify-between rounded-2xl border border-white/[0.06] bg-zinc-900/90 p-4 text-left transition active:scale-[0.98] active:bg-zinc-800"
            >
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-purple-500/15 text-purple-400 shadow-sm">
                <Dumbbell size={20} />
              </div>
              <div className="mt-4">
                <div className="text-[16px] font-bold text-zinc-100">Exercises</div>
                <div className="mt-0.5 text-[12px] text-zinc-400">Library & Personal Records</div>
              </div>
            </button>

            {/* Tile 3: Measurements / Biometrics */}
            <button
              id="dashboard-measurements-tile"
              onClick={() => setBiometricsOpen(true)}
              className="flex flex-col justify-between rounded-2xl border border-white/[0.06] bg-zinc-900/90 p-4 text-left transition active:scale-[0.98] active:bg-zinc-800"
            >
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400 shadow-sm">
                <Scale size={20} />
              </div>
              <div className="mt-4">
                <div className="text-[16px] font-bold text-zinc-100">Measurements</div>
                <div className="mt-0.5 text-[12px] text-zinc-400">
                  {currentUser?.weightKg} kg · BMR {bmr} kcal
                </div>
              </div>
            </button>

            {/* Tile 4: Calendar */}
            <button
              id="dashboard-calendar-tile"
              onClick={() => setCalendarOpen(true)}
              className="flex flex-col justify-between rounded-2xl border border-white/[0.06] bg-zinc-900/90 p-4 text-left transition active:scale-[0.98] active:bg-zinc-800"
            >
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-orange-500/15 text-orange-400 shadow-sm">
                <Calendar size={20} />
              </div>
              <div className="mt-4">
                <div className="text-[16px] font-bold text-zinc-100">Calendar</div>
                <div className="mt-0.5 text-[12px] text-zinc-400">
                  {workoutsThisMonth} workout{workoutsThisMonth === 1 ? '' : 's'} this month
                </div>
              </div>
            </button>
          </div>
        </section>

        {/* Workout History Logs Section */}
        <section className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[17px] font-bold text-zinc-100">Recent Workouts</h3>
            <span className="text-[13px] font-semibold text-zinc-500">{totalWorkouts} total</span>
          </div>

          {workouts && workouts.length === 0 ? (
            <EmptyState
              icon={Dumbbell}
              title="No workouts recorded"
              text="Your completed workouts and personal records will appear here."
            />
          ) : (
            <div className="space-y-3.5">
              {workouts?.slice(0, 10).map((w) => (
                <WorkoutHistoryCard
                  key={w.id}
                  workout={w}
                  onOptions={() => {
                    setSelectedWorkout(w);
                    setMenuOpen(true);
                  }}
                  onOpenDetail={(exerciseId) => setDetailExerciseId(exerciseId)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Anatomical Body Distribution Modal */}
      <BodyDistributionModal
        open={bodyDistOpen}
        onClose={() => setBodyDistOpen(false)}
        workoutMuscleSets={workoutMuscleSets}
        totalSets={totalSetsWorked}
        workoutDays={workoutDaysThisWeek}
      />

      {/* Biometrics Editor Sheet */}
      <BiometricsEditorSheet
        open={biometricsOpen}
        onClose={() => setBiometricsOpen(false)}
        currentUser={currentUser}
        onSave={updateBiometrics}
        bmr={bmr}
        lbm={lbm}
        avgWorkoutCalories={avgWorkoutCalories}
      />

      {/* Workout Calendar Sheet */}
      <CalendarSheet
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        workouts={workouts ?? []}
        onOpenWorkout={(w) => {
          setSelectedWorkout(w);
          setMenuOpen(true);
        }}
      />

      {/* Account Switcher & Add User Modal */}
      <AccountSwitcherSheet
        open={accountSwitcherOpen}
        onClose={() => setAccountSwitcherOpen(false)}
        users={users}
        currentUser={currentUser}
        onSwitch={(id) => {
          switchUser(id);
          setAccountSwitcherOpen(false);
        }}
        onRegister={registerUser}
        onDelete={deleteUser}
        onLogout={() => {
          setAccountSwitcherOpen(false);
          logout();
        }}
      />

      {/* Social Athlete Directory Modal */}
      <UserDirectoryModal
        open={socialDirectoryOpen}
        onClose={() => setSocialDirectoryOpen(false)}
        onSelectCompare={(friend) => {
          setSelectedFriendForCompare(friend);
          setSocialDirectoryOpen(false);
          setCompareStrengthOpen(true);
        }}
        onOpenFriendProfile={(friend) => {
          setSelectedFriendForProfile(friend);
          setSocialDirectoryOpen(false);
        }}
      />

      {/* Compare Strength (Gücünü Karşılaştır) Modal */}
      <CompareStrengthModal
        open={compareStrengthOpen}
        onClose={() => setCompareStrengthOpen(false)}
        initialFriend={selectedFriendForCompare}
      />

      {/* Friend Profile Modal */}
      <FriendProfileModal
        friend={selectedFriendForProfile}
        open={!!selectedFriendForProfile}
        onClose={() => setSelectedFriendForProfile(null)}
        onCompareWithFriend={(friend) => {
          setSelectedFriendForProfile(null);
          setSelectedFriendForCompare(friend);
          setCompareStrengthOpen(true);
        }}
      />

      {/* Workout Options Menu */}
      {selectedWorkout && (
        <ActionSheet
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          title={selectedWorkout.name}
          actions={[
            {
              label: 'Edit Workout Log',
              icon: Pencil,
              onClick: () => setEditingWorkout(selectedWorkout),
            },
            {
              label: 'Delete Workout Log',
              icon: Trash,
              destructive: true,
              onClick: () => handleDeleteWorkout(selectedWorkout),
            },
          ]}
        />
      )}

      {/* Workout Editor Modal */}
      {editingWorkout && (
        <EditWorkoutSheet
          workout={editingWorkout}
          open={!!editingWorkout}
          onClose={() => setEditingWorkout(null)}
        />
      )}

      {/* Backup & Restore Sheet */}
      <BackupSheet open={backupSheetOpen} onClose={() => setBackupSheetOpen(false)} />

      {/* Exercise Detail Sheet */}
      <ExerciseDetailSheet
        exerciseId={detailExerciseId}
        onClose={() => setDetailExerciseId(null)}
      />

      <Alert config={alert} onClose={() => setAlert(null)} />
    </div>
  );
}

// ───────────────────────── Workout History Card ─────────────────────────

function WorkoutHistoryCard({
  workout,
  onOptions,
  onOpenDetail,
}: {
  workout: Workout;
  onOptions: () => void;
  onOpenDetail: (exerciseId: number) => void;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-white/[0.06] bg-zinc-900 p-4 transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[18px] font-bold text-zinc-100">{workout.name}</h3>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-zinc-500">
            <span>{fmtDate(workout.startedAt, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
            <span>·</span>
            <span>{fmtTime(workout.startedAt)}</span>
          </div>
        </div>
        <button
          aria-label="Workout options"
          onClick={onOptions}
          className="grid h-8 w-8 place-items-center rounded-full text-zinc-400 active:bg-white/10"
        >
          <Ellipsis size={20} />
        </button>
      </div>

      {workout.notes && <p className="mt-2 text-[14px] text-zinc-400 italic">“{workout.notes}”</p>}

      {/* 4-Item Metrics bar with Calories Burned */}
      <div className="mt-3.5 grid grid-cols-4 gap-1.5 rounded-xl bg-zinc-950/60 p-2.5 text-center">
        <div>
          <div className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase text-zinc-500">
            <Clock size={11} /> Time
          </div>
          <div className="mt-0.5 text-[14px] font-bold text-zinc-200 tabular">{fmtDuration(workout.durationSec)}</div>
        </div>
        <div>
          <div className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase text-zinc-500">
            <Weight size={11} /> Volume
          </div>
          <div className="mt-0.5 text-[14px] font-bold text-zinc-200 tabular">{fmtVolume(workout.totalVolume)}</div>
        </div>
        <div>
          <div className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase text-zinc-500">
            <Dumbbell size={11} /> Sets
          </div>
          <div className="mt-0.5 text-[14px] font-bold text-zinc-200 tabular">{workout.totalSets}</div>
        </div>
        <div>
          <div className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase text-amber-400">
            <Flame size={11} /> Burned
          </div>
          <div className="mt-0.5 text-[14px] font-bold text-amber-300 tabular">
            🔥 {workout.caloriesBurned || 0}
          </div>
        </div>
      </div>

      {/* Exercises Breakdown */}
      <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
        {workout.exercises.map((e) => {
          const validSets = e.sets.filter((s) => s.reps > 0);
          return (
            <div key={e.uid} className="text-[14px]">
              <div className="flex items-baseline justify-between">
                <button
                  onClick={() => onOpenDetail(e.exerciseId)}
                  className="font-semibold text-brand transition active:opacity-60"
                >
                  {e.sets.length} × {e.name}
                </button>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-1.5 text-[12px] text-zinc-400">
                {validSets.map((s, idx) => (
                  <span key={s.uid || idx} className="rounded bg-zinc-800/80 px-2 py-0.5 tabular">
                    {s.weight > 0 ? `${fmtNum(s.weight, 1)}kg × ${s.reps}` : `${s.reps} reps`}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

// ───────────────────────── Biometrics Editor Sheet ─────────────────────────

function BiometricsEditorSheet({
  open,
  onClose,
  currentUser,
  onSave,
  bmr,
  lbm,
  avgWorkoutCalories,
}: {
  open: boolean;
  onClose: () => void;
  currentUser: User | null;
  onSave: (patch: Partial<Omit<User, 'id' | 'createdAt'>>) => Promise<void>;
  bmr: number;
  lbm: number;
  avgWorkoutCalories: number;
}) {
  const [weight, setWeight] = useState(currentUser?.weightKg ?? 75);
  const [height, setHeight] = useState(currentUser?.heightCm ?? 178);
  const [age, setAge] = useState(currentUser?.age ?? 25);
  const [gender, setGender] = useState<'male' | 'female'>(currentUser?.gender ?? 'male');
  const [bodyFat, setBodyFat] = useState<string>(currentUser?.bodyFatPercentage ? String(currentUser.bodyFatPercentage) : '');

  useEffect(() => {
    if (currentUser) {
      setWeight(currentUser.weightKg);
      setHeight(currentUser.heightCm);
      setAge(currentUser.age);
      setGender(currentUser.gender);
      setBodyFat(currentUser.bodyFatPercentage ? String(currentUser.bodyFatPercentage) : '');
    }
  }, [currentUser, open]);

  const handleSave = async () => {
    const bfNum = bodyFat.trim() ? parseFloat(bodyFat) : undefined;
    await onSave({
      weightKg: Math.max(30, Math.min(300, weight)),
      heightCm: Math.max(100, Math.min(250, height)),
      age: Math.max(12, Math.min(100, age)),
      gender,
      bodyFatPercentage: bfNum && !isNaN(bfNum) ? bfNum : undefined,
    });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      full
      title="Measurements & Biometrics"
      left={<SheetTextButton onClick={onClose}>Cancel</SheetTextButton>}
    >
      <div className="flex min-h-full flex-col px-4 pb-28 pt-2">
        <div className="space-y-4">
          {/* Scientific Calculation Live Banner */}
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.08] p-4">
            <div className="flex items-center gap-2 text-[14px] font-bold text-amber-300">
              <Flame size={16} /> Live Calorie Profile
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-black/40 p-2">
                <div className="text-[10px] font-semibold uppercase text-zinc-400">Daily BMR</div>
                <div className="mt-0.5 text-[15px] font-bold text-amber-300 tabular">{bmr} kcal</div>
              </div>
              <div className="rounded-xl bg-black/40 p-2">
                <div className="text-[10px] font-semibold uppercase text-zinc-400">Lean Mass (LBM)</div>
                <div className="mt-0.5 text-[15px] font-bold text-zinc-200 tabular">{lbm} kg</div>
              </div>
              <div className="rounded-xl bg-black/40 p-2">
                <div className="text-[10px] font-semibold uppercase text-zinc-400">Avg Workout</div>
                <div className="mt-0.5 text-[15px] font-bold text-orange-400 tabular">{avgWorkoutCalories} kcal</div>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-zinc-400">
              Uses Katch-McArdle formula with Body Fat %, or Mifflin-St Jeor formula based on height and age.
            </p>
          </div>

          {/* Form fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
                Weight (kg)
              </label>
              <input
                type="number"
                step="0.5"
                value={weight}
                onChange={(e) => setWeight(parseFloat(e.target.value) || 0)}
                className="h-12 w-full rounded-xl bg-zinc-800 px-4 text-[17px] font-bold text-zinc-100 outline-none ring-brand/60 focus:ring-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
                Height (cm)
              </label>
              <input
                type="number"
                value={height}
                onChange={(e) => setHeight(parseInt(e.target.value, 10) || 0)}
                className="h-12 w-full rounded-xl bg-zinc-800 px-4 text-[17px] font-bold text-zinc-100 outline-none ring-brand/60 focus:ring-2"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
                Age (years)
              </label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(parseInt(e.target.value, 10) || 0)}
                className="h-12 w-full rounded-xl bg-zinc-800 px-4 text-[17px] font-bold text-zinc-100 outline-none ring-brand/60 focus:ring-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
                Body Fat % (Optional)
              </label>
              <input
                type="number"
                step="0.5"
                placeholder="e.g. 15"
                value={bodyFat}
                onChange={(e) => setBodyFat(e.target.value)}
                className="h-12 w-full rounded-xl bg-zinc-800 px-4 text-[17px] font-bold text-zinc-100 outline-none ring-brand/60 focus:ring-2"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
              Biological Gender
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setGender('male')}
                className={cn(
                  'rounded-xl py-3 text-[15px] font-semibold transition active:scale-95',
                  gender === 'male'
                    ? 'bg-brand text-white shadow-md shadow-brand/20'
                    : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200',
                )}
              >
                Male
              </button>
              <button
                type="button"
                onClick={() => setGender('female')}
                className={cn(
                  'rounded-xl py-3 text-[15px] font-semibold transition active:scale-95',
                  gender === 'female'
                    ? 'bg-brand text-white shadow-md shadow-brand/20'
                    : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200',
                )}
              >
                Female
              </button>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 mt-auto bg-gradient-to-t from-zinc-900 via-zinc-900 to-transparent pt-6 pb-[max(12px,env(safe-area-inset-bottom))]">
          <PrimaryButton onClick={handleSave}>Save Biometrics</PrimaryButton>
        </div>
      </div>
    </Sheet>
  );
}

// ───────────────────────── Account Switcher & Add User Sheet ─────────────────────────

function AccountSwitcherSheet({
  open,
  onClose,
  users,
  currentUser,
  onSwitch,
  onRegister,
  onDelete,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  users: User[];
  currentUser: User | null;
  onSwitch: (id: number) => void;
  onRegister: (data: {
    username: string;
    name: string;
    gender: 'male' | 'female';
    age: number;
    weightKg: number;
    heightCm: number;
    bodyFatPercentage?: number;
    avatarColor?: string;
  }) => Promise<User>;
  onDelete: (id: number) => Promise<void>;
  onLogout?: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [weightKg, setWeightKg] = useState(75);
  const [heightCm, setHeightCm] = useState(178);
  const [age, setAge] = useState(25);
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [bodyFat, setBodyFat] = useState('');
  const [avatarColor, setAvatarColor] = useState('#3b82f6');
  const [loading, setLoading] = useState(false);

  const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444'];

  const handleCreate = async () => {
    if (!username.trim()) {
      toast('Please enter a username', 'error');
      return;
    }
    setLoading(true);
    try {
      const bfNum = bodyFat.trim() ? parseFloat(bodyFat) : undefined;
      await onRegister({
        username: username.trim(),
        name: name.trim() || username.trim(),
        gender,
        age,
        weightKg,
        heightCm,
        bodyFatPercentage: bfNum && !isNaN(bfNum) ? bfNum : undefined,
        avatarColor,
      });
      setCreating(false);
      setUsername('');
      setName('');
      onClose();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to create user', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      full
      title={creating ? 'Create Account' : 'Switch Account'}
      left={<SheetTextButton onClick={onClose}>Done</SheetTextButton>}
    >
      <div className="space-y-4 px-4 pb-28 pt-2">
        {!creating ? (
          <>
            <div className="divide-y divide-white/5 rounded-2xl border border-white/[0.06] bg-zinc-950/60 overflow-hidden">
              {users.map((u) => {
                const isActive = u.id === currentUser?.id;
                return (
                  <div
                    key={u.id}
                    onClick={() => onSwitch(u.id)}
                    className={cn(
                      'flex items-center justify-between p-3.5 transition cursor-pointer active:bg-white/5',
                      isActive && 'bg-brand/10',
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[16px] font-bold text-white shadow"
                        style={{ backgroundColor: u.avatarColor || '#3b82f6' }}
                      >
                        {u.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-bold text-zinc-100 truncate">
                          <span>{u.name}</span>
                          {isActive && (
                            <span className="rounded bg-brand/20 px-1.5 py-0.2 text-[10px] font-semibold text-brand">
                              Active
                            </span>
                          )}
                        </div>
                        <div className="text-[12px] text-zinc-400">
                          @{u.username} · {u.weightKg}kg · {u.gender}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isActive ? (
                        <div className="grid h-7 w-7 place-items-center rounded-full bg-brand text-white shadow-sm">
                          <Check size={16} strokeWidth={3} />
                        </div>
                      ) : (
                        users.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void onDelete(u.id);
                            }}
                            className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 hover:text-red-400 active:bg-red-500/10"
                            aria-label="Delete User"
                          >
                            <Trash size={15} />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              id="add-new-user-btn"
              onClick={() => setCreating(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3.5 text-[15px] font-semibold text-white shadow-md shadow-brand/25 transition active:scale-[0.98]"
            >
              <Plus size={18} strokeWidth={2.5} /> Add Friend / New User
            </button>

            {onLogout && (
              <button
                id="sign-out-account-switcher-btn"
                onClick={onLogout}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 py-3 text-[14px] font-semibold text-red-400 transition active:scale-[0.98] hover:bg-red-500/15"
              >
                <LogOut size={16} /> Sign Out of KoyuncuFit
              </button>
            )}
          </>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
                Username
              </label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. alex_lift"
                className="h-12 w-full rounded-xl bg-zinc-800 px-4 text-[16px] font-semibold text-zinc-100 outline-none ring-brand/60 focus:ring-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
                Display Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alex"
                className="h-12 w-full rounded-xl bg-zinc-800 px-4 text-[16px] font-semibold text-zinc-100 outline-none ring-brand/60 focus:ring-2"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
                  Weight (kg)
                </label>
                <input
                  type="number"
                  value={weightKg}
                  onChange={(e) => setWeightKg(parseFloat(e.target.value) || 0)}
                  className="h-12 w-full rounded-xl bg-zinc-800 px-4 text-[16px] font-bold outline-none ring-brand/60 focus:ring-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
                  Height (cm)
                </label>
                <input
                  type="number"
                  value={heightCm}
                  onChange={(e) => setHeightCm(parseInt(e.target.value, 10) || 0)}
                  className="h-12 w-full rounded-xl bg-zinc-800 px-4 text-[16px] font-bold outline-none ring-brand/60 focus:ring-2"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
                  Age
                </label>
                <input
                  type="number"
                  value={age}
                  onChange={(e) => setAge(parseInt(e.target.value, 10) || 0)}
                  className="h-12 w-full rounded-xl bg-zinc-800 px-4 text-[16px] font-bold outline-none ring-brand/60 focus:ring-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
                  Gender
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setGender('male')}
                    className={cn(
                      'rounded-xl py-3 text-[14px] font-semibold',
                      gender === 'male' ? 'bg-brand text-white' : 'bg-zinc-800 text-zinc-400',
                    )}
                  >
                    M
                  </button>
                  <button
                    type="button"
                    onClick={() => setGender('female')}
                    className={cn(
                      'rounded-xl py-3 text-[14px] font-semibold',
                      gender === 'female' ? 'bg-brand text-white' : 'bg-zinc-800 text-zinc-400',
                    )}
                  >
                    F
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
                Body Fat % (Optional)
              </label>
              <input
                type="number"
                step="0.5"
                placeholder="e.g. 15"
                value={bodyFat}
                onChange={(e) => setBodyFat(e.target.value)}
                className="h-12 w-full rounded-xl bg-zinc-800 px-4 text-[16px] font-bold outline-none ring-brand/60 focus:ring-2"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
                Avatar Theme Color
              </label>
              <div className="flex gap-2">
                {colors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setAvatarColor(c)}
                    className={cn(
                      'h-9 w-9 rounded-full transition active:scale-95',
                      avatarColor === c && 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900',
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="flex-1 rounded-xl bg-zinc-800 py-3 text-[15px] font-semibold text-zinc-300"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={loading || !username.trim()}
                className="flex-[2] rounded-xl bg-brand py-3 text-[15px] font-semibold text-white shadow-md shadow-brand/20 disabled:opacity-40"
              >
                {loading ? 'Creating…' : 'Register Account'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

// ───────────────────────── Full Calendar Sheet ─────────────────────────

function CalendarSheet({
  open,
  onClose,
  workouts,
  onOpenWorkout,
}: {
  open: boolean;
  onClose: () => void;
  workouts: Workout[];
  onOpenWorkout: (w: Workout) => void;
}) {
  const [currentMonthDate, setCurrentMonthDate] = useState(() => new Date());

  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();

  const monthLabel = currentMonthDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  // Compute days in month
  const firstDayOfMonth = new Date(year, month, 1);
  const startDayIdx = (firstDayOfMonth.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Map workouts by date string YYYY-MM-DD
  const workoutsByDate = useMemo(() => {
    const map = new Map<string, Workout[]>();
    for (const w of workouts) {
      const d = new Date(w.startedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(w);
    }
    return map;
  }, [workouts]);

  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  const selectedWorkouts = selectedDayKey ? workoutsByDate.get(selectedDayKey) ?? [] : [];

  const handlePrevMonth = () => {
    setCurrentMonthDate(new Date(year, month - 1, 1));
    setSelectedDayKey(null);
  };

  const handleNextMonth = () => {
    setCurrentMonthDate(new Date(year, month + 1, 1));
    setSelectedDayKey(null);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      full
      title="Workout Calendar"
      left={<SheetTextButton onClick={onClose}>Done</SheetTextButton>}
    >
      <div className="space-y-5 px-4 pb-28 pt-2">
        {/* Month Selector */}
        <div className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-zinc-950/60 px-4 py-3">
          <button
            onClick={handlePrevMonth}
            className="grid h-8 w-8 place-items-center rounded-lg bg-zinc-800 text-zinc-300 active:scale-95"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="text-[17px] font-bold text-zinc-100">{monthLabel}</div>
          <button
            onClick={handleNextMonth}
            className="grid h-8 w-8 place-items-center rounded-lg bg-zinc-800 text-zinc-300 active:scale-95"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Days of Week Header */}
        <div className="grid grid-cols-7 gap-1 text-center text-[12px] font-bold text-zinc-500">
          <div>M</div>
          <div>T</div>
          <div>W</div>
          <div>T</div>
          <div>F</div>
          <div>S</div>
          <div>S</div>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: startDayIdx }).map((_, i) => (
            <div key={`empty-${i}`} className="h-11" />
          ))}

          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dayNum = i + 1;
            const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
            const dayWorkouts = workoutsByDate.get(key) ?? [];
            const hasWorkout = dayWorkouts.length > 0;
            const isSelected = selectedDayKey === key;

            return (
              <button
                key={key}
                onClick={() => setSelectedDayKey(key === selectedDayKey ? null : key)}
                className={cn(
                  'relative flex h-11 flex-col items-center justify-center rounded-xl text-[14px] font-semibold transition active:scale-95',
                  isSelected && 'ring-2 ring-brand',
                  hasWorkout
                    ? 'bg-brand text-white font-bold shadow-md shadow-brand/30'
                    : 'bg-zinc-900/60 text-zinc-400 hover:text-zinc-200',
                )}
              >
                <span>{dayNum}</span>
                {hasWorkout && (
                  <span className="text-[9px] leading-none opacity-90">
                    🔥 {dayWorkouts[0]?.caloriesBurned ? `${dayWorkouts[0].caloriesBurned}` : ''}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Selected Day Workouts List */}
        {selectedDayKey && (
          <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/80 p-4">
            <div className="text-[14px] font-bold text-zinc-200">
              {new Date(selectedDayKey).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
              })}
            </div>

            {selectedWorkouts.length === 0 ? (
              <div className="mt-2 text-[13px] text-zinc-500">No workouts logged on this day.</div>
            ) : (
              <div className="mt-3 space-y-2">
                {selectedWorkouts.map((w) => (
                  <div
                    key={w.id}
                    onClick={() => onOpenWorkout(w)}
                    className="flex items-center justify-between rounded-xl bg-zinc-900 p-3 transition cursor-pointer active:bg-zinc-800"
                  >
                    <div>
                      <div className="font-bold text-zinc-100">{w.name}</div>
                      <div className="mt-0.5 text-[12px] text-zinc-400">
                        {fmtDuration(w.durationSec)} · {fmtVolume(w.totalVolume)} · {w.totalSets} sets
                      </div>
                    </div>
                    <div className="font-bold text-amber-400 text-[14px] tabular">
                      🔥 {w.caloriesBurned || 0} kcal
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}

// ───────────────────────── Past Workout Edit Sheet ─────────────────────────

function EditWorkoutSheet({
  workout,
  open,
  onClose,
}: {
  workout: Workout;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      full
      title="Edit Workout Log"
      left={<SheetTextButton onClick={onClose}>Cancel</SheetTextButton>}
    >
      {open && <EditWorkoutBody workout={workout} onClose={onClose} />}
    </Sheet>
  );
}

function EditWorkoutBody({
  workout,
  onClose,
}: {
  workout: Workout;
  onClose: () => void;
}) {
  const [name, setName] = useState(workout.name);
  const [notes, setNotes] = useState(workout.notes);
  const [exercises, setExercises] = useState<ActiveExercise[]>(() =>
    activeFromWorkout(workout),
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const workoutExercises = toWorkoutExercises(exercises);
      if (workoutExercises.length === 0) {
        toast('A workout must have at least one completed set', 'error');
        setSaving(false);
        return;
      }
      const totals = totalsOf(workoutExercises);
      await db.workouts.update(workout.id, {
        name: name.trim() || 'Workout',
        notes: notes.trim(),
        exercises: workoutExercises,
        exerciseIds: Array.from(new Set(workoutExercises.map((e) => e.exerciseId))),
        totalVolume: totals.totalVolume,
        totalSets: totals.totalSets,
      });
      toast('Workout updated', 'success');
      onClose();
    } catch {
      toast('Failed to update workout', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col px-4 pb-28">
      <div className="space-y-4 pt-2">
        <div>
          <label htmlFor="edit-workout-name" className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
            Workout Name
          </label>
          <input
            id="edit-workout-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-12 w-full rounded-xl bg-zinc-800 px-4 text-[17px] font-semibold outline-none ring-brand/60 focus:ring-2"
          />
        </div>

        <div>
          <label htmlFor="edit-workout-notes" className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
            Notes
          </label>
          <textarea
            id="edit-workout-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-xl bg-zinc-800 px-4 py-2.5 text-base outline-none ring-brand/60 focus:ring-2"
          />
        </div>

        <div>
          <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
            Exercises & Sets
          </div>
          <WorkoutExercisesEditor
            exercises={exercises}
            onChange={(fn) => setExercises(fn)}
            live={false}
            beforeTs={workout.startedAt}
            excludeWorkoutId={workout.id}
            onAddExercises={(exs) =>
              setExercises((prev) => [
                ...prev,
                ...exs.map((e) => activeExerciseFrom(e, { sets: 3 })),
              ])
            }
          />
        </div>
      </div>

      <div className="sticky bottom-0 mt-auto bg-gradient-to-t from-zinc-900 via-zinc-900 to-transparent pt-6 pb-[max(12px,env(safe-area-inset-bottom))]">
        <PrimaryButton onClick={handleSave} disabled={saving}>
          {saving ? 'Saving Changes…' : 'Save Changes'}
        </PrimaryButton>
      </div>
    </div>
  );
}

// ───────────────────────── Backup & Data Management Sheet ─────────────────────────

function BackupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [isPersisted, setIsPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.storage?.persisted) {
      void navigator.storage.persisted().then(setIsPersisted);
    }
  }, [open]);

  const handleExport = async () => {
    try {
      const data = await exportBackup();
      const dateStr = new Date().toISOString().slice(0, 10);
      downloadJSON(data, `lift-backup-${dateStr}.json`);
      toast('Backup exported successfully', 'success');
    } catch {
      toast('Export failed', 'error');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await importBackup(json);
      toast(`Imported ${res.workouts} workouts, ${res.routines} routines`, 'success', 3500);
      onClose();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Invalid backup JSON file', 'error');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRequestPersistence = async () => {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      const granted = await navigator.storage.persist();
      setIsPersisted(granted);
      toast(
        granted
          ? 'Persistent storage active! Safari will not clear data.'
          : 'Storage persistence was not granted by Safari.',
        granted ? 'success' : 'info',
      );
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Data & Backups"
      left={<SheetTextButton onClick={onClose}>Done</SheetTextButton>}
    >
      <div className="space-y-5 px-4 pb-8 pt-2">
        <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/60 p-4">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <ShieldCheck size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-semibold text-zinc-100">100% Offline IndexedDB</div>
              <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">
                All routines, accounts, and workouts are stored locally on your device.
              </p>
              <div className="mt-2.5 flex items-center justify-between text-[13px]">
                <span className="text-zinc-500">Storage Persistence:</span>
                <span className="font-semibold text-emerald-400">
                  {isPersisted ? 'Permanent (Safe)' : 'Enabled'}
                </span>
              </div>
              {!isPersisted && (
                <button
                  onClick={handleRequestPersistence}
                  className="mt-2 text-[13px] font-semibold text-brand underline"
                >
                  Confirm persistent storage
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/60 p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand">
              <Download size={20} />
            </div>
            <div className="flex-1">
              <div className="text-[16px] font-semibold text-zinc-100">Export Backup</div>
              <div className="text-[13px] text-zinc-500">Save complete JSON file to iCloud or Files</div>
            </div>
          </div>
          <button
            id="export-backup-btn"
            onClick={handleExport}
            className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-[15px] font-semibold text-white shadow-md shadow-brand/20 transition active:scale-[0.98]"
          >
            <Download size={16} /> Download JSON Backup
          </button>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/60 p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-purple-500/15 text-purple-400">
              <FileUp size={20} />
            </div>
            <div className="flex-1">
              <div className="text-[16px] font-semibold text-zinc-100">Import Backup</div>
              <div className="text-[13px] text-zinc-500">Restore accounts, routines & workout logs</div>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            id="import-backup-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-800 py-3 text-[15px] font-semibold text-zinc-200 transition active:scale-[0.98] active:bg-zinc-700 disabled:opacity-40"
          >
            <FileUp size={16} /> {importing ? 'Importing…' : 'Select JSON Backup'}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
