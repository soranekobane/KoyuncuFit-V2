import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { db, type Routine, type Workout } from '../db';
import { playRestFinished, unlockAudio } from '../lib/audio';
import { calculateWorkoutCalories } from '../lib/calories';
import { useAuth } from './AuthContext';
import {
  buildFromRoutine,
  detectPRs,
  emptyWorkout,
  liveTotals,
  toWorkoutExercises,
  totalsOf,
  type ActiveWorkout,
  type PRHit,
} from '../lib/workout';

const getActiveKey = (userId?: number) => `koyuncu.activeWorkout.${userId ?? 'anon'}.v1`;
const getRestKey = (userId?: number) => `koyuncu.restTimer.${userId ?? 'anon'}.v1`;

export interface RestState {
  endsAt: number;
  total: number;
}

export interface FinishResult {
  workout: Workout;
  prs: PRHit[];
}

interface WorkoutCtx {
  active: ActiveWorkout | null;
  isOpen: boolean;
  open: () => void;
  minimize: () => void;
  startWorkout: (routine?: Routine) => Promise<void>;
  update: (fn: (w: ActiveWorkout) => ActiveWorkout) => void;
  discard: () => void;
  finish: () => Promise<FinishResult | null>;
  rest: RestState | null;
  startRest: (seconds: number) => void;
  adjustRest: (delta: number) => void;
  skipRest: () => void;
  liveCalories: number;
}

const Ctx = createContext<WorkoutCtx | null>(null);

function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function save(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota – ignore */
  }
}

export function WorkoutProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  const userId = currentUser?.id;
  const activeKey = getActiveKey(userId);
  const restKey = getRestKey(userId);

  const [active, setActive] = useState<ActiveWorkout | null>(() => load<ActiveWorkout>(activeKey));
  const [isOpen, setIsOpen] = useState<boolean>(() => !!load<ActiveWorkout>(activeKey));
  const [rest, setRest] = useState<RestState | null>(() => {
    const r = load<RestState>(restKey);
    return r && r.endsAt > Date.now() ? r : null;
  });

  // Reload state when active user changes so workouts never leak across accounts
  useEffect(() => {
    const savedActive = load<ActiveWorkout>(activeKey);
    setActive(savedActive);
    setIsOpen(!!savedActive);
    const savedRest = load<RestState>(restKey);
    setRest(savedRest && savedRest.endsAt > Date.now() ? savedRest : null);
  }, [activeKey, restKey]);

  // Persist on change scoped to current user
  useEffect(() => save(activeKey, active), [activeKey, active]);
  useEffect(() => save(restKey, rest), [restKey, rest]);

  // Rest timer completion watcher.
  const restRef = useRef(rest);
  useEffect(() => {
    restRef.current = rest;
  }, [rest]);

  useEffect(() => {
    if (!rest) return;
    const id = window.setInterval(() => {
      const r = restRef.current;
      if (r && Date.now() >= r.endsAt) {
        playRestFinished();
        setRest(null);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [rest]);

  const update = useCallback((fn: (w: ActiveWorkout) => ActiveWorkout) => {
    setActive((prev) => (prev ? fn(prev) : prev));
  }, []);

  const startWorkout = useCallback(async (routine?: Routine) => {
    unlockAudio();
    const w = routine ? await buildFromRoutine(routine) : emptyWorkout();
    setRest(null);
    setActive(w);
    setIsOpen(true);
  }, []);

  const discard = useCallback(() => {
    setActive(null);
    setIsOpen(false);
    setRest(null);
  }, []);

  const startRest = useCallback((seconds: number) => {
    if (seconds <= 0) return;
    unlockAudio();
    setRest({ endsAt: Date.now() + seconds * 1000, total: seconds });
  }, []);

  const adjustRest = useCallback((delta: number) => {
    setRest((r) => {
      if (!r) return r;
      const endsAt = r.endsAt + delta * 1000;
      if (endsAt <= Date.now()) return null;
      return { endsAt, total: Math.max(1, r.total + delta) };
    });
  }, []);

  const skipRest = useCallback(() => setRest(null), []);

  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const currentUserRef = useRef(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // Calculate live calories burned
  const liveCalories = useMemo(() => {
    if (!active) return 0;
    const elapsedSec = Math.max(0, (Date.now() - active.startedAt) / 1000);
    const totals = liveTotals(active.exercises);
    return calculateWorkoutCalories(elapsedSec, totals.volume, 4.8, currentUser ?? undefined);
  }, [active, currentUser]);

  const finish = useCallback(async (): Promise<FinishResult | null> => {
    const a = activeRef.current;
    if (!a) return null;
    const exercises = toWorkoutExercises(a.exercises);
    if (!exercises.length) return null;
    const endedAt = Date.now();
    const user = currentUserRef.current;
    if (!user) throw new Error('Please sign in to log a workout.');
    const prs = await detectPRs(exercises, a.startedAt, undefined, user.id);
    const durationSec = Math.round((endedAt - a.startedAt) / 1000);
    const totals = totalsOf(exercises);
    const caloriesBurned = calculateWorkoutCalories(
      durationSec,
      totals.totalVolume,
      4.8,
      user,
    );

    const data: Omit<Workout, 'id'> = {
      userId: user.id,
      name: a.name.trim() || 'Workout',
      routineId: a.routineId,
      startedAt: a.startedAt,
      endedAt,
      durationSec,
      notes: a.notes.trim(),
      exercises,
      exerciseIds: Array.from(new Set(exercises.map((e) => e.exerciseId))),
      totalVolume: totals.totalVolume,
      totalSets: totals.totalSets,
      caloriesBurned,
    };
    const id = await db.workouts.add(data as Workout);
    save(getActiveKey(user.id), null);
    setActive(null);
    setIsOpen(false);
    setRest(null);
    return { workout: { ...data, id: id as number }, prs };
  }, []);

  const value = useMemo<WorkoutCtx>(
    () => ({
      active,
      isOpen: isOpen && !!active,
      open: () => setIsOpen(true),
      minimize: () => setIsOpen(false),
      startWorkout,
      update,
      discard,
      finish,
      rest,
      startRest,
      adjustRest,
      skipRest,
      liveCalories,
    }),
    [active, isOpen, startWorkout, update, discard, finish, rest, startRest, adjustRest, skipRest, liveCalories],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWorkout() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useWorkout must be used inside WorkoutProvider');
  return c;
}
