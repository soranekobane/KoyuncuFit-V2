import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getLocalDateKey } from '../src/components/WorkoutCalendarModal';
import { epley1RM } from '../src/lib/utils';
import type { Workout } from '../src/db';

describe('Workout Calendar Modal Logic & 1RM Calculations', () => {
  it('formats local date keys correctly without UTC offsets', () => {
    const d1 = new Date(2026, 9, 22, 10, 30); // Oct 22, 2026 local
    assert.equal(getLocalDateKey(d1), '2026-10-22');

    const d2 = new Date(2026, 0, 5, 23, 45); // Jan 5, 2026 local
    assert.equal(getLocalDateKey(d2), '2026-01-05');
  });

  it('calculates 1RM accurately for exercise set breakdown', () => {
    // Single rep is the weight itself
    assert.equal(epley1RM(100, 1), 100);

    // 10 reps of 100kg: 100 * (1 + 10/30) = 133.333...
    const orm10 = epley1RM(100, 10);
    assert.ok(Math.abs(orm10 - 133.33) < 0.05);

    // Invalid/empty weights or reps should be 0
    assert.equal(epley1RM(0, 10), 0);
    assert.equal(epley1RM(100, 0), 0);
  });

  it('groups multiple workouts by day correctly and sorts chronologically', () => {
    const morningWorkout: Workout = {
      id: 1,
      userId: 1,
      name: 'Morning Cardio',
      startedAt: new Date(2026, 9, 22, 8, 0).getTime(),
      completedAt: new Date(2026, 9, 22, 8, 45).getTime(),
      durationSec: 2700,
      totalVolume: 0,
      totalSets: 0,
      caloriesBurned: 350,
      exerciseIds: [],
      exercises: [],
    };

    const eveningWorkout: Workout = {
      id: 2,
      userId: 1,
      name: 'Chest & Triceps',
      startedAt: new Date(2026, 9, 22, 18, 0).getTime(),
      completedAt: new Date(2026, 9, 22, 19, 15).getTime(),
      durationSec: 4500,
      totalVolume: 8500,
      totalSets: 16,
      caloriesBurned: 480,
      exerciseIds: [1, 2],
      exercises: [
        {
          uid: 'ex-1',
          exerciseId: 1,
          name: 'Bench Press (Barbell)',
          sets: [
            { uid: 's-1', weight: 80, reps: 10, isCompleted: true },
            { uid: 's-2', weight: 100, reps: 5, isCompleted: true },
          ],
        },
      ],
    };

    const map = new Map<string, Workout[]>();
    for (const w of [eveningWorkout, morningWorkout]) {
      const key = getLocalDateKey(w.startedAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(w);
    }

    const dayWorkouts = map.get('2026-10-22') ?? [];
    assert.equal(dayWorkouts.length, 2);

    // Sort chronologically
    dayWorkouts.sort((a, b) => a.startedAt - b.startedAt);
    assert.equal(dayWorkouts[0].name, 'Morning Cardio');
    assert.equal(dayWorkouts[1].name, 'Chest & Triceps');

    // Verify 1RM calculation for the bench press sets:
    // Set 1: 80 * (1 + 10/30) = 106.67
    // Set 2: 100 * (1 + 5/30) = 116.67 (Top set)
    const set1_1RM = epley1RM(80, 10);
    const set2_1RM = epley1RM(100, 5);
    assert.ok(set2_1RM > set1_1RM);
    assert.ok(Math.abs(set2_1RM - 116.67) < 0.05);
  });
});
