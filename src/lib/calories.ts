/**
 * Scientific Calorie Burn Engine
 *
 * Implements:
 * 1. Katch-McArdle Formula (when Body Fat % is available):
 *    LBM = Weight * (1 - BodyFat / 100)
 *    BMR = 370 + (21.6 * LBM)
 * 2. Mifflin-St Jeor Formula (fallback):
 *    Men:   BMR = 10 * Weight + 6.25 * Height - 5 * Age + 5
 *    Women: BMR = 10 * Weight + 6.25 * Height - 5 * Age - 161
 * 3. Personalized Calorie Burn per Exercise & Workout:
 *    Calories = MET_adj * 3.5 * (EffectiveWeightKg / 200) * DurationMinutes + (TotalVolumeKg * 0.008)
 */

export interface BiometricProfile {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: 'male' | 'female';
  bodyFatPercentage?: number;
}

/**
 * Calculates Basal Metabolic Rate (BMR) in kcal/day.
 */
export function calculateBMR(profile: BiometricProfile): number {
  const { weightKg, heightCm, age, gender, bodyFatPercentage } = profile;

  if (bodyFatPercentage != null && bodyFatPercentage > 0 && bodyFatPercentage < 60) {
    // Katch-McArdle Formula
    const lbm = weightKg * (1 - bodyFatPercentage / 100);
    return Math.round(370 + 21.6 * lbm);
  }

  // Mifflin-St Jeor Formula
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(gender === 'female' ? base - 161 : base + 5);
}

/**
 * Calculates Lean Body Mass (LBM) in kg.
 */
export function calculateLBM(weightKg: number, bodyFatPercentage?: number): number {
  if (bodyFatPercentage != null && bodyFatPercentage > 0) {
    return Number((weightKg * (1 - bodyFatPercentage / 100)).toFixed(1));
  }
  // Estimated average: 82% for men, 75% for women
  return Number((weightKg * 0.8).toFixed(1));
}

/**
 * Effective Weight considers lean muscle mass density.
 * A lifter with lower body fat and higher muscle density has higher energy expenditure per minute.
 */
export function calculateEffectiveWeight(weightKg: number, bodyFatPercentage?: number): number {
  if (bodyFatPercentage != null && bodyFatPercentage > 0) {
    // Normalizing against 18% standard reference
    const modifier = 1 + (18 - bodyFatPercentage) / 100;
    return weightKg * Math.max(0.85, Math.min(1.25, modifier));
  }
  return weightKg;
}

/**
 * Calculates calories burned for an active workout session.
 *
 * @param durationSec Total elapsed workout duration in seconds
 * @param totalVolumeKg Total tonnage lifted (sum of weight * reps for working sets)
 * @param averageMET Weighted average MET of exercises performed (default 4.8)
 * @param profile User biometric profile
 */
export function calculateWorkoutCalories(
  durationSec: number,
  totalVolumeKg: number,
  averageMET = 4.8,
  profile?: BiometricProfile,
): number {
  if (durationSec <= 0) return 0;

  const durationMin = durationSec / 60;
  const weight = profile?.weightKg ?? 75;
  const effectiveWeight = calculateEffectiveWeight(weight, profile?.bodyFatPercentage);

  // Time-based energy expenditure with MET
  const timeCalories = averageMET * 3.5 * (effectiveWeight / 200) * durationMin;

  // Mechanical volume tonnage energy surcharge (approx 0.008 kcal per kg moved)
  const volumeCalories = Math.max(0, totalVolumeKg) * 0.008;

  const total = timeCalories + volumeCalories;
  return Math.max(0, Math.round(total));
}

/**
 * Benchmark MET values categorized by exercise archetype.
 */
export const DEFAULT_MET_VALUES = {
  heavyCompoundLower: 6.0, // Squat, Deadlift, Leg Press, RDL
  compoundUpper: 5.0,      // Bench Press, Row, Pull Up, Overhead Press
  isolation: 3.8,          // Lateral Raise, Curls, Pushdowns, Calves, Abs
  bodyweight: 4.5,         // Pushups, Dips, Pullups
};
