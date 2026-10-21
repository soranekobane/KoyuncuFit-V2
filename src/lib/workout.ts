import { db, type Equipment, type Exercise, type MuscleGroup, type Routine, type SetType, type Workout, type WorkoutExercise, type WorkoutSet } from '../db';
import { bestsFromWorkouts, epley1RM, isWorkingSet, setVolume, uid } from './utils';

// ───────────── In-progress (editable) workout model ─────────────
// Inputs are kept as strings so partially typed values ("82.") survive re-renders.

export interface ActiveSet {
  uid: string;
  type: SetType;
  weight: string;
  reps: string;
  completed: boolean;
}

export interface ActiveExercise {
  uid: string;
  exerciseId: number;
  name: string;
  muscleGroup: MuscleGroup;
  equipment: Equipment;
  restSeconds: number;
  targetReps: number | null;
  notes: string;
  showNotes: boolean;
  sets: ActiveSet[];
}

export interface ActiveWorkout {
  name: string;
  routineId?: number;
  startedAt: number;
  notes: string;
  exercises: ActiveExercise[];
}

export const newSet = (partial: Partial<ActiveSet> = {}): ActiveSet => ({
  uid: uid(),
  type: 'normal',
  weight: '',
  reps: '',
  completed: false,
  ...partial,
});

export function activeExerciseFrom(ex: Exercise, opts: { sets?: number; reps?: number | null; rest?: number; notes?: string } = {}): ActiveExercise {
  return {
    uid: uid(),
    exerciseId: ex.id,
    name: ex.name,
    muscleGroup: ex.muscleGroup,
    equipment: ex.equipment,
    restSeconds: opts.rest ?? 90,
    targetReps: opts.reps ?? null,
    notes: opts.notes ?? '',
    showNotes: !!opts.notes,
    sets: Array.from({ length: opts.sets ?? 3 }, () => newSet()),
  };
}

export async function buildFromRoutine(routine: Routine): Promise<ActiveWorkout> {
  const exs = await db.exercises.bulkGet(routine.exercises.map((e) => e.exerciseId));
  const exercises: ActiveExercise[] = [];
  routine.exercises.forEach((re, i) => {
    const ex = exs[i];
    if (!ex) return;
    exercises.push(activeExerciseFrom(ex, { sets: re.sets, reps: re.reps, rest: re.restSeconds, notes: re.notes }));
  });
  return { name: routine.name, routineId: routine.id, startedAt: Date.now(), notes: '', exercises };
}

export function emptyWorkout(): ActiveWorkout {
  const h = new Date().getHours();
  const part = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
  return { name: `${part} Workout`, startedAt: Date.now(), notes: '', exercises: [] };
}

/** Past workout → editable model (every stored set is completed). */
export function activeFromWorkout(w: Workout): ActiveExercise[] {
  return w.exercises.map((e) => ({
    uid: e.uid || uid(),
    exerciseId: e.exerciseId,
    name: e.name,
    muscleGroup: e.muscleGroup,
    equipment: e.equipment,
    restSeconds: e.restSeconds,
    targetReps: null,
    notes: e.notes,
    showNotes: !!e.notes,
    sets: e.sets.map((s) => ({
      uid: s.uid || uid(),
      type: s.type,
      weight: s.weight ? String(s.weight) : '',
      reps: s.reps ? String(s.reps) : '',
      completed: true,
    })),
  }));
}

export const parseNum = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** Keep only completed sets that have reps; drop empty exercises. */
export function toWorkoutExercises(list: ActiveExercise[]): WorkoutExercise[] {
  return list
    .map((e) => ({
      uid: e.uid,
      exerciseId: e.exerciseId,
      name: e.name,
      muscleGroup: e.muscleGroup,
      equipment: e.equipment,
      restSeconds: e.restSeconds,
      notes: e.notes.trim(),
      sets: e.sets
        .filter((s) => s.completed && parseNum(s.reps) > 0)
        .map<WorkoutSet>((s) => ({ uid: s.uid, type: s.type, weight: parseNum(s.weight), reps: Math.round(parseNum(s.reps)) })),
    }))
    .filter((e) => e.sets.length > 0);
}

export function totalsOf(exs: WorkoutExercise[]) {
  let totalVolume = 0;
  let totalSets = 0;
  for (const e of exs) {
    for (const s of e.sets) {
      totalVolume += setVolume(s);
      totalSets += 1;
    }
  }
  return { totalVolume, totalSets };
}

export function liveTotals(list: ActiveExercise[]) {
  let volume = 0;
  let sets = 0;
  for (const e of list) {
    for (const s of e.sets) {
      if (!s.completed) continue;
      sets += 1;
      volume += setVolume({ type: s.type, weight: parseNum(s.weight), reps: parseNum(s.reps) });
    }
  }
  return { volume, sets };
}

// ───────────── PR detection ─────────────

export interface PRHit {
  exerciseName: string;
  kind: 'Est. 1RM' | 'Heaviest Weight';
  value: number;
  previous: number;
}

export async function detectPRs(
  exs: WorkoutExercise[],
  before: number,
  excludeId?: number,
  userId?: number,
): Promise<PRHit[]> {
  const hits: PRHit[] = [];
  for (const ex of exs) {
    const list = await db.workouts.where('exerciseIds').equals(ex.exerciseId).toArray();
    const prior = list.filter(
      (w) => w.startedAt < before && w.id !== excludeId && (!userId || w.userId === userId),
    );
    if (!prior.length) continue;
    const bests = bestsFromWorkouts(prior, ex.exerciseId);
    let s1 = 0;
    let sw = 0;
    for (const s of ex.sets) {
      if (!isWorkingSet(s.type)) continue;
      s1 = Math.max(s1, epley1RM(s.weight, s.reps));
      sw = Math.max(sw, s.weight);
    }
    if (s1 > bests.best1RM + 0.01 && bests.best1RM > 0) hits.push({ exerciseName: ex.name, kind: 'Est. 1RM', value: s1, previous: bests.best1RM });
    if (sw > bests.maxWeight && bests.maxWeight > 0) hits.push({ exerciseName: ex.name, kind: 'Heaviest Weight', value: sw, previous: bests.maxWeight });
  }
  return hits;
}

/** Display label for a set: W / D / F or the working-set number. */
export function setLabels(sets: { type: SetType }[]): string[] {
  let n = 0;
  return sets.map((s) => {
    if (s.type === 'warmup') return 'W';
    n += 1;
    if (s.type === 'drop') return 'D';
    if (s.type === 'failure') return 'F';
    return String(n);
  });
}

/** Match a set to the corresponding set of the previous session (warm-ups ↔ warm-ups, working ↔ working). */
export function matchPrevious(sets: { type: SetType }[], index: number, previous: WorkoutSet[]): WorkoutSet | undefined {
  const isWarm = sets[index].type === 'warmup';
  let ordinal = 0;
  for (let i = 0; i < index; i++) if ((sets[i].type === 'warmup') === isWarm) ordinal++;
  return previous.filter((p) => (p.type === 'warmup') === isWarm)[ordinal];
}

export const SET_TYPE_CYCLE: SetType[] = ['normal', 'warmup', 'drop', 'failure'];
