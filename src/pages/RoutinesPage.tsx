import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowDown,
  ArrowUp,
  ClipboardList,
  Copy,
  Ellipsis,
  Pencil,
  Play,
  Plus,
  Replace,
  Search,
  Timer,
  Trash,
} from 'lucide-react';
import { db, type Exercise, type Routine, type RoutineExercise } from '../db';
import { fmtRest, REST_OPTIONS, sanitizeInt, uid } from '../lib/utils';
import { toast } from '../lib/hooks';
import { cloudDeleteRoutine, cloudSaveRoutine } from '../lib/cloudDb';
import { useWorkout } from '../state/WorkoutContext';
import { useAuth } from '../state/AuthContext';
import {
  ActionSheet,
  Alert,
  EmptyState,
  PageHeader,
  PrimaryButton,
  Sheet,
  SheetTextButton,
  type AlertConfig,
} from '../components/ui';
import { ExercisePicker } from '../components/ExercisePicker';
import { ExerciseDetailSheet } from '../components/ExerciseDetail';
import { ExerciseThumbnail } from '../components/ExerciseMedia';

export function RoutinesPage({
  externalEditorOpen,
  onCloseExternalEditor,
}: {
  externalEditorOpen?: boolean;
  onCloseExternalEditor?: () => void;
}) {
  const { currentUser } = useAuth();
  const w = useWorkout();
  const routines = useLiveQuery<Routine[]>(
    async () => {
      if (!currentUser) return [];
      return db.routines.where('userId').equals(currentUser.id).sortBy('order');
    },
    [currentUser?.id],
  );
  const allExercises = useLiveQuery(() => db.exercises.toArray(), []);
  const exerciseMap = useLiveQuery(
    async () => new Map((await db.exercises.toArray()).map((e) => [e.id, e])),
    [],
  );

  const [query, setQuery] = useState('');
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedRoutine, setSelectedRoutine] = useState<Routine | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [alert, setAlert] = useState<AlertConfig | null>(null);

  const filteredRoutines = (routines ?? []).filter((r) =>
    r.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const handleStart = (routine: Routine) => {
    if (w.active) {
      setAlert({
        title: 'Workout in progress',
        message: 'You already have an active workout. Resume it, or discard it to start this routine.',
        confirmLabel: 'Resume Active',
        onConfirm: w.open,
        secondary: {
          label: 'Discard & Start New',
          onClick: () => void w.startWorkout(routine),
        },
      });
      return;
    }
    void w.startWorkout(routine);
  };

  const handleDuplicate = async (routine: Routine) => {
    if (!currentUser) {
      toast('Please log in to duplicate a routine', 'error');
      return;
    }
    const nextOrder = routines?.length ?? 0;
    const newRoutineId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `rtn_${Date.now()}`;
    const newRoutine: Routine = {
      id: newRoutineId,
      userId: currentUser.id,
      name: `${routine.name} (Copy)`,
      order: nextOrder,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      exercises: routine.exercises.map((e) => ({
        ...e,
        uid: uid(),
      })),
    };
    await cloudSaveRoutine(newRoutine);
    toast(`Duplicated “${routine.name}”`, 'success');
  };

  const handleDelete = (routine: Routine) => {
    if (!currentUser) return;
    setAlert({
      title: `Delete “${routine.name}”?`,
      message: 'This routine template will be permanently removed. Your past workout history will not be affected.',
      confirmLabel: 'Delete Routine',
      destructive: true,
      onConfirm: async () => {
        await cloudDeleteRoutine(routine.id, currentUser.id);
        toast('Routine deleted', 'info');
      },
    });
  };

  return (
    <div className="pb-28">
      <PageHeader
        title="Routines"
        subtitle="Workout Templates"
        right={
          <button
            id="new-routine-button"
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-[14px] font-semibold text-white shadow-md shadow-brand/25 transition active:scale-95"
          >
            <Plus size={17} strokeWidth={2.5} /> Routine
          </button>
        }
      />

      <div className="space-y-4 px-4 pt-1">
        {routines && routines.length > 3 && (
          <div className="relative">
            <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search routines…"
              className="h-11 w-full rounded-xl bg-zinc-800/80 pr-4 pl-10 text-base text-zinc-100 outline-none ring-brand/60 focus:ring-2"
            />
          </div>
        )}

        {routines && routines.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No routines yet"
            text="Build routines for your weekly split (e.g. Push, Pull, Legs) to log workouts in seconds."
            action={
              <button
                onClick={() => setIsCreating(true)}
                className="flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-[15px] font-semibold text-white shadow-lg shadow-brand/30 transition active:scale-95"
              >
                <Plus size={18} strokeWidth={2.5} /> Create First Routine
              </button>
            }
          />
        ) : (
          <div className="space-y-3">
            {filteredRoutines.map((routine) => (
              <div
                key={routine.id}
                className="overflow-hidden rounded-2xl border border-white/[0.06] bg-zinc-900 p-4 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[18px] font-bold text-zinc-100">{routine.name}</h3>
                    <div className="mt-0.5 text-[13px] text-zinc-500">
                      {routine.exercises.length} exercise{routine.exercises.length === 1 ? '' : 's'}
                    </div>
                  </div>
                  <button
                    aria-label="Routine options"
                    onClick={() => {
                      setSelectedRoutine(routine);
                      setMenuOpen(true);
                    }}
                    className="grid h-8 w-8 place-items-center rounded-full text-zinc-400 active:bg-white/10"
                  >
                    <Ellipsis size={20} />
                  </button>
                </div>

                <div className="mt-3 divide-y divide-white/5 rounded-xl bg-zinc-950/50 px-3 py-1 text-[14px]">
                  {routine.exercises.length === 0 ? (
                    <div className="py-2.5 text-center text-zinc-500">No exercises added yet</div>
                  ) : (
                    routine.exercises.slice(0, 6).map((item, idx) => {
                      const ex = exerciseMap?.get(item.exerciseId);
                      return (
                        <div key={item.uid || idx} className="flex items-center justify-between py-2">
                          <span className="truncate text-zinc-300">
                            {ex?.name ?? `Exercise #${item.exerciseId}`}
                          </span>
                          <span className="shrink-0 text-[13px] font-medium text-zinc-500 tabular">
                            {item.sets} × {item.reps}
                          </span>
                        </div>
                      );
                    })
                  )}
                  {routine.exercises.length > 6 && (
                    <div className="py-1.5 text-center text-[12px] text-zinc-500">
                      +{routine.exercises.length - 6} more exercises
                    </div>
                  )}
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    id={`start-routine-btn-${routine.id}`}
                    onClick={() => handleStart(routine)}
                    disabled={routine.exercises.length === 0}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand py-3 text-[15px] font-semibold text-white shadow-md shadow-brand/20 transition active:scale-[0.98] disabled:opacity-40"
                  >
                    <Play size={16} fill="currentColor" /> Start Routine
                  </button>
                  <button
                    onClick={() => setEditingRoutine(routine)}
                    className="grid h-12 w-12 place-items-center rounded-xl bg-zinc-800 text-zinc-300 transition active:scale-95 active:bg-zinc-700"
                    aria-label="Edit Routine"
                  >
                    <Pencil size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Routine Options ActionSheet */}
      {selectedRoutine && (
        <ActionSheet
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          title={selectedRoutine.name}
          actions={[
            {
              label: 'Edit Routine',
              icon: Pencil,
              onClick: () => setEditingRoutine(selectedRoutine),
            },
            {
              label: 'Duplicate Routine',
              icon: Copy,
              onClick: () => handleDuplicate(selectedRoutine),
            },
            {
              label: 'Delete Routine',
              icon: Trash,
              destructive: true,
              onClick: () => handleDelete(selectedRoutine),
            },
          ]}
        />
      )}

      {/* Routine Builder Modal (Create / Edit) */}
      <RoutineBuilderModal
        open={isCreating || !!editingRoutine || !!externalEditorOpen}
        routine={editingRoutine}
        allExercises={allExercises ?? []}
        onClose={() => {
          setIsCreating(false);
          setEditingRoutine(null);
          onCloseExternalEditor?.();
        }}
      />

      <Alert config={alert} onClose={() => setAlert(null)} />
    </div>
  );
}

// ───────────────────────── Routine Builder Modal ─────────────────────────

interface RoutineBuilderModalProps {
  open: boolean;
  routine: Routine | null;
  allExercises: Exercise[];
  onClose: () => void;
}

function RoutineBuilderModal({
  open,
  routine,
  allExercises,
  onClose,
}: RoutineBuilderModalProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      full
      title={routine ? 'Edit Routine' : 'New Routine'}
      left={<SheetTextButton onClick={onClose}>Cancel</SheetTextButton>}
    >
      {open && (
        <RoutineBuilderBody
          routine={routine}
          allExercises={allExercises}
          onClose={onClose}
        />
      )}
    </Sheet>
  );
}

function RoutineBuilderBody({
  routine,
  allExercises,
  onClose,
}: {
  routine: Routine | null;
  allExercises: Exercise[];
  onClose: () => void;
}) {
  const { currentUser } = useAuth();
  const [name, setName] = useState(routine?.name ?? '');
  const [exercises, setExercises] = useState<RoutineExercise[]>(
    routine?.exercises ?? [],
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [replaceUid, setReplaceUid] = useState<string | null>(null);
  const [detailExerciseId, setDetailExerciseId] = useState<number | null>(null);

  const exerciseMap = new Map(allExercises.map((e) => [e.id, e]));

  const handleAddExercises = (picked: Exercise[]) => {
    if (replaceUid) {
      const p = picked[0];
      if (p) {
        setExercises((prev) =>
          prev.map((e) => (e.uid === replaceUid ? { ...e, exerciseId: p.id } : e)),
        );
        toast(`Swapped to ${p.name}`, 'success');
      }
      setReplaceUid(null);
      return;
    }
    const newItems: RoutineExercise[] = picked.map((p) => ({
      uid: uid(),
      exerciseId: p.id,
      sets: 3,
      reps: 10,
      restSeconds: 90,
    }));
    setExercises((prev) => [...prev, ...newItems]);
  };

  const handleUpdate = (
    uidVal: string,
    patch: Partial<RoutineExercise>,
  ) => {
    setExercises((prev) =>
      prev.map((e) => (e.uid === uidVal ? { ...e, ...patch } : e)),
    );
  };

  const handleMove = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= exercises.length) return;
    setExercises((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[target];
      copy[target] = temp;
      return copy;
    });
  };

  const handleRemove = (uidVal: string) => {
    setExercises((prev) => prev.filter((e) => e.uid !== uidVal));
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast('Please enter a routine name', 'error');
      return;
    }
    if (exercises.length === 0) {
      toast('Add at least one exercise to the routine', 'error');
      return;
    }

    if (routine) {
      const updated: Routine = {
        ...routine,
        name: trimmedName,
        exercises,
        updatedAt: Date.now(),
      };
      await cloudSaveRoutine(updated);
      toast('Routine updated', 'success');
    } else {
      if (!currentUser) {
        toast('Please log in to save a routine', 'error');
        return;
      }
      const count = await db.routines.where('userId').equals(currentUser.id).count();
      const newId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `rtn_${Date.now()}`;
      const created: Routine = {
        id: newId,
        userId: currentUser.id,
        name: trimmedName,
        exercises,
        order: count,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await cloudSaveRoutine(created);
      toast('Routine created', 'success');
    }
    onClose();
  };

  return (
    <div className="flex min-h-full flex-col px-4 pb-28">
      <div className="space-y-4 pt-2">
        <div>
          <label htmlFor="routine-name-input" className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
            Routine Name
          </label>
          <input
            id="routine-name-input"
            autoFocus={!routine}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Chest & Triceps"
            className="h-12 w-full rounded-xl bg-zinc-800 px-4 text-[17px] font-semibold text-zinc-100 outline-none ring-brand/60 focus:ring-2"
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
              Exercises ({exercises.length})
            </span>
            <button
              onClick={() => {
                setReplaceUid(null);
                setPickerOpen(true);
              }}
              className="flex items-center gap-1 text-[13px] font-semibold text-brand active:opacity-60"
            >
              <Plus size={15} /> Add
            </button>
          </div>

          {exercises.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-[14px] text-zinc-500">
              No exercises added yet. Tap below to select exercises for this routine.
            </div>
          ) : (
            <div className="space-y-3">
              {exercises.map((item, idx) => {
                const ex = exerciseMap.get(item.exerciseId);
                return (
                  <RoutineExerciseCard
                    key={item.uid || idx}
                    item={item}
                    index={idx}
                    total={exercises.length}
                    exercise={ex}
                    onUpdate={(patch) => handleUpdate(item.uid, patch)}
                    onMove={(dir) => handleMove(idx, dir)}
                    onReplace={() => {
                      setReplaceUid(item.uid);
                      setPickerOpen(true);
                    }}
                    onRemove={() => handleRemove(item.uid)}
                    onOpenDetail={() => ex && setDetailExerciseId(ex.id)}
                  />
                );
              })}
            </div>
          )}
        </div>

        <button
          onClick={() => {
            setReplaceUid(null);
            setPickerOpen(true);
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-800/80 py-3 text-[15px] font-semibold text-zinc-200 transition active:scale-[0.98] active:bg-zinc-700"
        >
          <Plus size={18} strokeWidth={2.5} /> Add Exercise
        </button>
      </div>

      <div className="sticky bottom-0 mt-auto bg-gradient-to-t from-zinc-900 via-zinc-900 to-transparent pt-6 pb-[max(12px,env(safe-area-inset-bottom))]">
        <PrimaryButton id="save-routine-btn" onClick={handleSave} disabled={!name.trim() || exercises.length === 0}>
          {routine ? 'Save Changes' : 'Create Routine'}
        </PrimaryButton>
      </div>

      <ExercisePicker
        open={pickerOpen}
        mode={replaceUid ? 'single' : 'multi'}
        title={replaceUid ? 'Swap Exercise' : 'Add Exercises'}
        onClose={() => {
          setPickerOpen(false);
          setReplaceUid(null);
        }}
        onSelect={handleAddExercises}
      />

      <ExerciseDetailSheet
        exerciseId={detailExerciseId}
        onClose={() => setDetailExerciseId(null)}
      />
    </div>
  );
}

// ───────────────────────── Routine Exercise Card in Builder ─────────────────────────

function RoutineExerciseCard({
  item,
  index,
  total,
  exercise,
  onUpdate,
  onMove,
  onReplace,
  onRemove,
  onOpenDetail,
}: {
  item: RoutineExercise;
  index: number;
  total: number;
  exercise?: Exercise;
  onUpdate: (patch: Partial<RoutineExercise>) => void;
  onMove: (dir: -1 | 1) => void;
  onReplace: () => void;
  onRemove: () => void;
  onOpenDetail: () => void;
}) {
  const [restMenuOpen, setRestMenuOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/60 p-3.5">
      <div className="flex items-center gap-3">
        {exercise && (
          <ExerciseThumbnail
            exercise={exercise}
            size={38}
          />
        )}
        <div className="min-w-0 flex-1">
          <button
            onClick={onOpenDetail}
            className="truncate text-left text-[16px] font-semibold text-brand active:opacity-60"
          >
            {exercise?.name ?? 'Unknown Exercise'}
          </button>
          <div className="text-[12px] text-zinc-500">
            {exercise ? `${exercise.muscleGroup} · ${exercise.equipment}` : ''}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            disabled={index === 0}
            onClick={() => onMove(-1)}
            aria-label="Move Up"
            className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 active:bg-zinc-800 disabled:opacity-20"
          >
            <ArrowUp size={16} />
          </button>
          <button
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            aria-label="Move Down"
            className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 active:bg-zinc-800 disabled:opacity-20"
          >
            <ArrowDown size={16} />
          </button>
          <button
            onClick={onReplace}
            aria-label="Swap Exercise"
            className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 active:bg-zinc-800"
          >
            <Replace size={16} />
          </button>
          <button
            onClick={onRemove}
            aria-label="Remove Exercise"
            className="grid h-8 w-8 place-items-center rounded-lg text-red-500 active:bg-red-500/10"
          >
            <Trash size={16} />
          </button>
        </div>
      </div>

      <div className="mt-3.5 grid grid-cols-3 gap-2.5">
        <div className="rounded-xl bg-zinc-900/80 p-2 text-center">
          <div className="text-[11px] font-semibold uppercase text-zinc-500">Target Sets</div>
          <div className="mt-1 flex items-center justify-center gap-2">
            <button
              onClick={() => onUpdate({ sets: Math.max(1, item.sets - 1) })}
              className="grid h-6 w-6 place-items-center rounded-md bg-zinc-800 text-zinc-300 active:bg-zinc-700"
            >
              -
            </button>
            <span className="w-6 font-bold tabular">{item.sets}</span>
            <button
              onClick={() => onUpdate({ sets: item.sets + 1 })}
              className="grid h-6 w-6 place-items-center rounded-md bg-zinc-800 text-zinc-300 active:bg-zinc-700"
            >
              +
            </button>
          </div>
        </div>

        <div className="rounded-xl bg-zinc-900/80 p-2 text-center">
          <div className="text-[11px] font-semibold uppercase text-zinc-500">Target Reps</div>
          <div className="mt-1 flex items-center justify-center">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={item.reps || ''}
              onChange={(e) => {
                const num = parseInt(sanitizeInt(e.target.value), 10);
                onUpdate({ reps: isNaN(num) ? 0 : num });
              }}
              className="h-6 w-14 rounded-md bg-zinc-800 text-center font-bold tabular outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
        </div>

        <button
          onClick={() => setRestMenuOpen(true)}
          className="rounded-xl bg-zinc-900/80 p-2 text-center transition active:bg-zinc-800"
        >
          <div className="text-[11px] font-semibold uppercase text-zinc-500">Rest Timer</div>
          <div className="mt-1 flex items-center justify-center gap-1 font-bold text-brand tabular">
            <Timer size={13} />
            {fmtRest(item.restSeconds)}
          </div>
        </button>
      </div>

      <ActionSheet
        open={restMenuOpen}
        onClose={() => setRestMenuOpen(false)}
        title="Rest Timer"
        actions={REST_OPTIONS.map((sec) => ({
          label: sec === item.restSeconds ? `${fmtRest(sec)} ✓` : fmtRest(sec),
          onClick: () => onUpdate({ restSeconds: sec }),
        }))}
      />
    </div>
  );
}
