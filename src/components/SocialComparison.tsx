import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeftRight,
  ChevronRight,
  Dumbbell,
  Lock,
  Search,
  Sparkles,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
  Weight,
  Zap,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import { db, type Id, type PublicUser, type Routine, type Workout } from '../db';
import { cloudFetchFriendRoutines, cloudFetchFriendWorkouts } from '../lib/cloudDb';
import {
  cn,
  epley1RM,
  fmtDate,
  fmtDuration,
  fmtNum,
  fmtTime,
  fmtVolume,
  isWorkingSet,
  startOfWeek,
} from '../lib/utils';
import { useAuth } from '../state/AuthContext';
import { EmptyState, Sheet, SheetTextButton } from './ui';

// ───────────────────────── Helper Functions ─────────────────────────

interface AthleteExerciseStats {
  best1RM: number;
  maxWeight: number;
  bestSetVolume: number;
  bestSetDesc: string;
  totalSets: number;
  sessionCount: number;
}

function calculateAthleteStats(workouts: Workout[], exerciseId: number): AthleteExerciseStats {
  let best1RM = 0;
  let maxWeight = 0;
  let bestSetVolume = 0;
  let bestSetDesc = '—';
  let totalSets = 0;
  let sessionCount = 0;

  for (const w of workouts) {
    const ex = w.exercises.find((e) => e.exerciseId === exerciseId);
    if (!ex) continue;
    sessionCount++;
    for (const s of ex.sets) {
      if (!isWorkingSet(s.type)) continue;
      totalSets++;
      const e1 = epley1RM(s.weight, s.reps);
      if (e1 > best1RM) {
        best1RM = e1;
      }
      if (s.weight > maxWeight) {
        maxWeight = s.weight;
      }
      const sv = (s.weight || 0) * (s.reps || 0);
      if (sv > bestSetVolume) {
        bestSetVolume = sv;
        bestSetDesc = `${fmtNum(s.weight, 1)}kg × ${s.reps}`;
      }
    }
  }

  return {
    best1RM,
    maxWeight,
    bestSetVolume,
    bestSetDesc,
    totalSets,
    sessionCount,
  };
}

// ───────────────────────── 1. User Directory & Social Modal ─────────────────────────

export function UserDirectoryModal({
  open,
  onClose,
  onSelectCompare,
  onOpenFriendProfile,
}: {
  open: boolean;
  onClose: () => void;
  onSelectCompare?: (friend: PublicUser) => void;
  onOpenFriendProfile?: (friend: PublicUser) => void;
}) {
  const { currentUser, users, isFollowing, followUser, unfollowUser, getFollowersCount, getFollowingCount, refreshUsers } =
    useAuth();
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open) {
      void refreshUsers();
    }
  }, [open, refreshUsers]);

  // All workouts mapped by userId for count display
  const allWorkouts = useLiveQuery(() => db.workouts.toArray(), []) ?? [];
  const workoutCountsByUser = useMemo(() => {
    const map = new Map<Id, number>();
    for (const w of allWorkouts) {
      map.set(w.userId, (map.get(w.userId) || 0) + 1);
    }
    return map;
  }, [allWorkouts]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((u) => {
      if (currentUser && u.id === currentUser.id) return false;
      if (!term) return true;
      return (
        u.name.toLowerCase().includes(term) ||
        u.username.toLowerCase().includes(term)
      );
    });
  }, [users, currentUser, search]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      full
      title="Athlete Directory & Friends"
      left={<SheetTextButton onClick={onClose}>Done</SheetTextButton>}
    >
      <div className="space-y-4 px-4 pb-28 pt-2">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={17} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search friends by name or @username…"
            className="h-11 w-full rounded-2xl bg-zinc-900/90 pl-10 pr-4 text-[14px] text-zinc-100 placeholder:text-zinc-500 outline-none ring-brand/50 focus:ring-2"
          />
        </div>

        {/* Current User Social Header Badge */}
        {currentUser && (
          <div className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-zinc-900/60 p-3.5">
            <div className="flex items-center gap-3">
              <div
                className="grid h-10 w-10 place-items-center rounded-xl text-[15px] font-bold text-white shadow"
                style={{ backgroundColor: currentUser.avatarColor || '#3b82f6' }}
              >
                {currentUser.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="font-bold text-zinc-100">{currentUser.name} (You)</div>
                <div className="text-[12px] text-zinc-400">@{currentUser.username}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 text-right">
              <div>
                <div className="text-[13px] font-bold text-zinc-200">
                  {getFollowersCount(currentUser.id)}
                </div>
                <div className="text-[10px] uppercase font-semibold text-zinc-500">Followers</div>
              </div>
              <div className="h-6 w-px bg-white/10" />
              <div>
                <div className="text-[13px] font-bold text-zinc-200">
                  {getFollowingCount(currentUser.id)}
                </div>
                <div className="text-[10px] uppercase font-semibold text-zinc-500">Following</div>
              </div>
            </div>
          </div>
        )}

        {/* Friends List */}
        <div className="space-y-3">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
            Registered Athletes ({filteredUsers.length})
          </div>

          {filteredUsers.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No athletes found"
              text={
                search
                  ? 'No registered athlete matches your search.'
                  : 'Invite your friends to register an account in KoyuncuFit so you can compare strength!'
              }
            />
          ) : (
            <div className="divide-y divide-white/5 rounded-2xl border border-white/[0.06] bg-zinc-900/90 overflow-hidden">
              {filteredUsers.map((friend) => {
                const following = isFollowing(friend.id);
                const workoutCount = workoutCountsByUser.get(friend.id) || 0;
                const followersCount = getFollowersCount(friend.id);

                return (
                  <div
                    key={friend.id}
                    className="flex flex-col gap-3 p-4 transition active:bg-white/[0.02]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div
                        onClick={() => onOpenFriendProfile?.(friend)}
                        className="flex items-center gap-3 min-w-0 cursor-pointer group flex-1"
                      >
                        <div
                          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-[17px] font-bold text-white shadow-md transition group-active:scale-95"
                          style={{ backgroundColor: friend.avatarColor || '#3b82f6' }}
                        >
                          {friend.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-[15px] text-zinc-100 group-hover:text-brand transition truncate">
                              {friend.name}
                            </span>
                          </div>
                          <div className="text-[12px] text-zinc-400">@{friend.username}</div>
                          <div className="mt-0.5 text-[11px] text-zinc-500">
                            Member since {fmtDate(friend.createdAt, { month: 'short', year: 'numeric' })}
                          </div>
                        </div>
                      </div>

                      {/* Follow / Unfollow Button */}
                      <button
                        onClick={() => {
                          if (following) void unfollowUser(friend.id);
                          else void followUser(friend.id);
                        }}
                        className={cn(
                          'flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12px] font-bold transition active:scale-95 shrink-0',
                          following
                            ? 'bg-zinc-800 text-zinc-300 border border-white/10 hover:bg-zinc-700'
                            : 'bg-brand text-white shadow-sm shadow-brand/30 hover:bg-brand-hover',
                        )}
                      >
                        {following ? (
                          <>
                            <UserCheck size={14} className="text-emerald-400" />
                            <span>Following</span>
                          </>
                        ) : (
                          <>
                            <UserPlus size={14} />
                            <span>Follow</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Stats & Quick Actions Strip */}
                    <div className="flex items-center justify-between border-t border-white/5 pt-2 text-[12px]">
                      <div className="flex items-center gap-3 text-zinc-400">
                        <span>
                          <strong className="text-zinc-200">{workoutCount}</strong> workouts
                        </span>
                        <span>·</span>
                        <span>
                          <strong className="text-zinc-200">{followersCount}</strong> followers
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onSelectCompare?.(friend)}
                          className="flex items-center gap-1 text-[12px] font-bold text-brand hover:underline"
                        >
                          <ArrowLeftRight size={13} />
                          <span>Compare Strength</span>
                        </button>
                        <ChevronRight size={14} className="text-zinc-600" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}

// ───────────────────────── 2. "Compare Strength (Gücünü Karşılaştır)" Modal ─────────────────────────

const POPULAR_BENCHMARKS = [
  'Bench Press (Barbell)',
  'Squat (Barbell)',
  'Deadlift (Barbell)',
  'Overhead Press (Barbell)',
  'Barbell Curl',
  'Lat Pulldown (Cable)',
  'Incline Dumbbell Press',
];

export function CompareStrengthModal({
  open,
  onClose,
  initialFriend,
}: {
  open: boolean;
  onClose: () => void;
  initialFriend?: PublicUser | null;
}) {
  const { currentUser, users } = useAuth();
  const [selectedFriendId, setSelectedFriendId] = useState<Id | null>(() => initialFriend?.id ?? null);
  const [selectedExerciseName, setSelectedExerciseName] = useState<string>('Bench Press (Barbell)');
  const [exercisePickerOpen, setExercisePickerOpen] = useState(false);

  // Available friends to compare against
  const otherUsers = useMemo(() => {
    return users.filter((u) => u.id !== currentUser?.id);
  }, [users, currentUser]);

  const selectedFriend = useMemo(() => {
    if (selectedFriendId) {
      return otherUsers.find((u) => u.id === selectedFriendId) ?? otherUsers[0] ?? null;
    }
    return initialFriend ?? otherUsers[0] ?? null;
  }, [selectedFriendId, initialFriend, otherUsers]);

  // Load all exercises
  const exercises = useLiveQuery(() => db.exercises.toArray(), []) ?? [];
  const selectedExercise = useMemo(() => {
    return (
      exercises.find((e) => e.name.toLowerCase() === selectedExerciseName.toLowerCase()) ??
      exercises[0] ??
      null
    );
  }, [exercises, selectedExerciseName]);

  useEffect(() => {
    if (open && selectedFriend && selectedFriend.shareWorkouts !== false) {
      void cloudFetchFriendWorkouts(selectedFriend.id);
    }
  }, [open, selectedFriend?.id, selectedFriend?.shareWorkouts]);

  // Load user workouts
  const userWorkouts = useLiveQuery<Workout[]>(
    async () => {
      if (!currentUser) return [];
      return db.workouts.where('userId').equals(currentUser.id).toArray();
    },
    [currentUser?.id],
  );

  // Load friend workouts (respect privacy: only if shareWorkouts !== false)
  const friendWorkouts = useLiveQuery<Workout[]>(
    async () => {
      if (!selectedFriend) return [];
      if (selectedFriend.shareWorkouts === false) return [];
      return db.workouts.where('userId').equals(selectedFriend.id).toArray();
    },
    [selectedFriend?.id, selectedFriend?.shareWorkouts],
  );

  // Compute metrics for both athletes
  const userStats = useMemo(() => {
    if (!userWorkouts || !selectedExercise) {
      return { best1RM: 0, maxWeight: 0, bestSetVolume: 0, bestSetDesc: '—', totalSets: 0, sessionCount: 0 };
    }
    return calculateAthleteStats(userWorkouts, selectedExercise.id);
  }, [userWorkouts, selectedExercise]);

  const friendStats = useMemo(() => {
    if (!friendWorkouts || !selectedExercise) {
      return { best1RM: 0, maxWeight: 0, bestSetVolume: 0, bestSetDesc: '—', totalSets: 0, sessionCount: 0 };
    }
    return calculateAthleteStats(friendWorkouts, selectedExercise.id);
  }, [friendWorkouts, selectedExercise]);

  // Metric comparative calculations
  const comparison = useMemo(() => {
    function getBarData(uVal: number, fVal: number, unit = 'kg') {
      const maxVal = Math.max(uVal, fVal, 1);
      const uPct = Math.round((uVal / maxVal) * 100);
      const fPct = Math.round((fVal / maxVal) * 100);
      const deltaVal = uVal - fVal;
      let deltaPct = 0;
      if (fVal > 0) {
        deltaPct = Math.round(((uVal - fVal) / fVal) * 100);
      } else if (uVal > 0) {
        deltaPct = 100;
      }
      return {
        uVal,
        fVal,
        uPct: Math.max(8, uPct),
        fPct: Math.max(8, fPct),
        deltaVal,
        deltaPct,
        unit,
      };
    }

    return {
      orm: getBarData(userStats.best1RM, friendStats.best1RM, 'kg'),
      heaviest: getBarData(userStats.maxWeight, friendStats.maxWeight, 'kg'),
      setVol: getBarData(userStats.bestSetVolume, friendStats.bestSetVolume, 'kg'),
    };
  }, [userStats, friendStats]);

  // Overall winner tally
  const leaderScore = useMemo(() => {
    let uWins = 0;
    let fWins = 0;
    if (userStats.best1RM > friendStats.best1RM) uWins++;
    else if (friendStats.best1RM > userStats.best1RM) fWins++;

    if (userStats.maxWeight > friendStats.maxWeight) uWins++;
    else if (friendStats.maxWeight > userStats.maxWeight) fWins++;

    if (userStats.bestSetVolume > friendStats.bestSetVolume) uWins++;
    else if (friendStats.bestSetVolume > userStats.bestSetVolume) fWins++;

    return { uWins, fWins };
  }, [userStats, friendStats]);

  if (!currentUser) return null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      full
      title="Gücünü Karşılaştır"
      left={<SheetTextButton onClick={onClose}>Done</SheetTextButton>}
    >
      <div className="space-y-5 px-4 pb-32 pt-2">
        {/* Friend Selector Bar */}
        {otherUsers.length > 1 && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Select Competitor
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {otherUsers.map((u) => {
                const isSelected = selectedFriend?.id === u.id;
                return (
                  <button
                    key={u.id}
                    onClick={() => setSelectedFriendId(u.id)}
                    className={cn(
                      'flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-bold transition active:scale-95 shrink-0',
                      isSelected
                        ? 'bg-brand text-white shadow-md shadow-brand/20'
                        : 'bg-zinc-900 border border-white/5 text-zinc-400 hover:text-zinc-200',
                    )}
                  >
                    <div
                      className="grid h-6 w-6 place-items-center rounded-lg text-[10px] text-white"
                      style={{ backgroundColor: u.avatarColor || '#3b82f6' }}
                    >
                      {u.name.slice(0, 2).toUpperCase()}
                    </div>
                    <span>{u.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Head-to-Head Top Banner */}
        {selectedFriend ? (
          <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-zinc-900 via-zinc-900/90 to-zinc-950 p-4 shadow-xl">
            <div className="flex items-center justify-between">
              {/* Left: You */}
              <div className="flex items-center gap-3">
                <div
                  className="grid h-14 w-14 place-items-center rounded-2xl text-[18px] font-bold text-white shadow-lg shadow-brand/30 ring-2 ring-brand"
                  style={{ backgroundColor: currentUser.avatarColor || '#3b82f6' }}
                >
                  {currentUser.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-[16px] text-zinc-100">
                      {currentUser.name}
                    </span>
                    <span className="rounded bg-brand/20 px-1.5 py-0.5 text-[10px] font-bold text-brand">
                      You
                    </span>
                  </div>
                  <div className="text-[12px] text-zinc-400">@{currentUser.username}</div>
                  <div className="text-[11px] text-zinc-500 font-semibold">{currentUser.weightKg} kg</div>
                </div>
              </div>

              {/* VS Neon Centerpiece */}
              <div className="grid h-10 w-10 place-items-center rounded-full bg-zinc-800 border border-white/10 text-white font-black text-[13px] shadow-inner">
                VS
              </div>

              {/* Right: Friend */}
              <div className="flex items-center gap-3 text-right">
                <div>
                  <div className="font-extrabold text-[16px] text-zinc-100">{selectedFriend.name}</div>
                  <div className="text-[12px] text-zinc-400">@{selectedFriend.username}</div>
                  <div className="text-[11px] text-zinc-500 font-semibold">
                    Athlete
                  </div>
                </div>
                <div
                  className="grid h-14 w-14 place-items-center rounded-2xl text-[18px] font-bold text-white shadow-lg ring-2 ring-zinc-600"
                  style={{ backgroundColor: selectedFriend.avatarColor || '#71717a' }}
                >
                  {selectedFriend.name.slice(0, 2).toUpperCase()}
                </div>
              </div>
            </div>

            {/* Match Status Ticker */}
            <div className="mt-3.5 flex items-center justify-between rounded-xl bg-black/40 px-3.5 py-2 text-[12px]">
              <div className="flex items-center gap-1.5 font-bold text-zinc-300">
                <Trophy size={14} className="text-amber-400" />
                <span>
                  {leaderScore.uWins > leaderScore.fWins
                    ? `You are dominating ${leaderScore.uWins} - ${leaderScore.fWins}!`
                    : leaderScore.fWins > leaderScore.uWins
                    ? `${selectedFriend.name} leads ${leaderScore.fWins} - ${leaderScore.uWins}`
                    : 'Evenly matched! (Tied)'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-[11px] font-bold text-brand">
                  <span className="h-2 w-2 rounded-full bg-brand" /> You
                </span>
                <span className="flex items-center gap-1 text-[11px] font-bold text-zinc-400">
                  <span className="h-2 w-2 rounded-full bg-zinc-500" /> {selectedFriend.name}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/5 bg-zinc-900/60 p-4 text-center">
            <p className="text-[14px] text-zinc-400">
              No friend accounts available to compare yet. Add an account from Profile to test!
            </p>
          </div>
        )}

        {/* Benchmark Exercise Selection Chips */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold uppercase tracking-wider text-zinc-400">
              Compare Exercise
            </span>
            <button
              onClick={() => setExercisePickerOpen(!exercisePickerOpen)}
              className="text-[12px] font-semibold text-brand hover:underline"
            >
              {exercisePickerOpen ? 'Hide list' : 'All Exercises'}
            </button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {POPULAR_BENCHMARKS.map((name) => {
              const active = selectedExerciseName === name;
              return (
                <button
                  key={name}
                  onClick={() => setSelectedExerciseName(name)}
                  className={cn(
                    'rounded-xl px-3.5 py-2 text-[12px] font-bold transition active:scale-95 shrink-0',
                    active
                      ? 'bg-brand text-white shadow-md shadow-brand/25'
                      : 'bg-zinc-900 border border-white/5 text-zinc-400 hover:text-zinc-200',
                  )}
                >
                  {name.replace(/\s*\([^)]*\)/, '')}
                </button>
              );
            })}
          </div>

          {exercisePickerOpen && (
            <div className="max-h-48 overflow-y-auto divide-y divide-white/5 rounded-2xl border border-white/5 bg-zinc-900/90 p-1">
              {exercises.map((e) => (
                <button
                  key={e.id}
                  onClick={() => {
                    setSelectedExerciseName(e.name);
                    setExercisePickerOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between p-2.5 text-left text-[13px] rounded-lg font-semibold',
                    selectedExerciseName === e.name
                      ? 'bg-brand/15 text-brand'
                      : 'text-zinc-300 hover:bg-white/5',
                  )}
                >
                  <span>{e.name}</span>
                  <span className="text-[11px] text-zinc-500">{e.muscleGroup}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected Exercise Header Title */}
        <div className="flex items-center gap-2.5 rounded-2xl bg-zinc-900/60 p-3 border border-white/5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand/15 text-brand">
            <Dumbbell size={18} />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-[15px] text-zinc-100 truncate">{selectedExercise?.name}</div>
            <div className="text-[12px] text-zinc-400">
              {selectedExercise?.muscleGroup} · {selectedExercise?.equipment}
            </div>
          </div>
        </div>

        {/* 3 Comparative Progress Bars Cards (Hevy Reference Aesthetic) */}
        <div className="space-y-3.5">
          {/* Card 1: Estimated 1RM */}
          <StrengthComparisonCard
            title="Estimated 1 Rep Max (1RM)"
            subtitle="Calculated via scientific Epley formula"
            unit="kg"
            uVal={comparison.orm.uVal}
            fVal={comparison.orm.fVal}
            uPct={comparison.orm.uPct}
            fPct={comparison.orm.fPct}
            deltaPct={comparison.orm.deltaPct}
            deltaVal={comparison.orm.deltaVal}
            friendName={selectedFriend?.name || 'Friend'}
            highlightIcon={<Sparkles size={14} className="text-amber-400" />}
          />

          {/* Card 2: Heaviest Weight */}
          <StrengthComparisonCard
            title="Heaviest Weight Lifted"
            subtitle="Single heaviest load logged"
            unit="kg"
            uVal={comparison.heaviest.uVal}
            fVal={comparison.heaviest.fVal}
            uPct={comparison.heaviest.uPct}
            fPct={comparison.heaviest.fPct}
            deltaPct={comparison.heaviest.deltaPct}
            deltaVal={comparison.heaviest.deltaVal}
            friendName={selectedFriend?.name || 'Friend'}
            highlightIcon={<Weight size={14} className="text-brand" />}
          />

          {/* Card 3: Best Set Volume */}
          <StrengthComparisonCard
            title="Best Set Volume"
            subtitle={`Peak work set: ${userStats.bestSetDesc} vs ${friendStats.bestSetDesc}`}
            unit="kg"
            uVal={comparison.setVol.uVal}
            fVal={comparison.setVol.fVal}
            uPct={comparison.setVol.uPct}
            fPct={comparison.setVol.fPct}
            deltaPct={comparison.setVol.deltaPct}
            deltaVal={comparison.setVol.deltaVal}
            friendName={selectedFriend?.name || 'Friend'}
            highlightIcon={<Zap size={14} className="text-emerald-400" />}
          />
        </div>

        {/* Activity & Consistency Comparison */}
        <div className="rounded-3xl border border-white/[0.06] bg-zinc-900/80 p-4">
          <div className="text-[14px] font-bold text-zinc-200">Session Frequency & Volume</div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-center">
            <div className="rounded-2xl bg-zinc-950/60 p-3">
              <div className="text-[11px] font-semibold uppercase text-zinc-500">Your Sessions</div>
              <div className="mt-1 text-[18px] font-extrabold text-brand tabular">
                {userStats.sessionCount}
              </div>
              <div className="text-[11px] text-zinc-400">{userStats.totalSets} total sets</div>
            </div>
            <div className="rounded-2xl bg-zinc-950/60 p-3">
              <div className="text-[11px] font-semibold uppercase text-zinc-500">
                {selectedFriend?.name}&apos;s Sessions
              </div>
              <div className="mt-1 text-[18px] font-extrabold text-zinc-300 tabular">
                {friendStats.sessionCount}
              </div>
              <div className="text-[11px] text-zinc-400">{friendStats.totalSets} total sets</div>
            </div>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

// ───────────────────────── Strength Bar Component ─────────────────────────

function StrengthComparisonCard({
  title,
  subtitle,
  unit,
  uVal,
  fVal,
  uPct,
  fPct,
  deltaPct,
  deltaVal,
  friendName,
  highlightIcon,
}: {
  title: string;
  subtitle: string;
  unit: string;
  uVal: number;
  fVal: number;
  uPct: number;
  fPct: number;
  deltaPct: number;
  deltaVal: number;
  friendName: string;
  highlightIcon: React.ReactNode;
}) {
  const isWinning = deltaVal > 0;
  const isTied = deltaVal === 0;

  return (
    <div className="rounded-3xl border border-white/[0.06] bg-zinc-900/90 p-4 shadow-lg transition">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 font-bold text-[15px] text-zinc-100">
            {highlightIcon}
            <span>{title}</span>
          </div>
          <div className="text-[12px] text-zinc-400 mt-0.5">{subtitle}</div>
        </div>

        {/* Delta Percentage Badge */}
        <div
          className={cn(
            'rounded-full px-2.5 py-0.5 text-[11px] font-bold tabular tracking-tight shrink-0',
            deltaPct == null
              ? 'bg-zinc-800 text-zinc-400'
              : isWinning
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
              : isTied
              ? 'bg-zinc-800 text-zinc-400'
              : 'bg-zinc-800 text-zinc-300 border border-white/5',
          )}
        >
          {deltaPct == null
            ? fVal === 0
              ? 'Uncontested'
              : '—'
            : isWinning
            ? `+${deltaPct}%`
            : isTied
            ? 'Equal'
            : `${deltaPct}%`}
        </div>
      </div>

      {/* Comparative Visual Bars */}
      <div className="mt-4 space-y-2.5">
        {/* User Bar (Blue) */}
        <div>
          <div className="flex items-center justify-between text-[13px] mb-1">
            <span className="font-bold text-brand">You</span>
            <span className="font-extrabold text-zinc-100 tabular">
              {uVal > 0 ? `${fmtNum(uVal, 1)} ${unit}` : '—'}
            </span>
          </div>
          <div className="h-3 w-full rounded-full bg-zinc-950/80 overflow-hidden p-0.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand to-blue-400 transition-all duration-500 shadow-sm shadow-brand/40"
              style={{ width: `${uPct}%` }}
            />
          </div>
        </div>

        {/* Friend Bar (Grey) */}
        <div>
          <div className="flex items-center justify-between text-[13px] mb-1">
            <span className="font-bold text-zinc-400">{friendName}</span>
            <span className="font-extrabold text-zinc-300 tabular">
              {fVal > 0 ? `${fmtNum(fVal, 1)} ${unit}` : '—'}
            </span>
          </div>
          <div className="h-3 w-full rounded-full bg-zinc-950/80 overflow-hidden p-0.5">
            <div
              className="h-full rounded-full bg-zinc-600 transition-all duration-500"
              style={{ width: `${fPct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── 3. Friend Profile View Modal ─────────────────────────

export function FriendProfileModal({
  friend,
  open,
  onClose,
  onCompareWithFriend,
}: {
  friend: PublicUser | null;
  open: boolean;
  onClose: () => void;
  onCompareWithFriend?: (friend: PublicUser) => void;
}) {
  const { isFollowing, followUser, unfollowUser, getFollowersCount, getFollowingCount } = useAuth();

  const canSeeWorkouts = friend?.shareWorkouts !== false;
  const canSeeRoutines = friend?.shareRoutines === true;
  const [cloudRoutines, setCloudRoutines] = useState<Routine[] | null>(null);

  useEffect(() => {
    if (friend && open) {
      if (canSeeWorkouts) {
        void cloudFetchFriendWorkouts(friend.id);
      }
      if (canSeeRoutines) {
        void cloudFetchFriendRoutines(friend.id).then((r) => {
          if (r) setCloudRoutines(r);
        });
      }
    }
  }, [friend?.id, open, canSeeWorkouts, canSeeRoutines]);

  // Load friend's workouts
  const workouts = useLiveQuery<Workout[]>(
    async () => {
      if (!friend || !canSeeWorkouts) return [];
      return db.workouts.where('userId').equals(friend.id).reverse().sortBy('startedAt');
    },
    [friend?.id, canSeeWorkouts],
  );

  // Load friend's public routines
  const localRoutines = useLiveQuery<Routine[]>(
    async () => {
      if (!friend || !canSeeRoutines) return [];
      return db.routines.where('userId').equals(friend.id).sortBy('order');
    },
    [friend?.id, canSeeRoutines],
  );

  const routines = cloudRoutines ?? localRoutines;

  const following = friend ? isFollowing(friend.id) : false;
  const followersCount = friend ? getFollowersCount(friend.id) : 0;
  const followingCount = friend ? getFollowingCount(friend.id) : 0;
  const totalWorkouts = workouts?.length ?? 0;

  // Total volume lifted
  const totalVolume = useMemo(() => {
    return (workouts ?? []).reduce((acc, w) => acc + (w.totalVolume || 0), 0);
  }, [workouts]);

  // 12-week chart
  const chartData = useMemo(() => {
    const list: { weekIndex: number; label: string; count: number; volume: number }[] = [];
    const nowTs = Date.now();
    const currentWeekStart = startOfWeek(nowTs);
    const ONE_WEEK_MS = 7 * 86400000;

    for (let i = 11; i >= 0; i--) {
      const wStart = currentWeekStart - i * ONE_WEEK_MS;
      const wEnd = wStart + ONE_WEEK_MS;
      const weekWorkouts = (workouts ?? []).filter((w) => w.startedAt >= wStart && w.startedAt < wEnd);
      const volume = weekWorkouts.reduce((s, w) => s + (w.totalVolume || 0), 0);

      const d = new Date(wStart);
      const label = i === 0 ? 'Now' : `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })}`;
      list.push({
        weekIndex: 11 - i,
        label,
        count: weekWorkouts.length,
        volume,
      });
    }
    return list;
  }, [workouts]);

  if (!friend) return null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      full
      title={`@${friend.username}`}
      left={<SheetTextButton onClick={onClose}>Done</SheetTextButton>}
    >
      <div className="space-y-5 px-4 pb-32 pt-2">
        {/* Profile Card */}
        <div className="rounded-3xl border border-white/[0.06] bg-zinc-900/90 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div
                className="grid h-16 w-16 place-items-center rounded-2xl text-[22px] font-bold text-white shadow-lg"
                style={{ backgroundColor: friend.avatarColor || '#3b82f6' }}
              >
                {friend.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h2 className="text-[20px] font-bold text-zinc-100">{friend.name}</h2>
                <div className="text-[13px] text-zinc-400">@{friend.username}</div>
                <div className="mt-1 flex items-center gap-3 text-[12px] text-zinc-400">
                  <span>
                    <strong className="text-zinc-200">{followersCount}</strong> Followers
                  </span>
                  <span>·</span>
                  <span>
                    <strong className="text-zinc-200">{followingCount}</strong> Following
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                if (following) void unfollowUser(friend.id);
                else void followUser(friend.id);
              }}
              className={cn(
                'rounded-xl px-4 py-2.5 text-[13px] font-bold transition active:scale-95',
                following
                  ? 'bg-zinc-800 text-zinc-300 border border-white/10'
                  : 'bg-brand text-white shadow-md shadow-brand/25',
              )}
            >
              {following ? 'Following' : 'Follow'}
            </button>
          </div>

          {/* Privacy & Member Info Strip */}
          <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3 text-[12px] text-zinc-400">
            <div>
              Joined {fmtDate(friend.createdAt, { month: 'long', year: 'numeric' })}
            </div>
            <div className="flex items-center gap-1.5 text-zinc-400">
              {friend.shareWorkouts === false ? (
                <span className="flex items-center gap-1 text-amber-400">
                  <Lock size={12} /> Workouts Private
                </span>
              ) : (
                <span className="text-emerald-400">Workouts Public</span>
              )}
              <span>·</span>
              {friend.shareRoutines ? (
                <span className="text-emerald-400">Routines Shared</span>
              ) : (
                <span className="text-zinc-500">Routines Private</span>
              )}
            </div>
          </div>

          <div className="mt-2.5 flex items-center justify-around rounded-xl bg-zinc-950/40 py-2 text-center text-[12px] border border-white/5">
            <div>
              <span className="text-zinc-500">Workouts: </span>
              <strong className="text-zinc-200">{totalWorkouts}</strong>
            </div>
            <div className="h-4 w-px bg-white/10" />
            <div>
              <span className="text-zinc-500">Total Volume: </span>
              <strong className="text-brand">{fmtVolume(totalVolume)}</strong>
            </div>
          </div>
        </div>

        {/* Quick Action: Compare Strength Button */}
        <button
          onClick={() => {
            onClose();
            onCompareWithFriend?.(friend);
          }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand to-indigo-600 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-brand/25 transition active:scale-[0.98]"
        >
          <ArrowLeftRight size={18} />
          <span>Gücünü Karşılaştır with {friend.name}</span>
        </button>

        {/* Privacy Notice OR Workouts */}
        {!canSeeWorkouts ? (
          <div className="rounded-3xl border border-white/[0.06] bg-zinc-900/90 p-6 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-amber-500/10 text-amber-400 mb-3">
              <Lock size={22} />
            </div>
            <h3 className="text-[17px] font-bold text-zinc-100">Workout History is Private</h3>
            <p className="mt-1 text-[13px] text-zinc-400 max-w-xs mx-auto">
              @{friend.username} has chosen to keep their workout logs and strength data private.
            </p>
          </div>
        ) : (
          <>
            {/* Weekly Activity Bar Chart */}
            <div className="rounded-3xl border border-white/[0.06] bg-zinc-900/90 p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-[16px] font-bold text-zinc-100">Activity Overview</h3>
                <span className="text-[13px] font-semibold text-brand tabular">
                  {totalWorkouts} total workouts
                </span>
              </div>

              <div className="mt-4 h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
                    <XAxis dataKey="label" stroke="#71717a" fontSize={10} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-[12px] shadow-xl">
                              <div className="font-semibold text-zinc-400">{data.label}</div>
                              <div className="mt-0.5 font-bold text-brand">
                                {data.count} workout{data.count === 1 ? '' : 's'}
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Friend's Recent Workout History */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[16px] font-bold text-zinc-100">Workout Logs</h3>
                <span className="text-[12px] text-zinc-500">{totalWorkouts} sessions</span>
              </div>

              {!workouts || workouts.length === 0 ? (
                <EmptyState
                  icon={Dumbbell}
                  title="No workouts recorded"
                  text={`${friend.name} hasn't logged any workouts yet.`}
                />
              ) : (
                <div className="space-y-3">
                  {workouts.slice(0, 5).map((w) => (
                    <div
                      key={w.id}
                      className="rounded-2xl border border-white/[0.06] bg-zinc-900/90 p-4 transition"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-bold text-[16px] text-zinc-100">{w.name}</div>
                          <div className="text-[12px] text-zinc-500">
                            {fmtDate(w.startedAt, { month: 'short', day: 'numeric', year: 'numeric' })} ·{' '}
                            {fmtTime(w.startedAt)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[13px] font-bold text-zinc-200 tabular">
                            {fmtVolume(w.totalVolume)}
                          </div>
                          <div className="text-[11px] text-zinc-500">{fmtDuration(w.durationSec)}</div>
                        </div>
                      </div>

                      {/* Exercises summary */}
                      <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-white/5 pt-2 text-[11px] text-zinc-400">
                        {w.exercises.map((e) => (
                          <span key={e.uid} className="rounded bg-zinc-800/80 px-2 py-0.5">
                            {e.sets.length} × {e.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Friend's Public Routines (only when friend.shareRoutines === true) */}
        {canSeeRoutines && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] font-bold text-zinc-100">Shared Routines</h3>
              <span className="text-[12px] text-emerald-400 font-semibold">Public</span>
            </div>
            {!routines || routines.length === 0 ? (
              <div className="rounded-2xl border border-white/[0.06] bg-zinc-900/60 p-4 text-[13px] text-zinc-400 text-center">
                No public routines shared yet.
              </div>
            ) : (
              <div className="space-y-2.5">
                {routines.map((r) => (
                  <div key={r.id} className="rounded-2xl border border-white/[0.06] bg-zinc-900/90 p-4">
                    <div className="font-bold text-[15px] text-zinc-100">{r.name}</div>
                    <div className="mt-1 text-[12px] text-zinc-400">{r.exercises.length} exercises</div>
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
