import { useState } from 'react';
import { cn } from '../lib/utils';
import { Sheet, SheetTextButton } from './ui';

export type MuscleIntensity = 'primary' | 'secondary' | 'none' | number;

export type MuscleHeatmapData = Record<string, MuscleIntensity>;

interface AnatomyMapProps {
  data?: MuscleHeatmapData;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showLabels?: boolean;
  onSelectMuscle?: (muscle: string) => void;
  selectedMuscle?: string | null;
}

// ───────────────────────── Helper for Muscle Fill Colors ─────────────────────────

function getMuscleColor(
  intensity: MuscleIntensity | undefined,
  isSelected: boolean,
): { fill: string; stroke: string; opacity: number } {
  if (isSelected) {
    return { fill: '#3b82f6', stroke: '#93c5fd', opacity: 1 };
  }
  if (!intensity || intensity === 'none' || intensity === 0) {
    return { fill: '#27272a', stroke: '#3f3f46', opacity: 0.9 };
  }
  if (intensity === 'primary' || (typeof intensity === 'number' && intensity >= 4)) {
    return { fill: '#3b82f6', stroke: '#60a5fa', opacity: 1 }; // Electric Blue
  }
  if (intensity === 'secondary' || (typeof intensity === 'number' && intensity > 0)) {
    return { fill: '#60a5fa', stroke: '#93c5fd', opacity: 0.75 }; // Medium / Secondary Blue
  }
  return { fill: '#27272a', stroke: '#3f3f46', opacity: 0.9 };
}

// ───────────────────────── Dual Front & Back Anatomy SVG ─────────────────────────

export function AnatomyMap({
  data = {},
  className,
  size = 'md',
  onSelectMuscle,
  selectedMuscle,
}: AnatomyMapProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  const activeHover = hovered ?? selectedMuscle;

  const handleClick = (muscle: string) => {
    onSelectMuscle?.(muscle);
  };

  const getStyle = (muscleName: string) => {
    const intensity = data[muscleName];
    const isSelected = selectedMuscle === muscleName || hovered === muscleName;
    return getMuscleColor(intensity, isSelected);
  };

  const dims = size === 'sm' ? { w: 130, h: 220 } : size === 'lg' ? { w: 180, h: 300 } : { w: 150, h: 250 };

  return (
    <div className={cn('flex flex-col items-center select-none', className)}>
      <div className="flex items-center justify-center gap-4 sm:gap-8">
        {/* FRONT BODY */}
        <div className="flex flex-col items-center">
          <span className="mb-1 text-[11px] font-bold tracking-wider text-zinc-500 uppercase">
            Front
          </span>
          <svg
            width={dims.w}
            height={dims.h}
            viewBox="0 0 160 270"
            className="overflow-visible"
          >
            <g transform="translate(0, 0)">
              {/* Head & Neck (Neutral) */}
              <ellipse cx="80" cy="22" rx="14" ry="17" fill="#1f1f23" stroke="#3f3f46" strokeWidth="1.2" />
              <path d="M 73 37 Q 73 48 68 53 L 92 53 Q 87 48 87 37 Z" fill="#27272a" stroke="#3f3f46" strokeWidth="1" />

              {/* Traps (Front) */}
              {(() => {
                const s = getStyle('Traps');
                return (
                  <path
                    d="M 68 53 L 52 64 L 60 67 L 72 56 Z M 92 53 L 108 64 L 100 67 L 88 56 Z"
                    fill={s.fill}
                    stroke={s.stroke}
                    strokeWidth="1.2"
                    opacity={s.opacity}
                    cursor="pointer"
                    onMouseEnter={() => setHovered('Traps')}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => handleClick('Traps')}
                  />
                );
              })()}

              {/* Front Delts (Left & Right) */}
              {(() => {
                const s = getStyle('Front Delts');
                return (
                  <g
                    cursor="pointer"
                    onMouseEnter={() => setHovered('Front Delts')}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => handleClick('Front Delts')}
                  >
                    <path
                      d="M 52 64 C 44 68 39 77 39 88 C 44 88 48 84 52 78 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth="1.2"
                      opacity={s.opacity}
                    />
                    <path
                      d="M 108 64 C 116 68 121 77 121 88 C 116 88 112 84 108 78 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth="1.2"
                      opacity={s.opacity}
                    />
                  </g>
                );
              })()}

              {/* Side Delts (Front view angle) */}
              {(() => {
                const s = getStyle('Side Delts');
                return (
                  <g
                    cursor="pointer"
                    onMouseEnter={() => setHovered('Side Delts')}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => handleClick('Side Delts')}
                  >
                    <path
                      d="M 39 76 C 36 82 35 90 37 96 C 41 94 42 88 42 84 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth="1.2"
                      opacity={s.opacity}
                    />
                    <path
                      d="M 121 76 C 124 82 125 90 123 96 C 119 94 118 88 118 84 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth="1.2"
                      opacity={s.opacity}
                    />
                  </g>
                );
              })()}

              {/* Chest (Left & Right Pectorals) */}
              {(() => {
                const s = getStyle('Chest');
                return (
                  <g
                    cursor="pointer"
                    onMouseEnter={() => setHovered('Chest')}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => handleClick('Chest')}
                  >
                    <path
                      d="M 78 57 L 55 68 C 55 86 65 95 78 96 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth="1.2"
                      opacity={s.opacity}
                    />
                    <path
                      d="M 82 57 L 105 68 C 105 86 95 95 82 96 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth="1.2"
                      opacity={s.opacity}
                    />
                  </g>
                );
              })()}

              {/* Biceps (Front) */}
              {(() => {
                const s = getStyle('Biceps');
                return (
                  <g
                    cursor="pointer"
                    onMouseEnter={() => setHovered('Biceps')}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => handleClick('Biceps')}
                  >
                    <path
                      d="M 40 88 C 36 96 35 110 40 118 C 45 118 48 108 47 95 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth="1.2"
                      opacity={s.opacity}
                    />
                    <path
                      d="M 120 88 C 124 96 125 110 120 118 C 115 118 112 108 113 95 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth="1.2"
                      opacity={s.opacity}
                    />
                  </g>
                );
              })()}

              {/* Forearms (Front) */}
              {(() => {
                const s = getStyle('Forearms');
                return (
                  <g
                    cursor="pointer"
                    onMouseEnter={() => setHovered('Forearms')}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => handleClick('Forearms')}
                  >
                    <path
                      d="M 39 120 C 33 130 30 148 35 156 C 39 156 44 144 44 126 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth="1.2"
                      opacity={s.opacity}
                    />
                    <path
                      d="M 121 120 C 127 130 130 148 125 156 C 121 156 116 144 116 126 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth="1.2"
                      opacity={s.opacity}
                    />
                  </g>
                );
              })()}

              {/* Abs & Core */}
              {(() => {
                const s = getStyle('Abs/Core');
                return (
                  <g
                    cursor="pointer"
                    onMouseEnter={() => setHovered('Abs/Core')}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => handleClick('Abs/Core')}
                  >
                    {/* Upper Abs */}
                    <rect x="68" y="99" width="10" height="9" rx="2" fill={s.fill} stroke={s.stroke} strokeWidth="1" opacity={s.opacity} />
                    <rect x="82" y="99" width="10" height="9" rx="2" fill={s.fill} stroke={s.stroke} strokeWidth="1" opacity={s.opacity} />
                    {/* Mid Abs */}
                    <rect x="68" y="110" width="10" height="9" rx="2" fill={s.fill} stroke={s.stroke} strokeWidth="1" opacity={s.opacity} />
                    <rect x="82" y="110" width="10" height="9" rx="2" fill={s.fill} stroke={s.stroke} strokeWidth="1" opacity={s.opacity} />
                    {/* Lower Abs */}
                    <path d="M 68 121 L 78 121 L 77 133 L 70 128 Z" fill={s.fill} stroke={s.stroke} strokeWidth="1" opacity={s.opacity} />
                    <path d="M 82 121 L 92 121 L 90 128 L 83 133 Z" fill={s.fill} stroke={s.stroke} strokeWidth="1" opacity={s.opacity} />
                    {/* Obliques */}
                    <path d="M 64 100 C 62 112 60 126 66 132 C 67 122 66 110 66 100 Z" fill={s.fill} stroke={s.stroke} strokeWidth="1" opacity={s.opacity} />
                    <path d="M 96 100 C 98 112 100 126 94 132 C 93 122 94 110 94 100 Z" fill={s.fill} stroke={s.stroke} strokeWidth="1" opacity={s.opacity} />
                  </g>
                );
              })()}

              {/* Pelvis / Hips (Neutral) */}
              <polygon points="66,134 94,134 90,146 70,146" fill="#1f1f23" stroke="#3f3f46" strokeWidth="1" />

              {/* Quads (Front Thighs) */}
              {(() => {
                const s = getStyle('Quads');
                return (
                  <g
                    cursor="pointer"
                    onMouseEnter={() => setHovered('Quads')}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => handleClick('Quads')}
                  >
                    <path
                      d="M 67 146 C 60 158 56 182 64 200 C 72 200 76 186 77 166 C 77 154 75 146 67 146 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth="1.2"
                      opacity={s.opacity}
                    />
                    <path
                      d="M 93 146 C 100 158 104 182 96 200 C 88 200 84 186 83 166 C 83 154 85 146 93 146 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth="1.2"
                      opacity={s.opacity}
                    />
                  </g>
                );
              })()}

              {/* Adductors (Inner Thighs) */}
              {(() => {
                const s = getStyle('Adductors');
                return (
                  <g
                    cursor="pointer"
                    onMouseEnter={() => setHovered('Adductors')}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => handleClick('Adductors')}
                  >
                    <path d="M 76 150 L 78 178 L 74 178 Z" fill={s.fill} stroke={s.stroke} strokeWidth="1" opacity={s.opacity} />
                    <path d="M 84 150 L 82 178 L 86 178 Z" fill={s.fill} stroke={s.stroke} strokeWidth="1" opacity={s.opacity} />
                  </g>
                );
              })()}

              {/* Knees (Neutral) */}
              <ellipse cx="66" cy="204" rx="6" ry="4" fill="#27272a" stroke="#3f3f46" strokeWidth="1" />
              <ellipse cx="94" cy="204" rx="6" ry="4" fill="#27272a" stroke="#3f3f46" strokeWidth="1" />

              {/* Calves (Front Shin / Calves) */}
              {(() => {
                const s = getStyle('Calves');
                return (
                  <g
                    cursor="pointer"
                    onMouseEnter={() => setHovered('Calves')}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => handleClick('Calves')}
                  >
                    <path
                      d="M 61 210 C 58 220 59 238 63 252 C 67 252 71 240 70 220 C 70 212 67 210 61 210 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth="1.2"
                      opacity={s.opacity}
                    />
                    <path
                      d="M 99 210 C 102 220 101 238 97 252 C 93 252 89 240 90 220 C 90 212 93 210 99 210 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth="1.2"
                      opacity={s.opacity}
                    />
                  </g>
                );
              })()}
            </g>
          </svg>
        </div>

        {/* BACK BODY */}
        <div className="flex flex-col items-center">
          <span className="mb-1 text-[11px] font-bold tracking-wider text-zinc-500 uppercase">
            Back
          </span>
          <svg
            width={dims.w}
            height={dims.h}
            viewBox="0 0 160 270"
            className="overflow-visible"
          >
            <g transform="translate(0, 0)">
              {/* Head & Neck (Back) */}
              <ellipse cx="80" cy="22" rx="14" ry="17" fill="#1f1f23" stroke="#3f3f46" strokeWidth="1.2" />

              {/* Traps (Upper & Mid Trapezius) */}
              {(() => {
                const s = getStyle('Traps');
                return (
                  <path
                    d="M 80 39 L 68 53 L 56 64 L 74 76 L 80 92 L 86 76 L 104 64 L 92 53 Z"
                    fill={s.fill}
                    stroke={s.stroke}
                    strokeWidth="1.2"
                    opacity={s.opacity}
                    cursor="pointer"
                    onMouseEnter={() => setHovered('Traps')}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => handleClick('Traps')}
                  />
                );
              })()}

              {/* Rear Delts (Back) */}
              {(() => {
                const s = getStyle('Rear Delts');
                return (
                  <g
                    cursor="pointer"
                    onMouseEnter={() => setHovered('Rear Delts')}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => handleClick('Rear Delts')}
                  >
                    <path
                      d="M 56 64 C 48 68 42 77 42 86 C 48 85 54 80 56 72 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth="1.2"
                      opacity={s.opacity}
                    />
                    <path
                      d="M 104 64 C 112 68 118 77 118 86 C 112 85 106 80 104 72 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth="1.2"
                      opacity={s.opacity}
                    />
                  </g>
                );
              })()}

              {/* Lats & Upper Back */}
              {(() => {
                const s = getStyle('Lats/Upper Back');
                return (
                  <g
                    cursor="pointer"
                    onMouseEnter={() => setHovered('Lats/Upper Back')}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => handleClick('Lats/Upper Back')}
                  >
                    <path
                      d="M 74 76 C 64 78 54 88 56 112 C 64 116 72 108 77 92 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth="1.2"
                      opacity={s.opacity}
                    />
                    <path
                      d="M 86 76 C 96 78 106 88 104 112 C 96 116 88 108 83 92 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth="1.2"
                      opacity={s.opacity}
                    />
                  </g>
                );
              })()}

              {/* Triceps (Back) */}
              {(() => {
                const s = getStyle('Triceps');
                return (
                  <g
                    cursor="pointer"
                    onMouseEnter={() => setHovered('Triceps')}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => handleClick('Triceps')}
                  >
                    <path
                      d="M 42 86 C 36 94 36 108 41 118 C 47 114 49 100 48 88 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth="1.2"
                      opacity={s.opacity}
                    />
                    <path
                      d="M 118 86 C 124 94 124 108 119 118 C 113 114 111 100 112 88 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth="1.2"
                      opacity={s.opacity}
                    />
                  </g>
                );
              })()}

              {/* Forearms (Back) */}
              {(() => {
                const s = getStyle('Forearms');
                return (
                  <g
                    cursor="pointer"
                    onMouseEnter={() => setHovered('Forearms')}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => handleClick('Forearms')}
                  >
                    <path
                      d="M 40 120 C 33 130 30 148 35 156 C 39 156 44 144 44 126 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth="1.2"
                      opacity={s.opacity}
                    />
                    <path
                      d="M 120 120 C 127 130 130 148 125 156 C 121 156 116 144 116 126 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth="1.2"
                      opacity={s.opacity}
                    />
                  </g>
                );
              })()}

              {/* Lower Back (Erector Spinae) */}
              {(() => {
                const s = getStyle('Lower Back');
                return (
                  <g
                    cursor="pointer"
                    onMouseEnter={() => setHovered('Lower Back')}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => handleClick('Lower Back')}
                  >
                    <path
                      d="M 73 100 L 73 134 L 79 134 L 79 96 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth="1"
                      opacity={s.opacity}
                    />
                    <path
                      d="M 87 100 L 87 134 L 81 134 L 81 96 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth="1"
                      opacity={s.opacity}
                    />
                  </g>
                );
              })()}

              {/* Glutes (Buttocks) */}
              {(() => {
                const s = getStyle('Glutes');
                return (
                  <g
                    cursor="pointer"
                    onMouseEnter={() => setHovered('Glutes')}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => handleClick('Glutes')}
                  >
                    <path
                      d="M 64 134 C 58 144 60 166 79 166 L 79 134 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth="1.2"
                      opacity={s.opacity}
                    />
                    <path
                      d="M 96 134 C 102 144 100 166 81 166 L 81 134 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth="1.2"
                      opacity={s.opacity}
                    />
                  </g>
                );
              })()}

              {/* Hamstrings (Back Thighs) */}
              {(() => {
                const s = getStyle('Hamstrings');
                return (
                  <g
                    cursor="pointer"
                    onMouseEnter={() => setHovered('Hamstrings')}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => handleClick('Hamstrings')}
                  >
                    <path
                      d="M 62 168 C 58 178 57 192 63 202 C 72 202 76 190 77 172 C 77 168 70 168 62 168 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth="1.2"
                      opacity={s.opacity}
                    />
                    <path
                      d="M 98 168 C 102 178 103 192 97 202 C 88 202 84 190 83 172 C 83 168 90 168 98 168 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth="1.2"
                      opacity={s.opacity}
                    />
                  </g>
                );
              })()}

              {/* Calves (Back Gastrocnemius / Soleus) */}
              {(() => {
                const s = getStyle('Calves');
                return (
                  <g
                    cursor="pointer"
                    onMouseEnter={() => setHovered('Calves')}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => handleClick('Calves')}
                  >
                    <path
                      d="M 60 206 C 54 218 56 236 63 252 C 69 252 74 238 72 216 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth="1.2"
                      opacity={s.opacity}
                    />
                    <path
                      d="M 100 206 C 106 218 104 236 97 252 C 91 252 86 238 88 216 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth="1.2"
                      opacity={s.opacity}
                    />
                  </g>
                );
              })()}
            </g>
          </svg>
        </div>
      </div>

      {activeHover && (
        <div className="mt-2 text-center animate-fade-in">
          <span className="rounded-full bg-brand/20 px-3 py-1 text-[13px] font-semibold text-brand">
            {activeHover} {data[activeHover] ? `(${data[activeHover]} sets)` : ''}
          </span>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Full Body Distribution View / Modal ─────────────────────────

interface BodyDistributionModalProps {
  open: boolean;
  onClose: () => void;
  workoutMuscleSets: Record<string, number>;
  totalSets: number;
  workoutDays?: number[]; // indices 0..6 (Mon..Sun)
}

const ALL_MUSCLE_KEYS = [
  'Chest',
  'Lats/Upper Back',
  'Quads',
  'Hamstrings',
  'Front Delts',
  'Side Delts',
  'Rear Delts',
  'Biceps',
  'Triceps',
  'Abs/Core',
  'Glutes',
  'Calves',
  'Traps',
  'Lower Back',
  'Forearms',
];

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function BodyDistributionModal({
  open,
  onClose,
  workoutMuscleSets,
  totalSets,
  workoutDays = [0, 2, 4],
}: BodyDistributionModalProps) {
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);

  const breakdown = ALL_MUSCLE_KEYS.map((muscle) => {
    const sets = workoutMuscleSets[muscle] ?? 0;
    const percentage = totalSets > 0 ? Math.round((sets / totalSets) * 100) : 0;
    return { muscle, sets, percentage };
  })
    .filter((m) => m.sets > 0)
    .sort((a, b) => b.sets - a.sets);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      full
      title="Body Distribution"
      left={<SheetTextButton onClick={onClose}>Done</SheetTextButton>}
    >
      <div className="space-y-6 px-4 pb-28 pt-2">
        {/* Weekly Day Strip (M T W T F S S) */}
        <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/60 p-3.5">
          <div className="mb-2 text-[12px] font-semibold uppercase text-zinc-500 text-center">
            Workouts This Week
          </div>
          <div className="flex justify-between px-2">
            {DAYS.map((d, i) => {
              const isWorkout = workoutDays.includes(i);
              return (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div
                    className={cn(
                      'grid h-8 w-8 place-items-center rounded-full text-[13px] font-bold transition',
                      isWorkout
                        ? 'bg-brand text-white shadow-md shadow-brand/40 ring-1 ring-white/20'
                        : 'bg-zinc-800/80 text-zinc-500',
                    )}
                  >
                    {d}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Dual Anatomy Map Visual */}
        <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/60 py-4 shadow-inner">
          <AnatomyMap
            data={workoutMuscleSets}
            size="md"
            selectedMuscle={selectedMuscle}
            onSelectMuscle={(m) => setSelectedMuscle(m === selectedMuscle ? null : m)}
          />
        </div>

        {/* Muscle Breakdown Table */}
        <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/60 overflow-hidden">
          <div className="grid grid-cols-[1fr_60px_60px] gap-2 border-b border-white/5 bg-zinc-900/60 px-4 py-2.5 text-[11px] font-bold tracking-wider uppercase text-zinc-500">
            <div>Muscle</div>
            <div className="text-right">Sets</div>
            <div className="text-right">% Total</div>
          </div>

          <div className="divide-y divide-white/5">
            {breakdown.length === 0 ? (
              <div className="py-6 text-center text-[14px] text-zinc-500">
                No sets recorded in this period.
              </div>
            ) : (
              breakdown.map((item) => (
                <div
                  key={item.muscle}
                  onClick={() => setSelectedMuscle(item.muscle === selectedMuscle ? null : item.muscle)}
                  className={cn(
                    'grid grid-cols-[1fr_60px_60px] items-center gap-2 px-4 py-3 text-[14px] transition cursor-pointer active:bg-white/5',
                    selectedMuscle === item.muscle && 'bg-brand/10',
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2 w-2 rounded-full bg-brand shrink-0" />
                    <span className="truncate font-semibold text-zinc-200">{item.muscle}</span>
                  </div>
                  <div className="text-right font-bold text-zinc-100 tabular">{item.sets}</div>
                  <div className="text-right font-medium text-zinc-400 tabular">
                    {item.percentage}%
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Total Sets Row */}
          {breakdown.length > 0 && (
            <div className="grid grid-cols-[1fr_60px_60px] items-center gap-2 border-t border-white/10 bg-zinc-900/80 px-4 py-3 text-[14px] font-bold">
              <div className="text-zinc-400">Total Sets</div>
              <div className="text-right text-brand tabular">{totalSets}</div>
              <div className="text-right text-zinc-400 tabular">100%</div>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
