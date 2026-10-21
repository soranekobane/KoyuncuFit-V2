import { useEffect, useState } from 'react';
import {
  Check,
  ClipboardList,
  Dumbbell,
  Play,
  Plus,
  Search,
  User,
  Zap,
} from 'lucide-react';
import { cn, fmtClock, fmtVolume } from './lib/utils';
import { liveTotals } from './lib/workout';
import { installAudioUnlock } from './lib/audio';
import { useNow } from './lib/hooks';
import { AuthProvider, useAuth } from './state/AuthContext';
import {
  WorkoutProvider,
  useWorkout,
  type FinishResult,
} from './state/WorkoutContext';
import { PrimaryButton, Toaster } from './components/ui';
import {
  ActiveWorkoutScreen,
  WorkoutCompleteSheet,
} from './components/workout/ActiveWorkoutScreen';
import { WorkoutPage } from './pages/WorkoutPage';
import { RoutinesPage } from './pages/RoutinesPage';
import { ExercisesPage } from './pages/ExercisesPage';
import { ProfilePage } from './pages/ProfilePage';

type Tab = 'routines' | 'workout' | 'exercises' | 'profile';

function WorkoutApp() {
  const { currentUser, users, switchUser, registerUser, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('workout');
  const [openNewRoutine, setOpenNewRoutine] = useState(false);
  const [finishedResult, setFinishedResult] = useState<FinishResult | null>(null);

  const w = useWorkout();
  const now = useNow(1000, !!w.active);

  // Initialize audio unlock, storage persistence, and PWA service worker
  useEffect(() => {
    installAudioUnlock();

    // Call navigator.storage.persist() for reliable offline storage
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      void navigator.storage.persist().catch(() => {
        /* ignore */
      });
    }

    // Register service worker in production or standalone
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        /* ignore dev mode service worker errors */
      });
    }
  }, []);

  const elapsedSec = w.active ? Math.max(0, (now - w.active.startedAt) / 1000) : 0;
  const activeTotals = w.active ? liveTotals(w.active.exercises) : { volume: 0, sets: 0 };

  // If no user is logged in and not loading, show Auth / Welcome screen
  if (!isLoading && !currentUser) {
    return (
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center bg-[#09090b] px-5 py-8 text-zinc-100 antialiased selection:bg-brand/30">
        <AuthScreen users={users} onSwitch={switchUser} onRegister={registerUser} />
        <Toaster />
      </div>
    );
  }

  return (
    <div className="relative mx-auto min-h-screen max-w-md bg-[#09090b] text-zinc-100 antialiased selection:bg-brand/30">
      {/* Main Pages */}
      <main className="min-h-screen">
        {activeTab === 'routines' && (
          <RoutinesPage
            externalEditorOpen={openNewRoutine}
            onCloseExternalEditor={() => setOpenNewRoutine(false)}
          />
        )}
        {activeTab === 'workout' && (
          <WorkoutPage
            onGoRoutines={() => setActiveTab('routines')}
            onNewRoutine={() => {
              setActiveTab('routines');
              setOpenNewRoutine(true);
            }}
          />
        )}
        {activeTab === 'exercises' && <ExercisesPage />}
        {activeTab === 'profile' && (
          <ProfilePage
            onNavigateTab={(tab) => setActiveTab(tab)}
          />
        )}
      </main>

      {/* Minimized Active Workout Floating Banner */}
      {w.active && !w.isOpen && (
        <div className="fixed inset-x-0 bottom-[68px] z-30 mx-auto max-w-md px-3 animate-slide-up">
          <button
            id="minimized-workout-banner"
            onClick={w.open}
            className="flex w-full items-center justify-between gap-3 overflow-hidden rounded-2xl border border-brand/40 bg-zinc-900/95 p-3.5 shadow-xl shadow-brand/15 backdrop-blur-xl transition active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand text-white shadow-md shadow-brand/40">
                <Zap size={20} fill="currentColor" />
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
                </span>
              </div>
              <div className="min-w-0 text-left">
                <div className="truncate text-[15px] font-bold text-zinc-100">
                  {w.active.name || 'Current Workout'}
                </div>
                <div className="flex items-center gap-2 text-[12px] text-zinc-400 tabular">
                  <span className="font-semibold text-brand">{fmtClock(elapsedSec)}</span>
                  <span>·</span>
                  <span>{fmtVolume(activeTotals.volume)}</span>
                  <span>·</span>
                  <span>{activeTotals.sets} sets</span>
                  <span>·</span>
                  <span className="font-semibold text-amber-400">🔥{w.liveCalories}</span>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brand/15 px-3 py-1.5 text-[13px] font-semibold text-brand">
              <Play size={14} fill="currentColor" /> Resume
            </div>
          </button>
        </div>
      )}

      {/* iOS Glassmorphism Bottom Tab Bar (4 Tabs: Routines, Workout, Exercises, Profile) */}
      <nav
        aria-label="Bottom Navigation"
        className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-white/[0.08] bg-zinc-900/90 pt-1 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-xl"
      >
        <div className="grid grid-cols-4 items-center">
          <TabButton
            id="tab-routines"
            active={activeTab === 'routines'}
            onClick={() => setActiveTab('routines')}
            icon={ClipboardList}
            label="Routines"
          />
          <TabButton
            id="tab-workout"
            active={activeTab === 'workout'}
            onClick={() => setActiveTab('workout')}
            icon={Dumbbell}
            label="Workout"
          />
          <TabButton
            id="tab-exercises"
            active={activeTab === 'exercises'}
            onClick={() => setActiveTab('exercises')}
            icon={Search}
            label="Exercises"
          />
          <TabButton
            id="tab-profile"
            active={activeTab === 'profile'}
            onClick={() => setActiveTab('profile')}
            icon={User}
            label="Profile"
          />
        </div>
      </nav>

      {/* Full-screen Live Logging View */}
      {w.isOpen && (
        <ActiveWorkoutScreen
          onFinished={(result) => setFinishedResult(result)}
        />
      )}

      {/* Post-Workout Summary & PR Celebration Modal */}
      <WorkoutCompleteSheet
        result={finishedResult}
        onClose={() => setFinishedResult(null)}
      />

      {/* Global Notifications */}
      <Toaster />
    </div>
  );
}

function TabButton({
  id,
  active,
  onClick,
  icon: Icon,
  label,
}: {
  id?: string;
  active: boolean;
  onClick: () => void;
  icon: typeof Dumbbell;
  label: string;
}) {
  return (
    <button
      id={id}
      onClick={onClick}
      className={cn(
        'group flex flex-col items-center justify-center gap-1 py-1.5 transition-all duration-150 active:scale-95',
        active ? 'text-brand' : 'text-zinc-500 hover:text-zinc-300',
      )}
    >
      <div
        className={cn(
          'grid h-7 w-12 place-items-center rounded-full transition-all duration-200',
          active && 'bg-brand/15 shadow-[0_0_16px_-4px] shadow-brand',
        )}
      >
        <Icon size={21} strokeWidth={active ? 2.5 : 2} />
      </div>
      <span
        className={cn(
          'text-[11px] font-semibold tracking-tight transition-colors',
          active ? 'font-bold text-brand' : 'text-zinc-500',
        )}
      >
        {label}
      </span>
    </button>
  );
}

// ───────────────────────── Login & Sign-up Auth Screen ─────────────────────────

function AuthScreen({
  users,
  onSwitch,
  onRegister,
}: {
  users: Array<{ id: number; name: string; username: string; avatarColor?: string }>;
  onSwitch: (id: number) => void;
  onRegister: (data: {
    username: string;
    name: string;
    gender: 'male' | 'female';
    age: number;
    weightKg: number;
    heightCm: number;
    bodyFatPercentage?: number;
    avatarColor?: string;
  }) => Promise<unknown>;
}) {
  const [tab, setTab] = useState<'login' | 'register'>(users.length > 0 ? 'login' : 'register');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [weightKg, setWeightKg] = useState(75);
  const [heightCm, setHeightCm] = useState(178);
  const [age, setAge] = useState(25);
  const [bodyFat, setBodyFat] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleRegister = async () => {
    if (!username.trim()) return;
    setSubmitting(true);
    try {
      const bfNum = bodyFat.trim() ? parseFloat(bodyFat) : undefined;
      await onRegister({
        username: username.trim(),
        name: name.trim() || username.trim(),
        gender,
        age,
        weightKg,
        heightCm,
        bodyFatPercentage: bfNum && !isNaN(bfNum) ? bfNum : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-tr from-brand to-indigo-500 text-white shadow-xl shadow-brand/30">
          <Dumbbell size={38} strokeWidth={2.4} />
        </div>
        <h1 className="mt-4 text-[28px] font-extrabold tracking-tight">Lift Pro</h1>
        <p className="mt-1 text-[14px] text-zinc-400">Multi-User & Biometric Workout Tracker</p>
      </div>

      {users.length > 0 && (
        <div className="flex rounded-xl bg-zinc-900 p-1">
          <button
            onClick={() => setTab('login')}
            className={cn(
              'flex-1 rounded-lg py-2 text-[14px] font-semibold transition',
              tab === 'login' ? 'bg-brand text-white shadow-sm' : 'text-zinc-400',
            )}
          >
            Select Account
          </button>
          <button
            onClick={() => setTab('register')}
            className={cn(
              'flex-1 rounded-lg py-2 text-[14px] font-semibold transition',
              tab === 'register' ? 'bg-brand text-white shadow-sm' : 'text-zinc-400',
            )}
          >
            New Account
          </button>
        </div>
      )}

      {tab === 'login' && users.length > 0 ? (
        <div className="space-y-2.5">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
            Choose Your Account
          </div>
          <div className="divide-y divide-white/5 rounded-2xl border border-white/[0.06] bg-zinc-900/90 overflow-hidden">
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => onSwitch(u.id)}
                className="flex w-full items-center justify-between p-4 text-left transition active:bg-white/5"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="grid h-11 w-11 place-items-center rounded-xl text-[16px] font-bold text-white shadow"
                    style={{ backgroundColor: u.avatarColor || '#3b82f6' }}
                  >
                    {u.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold text-zinc-100">{u.name}</div>
                    <div className="text-[12px] text-zinc-400">@{u.username}</div>
                  </div>
                </div>
                <div className="grid h-8 w-8 place-items-center rounded-full bg-brand/15 text-brand">
                  <Check size={18} strokeWidth={2.5} />
                </div>
              </button>
            ))}
          </div>

          <button
            onClick={() => setTab('register')}
            className="flex w-full items-center justify-center gap-1.5 py-3 text-[14px] font-semibold text-brand"
          >
            <Plus size={16} /> Create Another Account
          </button>
        </div>
      ) : (
        <div className="space-y-4 rounded-3xl border border-white/[0.06] bg-zinc-900/90 p-5">
          <h2 className="text-[18px] font-bold text-zinc-100">Create Biometric Profile</h2>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Username
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. alex_lift"
              className="h-11 w-full rounded-xl bg-zinc-800 px-3.5 text-[15px] font-semibold text-zinc-100 outline-none ring-brand/60 focus:ring-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Your Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex"
              className="h-11 w-full rounded-xl bg-zinc-800 px-3.5 text-[15px] font-semibold text-zinc-100 outline-none ring-brand/60 focus:ring-2"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Weight (kg)
              </label>
              <input
                type="number"
                value={weightKg}
                onChange={(e) => setWeightKg(parseFloat(e.target.value) || 0)}
                className="h-11 w-full rounded-xl bg-zinc-800 px-3.5 text-[15px] font-bold outline-none ring-brand/60 focus:ring-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Height (cm)
              </label>
              <input
                type="number"
                value={heightCm}
                onChange={(e) => setHeightCm(parseInt(e.target.value, 10) || 0)}
                className="h-11 w-full rounded-xl bg-zinc-800 px-3.5 text-[15px] font-bold outline-none ring-brand/60 focus:ring-2"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Age
              </label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(parseInt(e.target.value, 10) || 0)}
                className="h-11 w-full rounded-xl bg-zinc-800 px-3.5 text-[15px] font-bold outline-none ring-brand/60 focus:ring-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Gender
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setGender('male')}
                  className={cn(
                    'rounded-xl py-2.5 text-[13px] font-semibold',
                    gender === 'male' ? 'bg-brand text-white' : 'bg-zinc-800 text-zinc-400',
                  )}
                >
                  Male
                </button>
                <button
                  type="button"
                  onClick={() => setGender('female')}
                  className={cn(
                    'rounded-xl py-2.5 text-[13px] font-semibold',
                    gender === 'female' ? 'bg-brand text-white' : 'bg-zinc-800 text-zinc-400',
                  )}
                >
                  Female
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Body Fat % (Optional)
            </label>
            <input
              type="number"
              placeholder="e.g. 15"
              value={bodyFat}
              onChange={(e) => setBodyFat(e.target.value)}
              className="h-11 w-full rounded-xl bg-zinc-800 px-3.5 text-[15px] font-bold outline-none ring-brand/60 focus:ring-2"
            />
          </div>

          <div className="pt-2">
            <PrimaryButton onClick={handleRegister} disabled={submitting || !username.trim()}>
              {submitting ? 'Creating Profile…' : 'Start Tracking'}
            </PrimaryButton>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <WorkoutProvider>
        <WorkoutApp />
      </WorkoutProvider>
    </AuthProvider>
  );
}

