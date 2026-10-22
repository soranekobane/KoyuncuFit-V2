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
  // English full & abbr
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

  // Turkish full & 3-letter abbreviations (e.g. 19 Eki, 28 Şub, 17 Oca)
  oca: 0,
  ocak: 0,
  sub: 1,
  şub: 1,
  subat: 1,
  şubat: 1,
  mart: 2,
  nis: 3,
  nisan: 3,
  mayis: 4,
  mayıs: 4,
  haz: 5,
  haziran: 5,
  tem: 6,
  temmuz: 6,
  agu: 7,
  ağu: 7,
  agustos: 7,
  ağustos: 7,
  eyl: 8,
  eylul: 8,
  eylül: 8,
  eki: 9,
  ekim: 9,
  kas: 10,
  kasim: 10,
  kasım: 10,
  ara: 11,
  aralik: 11,
  aralık: 11,
};

/**
 * Parses Hevy's datetime strings into epoch timestamps (ms).
 * Handles:
 * - "21 Oct 2026, 17:30" or "21 Oct 2026, 17:30:00"
 * - "19 Eki 2026, 10:18" or "28 Şub 2025, 15:41" or "17 Oca 2023, 15:59" (Turkish Hevy export)
 * - "2026-10-21 17:30:00" or ISO format
 * - "21.10.2026 17:30" or "21/10/2026 17:30"
 */
export function parseHevyDate(dateStr: string): number {
  if (!dateStr || !dateStr.trim()) return Date.now();
  const trimmed = dateStr.trim().replace(/^["']|["']$/g, '').trim();

  // Pattern: "21 Oct 2026, 17:30" or "28 Şub 2025, 15:41" or "19 Eki 2026 10:18"
  const dmyMatch = trimmed.match(
    /^(\d{1,2})\s+([A-Za-zçğıöşüÇĞİÖŞÜ.]+)\s+(\d{4})(?:,\s*|\s+)(\d{1,2}):(\d{2})(?::(\d{2}))?/i,
  );
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const rawMonth = dmyMatch[2].toLowerCase().replace(/\./g, '');
    const cleanMonth = rawMonth
      .replace(/ı/g, 'i')
      .replace(/İ/g, 'i')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c');

    const month = MONTHS_MAP[rawMonth] ?? MONTHS_MAP[cleanMonth];
    if (month !== undefined) {
      const year = parseInt(dmyMatch[3], 10);
      const hour = parseInt(dmyMatch[4], 10);
      const min = parseInt(dmyMatch[5], 10);
      const sec = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
      return new Date(year, month, day, hour, min, sec).getTime();
    }
  }

  // Pattern: "21.10.2026 17:30" or "21/10/2026 17:30"
  const dmyNumMatch = trimmed.match(
    /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:,\s*|\s+)(\d{1,2}):(\d{2})(?::(\d{2}))?/,
  );
  if (dmyNumMatch) {
    const day = parseInt(dmyNumMatch[1], 10);
    const month = parseInt(dmyNumMatch[2], 10) - 1;
    const year = parseInt(dmyNumMatch[3], 10);
    const hour = parseInt(dmyNumMatch[4], 10);
    const min = parseInt(dmyNumMatch[5], 10);
    const sec = dmyNumMatch[6] ? parseInt(dmyNumMatch[6], 10) : 0;
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
 * Translates Turkish Hevy exercise terminology to standard English terms.
 */
export function translateTurkishExerciseTerms(name: string): string {
  let s = name.trim();
  s = s.replace(/\((?:bar|halter)\)/gi, '(Barbell)');
  s = s.replace(/\((?:dambıl|dambil)\)/gi, '(Dumbbell)');
  s = s.replace(/\((?:makine|makina)\)/gi, '(Machine)');
  s = s.replace(/\((?:kablo)\)/gi, '(Cable)');
  s = s.replace(/\((?:destekli)\)/gi, '(Assisted)');
  s = s.replace(/\((?:vücut ağırlığı|vucut agirligi)\)/gi, '(Bodyweight)');
  s = s.replace(/\((?:smith machine|smith)\)/gi, '(Smith Machine)');

  s = s.replace(/\bbarfiks\b/gi, 'Pull Up');
  s = s.replace(/\bşınav\b|\bsinav\b/gi, 'Push Up');
  s = s.replace(/\boturarak\b/gi, 'Seated');
  s = s.replace(/\bayakta\b/gi, 'Standing');
  s = s.replace(/\btek kol\b/gi, 'Single Arm');
  s = s.replace(/\btek bacak\b/gi, 'Single Leg');
  s = s.replace(/\bv tutuş\b|\bv tutus\b/gi, 'V Grip');
  return s;
}

/**
 * Comprehensive Turkish-to-Canonical exercise mapping dictionary.
 * Maps all Turkish Hevy names directly to catalog titles.
 */
export const TURKISH_HEVY_EXERCISE_MAP: Record<string, string> = {
  // Bench Press
  'bench press (bar)': 'Barbell Bench Press',
  'bench press (barbell)': 'Barbell Bench Press',
  'bench press': 'Barbell Bench Press',
  'incline bench press (bar)': 'Incline Bench Press',
  'incline bench press (barbell)': 'Incline Bench Press',
  'incline barbell bench press': 'Incline Bench Press',
  'incline bench press (dambıl)': 'Dumbbell Incline Bench Press',
  'incline bench press (dambil)': 'Dumbbell Incline Bench Press',
  'incline bench press (dumbbell)': 'Dumbbell Incline Bench Press',
  'incline bench press (smith machine)': 'Smith Incline Bench Press',
  'bench press (dambıl)': 'Dumbbell Bench Press',
  'bench press (dambil)': 'Dumbbell Bench Press',
  'bench press (dumbbell)': 'Dumbbell Bench Press',
  'decline bench press (bar)': 'Decline Bench Press',
  'decline bench press (barbell)': 'Decline Bench Press',

  // Squat & Deadlift
  'squat (bar)': 'Squat',
  'squat (barbell)': 'Squat',
  'barbell squat': 'Squat',
  'squat': 'Squat',
  'squat (smith machine)': 'Smith Squat',
  'deadlift (bar)': 'Barbell Deadlift',
  'deadlift (barbell)': 'Barbell Deadlift',
  'deadlift': 'Barbell Deadlift',
  'deadlift (dambıl)': 'Dumbbell Deadlift',
  'deadlift (dambil)': 'Dumbbell Deadlift',
  'deadlift (dumbbell)': 'Dumbbell Deadlift',
  'romanian deadlift (bar)': 'Romanian Deadlift',
  'romanian deadlift (barbell)': 'Romanian Deadlift',
  'romanian deadlift (dambıl)': 'Dumbbell Romanian Deadlift',
  'romanian deadlift (dambil)': 'Dumbbell Romanian Deadlift',
  'romanian deadlift (dumbbell)': 'Dumbbell Romanian Deadlift',

  // Rows & Pulls
  'bent over row (bar)': 'Barbell Row',
  'bent over row (barbell)': 'Barbell Row',
  'bent over barbell row': 'Barbell Row',
  'barbell row': 'Barbell Row',
  'barfiks': 'Pull Up',
  'pull up': 'Pull Up',
  'pull up (bodyweight)': 'Pull Up',
  'şınav': 'Push Up',
  'sinav': 'Push Up',
  'lat pulldown (cable)': 'Lat Pulldown',
  'lat pulldown (makine)': 'Lat Pulldown',
  'lat pulldown (machine)': 'Lat Pulldown',
  'lat pulldown': 'Lat Pulldown',
  'seated cable row - v grip (cable)': 'Seated Cable Row',
  'oturarak cable row - v tutuş': 'Seated Cable Row',
  'oturarak cable row - v tutus': 'Seated Cable Row',
  'oturarak cable row': 'Seated Cable Row',
  'seated cable row': 'Seated Cable Row',

  // Shoulders
  'overhead press (bar)': 'Overhead Press',
  'overhead press (barbell)': 'Overhead Press',
  'overhead press': 'Overhead Press',
  'overhead press (dambıl)': 'Shoulder Press',
  'overhead press (dambil)': 'Shoulder Press',
  'overhead press (dumbbell)': 'Shoulder Press',
  'shoulder press (dambıl)': 'Shoulder Press',
  'shoulder press (dambil)': 'Shoulder Press',
  'shoulder press (dumbbell)': 'Shoulder Press',
  'oturarak shoulder press (makine)': 'Shoulder Press',
  'seated machine shoulder press': 'Shoulder Press',
  'lateral raise (dambıl)': 'Dumbbell Lateral Raise',
  'lateral raise (dambil)': 'Dumbbell Lateral Raise',
  'lateral raise (dumbbell)': 'Dumbbell Lateral Raise',
  'lateral raise': 'Dumbbell Lateral Raise',
  'oturarak lateral raise (dambıl)': 'Dumbbell Seated Lateral Raise',
  'oturarak lateral raise (dambil)': 'Dumbbell Seated Lateral Raise',
  'seated lateral raise': 'Dumbbell Seated Lateral Raise',
  'rear delt reverse fly (makine)': 'Rear Delt Fly',
  'rear delt reverse fly (machine)': 'Rear Delt Fly',
  'rear delt reverse fly (cable)': 'Rear Delt Fly',
  'reverse fly (cable)': 'Rear Delt Fly',
  'rear delt fly': 'Rear Delt Fly',

  // Arms: Biceps & Triceps
  'bicep curl (dambıl)': 'Dumbbell Curl',
  'bicep curl (dambil)': 'Dumbbell Curl',
  'bicep curl (dumbbell)': 'Dumbbell Curl',
  'bicep curl (bar)': 'Barbell Curl',
  'bicep curl (barbell)': 'Barbell Curl',
  'bicep curl (cable)': 'Cable Curl',
  'hammer curl (dambıl)': 'Hammer Curl',
  'hammer curl (dambil)': 'Hammer Curl',
  'hammer curl (dumbbell)': 'Hammer Curl',
  'hammer curl': 'Hammer Curl',
  'oturarak incline curl (dambıl)': 'Incline Dumbbell Curl',
  'oturarak incline curl (dambil)': 'Incline Dumbbell Curl',
  'incline dumbbell curl': 'Incline Dumbbell Curl',
  'ez bar biceps curl': 'EZ Bar Curl',
  'ez bar curl': 'EZ Bar Curl',
  'triceps pushdown': 'Triceps Pushdown',
  'triceps rope pushdown': 'Triceps Pushdown',
  'tricep pushdown': 'Triceps Pushdown',
  'triceps extension (dambıl)': 'Triceps Extension',
  'triceps extension (dambil)': 'Triceps Extension',
  'dumbbell triceps extension': 'Triceps Extension',
  'triceps extension (cable)': 'Cable Overhead Triceps Extension (Rope Attachment)',
  'overhead triceps extension (cable)': 'Cable Overhead Triceps Extension (Rope Attachment)',
  'cable overhead triceps extension': 'Cable Overhead Triceps Extension (Rope Attachment)',
  'skullcrusher (bar)': 'Skull Crusher',
  'skullcrusher (barbell)': 'Skull Crusher',
  'skullcrusher (dambıl)': 'Skull Crusher',
  'skullcrusher (dambil)': 'Skull Crusher',
  'skullcrusher': 'Skull Crusher',

  // Chest Flies
  'butterfly (pec deck)': 'Pec Deck',
  'chest fly (makine)': 'Pec Deck',
  'pec deck': 'Pec Deck',
  'pec deck / machine fly': 'Pec Deck',
  'incline chest fly (dambıl)': 'Dumbbell Incline Fly',
  'incline chest fly (dambil)': 'Dumbbell Incline Fly',
  'incline chest fly (dumbbell)': 'Dumbbell Incline Fly',
  'chest fly (dambıl)': 'Dumbbell Fly',
  'chest fly (dambil)': 'Dumbbell Fly',
  'chest fly (dumbbell)': 'Dumbbell Fly',
  'low cable fly crossovers': 'Cable Crossover',
  'cable crossover': 'Cable Crossover',

  // Legs
  'leg press (makine)': 'Leg Press',
  'leg press horizontal (makine)': 'Leg Press',
  'leg press': 'Leg Press',
  'leg extension (makine)': 'Leg Extension',
  'leg extension': 'Leg Extension',
  'oturarak leg curl (makine)': 'Seated Leg Curl',
  'lying leg curl (makine)': 'Lying Leg Curl',
  'ayakta calf raise (makine)': 'Standing Calf Raise',
  'ayakta calf raise (halter)': 'Standing Calf Raise',
  'calf press (makine)': 'Standing Calf Raise',
  'oturarak calf raise': 'Seated Calf Raise',
  'seated calf raise': 'Seated Calf Raise',
};

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

  // 1. Check Turkish-to-Canonical dictionary first
  if (TURKISH_HEVY_EXERCISE_MAP[rawTrimmed]) {
    const canonicalTarget = TURKISH_HEVY_EXERCISE_MAP[rawTrimmed].toLowerCase();
    const exactTarget = catalog.find((e) => e.name.toLowerCase() === canonicalTarget);
    if (exactTarget) return exactTarget;
    const partialTarget = catalog.find(
      (e) =>
        e.name.toLowerCase().includes(canonicalTarget) ||
        canonicalTarget.includes(e.name.toLowerCase()),
    );
    if (partialTarget) return partialTarget;
  }

  // 2. Translate generic Turkish terminology (e.g. "(Bar)" -> "(Barbell)", "Barfiks" -> "Pull Up")
  const translated = translateTurkishExerciseTerms(hevyName);
  const translatedLower = translated.toLowerCase();
  if (TURKISH_HEVY_EXERCISE_MAP[translatedLower]) {
    const canonicalTarget = TURKISH_HEVY_EXERCISE_MAP[translatedLower].toLowerCase();
    const exactTarget = catalog.find((e) => e.name.toLowerCase() === canonicalTarget);
    if (exactTarget) return exactTarget;
  }

  // 3. Exact case-insensitive match on original and translated name
  for (const ex of catalog) {
    const exLower = ex.name.trim().toLowerCase();
    if (exLower === rawTrimmed || exLower === translatedLower) {
      return ex;
    }
  }

  const normalized = normalizeExerciseName(translated);
  const words = normalized.split(' ').filter(Boolean).sort().join(' ');
  const stripped = stripEquipmentTokens(translated);

  // 4. Normalized match
  for (const ex of catalog) {
    if (normalizeExerciseName(ex.name) === normalized) {
      return ex;
    }
  }

  // 5. Word token set equality (e.g. "Bench Press (Barbell)" vs "Barbell Bench Press")
  for (const ex of catalog) {
    const exWords = normalizeExerciseName(ex.name).split(' ').filter(Boolean).sort().join(' ');
    if (exWords === words) {
      return ex;
    }
  }

  // 6. Match stripped equipment names if equipment is identical
  if (stripped.length > 2) {
    for (const ex of catalog) {
      const exStripped = stripEquipmentTokens(ex.name);
      if (exStripped === stripped) {
        return ex;
      }
    }
  }

  // 7. Substring overlap match
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
