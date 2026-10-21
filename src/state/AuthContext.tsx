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
import { db, toPublicUser, toSafeUser, type Follow, type PublicUser, type SafeUser } from '../db';
import { toast } from '../lib/hooks';
import {
  authenticate,
  authenticateById,
  changePin as changePinFn,
  deleteOwnAccount,
  migrateLegacyPins,
  registerAccount,
  updateProfile,
  type ProfilePatch,
  type RegisterInput,
} from '../lib/auth';
import { follow, unfollow } from '../lib/social';

const ACTIVE_USER_ID_KEY = 'koyuncu.activeUserId.v1';
const LEGACY_ACTIVE_USER_ID_KEY = 'lift.activeUserId.v1';

export interface AuthContextValue {
  /** The signed-in account (no credential fields). */
  currentUser: SafeUser | null;
  /** Directory of accounts on this device — public fields only (no PINs, no body measurements). */
  users: PublicUser[];
  isLoading: boolean;
  login: (username: string, pin?: string) => Promise<SafeUser>;
  logout: () => void;
  /** Switch into another account. Requires that account's PIN. */
  switchUser: (userId: number, pin?: string) => Promise<void>;
  updateBiometrics: (patch: ProfilePatch) => Promise<void>;
  changePin: (currentPin: string | undefined, newPin: string) => Promise<void>;
  registerUser: (data: RegisterInput) => Promise<SafeUser>;
  /** Deletes the signed-in user's own account (PIN required). */
  deleteUser: (userId: number, pin?: string) => Promise<void>;
  // Social Follows
  follows: Follow[];
  followUser: (targetId: number) => Promise<void>;
  unfollowUser: (targetId: number) => Promise<void>;
  isFollowing: (targetId: number) => boolean;
  getFollowersCount: (userId: number) => number;
  getFollowingCount: (userId: number) => number;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const rawUsers = useLiveQuery(() => db.users.toArray(), []);
  const follows = useLiveQuery<Follow[]>(() => db.follows.toArray(), []) ?? [];
  const [activeUserId, setActiveUserId] = useState<number | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Restore the persisted session (if the account still exists). Never auto-creates users.
  useEffect(() => {
    async function init() {
      try {
        await migrateLegacyPins();
        const saved = localStorage.getItem(ACTIVE_USER_ID_KEY) || localStorage.getItem(LEGACY_ACTIVE_USER_ID_KEY);
        localStorage.removeItem(LEGACY_ACTIVE_USER_ID_KEY);
        const found = saved ? await db.users.get(parseInt(saved, 10)) : undefined;
        if (found) {
          setActiveUserId(found.id);
          localStorage.setItem(ACTIVE_USER_ID_KEY, String(found.id));
        } else {
          localStorage.removeItem(ACTIVE_USER_ID_KEY);
        }
      } catch {
        setActiveUserId(null);
      } finally {
        setInitialized(true);
      }
    }
    void init();
  }, []);

  const users = useMemo(() => (rawUsers ?? []).map(toPublicUser), [rawUsers]);

  const currentUser = useMemo(() => {
    if (!activeUserId || !rawUsers) return null;
    const u = rawUsers.find((x) => x.id === activeUserId);
    return u ? toSafeUser(u) : null;
  }, [rawUsers, activeUserId]);

  const startSession = useCallback((id: number) => {
    setActiveUserId(id);
    localStorage.setItem(ACTIVE_USER_ID_KEY, String(id));
  }, []);

  const login = useCallback(
    async (username: string, pin?: string) => {
      const user = await authenticate(username, pin);
      startSession(user.id);
      toast(`Welcome back, ${user.name}!`, 'success');
      return user;
    },
    [startSession],
  );

  const logout = useCallback(() => {
    setActiveUserId(null);
    localStorage.removeItem(ACTIVE_USER_ID_KEY);
    toast('Logged out successfully', 'info');
  }, []);

  const switchUser = useCallback(
    async (userId: number, pin?: string) => {
      const user = await authenticateById(userId, pin);
      startSession(user.id);
      toast(`Signed in as ${user.name}`, 'info');
    },
    [startSession],
  );

  const updateBiometrics = useCallback(
    async (patch: ProfilePatch) => {
      if (!activeUserId) return;
      await updateProfile(activeUserId, patch);
      toast('Profile updated', 'success');
    },
    [activeUserId],
  );

  const changePin = useCallback(
    async (currentPin: string | undefined, newPin: string) => {
      if (!activeUserId) throw new Error('Not signed in.');
      await changePinFn(activeUserId, currentPin, newPin);
      toast('Password / PIN updated', 'success');
    },
    [activeUserId],
  );

  const registerUser = useCallback(
    async (data: RegisterInput) => {
      const user = await registerAccount(data);
      startSession(user.id);
      toast(`Welcome to KoyuncuFit, ${user.name}!`, 'success');
      return user;
    },
    [startSession],
  );

  const deleteUser = useCallback(
    async (userId: number, pin?: string) => {
      if (!activeUserId) throw new Error('Not signed in.');
      await deleteOwnAccount(activeUserId, userId, pin);
      setActiveUserId(null);
      localStorage.removeItem(ACTIVE_USER_ID_KEY);
      toast('Account deleted', 'info');
    },
    [activeUserId],
  );

  const followUser = useCallback(
    async (targetId: number) => {
      if (!activeUserId) return;
      if (await follow(activeUserId, targetId)) toast('Following athlete', 'success');
    },
    [activeUserId],
  );

  const unfollowUser = useCallback(
    async (targetId: number) => {
      if (!activeUserId) return;
      await unfollow(activeUserId, targetId);
      toast('Unfollowed', 'info');
    },
    [activeUserId],
  );

  const isFollowing = useCallback(
    (targetId: number) =>
      !!activeUserId && follows.some((f) => f.followerId === activeUserId && f.followingId === targetId),
    [activeUserId, follows],
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
      isLoading: !initialized || rawUsers === undefined,
      login,
      logout,
      switchUser,
      updateBiometrics,
      changePin,
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
      rawUsers,
      login,
      logout,
      switchUser,
      updateBiometrics,
      changePin,
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

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
