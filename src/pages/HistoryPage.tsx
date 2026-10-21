import { useEffect, useRef, useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Clock,
  Download,
  Dumbbell,
  Ellipsis,
  FileUp,
  Pencil,
  ShieldCheck,
  Trash,
  Weight,
} from 'lucide-react';
import { db, exportBackup, importBackup, type Workout } from '../db';
import {
  downloadJSON,
  fmtDate,
  fmtDuration,
  fmtNum,
  fmtTime,
  fmtVolume,
} from '../lib/utils';
import {
  activeExerciseFrom,
  activeFromWorkout,
  toWorkoutExercises,
  totalsOf,
  type ActiveExercise,
} from '../lib/workout';
import { toast } from '../lib/hooks';
import { useAuth } from '../state/AuthContext';
import {
  ActionSheet,
  Alert,
  EmptyState,
  PageHeader,
  PrimaryButton,
  Sheet,
  SheetTextButton,
  StatTile,
  type AlertConfig,
} from '../components/ui';
import { WorkoutExercisesEditor } from '../components/workout/ExerciseCard';
import { ExerciseDetailSheet } from '../components/ExerciseDetail';

export function HistoryPage() {
  const { currentUser } = useAuth();
  const workouts = useLiveQuery(
    () => {
      if (!currentUser) return [];
      return db.workouts.where('userId').equals(currentUser.id).reverse().sortBy('startedAt');
    },
    [currentUser?.id],
  );

  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
  const [editingWorkout, setEditingWorkout] = useState<Workout | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [alert, setAlert] = useState<AlertConfig | null>(null);
  const [backupSheetOpen, setBackupSheetOpen] = useState(false);
  const [detailExerciseId, setDetailExerciseId] = useState<number | null>(null);

  // Overall analytics stats
  const stats = useMemo(() => {
    if (!workouts || workouts.length === 0) {
      return { totalWorkouts: 0, totalVolume: 0, totalHours: 0, avgDurationMin: 0 };
    }
    const totalWorkouts = workouts.length;
    const totalVolume = workouts.reduce((s, w) => s + (w.totalVolume || 0), 0);
    const totalSec = workouts.reduce((s, w) => s + (w.durationSec || 0), 0);
    const totalHours = Number((totalSec / 3600).toFixed(1));
    const avgDurationMin = Math.round(totalSec / totalWorkouts / 60);
    return { totalWorkouts, totalVolume, totalHours, avgDurationMin };
  }, [workouts]);

  const handleDelete = (w: Workout) => {
    setAlert({
      title: 'Delete workout log?',
      message: `“${w.name}” from ${fmtDate(w.startedAt)} will be deleted. This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: async () => {
        await db.workouts.delete(w.id);
        toast('Workout deleted', 'info');
      },
    });
  };

  return (
    <div className="pb-28">
      <PageHeader
        title="History"
        subtitle={`${stats.totalWorkouts} Workouts Logged`}
        right={
          <button
            id="backup-data-button"
            onClick={() => setBackupSheetOpen(true)}
            aria-label="Backup & Data Management"
            className="flex items-center gap-1 rounded-xl bg-zinc-800/90 px-3 py-2 text-[13px] font-semibold text-zinc-300 transition active:scale-95"
          >
            <ShieldCheck size={16} className="text-brand" /> Backup
          </button>
        }
      />

      <div className="space-y-5 px-4 pt-1">
        {/* Analytics Summary Tiles */}
        {stats.totalWorkouts > 0 && (
          <div className="grid grid-cols-2 gap-2.5">
            <StatTile
              label="Total Workouts"
              value={stats.totalWorkouts}
              accent="#3b82f6"
            />
            <StatTile
              label="Total Volume"
              value={fmtVolume(stats.totalVolume)}
              accent="#10b981"
            />
            <StatTile
              label="Total Time"
              value={`${stats.totalHours} hrs`}
            />
            <StatTile
              label="Avg Workout"
              value={`${stats.avgDurationMin} min`}
            />
          </div>
        )}

        {/* Workout list */}
        {workouts && workouts.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title="No workouts logged yet"
            text="Completed workouts will appear here with exact set logs, volumes, and PRs."
          />
        ) : (
          <div className="space-y-3.5">
            {workouts?.map((w) => (
              <WorkoutHistoryCard
                key={w.id}
                workout={w}
                onOptions={() => {
                  setSelectedWorkout(w);
                  setMenuOpen(true);
                }}
                onOpenDetail={(exerciseId) => setDetailExerciseId(exerciseId)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Workout Options Menu */}
      {selectedWorkout && (
        <ActionSheet
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          title={selectedWorkout.name}
          actions={[
            {
              label: 'Edit Workout Log',
              icon: Pencil,
              onClick: () => setEditingWorkout(selectedWorkout),
            },
            {
              label: 'Delete Workout Log',
              icon: Trash,
              destructive: true,
              onClick: () => handleDelete(selectedWorkout),
            },
          ]}
        />
      )}

      {/* Workout Editor Modal */}
      {editingWorkout && (
        <EditWorkoutSheet
          workout={editingWorkout}
          open={!!editingWorkout}
          onClose={() => setEditingWorkout(null)}
        />
      )}

      {/* Backup & Restore Sheet */}
      <BackupSheet
        open={backupSheetOpen}
        onClose={() => setBackupSheetOpen(false)}
      />

      <ExerciseDetailSheet
        exerciseId={detailExerciseId}
        onClose={() => setDetailExerciseId(null)}
      />

      <Alert config={alert} onClose={() => setAlert(null)} />
    </div>
  );
}

// ───────────────────────── Workout Card in History ─────────────────────────

function WorkoutHistoryCard({
  workout,
  onOptions,
  onOpenDetail,
}: {
  workout: Workout;
  onOptions: () => void;
  onOpenDetail: (exerciseId: number) => void;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-white/[0.06] bg-zinc-900 p-4 transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[18px] font-bold text-zinc-100">{workout.name}</h3>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-zinc-500">
            <span>{fmtDate(workout.startedAt, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
            <span>·</span>
            <span>{fmtTime(workout.startedAt)}</span>
          </div>
        </div>
        <button
          aria-label="Workout options"
          onClick={onOptions}
          className="grid h-8 w-8 place-items-center rounded-full text-zinc-400 active:bg-white/10"
        >
          <Ellipsis size={20} />
        </button>
      </div>

      {workout.notes && (
        <p className="mt-2 text-[14px] text-zinc-400 italic">“{workout.notes}”</p>
      )}

      {/* Metrics bar */}
      <div className="mt-3.5 grid grid-cols-3 gap-2 rounded-xl bg-zinc-950/60 p-2.5 text-center">
        <div>
          <div className="flex items-center justify-center gap-1 text-[11px] font-semibold uppercase text-zinc-500">
            <Clock size={12} /> Time
          </div>
          <div className="mt-0.5 text-[15px] font-bold text-zinc-200 tabular">
            {fmtDuration(workout.durationSec)}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-center gap-1 text-[11px] font-semibold uppercase text-zinc-500">
            <Weight size={12} /> Volume
          </div>
          <div className="mt-0.5 text-[15px] font-bold text-zinc-200 tabular">
            {fmtVolume(workout.totalVolume)}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-center gap-1 text-[11px] font-semibold uppercase text-zinc-500">
            <Dumbbell size={12} /> Sets
          </div>
          <div className="mt-0.5 text-[15px] font-bold text-zinc-200 tabular">
            {workout.totalSets}
          </div>
        </div>
      </div>

      {/* Exercises Breakdown */}
      <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
        {workout.exercises.map((e) => {
          const validSets = e.sets.filter((s) => s.reps > 0);
          return (
            <div key={e.uid} className="text-[14px]">
              <div className="flex items-baseline justify-between">
                <button
                  onClick={() => onOpenDetail(e.exerciseId)}
                  className="font-semibold text-brand transition active:opacity-60"
                >
                  {e.sets.length} × {e.name}
                </button>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-1.5 text-[12px] text-zinc-400">
                {validSets.map((s, idx) => (
                  <span
                    key={s.uid || idx}
                    className="rounded bg-zinc-800/80 px-2 py-0.5 tabular"
                  >
                    {s.weight > 0 ? `${fmtNum(s.weight, 1)}kg × ${s.reps}` : `${s.reps} reps`}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

// ───────────────────────── Past Workout Edit Sheet ─────────────────────────

function EditWorkoutSheet({
  workout,
  open,
  onClose,
}: {
  workout: Workout;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      full
      title="Edit Workout Log"
      left={<SheetTextButton onClick={onClose}>Cancel</SheetTextButton>}
    >
      {open && <EditWorkoutBody workout={workout} onClose={onClose} />}
    </Sheet>
  );
}

function EditWorkoutBody({
  workout,
  onClose,
}: {
  workout: Workout;
  onClose: () => void;
}) {
  const [name, setName] = useState(workout.name);
  const [notes, setNotes] = useState(workout.notes);
  const [exercises, setExercises] = useState<ActiveExercise[]>(() =>
    activeFromWorkout(workout),
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const workoutExercises = toWorkoutExercises(exercises);
      if (workoutExercises.length === 0) {
        toast('A workout must have at least one completed set', 'error');
        setSaving(false);
        return;
      }
      const totals = totalsOf(workoutExercises);
      await db.workouts.update(workout.id, {
        name: name.trim() || 'Workout',
        notes: notes.trim(),
        exercises: workoutExercises,
        exerciseIds: Array.from(new Set(workoutExercises.map((e) => e.exerciseId))),
        totalVolume: totals.totalVolume,
        totalSets: totals.totalSets,
      });
      toast('Workout updated', 'success');
      onClose();
    } catch {
      toast('Failed to update workout', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col px-4 pb-28">
      <div className="space-y-4 pt-2">
        <div>
          <label htmlFor="edit-workout-name" className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
            Workout Name
          </label>
          <input
            id="edit-workout-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-12 w-full rounded-xl bg-zinc-800 px-4 text-[17px] font-semibold outline-none ring-brand/60 focus:ring-2"
          />
        </div>

        <div>
          <label htmlFor="edit-workout-notes" className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
            Notes
          </label>
          <textarea
            id="edit-workout-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-xl bg-zinc-800 px-4 py-2.5 text-base outline-none ring-brand/60 focus:ring-2"
          />
        </div>

        <div>
          <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
            Exercises & Sets
          </div>
          <WorkoutExercisesEditor
            exercises={exercises}
            onChange={(fn) => setExercises(fn)}
            live={false}
            beforeTs={workout.startedAt}
            excludeWorkoutId={workout.id}
            onAddExercises={(exs) =>
              setExercises((prev) => [
                ...prev,
                ...exs.map((e) => activeExerciseFrom(e, { sets: 3 })),
              ])
            }
          />
        </div>
      </div>

      <div className="sticky bottom-0 mt-auto bg-gradient-to-t from-zinc-900 via-zinc-900 to-transparent pt-6 pb-[max(12px,env(safe-area-inset-bottom))]">
        <PrimaryButton onClick={handleSave} disabled={saving}>
          {saving ? 'Saving Changes…' : 'Save Changes'}
        </PrimaryButton>
      </div>
    </div>
  );
}

// ───────────────────────── Backup & Data Management Sheet ─────────────────────────

function BackupSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { currentUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [isPersisted, setIsPersisted] = useState<boolean | null>(null);

  // Check persistent storage on open
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.storage?.persisted) {
      void navigator.storage.persisted().then(setIsPersisted);
    }
  }, [open]);

  const handleExport = async () => {
    try {
      if (!currentUser) {
        toast('Sign in required for backup export', 'error');
        return;
      }
      const data = await exportBackup(currentUser.id);
      const dateStr = new Date().toISOString().slice(0, 10);
      downloadJSON(data, `koyuncufit-backup-${dateStr}.json`);
      toast('Backup exported successfully', 'success');
    } catch {
      toast('Export failed', 'error');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      if (!currentUser) {
        toast('Sign in required for backup import', 'error');
        return;
      }
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await importBackup(json, currentUser.id);
      toast(
        `Imported ${res.workouts} workouts, ${res.routines} routines`,
        'success',
        3500,
      );
      onClose();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Invalid backup JSON file', 'error');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRequestPersistence = async () => {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      const granted = await navigator.storage.persist();
      setIsPersisted(granted);
      toast(
        granted
          ? 'Persistent storage active! Safari will not clear data.'
          : 'Storage persistence was not granted by Safari.',
        granted ? 'success' : 'info',
      );
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Data & Backups"
      left={<SheetTextButton onClick={onClose}>Done</SheetTextButton>}
    >
      <div className="space-y-5 px-4 pb-8 pt-2">
        {/* Persistence Status */}
        <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/60 p-4">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <ShieldCheck size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-semibold text-zinc-100">
                100% Offline IndexedDB
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">
                All your routines, workouts, and PRs are stored directly on your device.
              </p>
              <div className="mt-2.5 flex items-center justify-between text-[13px]">
                <span className="text-zinc-500">Storage Persistence:</span>
                <span className="font-semibold text-emerald-400">
                  {isPersisted ? 'Permanent (Safe)' : 'Enabled'}
                </span>
              </div>
              {!isPersisted && (
                <button
                  onClick={handleRequestPersistence}
                  className="mt-2 text-[13px] font-semibold text-brand underline"
                >
                  Confirm persistent storage
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Export Backup */}
        <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/60 p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand">
              <Download size={20} />
            </div>
            <div className="flex-1">
              <div className="text-[16px] font-semibold text-zinc-100">Export Backup</div>
              <div className="text-[13px] text-zinc-500">
                Save complete JSON file to iCloud Drive or Files
              </div>
            </div>
          </div>
          <button
            id="export-backup-btn"
            onClick={handleExport}
            className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-[15px] font-semibold text-white shadow-md shadow-brand/20 transition active:scale-[0.98]"
          >
            <Download size={16} /> Download JSON Backup
          </button>
        </div>

        {/* Import Backup */}
        <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/60 p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-purple-500/15 text-purple-400">
              <FileUp size={20} />
            </div>
            <div className="flex-1">
              <div className="text-[16px] font-semibold text-zinc-100">Import Backup</div>
              <div className="text-[13px] text-zinc-500">
                Restore routines & workout logs from a JSON file
              </div>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            id="import-backup-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-800 py-3 text-[15px] font-semibold text-zinc-200 transition active:scale-[0.98] active:bg-zinc-700 disabled:opacity-40"
          >
            <FileUp size={16} /> {importing ? 'Importing…' : 'Select JSON Backup'}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
