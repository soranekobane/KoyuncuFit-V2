import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  ClipboardList,
  Dumbbell,
  KeyRound,
  Lock,
  Play,
  Plus,
  Search,
  User,
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
import { type PublicUser } from './db';
import { type RegisterInput } from './lib/auth';
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
  const { currentUser, users, switchUser, registerUser, login, isLoading } = useAuth();
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
      void navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          reg.update().catch(() => {});
        })
        .catch(() => {
          /* ignore dev mode service worker errors */
        });
    }
  }, []);

  const elapsedSec = w.active ? Math.max(0, (now - w.active.startedAt) / 1000) : 0;
  const activeTotals = w.active ? liveTotals(w.active.exercises) : { volume: 0, sets: 0 };

  // Loading splash screen with official KoyuncuFit brand
  if (isLoading) {
    return (
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col items-center justify-center bg-[#09090b] px-5 py-8 text-zinc-100 antialiased selection:bg-brand/30">
        <div className="flex flex-col items-center animate-pulse">
          <img
            src="/icons/koyuncufit-logo.png"
            alt="KoyuncuFit"
            className="h-28 w-28 object-contain drop-shadow-[0_10px_25px_rgba(0,180,255,0.3)] rounded-2xl"
          />
          <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-zinc-400">
            <span className="h-2 w-2 rounded-full bg-brand animate-ping" />
            Loading KoyuncuFit…
          </div>
        </div>
      </div>
    );
  }

  // If no user is logged in, show Auth / Welcome screen
  if (!currentUser) {
    return (
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center bg-[#09090b] px-5 py-8 text-zinc-100 antialiased selection:bg-brand/30">
        <AuthScreen
          users={users}
          onSwitch={switchUser}
          onLogin={login}
          onRegister={registerUser}
        />
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
              <div className="relative h-10 w-10 shrink-0 rounded-xl overflow-hidden border border-brand/40 shadow-md shadow-brand/30 bg-[#05070d]">
                <img src="/icons/icon-192.png" alt="Active" className="h-full w-full object-contain p-0.5" />
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
  onLogin,
  onRegister,
}: {
  users: PublicUser[];
  onSwitch: (id: number, pin?: string) => Promise<void>;
  onLogin: (username: string, pin?: string) => Promise<unknown>;
  onRegister: (data: RegisterInput) => Promise<unknown>;
}) {
  const [tab, setTab] = useState<'login' | 'register'>(users.length > 0 ? 'login' : 'register');

  // Manual Login Form
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [loginError, setLoginError] = useState('');

  // Quick Account Login Modal / PIN Prompt
  const [pinPromptUser, setPinPromptUser] = useState<(typeof users)[0] | null>(null);
  const [userPinInput, setUserPinInput] = useState('');
  const [userPinError, setUserPinError] = useState('');

  // Register Form
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [weightKg, setWeightKg] = useState(75);
  const [heightCm, setHeightCm] = useState(178);
  const [age, setAge] = useState(25);
  const [bodyFat, setBodyFat] = useState('');
  const [avatarColor, setAvatarColor] = useState('#3b82f6');
  const [regError, setRegError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444'];

  const handleManualLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!loginUsername.trim()) {
      setLoginError('Please enter your username.');
      return;
    }
    setLoginError('');
    setSubmitting(true);
    try {
      await onLogin(loginUsername.trim(), loginPin);
    } catch (err: unknown) {
      setLoginError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectAccount = (u: PublicUser) => {
    if (u.hasPin) {
      setPinPromptUser(u);
      setUserPinInput('');
      setUserPinError('');
    } else {
      void onSwitch(u.id).catch((err: unknown) => {
        setLoginError(err instanceof Error ? err.message : 'Switch failed');
      });
    }
  };

  const handleVerifyAccountPin = async () => {
    if (!pinPromptUser) return;
    try {
      await onSwitch(pinPromptUser.id, userPinInput);
      setPinPromptUser(null);
    } catch (err: unknown) {
      setUserPinError(err instanceof Error ? err.message : 'Incorrect PIN.');
    }
  };

  const handleRegister = async () => {
    if (!username.trim()) {
      setRegError('Please provide a username.');
      return;
    }
    if (!pin.trim() || pin.trim().length < 4) {
      setRegError('Please choose a Password / PIN (at least 4 characters).');
      return;
    }
    setRegError('');
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
        avatarColor,
        pin: pin.trim(),
      });
    } catch (err: unknown) {
      setRegError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Brand Header */}
      <div className="text-center flex flex-col items-center">
        <div className="relative mb-2">
          <img
            src="/icons/koyuncufit-logo.png"
            alt="KoyuncuFit Official Logo"
            className="h-32 w-32 object-contain drop-shadow-[0_12px_30px_rgba(30,112,255,0.3)] rounded-2xl"
          />
        </div>
        <p className="mt-1 text-[14px] text-zinc-400 font-medium">
          Social Workout Tracker & Friend Comparison
        </p>
      </div>

      {/* Tabs */}
      {users.length > 0 && (
        <div className="flex rounded-2xl bg-zinc-900 p-1 border border-white/5">
          <button
            onClick={() => setTab('login')}
            className={cn(
              'flex-1 rounded-xl py-2.5 text-[14px] font-bold transition',
              tab === 'login' ? 'bg-brand text-white shadow-md' : 'text-zinc-400 hover:text-zinc-200',
            )}
          >
            Log In
          </button>
          <button
            onClick={() => setTab('register')}
            className={cn(
              'flex-1 rounded-xl py-2.5 text-[14px] font-bold transition',
              tab === 'register' ? 'bg-brand text-white shadow-md' : 'text-zinc-400 hover:text-zinc-200',
            )}
          >
            Create Account
          </button>
        </div>
      )}

      {/* Login Tab */}
      {tab === 'login' && users.length > 0 ? (
        <div className="space-y-4">
          {/* Quick Athlete Account Switch */}
          <div className="space-y-2">
            <div className="text-[12px] font-bold uppercase tracking-wider text-zinc-500">
              Select Your Account
            </div>
            <div className="divide-y divide-white/5 rounded-2xl border border-white/[0.06] bg-zinc-900/90 overflow-hidden">
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleSelectAccount(u)}
                  className="flex w-full items-center justify-between p-3.5 text-left transition active:bg-white/5 hover:bg-white/[0.02]"
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
                  <div className="flex items-center gap-2">
                    {u.hasPin && <Lock size={14} className="text-zinc-500" />}
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-brand/15 text-brand">
                      <Check size={18} strokeWidth={2.5} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Or Manual Login with Username and PIN */}
          <div className="rounded-2xl border border-white/[0.06] bg-zinc-900/60 p-4 space-y-3">
            <div className="text-[12px] font-bold uppercase tracking-wider text-zinc-500">
              Or Login With Username
            </div>

            {loginError && (
              <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 p-2.5 text-[13px] text-red-400">
                <AlertCircle size={16} />
                <span>{loginError}</span>
              </div>
            )}

            <div>
              <input
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                placeholder="Username (e.g. alex)"
                className="h-11 w-full rounded-xl bg-zinc-800 px-3.5 text-[14px] text-zinc-100 placeholder:text-zinc-500 outline-none ring-brand/60 focus:ring-2"
              />
            </div>
            <div>
              <input
                type="password"
                value={loginPin}
                onChange={(e) => setLoginPin(e.target.value)}
                placeholder="Password / PIN (if set)"
                className="h-11 w-full rounded-xl bg-zinc-800 px-3.5 text-[14px] text-zinc-100 placeholder:text-zinc-500 outline-none ring-brand/60 focus:ring-2"
              />
            </div>
            <button
              onClick={() => void handleManualLogin()}
              disabled={submitting || !loginUsername.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-[14px] font-bold text-white shadow transition active:scale-[0.98] disabled:opacity-40"
            >
              <KeyRound size={16} /> {submitting ? 'Verifying…' : 'Sign In'}
            </button>
          </div>

          {/* Switch to Register Button */}
          <button
            onClick={() => setTab('register')}
            className="flex w-full items-center justify-center gap-1.5 py-2 text-[14px] font-bold text-brand hover:underline"
          >
            <Plus size={16} /> Register a New Friend Account
          </button>
        </div>
      ) : (
        /* Register Tab */
        <div className="space-y-4 rounded-3xl border border-white/[0.06] bg-zinc-900/90 p-5 shadow-xl">
          <div>
            <h2 className="text-[19px] font-bold text-zinc-100">Create KoyuncuFit Profile</h2>
            <p className="text-[12px] text-zinc-400">
              Clean start — your routine list starts empty so you can build your custom program.
            </p>
          </div>

          {regError && (
            <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 p-2.5 text-[13px] text-red-400">
              <AlertCircle size={16} />
              <span>{regError}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Username
              </label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. yigit_fit"
                className="h-11 w-full rounded-xl bg-zinc-800 px-3.5 text-[15px] font-semibold text-zinc-100 outline-none ring-brand/60 focus:ring-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Password / PIN (Required)
              </label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Min. 4 characters"
                className="h-11 w-full rounded-xl bg-zinc-800 px-3.5 text-[15px] font-semibold text-zinc-100 outline-none ring-brand/60 focus:ring-2"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Display Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Yigit"
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
                step="0.5"
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
                    gender === 'male' ? 'bg-brand text-white shadow-sm' : 'bg-zinc-800 text-zinc-400',
                  )}
                >
                  Male
                </button>
                <button
                  type="button"
                  onClick={() => setGender('female')}
                  className={cn(
                    'rounded-xl py-2.5 text-[13px] font-semibold',
                    gender === 'female' ? 'bg-brand text-white shadow-sm' : 'bg-zinc-800 text-zinc-400',
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
              step="0.5"
              placeholder="e.g. 15"
              value={bodyFat}
              onChange={(e) => setBodyFat(e.target.value)}
              className="h-11 w-full rounded-xl bg-zinc-800 px-3.5 text-[15px] font-bold outline-none ring-brand/60 focus:ring-2"
            />
          </div>

          {/* Avatar Color Picker */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Profile Accent Color
            </label>
            <div className="flex gap-2">
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAvatarColor(c)}
                  className={cn(
                    'h-8 w-8 rounded-full transition active:scale-95',
                    avatarColor === c && 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900 scale-105',
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="pt-2">
            <PrimaryButton onClick={handleRegister} disabled={submitting || !username.trim()}>
              {submitting ? 'Setting Up Account…' : 'Start with KoyuncuFit'}
            </PrimaryButton>
          </div>
        </div>
      )}

      {/* PIN Verification Modal */}
      {pinPromptUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xs space-y-4 rounded-3xl border border-white/10 bg-zinc-900 p-5 shadow-2xl">
            <div className="text-center">
              <div
                className="mx-auto grid h-12 w-12 place-items-center rounded-2xl text-[18px] font-bold text-white shadow"
                style={{ backgroundColor: pinPromptUser.avatarColor || '#3b82f6' }}
              >
                {pinPromptUser.name.slice(0, 2).toUpperCase()}
              </div>
              <h3 className="mt-2 text-[16px] font-bold text-zinc-100">Enter PIN for {pinPromptUser.name}</h3>
              <p className="text-[12px] text-zinc-400">Account is protected by a PIN</p>
            </div>

            {userPinError && (
              <div className="rounded-xl bg-red-500/10 p-2 text-center text-[12px] text-red-400">
                {userPinError}
              </div>
            )}

            <input
              type="password"
              autoFocus
              value={userPinInput}
              onChange={(e) => setUserPinInput(e.target.value)}
              placeholder="Enter PIN…"
              className="h-11 w-full rounded-xl bg-zinc-800 text-center text-[18px] tracking-widest font-bold text-zinc-100 outline-none ring-brand/60 focus:ring-2"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleVerifyAccountPin();
              }}
            />

            <div className="flex gap-2">
              <button
                onClick={() => setPinPromptUser(null)}
                className="flex-1 rounded-xl bg-zinc-800 py-2.5 text-[13px] font-semibold text-zinc-300"
              >
                Cancel
              </button>
              <button
                onClick={handleVerifyAccountPin}
                className="flex-1 rounded-xl bg-brand py-2.5 text-[13px] font-bold text-white shadow"
              >
                Unlock
              </button>
            </div>
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

