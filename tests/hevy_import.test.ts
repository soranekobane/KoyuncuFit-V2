import 'fake-indexeddb/auto';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchExerciseInCatalog,
  normalizeExerciseName,
  parseCSV,
  parseHevyDate,
  parseHevyWorkoutsCSV,
} from '../src/lib/hevyImport';
import { db, type Exercise, type Workout } from '../src/db';
import { importHevyWorkouts, repairImportedWorkouts } from '../src/lib/cloudDb';

describe('Hevy CSV Workout Importer', () => {
  it('parses RFC 4180 CSV strings with quotes, commas, and newlines correctly', () => {
    const csv = `title,notes,reps\n"Push Day","Felt strong, went heavy",10\n"Leg Day","Line 1\nLine 2",12\n"Pull Day","Quote ""test""",8`;
    const rows = parseCSV(csv);

    assert.equal(rows.length, 4);
    assert.deepEqual(rows[0], ['title', 'notes', 'reps']);
    assert.equal(rows[1][0], 'Push Day');
    assert.equal(rows[1][1], 'Felt strong, went heavy');
    assert.equal(rows[2][1], 'Line 1\nLine 2');
    assert.equal(rows[3][1], 'Quote "test"');
  });

  it('parses Hevy datetime strings accurately', () => {
    // English format: "21 Oct 2026, 17:30"
    const ts1 = parseHevyDate('21 Oct 2026, 17:30');
    const d1 = new Date(ts1);
    assert.equal(d1.getFullYear(), 2026);
    assert.equal(d1.getMonth(), 9); // October = 9
    assert.equal(d1.getDate(), 21);
    assert.equal(d1.getHours(), 17);
    assert.equal(d1.getMinutes(), 30);

    // ISO format: "2026-10-21 17:30:00"
    const ts2 = parseHevyDate('2026-10-21 17:30:00');
    const d2 = new Date(ts2);
    assert.equal(d2.getFullYear(), 2026);
    assert.equal(d2.getMonth(), 9);
    assert.equal(d2.getDate(), 21);

    // Turkish format: "21 Ekim 2026, 18:45"
    const ts3 = parseHevyDate('21 Ekim 2026, 18:45');
    const d3 = new Date(ts3);
    assert.equal(d3.getFullYear(), 2026);
    assert.equal(d3.getMonth(), 9);
    assert.equal(d3.getDate(), 21);
    assert.equal(d3.getHours(), 18);
    assert.equal(d3.getMinutes(), 45);
  });

  it('smart matches Hevy exercise titles to catalog', () => {
    const sampleCatalog: Exercise[] = [
      {
        id: 1,
        name: 'Barbell Bench Press',
        muscleGroup: 'Chest',
        equipment: 'Barbell',
        isCustom: false,
        createdAt: 0,
        primaryMuscles: ['Chest'],
        secondaryMuscles: ['Triceps'],
        metValue: 5.0,
      },
      {
        id: 2,
        name: 'Barbell Squat',
        muscleGroup: 'Legs',
        equipment: 'Barbell',
        isCustom: false,
        createdAt: 0,
        primaryMuscles: ['Quadriceps'],
        secondaryMuscles: ['Glutes'],
        metValue: 6.0,
      },
      {
        id: 3,
        name: 'Incline Dumbbell Press',
        muscleGroup: 'Chest',
        equipment: 'Dumbbell',
        isCustom: false,
        createdAt: 0,
        primaryMuscles: ['Chest'],
        secondaryMuscles: [],
        metValue: 5.0,
      },
    ];

    // Case 1: "Bench Press (Barbell)" -> matches "Barbell Bench Press"
    const match1 = matchExerciseInCatalog('Bench Press (Barbell)', sampleCatalog);
    assert.ok(match1);
    assert.equal(match1?.id, 1);

    // Case 2: "Squat (Barbell)" -> matches "Barbell Squat"
    const match2 = matchExerciseInCatalog('Squat (Barbell)', sampleCatalog);
    assert.ok(match2);
    assert.equal(match2?.id, 2);

    // Case 3: "incline dumbbell press" -> exact/normalized match
    const match3 = matchExerciseInCatalog('incline dumbbell press', sampleCatalog);
    assert.ok(match3);
    assert.equal(match3?.id, 3);
  });

  it('parses sample Hevy workouts.csv into structured sessions and sets', async () => {
    const sampleHevyCSV = `title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe
"Push Day","21 Oct 2026, 17:30","21 Oct 2026, 18:45","Great chest pump!","Bench Press (Barbell)",,"Felt light",0,warmup,50,12,,,
"Push Day","21 Oct 2026, 17:30","21 Oct 2026, 18:45","Great chest pump!","Bench Press (Barbell)",,"Felt light",1,normal,80,10,,,8
"Push Day","21 Oct 2026, 17:30","21 Oct 2026, 18:45","Great chest pump!","Bench Press (Barbell)",,"Felt light",2,normal,90,8,,,8.5
"Push Day","21 Oct 2026, 17:30","21 Oct 2026, 18:45","Great chest pump!","Incline Dumbbell Press",,,0,normal,30,10,,,
"Push Day","21 Oct 2026, 17:30","21 Oct 2026, 18:45","Great chest pump!","Tricep Cable Pushdown",,,0,drop,25,12,,,
"Leg Day","22 Oct 2026, 16:00","22 Oct 2026, 17:15","Heavy squats","Squat (Barbell)",,,0,normal,100,5,,,`;

    const catalog: Exercise[] = [
      {
        id: 1,
        name: 'Barbell Bench Press',
        muscleGroup: 'Chest',
        equipment: 'Barbell',
        isCustom: false,
        createdAt: 0,
        primaryMuscles: ['Chest'],
        secondaryMuscles: [],
        metValue: 5.0,
      },
      {
        id: 2,
        name: 'Incline Dumbbell Press',
        muscleGroup: 'Chest',
        equipment: 'Dumbbell',
        isCustom: false,
        createdAt: 0,
        primaryMuscles: ['Chest'],
        secondaryMuscles: [],
        metValue: 5.0,
      },
      {
        id: 3,
        name: 'Barbell Squat',
        muscleGroup: 'Legs',
        equipment: 'Barbell',
        isCustom: false,
        createdAt: 0,
        primaryMuscles: ['Quadriceps'],
        secondaryMuscles: [],
        metValue: 6.0,
      },
    ];

    const result = await parseHevyWorkoutsCSV(sampleHevyCSV, {
      userId: 'user_123',
      catalog,
      userProfile: {
        weightKg: 80,
        heightCm: 180,
        age: 26,
        gender: 'male',
        bodyFatPercentage: 14,
      },
    });

    // We should have 2 distinct workouts: "Push Day" and "Leg Day"
    assert.equal(result.totalWorkouts, 2);
    assert.equal(result.workouts.length, 2);
    assert.equal(result.totalSets, 6);

    const pushWorkout = result.workouts.find((w) => w.name === 'Push Day');
    assert.ok(pushWorkout);
    assert.equal(pushWorkout?.notes, 'Great chest pump!');
    assert.equal(pushWorkout?.exercises.length, 3); // Bench Press, Incline DB Press, Tricep Cable Pushdown

    // Bench press should have 3 sets: warmup (50kg x 12), normal (80kg x 10), normal (90kg x 8)
    const benchEx = pushWorkout?.exercises.find((e) => e.name === 'Barbell Bench Press');
    assert.ok(benchEx);
    assert.equal(benchEx?.sets.length, 3);
    assert.equal(benchEx?.sets[0].type, 'warmup');
    assert.equal(benchEx?.sets[0].weight, 50);
    assert.equal(benchEx?.sets[0].reps, 12);
    assert.equal(benchEx?.sets[2].weight, 90);

    // "Tricep Cable Pushdown" was not in our catalog, so it should have been automatically synthesized
    assert.equal(result.createdExercises.length, 1);
    assert.equal(result.createdExercises[0].name, 'Tricep Cable Pushdown');
    assert.equal(result.createdExercises[0].muscleGroup, 'Triceps');
    assert.equal(result.createdExercises[0].equipment, 'Cable');

    // Volume calculation:
    // Bench: 50*12 + 80*10 + 90*8 = 600 + 800 + 720 = 2120
    // Incline DB: 30*10 = 300
    // Triceps: 25*12 = 300
    // Total Push Volume: 2720 kg
    assert.equal(pushWorkout?.totalVolume, 2720);
    assert.ok((pushWorkout?.caloriesBurned ?? 0) > 100);
  });

  it('accurately parses Turkish dates matching workout_data.csv format', () => {
    // 28 Şub 2025, 15:41
    const tsSub = parseHevyDate('28 Şub 2025, 15:41');
    const dSub = new Date(tsSub);
    assert.equal(dSub.getFullYear(), 2025);
    assert.equal(dSub.getMonth(), 1); // February = 1
    assert.equal(dSub.getDate(), 28);
    assert.equal(dSub.getHours(), 15);
    assert.equal(dSub.getMinutes(), 41);

    // 19 Eki 2026, 10:18
    const tsEki = parseHevyDate('19 Eki 2026, 10:18');
    const dEki = new Date(tsEki);
    assert.equal(dEki.getFullYear(), 2026);
    assert.equal(dEki.getMonth(), 9); // October = 9
    assert.equal(dEki.getDate(), 19);
    assert.equal(dEki.getHours(), 10);
    assert.equal(dEki.getMinutes(), 18);

    // 17 Oca 2023, 15:59
    const tsOca = parseHevyDate('17 Oca 2023, 15:59');
    const dOca = new Date(tsOca);
    assert.equal(dOca.getFullYear(), 2023);
    assert.equal(dOca.getMonth(), 0); // January = 0
    assert.equal(dOca.getDate(), 17);
    assert.equal(dOca.getHours(), 15);
    assert.equal(dOca.getMinutes(), 59);
  });

  it('maps all Turkish Hevy exercise names to canonical catalog exercises', () => {
    const catalog: Exercise[] = [
      {
        id: 163,
        name: 'Barbell Bench Press',
        muscleGroup: 'Chest',
        equipment: 'Barbell',
        isCustom: false,
        createdAt: 0,
        primaryMuscles: ['Chest'],
        secondaryMuscles: ['Triceps'],
        metValue: 5.5,
      },
      {
        id: 2,
        name: 'Incline Bench Press',
        muscleGroup: 'Chest',
        equipment: 'Barbell',
        isCustom: false,
        createdAt: 0,
        primaryMuscles: ['Chest'],
        secondaryMuscles: ['Front Delts'],
        metValue: 5.5,
      },
      {
        id: 27,
        name: 'Squat',
        muscleGroup: 'Legs',
        equipment: 'Barbell',
        isCustom: false,
        createdAt: 0,
        primaryMuscles: ['Quadriceps'],
        secondaryMuscles: ['Glutes'],
        metValue: 6.0,
      },
      {
        id: 24,
        name: 'Pull Up',
        muscleGroup: 'Back',
        equipment: 'Bodyweight',
        isCustom: false,
        createdAt: 0,
        primaryMuscles: ['Lats'],
        secondaryMuscles: ['Biceps'],
        metValue: 5.0,
      },
      {
        id: 11,
        name: 'Push Up',
        muscleGroup: 'Chest',
        equipment: 'Bodyweight',
        isCustom: false,
        createdAt: 0,
        primaryMuscles: ['Chest'],
        secondaryMuscles: ['Triceps'],
        metValue: 4.0,
      },
      {
        id: 8,
        name: 'Pec Deck',
        muscleGroup: 'Chest',
        equipment: 'Machine',
        isCustom: false,
        createdAt: 0,
        primaryMuscles: ['Chest'],
        secondaryMuscles: [],
        metValue: 4.5,
      },
      {
        id: 57,
        name: 'EZ Bar Curl',
        muscleGroup: 'Biceps',
        equipment: 'Barbell',
        isCustom: false,
        createdAt: 0,
        primaryMuscles: ['Biceps'],
        secondaryMuscles: ['Forearms'],
        metValue: 4.5,
      },
      {
        id: 67,
        name: 'Skull Crusher',
        muscleGroup: 'Triceps',
        equipment: 'Barbell',
        isCustom: false,
        createdAt: 0,
        primaryMuscles: ['Triceps'],
        secondaryMuscles: [],
        metValue: 4.5,
      },
      {
        id: 50,
        name: 'Rear Delt Fly',
        muscleGroup: 'Shoulders',
        equipment: 'Dumbbell',
        isCustom: false,
        createdAt: 0,
        primaryMuscles: ['Rear Delts'],
        secondaryMuscles: [],
        metValue: 4.5,
      },
    ];

    // "Bench Press (Bar)" MUST match "Barbell Bench Press" (id: 163), exactly like "Bench Press (Barbell)"
    const bp1 = matchExerciseInCatalog('Bench Press (Bar)', catalog);
    const bp2 = matchExerciseInCatalog('Bench Press (Barbell)', catalog);
    assert.ok(bp1);
    assert.ok(bp2);
    assert.equal(bp1?.id, 163);
    assert.equal(bp2?.id, 163);
    assert.equal(bp1?.name, 'Barbell Bench Press');

    // Incline Bench Press (Bar)
    const inc = matchExerciseInCatalog('Incline Bench Press (Bar)', catalog);
    assert.ok(inc);
    assert.equal(inc?.id, 2);

    // Squat (Bar)
    const sq = matchExerciseInCatalog('Squat (Bar)', catalog);
    assert.ok(sq);
    assert.equal(sq?.id, 27);

    // Barfiks -> Pull Up
    const pu = matchExerciseInCatalog('Barfiks', catalog);
    assert.ok(pu);
    assert.equal(pu?.id, 24);

    // Şınav -> Push Up
    const su = matchExerciseInCatalog('Şınav', catalog);
    assert.ok(su);
    assert.equal(su?.id, 11);

    // Butterfly (Pec Deck) -> Pec Deck
    const pd = matchExerciseInCatalog('Butterfly (Pec Deck)', catalog);
    assert.ok(pd);
    assert.equal(pd?.id, 8);

    // EZ Bar Biceps Curl -> EZ Bar Curl
    const ez = matchExerciseInCatalog('EZ Bar Biceps Curl', catalog);
    assert.ok(ez);
    assert.equal(ez?.id, 57);

    // Skullcrusher (Bar) -> Skull Crusher
    const sc = matchExerciseInCatalog('Skullcrusher (Bar)', catalog);
    assert.ok(sc);
    assert.equal(sc?.id, 67);

    // Rear Delt Reverse Fly (Makine) -> Rear Delt Fly
    const rd = matchExerciseInCatalog('Rear Delt Reverse Fly (Makine)', catalog);
    assert.ok(rd);
    assert.equal(rd?.id, 50);
  });

  it('overwrites existing workouts on re-import and repairs unmapped Turkish exercises', async () => {
    // 1. Seed catalog exercise Barbell Bench Press (id: 163)
    await db.exercises.put({
      id: 163,
      name: 'Barbell Bench Press',
      muscleGroup: 'Chest',
      equipment: 'Barbell',
      isCustom: false,
      createdAt: 0,
      primaryMuscles: ['Chest'],
      secondaryMuscles: ['Triceps'],
      metValue: 5.5,
    });

    // 2. Insert an old broken workout with custom exercise "Bench Press (Bar)" (id: 1329)
    await db.exercises.put({
      id: 1329,
      name: 'Bench Press (Bar)',
      muscleGroup: 'Chest',
      equipment: 'Barbell',
      isCustom: true,
      createdAt: Date.now(),
      primaryMuscles: ['Chest'],
      secondaryMuscles: [],
      metValue: 5.0,
    });

    const testTime = 1673967540000; // Jan 17, 2023
    await db.workouts.put({
      id: 'old_workout_1',
      userId: 'test_user',
      name: 'push1',
      startedAt: testTime,
      endedAt: testTime + 3600000,
      durationSec: 3600,
      notes: '',
      exercises: [
        {
          uid: 'we_old_1',
          exerciseId: 1329,
          name: 'Bench Press (Bar)',
          muscleGroup: 'Chest',
          equipment: 'Barbell',
          sets: [{ uid: 's1', type: 'normal', weight: 100, reps: 5 }],
        },
      ],
      exerciseIds: [1329],
      totalVolume: 500,
      totalSets: 1,
      caloriesBurned: 200,
    });

    // 3. Run repairImportedWorkouts
    const repairResult = await repairImportedWorkouts('test_user');
    assert.equal(repairResult.repairedCount, 1);

    // 4. Verify workout is repaired to Barbell Bench Press (id: 163)
    const repaired = await db.workouts.get('old_workout_1');
    assert.ok(repaired);
    assert.equal(repaired?.exercises[0].exerciseId, 163);
    assert.equal(repaired?.exercises[0].name, 'Barbell Bench Press');
    assert.deepEqual(repaired?.exerciseIds, [163]);

    // 5. Verify orphaned custom exercise 1329 was cleaned up
    const orphan = await db.exercises.get(1329);
    assert.equal(orphan, undefined);

    // 6. Test re-import overwrite
    const newWorkoutVersion: Workout = {
      id: 'new_temp_id',
      userId: 'test_user',
      name: 'push1',
      startedAt: testTime,
      endedAt: testTime + 4000000,
      durationSec: 4000,
      notes: 'Updated notes',
      exercises: [
        {
          uid: 'we_new_1',
          exerciseId: 163,
          name: 'Barbell Bench Press',
          muscleGroup: 'Chest',
          equipment: 'Barbell',
          sets: [{ uid: 's2', type: 'normal', weight: 110, reps: 6 }],
        },
      ],
      exerciseIds: [163],
      totalVolume: 660,
      totalSets: 1,
      caloriesBurned: 250,
    };

    const importRes = await importHevyWorkouts('test_user', [newWorkoutVersion]);
    assert.equal(importRes.importedCount, 1);
    assert.equal(importRes.updatedCount, 1);
    assert.equal(importRes.skippedCount, 0);

    const reimported = await db.workouts.get('old_workout_1');
    assert.ok(reimported);
    assert.equal(reimported?.totalVolume, 660);
    assert.equal(reimported?.notes, 'Updated notes');
  });
});
