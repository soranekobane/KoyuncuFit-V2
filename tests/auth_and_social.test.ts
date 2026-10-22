import 'fake-indexeddb/auto';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, toPublicUser, type User, type Workout } from '../src/db.ts';
import {
  hashPin,
  verifyPin,
  registerAccount,
  authenticate,
  authenticateById,
  deleteOwnAccount,
  MIN_PIN_LENGTH,
} from '../src/lib/auth.ts';
import {
  canViewWorkouts,
  canViewRoutines,
  compareMetric,
  calculateAthleteStats,
} from '../src/lib/social.ts';

describe('KoyuncuFit Auth & Account Isolation', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('verifies clean slate startup: zero routines and zero users seeded by default', async () => {
    const userCount = await db.users.count();
    const routineCount = await db.routines.count();
    const exerciseCount = await db.exercises.count();

    assert.equal(userCount, 0, 'Users table must start empty');
    assert.equal(routineCount, 0, 'Routines table must start empty');
    assert.ok(exerciseCount > 0, 'Exercise database should be seeded');
  });

  it('hashes and verifies PINs using PBKDF2-SHA256 with unique salts', async () => {
    const { hash: hash1, salt: salt1 } = await hashPin('1234');
    const { hash: hash2, salt: salt2 } = await hashPin('1234');

    assert.notEqual(salt1, salt2, 'Salts must be randomly generated and unique');
    assert.notEqual(hash1, hash2, 'Hashes of same PIN with different salts must differ');

    const testUser = {
      id: 1,
      pinHash: hash1,
      pinSalt: salt1,
    } as User;

    const valid = await verifyPin(testUser, '1234');
    const invalid = await verifyPin(testUser, '9999');

    assert.equal(valid, true, 'Correct PIN must verify');
    assert.equal(invalid, false, 'Incorrect PIN must fail');
  });

  it('enforces minimum PIN length during registration', async () => {
    await assert.rejects(
      async () => {
        await registerAccount({
          username: 'testuser',
          name: 'Test Athlete',
          gender: 'male',
          age: 25,
          weightKg: 75,
          heightCm: 180,
          pin: '12', // Less than MIN_PIN_LENGTH (4)
        });
      },
      (err: Error) => {
        assert.match(err.message, new RegExp(`Password / PIN must be at least ${MIN_PIN_LENGTH} characters`));
        return true;
      },
    );
  });

  it('registers an account and strips credentials from SafeUser projection', async () => {
    const safeUser = await registerAccount({
      username: 'yigit',
      name: 'Yiğit Koyuncu',
      gender: 'male',
      age: 23,
      weightKg: 80,
      heightCm: 185,
      pin: '1234',
    });

    assert.equal(safeUser.username, 'yigit');
    assert.equal(safeUser.hasPin, true);
    assert.equal((safeUser as unknown as Record<string, unknown>).pin, undefined);
    assert.equal((safeUser as unknown as Record<string, unknown>).pinHash, undefined);
    assert.equal((safeUser as unknown as Record<string, unknown>).pinSalt, undefined);

    // Verify stored user in db actually has hash
    const stored = await db.users.get(safeUser.id);
    assert.ok(stored);
    assert.ok(stored.pinHash);
    assert.ok(stored.pinSalt);
    assert.equal(stored.pin, undefined);
  });

  it('authenticates with correct credentials and rejects incorrect PIN', async () => {
    const user = await registerAccount({
      username: 'athlete1',
      name: 'Athlete One',
      gender: 'male',
      age: 22,
      weightKg: 70,
      heightCm: 175,
      pin: '5678',
    });

    const authed = await authenticate('athlete1', '5678');
    assert.equal(authed.id, user.id);

    await assert.rejects(
      async () => {
        await authenticate('athlete1', '0000');
      },
      /Incorrect username or Password \/ PIN/,
    );

    // Test authenticateById for switching
    const authedById = await authenticateById(user.id, '5678');
    assert.equal(authedById.id, user.id);

    await assert.rejects(
      async () => {
        await authenticateById(user.id, 'wrong');
      },
      /Incorrect Password \/ PIN/,
    );
  });

  it('strips credentials and biometrics in PublicUser projection', () => {
    const user: User = {
      id: 1,
      username: 'private_athlete',
      name: 'Secret Athlete',
      gender: 'female',
      age: 28,
      weightKg: 62,
      heightCm: 168,
      bodyFatPercentage: 20,
      pinHash: 'secret_hash',
      pinSalt: 'secret_salt',
      createdAt: Date.now(),
      shareWorkouts: true,
      shareRoutines: false,
    };

    const pub = toPublicUser(user);
    assert.equal(pub.id, 1);
    assert.equal(pub.username, 'private_athlete');
    assert.equal(pub.name, 'Secret Athlete');
    assert.equal(pub.shareWorkouts, true);
    assert.equal(pub.shareRoutines, false);

    const record = pub as unknown as Record<string, unknown>;
    assert.equal(record.pinHash, undefined, 'pinHash must be stripped');
    assert.equal(record.pinSalt, undefined, 'pinSalt must be stripped');
    assert.equal(record.weightKg, undefined, 'weightKg must be stripped in public projection');
    assert.equal(record.heightCm, undefined, 'heightCm must be stripped in public projection');
    assert.equal(record.gender, undefined, 'gender must be stripped in public projection');
    assert.equal(record.age, undefined, 'age must be stripped in public projection');
    assert.equal(record.bodyFatPercentage, undefined, 'bodyFat must be stripped in public projection');
  });

  it('deleteOwnAccount prevents deleting other accounts and requires PIN', async () => {
    const user1 = await registerAccount({
      username: 'user1',
      name: 'Athlete 1',
      gender: 'male',
      age: 30,
      weightKg: 85,
      heightCm: 180,
      pin: '4321',
    });

    const user2 = await registerAccount({
      username: 'user2',
      name: 'Athlete 2',
      gender: 'female',
      age: 25,
      weightKg: 60,
      heightCm: 165,
      pin: '8888',
    });

    // Add a routine and workout for user1
    await db.routines.add({
      userId: user1.id,
      name: 'My Routine',
      order: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      exercises: [],
    });
    await db.workouts.add({
      userId: user1.id,
      name: 'My Workout',
      startedAt: Date.now() - 3600000,
      completedAt: Date.now(),
      durationSeconds: 3600,
      exercises: [],
    });

    // user2 cannot delete user1
    await assert.rejects(
      async () => {
        await deleteOwnAccount(user2.id, user1.id, '4321');
      },
      /You can only delete your own account/,
    );

    // Wrong PIN should fail
    await assert.rejects(
      async () => {
        await deleteOwnAccount(user1.id, user1.id, '9999');
      },
      /Incorrect Password \/ PIN/,
    );

    // Correct PIN deletes account and all associated data
    await deleteOwnAccount(user1.id, user1.id, '4321');
    assert.equal(await db.users.get(user1.id), undefined);
    assert.equal(await db.routines.where('userId').equals(user1.id).count(), 0);
    assert.equal(await db.workouts.where('userId').equals(user1.id).count(), 0);
  });
});

describe('KoyuncuFit Social Privacy & Comparison Math', () => {
  it('correctly evaluates permissions for workouts and routines', () => {
    const owner = { id: 10, shareWorkouts: true, shareRoutines: false };

    // Viewer is owner
    assert.equal(canViewWorkouts(10, owner), true);
    assert.equal(canViewRoutines(10, owner), true);

    // Viewer is someone else
    assert.equal(canViewWorkouts(20, owner), true);
    assert.equal(canViewRoutines(20, owner), false);

    // Owner sets workouts private
    const privateOwner = { id: 10, shareWorkouts: false, shareRoutines: true };
    assert.equal(canViewWorkouts(20, privateOwner), false);
    assert.equal(canViewRoutines(20, privateOwner), true);
  });

  it('computes comparison metrics without crashing or returning NaN when friend has 0 data', () => {
    // Both have values
    const comp1 = compareMetric(100, 80, 'kg');
    assert.equal(comp1.uVal, 100);
    assert.equal(comp1.fVal, 80);
    assert.equal(comp1.deltaVal, 20);
    assert.equal(comp1.deltaPct, 25); // (100 - 80) / 80 * 100

    // Friend has 0 data
    const comp2 = compareMetric(100, 0, 'kg');
    assert.equal(comp2.deltaPct, null, 'deltaPct must be null instead of Infinity or NaN');
    assert.equal(comp2.fPct, 0);
    assert.ok(comp2.uPct > 0);

    // Both have 0
    const comp3 = compareMetric(0, 0, 'kg');
    assert.equal(comp3.deltaPct, null);
    assert.equal(comp3.deltaVal, 0);
  });

  it('calculates athlete stats ignoring warm-up sets', () => {
    const sampleWorkouts: Workout[] = [
      {
        id: 1,
        userId: 1,
        name: 'Push Day',
        startedAt: 1000,
        completedAt: 2000,
        durationSeconds: 1000,
        exercises: [
          {
            exerciseId: 5,
            sets: [
              { id: '1', setNumber: 1, type: 'warmup', weight: 40, reps: 15, completed: true },
              { id: '2', setNumber: 2, type: 'normal', weight: 100, reps: 5, completed: true },
              { id: '3', setNumber: 3, type: 'failure', weight: 90, reps: 8, completed: true },
            ],
          },
        ],
      },
    ];

    const stats = calculateAthleteStats(sampleWorkouts, 5);
    assert.equal(stats.sessionCount, 1);
    assert.equal(stats.totalSets, 2, 'Warm-up set should be excluded from working sets');
    assert.equal(stats.maxWeight, 100);
    // Epley 1RM for 100kg x 5 = 100 * (1 + 5/30) = 116.67 => 117
    assert.ok(stats.best1RM >= 116);
    // Best set volume: 90 * 8 = 720 (vs 100 * 5 = 500)
    assert.equal(stats.bestSetVolume, 720);
    assert.equal(stats.bestSetDesc, '90kg × 8');
  });
});

describe('KoyuncuFit Exercise Catalog & Anatomy Mapping', () => {
  it('seeds 1,300+ exercises with GIFs and anatomical muscle groups', async () => {
    await db.open();
    const count = await db.exercises.count();
    assert.ok(count >= 1320, `Expected at least 1,320 exercises, found ${count}`);

    const benchPress = await db.exercises.get(1);
    assert.ok(benchPress, 'Bench Press (ID 1) must exist');
    assert.equal(benchPress.name, 'Bench Press');
    assert.equal(benchPress.muscleGroup, 'Chest');
    assert.ok(benchPress.gifUrl?.includes('.gif'), 'Must have animation GIF');
    assert.ok(benchPress.primaryMuscles.includes('Chest'), 'Must map to Chest');

    const squat = await db.exercises.get(27);
    assert.ok(squat, 'Squat (ID 27) must exist');
    assert.equal(squat.name, 'Squat');
    assert.equal(squat.muscleGroup, 'Legs');

    const highIndex = await db.exercises.get(100);
    assert.ok(highIndex, 'High-index exercises must be present');
    assert.ok(highIndex.gifUrl?.startsWith('https://cdn.jsdelivr.net'), 'CDN URL must be configured');
  });
});

