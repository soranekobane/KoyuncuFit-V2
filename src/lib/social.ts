/**
 * Social data-access layer. Every read of ANOTHER athlete's data goes through here so the
 * privacy rules are applied in one place:
 *   - Workouts (history, compare, counts): visible unless the owner turned `shareWorkouts` off.
 *   - Routines: visible only if the owner explicitly enabled `shareRoutines`.
 *   - Body measurements / credentials: never returned for other users (see toPublicUser).
 *
 * Device-local only — see the note at the top of lib/auth.ts.
 */
import { db, toPublicUser, type PublicUser, type Routine, type User, type Workout } from '../db';
import { epley1RM, fmtNum, isWorkingSet } from './utils';

export function canViewWorkouts(viewerId: number, owner: Pick<User, 'id' | 'shareWorkouts'>): boolean {
  return viewerId === owner.id || owner.shareWorkouts !== false;
}

export function canViewRoutines(viewerId: number, owner: Pick<User, 'id' | 'shareRoutines'>): boolean {
  return viewerId === owner.id || owner.shareRoutines === true;
}

export async function listPublicUsers(): Promise<PublicUser[]> {
  return (await db.users.toArray()).map(toPublicUser);
}

export async function getVisibleWorkouts(viewerId: number, ownerId: number): Promise<Workout[] | null> {
  const owner = await db.users.get(ownerId);
  if (!owner || !canViewWorkouts(viewerId, owner)) return null;
  const list = await db.workouts.where('userId').equals(ownerId).toArray();
  return list.sort((a, b) => b.startedAt - a.startedAt);
}

export async function getVisibleRoutines(viewerId: number, ownerId: number): Promise<Routine[] | null> {
  const owner = await db.users.get(ownerId);
  if (!owner || !canViewRoutines(viewerId, owner)) return null;
  return db.routines.where('userId').equals(ownerId).sortBy('order');
}

/** Workout counts per user; `null` when that athlete keeps workouts private. */
export async function getVisibleWorkoutCounts(viewerId: number): Promise<Map<number, number | null>> {
  const users = await db.users.toArray();
  const out = new Map<number, number | null>();
  for (const u of users) {
    out.set(u.id, canViewWorkouts(viewerId, u) ? await db.workouts.where('userId').equals(u.id).count() : null);
  }
  return out;
}

// ───────────────────────── Follows ─────────────────────────

export async function follow(viewerId: number, targetId: number): Promise<boolean> {
  if (viewerId === targetId) return false;
  if (!(await db.users.get(targetId))) throw new Error('Athlete not found.');
  const existing = await db.follows.where({ followerId: viewerId, followingId: targetId }).first();
  if (existing) return false;
  await db.follows.add({ followerId: viewerId, followingId: targetId, createdAt: Date.now() });
  return true;
}

export async function unfollow(viewerId: number, targetId: number): Promise<void> {
  await db.follows.where({ followerId: viewerId, followingId: targetId }).delete();
}

export async function followCounts(userId: number): Promise<{ followers: number; following: number }> {
  const [followers, following] = await Promise.all([
    db.follows.where('followingId').equals(userId).count(),
    db.follows.where('followerId').equals(userId).count(),
  ]);
  return { followers, following };
}

// ───────────────────────── Strength comparison ─────────────────────────

export interface AthleteExerciseStats {
  best1RM: number;
  maxWeight: number;
  bestSetVolume: number;
  bestSetDesc: string;
  totalSets: number;
  sessionCount: number;
}

export const EMPTY_STATS: AthleteExerciseStats = {
  best1RM: 0, maxWeight: 0, bestSetVolume: 0, bestSetDesc: '—', totalSets: 0, sessionCount: 0,
};

/** Stats for one exercise, matched strictly by exerciseId. Warm-up sets are ignored. */
export function calculateAthleteStats(workouts: Workout[], exerciseId: number): AthleteExerciseStats {
  const s: AthleteExerciseStats = { ...EMPTY_STATS };
  for (const w of workouts) {
    const ex = w.exercises.find((e) => e.exerciseId === exerciseId);
    if (!ex) continue;
    s.sessionCount++;
    for (const set of ex.sets) {
      if (!isWorkingSet(set.type)) continue;
      s.totalSets++;
      s.best1RM = Math.max(s.best1RM, epley1RM(set.weight, set.reps));
      s.maxWeight = Math.max(s.maxWeight, set.weight);
      const vol = (set.weight || 0) * (set.reps || 0);
      if (vol > s.bestSetVolume) {
        s.bestSetVolume = vol;
        s.bestSetDesc = `${fmtNum(set.weight, 1)}kg × ${set.reps}`;
      }
    }
  }
  return s;
}

export interface MetricComparison {
  uVal: number;
  fVal: number;
  uPct: number;
  fPct: number;
  deltaVal: number;
  /** % difference of you vs friend, relative to friend. null when friend has no data. */
  deltaPct: number | null;
  unit: string;
}

export function compareMetric(uVal: number, fVal: number, unit = 'kg'): MetricComparison {
  const maxVal = Math.max(uVal, fVal, 1);
  const pct = (v: number) => (v > 0 ? Math.max(8, Math.round((v / maxVal) * 100)) : 0);
  return {
    uVal,
    fVal,
    uPct: pct(uVal),
    fPct: pct(fVal),
    deltaVal: uVal - fVal,
    deltaPct: fVal > 0 ? Math.round(((uVal - fVal) / fVal) * 100) : null,
    unit,
  };
}
