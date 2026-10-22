import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchExerciseInCatalog,
  normalizeExerciseName,
  parseCSV,
  parseHevyDate,
  parseHevyWorkoutsCSV,
} from '../src/lib/hevyImport';
import type { Exercise } from '../src/db';

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
});
