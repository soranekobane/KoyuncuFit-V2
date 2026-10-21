import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, DEFAULT_USER, type User } from '../db';
import { toast } from '../lib/hooks';

const ACTIVE_USER_ID_KEY = 'lift.activeUserId.v1';

interface AuthContextValue {
  currentUser: User | null;
  users: User[];
  isLoading: boolean;
  switchUser: (userId: number) => void;
  updateBiometrics: (patch: Partial<Omit<User, 'id' | 'createdAt'>>) => Promise<void>;
  registerUser: (userData: {
    username: string;
    name: string;
    gender: 'male' | 'female';
    age: number;
    weightKg: number;
    heightCm: number;
    bodyFatPercentage?: number;
    avatarColor?: string;
    pin?: string;
  }) => Promise<User>;
  deleteUser: (userId: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const AVATAR_COLORS = [
  '#3b82f6', // electric blue
  '#10b981', // emerald
  '#8b5cf6', // violet
  '#f59e0b', // amber
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#ef4444', // red
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const users = useLiveQuery(() => db.users.toArray(), []) ?? [];
  const [activeUserId, setActiveUserId] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_USER_ID_KEY);
      return saved ? parseInt(saved, 10) : null;
    } catch {
      return null;
    }
  });
  const [initialized, setInitialized] = useState(false);

  // Auto-seed or select user if none exists
  useEffect(() => {
    async function init() {
      const count = await db.users.count();
      if (count === 0) {
        const id = (await db.users.add({
          ...DEFAULT_USER,
        })) as number;
        setActiveUserId(id);
        localStorage.setItem(ACTIVE_USER_ID_KEY, String(id));
      } else if (activeUserId == null) {
        const first = await db.users.orderBy('id').first();
        if (first) {
          setActiveUserId(first.id);
          localStorage.setItem(ACTIVE_USER_ID_KEY, String(first.id));
        }
      }
      setInitialized(true);
    }
    void init();
  }, [activeUserId]);

  // Current active user
  const currentUser = useMemo(() => {
    if (!users.length) return null;
    return users.find((u) => u.id === activeUserId) ?? users[0] ?? null;
  }, [users, activeUserId]);

  const switchUser = useCallback((userId: number) => {
    setActiveUserId(userId);
    localStorage.setItem(ACTIVE_USER_ID_KEY, String(userId));
    toast('Switched account', 'info');
  }, []);

  const updateBiometrics = useCallback(
    async (patch: Partial<Omit<User, 'id' | 'createdAt'>>) => {
      if (!currentUser) return;
      await db.users.update(currentUser.id, patch);
      toast('Biometrics updated', 'success');
    },
    [currentUser],
  );

  const registerUser = useCallback(
    async (data: {
      username: string;
      name: string;
      gender: 'male' | 'female';
      age: number;
      weightKg: number;
      heightCm: number;
      bodyFatPercentage?: number;
      avatarColor?: string;
      pin?: string;
    }) => {
      const trimmedUser = data.username.trim().toLowerCase();
      const existing = await db.users
        .filter((u) => u.username.toLowerCase() === trimmedUser)
        .first();
      if (existing) {
        throw new Error(`Username “${data.username}” is already taken.`);
      }
      const randomColor =
        data.avatarColor ||
        AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
      const newUser: Omit<User, 'id'> = {
        username: trimmedUser,
        name: data.name.trim() || trimmedUser,
        gender: data.gender,
        age: Math.max(12, Math.min(100, data.age)),
        weightKg: Math.max(30, Math.min(300, data.weightKg)),
        heightCm: Math.max(100, Math.min(250, data.heightCm)),
        bodyFatPercentage: data.bodyFatPercentage,
        avatarColor: randomColor,
        pin: data.pin?.trim(),
        createdAt: Date.now(),
      };
      const newId = (await db.users.add(newUser as User)) as number;
      setActiveUserId(newId);
      localStorage.setItem(ACTIVE_USER_ID_KEY, String(newId));
      toast(`Welcome, ${newUser.name}!`, 'success');
      return { ...newUser, id: newId };
    },
    [],
  );

  const deleteUser = useCallback(
    async (userId: number) => {
      const all = await db.users.toArray();
      if (all.length <= 1) {
        throw new Error('Cannot delete the only remaining user account.');
      }
      await db.transaction('rw', db.users, db.routines, db.workouts, async () => {
        await db.users.delete(userId);
        await db.routines.where('userId').equals(userId).delete();
        await db.workouts.where('userId').equals(userId).delete();
      });
      const remaining = await db.users.orderBy('id').first();
      if (remaining) {
        setActiveUserId(remaining.id);
        localStorage.setItem(ACTIVE_USER_ID_KEY, String(remaining.id));
      }
      toast('Account deleted', 'info');
    },
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      currentUser,
      users,
      isLoading: !initialized,
      switchUser,
      updateBiometrics,
      registerUser,
      deleteUser,
    }),
    [currentUser, users, initialized, switchUser, updateBiometrics, registerUser, deleteUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
