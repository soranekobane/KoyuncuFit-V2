/**
 * KoyuncuFit Cloud Database & Auth Service powered by Supabase.
 *
 * Provides real-time cross-device synchronization between mobile (iOS/Android)
 * and web browsers, while maintaining local-first speed and offline resilience.
 */
import { isSupabaseConfigured, supabase } from './supabase';
import {
  db,
  toPublicUser,
  toSafeUser,
  type Id,
  type PublicUser,
  type Routine,
  type SafeUser,
  type User,
  type Workout,
} from '../db';
import {
  authenticate,
  authenticateById,
  deleteOwnAccount,
  hashPin,
  MIN_PIN_LENGTH,
  registerAccount,
  updateProfile,
  verifyPin,
  type ProfilePatch,
  type RegisterInput,
} from './auth';

// ───────────────────────── Helpers ─────────────────────────

function toUserFromSupabase(row: Record<string, any>): User {
  return {
    id: String(row.id),
    username: String(row.username),
    name: String(row.name),
    gender: (row.gender as 'male' | 'female') || 'male',
    age: Number(row.age) || 25,
    weightKg: Number(row.weight_kg) || 75,
    heightCm: Number(row.height_cm) || 178,
    bodyFatPercentage: row.body_fat_percentage != null ? Number(row.body_fat_percentage) : 15,
    avatarColor: String(row.avatar_color || '#3b82f6'),
    pinHash: row.pin_hash || undefined,
    pinSalt: row.pin_salt || undefined,
    createdAt: Number(row.created_at) || Date.now(),
    shareWorkouts: row.share_workouts !== false,
    shareRoutines: row.share_routines === true,
  };
}

function toWorkoutFromSupabase(row: Record<string, any>): Workout {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    routineId: row.routine_id ? String(row.routine_id) : undefined,
    startedAt: Number(row.started_at),
    endedAt: Number(row.ended_at),
    durationSec: Number(row.duration_sec) || 0,
    notes: String(row.notes || ''),
    exercises: Array.isArray(row.exercises) ? row.exercises : [],
    exerciseIds: Array.isArray(row.exercise_ids) ? row.exercise_ids : [],
    totalVolume: Number(row.total_volume) || 0,
    totalSets: Number(row.total_sets) || 0,
    caloriesBurned: row.calories_burned != null ? Number(row.calories_burned) : undefined,
  };
}

function toRoutineFromSupabase(row: Record<string, any>): Routine {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    exercises: Array.isArray(row.exercises) ? row.exercises : [],
    order: Number(row.display_order) || 0,
    createdAt: Number(row.created_at) || Date.now(),
    updatedAt: Number(row.updated_at) || Date.now(),
  };
}

// ───────────────────────── Auth & Registration ─────────────────────────

export async function cloudSignUp(input: RegisterInput): Promise<SafeUser> {
  const pin = (input.pin ?? '').trim();
  if (pin.length < MIN_PIN_LENGTH) {
    throw new Error(`Password / PIN must be at least ${MIN_PIN_LENGTH} characters.`);
  }

  // If Supabase is active, check unique username and write to cloud
  if (isSupabaseConfigured()) {
    const { data: existing, error: checkErr } = await supabase
      .from('users')
      .select('id')
      .ilike('username', input.username.trim())
      .maybeSingle();

    if (!checkErr && existing) {
      throw new Error(`Username “${input.username}” is already taken.`);
    }

    const { hash, salt } = await hashPin(pin);
    const userId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `usr_${Date.now()}`;
    const now = Date.now();

    const cloudPayload = {
      id: userId,
      username: input.username.trim(),
      name: input.name.trim(),
      gender: input.gender,
      age: input.age,
      weight_kg: input.weightKg,
      height_cm: input.heightCm,
      body_fat_percentage: input.bodyFatPercentage ?? 15,
      avatar_color: input.avatarColor || '#3b82f6',
      pin_hash: hash,
      pin_salt: salt,
      share_workouts: true,
      share_routines: false,
      created_at: now,
      updated_at: now,
    };

    const { error: insertErr } = await supabase.from('users').insert(cloudPayload);
    if (insertErr) {
      // If network fails, log and proceed with local storage
      console.warn('Supabase registration insert warning:', insertErr.message);
    }

    const localUser: User = {
      id: userId,
      username: input.username.trim(),
      name: input.name.trim(),
      gender: input.gender,
      age: input.age,
      weightKg: input.weightKg,
      heightCm: input.heightCm,
      bodyFatPercentage: input.bodyFatPercentage ?? 15,
      avatarColor: input.avatarColor || '#3b82f6',
      pinHash: hash,
      pinSalt: salt,
      createdAt: now,
      shareWorkouts: true,
      shareRoutines: false,
    };

    await db.users.put(localUser as unknown as any);
    return toSafeUser(localUser);
  }

  // Fallback to local Dexie registration
  return registerAccount(input);
}

export async function cloudSignIn(username: string, pin: string): Promise<SafeUser> {
  const trimmedUser = username.trim();
  const trimmedPin = pin.trim();

  if (isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .ilike('username', trimmedUser)
      .maybeSingle();

    if (!error && data) {
      const cloudUser = toUserFromSupabase(data);
      const isMatch = await verifyPin(cloudUser, trimmedPin);
      if (!isMatch) {
        throw new Error('Incorrect username or Password / PIN.');
      }

      // Store / update user in local Dexie cache
      await db.users.put(cloudUser as unknown as any);

      // Asynchronously sync cloud workouts, routines, and follows down to local store
      void cloudPullUserData(cloudUser.id).catch((err) => {
        console.warn('Cloud sync error after sign-in:', err);
      });

      return toSafeUser(cloudUser);
    }
  }

  // Fallback to local Dexie auth
  return authenticate(trimmedUser, trimmedPin);
}

export async function cloudSignInById(userId: Id, pin?: string): Promise<SafeUser> {
  if (isSupabaseConfigured()) {
    const { data } = await supabase.from('users').select('*').eq('id', String(userId)).maybeSingle();
    if (data) {
      const cloudUser = toUserFromSupabase(data);
      const isMatch = await verifyPin(cloudUser, pin);
      if (!isMatch) throw new Error('Incorrect Password / PIN.');
      await db.users.put(cloudUser as unknown as any);
      void cloudPullUserData(cloudUser.id);
      return toSafeUser(cloudUser);
    }
  }
  return authenticateById(userId, pin);
}

export async function cloudDeleteOwnAccount(actorId: Id, targetId: Id, pin: string | undefined): Promise<void> {
  if (actorId !== targetId) throw new Error('You can only delete your own account.');

  if (isSupabaseConfigured()) {
    const { data: userRow } = await supabase.from('users').select('*').eq('id', String(targetId)).maybeSingle();
    if (userRow) {
      const user = toUserFromSupabase(userRow);
      if (!(await verifyPin(user, pin))) throw new Error('Incorrect Password / PIN.');
      // Cascades to routines, workouts, follows via foreign key ON DELETE CASCADE
      await supabase.from('users').delete().eq('id', String(targetId));
    }
  }

  // Also remove from local database
  await deleteOwnAccount(actorId, targetId, pin);
}

export async function cloudUpdateProfile(actorId: Id, patch: ProfilePatch): Promise<void> {
  await updateProfile(actorId, patch);

  if (isSupabaseConfigured()) {
    const payload: Record<string, unknown> = { updated_at: Date.now() };
    if (patch.name !== undefined) payload.name = patch.name;
    if (patch.gender !== undefined) payload.gender = patch.gender;
    if (patch.age !== undefined) payload.age = patch.age;
    if (patch.weightKg !== undefined) payload.weight_kg = patch.weightKg;
    if (patch.heightCm !== undefined) payload.height_cm = patch.heightCm;
    if (patch.bodyFatPercentage !== undefined) payload.body_fat_percentage = patch.bodyFatPercentage;
    if (patch.avatarColor !== undefined) payload.avatar_color = patch.avatarColor;
    if (patch.shareWorkouts !== undefined) payload.share_workouts = patch.shareWorkouts;
    if (patch.shareRoutines !== undefined) payload.share_routines = patch.shareRoutines;

    await supabase.from('users').update(payload).eq('id', String(actorId));
  }
}

// ───────────────────────── Cloud Data Sync ─────────────────────────

export async function cloudPullUserData(userId: Id): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const uid = String(userId);

  try {
    // 1. Pull routines
    const { data: routines } = await supabase.from('routines').select('*').eq('user_id', uid);
    if (routines && routines.length > 0) {
      for (const r of routines) {
        await db.routines.put(toRoutineFromSupabase(r) as unknown as any);
      }
    }

    // 2. Pull workouts
    const { data: workouts } = await supabase.from('workouts').select('*').eq('user_id', uid);
    if (workouts && workouts.length > 0) {
      for (const w of workouts) {
        await db.workouts.put(toWorkoutFromSupabase(w) as unknown as any);
      }
    }

    // 3. Pull follows
    const { data: follows } = await supabase
      .from('follows')
      .select('*')
      .or(`follower_id.eq.${uid},following_id.eq.${uid}`);

    if (follows && follows.length > 0) {
      for (const f of follows) {
        await db.follows.put({
          id: f.id,
          followerId: f.follower_id,
          followingId: f.following_id,
          createdAt: Number(f.created_at),
        } as unknown as any);
      }
    }
  } catch (err) {
    console.warn('cloudPullUserData warning:', err);
  }
}

// ───────────────────────── Workouts ─────────────────────────

export async function cloudSaveWorkout(workout: Workout): Promise<void> {
  // Always save to local Dexie first for 0-latency UI feedback
  await db.workouts.put(workout as unknown as any);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('workouts').upsert({
        id: String(workout.id),
        user_id: String(workout.userId),
        name: workout.name,
        routine_id: workout.routineId ? String(workout.routineId) : null,
        started_at: workout.startedAt,
        ended_at: workout.endedAt,
        duration_sec: workout.durationSec,
        notes: workout.notes || '',
        exercises: workout.exercises,
        exercise_ids: workout.exerciseIds,
        total_volume: workout.totalVolume,
        total_sets: workout.totalSets,
        calories_burned: workout.caloriesBurned ?? 0,
        created_at: workout.startedAt,
      });
    } catch (err) {
      console.warn('cloudSaveWorkout sync error:', err);
    }
  }
}

export async function cloudDeleteWorkout(workoutId: Id, userId: Id): Promise<void> {
  await db.workouts.delete(workoutId as unknown as any);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('workouts').delete().eq('id', String(workoutId)).eq('user_id', String(userId));
    } catch (err) {
      console.warn('cloudDeleteWorkout sync error:', err);
    }
  }
}

// ───────────────────────── Routines ─────────────────────────

export async function cloudSaveRoutine(routine: Routine): Promise<void> {
  await db.routines.put(routine as unknown as any);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('routines').upsert({
        id: String(routine.id),
        user_id: String(routine.userId),
        name: routine.name,
        exercises: routine.exercises,
        display_order: routine.order,
        created_at: routine.createdAt,
        updated_at: routine.updatedAt,
      });
    } catch (err) {
      console.warn('cloudSaveRoutine sync error:', err);
    }
  }
}

export async function cloudDeleteRoutine(routineId: Id, userId: Id): Promise<void> {
  await db.routines.delete(routineId as unknown as any);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('routines').delete().eq('id', String(routineId)).eq('user_id', String(userId));
    } catch (err) {
      console.warn('cloudDeleteRoutine sync error:', err);
    }
  }
}

// ───────────────────────── Social Features ─────────────────────────

export async function cloudFetchPublicUsers(): Promise<PublicUser[]> {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, name, avatar_color, created_at, pin_hash, share_workouts, share_routines')
        .order('created_at', { ascending: false });

      if (!error && data) {
        const publicList: PublicUser[] = data.map((row) => ({
          id: String(row.id),
          username: String(row.username),
          name: String(row.name),
          avatarColor: String(row.avatar_color || '#3b82f6'),
          createdAt: Number(row.created_at) || Date.now(),
          hasPin: !!row.pin_hash,
          shareWorkouts: row.share_workouts !== false,
          shareRoutines: row.share_routines === true,
        }));

        // Mirror to local Dexie directory
        for (const pub of publicList) {
          const existing = await db.users.get(pub.id as unknown as any);
          if (!existing) {
            await db.users.put({
              id: pub.id,
              username: pub.username,
              name: pub.name,
              avatarColor: pub.avatarColor,
              createdAt: pub.createdAt,
              shareWorkouts: pub.shareWorkouts,
              shareRoutines: pub.shareRoutines,
              gender: 'male',
              age: 25,
              weightKg: 75,
              heightCm: 178,
            } as unknown as any);
          }
        }
        return publicList;
      }
    } catch (err) {
      console.warn('cloudFetchPublicUsers error:', err);
    }
  }

  // Fallback to local Dexie users
  return (await db.users.toArray()).map(toPublicUser);
}

export async function cloudFollow(followerId: Id, followingId: Id): Promise<boolean> {
  if (followerId === followingId) return false;
  const pairId = `${followerId}_${followingId}`;

  await db.follows.put({
    id: pairId,
    followerId,
    followingId,
    createdAt: Date.now(),
  } as unknown as any);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('follows').upsert({
        id: pairId,
        follower_id: String(followerId),
        following_id: String(followingId),
        created_at: Date.now(),
      });
    } catch (err) {
      console.warn('cloudFollow sync error:', err);
    }
  }
  return true;
}

export async function cloudUnfollow(followerId: Id, followingId: Id): Promise<void> {
  await db.follows
    .where('followerId')
    .equals(followerId)
    .and((f) => f.followingId === followingId)
    .delete();

  if (isSupabaseConfigured()) {
    try {
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', String(followerId))
        .eq('following_id', String(followingId));
    } catch (err) {
      console.warn('cloudUnfollow sync error:', err);
    }
  }
}

export async function cloudFetchFriendWorkouts(friendId: Id): Promise<Workout[] | null> {
  if (isSupabaseConfigured()) {
    try {
      // Respect friend's privacy toggle
      const { data: friendRow } = await supabase
        .from('users')
        .select('share_workouts')
        .eq('id', String(friendId))
        .maybeSingle();

      if (friendRow && friendRow.share_workouts === false) {
        return null; // Private
      }

      const { data: workouts, error } = await supabase
        .from('workouts')
        .select('*')
        .eq('user_id', String(friendId))
        .order('started_at', { ascending: false });

      if (!error && workouts) {
        const list = workouts.map(toWorkoutFromSupabase);
        // Cache to local Dexie so comparisons can compute with full detail
        for (const w of list) {
          await db.workouts.put(w as unknown as any);
        }
        return list;
      }
    } catch (err) {
      console.warn('cloudFetchFriendWorkouts error:', err);
    }
  }

  // Local fallback
  const friend = await db.users.get(friendId as unknown as any);
  if (!friend || friend.shareWorkouts === false) return null;
  return db.workouts.where('userId').equals(friendId).reverse().sortBy('startedAt');
}

export async function cloudFetchFriendRoutines(friendId: Id): Promise<Routine[] | null> {
  if (isSupabaseConfigured()) {
    try {
      const { data: friendRow } = await supabase
        .from('users')
        .select('share_routines')
        .eq('id', String(friendId))
        .maybeSingle();

      if (friendRow && friendRow.share_routines !== true) {
        return null; // Private by default
      }

      const { data: routines, error } = await supabase
        .from('routines')
        .select('*')
        .eq('user_id', String(friendId))
        .order('display_order', { ascending: true });

      if (!error && routines) {
        return routines.map(toRoutineFromSupabase);
      }
    } catch (err) {
      console.warn('cloudFetchFriendRoutines error:', err);
    }
  }

  // Local fallback
  const friend = await db.users.get(friendId as unknown as any);
  if (!friend || friend.shareRoutines !== true) return null;
  return db.routines.where('userId').equals(friendId).sortBy('order');
}
