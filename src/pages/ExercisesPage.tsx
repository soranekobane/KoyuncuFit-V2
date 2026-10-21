import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Dumbbell, Plus } from 'lucide-react';
import { db, type Exercise } from '../db';
import {
  EmptyState,
  PageHeader,
} from '../components/ui';
import { ExerciseThumbnail } from '../components/ExerciseMedia';
import {
  CreateExerciseSheet,
  FilterChips,
  SearchField,
  useExerciseFilter,
} from '../components/ExercisePicker';
import { ExerciseDetailSheet } from '../components/ExerciseDetail';

export function ExercisesPage() {
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  const f = useExerciseFilter(exercises);
  const [selectedExerciseId, setSelectedExerciseId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // Group count for display
  const totalCount = exercises?.length ?? 0;
  const filteredCount = f.filtered.length;

  return (
    <div className="pb-28">
      <PageHeader
        title="Exercises"
        subtitle={`${totalCount} Total Exercises`}
        right={
          <button
            id="create-exercise-page-btn"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-[14px] font-semibold text-white shadow-md shadow-brand/25 transition active:scale-95"
          >
            <Plus size={17} strokeWidth={2.5} /> Custom
          </button>
        }
      />

      <div className="space-y-3 px-4 pt-1">
        <SearchField
          id="exercise-page-search"
          value={f.query}
          onChange={f.setQuery}
          placeholder="Search by name, muscle, equipment…"
        />

        <FilterChips
          muscle={f.muscle}
          setMuscle={f.setMuscle}
          equipment={f.equipment}
          setEquipment={f.setEquipment}
        />

        <div className="pt-1">
          {exercises && filteredCount === 0 ? (
            <EmptyState
              icon={Dumbbell}
              title="No exercises found"
              text={
                f.query
                  ? `No exercises matching “${f.query}”. Try different filters or create a custom exercise.`
                  : 'No exercises in this category.'
              }
              action={
                <button
                  onClick={() => setCreateOpen(true)}
                  className="flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-[14px] font-semibold text-white shadow-md shadow-brand/30 transition active:scale-95"
                >
                  <Plus size={16} /> Create “{f.query || 'Custom Exercise'}”
                </button>
              }
            />
          ) : (
            <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/[0.06] bg-zinc-900">
              {f.filtered.map((exercise) => (
                <button
                  key={exercise.id}
                  onClick={() => setSelectedExerciseId(exercise.id)}
                  className="flex w-full items-center gap-3.5 px-4 py-3 text-left transition-colors active:bg-white/5"
                >
                  <ExerciseThumbnail
                    exercise={exercise}
                    size={42}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[16px] font-semibold text-zinc-100">
                        {exercise.name}
                      </span>
                      {exercise.isCustom && (
                        <span className="shrink-0 rounded bg-brand/15 px-1.5 py-0.5 text-[11px] font-semibold text-brand">
                          Custom
                        </span>
                      )}
                    </div>
                    <div className="text-[13px] text-zinc-500">
                      {exercise.muscleGroup} · {exercise.equipment}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <ExerciseDetailSheet
        exerciseId={selectedExerciseId}
        onClose={() => setSelectedExerciseId(null)}
      />

      <CreateExerciseSheet
        open={createOpen}
        initialName={f.query}
        onClose={() => setCreateOpen(false)}
        onCreated={(newEx: Exercise) => {
          setSelectedExerciseId(newEx.id);
        }}
      />
    </div>
  );
}
