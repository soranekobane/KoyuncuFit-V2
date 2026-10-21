import { memo, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowUp, Check, Dumbbell, Ellipsis, Plus, Replace, StickyNote, Timer, Trash, Trophy } from 'lucide-react';
import { db, type Exercise, type WorkoutSet } from '../../db';
import { bestsFromWorkouts, cn, epley1RM, fmtNum, fmtRest, REST_OPTIONS, sanitizeDecimal, sanitizeInt, type ExerciseBests } from '../../lib/utils';
import { matchPrevious, newSet, parseNum, SET_TYPE_CYCLE, setLabels, type ActiveExercise, type ActiveSet } from '../../lib/workout';
import { toast } from '../../lib/hooks';
import { ActionSheet, EmptyState } from '../ui';
import { ExercisePicker } from '../ExercisePicker';
import { ExerciseThumbnail } from '../ExerciseMedia';
import { ExerciseDetailSheet } from '../ExerciseDetail.tsx';

// ───────────────────────── PR logic ─────────────────────────

function computePRFlags(sets: ActiveSet[], bests: ExerciseBests | undefined, hasHistory: boolean): boolean[] {
  if (!bests || !hasHistory) return sets.map(() => false);
  let best1 = bests.best1RM;
  let bestW = bests.maxWeight;
  return sets.map((s) => {
    if (!s.completed || s.type === 'warmup') return false;
    const w = parseNum(s.weight);
    const r = parseNum(s.reps);
    const e1 = epley1RM(w, r);
    const pr = (best1 > 0 && e1 > best1 + 0.01) || (bestW > 0 && w > bestW);
    best1 = Math.max(best1, e1);
    bestW = Math.max(bestW, w);
    return pr;
  });
}

function fmtPrev(p?: WorkoutSet) {
  if (!p) return '—';
  if (!p.weight) return `${p.reps} reps`;
  return `${fmtNum(p.weight, 2)}kg × ${p.reps}`;
}

const LABEL_STYLE: Record<string, string> = {
  W: 'text-amber-400 bg-amber-400/10',
  D: 'text-blue-400 bg-blue-500/10',
  F: 'text-red-500 bg-red-500/10',
};

// ───────────────────────── Set row (swipe left to delete) ─────────────────────────

interface SetRowProps {
  set: ActiveSet;
  label: string;
  previous?: WorkoutSet;
  repsPlaceholder?: number | null;
  isPR: boolean;
  onChange: (patch: Partial<ActiveSet>) => void;
  onToggle: () => void;
  onDelete: () => void;
  onCycleType: () => void;
}

const SetRow = memo(function SetRow({ set, label, previous, repsPlaceholder, isPR, onChange, onToggle, onDelete, onCycleType }: SetRowProps) {
  const [dx, setDx] = useState(0);
  const [removing, setRemoving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; locked: boolean | null; id: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = { x: e.clientX, y: e.clientY, locked: null, id: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;
    if (d.locked === null && (Math.abs(mx) > 10 || Math.abs(my) > 10)) {
      d.locked = Math.abs(mx) > Math.abs(my) * 1.2 && mx < 0;
      if (d.locked) {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDragging(true);
      }
    }
    if (d.locked) setDx(Math.max(-140, Math.min(0, mx)));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d?.locked) return;
    if (dx < -80) {
      setRemoving(true);
      setDx(-500);
      window.setTimeout(onDelete, 180);
    } else setDx(0);
  };

  const weightPh = previous && previous.weight ? fmtNum(previous.weight, 2) : '';
  const repsPh = previous ? String(previous.reps) : repsPlaceholder ? String(repsPlaceholder) : '';

  return (
    <div className={cn('relative overflow-hidden transition-[max-height,opacity] duration-200', removing ? 'max-h-0 opacity-0' : 'max-h-20')}>
      <div className="absolute inset-0 flex items-center justify-end bg-red-500 pr-5 text-[14px] font-semibold text-white">
        <Trash size={18} />
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ transform: `translateX(${dx}px)`, touchAction: 'pan-y' }}
        className={cn(
          'relative isolate grid grid-cols-[38px_minmax(0,1fr)_72px_60px_40px] items-center gap-2 bg-zinc-900 px-3 py-1.5',
          dragging ? '' : 'transition-transform duration-200',
        )}
      >
        {set.completed && <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-emerald-500/15" />}
        <button
          onClick={onCycleType}
          aria-label="Change set type"
          className={cn('relative mx-auto grid h-8 w-8 place-items-center rounded-lg text-[15px] font-bold tabular transition active:scale-90', LABEL_STYLE[label] ?? 'text-zinc-200', set.completed && !LABEL_STYLE[label] && 'text-emerald-300')}
        >
          {label}
          {isPR && (
            <span className="absolute -top-1.5 -right-1.5 grid h-[18px] w-[18px] animate-pop place-items-center rounded-full bg-amber-400 text-zinc-900 shadow-lg shadow-amber-500/40">
              <Trophy size={10} strokeWidth={3} />
            </span>
          )}
        </button>

        <button
          onClick={() => previous && onChange({ weight: previous.weight ? String(previous.weight) : '', reps: String(previous.reps) })}
          disabled={!previous}
          className="truncate text-center text-[14px] font-medium text-zinc-500 tabular active:text-zinc-300"
        >
          {fmtPrev(previous)}
        </button>

        <input
          value={set.weight}
          onChange={(e) => onChange({ weight: sanitizeDecimal(e.target.value) })}
          inputMode="decimal"
          enterKeyHint="next"
          placeholder={weightPh}
          aria-label="Weight in kg"
          className={cn(
            'h-9 w-full rounded-lg text-center text-base font-semibold tabular outline-none transition focus:ring-2 focus:ring-brand',
            set.completed ? 'bg-transparent' : 'bg-zinc-800',
          )}
        />
        <input
          value={set.reps}
          onChange={(e) => onChange({ reps: sanitizeInt(e.target.value) })}
          inputMode="numeric"
          pattern="[0-9]*"
          enterKeyHint="done"
          placeholder={repsPh}
          aria-label="Reps"
          className={cn(
            'h-9 w-full rounded-lg text-center text-base font-semibold tabular outline-none transition focus:ring-2 focus:ring-brand',
            set.completed ? 'bg-transparent' : 'bg-zinc-800',
          )}
        />
        <button
          onClick={onToggle}
          aria-label={set.completed ? 'Mark set incomplete' : 'Complete set'}
          className={cn(
            'mx-auto grid h-8 w-9 place-items-center rounded-lg transition-all active:scale-90',
            set.completed ? 'animate-check bg-emerald-500 text-white shadow-md shadow-emerald-500/30' : 'bg-zinc-800 text-zinc-500',
          )}
        >
          <Check size={18} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
});

// ───────────────────────── Exercise card ─────────────────────────

interface CardProps {
  ex: ActiveExercise;
  index: number;
  count: number;
  live: boolean;
  beforeTs: number;
  excludeWorkoutId?: number;
  onChange: (uid: string, fn: (e: ActiveExercise) => ActiveExercise) => void;
  onRemove: (uid: string) => void;
  onReplace: (uid: string) => void;
  onMove: (uid: string, dir: -1 | 1) => void;
  onOpenDetail: (exerciseId: number) => void;
  onSetCompleted?: (ex: ActiveExercise) => void;
}

export function ExerciseCard({ ex, index, count, live, beforeTs, excludeWorkoutId, onChange, onRemove, onReplace, onMove, onOpenDetail, onSetCompleted }: CardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [restOpen, setRestOpen] = useState(false);

  const hist = useLiveQuery(async () => {
    const list = await db.workouts.where('exerciseIds').equals(ex.exerciseId).toArray();
    const prior = list.filter((w) => w.startedAt < beforeTs && w.id !== excludeWorkoutId).sort((a, b) => b.startedAt - a.startedAt);
    const prevEx = prior[0]?.exercises.find((e) => e.exerciseId === ex.exerciseId);
    return { previous: prevEx?.sets ?? [], bests: bestsFromWorkouts(prior, ex.exerciseId), hasHistory: prior.length > 0 };
  }, [ex.exerciseId, beforeTs, excludeWorkoutId]);

  const labels = setLabels(ex.sets);
  const prFlags = useMemo(() => computePRFlags(ex.sets, hist?.bests, !!hist?.hasHistory), [ex.sets, hist]);

  const update = (fn: (e: ActiveExercise) => ActiveExercise) => onChange(ex.uid, fn);
  const patchSet = (setUid: string, patch: Partial<ActiveSet>) =>
    update((e) => ({ ...e, sets: e.sets.map((s) => (s.uid === setUid ? { ...s, ...patch } : s)) }));

  const toggleSet = (i: number) => {
    const s = ex.sets[i];
    if (s.completed) {
      patchSet(s.uid, { completed: false });
      return;
    }
    const prev = matchPrevious(ex.sets, i, hist?.previous ?? []);
    const weight = s.weight || (prev?.weight ? String(prev.weight) : '');
    const reps = s.reps || (prev ? String(prev.reps) : ex.targetReps ? String(ex.targetReps) : '');
    if (parseNum(reps) <= 0) {
      toast('Enter reps first', 'error', 1800);
      return;
    }
    const nextSets = ex.sets.map((x, j) => (j === i ? { ...x, weight, reps, completed: true } : x));
    update((e) => ({ ...e, sets: e.sets.map((x) => (x.uid === s.uid ? { ...x, weight, reps, completed: true } : x)) }));

    if (computePRFlags(nextSets, hist?.bests, !!hist?.hasHistory)[i]) {
      const e1 = epley1RM(parseNum(weight), parseNum(reps));
      toast(`New PR · ${ex.name} · ${fmtNum(e1)} kg e1RM`, 'pr', 3200);
      navigator.vibrate?.([30, 40, 30]);
    } else navigator.vibrate?.(15);
    if (live) onSetCompleted?.(ex);
  };

  const cycleType = (setUid: string) =>
    update((e) => ({
      ...e,
      sets: e.sets.map((s) => (s.uid === setUid ? { ...s, type: SET_TYPE_CYCLE[(SET_TYPE_CYCLE.indexOf(s.type) + 1) % SET_TYPE_CYCLE.length] } : s)),
    }));

  const addSet = () =>
    update((e) => {
      const last = e.sets[e.sets.length - 1];
      return { ...e, sets: [...e.sets, newSet({ type: last?.type === 'drop' ? 'drop' : 'normal' })] };
    });

  return (
    <section className="animate-slide-up overflow-hidden rounded-2xl border border-white/[0.06] bg-zinc-900 shadow-lg shadow-black/30">
      <div className="flex items-center gap-3 px-4 pt-3.5">
        <ExerciseThumbnail name={ex.name} muscle={ex.muscleGroup} equipment={ex.equipment} size={40} />
        <button onClick={() => onOpenDetail(ex.exerciseId)} className="min-w-0 flex-1 text-left">
          <div className="truncate text-[17px] font-semibold text-brand">{ex.name}</div>
          <div className="text-[12px] text-zinc-500">
            {ex.muscleGroup} · {ex.equipment}
          </div>
        </button>
        <button aria-label="Exercise options" onClick={() => setMenuOpen(true)} className="grid h-9 w-9 place-items-center rounded-full text-zinc-400 active:bg-white/10">
          <Ellipsis size={22} />
        </button>
      </div>

      {ex.showNotes && (
        <div className="px-4 pt-2.5">
          <textarea
            value={ex.notes}
            onChange={(e) => update((x) => ({ ...x, notes: e.target.value }))}
            placeholder="Add notes here…"
            rows={2}
            className="w-full resize-none rounded-lg bg-zinc-800/60 px-3 py-2 text-base text-zinc-200 outline-none focus:ring-2 focus:ring-brand/60"
          />
        </div>
      )}

      {live && (
        <button onClick={() => setRestOpen(true)} className="mx-4 mt-2 flex items-center gap-1.5 text-[14px] font-medium text-brand active:opacity-60">
          <Timer size={15} /> Rest Timer: {fmtRest(ex.restSeconds)}
        </button>
      )}

      <div className="mt-3 grid grid-cols-[38px_minmax(0,1fr)_72px_60px_40px] items-center gap-2 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        <div className="text-center">Set</div>
        <div className="text-center">Previous</div>
        <div className="text-center">Kg</div>
        <div className="text-center">Reps</div>
        <div className="flex justify-center">
          <Check size={14} strokeWidth={3} />
        </div>
      </div>

      <div>
        {ex.sets.map((s, i) => (
          <SetRow
            key={s.uid}
            set={s}
            label={labels[i]}
            previous={matchPrevious(ex.sets, i, hist?.previous ?? [])}
            repsPlaceholder={ex.targetReps}
            isPR={prFlags[i]}
            onChange={(patch) => patchSet(s.uid, patch)}
            onToggle={() => toggleSet(i)}
            onDelete={() => update((e) => ({ ...e, sets: e.sets.filter((x) => x.uid !== s.uid) }))}
            onCycleType={() => cycleType(s.uid)}
          />
        ))}
      </div>

      <div className="p-3 pt-2">
        <button onClick={addSet} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-800 py-2 text-[15px] font-semibold text-zinc-200 transition active:scale-[0.98] active:bg-zinc-700">
          <Plus size={17} /> Add Set
        </button>
      </div>

      <ActionSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={ex.name}
        actions={[
          { label: 'Replace / Swap Exercise', icon: Replace, onClick: () => onReplace(ex.uid) },
          { label: ex.showNotes ? 'Hide Note' : 'Add Note', icon: StickyNote, onClick: () => update((e) => ({ ...e, showNotes: !e.showNotes })) },
          { label: 'Move Up', icon: ArrowUp, disabled: index === 0, onClick: () => onMove(ex.uid, -1) },
          { label: 'Move Down', icon: ArrowDown, disabled: index === count - 1, onClick: () => onMove(ex.uid, 1) },
          { label: 'Remove Exercise', icon: Trash, destructive: true, onClick: () => onRemove(ex.uid) },
        ]}
      />
      <ActionSheet
        open={restOpen}
        onClose={() => setRestOpen(false)}
        title="Rest Timer"
        actions={REST_OPTIONS.map((sec) => ({
          label: sec === ex.restSeconds ? `${fmtRest(sec)}  ✓` : fmtRest(sec),
          onClick: () => update((e) => ({ ...e, restSeconds: sec })),
        }))}
      />
    </section>
  );
}

// ───────────────────────── List editor (shared: live workout + past log edit) ─────────────────────────

interface EditorProps {
  exercises: ActiveExercise[];
  onChange: (fn: (list: ActiveExercise[]) => ActiveExercise[]) => void;
  live: boolean;
  beforeTs: number;
  excludeWorkoutId?: number;
  onSetCompleted?: (ex: ActiveExercise) => void;
  onAddExercises: (exs: Exercise[]) => void;
}

export function WorkoutExercisesEditor({ exercises, onChange, live, beforeTs, excludeWorkoutId, onSetCompleted, onAddExercises }: EditorProps) {
  const [picker, setPicker] = useState<null | { mode: 'add' } | { mode: 'replace'; uid: string }>(null);
  const [detailId, setDetailId] = useState<number | null>(null);

  const changeOne = (uid: string, fn: (e: ActiveExercise) => ActiveExercise) => onChange((list) => list.map((e) => (e.uid === uid ? fn(e) : e)));
  const remove = (uid: string) => onChange((list) => list.filter((e) => e.uid !== uid));
  const move = (uid: string, dir: -1 | 1) =>
    onChange((list) => {
      const i = list.findIndex((e) => e.uid === uid);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const handleSelect = (picked: Exercise[]) => {
    if (!picker) return;
    if (picker.mode === 'replace') {
      const ex = picked[0];
      if (!ex) return;
      changeOne(picker.uid, (e) => ({ ...e, exerciseId: ex.id, name: ex.name, muscleGroup: ex.muscleGroup, equipment: ex.equipment }));
      toast(`Swapped to ${ex.name}`, 'success');
    } else onAddExercises(picked);
  };

  return (
    <>
      {exercises.length === 0 ? (
        <EmptyState icon={Dumbbell} title="Get started" text="Add an exercise to start logging sets." />
      ) : (
        <div className="space-y-3">
          {exercises.map((ex, i) => (
            <ExerciseCard
              key={ex.uid}
              ex={ex}
              index={i}
              count={exercises.length}
              live={live}
              beforeTs={beforeTs}
              excludeWorkoutId={excludeWorkoutId}
              onChange={changeOne}
              onRemove={remove}
              onReplace={(uid) => setPicker({ mode: 'replace', uid })}
              onMove={move}
              onOpenDetail={setDetailId}
              onSetCompleted={onSetCompleted}
            />
          ))}
        </div>
      )}

      <button
        id="add-exercise-button"
        onClick={() => setPicker({ mode: 'add' })}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3.5 text-[16px] font-semibold text-white shadow-lg shadow-brand/25 transition active:scale-[0.98]"
      >
        <Plus size={19} strokeWidth={2.5} /> Add Exercise
      </button>

      <ExercisePicker open={!!picker} mode={picker?.mode === 'replace' ? 'single' : 'multi'} onClose={() => setPicker(null)} onSelect={handleSelect} />
      <ExerciseDetailSheet exerciseId={detailId} onClose={() => setDetailId(null)} />
    </>
  );
}
