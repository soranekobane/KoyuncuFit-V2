import { useEffect, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { cn } from '../lib/utils';
import type { Equipment, MuscleGroup } from '../db';

interface ExerciseThumbnailProps {
  name?: string;
  muscle?: MuscleGroup | string;
  equipment?: Equipment | string;
  exercise?: { name: string; muscleGroup: MuscleGroup | string; equipment?: Equipment | string };
  size?: number;
  className?: string;
}

// ───────────────────────── Dynamic Movement Illustrations ─────────────────────────

function getExerciseTypeKey(name: string, muscle: string, _equipment?: string): string {
  const n = name.toLowerCase();
  if (n.includes('bench') || n.includes('chest press') || n.includes('push up') || n.includes('dip')) return 'chest_press';
  if (n.includes('squat') || n.includes('leg press') || n.includes('lunge')) return 'squat';
  if (n.includes('deadlift') || n.includes('rdl') || n.includes('hip thrust')) return 'deadlift';
  if (n.includes('pull up') || n.includes('chin up') || n.includes('lat pulldown') || n.includes('pulldown')) return 'pulldown';
  if (n.includes('row')) return 'row';
  if (n.includes('overhead press') || n.includes('shoulder press') || n.includes('military')) return 'overhead_press';
  if (n.includes('lateral raise') || n.includes('front raise')) return 'lateral_raise';
  if (n.includes('curl')) return 'curl';
  if (n.includes('triceps') || n.includes('pushdown') || n.includes('extension') || n.includes('skull crusher')) return 'triceps';
  if (muscle === 'Legs') return 'squat';
  if (muscle === 'Chest') return 'chest_press';
  if (muscle === 'Back') return 'row';
  if (muscle === 'Shoulders') return 'overhead_press';
  if (muscle === 'Biceps') return 'curl';
  if (muscle === 'Triceps') return 'triceps';
  return 'general';
}

// ───────────────────────── Circular Thumbnail ─────────────────────────

export function ExerciseThumbnail({
  name: propName,
  muscle: propMuscle,
  equipment: propEquipment,
  exercise,
  size = 44,
  className,
}: ExerciseThumbnailProps) {
  const name = exercise ? exercise.name : (propName ?? '');
  const muscle = exercise ? exercise.muscleGroup : (propMuscle ?? 'General');
  const equipment = exercise ? (exercise.equipment ?? 'Barbell') : (propEquipment ?? 'Barbell');
  const type = getExerciseTypeKey(name, muscle, equipment);

  const colors: Record<string, { bg: string; fill: string; border: string }> = {
    Chest: { bg: 'from-pink-950/60 to-zinc-900', fill: '#f472b6', border: 'border-pink-500/25' },
    Back: { bg: 'from-blue-950/60 to-zinc-900', fill: '#60a5fa', border: 'border-blue-500/25' },
    Legs: { bg: 'from-emerald-950/60 to-zinc-900', fill: '#34d399', border: 'border-emerald-500/25' },
    Shoulders: { bg: 'from-amber-950/60 to-zinc-900', fill: '#fbbf24', border: 'border-amber-500/25' },
    Biceps: { bg: 'from-violet-950/60 to-zinc-900', fill: '#a78bfa', border: 'border-violet-500/25' },
    Triceps: { bg: 'from-orange-950/60 to-zinc-900', fill: '#fb923c', border: 'border-orange-500/25' },
    Core: { bg: 'from-cyan-950/60 to-zinc-900', fill: '#22d3ee', border: 'border-cyan-500/25' },
  };

  const scheme = colors[muscle] ?? { bg: 'from-zinc-800 to-zinc-900', fill: '#9ca3af', border: 'border-white/10' };

  return (
    <div
      style={{ width: size, height: size }}
      className={cn(
        'relative shrink-0 grid place-items-center rounded-full bg-gradient-to-br border overflow-hidden shadow-inner',
        scheme.bg,
        scheme.border,
        className,
      )}
    >
      <svg width={size * 0.65} height={size * 0.65} viewBox="0 0 36 36" fill="none">
        {type === 'chest_press' && (
          <g stroke={scheme.fill} strokeWidth="2.2" strokeLinecap="round">
            {/* Barbell & Plates */}
            <line x1="4" y1="18" x2="32" y2="18" />
            <line x1="8" y1="13" x2="8" y2="23" strokeWidth="2.8" />
            <line x1="28" y1="13" x2="28" y2="23" strokeWidth="2.8" />
            {/* Lifter Bench Chest silhouette */}
            <circle cx="18" cy="18" r="4" fill={scheme.fill} stroke="none" opacity="0.8" />
          </g>
        )}
        {type === 'squat' && (
          <g stroke={scheme.fill} strokeWidth="2" strokeLinecap="round">
            <line x1="6" y1="10" x2="30" y2="10" strokeWidth="2.4" />
            <circle cx="18" cy="12" r="3.5" fill={scheme.fill} stroke="none" />
            <path d="M 18 16 L 18 24 L 14 30 M 18 24 L 22 30" />
            <line x1="7" y1="7" x2="7" y2="13" strokeWidth="2.8" />
            <line x1="29" y1="7" x2="29" y2="13" strokeWidth="2.8" />
          </g>
        )}
        {type === 'deadlift' && (
          <g stroke={scheme.fill} strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="26" x2="32" y2="26" strokeWidth="2.4" />
            <line x1="6" y1="21" x2="6" y2="31" strokeWidth="3" />
            <line x1="30" y1="21" x2="30" y2="31" strokeWidth="3" />
            <circle cx="18" cy="10" r="3.5" fill={scheme.fill} stroke="none" />
            <path d="M 18 14 L 18 22 L 14 26 M 18 22 L 22 26" />
          </g>
        )}
        {type === 'pulldown' && (
          <g stroke={scheme.fill} strokeWidth="2" strokeLinecap="round">
            <path d="M 6 8 Q 18 12 30 8" strokeWidth="2.5" />
            <line x1="18" y1="4" x2="18" y2="10" />
            <circle cx="18" cy="18" r="3.5" fill={scheme.fill} stroke="none" />
            <path d="M 12 11 L 18 19 L 24 11" />
          </g>
        )}
        {type === 'row' && (
          <g stroke={scheme.fill} strokeWidth="2" strokeLinecap="round">
            <circle cx="13" cy="11" r="3.5" fill={scheme.fill} stroke="none" />
            <path d="M 15 14 L 23 20 L 26 29 M 20 23 L 15 29" />
            <line x1="22" y1="15" x2="28" y2="25" strokeWidth="2.5" />
          </g>
        )}
        {type === 'overhead_press' && (
          <g stroke={scheme.fill} strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="8" x2="32" y2="8" strokeWidth="2.4" />
            <line x1="6" y1="5" x2="6" y2="11" strokeWidth="2.8" />
            <line x1="30" y1="5" x2="30" y2="11" strokeWidth="2.8" />
            <circle cx="18" cy="16" r="3.5" fill={scheme.fill} stroke="none" />
            <path d="M 18 20 L 18 31" />
            <path d="M 12 9 L 18 19 L 24 9" />
          </g>
        )}
        {type === 'curl' && (
          <g stroke={scheme.fill} strokeWidth="2" strokeLinecap="round">
            <circle cx="18" cy="10" r="3.5" fill={scheme.fill} stroke="none" />
            <path d="M 18 14 L 18 28" />
            <path d="M 18 17 L 12 21 L 13 14" strokeWidth="2.4" />
            <circle cx="13" cy="13" r="2" fill={scheme.fill} stroke="none" />
          </g>
        )}
        {type === 'triceps' && (
          <g stroke={scheme.fill} strokeWidth="2" strokeLinecap="round">
            <circle cx="18" cy="10" r="3.5" fill={scheme.fill} stroke="none" />
            <line x1="18" y1="14" x2="18" y2="28" />
            <path d="M 18 17 L 23 22 L 23 28" strokeWidth="2.4" />
          </g>
        )}
        {(type === 'lateral_raise' || type === 'general') && (
          <g stroke={scheme.fill} strokeWidth="2" strokeLinecap="round">
            <circle cx="18" cy="10" r="3.5" fill={scheme.fill} stroke="none" />
            <line x1="18" y1="14" x2="18" y2="28" />
            <path d="M 6 18 Q 18 14 30 18" strokeWidth="2.5" />
            <circle cx="6" cy="18" r="2" fill={scheme.fill} stroke="none" />
            <circle cx="30" cy="18" r="2" fill={scheme.fill} stroke="none" />
          </g>
        )}
      </svg>
    </div>
  );
}

// ───────────────────────── Animated Exercise Demonstration Card ─────────────────────────

interface AnimatedDemonstrationProps {
  name: string;
  muscle: MuscleGroup | string;
  equipment?: Equipment | string;
  gifUrl?: string;
  thumbnailUrl?: string;
  className?: string;
}

export function AnimatedDemonstration({
  name,
  muscle,
  equipment = 'Barbell',
  gifUrl,
  thumbnailUrl,
  className,
}: AnimatedDemonstrationProps) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [frame, setFrame] = useState(0);
  const [imgFrame, setImgFrame] = useState(0);
  const [imgError, setImgError] = useState(false);

  const type = getExerciseTypeKey(name, muscle, equipment);

  // SVG vector animation loop
  useEffect(() => {
    if (!isPlaying) return;
    const interval = window.setInterval(() => {
      setFrame((f) => (f + 1) % 40); // 40-step continuous cycle
    }, 50); // ~20 fps smooth loop
    return () => window.clearInterval(interval);
  }, [isPlaying]);

  // Two-frame exercise demonstration cycle (from free-exercise-db)
  useEffect(() => {
    if (!isPlaying || !gifUrl || imgError) return;
    const timer = window.setInterval(() => {
      setImgFrame((f) => (f === 0 ? 1 : 0));
    }, 700);
    return () => window.clearInterval(timer);
  }, [isPlaying, gifUrl, imgError]);

  const frame0 = gifUrl || thumbnailUrl;
  const frame1 = frame0 ? frame0.replace(/\/0\.jpg$/, '/1.jpg') : undefined;
  const currentImgSrc = imgFrame === 0 ? frame0 : frame1;
  const showImage = !imgError && !!currentImgSrc;

  // Sine-wave oscillation for smooth vector movement between 0 and 1
  const progress = (Math.sin((frame / 40) * Math.PI * 2) + 1) / 2;

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl bg-white text-zinc-900 border border-zinc-200/90 shadow-xl',
        className,
      )}
    >
      {/* Top Banner: Full-width white card */}
      <div className="relative flex h-56 w-full items-center justify-center bg-white p-3">
        {/* Play / Pause Toggle Button */}
        <button
          onClick={() => setIsPlaying((p) => !p)}
          aria-label={isPlaying ? 'Pause animation' : 'Play animation'}
          className="absolute top-3 right-3 z-20 grid h-9 w-9 place-items-center rounded-full bg-zinc-900/80 text-white border border-white/20 shadow-lg backdrop-blur-md transition active:scale-90 hover:bg-zinc-900"
        >
          {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
        </button>

        {showImage && currentImgSrc ? (
          <img
            src={currentImgSrc}
            alt={name}
            onError={() => setImgError(true)}
            className="h-full w-full object-contain select-none"
          />
        ) : (
          /* Dynamic Vector Movement Renderer (Fallback) */
          <svg width="220" height="180" viewBox="0 0 200 160" className="overflow-visible select-none">
            {/* Floor / Platform */}
            <line x1="20" y1="140" x2="180" y2="140" stroke="#e4e4e7" strokeWidth="2" strokeDasharray="4 4" />

          {type === 'chest_press' && (
            <g>
              {/* Bench */}
              <line x1="60" y1="105" x2="140" y2="105" stroke="#71717a" strokeWidth="6" strokeLinecap="round" />
              <line x1="75" y1="105" x2="75" y2="140" stroke="#52525b" strokeWidth="4" />
              <line x1="125" y1="105" x2="125" y2="140" stroke="#52525b" strokeWidth="4" />
              {/* Torso & Head */}
              <circle cx="70" cy="98" r="8" fill="#3b82f6" />
              <line x1="78" y1="100" x2="120" y2="100" stroke="#3b82f6" strokeWidth="8" strokeLinecap="round" />
              {/* Legs */}
              <path d="M 118 102 L 132 118 L 132 140" stroke="#3b82f6" strokeWidth="5" strokeLinecap="round" fill="none" />
              {/* Dynamic Arms & Barbell (Progress: 0 = on chest, 1 = locked out) */}
              {(() => {
                const barY = 96 - progress * 32;
                const elbowY = 104 - progress * 10;
                return (
                  <g>
                    {/* Arms */}
                    <path
                      d={`M 90 98 Q ${88 + (1 - progress) * 8} ${elbowY} 95 ${barY}`}
                      stroke="#60a5fa"
                      strokeWidth="5"
                      strokeLinecap="round"
                      fill="none"
                    />
                    <path
                      d={`M 105 98 Q ${107 - (1 - progress) * 8} ${elbowY} 105 ${barY}`}
                      stroke="#60a5fa"
                      strokeWidth="5"
                      strokeLinecap="round"
                      fill="none"
                    />
                    {/* Barbell */}
                    <line x1="65" y1={barY} x2="135" y2={barY} stroke="#f4f4f5" strokeWidth="3.5" strokeLinecap="round" />
                    <rect x="68" y={barY - 10} width="6" height="20" rx="2" fill="#ef4444" />
                    <rect x="126" y={barY - 10} width="6" height="20" rx="2" fill="#ef4444" />
                  </g>
                );
              })()}
            </g>
          )}

          {type === 'squat' && (
            <g>
              {/* Squatter (Progress: 0 = deep squat, 1 = standing lockout) */}
              {(() => {
                const hipY = 118 - progress * 26;
                const kneeX = 85 - (1 - progress) * 8;
                const kneeY = 120 + (1 - progress) * 4;
                const headY = 62 - progress * 30;
                const barY = headY + 8;
                return (
                  <g>
                    {/* Head */}
                    <circle cx="100" cy={headY} r="8" fill="#3b82f6" />
                    {/* Torso */}
                    <line x1="100" y1={headY + 8} x2="98" y2={hipY} stroke="#3b82f6" strokeWidth="8" strokeLinecap="round" />
                    {/* Legs */}
                    <path
                      d={`M 98 ${hipY} L ${kneeX} ${kneeY} L 95 140`}
                      stroke="#3b82f6"
                      strokeWidth="6"
                      strokeLinecap="round"
                      fill="none"
                    />
                    <path
                      d={`M 98 ${hipY} L ${kneeX + 10} ${kneeY} L 105 140`}
                      stroke="#60a5fa"
                      strokeWidth="6"
                      strokeLinecap="round"
                      fill="none"
                    />
                    {/* Barbell across shoulders */}
                    <line x1="60" y1={barY} x2="140" y2={barY} stroke="#f4f4f5" strokeWidth="4" strokeLinecap="round" />
                    <rect x="62" y={barY - 12} width="8" height="24" rx="2" fill="#10b981" />
                    <rect x="130" y={barY - 12} width="8" height="24" rx="2" fill="#10b981" />
                  </g>
                );
              })()}
            </g>
          )}

          {type === 'deadlift' && (
            <g>
              {/* Deadlifter (Progress: 0 = floor, 1 = lockout) */}
              {(() => {
                const barY = 132 - progress * 38;
                const hipY = 108 - progress * 14;
                const headY = 74 - progress * 24;
                return (
                  <g>
                    <circle cx="100" cy={headY} r="8" fill="#3b82f6" />
                    <line x1="100" y1={headY + 8} x2="96" y2={hipY} stroke="#3b82f6" strokeWidth="8" strokeLinecap="round" />
                    <path
                      d={`M 96 ${hipY} L 90 120 L 96 140`}
                      stroke="#3b82f6"
                      strokeWidth="6"
                      strokeLinecap="round"
                      fill="none"
                    />
                    {/* Arms down to bar */}
                    <line x1="99" y1={headY + 14} x2="100" y2={barY} stroke="#60a5fa" strokeWidth="5" strokeLinecap="round" />
                    {/* Barbell */}
                    <line x1="58" y1={barY} x2="142" y2={barY} stroke="#f4f4f5" strokeWidth="4" strokeLinecap="round" />
                    <circle cx="64" cy={barY} r="12" fill="#3b82f6" />
                    <circle cx="136" cy={barY} r="12" fill="#3b82f6" />
                  </g>
                );
              })()}
            </g>
          )}

          {type === 'pulldown' && (
            <g>
              {/* Seat */}
              <line x1="85" y1="120" x2="115" y2="120" stroke="#71717a" strokeWidth="5" strokeLinecap="round" />
              <line x1="100" y1="120" x2="100" y2="140" stroke="#52525b" strokeWidth="4" />
              {/* Cable machine bar (Progress: 0 = overhead stretch, 1 = chin pull) */}
              {(() => {
                const barY = 40 + progress * 32;
                return (
                  <g>
                    <line x1="100" y1="20" x2="100" y2={barY} stroke="#71717a" strokeWidth="2" />
                    <path d={`M 65 ${barY} Q 100 ${barY + 6} 135 ${barY}`} stroke="#f4f4f5" strokeWidth="3.5" fill="none" />
                    {/* Lifter sitting */}
                    <circle cx="100" cy="80" r="8" fill="#3b82f6" />
                    <line x1="100" y1="88" x2="100" y2="120" stroke="#3b82f6" strokeWidth="8" strokeLinecap="round" />
                    {/* Arms pulling */}
                    <path d={`M 75 ${barY} L 96 85 M 125 ${barY} L 104 85`} stroke="#60a5fa" strokeWidth="5" strokeLinecap="round" />
                  </g>
                );
              })()}
            </g>
          )}

          {type === 'curl' && (
            <g>
              {/* Lifter curling */}
              {(() => {
                const handY = 115 - progress * 32;
                return (
                  <g>
                    <circle cx="100" cy="50" r="8" fill="#3b82f6" />
                    <line x1="100" y1="58" x2="100" y2="105" stroke="#3b82f6" strokeWidth="8" strokeLinecap="round" />
                    <line x1="97" y1="105" x2="97" y2="140" stroke="#3b82f6" strokeWidth="6" strokeLinecap="round" />
                    <line x1="103" y1="105" x2="103" y2="140" stroke="#3b82f6" strokeWidth="6" strokeLinecap="round" />
                    {/* Upper arm pinned, forearm curling */}
                    <path d={`M 100 66 L 98 88 L 108 ${handY}`} stroke="#60a5fa" strokeWidth="5" strokeLinecap="round" fill="none" />
                    {/* Dumbbell */}
                    <line x1="103" y1={handY} x2="117" y2={handY} stroke="#f4f4f5" strokeWidth="3" />
                    <circle cx="103" cy={handY} r="4" fill="#a78bfa" />
                    <circle cx="117" cy={handY} r="4" fill="#a78bfa" />
                  </g>
                );
              })()}
            </g>
          )}

          {type !== 'chest_press' &&
            type !== 'squat' &&
            type !== 'deadlift' &&
            type !== 'pulldown' &&
            type !== 'curl' && (
              <g>
                {/* General lifter movement */}
                <circle cx="100" cy="55" r="8" fill="#3b82f6" />
                <line x1="100" y1="63" x2="100" y2="105" stroke="#3b82f6" strokeWidth="8" strokeLinecap="round" />
                <line x1="97" y1="105" x2="92" y2="140" stroke="#3b82f6" strokeWidth="6" strokeLinecap="round" />
                <line x1="103" y1="105" x2="108" y2="140" stroke="#3b82f6" strokeWidth="6" strokeLinecap="round" />
                {(() => {
                  const armAngle = -20 + progress * 50;
                  const armX = 100 + Math.cos((armAngle * Math.PI) / 180) * 30;
                  const armY = 70 + Math.sin((armAngle * Math.PI) / 180) * 30;
                  return (
                    <g>
                      <line x1="100" y1="70" x2={armX} y2={armY} stroke="#60a5fa" strokeWidth="5" strokeLinecap="round" />
                      <circle cx={armX} cy={armY} r="4" fill="#fbbf24" />
                    </g>
                  );
                })()}
              </g>
            )}
        </svg>
      )}

        {/* Live repetition movement badge */}
        <div className="absolute bottom-2.5 left-3 flex items-center gap-1.5 rounded-full bg-zinc-900/90 px-3 py-1 text-[11px] font-semibold text-zinc-300 border border-white/10 backdrop-blur-md">
          <span className="h-2 w-2 rounded-full bg-brand animate-ping" />
          <span>Form Demo · {equipment}</span>
        </div>
      </div>
    </div>
  );
}
