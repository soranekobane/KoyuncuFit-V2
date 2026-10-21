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
import { db, type User, type Follow } from '../db';
import { toast } from '../lib/hooks';

const ACTIVE_USER_ID_KEY = 'koyuncu.activeUserId.v1';

export interface AuthContextValue {
  currentUser: User | null;
  users: User[];
  isLoading: boolean;
  login: (username: string, pin?: string) => Promise<User>;
  logout: () => void;
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
  // Social Follows
  follows: Follow[];
  followUser: (targetId: number) => Promise<void>;
  unfollowUser: (targetId: number) => Promise<void>;
  isFollowing: (targetId: number) => boolean;
  getFollowersCount: (userId: number) => number;
  getFollowingCount: (userId: number) => number;
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
  const follows = useLiveQuery<Follow[]>(() => db.follows.toArray(), []) ?? [];
  const [activeUserId, setActiveUserId] = useState<number | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Clean Zero-User Initial State:
  // If localStorage has a valid user ID that exists in db.users, restore session.
  // Otherwise, remain in zero-user state (currentUser = null). Never auto-seed dummy user!
  useEffect(() => {
    async function init() {
      try {
        const saved =
          localStorage.getItem(ACTIVE_USER_ID_KEY) ||
          localStorage.getItem('lift.activeUserId.v1');
        if (saved) {
          const parsedId = parseInt(saved, 10);
          const found = await db.users.get(parsedId);
          if (found) {
            setActiveUserId(found.id);
            localStorage.setItem(ACTIVE_USER_ID_KEY, String(found.id));
          } else {
            setActiveUserId(null);
            localStorage.removeItem(ACTIVE_USER_ID_KEY);
            localStorage.removeItem('lift.activeUserId.v1');
          }
        } else {
          setActiveUserId(null);
        }
      } catch {
        setActiveUserId(null);
      } finally {
        setInitialized(true);
      }
    }
    void init();
  }, []);

  // Current active user strictly matches activeUserId
  const currentUser = useMemo(() => {
    if (!activeUserId || !users.length) return null;
    return users.find((u) => u.id === activeUserId) ?? null;
  }, [users, activeUserId]);

  const login = useCallback(
    async (username: string, pin?: string): Promise<User> => {
      const trimmed = username.trim().toLowerCase();
      if (!trimmed) throw new Error('Please enter your username.');
      const allUsers = await db.users.toArray();
      const user = allUsers.find((u) => u.username.toLowerCase() === trimmed);
      if (!user) {
        throw new Error(`Account “@${username}” not found. Please create an account.`);
      }
      if (user.pin && user.pin.trim() !== '') {
        if (!pin || pin.trim() !== user.pin.trim()) {
          throw new Error('Incorrect Password / PIN.');
        }
      }
      setActiveUserId(user.id);
      localStorage.setItem(ACTIVE_USER_ID_KEY, String(user.id));
      toast(`Welcome back, ${user.name}!`, 'success');
      return user;
    },
    [],
  );

  const logout = useCallback(() => {
    setActiveUserId(null);
    localStorage.removeItem(ACTIVE_USER_ID_KEY);
    localStorage.removeItem('lift.activeUserId.v1');
    toast('Logged out successfully', 'info');
  }, []);

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
      if (!trimmedUser) {
        throw new Error('Username is required.');
      }
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
      toast(`Welcome to KoyuncuFit, ${newUser.name}!`, 'success');
      return { ...newUser, id: newId };
    },
    [],
  );

  const deleteUser = useCallback(
    async (userId: number) => {
      await db.transaction('rw', db.users, db.routines, db.workouts, db.follows, async () => {
        await db.users.delete(userId);
        await db.routines.where('userId').equals(userId).delete();
        await db.workouts.where('userId').equals(userId).delete();
        await db.follows.where('followerId').equals(userId).delete();
        await db.follows.where('followingId').equals(userId).delete();
      });
      const remaining = await db.users.orderBy('id').first();
      if (remaining) {
        setActiveUserId(remaining.id);
        localStorage.setItem(ACTIVE_USER_ID_KEY, String(remaining.id));
      } else {
        setActiveUserId(null);
        localStorage.removeItem(ACTIVE_USER_ID_KEY);
      }
      toast('Account deleted', 'info');
    },
    [],
  );

  // Social follow operations
  const followUser = useCallback(
    async (targetId: number) => {
      if (!currentUser || currentUser.id === targetId) return;
      const existing = await db.follows
        .where({ followerId: currentUser.id, followingId: targetId })
        .first();
      if (!existing) {
        await db.follows.add({
          followerId: currentUser.id,
          followingId: targetId,
          createdAt: Date.now(),
        });
        toast('Following athlete', 'success');
      }
    },
    [currentUser],
  );

  const unfollowUser = useCallback(
    async (targetId: number) => {
      if (!currentUser) return;
      await db.follows
        .where({ followerId: currentUser.id, followingId: targetId })
        .delete();
      toast('Unfollowed', 'info');
    },
    [currentUser],
  );

  const isFollowing = useCallback(
    (targetId: number) => {
      if (!currentUser) return false;
      return follows.some(
        (f) => f.followerId === currentUser.id && f.followingId === targetId,
      );
    },
    [currentUser, follows],
  );

  const getFollowersCount = useCallback(
    (userId: number) => follows.filter((f) => f.followingId === userId).length,
    [follows],
  );

  const getFollowingCount = useCallback(
    (userId: number) => follows.filter((f) => f.followerId === userId).length,
    [follows],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      currentUser,
      users,
      isLoading: !initialized,
      login,
      logout,
      switchUser,
      updateBiometrics,
      registerUser,
      deleteUser,
      follows,
      followUser,
      unfollowUser,
      isFollowing,
      getFollowersCount,
      getFollowingCount,
    }),
    [
      currentUser,
      users,
      initialized,
      login,
      logout,
      switchUser,
      updateBiometrics,
      registerUser,
      deleteUser,
      follows,
      followUser,
      unfollowUser,
      isFollowing,
      getFollowersCount,
      getFollowingCount,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
