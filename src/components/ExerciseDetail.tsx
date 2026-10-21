import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BookOpen,
  ChartLine,
  Ellipsis,
  Flame,
  Medal,
  Pencil,
  Trash,
  Trophy,
} from 'lucide-react';
import { db, type Exercise, type Id, type WorkoutSet } from '../db';
import {
  cn,
  epley1RM,
  fmtDate,
  fmtNum,
  fmtShortDate,
  isWorkingSet,
  setVolume,
} from '../lib/utils';
import { setLabels } from '../lib/workout';
import { toast } from '../lib/hooks';
import { useAuth } from '../state/AuthContext';
import {
  ActionSheet,
  Alert,
  EmptyState,
  Sheet,
  SheetTextButton,
  type AlertConfig,
} from './ui';
import { CreateExerciseSheet } from './ExercisePicker';
import { AnimatedDemonstration } from './ExerciseMedia';

interface Session {
  workoutId: Id;
  workoutName: string;
  ts: number;
  sets: WorkoutSet[];
  best1RM: number;
  maxWeight: number;
  bestSetVolume: number;
  bestSetVolumeDesc: string;
  sessionVolume: number;
  bestSet?: WorkoutSet;
}

export function ExerciseDetailSheet({
  exerciseId,
  onClose,
}: {
  exerciseId: number | null;
  onClose: () => void;
}) {
  const { currentUser } = useAuth();
  const exercise = useLiveQuery(
    () => (exerciseId ? db.exercises.get(exerciseId) : undefined),
    [exerciseId],
  );
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [alert, setAlert] = useState<AlertConfig | null>(null);

  const remove = (ex: Exercise) =>
    setAlert({
      title: `Delete “${ex.name}”?`,
      message: 'It will be removed from the library and your routines. Past workout logs are kept.',
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: async () => {
        await db.transaction('rw', db.exercises, db.routines, async () => {
          await db.exercises.delete(ex.id);
          const routines = currentUser
            ? await db.routines.where('userId').equals(currentUser.id).toArray()
            : [];
          for (const r of routines) {
            if (r.exercises.some((e) => e.exerciseId === ex.id)) {
              await db.routines.update(r.id, {
                exercises: r.exercises.filter((e) => e.exerciseId !== ex.id),
              });
            }
          }
        });
        toast('Exercise deleted', 'success');
        onClose();
      },
    });

  return (
    <>
      <Sheet
        open={exerciseId != null}
        onClose={onClose}
        full
        title=""
        left={<SheetTextButton onClick={onClose}>Done</SheetTextButton>}
        right={
          exercise?.isCustom ? (
            <button
              aria-label="Exercise options"
              onClick={() => setMenu(true)}
              className="grid h-8 w-8 place-items-center rounded-full text-zinc-400 active:bg-white/10"
            >
              <Ellipsis size={22} />
            </button>
          ) : undefined
        }
      >
        {exercise && <DetailBody exercise={exercise} />}
      </Sheet>

      {exercise && (
        <>
          <ActionSheet
            open={menu}
            onClose={() => setMenu(false)}
            title={exercise.name}
            actions={[
              { label: 'Edit Exercise', icon: Pencil, onClick: () => setEditing(true) },
              { label: 'Delete Exercise', icon: Trash, destructive: true, onClick: () => remove(exercise) },
            ]}
          />
          <CreateExerciseSheet
            open={editing}
            onClose={() => setEditing(false)}
            editing={exercise}
          />
        </>
      )}
      <Alert config={alert} onClose={() => setAlert(null)} />
    </>
  );
}

const TABS = ['Summary', 'History', 'How To'] as const;
type MetricMode = '1RM' | 'MaxWeight' | 'SetVolume';

function DetailBody({ exercise }: { exercise: Exercise }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Summary');
  const { currentUser } = useAuth();

  const sessions = useLiveQuery(async () => {
    const list = await db.workouts
      .where('exerciseIds')
      .equals(exercise.id)
      .toArray();
    const ws = list.filter((w) => !currentUser || w.userId === currentUser.id);
    ws.sort((a, b) => a.startedAt - b.startedAt);
    return ws.map<Session>((w) => {
      const sets = w.exercises.filter((e) => e.exerciseId === exercise.id).flatMap((e) => e.sets);
      let best1RM = 0;
      let maxWeight = 0;
      let sessionVolume = 0;
      let bestSetVolume = 0;
      let bestSetVolumeDesc = '—';
      let bestSet: WorkoutSet | undefined;

      for (const s of sets) {
        sessionVolume += setVolume(s);
        if (!isWorkingSet(s.type)) continue;
        const e1 = epley1RM(s.weight, s.reps);
        if (e1 > best1RM) {
          best1RM = e1;
          bestSet = s;
        }
        maxWeight = Math.max(maxWeight, s.weight);
        const sv = (s.weight || 0) * (s.reps || 0);
        if (sv > bestSetVolume) {
          bestSetVolume = sv;
          bestSetVolumeDesc = `${fmtNum(s.weight, 1)}kg × ${s.reps}`;
        }
      }
      return {
        workoutId: w.id,
        workoutName: w.name,
        ts: w.startedAt,
        sets,
        best1RM,
        maxWeight,
        bestSetVolume,
        bestSetVolumeDesc,
        sessionVolume,
        bestSet,
      };
    });
  }, [exercise.id, currentUser?.id]);

  return (
    <div className="pb-28">
      {/* Top Banner: Animated Exercise Demonstration */}
      <div className="px-4 pt-1">
        <AnimatedDemonstration
          name={exercise.name}
          muscle={exercise.muscleGroup}
          equipment={exercise.equipment}
          gifUrl={exercise.gifUrl}
          thumbnailUrl={exercise.thumbnailUrl}
        />
      </div>

      {/* Exercise Title & Muscle Badges */}
      <div className="px-5 pt-3.5 pb-2">
        <h2 className="text-[24px] font-extrabold tracking-tight text-zinc-100">
          {exercise.name}
        </h2>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px]">
          <span className="font-semibold text-brand">
            Primary: {exercise.primaryMuscles?.join(', ') || exercise.muscleGroup}
          </span>
          {exercise.secondaryMuscles && exercise.secondaryMuscles.length > 0 && (
            <span className="text-zinc-500">
              · Secondary: {exercise.secondaryMuscles.join(', ')}
            </span>
          )}
          <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-[11px] font-semibold text-zinc-400">
            {exercise.equipment}
          </span>
          <span className="rounded-md bg-orange-500/15 px-2 py-0.5 text-[11px] font-semibold text-orange-400 flex items-center gap-1">
            <Flame size={12} /> {exercise.metValue ?? 4.5} MET
          </span>
        </div>
      </div>

      {/* Tabs (Summary / History / How To) */}
      <div className="sticky top-0 z-10 bg-zinc-900/95 px-4 pt-2 pb-3 backdrop-blur-xl">
        <div className="grid grid-cols-3 rounded-xl bg-zinc-800/80 p-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'rounded-lg py-2 text-[14px] font-semibold transition-all',
                tab === t ? 'bg-zinc-700 text-white shadow-md' : 'text-zinc-400',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Contents */}
      {tab === 'Summary' && (
        <HevySummaryTab
          sessions={sessions ?? []}
          userWeight={currentUser?.weightKg ?? 78}
        />
      )}
      {tab === 'History' && <HevyHistoryTab sessions={sessions ?? []} />}
      {tab === 'How To' && <HevyHowToTab exercise={exercise} />}
    </div>
  );
}

// ───────────────────────── Hevy Summary Tab ─────────────────────────

function HevySummaryTab({
  sessions,
  userWeight,
}: {
  sessions: Session[];
  userWeight: number;
}) {
  const [metric, setMetric] = useState<MetricMode>('1RM');

  // Overall Personal Records across all sessions
  const prs = useMemo(() => {
    let heaviestWeight = 0;
    let best1RM = 0;
    let bestSetVolume = 0;
    let bestSetVolumeStr = '—';
    let bestSessionVolume = 0;

    for (const s of sessions) {
      heaviestWeight = Math.max(heaviestWeight, s.maxWeight);
      best1RM = Math.max(best1RM, s.best1RM);
      bestSessionVolume = Math.max(bestSessionVolume, s.sessionVolume);
      if (s.bestSetVolume > bestSetVolume) {
        bestSetVolume = s.bestSetVolume;
        bestSetVolumeStr = s.bestSetVolumeDesc;
      }
    }
    return { heaviestWeight, best1RM, bestSetVolume, bestSetVolumeStr, bestSessionVolume };
  }, [sessions]);

  // Chart time-series data
  const chartData = useMemo(() => {
    return sessions.map((s) => ({
      ts: s.ts,
      val:
        metric === '1RM'
          ? Number(s.best1RM.toFixed(1))
          : metric === 'MaxWeight'
          ? s.maxWeight
          : s.bestSetVolume,
    }));
  }, [sessions, metric]);

  // Strength Level Bar (1RM to Bodyweight Ratio)
  const strengthRatio = userWeight > 0 ? prs.best1RM / userWeight : 0;
  const strengthInfo = useMemo(() => {
    if (strengthRatio === 0) {
      return { level: 'Beginner', pct: 15, percentile: 'Record workouts to test strength level' };
    }
    if (strengthRatio < 0.75) {
      return { level: 'Beginner', pct: 25, percentile: 'Top 70% of lifters' };
    }
    if (strengthRatio < 1.15) {
      return { level: 'Intermediate', pct: 50, percentile: 'Top 45% of lifters' };
    }
    if (strengthRatio < 1.6) {
      return { level: 'Advanced', pct: 75, percentile: 'Top 15% of lifters' };
    }
    return { level: 'Elite', pct: 95, percentile: 'Top 3% of lifters' };
  }, [strengthRatio]);

  // Set Records Table: 1..12 Reps Max
  const repRecords = useMemo(() => {
    const list: { reps: number; weight: number; actualReps: number; ts: number }[] = [];
    for (let r = 1; r <= 12; r++) {
      let best: { weight: number; actualReps: number; ts: number } | null = null;
      for (const s of sessions) {
        for (const set of s.sets) {
          if (!isWorkingSet(set.type) || set.reps < r) continue;
          if (!best || set.weight > best.weight) {
            best = { weight: set.weight, actualReps: set.reps, ts: s.ts };
          }
        }
      }
      if (best) list.push({ reps: r, ...best });
    }
    return list;
  }, [sessions]);

  return (
    <div className="space-y-5 px-4 pt-1">
      {/* Interactive Line Chart with Hevy 3-Pill Toggle */}
      <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/60 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[14px] font-bold text-zinc-300">
            {metric === '1RM'
              ? 'One Rep Max (Bir Tekrar Maks)'
              : metric === 'MaxWeight'
              ? 'Heaviest Weight (En Yüksek Ağırlık)'
              : 'Best Set Volume (En İyi Set Hacmi)'}
          </div>
          {chartData.length > 0 && (
            <div className="text-[17px] font-extrabold text-brand tabular">
              {fmtNum(chartData[chartData.length - 1]?.val ?? 0, 1)} {metric === 'SetVolume' ? 'kg' : 'kg'}
            </div>
          )}
        </div>

        {chartData.length === 0 ? (
          <div className="grid h-48 place-items-center text-[13px] text-zinc-500">
            No logged sessions for this exercise yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
              <defs>
                <linearGradient id="hevyGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 4" vertical={false} />
              <XAxis
                dataKey="ts"
                tickFormatter={(v) => fmtShortDate(Number(v))}
                stroke="#52525b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                minTickGap={25}
              />
              <YAxis stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} domain={['auto', 'auto']} width={42} />
              <Tooltip
                contentStyle={{
                  background: '#18181b',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 12,
                  fontSize: 13,
                }}
                labelFormatter={(l) => fmtDate(Number(l))}
                formatter={(v) => [`${v} kg`, 'Value']}
              />
              <Area
                type="monotone"
                dataKey="val"
                stroke="#3b82f6"
                strokeWidth={2.8}
                fill="url(#hevyGlow)"
                dot={{ r: 3, fill: '#3b82f6' }}
                activeDot={{ r: 6, fill: '#60a5fa' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {/* 3 Pill Selector Tabs Underneath Chart */}
        <div className="mt-4 grid grid-cols-3 gap-1.5 rounded-xl bg-zinc-900 p-1">
          <button
            onClick={() => setMetric('MaxWeight')}
            className={cn(
              'rounded-lg py-2 text-center text-[12px] font-semibold transition',
              metric === 'MaxWeight' ? 'bg-brand text-white shadow' : 'text-zinc-400 active:text-zinc-200',
            )}
          >
            Heaviest Weight
          </button>
          <button
            onClick={() => setMetric('1RM')}
            className={cn(
              'rounded-lg py-2 text-center text-[12px] font-semibold transition',
              metric === '1RM' ? 'bg-brand text-white shadow' : 'text-zinc-400 active:text-zinc-200',
            )}
          >
            One Rep Max
          </button>
          <button
            onClick={() => setMetric('SetVolume')}
            className={cn(
              'rounded-lg py-2 text-center text-[12px] font-semibold transition',
              metric === 'SetVolume' ? 'bg-brand text-white shadow' : 'text-zinc-400 active:text-zinc-200',
            )}
          >
            Best Set Vol.
          </button>
        </div>
      </div>

      {/* Personal Records (Kişisel Rekorlar) List */}
      <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/60 p-4">
        <div className="mb-3 flex items-center gap-2 text-[14px] font-bold text-zinc-200">
          <Trophy size={16} className="text-amber-400" />
          Personal Records (Kişisel Rekorlar)
        </div>
        <div className="divide-y divide-white/5 text-[14px]">
          <div className="flex items-center justify-between py-2.5">
            <span className="text-zinc-400">Heaviest Weight</span>
            <span className="font-bold text-zinc-100 tabular">
              {prs.heaviestWeight > 0 ? `${fmtNum(prs.heaviestWeight, 1)} kg` : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <span className="text-zinc-400">Best 1RM (Epley)</span>
            <span className="font-bold text-brand tabular">
              {prs.best1RM > 0 ? `${fmtNum(prs.best1RM, 1)} kg` : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <span className="text-zinc-400">Best Set Volume</span>
            <span className="font-bold text-zinc-100 tabular">{prs.bestSetVolumeStr}</span>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <span className="text-zinc-400">Best Session Volume</span>
            <span className="font-bold text-zinc-100 tabular">
              {prs.bestSessionVolume > 0 ? `${fmtNum(prs.bestSessionVolume, 0)} kg` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Strength Level Bar (Güç Seviyesi) */}
      <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/60 p-4">
        <div className="flex items-baseline justify-between">
          <div className="text-[14px] font-bold text-zinc-200">
            Strength Level (Güç Seviyesi)
          </div>
          <div className="text-[13px] font-semibold text-brand">
            {strengthInfo.level}
            {strengthRatio > 0 && ` · ${fmtNum(strengthRatio, 2)}x BW`}
          </div>
        </div>

        {/* 4 Segment Progress Bar */}
        <div className="relative mt-3 h-2.5 w-full overflow-hidden rounded-full bg-zinc-800 flex">
          <div className="h-full w-1/4 bg-zinc-600 border-r border-zinc-900" />
          <div className="h-full w-1/4 bg-blue-500/70 border-r border-zinc-900" />
          <div className="h-full w-1/4 bg-brand border-r border-zinc-900" />
          <div className="h-full w-1/4 bg-purple-500" />
          {/* Active Indicator Pin */}
          <div
            className="absolute top-0 bottom-0 w-2.5 -translate-x-1/2 rounded-full bg-white shadow-lg ring-2 ring-brand"
            style={{ left: `${strengthInfo.pct}%` }}
          />
        </div>

        <div className="mt-2 flex justify-between text-[11px] font-semibold text-zinc-500 uppercase">
          <span>Beginner</span>
          <span>Interm.</span>
          <span>Adv.</span>
          <span>Elite</span>
        </div>
        <p className="mt-2 text-[12px] text-zinc-400">{strengthInfo.percentile}</p>
      </div>

      {/* Set Records Table: 1..12 RM */}
      <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/60 overflow-hidden">
        <div className="grid grid-cols-[70px_1fr_auto] gap-2 border-b border-white/5 bg-zinc-900/60 px-4 py-2.5 text-[11px] font-bold tracking-wider uppercase text-zinc-500">
          <div>Reps</div>
          <div>Personal Record</div>
          <div>Date</div>
        </div>
        <div className="divide-y divide-white/5">
          {repRecords.length === 0 ? (
            <div className="py-6 text-center text-[13px] text-zinc-500">
              No rep records logged yet.
            </div>
          ) : (
            repRecords.map((r) => (
              <div
                key={r.reps}
                className="grid grid-cols-[70px_1fr_auto] items-center gap-2 px-4 py-2.5 text-[14px]"
              >
                <div className="flex items-center gap-1.5 font-bold tabular text-zinc-300">
                  {r.reps === 1 && <Medal size={14} className="text-amber-400" />}
                  {r.reps} RM
                </div>
                <div className="font-semibold tabular text-zinc-100">
                  {fmtNum(r.weight, 1)} kg
                  {r.actualReps > r.reps && (
                    <span className="ml-1 text-[12px] font-normal text-zinc-500">
                      ({r.actualReps} reps)
                    </span>
                  )}
                </div>
                <div className="text-[12px] text-zinc-500">{fmtShortDate(r.ts)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Hevy History Tab ─────────────────────────

function HevyHistoryTab({ sessions }: { sessions: Session[] }) {
  const list = [...sessions].reverse();

  if (list.length === 0) {
    return (
      <EmptyState
        icon={ChartLine}
        title="No workouts recorded"
        text="When you perform this exercise in any workout session, its sets will be logged here."
      />
    );
  }

  return (
    <div className="space-y-3 px-4 pt-1">
      {list.map((s) => {
        const labels = setLabels(s.sets);
        return (
          <div
            key={s.workoutId}
            className="rounded-2xl border border-white/[0.06] bg-zinc-950/60 p-4"
          >
            <div className="flex items-baseline justify-between">
              <div className="font-bold text-zinc-100">{s.workoutName}</div>
              <div className="text-[13px] text-zinc-500">
                {fmtDate(s.ts, { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            </div>

            <div className="mt-3 space-y-1.5 border-t border-white/5 pt-2.5">
              {s.sets.map((set, i) => {
                const e1 = isWorkingSet(set.type) ? epley1RM(set.weight, set.reps) : 0;
                return (
                  <div key={set.uid ?? i} className="flex items-center gap-3 text-[14px]">
                    <span
                      className={cn(
                        'w-6 text-center font-bold tabular',
                        labels[i] === 'W'
                          ? 'text-amber-400'
                          : labels[i] === 'D'
                          ? 'text-blue-400'
                          : labels[i] === 'F'
                          ? 'text-red-500'
                          : 'text-zinc-500',
                      )}
                    >
                      {labels[i]}
                    </span>
                    <span className="flex-1 font-semibold tabular text-zinc-200">
                      {fmtNum(set.weight, 1)} kg × {set.reps}
                    </span>
                    {e1 > 0 && (
                      <span className="text-[12px] text-zinc-500 tabular">
                        {fmtNum(e1, 1)} e1RM
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex gap-4 border-t border-white/5 pt-2 text-[12px] text-zinc-500">
              <span>
                Best 1RM: <b className="text-zinc-200">{fmtNum(s.best1RM, 1)} kg</b>
              </span>
              <span>
                Volume: <b className="text-zinc-200">{fmtNum(s.sessionVolume, 0)} kg</b>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────────── Hevy How To Tab ─────────────────────────

function HevyHowToTab({ exercise }: { exercise: Exercise }) {
  const instructions = exercise.instructions && exercise.instructions.length > 0
    ? exercise.instructions
    : [
        `Set up with proper posture and position using the ${exercise.equipment}.`,
        `Engage the ${exercise.primaryMuscles?.join(' and ') || exercise.muscleGroup} before starting the eccentric phase.`,
        'Breathe in on the way down, brace your core, and exhale as you press or pull.',
        'Control every repetition through the full active range of motion.',
      ];

  return (
    <div className="space-y-4 px-4 pt-1">
      <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/60 p-4">
        <div className="mb-3 flex items-center gap-2 text-[15px] font-bold text-zinc-100">
          <BookOpen size={17} className="text-brand" /> Instructions (Talimatlar)
        </div>
        <ol className="space-y-3">
          {instructions.map((step, idx) => (
            <li key={idx} className="flex gap-3 text-[14px] leading-relaxed text-zinc-300">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand/20 text-[12px] font-bold text-brand">
                {idx + 1}
              </span>
              <span className="flex-1">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/60 p-4">
        <div className="text-[15px] font-bold text-zinc-100 mb-2">Tips & Safety</div>
        <ul className="list-disc pl-5 space-y-1.5 text-[13px] text-zinc-400">
          <li>Warm up thoroughly with lighter weights before attempting heavy working sets.</li>
          <li>Avoid ego lifting; prioritize joint stability and muscle contraction over raw load.</li>
          <li>If you experience sharp joint discomfort, stop immediately and check your joint alignment.</li>
        </ul>
      </div>
    </div>
  );
}
