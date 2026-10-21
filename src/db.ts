import Dexie, { type EntityTable } from 'dexie';

// ───────────────────────── Types ─────────────────────────

export const MUSCLE_GROUPS = ['Chest', 'Back', 'Legs', 'Shoulders', 'Biceps', 'Triceps', 'Core'] as const;
export const EQUIPMENT = ['Barbell', 'Dumbbell', 'Machine', 'Cable', 'Bodyweight'] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
export type Equipment = (typeof EQUIPMENT)[number];
export type SetType = 'normal' | 'warmup' | 'drop' | 'failure';

export interface User {
  id: number;
  username: string;
  name: string;
  pin?: string;
  gender: 'male' | 'female';
  age: number;
  weightKg: number;
  heightCm: number;
  bodyFatPercentage?: number;
  avatarColor: string;
  createdAt: number;
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
  id: number;
  userId: number;
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
  id: number;
  userId: number;
  name: string;
  routineId?: number;
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

// ───────────────────────── Database ─────────────────────────

export const db = new Dexie('LiftWorkoutTracker') as Dexie & {
  users: EntityTable<User, 'id'>;
  exercises: EntityTable<Exercise, 'id'>;
  routines: EntityTable<Routine, 'id'>;
  workouts: EntityTable<Workout, 'id'>;
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

interface SeedExerciseSpec {
  name: string;
  muscle: MuscleGroup;
  equipment: Equipment;
  primary: string[];
  secondary: string[];
  met: number;
  instructions: string[];
}

const SEED_EXERCISES_SPEC: SeedExerciseSpec[] = [
  // Chest
  {
    name: 'Bench Press',
    muscle: 'Chest',
    equipment: 'Barbell',
    primary: ['Chest'],
    secondary: ['Front Delts', 'Triceps'],
    met: 5.0,
    instructions: [
      'Lie flat on the bench, feet firmly planted on the floor with eyes aligned below the bar.',
      'Grip the bar slightly wider than shoulder-width and unrack with elbows locked.',
      'Lower the bar with controlled motion to the mid-chest, keeping wrists straight.',
      'Press upward vigorously while driving your feet into the ground until arms lock.',
    ],
  },
  {
    name: 'Incline Bench Press',
    muscle: 'Chest',
    equipment: 'Barbell',
    primary: ['Chest', 'Front Delts'],
    secondary: ['Triceps'],
    met: 5.0,
    instructions: [
      'Set an incline bench to 30 degrees for optimal upper-chest activation.',
      'Lower the bar under control toward your upper chest collarbone line.',
      'Press the weight up without flaring elbows excessively outward.',
    ],
  },
  {
    name: 'Decline Bench Press',
    muscle: 'Chest',
    equipment: 'Barbell',
    primary: ['Chest'],
    secondary: ['Triceps'],
    met: 5.0,
    instructions: [
      'Secure your legs under the support pads of a decline bench.',
      'Lower the bar smoothly to your lower sternum.',
      'Drive the barbell upward, contracting the lower pectorals at the peak.',
    ],
  },
  {
    name: 'Dumbbell Bench Press',
    muscle: 'Chest',
    equipment: 'Dumbbell',
    primary: ['Chest'],
    secondary: ['Front Delts', 'Triceps'],
    met: 5.0,
    instructions: [
      'Lie back with dumbbells positioned at chest level, palms facing forward.',
      'Press upward in a smooth arc until dumbbells nearly meet overhead.',
      'Lower under control to get a full pectoral stretch.',
    ],
  },
  {
    name: 'Incline Dumbbell Press',
    muscle: 'Chest',
    equipment: 'Dumbbell',
    primary: ['Chest', 'Front Delts'],
    secondary: ['Triceps'],
    met: 5.0,
    instructions: [
      'Adjust bench to 30-45 degrees. Kick the dumbbells up to shoulder height.',
      'Press the dumbbells up smoothly while keeping shoulder blades retracted.',
      'Lower slowly until you feel a deep stretch in the upper chest.',
    ],
  },
  {
    name: 'Dumbbell Fly',
    muscle: 'Chest',
    equipment: 'Dumbbell',
    primary: ['Chest'],
    secondary: ['Front Delts'],
    met: 3.8,
    instructions: [
      'Lie flat holding dumbbells with palms facing each other and elbows slightly bent.',
      'Open your arms wide in a hugging arc until chest is fully stretched.',
      'Squeeze the pectorals to bring the weights back together over your chest.',
    ],
  },
  {
    name: 'Chest Press',
    muscle: 'Chest',
    equipment: 'Machine',
    primary: ['Chest'],
    secondary: ['Triceps', 'Front Delts'],
    met: 4.5,
    instructions: [
      'Adjust seat height so handles align with mid-chest.',
      'Press handles outward until arms are extended without locking elbows.',
      'Return slowly to the starting position under continuous tension.',
    ],
  },
  {
    name: 'Pec Deck',
    muscle: 'Chest',
    equipment: 'Machine',
    primary: ['Chest'],
    secondary: ['Front Delts'],
    met: 3.8,
    instructions: [
      'Sit tall with back flush against pad, gripping the vertical handles.',
      'Bring handles together in front of your chest, contracting hard for 1 second.',
      'Slowly resist back until you feel a comfortable chest stretch.',
    ],
  },
  {
    name: 'Cable Crossover',
    muscle: 'Chest',
    equipment: 'Cable',
    primary: ['Chest'],
    secondary: ['Front Delts'],
    met: 3.8,
    instructions: [
      'Set pulleys high, step forward into a staggered stance with slight forward torso lean.',
      'Pull handles downward and inward in a wide arc until hands cross in front.',
      'Control the return against cable resistance.',
    ],
  },
  {
    name: 'Low-to-High Cable Fly',
    muscle: 'Chest',
    equipment: 'Cable',
    primary: ['Chest', 'Front Delts'],
    secondary: ['Biceps'],
    met: 3.8,
    instructions: [
      'Set pulleys to the lowest position. Hold handles with palms up.',
      'Scoop upward and forward until hands meet at eye level.',
      'Squeeze upper chest hard at the peak of contraction.',
    ],
  },
  {
    name: 'Push Up',
    muscle: 'Chest',
    equipment: 'Bodyweight',
    primary: ['Chest'],
    secondary: ['Front Delts', 'Triceps', 'Abs/Core'],
    met: 4.5,
    instructions: [
      'Set hands shoulder-width apart, body forming a straight plank line.',
      'Lower until chest is 1 inch off the ground, elbows at a 45-degree angle.',
      'Push the ground away to return to full lockout.',
    ],
  },
  {
    name: 'Chest Dip',
    muscle: 'Chest',
    equipment: 'Bodyweight',
    primary: ['Chest', 'Triceps'],
    secondary: ['Front Delts'],
    met: 5.0,
    instructions: [
      'Mount parallel bars, lean torso forward ~30 degrees and flare elbows slightly.',
      'Lower until upper arms are parallel to the floor.',
      'Press back up, focusing on pushing through the lower chest.',
    ],
  },

  // Back
  {
    name: 'Deadlift',
    muscle: 'Back',
    equipment: 'Barbell',
    primary: ['Lower Back', 'Hamstrings', 'Glutes'],
    secondary: ['Lats/Upper Back', 'Traps', 'Forearms', 'Quads'],
    met: 6.0,
    instructions: [
      'Stand with mid-foot under barbell, hip-width stance.',
      'Hinge at hips, grip bar firmly just outside shins, pull chest tall to set your back.',
      'Drive floor away through your heels, extending hips and knees simultaneously.',
      'Lock out at top with glutes contracted; avoid hyperextending.',
    ],
  },
  {
    name: 'Barbell Row',
    muscle: 'Back',
    equipment: 'Barbell',
    primary: ['Lats/Upper Back'],
    secondary: ['Biceps', 'Rear Delts', 'Lower Back'],
    met: 5.0,
    instructions: [
      'Hinge at hips to a 45-degree angle with flat spine and knees softly bent.',
      'Pull barbell towards lower ribcage, driving elbows toward the ceiling.',
      'Squeeze shoulder blades together at the top, then lower with control.',
    ],
  },
  {
    name: 'Pendlay Row',
    muscle: 'Back',
    equipment: 'Barbell',
    primary: ['Lats/Upper Back'],
    secondary: ['Rear Delts', 'Biceps', 'Traps'],
    met: 5.0,
    instructions: [
      'Start each rep from a dead stop on the floor with torso parallel to the ground.',
      'Explosively pull the bar to your lower chest without raising torso angle.',
      'Return the bar to rest on the floor before next rep.',
    ],
  },
  {
    name: 'T-Bar Row',
    muscle: 'Back',
    equipment: 'Barbell',
    primary: ['Lats/Upper Back', 'Traps'],
    secondary: ['Biceps', 'Rear Delts', 'Lower Back'],
    met: 5.0,
    instructions: [
      'Straddle the bar with feet shoulder-width, gripping the V-handle.',
      'Pull the handle into your abdomen while keeping lumbar spine neutral.',
      'Squeeze middle back and lower under control.',
    ],
  },
  {
    name: 'Dumbbell Row',
    muscle: 'Back',
    equipment: 'Dumbbell',
    primary: ['Lats/Upper Back'],
    secondary: ['Biceps', 'Rear Delts'],
    met: 4.5,
    instructions: [
      'Place one knee and hand on a flat bench for support.',
      'Hold dumbbell with free hand and pull elbow up toward hip crease.',
      'Squeeze lat at the top and stretch arm fully down at the bottom.',
    ],
  },
  {
    name: 'Lat Pulldown',
    muscle: 'Back',
    equipment: 'Cable',
    primary: ['Lats/Upper Back'],
    secondary: ['Biceps', 'Rear Delts'],
    met: 4.8,
    instructions: [
      'Sit with thighs secured under knee pads, grip bar slightly wider than shoulders.',
      'Lean back slightly and pull the bar down toward upper collarbone.',
      'Lead with your elbows and avoid using momentum or swinging.',
    ],
  },
  {
    name: 'Close-Grip Lat Pulldown',
    muscle: 'Back',
    equipment: 'Cable',
    primary: ['Lats/Upper Back'],
    secondary: ['Biceps', 'Forearms'],
    met: 4.8,
    instructions: [
      'Attach a V-grip handle to the lat pulldown cable.',
      'Pull handle down to mid-chest while retracting scapulae.',
      'Extend arms fully overhead at the top for maximum lat stretch.',
    ],
  },
  {
    name: 'Seated Cable Row',
    muscle: 'Back',
    equipment: 'Cable',
    primary: ['Lats/Upper Back'],
    secondary: ['Biceps', 'Traps', 'Rear Delts'],
    met: 4.8,
    instructions: [
      'Sit upright with knees slightly bent and feet pressed against footrests.',
      'Pull handle toward belly button, puffing chest out and squeezing back.',
      'Avoid swinging your lower back back and forth.',
    ],
  },
  {
    name: 'Straight-Arm Pulldown',
    muscle: 'Back',
    equipment: 'Cable',
    primary: ['Lats/Upper Back'],
    secondary: ['Triceps', 'Abs/Core'],
    met: 3.8,
    instructions: [
      'Stand facing high cable with straight bar, arms outstretched with slight elbow bend.',
      'Sweep the bar down to thighs using only lats.',
      'Pause for a contraction at the bottom, then return smoothly.',
    ],
  },
  {
    name: 'Machine Row',
    muscle: 'Back',
    equipment: 'Machine',
    primary: ['Lats/Upper Back'],
    secondary: ['Biceps', 'Rear Delts'],
    met: 4.5,
    instructions: [
      'Adjust chest pad so you can reach handles with arms fully extended.',
      'Pull handles back, retracting shoulder blades with elbows driven back.',
      'Return slowly without letting weights slam.',
    ],
  },
  {
    name: 'Assisted Pull Up',
    muscle: 'Back',
    equipment: 'Machine',
    primary: ['Lats/Upper Back'],
    secondary: ['Biceps', 'Forearms'],
    met: 4.5,
    instructions: [
      'Place knees or feet on counter-weight assist pad.',
      'Pull yourself up until chin clears the bar.',
      'Lower slowly to full arm hang.',
    ],
  },
  {
    name: 'Pull Up',
    muscle: 'Back',
    equipment: 'Bodyweight',
    primary: ['Lats/Upper Back'],
    secondary: ['Biceps', 'Forearms', 'Abs/Core'],
    met: 5.5,
    instructions: [
      'Grip the bar overhand slightly wider than shoulder width.',
      'Initiate pull by driving elbows down to hips until chin clears bar.',
      'Lower under complete control without swinging.',
    ],
  },
  {
    name: 'Chin Up',
    muscle: 'Back',
    equipment: 'Bodyweight',
    primary: ['Lats/Upper Back', 'Biceps'],
    secondary: ['Forearms'],
    met: 5.5,
    instructions: [
      'Grip the bar underhand (palms facing you) shoulder-width apart.',
      'Pull up until chin is over the bar, squeezing biceps and lats.',
      'Lower with control to a dead hang.',
    ],
  },
  {
    name: 'Back Extension',
    muscle: 'Back',
    equipment: 'Bodyweight',
    primary: ['Lower Back'],
    secondary: ['Glutes', 'Hamstrings'],
    met: 3.8,
    instructions: [
      'Position yourself on hyper-extension bench with hips resting on upper pad.',
      'Bend forward at waist toward the floor, keeping spine neutral.',
      'Raise torso back until body forms a straight line; do not hyperextend.',
    ],
  },

  // Legs
  {
    name: 'Squat',
    muscle: 'Legs',
    equipment: 'Barbell',
    primary: ['Quads', 'Glutes'],
    secondary: ['Hamstrings', 'Calves', 'Abs/Core'],
    met: 6.0,
    instructions: [
      'Rest barbell securely across upper traps, feet shoulder-width with toes slightly flared.',
      'Brace core, push hips back and bend knees, descending until thighs are parallel or below.',
      'Drive powerfully through mid-foot and heels to return to standing position.',
    ],
  },
  {
    name: 'Front Squat',
    muscle: 'Legs',
    equipment: 'Barbell',
    primary: ['Quads'],
    secondary: ['Glutes', 'Abs/Core'],
    met: 6.0,
    instructions: [
      'Rest bar across front deltoids with elbows held high and chest proud.',
      'Descend deeply keeping torso upright throughout.',
      'Drive up through the heels, keeping elbows elevated.',
    ],
  },
  {
    name: 'Romanian Deadlift',
    muscle: 'Legs',
    equipment: 'Barbell',
    primary: ['Hamstrings', 'Glutes'],
    secondary: ['Lower Back', 'Forearms'],
    met: 5.5,
    instructions: [
      'Hold barbell at hip height with soft knee bend.',
      'Push hips backward as if touching a wall behind you, lowering bar along shins.',
      'Feel deep hamstring stretch, then drive hips forward to lockout.',
    ],
  },
  {
    name: 'Hip Thrust',
    muscle: 'Legs',
    equipment: 'Barbell',
    primary: ['Glutes'],
    secondary: ['Hamstrings', 'Quads'],
    met: 5.0,
    instructions: [
      'Sit on floor with upper back against a bench, barbell padded across hips.',
      'Drive through heels to lift hips until thighs and torso form a straight bridge.',
      'Squeeze glutes hard at the top for 1 full second before lowering.',
    ],
  },
  {
    name: 'Bulgarian Split Squat',
    muscle: 'Legs',
    equipment: 'Dumbbell',
    primary: ['Quads', 'Glutes'],
    secondary: ['Hamstrings', 'Calves'],
    met: 5.5,
    instructions: [
      'Stand a few feet in front of a bench, placing one foot behind you on the bench.',
      'Lower your back knee toward the floor until front thigh is parallel.',
      'Push through front heel to return to top.',
    ],
  },
  {
    name: 'Goblet Squat',
    muscle: 'Legs',
    equipment: 'Dumbbell',
    primary: ['Quads', 'Glutes'],
    secondary: ['Abs/Core'],
    met: 5.0,
    instructions: [
      'Hold a dumbbell vertically against your chest with both hands under top plate.',
      'Squat down between your legs, keeping chest tall and elbows inside knees.',
      'Drive up through your feet to stand tall.',
    ],
  },
  {
    name: 'Dumbbell Lunge',
    muscle: 'Legs',
    equipment: 'Dumbbell',
    primary: ['Quads', 'Glutes'],
    secondary: ['Hamstrings', 'Calves'],
    met: 5.0,
    instructions: [
      'Hold dumbbells by your sides and step forward with one leg.',
      'Lower hips until both knees are bent at approximately 90 degrees.',
      'Push off front foot to step back or walk forward.',
    ],
  },
  {
    name: 'Dumbbell Romanian Deadlift',
    muscle: 'Legs',
    equipment: 'Dumbbell',
    primary: ['Hamstrings', 'Glutes'],
    secondary: ['Lower Back'],
    met: 5.0,
    instructions: [
      'Hold a pair of dumbbells in front of thighs with knees slightly bent.',
      'Hinge hips back while keeping dumbbells glued close to your legs.',
      'Stop when you feel full hamstring stretch and drive hips through.',
    ],
  },
  {
    name: 'Leg Press',
    muscle: 'Legs',
    equipment: 'Machine',
    primary: ['Quads', 'Glutes'],
    secondary: ['Hamstrings'],
    met: 5.5,
    instructions: [
      'Sit comfortably on sled with feet shoulder-width on footplate.',
      'Release safety handles and lower sled until knees reach 90 degrees.',
      'Press through full foot back up without aggressively locking knees.',
    ],
  },
  {
    name: 'Hack Squat',
    muscle: 'Legs',
    equipment: 'Machine',
    primary: ['Quads'],
    secondary: ['Glutes'],
    met: 5.5,
    instructions: [
      'Place shoulders under pads and feet mid-platform.',
      'Squat down until thighs hit 90 degrees or deep quad stretch.',
      'Drive upward through your mid-foot.',
    ],
  },
  {
    name: 'Leg Extension',
    muscle: 'Legs',
    equipment: 'Machine',
    primary: ['Quads'],
    secondary: [],
    met: 3.8,
    instructions: [
      'Align knee joints with machine pivot point, shin pad just above ankles.',
      'Extend legs forward until fully straight, contracting quads hard.',
      'Lower with control under steady resistance.',
    ],
  },
  {
    name: 'Lying Leg Curl',
    muscle: 'Legs',
    equipment: 'Machine',
    primary: ['Hamstrings'],
    secondary: ['Calves'],
    met: 3.8,
    instructions: [
      'Lie face down with roller pad positioned just below calf muscles.',
      'Curl the weight toward glutes, keeping hips pressed flat against bench.',
      'Pause briefly at peak contraction before extending slowly.',
    ],
  },
  {
    name: 'Seated Leg Curl',
    muscle: 'Legs',
    equipment: 'Machine',
    primary: ['Hamstrings'],
    secondary: ['Calves'],
    met: 3.8,
    instructions: [
      'Secure thigh clamp firmly above knees.',
      'Curl heels downward and under seat toward body.',
      'Resist upward slowly back to starting stretch.',
    ],
  },
  {
    name: 'Standing Calf Raise',
    muscle: 'Legs',
    equipment: 'Machine',
    primary: ['Calves'],
    secondary: [],
    met: 3.5,
    instructions: [
      'Place balls of feet on platform ledge, shoulders under pads.',
      'Lower heels as far as comfortable for a deep calf stretch.',
      'Press through big toes up onto tiptoes and hold contraction for 1 second.',
    ],
  },
  {
    name: 'Seated Calf Raise',
    muscle: 'Legs',
    equipment: 'Machine',
    primary: ['Calves'],
    secondary: [],
    met: 3.5,
    instructions: [
      'Place knees under padded bar with balls of feet on block.',
      'Drop heels down for a full soleus stretch.',
      'Raise heels as high as possible, contracting calf muscle.',
    ],
  },
  {
    name: 'Cable Pull Through',
    muscle: 'Legs',
    equipment: 'Cable',
    primary: ['Glutes', 'Hamstrings'],
    secondary: ['Lower Back'],
    met: 4.0,
    instructions: [
      'Attach rope to low pulley and stand facing away, rope between legs.',
      'Hinge at hips pushing butt back.',
      'Drive hips forward, squeezing glutes hard at the top.',
    ],
  },
  {
    name: 'Walking Lunge',
    muscle: 'Legs',
    equipment: 'Bodyweight',
    primary: ['Quads', 'Glutes'],
    secondary: ['Hamstrings', 'Calves'],
    met: 4.8,
    instructions: [
      'Step forward into a lunge, rear knee kissing the ground softly.',
      'Drive through front heel to step directly into the next lunge.',
    ],
  },

  // Shoulders
  {
    name: 'Overhead Press',
    muscle: 'Shoulders',
    equipment: 'Barbell',
    primary: ['Front Delts', 'Side Delts'],
    secondary: ['Triceps', 'Traps', 'Abs/Core'],
    met: 5.0,
    instructions: [
      'Stand tall, feet shoulder-width, bar resting across clavicle with elbows forward.',
      'Brace core and press bar vertically past face, locking out overhead.',
      'Lower barbell under control back to collarbone.',
    ],
  },
  {
    name: 'Upright Row',
    muscle: 'Shoulders',
    equipment: 'Barbell',
    primary: ['Side Delts', 'Traps'],
    secondary: ['Biceps', 'Front Delts'],
    met: 4.0,
    instructions: [
      'Hold barbell with overhand grip slightly narrower than shoulder width.',
      'Pull barbell straight up along torso, leading with elbows until they reach shoulder height.',
      'Lower slowly under control.',
    ],
  },
  {
    name: 'Seated Dumbbell Press',
    muscle: 'Shoulders',
    equipment: 'Dumbbell',
    primary: ['Front Delts', 'Side Delts'],
    secondary: ['Triceps'],
    met: 4.8,
    instructions: [
      'Sit on an upright bench with dumbbells at ear height.',
      'Press dumbbells overhead until arms are extended but not locked.',
      'Lower with control back to shoulder level.',
    ],
  },
  {
    name: 'Arnold Press',
    muscle: 'Shoulders',
    equipment: 'Dumbbell',
    primary: ['Front Delts', 'Side Delts'],
    secondary: ['Triceps'],
    met: 4.5,
    instructions: [
      'Hold dumbbells in front of chest, palms facing you like top of a bicep curl.',
      'As you press upward, rotate palms outward so they face forward at top.',
      'Reverse rotation smoothly as you lower.',
    ],
  },
  {
    name: 'Lateral Raise',
    muscle: 'Shoulders',
    equipment: 'Dumbbell',
    primary: ['Side Delts'],
    secondary: ['Traps'],
    met: 3.8,
    instructions: [
      'Stand with dumbbells at sides, slight forward torso tilt and soft elbow bend.',
      'Raise arms out to sides in a wide arc until elbows are at shoulder height.',
      'Control the descent; do not swing or use body momentum.',
    ],
  },
  {
    name: 'Front Raise',
    muscle: 'Shoulders',
    equipment: 'Dumbbell',
    primary: ['Front Delts'],
    secondary: ['Side Delts'],
    met: 3.8,
    instructions: [
      'Hold dumbbells in front of thighs with overhand grip.',
      'Raise weights straight in front of you until parallel to the floor.',
      'Lower smoothly under tension.',
    ],
  },
  {
    name: 'Rear Delt Fly',
    muscle: 'Shoulders',
    equipment: 'Dumbbell',
    primary: ['Rear Delts'],
    secondary: ['Traps', 'Lats/Upper Back'],
    met: 3.8,
    instructions: [
      'Hinge forward at waist so torso is nearly parallel to floor.',
      'Raise dumbbells out to sides, pinching rear deltoids and upper back.',
      'Lower with control.',
    ],
  },
  {
    name: 'Shoulder Press',
    muscle: 'Shoulders',
    equipment: 'Machine',
    primary: ['Front Delts', 'Side Delts'],
    secondary: ['Triceps'],
    met: 4.5,
    instructions: [
      'Adjust seat so handles start around ear level.',
      'Press upward until arms are fully extended.',
      'Lower smoothly back to starting position.',
    ],
  },
  {
    name: 'Reverse Pec Deck',
    muscle: 'Shoulders',
    equipment: 'Machine',
    primary: ['Rear Delts'],
    secondary: ['Traps', 'Lats/Upper Back'],
    met: 3.8,
    instructions: [
      'Sit facing the machine pad with handles at shoulder level.',
      'Sweep handles backward in a horizontal plane using rear shoulders.',
      'Hold peak contraction for a moment, then return slowly.',
    ],
  },
  {
    name: 'Cable Lateral Raise',
    muscle: 'Shoulders',
    equipment: 'Cable',
    primary: ['Side Delts'],
    secondary: [],
    met: 3.8,
    instructions: [
      'Set low pulley, reach across body to grip handle.',
      'Raise arm out to the side leading with elbow for constant tension.',
      'Lower slowly back across body.',
    ],
  },
  {
    name: 'Face Pull',
    muscle: 'Shoulders',
    equipment: 'Cable',
    primary: ['Rear Delts', 'Traps'],
    secondary: ['Side Delts', 'Biceps'],
    met: 3.8,
    instructions: [
      'Attach rope to upper cable, grip rope ends with thumbs pointing back.',
      'Pull toward eye level, pulling rope apart and rotating hands back.',
      'Squeeze shoulder blades together firmly at the finish.',
    ],
  },
  {
    name: 'Pike Push Up',
    muscle: 'Shoulders',
    equipment: 'Bodyweight',
    primary: ['Front Delts', 'Side Delts'],
    secondary: ['Triceps', 'Abs/Core'],
    met: 4.5,
    instructions: [
      'Assume a pushup position, then walk feet in to raise hips into an inverted V-shape.',
      'Lower head between hands, elbows bending backward.',
      'Press back up through the shoulders.',
    ],
  },

  // Biceps
  {
    name: 'Barbell Curl',
    muscle: 'Biceps',
    equipment: 'Barbell',
    primary: ['Biceps'],
    secondary: ['Forearms'],
    met: 3.8,
    instructions: [
      'Stand upright holding barbell shoulder-width with underhand grip.',
      'Curl the bar upward keeping elbows pinned against ribs.',
      'Squeeze biceps at peak, then lower slowly for complete stretch.',
    ],
  },
  {
    name: 'EZ Bar Curl',
    muscle: 'Biceps',
    equipment: 'Barbell',
    primary: ['Biceps'],
    secondary: ['Forearms'],
    met: 3.8,
    instructions: [
      'Hold curved EZ bar on inner camber for ergonomic wrist comfort.',
      'Curl bar up to chin height and control the downward negative.',
    ],
  },
  {
    name: 'Dumbbell Curl',
    muscle: 'Biceps',
    equipment: 'Dumbbell',
    primary: ['Biceps'],
    secondary: ['Forearms'],
    met: 3.8,
    instructions: [
      'Stand with dumbbells at sides, palms facing inward.',
      'As you curl, supinate wrists so palms face upward at the top.',
      'Lower with control.',
    ],
  },
  {
    name: 'Hammer Curl',
    muscle: 'Biceps',
    equipment: 'Dumbbell',
    primary: ['Biceps', 'Forearms'],
    secondary: [],
    met: 3.8,
    instructions: [
      'Hold dumbbells with neutral grip (palms facing each other) throughout.',
      'Curl weights upward, engaging the brachialis and brachioradialis.',
      'Lower slowly without swinging.',
    ],
  },
  {
    name: 'Incline Dumbbell Curl',
    muscle: 'Biceps',
    equipment: 'Dumbbell',
    primary: ['Biceps'],
    secondary: ['Forearms'],
    met: 3.8,
    instructions: [
      'Lie back on an incline bench set to 45 degrees, arms hanging down.',
      'Curl weights without moving upper arms forward.',
      'Enjoy the deep stretch in the long head of the bicep.',
    ],
  },
  {
    name: 'Concentration Curl',
    muscle: 'Biceps',
    equipment: 'Dumbbell',
    primary: ['Biceps'],
    secondary: [],
    met: 3.5,
    instructions: [
      'Sit on bench, brace elbow against inner thigh.',
      'Curl dumbbell toward face with strict isolation.',
      'Lower fully to full elbow extension.',
    ],
  },
  {
    name: 'Preacher Curl',
    muscle: 'Biceps',
    equipment: 'Machine',
    primary: ['Biceps'],
    secondary: ['Forearms'],
    met: 3.8,
    instructions: [
      'Rest armpits over preacher bench pad, arms extended along the ramp.',
      'Curl handles upward toward shoulders.',
      'Lower under constant tension; avoid hyperextending at the bottom.',
    ],
  },
  {
    name: 'Cable Curl',
    muscle: 'Biceps',
    equipment: 'Cable',
    primary: ['Biceps'],
    secondary: ['Forearms'],
    met: 3.8,
    instructions: [
      'Attach bar to low pulley, stand upright facing cable.',
      'Curl bar up, keeping tension constant through full range of motion.',
    ],
  },

  // Triceps
  {
    name: 'Triceps Pushdown',
    muscle: 'Triceps',
    equipment: 'Cable',
    primary: ['Triceps'],
    secondary: [],
    met: 3.8,
    instructions: [
      'Attach straight or angled bar to high pulley, elbows pinned at sides.',
      'Push bar down until arms are locked out straight.',
      'Squeeze triceps at bottom, then let bar return to chest height.',
    ],
  },
  {
    name: 'Rope Pushdown',
    muscle: 'Triceps',
    equipment: 'Cable',
    primary: ['Triceps'],
    secondary: [],
    met: 3.8,
    instructions: [
      'Grip rope attachment near bottom knots.',
      'Push down and flare rope ends apart at the bottom for peak triceps contraction.',
      'Return slowly under control.',
    ],
  },
  {
    name: 'Overhead Cable Extension',
    muscle: 'Triceps',
    equipment: 'Cable',
    primary: ['Triceps'],
    secondary: [],
    met: 3.8,
    instructions: [
      'Face away from cable, hold rope behind head with elbows pointed forward.',
      'Extend arms overhead, targeting the long head of triceps.',
      'Return to deep stretch behind neck.',
    ],
  },
  {
    name: 'Skull Crusher',
    muscle: 'Triceps',
    equipment: 'Barbell',
    primary: ['Triceps'],
    secondary: [],
    met: 4.0,
    instructions: [
      'Lie on flat bench holding EZ bar overhead with arms straight.',
      'Hinge at elbows to lower bar toward forehead or just beyond crown.',
      'Extend arms back to starting position using triceps.',
    ],
  },
  {
    name: 'Close-Grip Bench Press',
    muscle: 'Triceps',
    equipment: 'Barbell',
    primary: ['Triceps'],
    secondary: ['Chest', 'Front Delts'],
    met: 5.0,
    instructions: [
      'Lie flat, grip bar shoulder-width (roughly 14 inches apart).',
      'Lower bar to lower chest, tucking elbows close to ribcage.',
      'Press upward locking out triceps firmly.',
    ],
  },
  {
    name: 'Dumbbell Overhead Extension',
    muscle: 'Triceps',
    equipment: 'Dumbbell',
    primary: ['Triceps'],
    secondary: [],
    met: 3.8,
    instructions: [
      'Hold a single dumbbell with both hands cupping the upper plate overhead.',
      'Lower dumbbell behind head by bending elbows.',
      'Press weight straight back up overhead.',
    ],
  },
  {
    name: 'Triceps Extension',
    muscle: 'Triceps',
    equipment: 'Machine',
    primary: ['Triceps'],
    secondary: [],
    met: 3.8,
    instructions: [
      'Sit comfortably with elbows resting on pad aligned with machine pivot.',
      'Push handles forward and down to full arm extension.',
      'Control the return to starting stretch.',
    ],
  },
  {
    name: 'Triceps Dip',
    muscle: 'Triceps',
    equipment: 'Bodyweight',
    primary: ['Triceps'],
    secondary: ['Chest', 'Front Delts'],
    met: 4.8,
    instructions: [
      'Keep torso upright on parallel bars to bias triceps over chest.',
      'Lower body until elbows are at 90 degrees.',
      'Push straight back up to full lockout.',
    ],
  },

  // Core
  {
    name: 'Crunch',
    muscle: 'Core',
    equipment: 'Bodyweight',
    primary: ['Abs/Core'],
    secondary: [],
    met: 3.5,
    instructions: [
      'Lie on back with knees bent and feet flat on the floor.',
      'Curl shoulders off the ground toward pelvis, contracting abs.',
      'Lower slowly without pulling on neck.',
    ],
  },
  {
    name: 'Hanging Leg Raise',
    muscle: 'Core',
    equipment: 'Bodyweight',
    primary: ['Abs/Core'],
    secondary: ['Forearms'],
    met: 4.5,
    instructions: [
      'Hang from a pull-up bar with overhand grip.',
      'Raise legs up straight to 90 degrees, tilting pelvis to contract lower abs.',
      'Lower with control without swinging.',
    ],
  },
  {
    name: 'Lying Leg Raise',
    muscle: 'Core',
    equipment: 'Bodyweight',
    primary: ['Abs/Core'],
    secondary: [],
    met: 3.8,
    instructions: [
      'Lie flat on back with hands under glutes for lower-back support.',
      'Lift legs together until perpendicular to the floor.',
      'Lower slowly until heels hover just above ground.',
    ],
  },
  {
    name: 'Ab Wheel Rollout',
    muscle: 'Core',
    equipment: 'Bodyweight',
    primary: ['Abs/Core'],
    secondary: ['Lats/Upper Back', 'Shoulders'],
    met: 4.8,
    instructions: [
      'Kneel on floor holding wheel with both hands.',
      'Roll wheel forward, extending body into a straight plank position.',
      'Contract abs hard to pull wheel back to knees.',
    ],
  },
  {
    name: 'Russian Twist',
    muscle: 'Core',
    equipment: 'Bodyweight',
    primary: ['Abs/Core'],
    secondary: [],
    met: 3.8,
    instructions: [
      'Sit on floor with knees bent, torso reclined at 45 degrees, feet elevated.',
      'Rotate torso from side to side, touching floor beside hips.',
    ],
  },
  {
    name: 'Decline Sit Up',
    muscle: 'Core',
    equipment: 'Bodyweight',
    primary: ['Abs/Core'],
    secondary: [],
    met: 4.0,
    instructions: [
      'Lock legs into decline bench, cross arms over chest.',
      'Curl torso up toward knees using abdominal muscles.',
      'Lower slowly under control.',
    ],
  },
  {
    name: 'Cable Crunch',
    muscle: 'Core',
    equipment: 'Cable',
    primary: ['Abs/Core'],
    secondary: [],
    met: 4.0,
    instructions: [
      'Kneel below high pulley holding rope attachment beside ears.',
      'Crunch downward, bringing elbows toward thighs and curling spine.',
      'Hold contraction, then rise slowly under tension.',
    ],
  },
  {
    name: 'Ab Crunch Machine',
    muscle: 'Core',
    equipment: 'Machine',
    primary: ['Abs/Core'],
    secondary: [],
    met: 3.8,
    instructions: [
      'Select desired weight, sit with feet hooked and hold chest handles.',
      'Crunch forward using abdominal strength.',
      'Return slowly to the upright position.',
    ],
  },
];

const seedExercises: Exercise[] = SEED_EXERCISES_SPEC.map((spec, i) => ({
  id: i + 1,
  name: spec.name,
  muscleGroup: spec.muscle,
  equipment: spec.equipment,
  isCustom: false,
  createdAt: 0,
  primaryMuscles: spec.primary,
  secondaryMuscles: spec.secondary,
  metValue: spec.met,
  instructions: spec.instructions,
  thumbnailUrl: undefined,
  gifUrl: undefined,
}));

const idOf = (name: string): number => {
  const ex = seedExercises.find((e) => e.name === name);
  if (!ex) throw new Error(`Seed exercise missing: ${name}`);
  return ex.id;
};

let seedUid = 0;
const re = (name: string, sets: number, reps: number, restSeconds = 90): RoutineExercise => ({
  uid: `seed-${++seedUid}`,
  exerciseId: idOf(name),
  sets,
  reps,
  restSeconds,
});

const now = Date.now();
const seedRoutines: Omit<Routine, 'id'>[] = [
  {
    userId: 1,
    name: 'Push',
    order: 0,
    createdAt: now,
    updatedAt: now,
    exercises: [
      re('Bench Press', 4, 8, 150),
      re('Incline Dumbbell Press', 3, 10, 120),
      re('Overhead Press', 3, 8, 120),
      re('Lateral Raise', 4, 15, 60),
      re('Triceps Pushdown', 3, 12, 60),
    ],
  },
  {
    userId: 1,
    name: 'Pull',
    order: 1,
    createdAt: now,
    updatedAt: now,
    exercises: [
      re('Deadlift', 3, 5, 180),
      re('Lat Pulldown', 3, 10, 90),
      re('Barbell Row', 3, 8, 120),
      re('Face Pull', 3, 15, 60),
      re('Barbell Curl', 3, 10, 60),
    ],
  },
  {
    userId: 1,
    name: 'Legs',
    order: 2,
    createdAt: now,
    updatedAt: now,
    exercises: [
      re('Squat', 4, 6, 180),
      re('Romanian Deadlift', 3, 8, 150),
      re('Leg Press', 3, 12, 120),
      re('Lying Leg Curl', 3, 12, 60),
      re('Standing Calf Raise', 4, 15, 60),
    ],
  },
  {
    userId: 1,
    name: 'Upper Body',
    order: 3,
    createdAt: now,
    updatedAt: now,
    exercises: [
      re('Bench Press', 3, 8, 150),
      re('Seated Cable Row', 3, 10, 90),
      re('Seated Dumbbell Press', 3, 10, 90),
      re('Pull Up', 3, 8, 120),
      re('Hammer Curl', 3, 12, 60),
      re('Rope Pushdown', 3, 12, 60),
    ],
  },
];

db.on('populate', (tx) => {
  tx.table('users').add({ ...DEFAULT_USER, id: 1 });
  tx.table('exercises').bulkAdd(seedExercises);
  tx.table('routines').bulkAdd(seedRoutines);
});

// ───────────────────────── Backup & Restore ─────────────────────────

export interface BackupFile {
  app: 'lift-workout-tracker';
  version: 2;
  exportedAt: string;
  users?: User[];
  exercises: Exercise[];
  routines: Routine[];
  workouts: Workout[];
}

export async function exportBackup(userId?: number): Promise<BackupFile> {
  const [users, exercises, routines, workouts] = await Promise.all([
    db.users.toArray(),
    db.exercises.toArray(),
    userId ? db.routines.where('userId').equals(userId).toArray() : db.routines.toArray(),
    userId ? db.workouts.where('userId').equals(userId).toArray() : db.workouts.toArray(),
  ]);
  return {
    app: 'lift-workout-tracker',
    version: 2,
    exportedAt: new Date().toISOString(),
    users,
    exercises,
    routines,
    workouts,
  };
}

export async function importBackup(data: unknown): Promise<{ workouts: number; routines: number; exercises: number; users: number }> {
  const d = data as Partial<BackupFile>;
  if (!d || typeof d !== 'object' || !Array.isArray(d.exercises) || !Array.isArray(d.workouts) || !Array.isArray(d.routines)) {
    throw new Error('Invalid backup file.');
  }
  await db.transaction('rw', db.users, db.exercises, db.routines, db.workouts, async () => {
    if (Array.isArray(d.users) && d.users.length > 0) {
      await db.users.clear();
      await db.users.bulkPut(d.users as User[]);
    } else {
      const userCount = await db.users.count();
      if (userCount === 0) {
        await db.users.add({ ...DEFAULT_USER, id: 1 });
      }
    }
    await Promise.all([db.exercises.clear(), db.routines.clear(), db.workouts.clear()]);
    await db.exercises.bulkPut(d.exercises as Exercise[]);
    await db.routines.bulkPut((d.routines as Routine[]).map((r) => ({ ...r, userId: r.userId || 1 })));
    await db.workouts.bulkPut(
      (d.workouts as Workout[]).map((w) => ({
        ...w,
        userId: w.userId || 1,
        exerciseIds: w.exerciseIds ?? Array.from(new Set(w.exercises.map((e) => e.exerciseId))),
      })),
    );
  });
  return {
    workouts: d.workouts.length,
    routines: d.routines.length,
    exercises: d.exercises.length,
    users: d.users?.length ?? 1,
  };
}
