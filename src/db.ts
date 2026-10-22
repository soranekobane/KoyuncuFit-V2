import Dexie, { type EntityTable } from 'dexie';
import { exercisesCatalog } from './data/exercisesCatalog';

// ───────────────────────── Types ─────────────────────────

export const MUSCLE_GROUPS = ['Chest', 'Back', 'Legs', 'Shoulders', 'Biceps', 'Triceps', 'Core'] as const;
export const EQUIPMENT = ['Barbell', 'Dumbbell', 'Machine', 'Cable', 'Bodyweight'] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
export type Equipment = (typeof EQUIPMENT)[number];
export type SetType = 'normal' | 'warmup' | 'drop' | 'failure';
export type Id = string | number;

export interface User {
  id: Id;
  username: string;
  name: string;
  /** @deprecated Legacy plaintext PIN. Migrated to pinHash on first launch/login; never written by new code. */
  pin?: string;
  /** PBKDF2-SHA256 hash of the PIN (base64). */
  pinHash?: string;
  /** Random per-user salt for pinHash (base64). */
  pinSalt?: string;
  gender: 'male' | 'female';
  age: number;
  weightKg: number;
  heightCm: number;
  bodyFatPercentage?: number;
  avatarColor: string;
  createdAt: number;
  /** Workout history visible to other athletes (compare + friend profile). Default: true. */
  shareWorkouts?: boolean;
  /** Routines visible to other athletes. Must be explicitly enabled. Default: false. */
  shareRoutines?: boolean;
}

/** The signed-in user's own record, with credential material removed. */
export type SafeUser = Omit<User, 'pin' | 'pinHash' | 'pinSalt'> & { hasPin: boolean };

/** What other athletes may see in the directory. No credentials, no body measurements. */
export interface PublicUser {
  id: Id;
  username: string;
  name: string;
  avatarColor: string;
  createdAt: number;
  hasPin: boolean;
  shareWorkouts: boolean;
  shareRoutines: boolean;
}

export function userHasPin(u: Pick<User, 'pin' | 'pinHash'>): boolean {
  return !!(u.pinHash || (u.pin && u.pin.trim() !== ''));
}

export function toSafeUser(u: User): SafeUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { pin: _pin, pinHash: _hash, pinSalt: _salt, ...rest } = u;
  return { ...rest, hasPin: userHasPin(u) };
}

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    avatarColor: u.avatarColor,
    createdAt: u.createdAt,
    hasPin: userHasPin(u),
    shareWorkouts: u.shareWorkouts !== false,
    shareRoutines: u.shareRoutines === true,
  };
}

export interface Exercise {
  id: number;
  name: string;
  muscleGroup: MuscleGroup;
  equipment: Equipment;
  isCustom: boolean;
  createdAt: number;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  metValue: number;
  thumbnailUrl?: string;
  gifUrl?: string;
  instructions?: string[];
}

export interface RoutineExercise {
  uid: string;
  exerciseId: number;
  sets: number;
  reps: number;
  restSeconds: number;
  notes?: string;
}

export interface Routine {
  id: Id;
  userId: Id;
  name: string;
  exercises: RoutineExercise[];
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface WorkoutSet {
  uid: string;
  type: SetType;
  weight: number;
  reps: number;
}

export interface WorkoutExercise {
  uid: string;
  exerciseId: number;
  name: string;
  muscleGroup: MuscleGroup;
  equipment: Equipment;
  restSeconds: number;
  notes: string;
  sets: WorkoutSet[];
}

export interface Workout {
  id: Id;
  userId: Id;
  name: string;
  routineId?: Id;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  notes: string;
  exercises: WorkoutExercise[];
  /** multiEntry index for fast "previous performance" lookups */
  exerciseIds: number[];
  totalVolume: number;
  totalSets: number;
  caloriesBurned?: number;
}

export interface Follow {
  id: Id;
  followerId: Id;
  followingId: Id;
  createdAt: number;
}

// ───────────────────────── Database ─────────────────────────

export const db = new Dexie('LiftWorkoutTracker') as Dexie & {
  users: EntityTable<User, 'id'>;
  exercises: EntityTable<Exercise, 'id'>;
  routines: EntityTable<Routine, 'id'>;
  workouts: EntityTable<Workout, 'id'>;
  follows: EntityTable<Follow, 'id'>;
};

// Version 1 (legacy schema)
db.version(1).stores({
  exercises: '++id, name, muscleGroup, equipment, isCustom',
  routines: '++id, name, order',
  workouts: '++id, startedAt, routineId, *exerciseIds',
});

// Version 2 (multi-user accounts & biometric upgrades)
db.version(2)
  .stores({
    users: '++id, username, createdAt',
    exercises: '++id, name, muscleGroup, equipment, isCustom',
    routines: '++id, userId, name, order',
    workouts: '++id, userId, startedAt, routineId, *exerciseIds',
  })
  .upgrade(async (tx) => {
    const usersTable = tx.table('users');
    const existingCount = await usersTable.count();
    let defaultUserId = 1;
    if (existingCount === 0) {
      defaultUserId = (await usersTable.add({
        username: 'athlete',
        name: 'Athlete',
        gender: 'male',
        age: 26,
        weightKg: 78,
        heightCm: 180,
        bodyFatPercentage: 15,
        avatarColor: '#3b82f6',
        createdAt: Date.now(),
      })) as number;
    }
    await tx
      .table('routines')
      .toCollection()
      .modify((r: Partial<Routine>) => {
        if (!r.userId) r.userId = defaultUserId;
      });
    await tx
      .table('workouts')
      .toCollection()
      .modify((w: Partial<Workout>) => {
        if (!w.userId) w.userId = defaultUserId;
        if (!w.caloriesBurned) {
          // retroactively estimate approx 5 kcal per minute
          w.caloriesBurned = Math.round(((w.durationSec ?? 3600) / 60) * 5 + (w.totalVolume ?? 0) * 0.008);
        }
      });
  });

// Version 3 (KoyuncuFit social & friend comparison)
db.version(3).stores({
  users: '++id, username, createdAt',
  exercises: '++id, name, muscleGroup, equipment, isCustom',
  routines: '++id, userId, name, order',
  workouts: '++id, userId, startedAt, routineId, *exerciseIds',
  follows: '++id, followerId, followingId, [followerId+followingId]',
});

// Version 4 (hasaneyldrm/exercises-dataset upgrade: 1,324+ exercises with GIF animations & full anatomy mappings)
db.version(4)
  .stores({
    users: '++id, username, createdAt',
    exercises: '++id, name, muscleGroup, equipment, isCustom',
    routines: '++id, userId, name, order',
    workouts: '++id, userId, startedAt, routineId, *exerciseIds',
    follows: '++id, followerId, followingId, [followerId+followingId]',
  })
  .upgrade(async (tx) => {
    const exTable = tx.table('exercises');
    // Preserve custom exercises created by user
    const customExercises = await exTable.filter((e: Exercise) => !!e.isCustom).toArray();
    await exTable.clear();
    await exTable.bulkAdd(seedExercises);
    if (customExercises.length > 0) {
      await exTable.bulkAdd(customExercises);
    }
  });


// ───────────────────────── Seed Data ─────────────────────────

export const DEFAULT_USER: Omit<User, 'id'> = {
  username: 'athlete',
  name: 'Athlete',
  gender: 'male',
  age: 26,
  weightKg: 78,
  heightCm: 180,
  bodyFatPercentage: 15,
  avatarColor: '#3b82f6',
  createdAt: Date.now(),
};

export const seedExercises: Exercise[] = exercisesCatalog;

db.on('populate', (tx) => {
  // Clean slate KoyuncuFit startup: seed full 1,324+ exercise catalog with GIF animations.
  // No prepopulated routines and no default users!
  tx.table('exercises').bulkAdd(seedExercises);
});

// ───────────────────────── Backup & Restore ─────────────────────────

export interface BackupFile {
  app: 'koyuncu-fit';
  version: 3 | 4;
  exportedAt: string;
  /** v4: only the exporting account's profile (no credentials). Older files may contain all users. */
  users?: Array<Partial<User>>;
  exercises: Exercise[];
  routines: Routine[];
  workouts: Workout[];
}

/** Export ONE account's data. Never includes other accounts or PIN material. */
export async function exportBackup(userId: Id): Promise<BackupFile> {
  const [user, exercises, routines, workouts] = await Promise.all([
    db.users.get(userId),
    db.exercises.toArray(),
    db.routines.where('userId').equals(userId).toArray(),
    db.workouts.where('userId').equals(userId).toArray(),
  ]);
  if (!user) throw new Error('Account not found.');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { pin: _p, pinHash: _h, pinSalt: _s, ...profile } = user;
  return {
    app: 'koyuncu-fit',
    version: 4,
    exportedAt: new Date().toISOString(),
    users: [profile],
    exercises,
    routines,
    workouts,
  };
}

/**
 * Non-destructive import into the signed-in account.
 * - Never clears or overwrites other accounts, routines or workouts.
 * - Adds exercises that don't exist yet; existing library entries are kept.
 * - Routines/workouts are re-keyed to `userId`; workouts already present (same startedAt) are skipped.
 */
export async function importBackup(
  data: unknown,
  userId: Id,
): Promise<{ workouts: number; routines: number; exercises: number; skipped: number }> {
  const d = data as Partial<BackupFile>;
  if (!d || typeof d !== 'object' || !Array.isArray(d.exercises) || !Array.isArray(d.workouts) || !Array.isArray(d.routines)) {
    throw new Error('Invalid backup file.');
  }
  if (!(await db.users.get(userId))) throw new Error('Sign in before importing a backup.');

  let addedEx = 0;
  let addedRoutines = 0;
  let addedWorkouts = 0;
  let skipped = 0;

  await db.transaction('rw', db.exercises, db.routines, db.workouts, async () => {
    for (const ex of d.exercises as Exercise[]) {
      if (ex && typeof ex.id === 'number' && !(await db.exercises.get(ex.id))) {
        await db.exercises.put(ex);
        addedEx++;
      }
    }

    const existingStarts = new Set(
      (await db.workouts.where('userId').equals(userId).toArray()).map((w) => w.startedAt),
    );
    for (const w of d.workouts as Workout[]) {
      if (!w || !Array.isArray(w.exercises) || existingStarts.has(w.startedAt)) {
        skipped++;
        continue;
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, ...rest } = w;
      await db.workouts.add({
        ...rest,
        userId,
        exerciseIds: w.exerciseIds ?? Array.from(new Set(w.exercises.map((e) => e.exerciseId))),
      } as Workout);
      existingStarts.add(w.startedAt);
      addedWorkouts++;
    }

    let order = await db.routines.where('userId').equals(userId).count();
    for (const r of d.routines as Routine[]) {
      if (!r || !Array.isArray(r.exercises)) continue;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, ...rest } = r;
      await db.routines.add({ ...rest, userId, order: order++ } as Routine);
      addedRoutines++;
    }
  });

  return { workouts: addedWorkouts, routines: addedRoutines, exercises: addedEx, skipped };
}
