import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, Clock, Dumbbell, Flame, Layers, Minus, Plus, SkipForward, Trophy, Weight } from 'lucide-react';
import { db } from '../../db';
import { cn, fmtClock, fmtDuration, fmtNum, fmtRest, fmtTime } from '../../lib/utils';
import { activeExerciseFrom, liveTotals, type ActiveExercise } from '../../lib/workout';
import { useBodyLock, useNow } from '../../lib/hooks';
import { useWorkout, type FinishResult } from '../../state/WorkoutContext';
import { Alert, PrimaryButton, Sheet, SheetTextButton, type AlertConfig } from '../ui';
import { WorkoutExercisesEditor } from './ExerciseCard';
import { AnatomyMap, type MuscleHeatmapData } from '../AnatomyMap';

// ───────────────────────── Live logging screen ─────────────────────────

export function ActiveWorkoutScreen({ onFinished }: { onFinished: (r: FinishResult) => void }) {
  const w = useWorkout();
  const a = w.active;
  const now = useNow(1000);
  const [alert, setAlert] = useState<AlertConfig | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  useBodyLock(true);
  if (!a) return null;

  const totals = liveTotals(a.exercises);
  const elapsed = (now - a.startedAt) / 1000;

  const setExercises = (fn: (list: ActiveExercise[]) => ActiveExercise[]) => w.update((x) => ({ ...x, exercises: fn(x.exercises) }));

  const onFinish = () => {
    if (totals.sets === 0) {
      setAlert({
        title: 'No completed sets',
        message: 'Tick ✓ on at least one set to save this workout, or discard it.',
        confirmLabel: 'Discard Workout',
        destructive: true,
        cancelLabel: 'Keep Logging',
        onConfirm: w.discard,
      });
      return;
    }
    setFinishOpen(true);
  };

  const onDiscard = () =>
    setAlert({
      title: 'Discard workout?',
      message: 'All logged sets in this session will be lost.',
      confirmLabel: 'Discard Workout',
      destructive: true,
      onConfirm: w.discard,
    });

  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-black">
      <div className="relative flex h-dvh w-full max-w-md animate-sheet-up flex-col bg-[#09090b]">
        <header className="glass z-10 border-b border-white/[0.06] pt-safe">
          <div className="flex items-center justify-between px-3 pt-2 pb-1">
            <button id="minimize-workout" aria-label="Minimize workout" onClick={w.minimize} className="grid h-9 w-9 place-items-center rounded-full bg-zinc-800/80 text-zinc-300 active:scale-90">
              <ChevronDown size={22} />
            </button>
            <div className="text-[17px] font-semibold">Log Workout</div>
            <button id="finish-workout" onClick={onFinish} className="rounded-lg bg-brand px-4 py-1.5 text-[15px] font-semibold text-white shadow-md shadow-brand/30 transition active:scale-95">
              Finish
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1.5 px-3 pt-2 pb-3 text-center">
            <HeaderStat label="Duration" value={fmtClock(elapsed)} accent />
            <HeaderStat label="Volume" value={`${fmtNum(totals.volume, 0)}kg`} />
            <HeaderStat label="Sets" value={String(totals.sets)} />
            <HeaderStat label="Burned" value={`🔥${w.liveCalories}`} isCalories />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overscroll-contain px-3 pt-4 pb-44">
          <div className="mb-4 px-1">
            <input
              id="workout-name"
              value={a.name}
              onChange={(e) => w.update((x) => ({ ...x, name: e.target.value }))}
              className="w-full bg-transparent text-[24px] font-bold tracking-tight outline-none placeholder:text-zinc-600"
              placeholder="Workout name"
            />
            <div className="mt-0.5 text-[13px] text-zinc-500">Started {fmtTime(a.startedAt)}</div>
          </div>

          <WorkoutExercisesEditor
            exercises={a.exercises}
            onChange={setExercises}
            live
            beforeTs={a.startedAt}
            onSetCompleted={(ex) => w.startRest(ex.restSeconds)}
            onAddExercises={(exs) => setExercises((list) => [...list, ...exs.map((e) => activeExerciseFrom(e, { sets: 3 }))])}
          />

          <button id="discard-workout" onClick={onDiscard} className="mt-3 w-full rounded-xl bg-red-500/10 py-3.5 text-[16px] font-semibold text-red-500 active:bg-red-500/20">
            Discard Workout
          </button>
        </main>

        <RestTimerBar />
      </div>

      <FinishSheet open={finishOpen} onClose={() => setFinishOpen(false)} onFinished={onFinished} />
      <Alert config={alert} onClose={() => setAlert(null)} />
    </div>
  );
}

function HeaderStat({ label, value, accent, isCalories }: { label: string; value: string; accent?: boolean; isCalories?: boolean }) {
  return (
    <div className="rounded-lg bg-zinc-900/60 py-1 px-1">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={cn('text-[14px] font-bold tabular truncate', accent && 'text-brand', isCalories && 'text-amber-400')}>{value}</div>
    </div>
  );
}

// ───────────────────────── Floating rest timer ─────────────────────────

export function RestTimerBar() {
  const { rest, adjustRest, skipRest } = useWorkout();
  const now = useNow(250, !!rest);
  if (!rest) return null;
  const remaining = Math.max(0, Math.ceil((rest.endsAt - now) / 1000));
  const pct = Math.min(100, Math.max(0, (remaining / rest.total) * 100));

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
      <div className="glass animate-slide-up overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-black/60">
        <div className="h-1 bg-zinc-800">
          <div className="h-full bg-gradient-to-r from-brand to-indigo-400 transition-[width] duration-300 ease-linear" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center gap-2 px-3 py-3">
          <button id="rest-minus" onClick={() => adjustRest(-15)} className="flex items-center gap-0.5 rounded-lg bg-zinc-800 px-3 py-2 text-[14px] font-semibold text-zinc-200 active:scale-95">
            <Minus size={14} />
            15s
          </button>
          <div className="flex-1 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Rest</div>
            <div className="text-[26px] leading-none font-bold tabular">{fmtRest(remaining)}</div>
          </div>
          <button id="rest-plus" onClick={() => adjustRest(15)} className="flex items-center gap-0.5 rounded-lg bg-zinc-800 px-3 py-2 text-[14px] font-semibold text-zinc-200 active:scale-95">
            <Plus size={14} />
            15s
          </button>
          <button id="rest-skip" onClick={skipRest} className="flex items-center gap-1 rounded-lg bg-brand px-3 py-2 text-[14px] font-semibold text-white active:scale-95">
            Skip <SkipForward size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Finish confirmation ─────────────────────────

function FinishSheet({ open, onClose, onFinished }: { open: boolean; onClose: () => void; onFinished: (r: FinishResult) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Finish Workout" left={<SheetTextButton onClick={onClose}>Back</SheetTextButton>}>
      {open && <FinishBody onFinished={onFinished} />}
    </Sheet>
  );
}

function FinishBody({ onFinished }: { onFinished: (r: FinishResult) => void }) {
  const w = useWorkout();
  const [saving, setSaving] = useState(false);
  const a = w.active;
  if (!a) return null;
  const totals = liveTotals(a.exercises);
  const incomplete = a.exercises.reduce((n, e) => n + e.sets.filter((s) => !s.completed).length, 0);

  const save = async () => {
    setSaving(true);
    try {
      const res = await w.finish();
      if (res) onFinished(res);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 px-4 pb-[max(20px,env(safe-area-inset-bottom))]">
      <input
        value={a.name}
        onChange={(e) => w.update((x) => ({ ...x, name: e.target.value }))}
        className="h-12 w-full rounded-xl bg-zinc-800 px-4 text-[18px] font-semibold outline-none focus:ring-2 focus:ring-brand/60"
        placeholder="Workout name"
      />
      <textarea
        value={a.notes}
        onChange={(e) => w.update((x) => ({ ...x, notes: e.target.value }))}
        placeholder="How did it go? (optional)"
        rows={2}
        className="w-full resize-none rounded-xl bg-zinc-800 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-brand/60"
      />
      <div className="grid grid-cols-4 gap-2 text-center">
        <MiniStat icon={Clock} label="Duration" value={fmtDuration((Date.now() - a.startedAt) / 1000)} />
        <MiniStat icon={Weight} label="Volume" value={`${fmtNum(totals.volume, 0)} kg`} />
        <MiniStat icon={Layers} label="Sets" value={String(totals.sets)} />
        <MiniStat icon={Flame} label="Burned" value={`🔥 ${w.liveCalories}`} isCalories />
      </div>
      {incomplete > 0 && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-[14px] text-amber-200">
          {incomplete} incomplete set{incomplete > 1 ? 's' : ''} will not be saved.
        </div>
      )}
      <PrimaryButton id="save-workout" tone="success" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save Workout'}
      </PrimaryButton>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  isCalories,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  isCalories?: boolean;
}) {
  return (
    <div className="rounded-xl bg-zinc-800/60 px-2 py-3">
      <Icon size={16} className={cn('mx-auto', isCalories ? 'text-amber-400' : 'text-zinc-500')} />
      <div className={cn('mt-1 text-[15px] font-bold tabular truncate', isCalories && 'text-amber-300')}>{value}</div>
      <div className="text-[11px] text-zinc-500">{label}</div>
    </div>
  );
}

// ───────────────────────── Workout complete summary ─────────────────────────

export function WorkoutCompleteSheet({ result, onClose }: { result: FinishResult | null; onClose: () => void }) {
  return (
    <Sheet open={!!result} onClose={onClose} full>
      {result && <CompleteBody result={result} onClose={onClose} />}
    </Sheet>
  );
}

function CompleteBody({ result, onClose }: { result: FinishResult; onClose: () => void }) {
  const count = useLiveQuery(() => db.workouts.count(), []);
  const allExercises = useLiveQuery(() => db.exercises.toArray(), []);
  const { workout, prs } = result;

  // Build muscle heatmap from completed workout exercises
  const heatmapData: MuscleHeatmapData = {};
  if (allExercises && allExercises.length > 0) {
    const exerciseMap = new Map(allExercises.map((e) => [e.id, e]));
    for (const exItem of workout.exercises) {
      const match = exerciseMap.get(exItem.exerciseId);
      if (match) {
        match.primaryMuscles?.forEach((m) => {
          heatmapData[m] = 'primary';
        });
        match.secondaryMuscles?.forEach((m) => {
          if (!heatmapData[m]) {
            heatmapData[m] = 'secondary';
          }
        });
      }
    }
  }

  return (
    <div className="space-y-4 px-5 pb-[max(32px,env(safe-area-inset-bottom))] pt-2 text-center">
      <div className="relative mx-auto mt-2 mb-2 grid h-16 w-16 animate-pop place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 text-zinc-900 shadow-[0_0_50px_-10px] shadow-amber-500">
        <Trophy size={32} strokeWidth={2.2} />
      </div>
      <div>
        <h2 className="text-[24px] font-bold tracking-tight">Workout Complete!</h2>
        <p className="mt-0.5 text-[14px] text-zinc-400">{count ? `That's workout #${count}. Fantastic effort! 💪` : 'Great job!'}</p>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <MiniStat icon={Clock} label="Duration" value={fmtDuration(workout.durationSec)} />
        <MiniStat icon={Weight} label="Volume" value={`${fmtNum(workout.totalVolume, 0)} kg`} />
        <MiniStat icon={Dumbbell} label="Sets" value={String(workout.totalSets)} />
        <MiniStat icon={Flame} label="Burned" value={`🔥 ${workout.caloriesBurned || 0}`} isCalories />
      </div>

      {prs.length > 0 && (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] p-4 text-left">
          <div className="mb-2 flex items-center gap-2 text-[14px] font-semibold text-amber-300">
            <Trophy size={16} /> {prs.length} Personal Record{prs.length > 1 ? 's' : ''}
          </div>
          <div className="space-y-1.5">
            {prs.map((p, i) => (
              <div key={i} className="flex justify-between gap-3 text-[14px]">
                <span className="truncate text-zinc-200">
                  {p.exerciseName} <span className="text-zinc-500">· {p.kind}</span>
                </span>
                <span className="shrink-0 font-semibold text-amber-200 tabular">
                  {fmtNum(p.value)} kg <span className="text-[12px] font-normal text-zinc-500">(+{fmtNum(p.value - p.previous)})</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Anatomical Body Heatmap of muscles hit */}
      <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/80 p-4 text-left">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[13px] font-bold uppercase tracking-wider text-zinc-400">Muscles Worked</span>
          <div className="flex items-center gap-3 text-[11px] text-zinc-400">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-brand" /> Primary
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#60a5fa]" /> Secondary
            </span>
          </div>
        </div>
        <AnatomyMap data={heatmapData} size="sm" className="my-1" />
      </div>

      <div className="space-y-1.5 rounded-2xl border border-white/[0.06] bg-zinc-900/40 p-3 text-left">
        <div className="text-[12px] font-bold uppercase tracking-wider text-zinc-500 px-1 mb-1">Exercise Breakdown</div>
        {workout.exercises.map((e) => (
          <div key={e.uid} className="flex justify-between text-[14px] px-1 py-0.5">
            <span className="text-zinc-300">{e.name}</span>
            <span className="font-semibold text-zinc-400">{e.sets.length} sets</span>
          </div>
        ))}
      </div>

      <PrimaryButton className="mt-4" onClick={onClose} id="complete-done">
        Done
      </PrimaryButton>
    </div>
  );
}
