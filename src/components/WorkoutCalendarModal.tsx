import { useState, useMemo, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Dumbbell,
  Flame,
  Pencil,
  Trophy,
  Weight,
  Zap,
} from 'lucide-react';
import { type Workout } from '../db';
import {
  cn,
  epley1RM,
  fmtDate,
  fmtDuration,
  fmtNum,
  fmtTime,
  fmtVolume,
  startOfWeek,
} from '../lib/utils';
import { Sheet, SheetTextButton } from './ui';

export interface WorkoutCalendarModalProps {
  open: boolean;
  onClose: () => void;
  workouts: Workout[];
  initialDate?: Date | null;
  onOpenWorkout?: (workout: Workout) => void;
  onOpenDetail?: (exerciseId: number) => void;
}

/** Formats local date to YYYY-MM-DD avoiding UTC timezone shifts */
export function getLocalDateKey(d: Date | number): string {
  const date = typeof d === 'number' ? new Date(d) : d;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function WorkoutCalendarModal({
  open,
  onClose,
  workouts,
  initialDate,
  onOpenWorkout,
  onOpenDetail,
}: WorkoutCalendarModalProps) {
  // Current month being viewed
  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(() => initialDate || new Date());
  // Selected day string (YYYY-MM-DD)
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(() =>
    initialDate ? getLocalDateKey(initialDate) : getLocalDateKey(new Date()),
  );

  // Sync state whenever initialDate changes while modal is opened
  useEffect(() => {
    if (open) {
      const target = initialDate || new Date();
      setCurrentMonthDate(new Date(target.getFullYear(), target.getMonth(), 1));
      setSelectedDayKey(getLocalDateKey(target));
    }
  }, [open, initialDate]);

  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();

  const monthLabel = currentMonthDate.toLocaleString('tr-TR', {
    month: 'long',
    year: 'numeric',
  });
  const monthLabelEn = currentMonthDate.toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  // Monday = 0
  const firstDayOfMonth = new Date(year, month, 1);
  const startDayIdx = (firstDayOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Map workouts by date key YYYY-MM-DD
  const workoutsByDate = useMemo(() => {
    const map = new Map<string, Workout[]>();
    for (const w of workouts) {
      const key = getLocalDateKey(w.startedAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(w);
    }
    // Sort each day's workouts chronologically
    for (const list of map.values()) {
      list.sort((a, b) => a.startedAt - b.startedAt);
    }
    return map;
  }, [workouts]);

  // Monthly stats (for the currently selected month) & Streak
  const { monthWorkouts, monthVolume, monthActiveDays, streakText } = useMemo(() => {
    const startOfMonthMs = new Date(year, month, 1).getTime();
    const endOfMonthMs = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();

    const mWorkouts = workouts.filter(
      (w) => w.startedAt >= startOfMonthMs && w.startedAt <= endOfMonthMs,
    );

    const mVolume = mWorkouts.reduce((acc, w) => acc + (w.totalVolume || 0), 0);

    const activeDaysSet = new Set<string>();
    mWorkouts.forEach((w) => {
      activeDaysSet.add(getLocalDateKey(w.startedAt));
    });

    // Calculate user streak (consecutive active days or weeks)
    const daySet = new Set<string>();
    const weekSet = new Set<number>();
    workouts.forEach((w) => {
      daySet.add(getLocalDateKey(w.startedAt));
      weekSet.add(startOfWeek(w.startedAt));
    });

    const now = new Date();
    const todayKey = getLocalDateKey(now);
    const yesterday = new Date(Date.now() - 86400000);
    const yesterdayKey = getLocalDateKey(yesterday);

    let dayStreak = 0;
    const startCheck = daySet.has(todayKey) ? now : daySet.has(yesterdayKey) ? yesterday : null;
    if (startCheck) {
      const cursor = new Date(startCheck.getFullYear(), startCheck.getMonth(), startCheck.getDate());
      while (daySet.has(getLocalDateKey(cursor))) {
        dayStreak++;
        cursor.setDate(cursor.getDate() - 1);
      }
    }

    // Weekly streak
    const weekStart = startOfWeek(Date.now());
    let weekStreak = 0;
    let wCursor = weekSet.has(weekStart) ? weekStart : weekStart - 7 * 86400000;
    while (weekSet.has(wCursor)) {
      weekStreak++;
      wCursor = startOfWeek(wCursor - 3 * 86400000);
    }

    let streakStr = '0 Gün';
    if (dayStreak > 0) {
      streakStr = `${dayStreak} Gün`;
    } else if (weekStreak > 0) {
      streakStr = `${weekStreak} Hafta`;
    }

    return {
      monthWorkouts: mWorkouts.length,
      monthVolume: mVolume,
      monthActiveDays: activeDaysSet.size,
      streakText: streakStr,
    };
  }, [workouts, year, month]);

  const handlePrevMonth = () => {
    setCurrentMonthDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonthDate(new Date(year, month + 1, 1));
  };

  const handleJumpToday = () => {
    const today = new Date();
    setCurrentMonthDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDayKey(getLocalDateKey(today));
  };

  const selectedWorkouts = selectedDayKey ? workoutsByDate.get(selectedDayKey) ?? [] : [];

  const todayKey = getLocalDateKey(new Date());

  return (
    <Sheet
      open={open}
      onClose={onClose}
      full
      title="Workout Calendar"
      left={<SheetTextButton onClick={onClose}>Kapat</SheetTextButton>}
      right={
        <button
          onClick={handleJumpToday}
          className="flex items-center gap-1 rounded-xl bg-brand/15 px-3 py-1.5 text-[12px] font-bold text-brand transition active:scale-95 hover:bg-brand/25"
          title="Bugüne Git"
        >
          <CalendarIcon size={13} />
          <span>Bugün</span>
        </button>
      }
    >
      <div className="space-y-4 px-4 pb-32 pt-2">
        {/* Month Navigation Header */}
        <div className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-zinc-900/90 px-4 py-3 shadow-lg">
          <button
            onClick={handlePrevMonth}
            className="grid h-9 w-9 place-items-center rounded-xl bg-zinc-800 text-zinc-300 transition active:scale-90 hover:bg-zinc-700"
            aria-label="Previous Month"
          >
            <ChevronLeft size={20} />
          </button>

          <div className="text-center">
            <h3 className="text-[17px] font-bold text-zinc-100 capitalize">{monthLabel}</h3>
            <div className="text-[11px] font-medium text-zinc-400">{monthLabelEn}</div>
          </div>

          <button
            onClick={handleNextMonth}
            className="grid h-9 w-9 place-items-center rounded-xl bg-zinc-800 text-zinc-300 transition active:scale-90 hover:bg-zinc-700"
            aria-label="Next Month"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* 4-Item Monthly Summary Stats Strip */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="rounded-2xl border border-white/[0.06] bg-zinc-900/80 p-2.5 shadow-sm">
            <div className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              <Dumbbell size={11} className="text-brand" /> Antrenman
            </div>
            <div className="mt-1 text-[16px] font-extrabold text-zinc-100 tabular">
              {monthWorkouts}
            </div>
            <div className="text-[10px] text-zinc-500">Bu ay</div>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-zinc-900/80 p-2.5 shadow-sm">
            <div className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              <Weight size={11} className="text-brand" /> Hacim
            </div>
            <div className="mt-1 text-[15px] font-extrabold text-zinc-100 tabular">
              {fmtVolume(monthVolume)}
            </div>
            <div className="text-[10px] text-zinc-500">Kaldırılan</div>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-zinc-900/80 p-2.5 shadow-sm">
            <div className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              <Zap size={11} className="text-emerald-400" /> Aktif Gün
            </div>
            <div className="mt-1 text-[16px] font-extrabold text-emerald-400 tabular">
              {monthActiveDays}
            </div>
            <div className="text-[10px] text-zinc-500">Gün</div>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-zinc-900/80 p-2.5 shadow-sm">
            <div className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
              <Flame size={11} className="text-amber-400" /> Seri
            </div>
            <div className="mt-1 text-[15px] font-extrabold text-amber-300 tabular">
              {streakText}
            </div>
            <div className="text-[10px] text-zinc-500">Streak</div>
          </div>
        </div>

        {/* Calendar Card Container */}
        <div className="rounded-3xl border border-white/[0.08] bg-zinc-950/80 p-4 shadow-xl">
          {/* Days of Week Header (Monday to Sunday) */}
          <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[12px] font-bold text-zinc-400">
            <div>Pzt</div>
            <div>Sal</div>
            <div>Çar</div>
            <div>Per</div>
            <div>Cum</div>
            <div className="text-zinc-500">Cmt</div>
            <div className="text-zinc-500">Paz</div>
          </div>

          {/* Monthly Days Grid */}
          <div className="grid grid-cols-7 gap-1.5">
            {/* Empty slots for Monday-based month start */}
            {Array.from({ length: startDayIdx }).map((_, i) => (
              <div key={`empty-${i}`} className="h-12 rounded-xl" />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const dayStr = String(dayNum).padStart(2, '0');
              const monthStr = String(month + 1).padStart(2, '0');
              const key = `${year}-${monthStr}-${dayStr}`;

              const dayWorkouts = workoutsByDate.get(key) ?? [];
              const hasWorkout = dayWorkouts.length > 0;
              const isSelected = selectedDayKey === key;
              const isToday = key === todayKey;

              const totalDayCalories = dayWorkouts.reduce(
                (sum, w) => sum + (w.caloriesBurned || 0),
                0,
              );

              return (
                <button
                  key={key}
                  onClick={() => setSelectedDayKey(key)}
                  className={cn(
                    'relative flex h-13 flex-col items-center justify-between rounded-2xl p-1.5 transition-all duration-150 active:scale-95',
                    isSelected
                      ? 'ring-2 ring-brand bg-brand/20 border border-brand/50 shadow-lg shadow-brand/20 z-10'
                      : hasWorkout
                      ? 'bg-zinc-900 border border-brand/30 hover:border-brand/60'
                      : isToday
                      ? 'bg-zinc-900/90 border border-zinc-600'
                      : 'bg-zinc-900/40 border border-white/[0.03] text-zinc-400 hover:bg-zinc-900/80',
                  )}
                >
                  {/* Day Number and Today Indicator */}
                  <div className="flex w-full items-center justify-between px-0.5">
                    <span
                      className={cn(
                        'text-[13px] font-bold',
                        isSelected
                          ? 'text-brand'
                          : isToday
                          ? 'text-white underline decoration-brand decoration-2 underline-offset-2'
                          : hasWorkout
                          ? 'text-zinc-100'
                          : 'text-zinc-400',
                      )}
                    >
                      {dayNum}
                    </span>

                    {/* Workout Count badge if multiple */}
                    {dayWorkouts.length > 1 && (
                      <span className="rounded-full bg-brand/80 px-1 text-[8px] font-extrabold text-white">
                        {dayWorkouts.length}
                      </span>
                    )}
                  </div>

                  {/* Workout Activity Indicator / Glowing Dot */}
                  <div className="flex items-center justify-center gap-0.5 pb-0.5">
                    {hasWorkout ? (
                      <div className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-brand shadow-[0_0_8px_#3b82f6] animate-pulse" />
                        {totalDayCalories > 0 && (
                          <span className="text-[9px] font-bold text-amber-400 leading-none">
                            🔥
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="h-1.5 w-1.5 opacity-0" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Date Workouts Section */}
        {selectedDayKey && (
          <div className="space-y-3 pt-1">
            {/* Date Title Banner */}
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <CalendarIcon size={16} className="text-brand" />
                <h4 className="text-[15px] font-bold text-zinc-100">
                  {new Date(selectedDayKey).toLocaleDateString('tr-TR', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </h4>
              </div>

              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                  selectedWorkouts.length > 0
                    ? 'bg-brand/15 text-brand border border-brand/30'
                    : 'bg-zinc-800 text-zinc-400',
                )}
              >
                {selectedWorkouts.length}{' '}
                {selectedWorkouts.length === 1 ? 'Antrenman' : 'Antrenman'}
              </span>
            </div>

            {/* List of Workouts on this Day */}
            {selectedWorkouts.length === 0 ? (
              <div className="rounded-2xl border border-white/[0.06] bg-zinc-900/60 p-6 text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-zinc-800/80 text-zinc-500">
                  <Dumbbell size={22} />
                </div>
                <div className="mt-3 text-[15px] font-bold text-zinc-300">
                  Bu Günde Kayıtlı Antrenman Yok
                </div>
                <p className="mt-1 text-[12px] text-zinc-500 max-w-xs mx-auto">
                  Geçmiş veya bugünün antrenmanlarını incelemek için takvimdeki mavi işaretli günleri seçin.
                </p>
              </div>
            ) : (
              <div className="space-y-3.5">
                {selectedWorkouts.map((w) => (
                  <WorkoutCalendarCard
                    key={w.id}
                    workout={w}
                    onOpenWorkout={() => onOpenWorkout?.(w)}
                    onOpenDetail={onOpenDetail}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}

/** Individual Workout Card in Calendar Day Inspector */
function WorkoutCalendarCard({
  workout,
  onOpenWorkout,
  onOpenDetail,
}: {
  workout: Workout;
  onOpenWorkout: () => void;
  onOpenDetail?: (exerciseId: number) => void;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#161618] p-4 shadow-xl transition-all">
      {/* Header with Title, Time, and Edit/Action Button */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[18px] font-extrabold text-zinc-100">{workout.name}</h3>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-zinc-400">
            <span>{fmtDate(workout.startedAt, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            <span>·</span>
            <span>{fmtTime(workout.startedAt)}</span>
          </div>
        </div>

        <button
          onClick={onOpenWorkout}
          className="flex items-center gap-1.5 rounded-xl border border-brand/40 bg-brand/10 hover:bg-brand/20 px-3 py-1.5 text-[12px] font-bold text-brand transition active:scale-95"
          title="Antrenmanı Düzenle veya İncele"
        >
          <Pencil size={13} />
          <span>Detay / Düzenle</span>
        </button>
      </div>

      {workout.notes && (
        <p className="mt-2 rounded-xl bg-zinc-900/90 px-3 py-2 text-[13px] italic text-zinc-400 border border-white/[0.04]">
          “{workout.notes}”
        </p>
      )}

      {/* 4-Stat Metric Summary Bar */}
      <div className="mt-3.5 grid grid-cols-4 gap-1.5 rounded-xl bg-zinc-950/70 p-2 text-center border border-white/[0.04]">
        <div>
          <div className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase text-zinc-500">
            <Clock size={11} /> Süre
          </div>
          <div className="mt-0.5 text-[13px] font-bold text-zinc-200 tabular">
            {fmtDuration(workout.durationSec)}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase text-zinc-500">
            <Weight size={11} /> Hacim
          </div>
          <div className="mt-0.5 text-[13px] font-bold text-zinc-200 tabular">
            {fmtVolume(workout.totalVolume)}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase text-zinc-500">
            <Dumbbell size={11} /> Setler
          </div>
          <div className="mt-0.5 text-[13px] font-bold text-zinc-200 tabular">
            {workout.totalSets}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase text-amber-400">
            <Flame size={11} /> Kalori
          </div>
          <div className="mt-0.5 text-[13px] font-bold text-amber-300 tabular">
            🔥 {workout.caloriesBurned || 0}
          </div>
        </div>
      </div>

      {/* Exercises & Sets Breakdown with 1RM Badges */}
      <div className="mt-3.5 space-y-2.5 border-t border-white/[0.06] pt-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center justify-between">
          <span>Egzersizler & Setler</span>
          <span className="text-zinc-500 font-normal">{workout.exercises.length} egzersiz</span>
        </div>

        {workout.exercises.map((ex) => {
          const validSets = ex.sets.filter((s) => s.reps > 0);

          // Find best estimated 1RM for this exercise in this workout
          let bestSet1RM = 0;
          validSets.forEach((s) => {
            if (s.weight > 0 && s.reps > 0) {
              const e1 = epley1RM(s.weight, s.reps);
              if (e1 > bestSet1RM) bestSet1RM = e1;
            }
          });

          return (
            <div
              key={ex.uid}
              className="rounded-xl border border-white/[0.04] bg-zinc-900/70 p-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onOpenDetail?.(ex.exerciseId)}
                  className="text-[13px] font-bold text-brand hover:underline flex items-center gap-1.5 text-left transition"
                >
                  <span>{ex.name}</span>
                  <span className="text-[11px] font-medium text-zinc-400">
                    ({validSets.length} set)
                  </span>
                </button>

                {bestSet1RM > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/20 tabular">
                    <Trophy size={10} />
                    1RM: {fmtNum(bestSet1RM, 1)} kg
                  </span>
                )}
              </div>

              {/* Individual Set Pills */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {validSets.map((s, idx) => {
                  const set1RM = s.weight > 0 && s.reps > 0 ? epley1RM(s.weight, s.reps) : 0;
                  const isTopSet = bestSet1RM > 0 && Math.abs(set1RM - bestSet1RM) < 0.05;

                  return (
                    <div
                      key={s.uid || idx}
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] tabular transition',
                        isTopSet
                          ? 'bg-brand/20 border border-brand/50 text-brand font-bold'
                          : 'bg-zinc-800/90 text-zinc-300 border border-white/[0.03]',
                      )}
                    >
                      <span className="text-zinc-500 text-[10px]">#{idx + 1}</span>
                      <span>
                        {s.weight > 0 ? `${fmtNum(s.weight, 1)}kg × ${s.reps}` : `${s.reps} reps`}
                      </span>
                      {isTopSet && bestSet1RM > 0 && (
                        <span className="text-[9px] font-bold text-amber-300 ml-0.5">★ Top</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

// Re-export alias for backward compatibility
export { WorkoutCalendarModal as CalendarSheet };
