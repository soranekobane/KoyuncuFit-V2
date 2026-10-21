import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { SetType, Workout, WorkoutSet } from '../db';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** UUID that also works on insecure origins (e.g. http://192.168.x.x on iPhone). */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto && window.isSecureContext) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ───────────── Strength math ─────────────

/** Epley: 1RM = w × (1 + reps/30). A single rep is the weight itself. */
export function epley1RM(weight: number, reps: number): number {
  if (!weight || !reps || weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

export const isWorkingSet = (type: SetType) => type !== 'warmup';

export function setVolume(s: Pick<WorkoutSet, 'type' | 'weight' | 'reps'>): number {
  if (!isWorkingSet(s.type)) return 0;
  return (s.weight || 0) * (s.reps || 0);
}

export interface ExerciseBests {
  best1RM: number;
  maxWeight: number;
}

export function bestsFromWorkouts(workouts: Workout[], exerciseId: number): ExerciseBests {
  let best1RM = 0;
  let maxWeight = 0;
  for (const w of workouts) {
    for (const ex of w.exercises) {
      if (ex.exerciseId !== exerciseId) continue;
      for (const s of ex.sets) {
        if (!isWorkingSet(s.type) || !s.reps) continue;
        best1RM = Math.max(best1RM, epley1RM(s.weight, s.reps));
        maxWeight = Math.max(maxWeight, s.weight);
      }
    }
  }
  return { best1RM, maxWeight };
}

// ───────────── Formatting ─────────────

export function fmtNum(n: number, digits = 1): string {
  return Number(n.toFixed(digits)).toLocaleString('en-US', { maximumFractionDigits: digits });
}

export function fmtKg(n: number): string {
  return `${fmtNum(n, 2)} kg`;
}

export function fmtVolume(n: number): string {
  if (n >= 100000) return `${fmtNum(n / 1000, 1)}t`;
  return `${fmtNum(n, 0)} kg`;
}

export function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, '0')).join(':');
}

export function fmtRest(sec: number): string {
  if (sec <= 0) return 'Off';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.max(0, Math.floor(sec))}s`;
}

export function fmtDate(ts: number, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Date(ts).toLocaleDateString('en-US', opts);
}

export function fmtShortDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

export function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function relativeDay(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(d)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff} days ago`;
  return fmtDate(ts, { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

/** Monday 00:00 of the week containing ts. */
export function startOfWeek(ts: number): number {
  const d = new Date(ts);
  const day = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day).getTime();
}

/** Sanitise a numeric text input: digits + one decimal separator (comma → dot). */
export function sanitizeDecimal(v: string): string {
  let s = v.replace(',', '.').replace(/[^0-9.]/g, '');
  const i = s.indexOf('.');
  if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '');
  return s.slice(0, 7);
}

export function sanitizeInt(v: string): string {
  return v.replace(/[^0-9]/g, '').slice(0, 4);
}

export function downloadJSON(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const REST_OPTIONS = [0, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300];

export const MUSCLE_COLORS: Record<string, string> = {
  Chest: '#f472b6',
  Back: '#60a5fa',
  Legs: '#34d399',
  Shoulders: '#fbbf24',
  Biceps: '#a78bfa',
  Triceps: '#fb923c',
  Core: '#22d3ee',
};
