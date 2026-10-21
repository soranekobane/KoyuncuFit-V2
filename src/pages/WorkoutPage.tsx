import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, ClipboardList, Flame, Play, Plus, Zap } from 'lucide-react';
import { db, type Routine, type Workout } from '../db';
import { cn, fmtDuration, fmtVolume, relativeDay, startOfWeek } from '../lib/utils';
import { useWorkout } from '../state/WorkoutContext';
import { useAuth } from '../state/AuthContext';
import { Alert, EmptyState, PageHeader, type AlertConfig } from '../components/ui';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function WorkoutPage({ onGoRoutines, onNewRoutine }: { onGoRoutines: () => void; onNewRoutine: () => void }) {
  const { currentUser } = useAuth();
  const w = useWorkout();
  const [alert, setAlert] = useState<AlertConfig | null>(null);

  const routines = useLiveQuery<Routine[]>(
    async () => {
      if (!currentUser) return [];
      return db.routines.where('userId').equals(currentUser.id).sortBy('order');
    },
    [currentUser?.id],
  );
  const exerciseNames = useLiveQuery(async () => new Map((await db.exercises.toArray()).map((e) => [e.id, e.name])), []);
  const weekStart = startOfWeek(Date.now());
  const recent = useLiveQuery<Workout[]>(
    async () => {
      if (!currentUser) return [];
      return db.workouts.where('userId').equals(currentUser.id).reverse().sortBy('startedAt');
    },
    [currentUser?.id],
  );
  const last = recent?.[0];

  const thisWeek = (recent ?? []).filter((x) => x.startedAt >= weekStart);
  const activeDays = new Set(thisWeek.map((x) => (new Date(x.startedAt).getDay() + 6) % 7));
  const todayIdx = (new Date().getDay() + 6) % 7;
  const weekVolume = thisWeek.reduce((s, x) => s + x.totalVolume, 0);

  // Week streak: consecutive weeks (incl. this one or last) with ≥1 workout.
  const streak = (() => {
    if (!recent?.length) return 0;
    const weeks = new Set(recent.map((x) => startOfWeek(x.startedAt)));
    let s = 0;
    let cursor = weeks.has(weekStart) ? weekStart : weekStart - 7 * 86400000;
    while (weeks.has(cursor)) {
      s++;
      cursor = startOfWeek(cursor - 3 * 86400000);
    }
    return s;
  })();

  const start = (routine?: Routine) => {
    if (w.active) {
      setAlert({
        title: 'Workout in progress',
        message: 'You already have an active workout. Resume it, or discard it and start a new one.',
        confirmLabel: 'Resume Workout',
        onConfirm: w.open,
        secondary: { label: 'Discard & Start New', onClick: () => void w.startWorkout(routine) },
      });
      return;
    }
    void w.startWorkout(routine);
  };

  return (
    <div>
      <PageHeader
        title="Workout"
        subtitle={new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
        showLogo
      />

      <div className="space-y-6 px-4 pt-1">
        {/* Week overview */}
        <section className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-br from-brand/20 via-zinc-900 to-zinc-900 p-5">
          <div className="pointer-events-none absolute -top-16 -right-10 h-44 w-44 rounded-full bg-brand/25 blur-3xl" />
          <div className="relative flex items-start justify-between">
            <div>
              <div className="text-[13px] font-semibold text-zinc-400">This week</div>
              <div className="mt-0.5 text-[28px] leading-tight font-bold tracking-tight">
                {thisWeek.length} <span className="text-[17px] font-semibold text-zinc-400">workout{thisWeek.length === 1 ? '' : 's'}</span>
              </div>
              <div className="text-[13px] text-zinc-500">{fmtVolume(weekVolume)} lifted</div>
            </div>
            {streak > 0 && (
              <div className="flex items-center gap-1 rounded-full bg-orange-500/15 px-3 py-1.5 text-[13px] font-semibold text-orange-300">
                <Flame size={15} /> {streak} wk streak
              </div>
            )}
          </div>
          <div className="relative mt-5 flex justify-between">
            {DAYS.map((d, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    'grid h-9 w-9 place-items-center rounded-full text-[13px] font-semibold transition',
                    activeDays.has(i) ? 'bg-brand text-white shadow-lg shadow-brand/40' : 'bg-zinc-800/80 text-zinc-500',
                    i === todayIdx && !activeDays.has(i) && 'ring-2 ring-brand/60 text-zinc-200',
                  )}
                >
                  {activeDays.has(i) ? <Zap size={15} fill="currentColor" /> : d}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Quick start */}
        <section>
          <h2 className="mb-2.5 text-[20px] font-bold">Quick Start</h2>
          <button
            id="start-empty-workout"
            onClick={() => start()}
            className="flex w-full items-center gap-3 rounded-2xl border border-white/[0.06] bg-zinc-900 px-4 py-4 text-left transition active:scale-[0.98] active:bg-zinc-800"
          >
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand text-white shadow-lg shadow-brand/30">
              <Plus size={22} strokeWidth={2.5} />
            </div>
            <div className="flex-1">
              <div className="text-[16px] font-semibold">Start Empty Workout</div>
              <div className="text-[13px] text-zinc-500">Log freely, add exercises as you go</div>
            </div>
            <ChevronRight size={20} className="text-zinc-600" />
          </button>
          {last && (
            <div className="mt-2.5 px-1 text-[13px] text-zinc-500">
              Last workout: <span className="text-zinc-300">{last.name}</span> · {relativeDay(last.startedAt)} · {fmtDuration(last.durationSec)}
            </div>
          )}
        </section>

        {/* Routines */}
        <section>
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-[20px] font-bold">Routines</h2>
            <div className="flex gap-3">
              <button onClick={onNewRoutine} className="flex items-center gap-1 text-[15px] font-semibold text-brand active:opacity-60">
                <Plus size={16} /> New
              </button>
              {!!routines?.length && (
                <button onClick={onGoRoutines} className="text-[15px] font-semibold text-zinc-400 active:opacity-60">
                  Manage
                </button>
              )}
            </div>
          </div>

          {routines && routines.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/10">
              <EmptyState icon={ClipboardList} title="No routines yet" text="Create templates like Push, Pull or Legs to start workouts in one tap." />
            </div>
          )}

          <div className="space-y-2.5">
            {routines?.map((r) => (
              <div key={r.id} className="rounded-2xl border border-white/[0.06] bg-zinc-900 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="truncate text-[17px] font-semibold">{r.name}</div>
                  <div className="shrink-0 text-[12px] text-zinc-500">{r.exercises.length} exercises</div>
                </div>
                <p className="mt-1 line-clamp-2 text-[14px] leading-snug text-zinc-500">
                  {r.exercises.map((e) => exerciseNames?.get(e.exerciseId)).filter(Boolean).join(', ') || 'No exercises'}
                </p>
                <button
                  id={`start-routine-${r.id}`}
                  onClick={() => start(r)}
                  disabled={!r.exercises.length}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-[15px] font-semibold text-white shadow-md shadow-brand/20 transition active:scale-[0.98] disabled:opacity-40"
                >
                  <Play size={15} fill="currentColor" /> Start Routine
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <Alert config={alert} onClose={() => setAlert(null)} />
    </div>
  );
}
