/**
 * KoyuncuFit account logic (device-local).
 *
 * IMPORTANT: All data lives in this browser's IndexedDB. These checks stop one person
 * from using another person's account *through the app UI on a shared device*. They are
 * NOT a server-side security boundary — anyone with devtools on the same device can read
 * IndexedDB. Cross-device accounts and backend-enforced access control require a server.
 */
import { db, toSafeUser, userHasPin, type SafeUser, type User } from '../db';

export const MIN_PIN_LENGTH = 4;
const PBKDF2_ITERATIONS = 100_000;

export interface RegisterInput {
  username: string;
  name: string;
  gender: 'male' | 'female';
  age: number;
  weightKg: number;
  heightCm: number;
  bodyFatPercentage?: number;
  avatarColor?: string;
  pin: string;
}

/** Fields a user may change on their own profile. Credentials are changed via changePin(). */
export type ProfilePatch = Partial<
  Pick<User, 'name' | 'gender' | 'age' | 'weightKg' | 'heightCm' | 'bodyFatPercentage' | 'avatarColor' | 'shareWorkouts' | 'shareRoutines'>
>;

const AVATAR_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444'];

// ───────────────────────── PIN hashing ─────────────────────────

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function hashPin(pin: string, saltB64?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltB64 ? fromB64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return { hash: toB64(bits), salt: toB64(salt) };
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Returns true if `pin` unlocks `user`. Accounts with no PIN (legacy) accept any input. */
export async function verifyPin(user: User, pin: string | undefined): Promise<boolean> {
  if (!userHasPin(user)) return true;
  const input = (pin ?? '').trim();
  if (!input) return false;
  if (user.pinHash && user.pinSalt) {
    const { hash } = await hashPin(input, user.pinSalt);
    return safeEqual(hash, user.pinHash);
  }
  // Legacy plaintext PIN
  return safeEqual(input, (user.pin ?? '').trim());
}

/** Converts any legacy plaintext PINs to salted hashes. Safe to run repeatedly. */
export async function migrateLegacyPins(): Promise<number> {
  const legacy = await db.users.filter((u) => !!u.pin && !u.pinHash).toArray();
  for (const u of legacy) {
    const { hash, salt } = await hashPin(u.pin!.trim());
    // Dexie: assigning undefined removes the property from the stored object.
    await db.users.update(u.id, { pinHash: hash, pinSalt: salt, pin: undefined });
  }
  // Clear any leftover empty-string pins
  const empty = await db.users.filter((u) => u.pin !== undefined && !u.pin.trim()).toArray();
  for (const u of empty) await db.users.update(u.id, { pin: undefined });
  return legacy.length;
}

// ───────────────────────── Accounts ─────────────────────────

async function findByUsername(username: string): Promise<User | undefined> {
  const key = username.trim().toLowerCase();
  if (!key) return undefined;
  return db.users.filter((u) => u.username.toLowerCase() === key).first();
}

export function validatePin(pin: string): string | null {
  const p = pin.trim();
  if (p.length < MIN_PIN_LENGTH) return `Password / PIN must be at least ${MIN_PIN_LENGTH} characters.`;
  if (p.length > 64) return 'Password / PIN is too long.';
  return null;
}

export async function registerAccount(data: RegisterInput): Promise<SafeUser> {
  const username = data.username.trim().toLowerCase();
  if (!username) throw new Error('Username is required.');
  if (!/^[a-z0-9_.]{3,24}$/.test(username)) {
    throw new Error('Username must be 3–24 characters: letters, numbers, _ or .');
  }
  const pinErr = validatePin(data.pin ?? '');
  if (pinErr) throw new Error(pinErr);
  if (await findByUsername(username)) throw new Error(`Username “${data.username}” is already taken.`);

  const { hash, salt } = await hashPin(data.pin.trim());
  const record: Omit<User, 'id'> = {
    username,
    name: data.name.trim() || username,
    gender: data.gender,
    age: Math.max(12, Math.min(100, Math.round(data.age || 0))),
    weightKg: Math.max(30, Math.min(300, data.weightKg || 0)),
    heightCm: Math.max(100, Math.min(250, data.heightCm || 0)),
    bodyFatPercentage:
      data.bodyFatPercentage != null && !Number.isNaN(data.bodyFatPercentage)
        ? Math.max(2, Math.min(70, data.bodyFatPercentage))
        : undefined,
    avatarColor: data.avatarColor || AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    pinHash: hash,
    pinSalt: salt,
    shareWorkouts: true,
    shareRoutines: false,
    createdAt: Date.now(),
  };
  // Clean start: no routines or workouts are created for a new account.
  const id = (await db.users.add(record as User)) as number;
  return toSafeUser({ ...record, id });
}

export async function authenticate(username: string, pin: string | undefined): Promise<SafeUser> {
  if (!username.trim()) throw new Error('Please enter your username.');
  const user = await findByUsername(username);
  // Same message for unknown user / bad PIN avoids account enumeration via the login form.
  if (!user || !(await verifyPin(user, pin))) throw new Error('Incorrect username or Password / PIN.');
  if (user.pin && !user.pinHash) await migrateLegacyPins();
  return toSafeUser(user);
}

/** Authorise switching into `userId` — requires that account's PIN. */
export async function authenticateById(userId: number, pin: string | undefined): Promise<SafeUser> {
  const user = await db.users.get(userId);
  if (!user || !(await verifyPin(user, pin))) throw new Error('Incorrect Password / PIN.');
  return toSafeUser(user);
}

export async function updateProfile(actorId: number, patch: ProfilePatch): Promise<void> {
  const allowed: ProfilePatch = {};
  const keys: (keyof ProfilePatch)[] = [
    'name', 'gender', 'age', 'weightKg', 'heightCm', 'bodyFatPercentage', 'avatarColor', 'shareWorkouts', 'shareRoutines',
  ];
  for (const k of keys) if (k in patch) (allowed as Record<string, unknown>)[k] = patch[k];
  await db.users.update(actorId, allowed);
}

export async function changePin(actorId: number, currentPin: string | undefined, newPin: string): Promise<void> {
  const user = await db.users.get(actorId);
  if (!user) throw new Error('Account not found.');
  if (!(await verifyPin(user, currentPin))) throw new Error('Current Password / PIN is incorrect.');
  const err = validatePin(newPin);
  if (err) throw new Error(err);
  const { hash, salt } = await hashPin(newPin.trim());
  await db.users.update(actorId, { pinHash: hash, pinSalt: salt, pin: undefined });
}

/** Users may only delete their OWN account, and must confirm with their PIN. */
export async function deleteOwnAccount(actorId: number, targetId: number, pin: string | undefined): Promise<void> {
  if (actorId !== targetId) throw new Error('You can only delete your own account.');
  const user = await db.users.get(targetId);
  if (!user) return;
  if (!(await verifyPin(user, pin))) throw new Error('Incorrect Password / PIN.');
  await db.transaction('rw', db.users, db.routines, db.workouts, db.follows, async () => {
    await db.routines.where('userId').equals(targetId).delete();
    await db.workouts.where('userId').equals(targetId).delete();
    await db.follows.where('followerId').equals(targetId).delete();
    await db.follows.where('followingId').equals(targetId).delete();
    await db.users.delete(targetId);
  });
}
