import { useState, useMemo, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Activity,
  Calendar,
  Check,
  Clock,
  Download,
  Dumbbell,
  Ellipsis,
  FileSpreadsheet,
  FileUp,
  Flame,
  Lock,
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
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import { db, exportBackup, importBackup, type Id, type PublicUser, type SafeUser, type Workout } from '../db';
import { cloudDeleteWorkout, cloudSaveWorkout, importHevyWorkouts } from '../lib/cloudDb';
import { parseHevyWorkoutsCSV } from '../lib/hevyImport';
import { type ProfilePatch, type RegisterInput } from '../lib/auth';
import {
  UserDirectoryModal,
  CompareStrengthModal,
  FriendProfileModal,
} from '../components/SocialComparison';
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
import { WorkoutCalendarModal } from '../components/WorkoutCalendarModal';

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
    isCloudConfigured,
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
  const [calendarFocusDate, setCalendarFocusDate] = useState<Date | null>(null);
  const [accountSwitcherOpen, setAccountSwitcherOpen] = useState(false);
  const [backupSheetOpen, setBackupSheetOpen] = useState(false);
  const [isImportingDirect, setIsImportingDirect] = useState(false);
  const profileHevyInputRef = useRef<HTMLInputElement>(null);

  // Social & Friend Comparison state
  const [socialDirectoryOpen, setSocialDirectoryOpen] = useState(false);
  const [compareStrengthOpen, setCompareStrengthOpen] = useState(false);
  const [selectedFriendForProfile, setSelectedFriendForProfile] = useState<PublicUser | null>(null);
  const [selectedFriendForCompare, setSelectedFriendForCompare] = useState<PublicUser | null>(null);

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
    const list: { weekIndex: number; startDate: number; label: string; durationHours: number; volumeKg: number; reps: number }[] = [];
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
        startDate: wStart,
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
    if (!currentUser) return;
    setAlert({
      title: 'Delete workout log?',
      message: `“${w.name}” from ${fmtDate(w.startedAt)} will be deleted. This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: async () => {
        await cloudDeleteWorkout(w.id, currentUser.id);
        toast('Workout deleted', 'info');
      },
    });
  };

  const handleDirectCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImportingDirect(true);
    try {
      if (!currentUser) {
        toast('Giriş yapmanız gerekiyor', 'error');
        return;
      }
      const text = await file.text();
      const catalog = await db.exercises.toArray();
      const parseResult = await parseHevyWorkoutsCSV(text, {
        userId: currentUser.id,
        catalog,
        userProfile: {
          weightKg: currentUser.weightKg,
          heightCm: currentUser.heightCm,
          age: currentUser.age,
          gender: currentUser.gender,
          bodyFatPercentage: currentUser.bodyFatPercentage,
        },
      });

      if (parseResult.workouts.length === 0) {
        toast('Geçerli antrenman verisi bulunamadı (.csv dosyasını kontrol edin)', 'error');
        return;
      }

      const syncResult = await importHevyWorkouts(
        currentUser.id,
        parseResult.workouts,
        parseResult.createdExercises,
      );

      const msg = syncResult.importedCount > 0
        ? `${syncResult.importedCount} antrenman verisi başarıyla içe aktarıldı ve buluta senkronize edildi!${
            syncResult.skippedCount > 0 ? ` (${syncResult.skippedCount} mevcut antrenman atlandı)` : ''
          }`
        : 'Antrenman verileri başarıyla içe aktarıldı ve buluta senkronize edildi!';
      toast(msg, 'success', 5000);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'CSV dosyası içe aktarılamadı', 'error');
    } finally {
      setIsImportingDirect(false);
      if (profileHevyInputRef.current) profileHevyInputRef.current.value = '';
    }
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
                  {isCloudConfigured && (
                    <div className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 border border-emerald-500/20">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Supabase Cloud
                    </div>
                  )}
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
          <div
            onClick={() => {
              setCalendarFocusDate(new Date());
              setCalendarOpen(true);
            }}
            className="flex items-center justify-between cursor-pointer group select-none"
            title="Takvimi Aç"
          >
            <div className="flex items-center gap-2">
              <h3 className="text-[17px] font-bold text-zinc-100 group-hover:text-brand transition flex items-center gap-1.5">
                Weekly Activity
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-brand tabular">{thisWeekStat}</span>
              <button
                type="button"
                id="weekly-activity-calendar-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setCalendarFocusDate(new Date());
                  setCalendarOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-xl border border-brand/30 bg-brand/10 hover:bg-brand/20 px-2.5 py-1 text-[12px] font-bold text-brand transition active:scale-95"
                title="Takvim / Calendar"
                aria-label="Takvim / Calendar"
              >
                <Calendar size={13} className="text-brand" />
                <span>Takvim</span>
              </button>
            </div>
          </div>

          <div className="mt-4 h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 4, left: -25, bottom: 0 }}
                onClick={(state: any) => {
                  if (state && state.activePayload && state.activePayload.length) {
                    const data = state.activePayload[0].payload;
                    if (data?.startDate) {
                      setCalendarFocusDate(new Date(data.startDate));
                      setCalendarOpen(true);
                    }
                  }
                }}
              >
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
                          <div className="mt-1 text-[10px] text-zinc-500">Takvimi açmak için tıkla</div>
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
                  className="cursor-pointer"
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`bar-cell-${index}`}
                      className="cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => {
                        setCalendarFocusDate(new Date(entry.startDate));
                        setCalendarOpen(true);
                      }}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 3 Metric Toggle Pills */}
          <div className="mt-4 flex rounded-xl bg-zinc-950/80 p-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMetric('duration');
              }}
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
              onClick={(e) => {
                e.stopPropagation();
                setMetric('volume');
              }}
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
              onClick={(e) => {
                e.stopPropagation();
                setMetric('reps');
              }}
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
              onClick={() => {
                setCalendarFocusDate(new Date());
                setCalendarOpen(true);
              }}
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

        {/* Data Management & CSV Workout Import Section */}
        <section className="rounded-3xl border border-white/[0.06] bg-zinc-900/90 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand/15 text-brand shadow-sm">
                <FileSpreadsheet size={22} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-[17px] font-bold text-zinc-100">Veri Yönetimi</h3>
                  <span className="rounded-md bg-brand/15 px-1.5 py-0.5 text-[10px] font-extrabold text-brand border border-brand/25">
                    CSV / HEVY
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[12px] text-zinc-400">
                  Antrenman geçmişinizi (.csv) aktarın ve buluta eşitleyin
                </p>
              </div>
            </div>

            <input
              ref={profileHevyInputRef}
              type="file"
              accept=".csv,text/csv,text/comma-separated-values"
              onChange={handleDirectCSVImport}
              className="hidden"
            />
            <button
              id="profile-import-csv-direct-btn"
              onClick={() => profileHevyInputRef.current?.click()}
              disabled={isImportingDirect}
              className="flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-[13px] font-bold text-white shadow-md shadow-brand/20 transition active:scale-95 hover:bg-brand/90 disabled:opacity-50 shrink-0"
              title="CSV Antrenman Verilerini İçe Aktar"
            >
              <FileUp size={15} />
              <span>{isImportingDirect ? 'Aktarılıyor…' : 'İçe Aktar'}</span>
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

      {/* Interactive Workout Calendar Modal */}
      <WorkoutCalendarModal
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        workouts={workouts ?? []}
        initialDate={calendarFocusDate}
        onOpenWorkout={(w) => {
          setSelectedWorkout(w);
          setMenuOpen(true);
        }}
        onOpenDetail={(exerciseId) => setDetailExerciseId(exerciseId)}
      />

      {/* Account Switcher & Add User Modal */}
      <AccountSwitcherSheet
        open={accountSwitcherOpen}
        onClose={() => setAccountSwitcherOpen(false)}
        users={users}
        currentUser={currentUser}
        onSwitch={async (id, pin) => {
          await switchUser(id, pin);
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
      <BackupSheet
        open={backupSheetOpen}
        onClose={() => setBackupSheetOpen(false)}
        currentUser={currentUser}
      />

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
  currentUser: SafeUser | null;
  onSave: (patch: ProfilePatch) => Promise<void>;
  bmr: number;
  lbm: number;
  avgWorkoutCalories: number;
}) {
  const [weight, setWeight] = useState(currentUser?.weightKg ?? 75);
  const [height, setHeight] = useState(currentUser?.heightCm ?? 178);
  const [age, setAge] = useState(currentUser?.age ?? 25);
  const [gender, setGender] = useState<'male' | 'female'>(currentUser?.gender ?? 'male');
  const [bodyFat, setBodyFat] = useState<string>(currentUser?.bodyFatPercentage ? String(currentUser.bodyFatPercentage) : '');

  const [shareWorkouts, setShareWorkouts] = useState(currentUser?.shareWorkouts !== false);
  const [shareRoutines, setShareRoutines] = useState(currentUser?.shareRoutines === true);

  useEffect(() => {
    if (currentUser) {
      setWeight(currentUser.weightKg);
      setHeight(currentUser.heightCm);
      setAge(currentUser.age);
      setGender(currentUser.gender);
      setBodyFat(currentUser.bodyFatPercentage ? String(currentUser.bodyFatPercentage) : '');
      setShareWorkouts(currentUser.shareWorkouts !== false);
      setShareRoutines(currentUser.shareRoutines === true);
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
      shareWorkouts,
      shareRoutines,
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

          {/* Social Privacy Toggles */}
          <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/60 p-4 space-y-3">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-zinc-400">
              Social & Privacy Settings
            </div>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-[14px] text-zinc-200">Share Workouts with Friends</span>
              <input
                type="checkbox"
                checked={shareWorkouts}
                onChange={(e) => setShareWorkouts(e.target.checked)}
                className="h-5 w-5 rounded bg-zinc-800 accent-brand"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-[14px] text-zinc-200">Share Custom Routines with Friends</span>
              <input
                type="checkbox"
                checked={shareRoutines}
                onChange={(e) => setShareRoutines(e.target.checked)}
                className="h-5 w-5 rounded bg-zinc-800 accent-brand"
              />
            </label>
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
  users: PublicUser[];
  currentUser: SafeUser | null;
  onSwitch: (id: Id, pin?: string) => Promise<void>;
  onRegister: (data: RegisterInput) => Promise<SafeUser>;
  onDelete: (id: Id, pin?: string) => Promise<void>;
  onLogout?: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [weightKg, setWeightKg] = useState(75);
  const [heightCm, setHeightCm] = useState(178);
  const [age, setAge] = useState(25);
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [bodyFat, setBodyFat] = useState('');
  const [avatarColor, setAvatarColor] = useState('#3b82f6');
  const [loading, setLoading] = useState(false);

  // Switch Account PIN prompt
  const [pinPromptUser, setPinPromptUser] = useState<PublicUser | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  // Delete own account prompt
  const [deleteSelfModal, setDeleteSelfModal] = useState(false);
  const [deletePinInput, setDeletePinInput] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444'];

  const handleSelectAccount = (u: PublicUser) => {
    if (u.id === currentUser?.id) return;
    if (u.hasPin) {
      setPinPromptUser(u);
      setPinInput('');
      setPinError('');
    } else {
      void onSwitch(u.id).catch((err: unknown) => {
        toast(err instanceof Error ? err.message : 'Switch failed', 'error');
      });
    }
  };

  const handleVerifyPinAndSwitch = async () => {
    if (!pinPromptUser) return;
    try {
      await onSwitch(pinPromptUser.id, pinInput);
      setPinPromptUser(null);
    } catch (err: unknown) {
      setPinError(err instanceof Error ? err.message : 'Incorrect Password / PIN');
    }
  };

  const handleDeleteSelf = async () => {
    if (!currentUser) return;
    try {
      await onDelete(currentUser.id, deletePinInput);
      setDeleteSelfModal(false);
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Deletion failed');
    }
  };

  const handleCreate = async () => {
    if (!username.trim()) {
      toast('Please enter a username', 'error');
      return;
    }
    if (!pin.trim() || pin.trim().length < 4) {
      toast('Password / PIN must be at least 4 characters', 'error');
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
        pin: pin.trim(),
      });
      setCreating(false);
      setUsername('');
      setName('');
      setPin('');
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
                    onClick={() => handleSelectAccount(u)}
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
                          @{u.username}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {u.hasPin && <Lock size={14} className="text-zinc-500" />}
                      {isActive ? (
                        <div className="grid h-7 w-7 place-items-center rounded-full bg-brand text-white shadow-sm">
                          <Check size={16} strokeWidth={3} />
                        </div>
                      ) : (
                        <div className="text-[12px] font-semibold text-brand">
                          Switch
                        </div>
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

            {currentUser && (
              <button
                onClick={() => {
                  setDeleteSelfModal(true);
                  setDeletePinInput('');
                  setDeleteError('');
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 py-3 text-[14px] font-semibold text-red-400 transition active:scale-[0.98] hover:bg-red-500/15"
              >
                <Trash size={15} /> Delete My Account ({currentUser.name})
              </button>
            )}

            {onLogout && (
              <button
                id="sign-out-account-switcher-btn"
                onClick={onLogout}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-zinc-900 py-3 text-[14px] font-semibold text-zinc-300 transition active:scale-[0.98] hover:bg-zinc-800"
              >
                <LogOut size={16} /> Sign Out of KoyuncuFit
              </button>
            )}

            {/* PIN Prompt Modal for Switching */}
            {pinPromptUser && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
                <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-zinc-900 p-5 space-y-4 shadow-2xl">
                  <h3 className="text-[17px] font-bold text-zinc-100">
                    Enter Password / PIN for @{pinPromptUser.username}
                  </h3>
                  {pinError && (
                    <div className="text-[13px] text-red-400 font-semibold">{pinError}</div>
                  )}
                  <input
                    type="password"
                    autoFocus
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    placeholder="PIN"
                    className="h-11 w-full rounded-xl bg-zinc-800 px-3.5 text-center text-[18px] font-bold tracking-widest text-zinc-100 outline-none ring-brand focus:ring-2"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPinPromptUser(null)}
                      className="flex-1 rounded-xl bg-zinc-800 py-2.5 text-[14px] font-semibold text-zinc-300"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleVerifyPinAndSwitch}
                      className="flex-1 rounded-xl bg-brand py-2.5 text-[14px] font-semibold text-white"
                    >
                      Unlock
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* PIN Prompt Modal for Deleting Self */}
            {deleteSelfModal && currentUser && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
                <div className="w-full max-w-sm rounded-3xl border border-red-500/20 bg-zinc-900 p-5 space-y-4 shadow-2xl">
                  <h3 className="text-[17px] font-bold text-red-400">
                    Delete Account @{currentUser.username}?
                  </h3>
                  <p className="text-[13px] text-zinc-400">
                    All your private workouts and routines will be deleted. Enter your Password / PIN to confirm:
                  </p>
                  {deleteError && (
                    <div className="text-[13px] text-red-400 font-semibold">{deleteError}</div>
                  )}
                  <input
                    type="password"
                    autoFocus
                    value={deletePinInput}
                    onChange={(e) => setDeletePinInput(e.target.value)}
                    placeholder="Confirm PIN"
                    className="h-11 w-full rounded-xl bg-zinc-800 px-3.5 text-center text-[18px] font-bold tracking-widest text-zinc-100 outline-none ring-red-500 focus:ring-2"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDeleteSelfModal(false)}
                      className="flex-1 rounded-xl bg-zinc-800 py-2.5 text-[14px] font-semibold text-zinc-300"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteSelf}
                      className="flex-1 rounded-xl bg-red-600 py-2.5 text-[14px] font-semibold text-white"
                    >
                      Delete Forever
                    </button>
                  </div>
                </div>
              </div>
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

            <div>
              <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
                Password / PIN (Required, min 4 chars)
              </label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Min. 4 characters"
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
      const updatedWorkout: Workout = {
        ...workout,
        name: name.trim() || 'Workout',
        notes: notes.trim(),
        exercises: workoutExercises,
        exerciseIds: Array.from(new Set(workoutExercises.map((e) => e.exerciseId))),
        totalVolume: totals.totalVolume,
        totalSets: totals.totalSets,
      };
      await cloudSaveWorkout(updatedWorkout);
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

function BackupSheet({
  open,
  onClose,
  currentUser,
}: {
  open: boolean;
  onClose: () => void;
  currentUser: SafeUser | null;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hevyFileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importingHevy, setImportingHevy] = useState(false);
  const [isPersisted, setIsPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.storage?.persisted) {
      void navigator.storage.persisted().then(setIsPersisted);
    }
  }, [open]);

  const handleExport = async () => {
    try {
      if (!currentUser) {
        toast('Sign in required for backup export', 'error');
        return;
      }
      const data = await exportBackup(currentUser.id);
      const dateStr = new Date().toISOString().slice(0, 10);
      downloadJSON(data, `koyuncufit-backup-${dateStr}.json`);
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
      if (!currentUser) {
        toast('Sign in required for backup import', 'error');
        return;
      }
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await importBackup(json, currentUser.id);
      toast(`Imported ${res.workouts} workouts, ${res.routines} routines`, 'success', 3500);
      onClose();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Invalid backup JSON file', 'error');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleHevyCSVChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingHevy(true);
    try {
      if (!currentUser) {
        toast('Giriş yapmanız gerekiyor', 'error');
        return;
      }
      const text = await file.text();
      const catalog = await db.exercises.toArray();
      const parseResult = await parseHevyWorkoutsCSV(text, {
        userId: currentUser.id,
        catalog,
        userProfile: {
          weightKg: currentUser.weightKg,
          heightCm: currentUser.heightCm,
          age: currentUser.age,
          gender: currentUser.gender,
          bodyFatPercentage: currentUser.bodyFatPercentage,
        },
      });

      if (parseResult.workouts.length === 0) {
        toast('Geçerli Hevy antrenmanı bulunamadı (.csv dosyasını kontrol edin)', 'error');
        return;
      }

      const syncResult = await importHevyWorkouts(
        currentUser.id,
        parseResult.workouts,
        parseResult.createdExercises,
      );

      const msg = `${syncResult.importedCount} antrenman ve ${syncResult.totalSets} set başarıyla Hevy'den aktarıldı ve Supabase buluta senkronize edildi!${
        syncResult.skippedCount > 0 ? ` (${syncResult.skippedCount} mevcut antrenman atlandı)` : ''
      }`;
      toast(msg, 'success', 5000);
      onClose();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Hevy CSV dosyası içe aktarılamadı', 'error');
    } finally {
      setImportingHevy(false);
      if (hevyFileInputRef.current) hevyFileInputRef.current.value = '';
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

        {/* Hevy CSV Workout Importer */}
        <div className="rounded-2xl border border-brand/40 bg-gradient-to-br from-brand/15 via-zinc-950/80 to-zinc-950/80 p-4 shadow-lg shadow-brand/10">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand text-white shadow-md shadow-brand/30">
              <FileSpreadsheet size={20} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[16px] font-bold text-zinc-100">Import from Hevy (CSV)</span>
                <span className="rounded-md bg-brand/20 px-1.5 py-0.5 text-[10px] font-extrabold text-brand border border-brand/30">
                  HEVY
                </span>
              </div>
              <div className="mt-0.5 text-[13px] text-zinc-400">
                Hevy uygulamasından dışa aktardığınız <code className="text-zinc-300">workouts.csv</code> dosyasını aktarın
              </div>
            </div>
          </div>
          <input
            ref={hevyFileInputRef}
            type="file"
            accept=".csv,text/csv,text/comma-separated-values"
            onChange={handleHevyCSVChange}
            className="hidden"
          />
          <button
            id="import-hevy-csv-btn"
            onClick={() => hevyFileInputRef.current?.click()}
            disabled={importingHevy}
            className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-[15px] font-bold text-white shadow-md shadow-brand/25 transition active:scale-[0.98] hover:bg-brand/90 disabled:opacity-40"
          >
            <FileSpreadsheet size={17} />
            <span>{importingHevy ? 'Hevy Aktarılıyor & Senkronize Ediliyor…' : "Hevy'den Aktar (.csv)"}</span>
          </button>
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
            className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-800 py-3 text-[15px] font-semibold text-zinc-200 transition active:scale-[0.98] active:bg-zinc-700"
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
