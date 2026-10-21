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
import { db, toPublicUser, toSafeUser, type Follow, type Id, type PublicUser, type SafeUser } from '../db';
import { toast } from '../lib/hooks';
import {
  changePin as changePinFn,
  migrateLegacyPins,
  type ProfilePatch,
  type RegisterInput,
} from '../lib/auth';
import {
  cloudDeleteOwnAccount,
  cloudFetchPublicUsers,
  cloudFollow,
  cloudPullUserData,
  cloudSignIn,
  cloudSignInById,
  cloudSignUp,
  cloudUnfollow,
  cloudUpdateProfile,
} from '../lib/cloudDb';
import { isSupabaseConfigured } from '../lib/supabase';

const ACTIVE_USER_ID_KEY = 'koyuncu.activeUserId.v1';
const LEGACY_ACTIVE_USER_ID_KEY = 'lift.activeUserId.v1';

export interface AuthContextValue {
  /** The signed-in account (no credential fields). */
  currentUser: SafeUser | null;
  /** Directory of registered athletes — public fields only (no credentials, no body measurements). */
  users: PublicUser[];
  isLoading: boolean;
  isCloudConfigured: boolean;
  login: (username: string, pin?: string) => Promise<SafeUser>;
  logout: () => void;
  /** Switch into another account. Requires that account's PIN. */
  switchUser: (userId: Id, pin?: string) => Promise<void>;
  updateBiometrics: (patch: ProfilePatch) => Promise<void>;
  changePin: (currentPin: string | undefined, newPin: string) => Promise<void>;
  registerUser: (data: RegisterInput) => Promise<SafeUser>;
  /** Deletes the signed-in user's own account (PIN required). */
  deleteUser: (userId: Id, pin?: string) => Promise<void>;
  // Social Follows
  follows: Follow[];
  followUser: (targetId: Id) => Promise<void>;
  unfollowUser: (targetId: Id) => Promise<void>;
  isFollowing: (targetId: Id) => boolean;
  getFollowersCount: (userId: Id) => number;
  getFollowingCount: (userId: Id) => number;
  refreshUsers: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const rawUsers = useLiveQuery(() => db.users.toArray(), []);
  const follows = useLiveQuery<Follow[]>(() => db.follows.toArray(), []) ?? [];
  const [activeUserId, setActiveUserId] = useState<Id | null>(null);
  const [cloudUsers, setCloudUsers] = useState<PublicUser[]>([]);
  const [initialized, setInitialized] = useState(false);

  // Restore the persisted session (if the account still exists).
  useEffect(() => {
    async function init() {
      try {
        await migrateLegacyPins();
        const saved = localStorage.getItem(ACTIVE_USER_ID_KEY) || localStorage.getItem(LEGACY_ACTIVE_USER_ID_KEY);
        localStorage.removeItem(LEGACY_ACTIVE_USER_ID_KEY);
        if (saved) {
          const found =
            (await db.users.get(saved as unknown as any)) ||
            (await db.users.get(parseInt(saved, 10) as unknown as any));

          if (found) {
            setActiveUserId(found.id);
            localStorage.setItem(ACTIVE_USER_ID_KEY, String(found.id));
            void cloudPullUserData(found.id);
          } else {
            localStorage.removeItem(ACTIVE_USER_ID_KEY);
          }
        }

        // Fetch cloud user directory
        const list = await cloudFetchPublicUsers();
        if (list && list.length > 0) {
          setCloudUsers(list);
        }
      } catch (err) {
        console.warn('Auth init warning:', err);
        setActiveUserId(null);
      } finally {
        setInitialized(true);
      }
    }
    void init();
  }, []);

  const refreshUsers = useCallback(async () => {
    try {
      const list = await cloudFetchPublicUsers();
      if (list && list.length > 0) {
        setCloudUsers(list);
      }
    } catch (err) {
      console.warn('refreshUsers warning:', err);
    }
  }, []);

  const users = useMemo(() => {
    const local = (rawUsers ?? []).map(toPublicUser);
    if (!cloudUsers.length) return local;

    // Merge cloud and local uniquely by id
    const map = new Map<string, PublicUser>();
    for (const u of cloudUsers) map.set(String(u.id), u);
    for (const u of local) map.set(String(u.id), u);
    return Array.from(map.values());
  }, [rawUsers, cloudUsers]);

  const currentUser = useMemo(() => {
    if (!activeUserId || !rawUsers) return null;
    const u = rawUsers.find((x) => String(x.id) === String(activeUserId));
    return u ? toSafeUser(u) : null;
  }, [rawUsers, activeUserId]);

  const startSession = useCallback((id: Id) => {
    setActiveUserId(id);
    localStorage.setItem(ACTIVE_USER_ID_KEY, String(id));
  }, []);

  const login = useCallback(
    async (username: string, pin?: string) => {
      const user = await cloudSignIn(username, pin || '');
      startSession(user.id);
      void refreshUsers();
      toast(`Welcome back, ${user.name}!`, 'success');
      return user;
    },
    [startSession, refreshUsers],
  );

  const logout = useCallback(() => {
    setActiveUserId(null);
    localStorage.removeItem(ACTIVE_USER_ID_KEY);
    toast('Logged out successfully', 'info');
  }, []);

  const switchUser = useCallback(
    async (userId: Id, pin?: string) => {
      const user = await cloudSignInById(userId, pin);
      startSession(user.id);
      toast(`Signed in as ${user.name}`, 'info');
    },
    [startSession],
  );

  const updateBiometrics = useCallback(
    async (patch: ProfilePatch) => {
      if (!activeUserId) return;
      await cloudUpdateProfile(activeUserId, patch);
      void refreshUsers();
      toast('Profile updated', 'success');
    },
    [activeUserId, refreshUsers],
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
      const user = await cloudSignUp(data);
      startSession(user.id);
      void refreshUsers();
      toast(`Welcome to KoyuncuFit, ${user.name}!`, 'success');
      return user;
    },
    [startSession, refreshUsers],
  );

  const deleteUser = useCallback(
    async (userId: Id, pin?: string) => {
      if (!activeUserId) throw new Error('Not signed in.');
      await cloudDeleteOwnAccount(activeUserId, userId, pin);
      setActiveUserId(null);
      localStorage.removeItem(ACTIVE_USER_ID_KEY);
      void refreshUsers();
      toast('Account deleted', 'info');
    },
    [activeUserId, refreshUsers],
  );

  const followUser = useCallback(
    async (targetId: Id) => {
      if (!activeUserId) return;
      if (await cloudFollow(activeUserId, targetId)) {
        toast('Following athlete', 'success');
      }
    },
    [activeUserId],
  );

  const unfollowUser = useCallback(
    async (targetId: Id) => {
      if (!activeUserId) return;
      await cloudUnfollow(activeUserId, targetId);
      toast('Unfollowed', 'info');
    },
    [activeUserId],
  );

  const isFollowing = useCallback(
    (targetId: Id) =>
      !!activeUserId &&
      follows.some((f) => String(f.followerId) === String(activeUserId) && String(f.followingId) === String(targetId)),
    [activeUserId, follows],
  );

  const getFollowersCount = useCallback(
    (userId: Id) => follows.filter((f) => String(f.followingId) === String(userId)).length,
    [follows],
  );

  const getFollowingCount = useCallback(
    (userId: Id) => follows.filter((f) => String(f.followerId) === String(userId)).length,
    [follows],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      currentUser,
      users,
      isLoading: !initialized || rawUsers === undefined,
      isCloudConfigured: isSupabaseConfigured(),
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
      refreshUsers,
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
      refreshUsers,
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
