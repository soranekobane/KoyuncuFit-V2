import { useEffect, useState, useSyncExternalStore } from 'react';

/** Re-render every `ms` and return the current timestamp. */
export function useNow(ms = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms, enabled]);
  return now;
}

// ───────── Body scroll lock (ref-counted so nested sheets work) ─────────
let lockCount = 0;
export function useBodyLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    lockCount++;
    document.body.style.overflow = 'hidden';
    return () => {
      lockCount--;
      if (lockCount <= 0) {
        lockCount = 0;
        document.body.style.overflow = '';
      }
    };
  }, [active]);
}

// ───────── Toasts ─────────
export interface ToastItem {
  id: number;
  message: string;
  kind: 'info' | 'success' | 'error' | 'pr';
}

let toasts: ToastItem[] = [];
const listeners = new Set<() => void>();
let nextId = 1;

function emit() {
  listeners.forEach((l) => l());
}

export function toast(message: string, kind: ToastItem['kind'] = 'info', duration = 2600) {
  const id = nextId++;
  toasts = [...toasts, { id, message, kind }];
  emit();
  window.setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, duration);
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => toasts,
  );
}
