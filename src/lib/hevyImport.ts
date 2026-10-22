/**
 * KoyuncuFit - Hevy CSV Workout History Importer
 *
 * Parses Hevy workout export CSV files (`workouts.csv`), normalizes exercise names,
 * reconstructs workout sessions, calculates volume & calories, and matches
 * or creates exercises in the KoyuncuFit catalog.
 */

import {
  type Equipment,
  type Exercise,
  type Id,
  type MuscleGroup,
  type Workout,
  type WorkoutExercise,
  type WorkoutSet,
} from '../db';
import { calculateWorkoutCalories, type BiometricProfile } from './calories';

/**
 * Standard RFC 4180 CSV Parser supporting quoted fields, multi-line values, and commas.
 */
export function parseCSV(text: string): string[][] {
  // Strip BOM if present
  const cleanText = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (insideQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote: "" -> "
          currentField += '"';
          i++;
        } else {
          insideQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (char === '\r') {
        if (nextChar === '\n') {
          i++;
        }
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else if (char === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  // Push final field/row if any
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

const MONTHS_MAP: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
  // Common Turkish localized month names
  ocak: 0,
  subat: 1,
  şubat: 1,
  mart: 2,
  nisan: 3,
  mayis: 4,
  mayıs: 4,
  haziran: 5,
  temmuz: 6,
  agustos: 7,
  ağustos: 7,
  eylul: 8,
  eylül: 8,
  ekim: 9,
  kasim: 10,
  kasım: 10,
  aralik: 11,
  aralık: 11,
};

/**
 * Parses Hevy's datetime strings into epoch timestamps (ms).
 * Handles:
 * - "21 Oct 2026, 17:30" or "21 Oct 2026, 17:30:00"
 * - "21 Oct 2026 17:30"
 * - "2026-10-21 17:30:00" or ISO format
 * - "10/21/2026 17:30"
 */
export function parseHevyDate(dateStr: string): number {
  if (!dateStr || !dateStr.trim()) return Date.now();
  const trimmed = dateStr.trim();

  // Pattern: "21 Oct 2026, 17:30" or "21 Oct 2026 17:30:00"
  const dmyMatch = trimmed.match(
    /^(\d{1,2})\s+([A-Za-zçğıöşüÇĞİÖŞÜ]+)\s+(\d{4})(?:,\s*|\s+)(\d{1,2}):(\d{2})(?::(\d{2}))?/i,
  );
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const monthKey = dmyMatch[2].toLowerCase();
    const month = MONTHS_MAP[monthKey] ?? 0;
    const year = parseInt(dmyMatch[3], 10);
    const hour = parseInt(dmyMatch[4], 10);
    const min = parseInt(dmyMatch[5], 10);
    const sec = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
    return new Date(year, month, day, hour, min, sec).getTime();
  }

  // Pattern: "2026-10-21 17:30:00" or ISO
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const hour = parseInt(isoMatch[4], 10);
    const min = parseInt(isoMatch[5], 10);
    const sec = isoMatch[6] ? parseInt(isoMatch[6], 10) : 0;
    return new Date(year, month, day, hour, min, sec).getTime();
  }

  // Standard fallback
  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    return parsed;
  }

  return Date.now();
}

/**
 * Normalizes an exercise name for fuzzy comparison.
 * Strips parentheses, punctuation, and extra whitespace.
 */
export function normalizeExerciseName(rawName: string): string {
  return rawName
    .toLowerCase()
    .replace(/[()[\]{}_,.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes exercise name without equipment keywords.
 */
export function stripEquipmentTokens(rawName: string): string {
  return rawName
    .toLowerCase()
    .replace(/\b(barbell|dumbbell|cable|machine|smith machine|smith|bodyweight)\b/g, '')
    .replace(/[()[\]{}_,.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Smart matches a Hevy exercise title against KoyuncuFit's catalog.
 */
export function matchExerciseInCatalog(hevyName: string, catalog: Exercise[]): Exercise | null {
  if (!hevyName || !catalog || catalog.length === 0) return null;

  const rawTrimmed = hevyName.trim().toLowerCase();
  const normalized = normalizeExerciseName(hevyName);
  const words = normalized.split(' ').filter(Boolean).sort().join(' ');
  const stripped = stripEquipmentTokens(hevyName);

  // 1. Exact case-insensitive match
  for (const ex of catalog) {
    if (ex.name.trim().toLowerCase() === rawTrimmed) {
      return ex;
    }
  }

  // 2. Normalized match
  for (const ex of catalog) {
    if (normalizeExerciseName(ex.name) === normalized) {
      return ex;
    }
  }

  // 3. Word token set equality (e.g. "Bench Press (Barbell)" vs "Barbell Bench Press")
  for (const ex of catalog) {
    const exWords = normalizeExerciseName(ex.name).split(' ').filter(Boolean).sort().join(' ');
    if (exWords === words) {
      return ex;
    }
  }

  // 4. Match stripped equipment names if equipment is identical
  if (stripped.length > 2) {
    for (const ex of catalog) {
      const exStripped = stripEquipmentTokens(ex.name);
      if (exStripped === stripped) {
        return ex;
      }
    }
  }

  // 5. Starts-with / substring match if strong overlap
  for (const ex of catalog) {
    const exNorm = normalizeExerciseName(ex.name);
    if (normalized.includes(exNorm) || exNorm.includes(normalized)) {
      return ex;
    }
  }

  return null;
}

/**
 * Automatically infers equipment from exercise title.
 */
function inferEquipment(name: string): Equipment {
  const lower = name.toLowerCase();
  if (lower.includes('barbell') || lower.includes('halter')) return 'Barbell';
  if (lower.includes('dumbbell') || lower.includes('dambıl')) return 'Dumbbell';
  if (lower.includes('cable') || lower.includes('kablo')) return 'Cable';
  if (lower.includes('machine') || lower.includes('makine') || lower.includes('smith'))
    return 'Machine';
  if (
    lower.includes('bodyweight') ||
    lower.includes('pull up') ||
    lower.includes('chin up') ||
    lower.includes('push up') ||
    lower.includes('dip')
  )
    return 'Bodyweight';
  return 'Barbell';
}

/**
 * Automatically infers anatomical muscle group from exercise title.
 */
function inferMuscleGroup(name: string): MuscleGroup {
  const lower = name.toLowerCase();
  if (
    lower.includes('bench') ||
    lower.includes('chest') ||
    lower.includes('fly') ||
    lower.includes('pec') ||
    lower.includes('push-up') ||
    lower.includes('pushup')
  )
    return 'Chest';
  if (
    lower.includes('row') ||
    lower.includes('lat') ||
    lower.includes('pull') ||
    lower.includes('deadlift') ||
    lower.includes('back') ||
    lower.includes('chin')
  )
    return 'Back';
  if (
    lower.includes('squat') ||
    lower.includes('leg') ||
    lower.includes('quad') ||
    lower.includes('hamstring') ||
    lower.includes('calf') ||
    lower.includes('calves') ||
    lower.includes('lunge')
  )
    return 'Legs';
  if (
    lower.includes('shoulder') ||
    lower.includes('overhead') ||
    lower.includes('military') ||
    lower.includes('deltoid') ||
    lower.includes('lateral raise') ||
    lower.includes('front raise')
  )
    return 'Shoulders';
  if (lower.includes('bicep') || lower.includes('curl')) return 'Biceps';
  if (
    lower.includes('tricep') ||
    lower.includes('pushdown') ||
    lower.includes('skull crusher') ||
    lower.includes('skullcrusher') ||
    lower.includes('dip')
  )
    return 'Triceps';
  if (
    lower.includes('ab') ||
    lower.includes('crunch') ||
    lower.includes('plank') ||
    lower.includes('core')
  )
    return 'Core';
  return 'Chest';
}

export interface HevyCSVRow {
  title: string;
  start_time: string;
  end_time: string;
  description: string;
  exercise_title: string;
  superset_id?: string;
  exercise_notes?: string;
  set_index: number;
  set_type: 'normal' | 'warmup' | 'drop' | 'failure';
  weight_kg: number;
  reps: number;
  distance_km?: number;
  duration_seconds?: number;
  rpe?: number;
}

export interface HevyImportResult {
  workouts: Workout[];
  createdExercises: Exercise[];
  totalSets: number;
  totalWorkouts: number;
}

/**
 * Parses full Hevy workouts.csv and groups into structured Workout models.
 */
export async function parseHevyWorkoutsCSV(
  csvContent: string,
  options: {
    userId: Id;
    catalog: Exercise[];
    userProfile?: BiometricProfile;
  },
): Promise<HevyImportResult> {
  const { userId, catalog, userProfile } = options;
  const rawRows = parseCSV(csvContent);
  if (rawRows.length < 2) {
    return { workouts: [], createdExercises: [], totalSets: 0, totalWorkouts: 0 };
  }

  // 1. Map header indices
  const headers = rawRows[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  const getCol = (names: string[]): number => {
    for (const n of names) {
      const idx = headers.indexOf(n);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const colTitle = getCol(['title', 'workout_title', 'workout_name', 'name']);
  const colStartTime = getCol(['start_time', 'start', 'started_at', 'date', 'start_date']);
  const colEndTime = getCol(['end_time', 'end', 'ended_at', 'end_date']);
  const colDesc = getCol(['description', 'workout_notes', 'notes']);
  const colExTitle = getCol(['exercise_title', 'exercise_name', 'exercise']);
  const colExNotes = getCol(['exercise_notes']);
  const colSetIdx = getCol(['set_index', 'set_order', 'set_number', 'index']);
  const colSetType = getCol(['set_type', 'type']);
  const colWeightKg = getCol(['weight_kg', 'weight', 'kg']);
  const colWeightLbs = getCol(['weight_lbs', 'lbs']);
  const colReps = getCol(['reps', 'rep']);
  const colDurationSec = getCol(['duration_seconds', 'duration_sec', 'duration', 'time']);

  // Catalog lookup cache and newly created custom exercises
  const knownCatalog = [...catalog];
  const newCreatedExercises: Exercise[] = [];
  const exerciseLookup = new Map<string, Exercise>();

  // Helper to find or synthesize an exercise
  const resolveExercise = (name: string): Exercise => {
    const trimmed = name.trim();
    if (exerciseLookup.has(trimmed)) {
      return exerciseLookup.get(trimmed)!;
    }

    const matched = matchExerciseInCatalog(trimmed, knownCatalog);
    if (matched) {
      exerciseLookup.set(trimmed, matched);
      return matched;
    }

    // Synthesize a clean custom exercise
    const highestId = knownCatalog.reduce((max, e) => Math.max(max, e.id), 1000);
    const newId = highestId + 1 + newCreatedExercises.length;
    const equip = inferEquipment(trimmed);
    const muscle = inferMuscleGroup(trimmed);

    const customEx: Exercise = {
      id: newId,
      name: trimmed,
      muscleGroup: muscle,
      equipment: equip,
      isCustom: true,
      createdAt: Date.now(),
      primaryMuscles: [muscle],
      secondaryMuscles: [],
      metValue: 4.8,
    };

    knownCatalog.push(customEx);
    newCreatedExercises.push(customEx);
    exerciseLookup.set(trimmed, customEx);
    return customEx;
  };

  // Group rows by workout session: (title + start_time)
  interface RawGroup {
    title: string;
    startTimeStr: string;
    endTimeStr: string;
    description: string;
    rows: {
      exerciseTitle: string;
      exerciseNotes: string;
      setIndex: number;
      setType: 'normal' | 'warmup' | 'drop' | 'failure';
      weightKg: number;
      reps: number;
      durationSec: number;
    }[];
  }

  const groups = new Map<string, RawGroup>();

  for (let r = 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0 || row.every((c) => !c.trim())) continue;

    const title = colTitle !== -1 && row[colTitle] ? row[colTitle].trim() : 'Workout';
    const startTimeStr = colStartTime !== -1 && row[colStartTime] ? row[colStartTime].trim() : '';
    const endTimeStr = colEndTime !== -1 && row[colEndTime] ? row[colEndTime].trim() : '';
    const desc = colDesc !== -1 && row[colDesc] ? row[colDesc].trim() : '';
    const exTitle = colExTitle !== -1 && row[colExTitle] ? row[colExTitle].trim() : '';

    if (!startTimeStr && !exTitle) continue;

    // Use title + startTimeStr as group identity
    const groupKey = `${title}__${startTimeStr}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        title: title || 'Workout',
        startTimeStr,
        endTimeStr,
        description: desc,
        rows: [],
      });
    }

    const group = groups.get(groupKey)!;

    // Parse set metrics
    const rawSetIdx = colSetIdx !== -1 && row[colSetIdx] ? parseInt(row[colSetIdx], 10) : 0;
    const setIndex = Number.isNaN(rawSetIdx) ? group.rows.length : rawSetIdx;

    let setType: 'normal' | 'warmup' | 'drop' | 'failure' = 'normal';
    if (colSetType !== -1 && row[colSetType]) {
      const st = row[colSetType].trim().toLowerCase();
      if (st.includes('warm')) setType = 'warmup';
      else if (st.includes('drop')) setType = 'drop';
      else if (st.includes('fail')) setType = 'failure';
    }

    let weightKg = 0;
    if (colWeightKg !== -1 && row[colWeightKg]) {
      const parsed = parseFloat(row[colWeightKg].replace(',', '.'));
      if (!Number.isNaN(parsed)) weightKg = parsed;
    } else if (colWeightLbs !== -1 && row[colWeightLbs]) {
      const parsed = parseFloat(row[colWeightLbs].replace(',', '.'));
      if (!Number.isNaN(parsed)) weightKg = Number((parsed * 0.45359237).toFixed(1));
    }

    let reps = 0;
    if (colReps !== -1 && row[colReps]) {
      const parsed = parseInt(row[colReps], 10);
      if (!Number.isNaN(parsed)) reps = parsed;
    }

    let durationSec = 0;
    if (colDurationSec !== -1 && row[colDurationSec]) {
      const parsed = parseInt(row[colDurationSec], 10);
      if (!Number.isNaN(parsed)) durationSec = parsed;
    }

    const exNotes = colExNotes !== -1 && row[colExNotes] ? row[colExNotes].trim() : '';

    group.rows.push({
      exerciseTitle: exTitle || 'Exercise',
      exerciseNotes: exNotes,
      setIndex,
      setType,
      weightKg,
      reps,
      durationSec,
    });
  }

  // 2. Reconstruct Workout entities
  const constructedWorkouts: Workout[] = [];
  let totalSetsCount = 0;

  for (const group of groups.values()) {
    const startedAt = parseHevyDate(group.startTimeStr);
    let endedAt = group.endTimeStr ? parseHevyDate(group.endTimeStr) : 0;

    if (endedAt <= startedAt) {
      // Approximate duration: 90 sec per set, minimum 30 min
      const approxDurationSec = Math.max(1800, group.rows.length * 90);
      endedAt = startedAt + approxDurationSec * 1000;
    }

    const durationSec = Math.max(60, Math.round((endedAt - startedAt) / 1000));

    // Group rows into exercises preserving order of appearance
    const exerciseGroups = new Map<
      string,
      {
        exercise: Exercise;
        notes: string;
        sets: { index: number; set: WorkoutSet }[];
      }
    >();

    for (const r of group.rows) {
      const ex = resolveExercise(r.exerciseTitle);
      if (!exerciseGroups.has(ex.name)) {
        exerciseGroups.set(ex.name, {
          exercise: ex,
          notes: r.exerciseNotes || '',
          sets: [],
        });
      }

      const eg = exerciseGroups.get(ex.name)!;
      if (r.exerciseNotes && !eg.notes) {
        eg.notes = r.exerciseNotes;
      }

      eg.sets.push({
        index: r.setIndex,
        set: {
          uid: `s_${startedAt}_${r.setIndex}_${Math.random().toString(36).slice(2, 6)}`,
          type: r.setType,
          weight: r.weightKg,
          reps: r.reps,
        },
      });
      totalSetsCount++;
    }

    // Build WorkoutExercise array
    const workoutExercises: WorkoutExercise[] = [];
    let workoutVolume = 0;
    let workoutSetsCount = 0;

    for (const eg of exerciseGroups.values()) {
      // Sort sets by set index
      eg.sets.sort((a, b) => a.index - b.index);
      const sets = eg.sets.map((s) => s.set);

      for (const s of sets) {
        if (s.reps > 0) {
          workoutVolume += s.weight * s.reps;
          workoutSetsCount++;
        }
      }

      workoutExercises.push({
        uid: `we_${startedAt}_${eg.exercise.id}_${Math.random().toString(36).slice(2, 6)}`,
        exerciseId: eg.exercise.id,
        name: eg.exercise.name,
        muscleGroup: eg.exercise.muscleGroup,
        equipment: eg.exercise.equipment,
        restSeconds: 90,
        notes: eg.notes,
        sets,
      });
    }

    const calories = calculateWorkoutCalories(durationSec, workoutVolume, 4.8, userProfile);

    const workoutId = `hevy_${startedAt}_${Math.random().toString(36).slice(2, 7)}`;

    constructedWorkouts.push({
      id: workoutId,
      userId,
      name: group.title,
      startedAt,
      endedAt,
      durationSec,
      notes: group.description,
      exercises: workoutExercises,
      exerciseIds: Array.from(new Set(workoutExercises.map((e) => e.exerciseId))),
      totalVolume: Math.round(workoutVolume),
      totalSets: workoutSetsCount,
      caloriesBurned: calories,
    });
  }

  // Sort workouts chronologically by startedAt descending
  constructedWorkouts.sort((a, b) => b.startedAt - a.startedAt);

  return {
    workouts: constructedWorkouts,
    createdExercises: newCreatedExercises,
    totalSets: totalSetsCount,
    totalWorkouts: constructedWorkouts.length,
  };
}
