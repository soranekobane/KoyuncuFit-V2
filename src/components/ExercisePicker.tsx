import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Plus, Search, X } from 'lucide-react';
import { db, EQUIPMENT, MUSCLE_GROUPS, type Equipment, type Exercise, type MuscleGroup } from '../db';
import { cn } from '../lib/utils';
import { toast } from '../lib/hooks';
import { Chip, PrimaryButton, Sheet, SheetTextButton } from './ui';
import { ExerciseThumbnail } from './ExerciseMedia';

// ───────────────────────── Search + filter hook (shared with Exercises tab) ─────────────────────────

export function useExerciseFilter(exercises: Exercise[] | undefined) {
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | 'All'>('All');
  const [equipment, setEquipment] = useState<Equipment | 'All'>('All');

  const filtered = useMemo(() => {
    if (!exercises) return [];
    const q = query.trim().toLowerCase();
    return exercises
      .filter((e) => (muscle === 'All' || e.muscleGroup === muscle) && (equipment === 'All' || e.equipment === equipment))
      .filter((e) => !q || e.name.toLowerCase().includes(q) || e.muscleGroup.toLowerCase().includes(q) || e.equipment.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [exercises, query, muscle, equipment]);

  return { query, setQuery, muscle, setMuscle, equipment, setEquipment, filtered };
}

export function SearchField({ value, onChange, placeholder = 'Search exercise', id }: { value: string; onChange: (v: string) => void; placeholder?: string; id?: string }) {
  return (
    <div className="relative">
      <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-500" />
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type="search"
        autoComplete="off"
        className="h-11 w-full rounded-xl bg-zinc-800/80 pr-9 pl-10 text-base text-zinc-100 outline-none ring-brand/60 transition focus:ring-2"
      />
      {value && (
        <button aria-label="Clear search" onClick={() => onChange('')} className="absolute top-1/2 right-2.5 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full bg-zinc-600 text-zinc-900">
          <X size={13} strokeWidth={3} />
        </button>
      )}
    </div>
  );
}

export function FilterChips({
  muscle,
  setMuscle,
  equipment,
  setEquipment,
}: {
  muscle: MuscleGroup | 'All';
  setMuscle: (m: MuscleGroup | 'All') => void;
  equipment: Equipment | 'All';
  setEquipment: (e: Equipment | 'All') => void;
}) {
  return (
    <div className="space-y-2">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        <Chip active={muscle === 'All'} onClick={() => setMuscle('All')}>
          All Muscles
        </Chip>
        {MUSCLE_GROUPS.map((m) => (
          <Chip key={m} active={muscle === m} onClick={() => setMuscle(muscle === m ? 'All' : m)}>
            {m}
          </Chip>
        ))}
      </div>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        <Chip active={equipment === 'All'} onClick={() => setEquipment('All')}>
          All Equipment
        </Chip>
        {EQUIPMENT.map((e) => (
          <Chip key={e} active={equipment === e} onClick={() => setEquipment(equipment === e ? 'All' : e)}>
            {e}
          </Chip>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── Exercise picker sheet ─────────────────────────

interface PickerProps {
  open: boolean;
  onClose: () => void;
  mode: 'multi' | 'single';
  title?: string;
  onSelect: (exercises: Exercise[]) => void;
}

export function ExercisePicker(props: PickerProps) {
  return (
    <Sheet
      open={props.open}
      onClose={props.onClose}
      full
      title={props.title ?? (props.mode === 'single' ? 'Replace Exercise' : 'Add Exercises')}
      left={<SheetTextButton onClick={props.onClose}>Cancel</SheetTextButton>}
    >
      {props.open && <PickerBody {...props} />}
    </Sheet>
  );
}

function PickerBody({ mode, onSelect, onClose }: PickerProps) {
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  const f = useExerciseFilter(exercises);
  const [selected, setSelected] = useState<number[]>([]);
  const [creating, setCreating] = useState(false);

  const toggle = (ex: Exercise) => {
    if (mode === 'single') {
      onSelect([ex]);
      onClose();
      return;
    }
    setSelected((s) => (s.includes(ex.id) ? s.filter((x) => x !== ex.id) : [...s, ex.id]));
  };

  const confirm = () => {
    if (!exercises) return;
    const map = new Map(exercises.map((e) => [e.id, e]));
    onSelect(selected.map((id) => map.get(id)).filter((e): e is Exercise => !!e));
    onClose();
  };

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 space-y-3 bg-zinc-900 px-4 pb-3">
        <div className="flex gap-2">
          <div className="flex-1">
            <SearchField id="picker-search" value={f.query} onChange={f.setQuery} />
          </div>
          <button
            id="picker-create-exercise"
            onClick={() => setCreating(true)}
            className="flex h-11 items-center gap-1 rounded-xl bg-brand/15 px-3 text-[14px] font-semibold text-brand active:bg-brand/25"
          >
            <Plus size={17} /> New
          </button>
        </div>
        <FilterChips muscle={f.muscle} setMuscle={f.setMuscle} equipment={f.equipment} setEquipment={f.setEquipment} />
      </div>

      <ul className="flex-1 px-2 pb-28">
        {f.filtered.map((ex) => {
          const isSel = selected.includes(ex.id);
          return (
            <li key={ex.id}>
              <button
                onClick={() => toggle(ex)}
                className={cn('flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors active:bg-white/5', isSel && 'bg-brand/10')}
              >
                <div className="relative">
                  <ExerciseThumbnail exercise={ex} size={42} />
                  {isSel && (
                    <div className="absolute -right-0.5 -bottom-0.5 grid h-5 w-5 animate-pop place-items-center rounded-full bg-brand ring-2 ring-zinc-900">
                      <Check size={12} strokeWidth={3.5} />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className={cn('truncate text-[16px] font-medium', isSel && 'text-brand')}>{ex.name}</div>
                  <div className="text-[13px] text-zinc-500">
                    {ex.muscleGroup} · {ex.equipment}
                    {ex.isCustom && <span className="ml-1.5 rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400">Custom</span>}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
        {exercises && f.filtered.length === 0 && (
          <li className="px-4 py-12 text-center text-[14px] text-zinc-500">
            No exercises found.
            <button onClick={() => setCreating(true)} className="mt-3 block w-full font-semibold text-brand">
              Create “{f.query || 'custom exercise'}”
            </button>
          </li>
        )}
      </ul>

      {mode === 'multi' && selected.length > 0 && (
        <div className="sticky bottom-0 bg-gradient-to-t from-zinc-900 via-zinc-900 to-transparent px-4 pt-6 pb-[max(16px,env(safe-area-inset-bottom))]">
          <PrimaryButton id="picker-confirm" onClick={confirm} className="animate-slide-up">
            Add {selected.length} exercise{selected.length > 1 ? 's' : ''}
          </PrimaryButton>
        </div>
      )}

      <CreateExerciseSheet
        open={creating}
        initialName={f.query}
        onClose={() => setCreating(false)}
        onCreated={(ex) => {
          if (mode === 'single') {
            onSelect([ex]);
            onClose();
          } else setSelected((s) => [...s, ex.id]);
        }}
      />
    </div>
  );
}

// ───────────────────────── Create custom exercise ─────────────────────────

export function CreateExerciseSheet({
  open,
  onClose,
  onCreated,
  initialName = '',
  editing,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (ex: Exercise) => void;
  initialName?: string;
  editing?: Exercise;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={editing ? 'Edit Exercise' : 'New Exercise'} left={<SheetTextButton onClick={onClose}>Cancel</SheetTextButton>}>
      {open && <CreateBody onClose={onClose} onCreated={onCreated} initialName={initialName} editing={editing} />}
    </Sheet>
  );
}

function CreateBody({ onClose, onCreated, initialName, editing }: { onClose: () => void; onCreated?: (ex: Exercise) => void; initialName: string; editing?: Exercise }) {
  const [name, setName] = useState(editing?.name ?? initialName);
  const [muscle, setMuscle] = useState<MuscleGroup>(editing?.muscleGroup ?? 'Chest');
  const [equipment, setEquipment] = useState<Equipment>(editing?.equipment ?? 'Barbell');

  const save = async () => {
    const n = name.trim();
    if (!n) return;
    const dupe = await db.exercises.filter((e) => e.name.toLowerCase() === n.toLowerCase() && e.id !== editing?.id).first();
    if (dupe) {
      toast('An exercise with that name already exists', 'error');
      return;
    }
    if (editing) {
      await db.exercises.update(editing.id, { name: n, muscleGroup: muscle, equipment });
      toast('Exercise updated', 'success');
      onClose();
      return;
    }
    const data: Omit<Exercise, 'id'> = {
      name: n,
      muscleGroup: muscle,
      equipment,
      primaryMuscles: [muscle],
      secondaryMuscles: [],
      metValue: 4.5,
      isCustom: true,
      createdAt: Date.now(),
    };
    const id = (await db.exercises.add(data as Exercise)) as number;
    toast(`Created “${n}”`, 'success');
    onCreated?.({ ...data, id });
    onClose();
  };

  return (
    <div className="space-y-6 px-4 pb-[max(20px,env(safe-area-inset-bottom))]">
      <div>
        <label htmlFor="new-exercise-name" className="mb-2 block text-[13px] font-semibold uppercase tracking-wide text-zinc-500">
          Name
        </label>
        <input
          id="new-exercise-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Smith Machine Squat"
          className="h-12 w-full rounded-xl bg-zinc-800 px-4 text-base outline-none ring-brand/60 focus:ring-2"
        />
      </div>
      <div>
        <div className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-zinc-500">Muscle Group</div>
        <div className="flex flex-wrap gap-2">
          {MUSCLE_GROUPS.map((m) => (
            <Chip key={m} active={muscle === m} onClick={() => setMuscle(m)}>
              {m}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-zinc-500">Equipment</div>
        <div className="flex flex-wrap gap-2">
          {EQUIPMENT.map((e) => (
            <Chip key={e} active={equipment === e} onClick={() => setEquipment(e)}>
              {e}
            </Chip>
          ))}
        </div>
      </div>
      <PrimaryButton id="save-exercise" onClick={save} disabled={!name.trim()}>
        {editing ? 'Save Changes' : 'Create Exercise'}
      </PrimaryButton>
    </div>
  );
}
