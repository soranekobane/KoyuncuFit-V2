import 'fake-indexeddb/auto';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { isSupabaseConfigured, supabase } from '../src/lib/supabase.ts';
import {
  cloudSignUp,
  cloudSignIn,
  cloudSaveWorkout,
  cloudSaveRoutine,
  cloudFetchPublicUsers,
} from '../src/lib/cloudDb.ts';
import { db, type Workout, type Routine } from '../src/db.ts';

describe('Supabase Client & Cloud Sync Architecture', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('safely initializes Supabase client without crashing even without env credentials', () => {
    assert.equal(typeof isSupabaseConfigured(), 'boolean');
    assert.ok(supabase, 'Supabase client must be initialized');
    assert.equal(typeof supabase.from, 'function', 'Supabase client must expose .from() table builder');
    assert.equal(typeof supabase.auth, 'object', 'Supabase client must expose .auth');
  });

  it('verifies supabase/schema.sql exists and contains all required tables and RLS', () => {
    const schemaPath = resolve(process.cwd(), 'supabase/schema.sql');
    assert.ok(existsSync(schemaPath), 'supabase/schema.sql must exist');

    const content = readFileSync(schemaPath, 'utf-8');
    assert.ok(content.includes('CREATE TABLE IF NOT EXISTS public.users'), 'Must define public.users');
    assert.ok(content.includes('CREATE TABLE IF NOT EXISTS public.routines'), 'Must define public.routines');
    assert.ok(content.includes('CREATE TABLE IF NOT EXISTS public.workouts'), 'Must define public.workouts');
    assert.ok(content.includes('CREATE TABLE IF NOT EXISTS public.follows'), 'Must define public.follows');
    assert.ok(content.includes('ENABLE ROW LEVEL SECURITY'), 'Must enable RLS');
  });

  it('signs up athlete via cloudDb and stores safe user record', async () => {
    const user = await cloudSignUp({
      username: 'cloud_athlete',
      name: 'Cloud Athlete',
      gender: 'female',
      age: 26,
      weightKg: 65,
      heightCm: 172,
      bodyFatPercentage: 18,
      pin: '7788',
    });

    assert.ok(user.id);
    assert.equal(user.username, 'cloud_athlete');
    assert.equal(user.hasPin, true);

    // Verify sign in
    const signedIn = await cloudSignIn('cloud_athlete', '7788');
    assert.equal(signedIn.id, user.id);
    assert.equal(signedIn.name, 'Cloud Athlete');

    // Wrong PIN rejects
    await assert.rejects(
      async () => {
        await cloudSignIn('cloud_athlete', '0000');
      },
      /Incorrect username or Password \/ PIN/,
    );
  });

  it('saves and scopes cloud workouts and routines', async () => {
    const user = await cloudSignUp({
      username: 'lifter_cloud',
      name: 'Lifter Cloud',
      gender: 'male',
      age: 24,
      weightKg: 82,
      heightCm: 183,
      pin: '1234',
    });

    const workout: Workout = {
      id: 'wkt_test_1',
      userId: user.id,
      name: 'Leg Day Blast',
      startedAt: Date.now() - 3600000,
      endedAt: Date.now(),
      durationSec: 3600,
      notes: 'Heavy squats',
      exercises: [],
      exerciseIds: [1, 2],
      totalVolume: 5000,
      totalSets: 12,
      caloriesBurned: 420,
    };

    await cloudSaveWorkout(workout);
    const storedWorkout = await db.workouts.get('wkt_test_1');
    assert.ok(storedWorkout);
    assert.equal(storedWorkout.name, 'Leg Day Blast');
    assert.equal(storedWorkout.userId, user.id);

    const routine: Routine = {
      id: 'rtn_test_1',
      userId: user.id,
      name: 'Push Routine',
      exercises: [],
      order: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await cloudSaveRoutine(routine);
    const storedRoutine = await db.routines.get('rtn_test_1');
    assert.ok(storedRoutine);
    assert.equal(storedRoutine.name, 'Push Routine');
  });

  it('fetches registered athletes in public directory', async () => {
    await cloudSignUp({
      username: 'athlete_one',
      name: 'Athlete One',
      gender: 'male',
      age: 22,
      weightKg: 70,
      heightCm: 175,
      pin: '1234',
    });

    const publicUsers = await cloudFetchPublicUsers();
    assert.ok(publicUsers.length >= 1);
    const found = publicUsers.find((u) => u.username === 'athlete_one');
    assert.ok(found);
    assert.equal(found.name, 'Athlete One');
    // Ensure biometrics are not exposed
    assert.equal((found as unknown as Record<string, unknown>).weightKg, undefined);
  });
});
