import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CircleCheck, Info, Trophy, X, type LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { useBodyLock, useToasts } from '../lib/hooks';

// ───────────────────────── Presence (mount/unmount with exit animation) ─────────────────────────

function usePresence(open: boolean, ms = 220) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const t = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, ms);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return { mounted, closing };
}

/** Keep the last value while the exit animation runs. */
function useStickyValue<T>(open: boolean, value: T): T {
  const [cached, setCached] = useState<T>(value);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setCached(value);
    }
  }
  return open ? value : cached;
}

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
}

// ───────────────────────── Bottom sheet ─────────────────────────

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  full?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  bodyClassName?: string;
}

export function Sheet({ open, onClose, title, left, right, full, children, footer, bodyClassName }: SheetProps) {
  const { mounted, closing } = usePresence(open);
  const content = useStickyValue(open, children);
  const footerContent = useStickyValue(open, footer);
  useBodyLock(mounted);
  useEscape(open, onClose);
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <div
        className={cn('absolute inset-0 bg-black/60 transition-opacity duration-200', closing ? 'opacity-0' : 'animate-fade-in')}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative flex w-full max-w-md flex-col overflow-hidden rounded-t-[28px] border-t border-white/[0.06] bg-zinc-900 shadow-2xl shadow-black',
          full ? 'h-[94dvh]' : 'max-h-[90dvh]',
          closing ? 'translate-y-full transition-transform duration-200 ease-in' : 'animate-sheet-up',
        )}
      >
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="h-1.5 w-10 rounded-full bg-zinc-700" />
        </div>
        {(title || left || right) && (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 pb-3 pt-1">
            <div className="flex justify-start">{left}</div>
            <div className="truncate text-center text-[17px] font-semibold">{title}</div>
            <div className="flex justify-end">{right}</div>
          </div>
        )}
        <div className={cn('flex-1 overflow-y-auto overscroll-contain', bodyClassName)}>{content}</div>
        {footerContent && <div className="border-t border-white/5 bg-zinc-900 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">{footerContent}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function SheetTextButton({ children, onClick, tone = 'muted', disabled, id }: { children: ReactNode; onClick: () => void; tone?: 'muted' | 'brand'; disabled?: boolean; id?: string }) {
  return (
    <button
      id={id}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-lg px-1 py-1 text-[16px] transition-opacity active:opacity-60 disabled:opacity-30',
        tone === 'brand' ? 'font-semibold text-brand' : 'text-zinc-400',
      )}
    >
      {children}
    </button>
  );
}

// ───────────────────────── Action sheet (iOS style) ─────────────────────────

export interface Action {
  label: string;
  icon?: LucideIcon;
  destructive?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function ActionSheet({ open, onClose, title, actions }: { open: boolean; onClose: () => void; title?: string; actions: Action[] }) {
  const { mounted, closing } = usePresence(open);
  const stickyTitle = useStickyValue(open, title);
  const stickyActions = useStickyValue(open, actions);
  useBodyLock(mounted);
  useEscape(open, onClose);
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center px-2 pb-[max(8px,env(safe-area-inset-bottom))]">
      <div className={cn('absolute inset-0 bg-black/50 transition-opacity duration-200', closing ? 'opacity-0' : 'animate-fade-in')} onClick={onClose} />
      <div className={cn('relative w-full max-w-md space-y-2', closing ? 'translate-y-[120%] transition-transform duration-200 ease-in' : 'animate-sheet-up')}>
        <div className="overflow-hidden rounded-2xl bg-zinc-800/95 backdrop-blur-xl">
          {stickyTitle && <div className="border-b border-white/5 px-4 py-3 text-center text-[13px] font-medium text-zinc-400">{stickyTitle}</div>}
          {stickyActions.map((a, i) => {
            const Icon = a.icon;
            return (
              <button
                key={a.label}
                disabled={a.disabled}
                onClick={() => {
                  onClose();
                  a.onClick();
                }}
                className={cn(
                  'flex w-full items-center justify-center gap-2.5 px-4 py-[15px] text-[17px] transition-colors active:bg-white/10 disabled:opacity-30',
                  i > 0 && 'border-t border-white/5',
                  a.destructive ? 'text-red-500' : 'text-zinc-100',
                )}
              >
                {Icon && <Icon size={19} strokeWidth={2} />}
                {a.label}
              </button>
            );
          })}
        </div>
        <button onClick={onClose} className="w-full rounded-2xl bg-zinc-800/95 py-[15px] text-[17px] font-semibold text-brand backdrop-blur-xl active:bg-zinc-700">
          Cancel
        </button>
      </div>
    </div>,
    document.body,
  );
}

// ───────────────────────── Alert / confirm ─────────────────────────

export interface AlertConfig {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  secondary?: { label: string; onClick: () => void };
}

export function Alert({ config, onClose }: { config: AlertConfig | null; onClose: () => void }) {
  const open = !!config;
  const { mounted, closing } = usePresence(open, 160);
  const stickyConfig = useStickyValue(open, config);
  useBodyLock(mounted);
  useEscape(open, onClose);
  const c = open ? config : stickyConfig;
  if (!mounted || !c) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-10">
      <div className={cn('absolute inset-0 bg-black/60 transition-opacity duration-150', closing ? 'opacity-0' : 'animate-fade-in')} onClick={onClose} />
      <div className={cn('relative w-full max-w-[290px] overflow-hidden rounded-2xl bg-zinc-800/95 text-center backdrop-blur-xl', closing ? 'scale-95 opacity-0 transition-all duration-150' : 'animate-pop')}>
        <div className="px-5 pt-5 pb-4">
          <div className="text-[17px] font-semibold">{c.title}</div>
          {c.message && <div className="mt-1.5 text-[13px] leading-snug text-zinc-400">{c.message}</div>}
        </div>
        <div className="flex flex-col border-t border-white/10">
          <button
            onClick={() => {
              onClose();
              c.onConfirm();
            }}
            className={cn('py-3 text-[17px] font-semibold active:bg-white/10', c.destructive ? 'text-red-500' : 'text-brand')}
          >
            {c.confirmLabel ?? 'OK'}
          </button>
          {c.secondary && (
            <button
              onClick={() => {
                onClose();
                c.secondary?.onClick();
              }}
              className="border-t border-white/10 py-3 text-[17px] text-brand active:bg-white/10"
            >
              {c.secondary.label}
            </button>
          )}
          <button onClick={onClose} className="border-t border-white/10 py-3 text-[17px] text-zinc-300 active:bg-white/10">
            {c.cancelLabel ?? 'Cancel'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ───────────────────────── Toaster ─────────────────────────

export function Toaster() {
  const items = useToasts();
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+10px)]">
      {items.map((t) => {
        const Icon = t.kind === 'success' ? CircleCheck : t.kind === 'error' ? X : t.kind === 'pr' ? Trophy : Info;
        return (
          <div
            key={t.id}
            className={cn(
              'flex max-w-sm animate-slide-up items-center gap-2.5 rounded-full border px-4 py-2.5 text-[14px] font-medium shadow-xl shadow-black/50 backdrop-blur-xl',
              t.kind === 'pr' ? 'border-amber-400/30 bg-amber-500/20 text-amber-200' : 'border-white/10 bg-zinc-800/90 text-zinc-100',
            )}
          >
            <Icon size={17} className={cn(t.kind === 'success' && 'text-emerald-400', t.kind === 'error' && 'text-red-400', t.kind === 'info' && 'text-brand')} />
            {t.message}
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

// ───────────────────────── Small building blocks ─────────────────────────

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 bg-[#09090b]/85 pt-safe backdrop-blur-xl">
      <div className="flex items-end justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          {subtitle && <div className="text-[13px] font-semibold uppercase tracking-wide text-zinc-500">{subtitle}</div>}
          <h1 className="truncate text-[32px] leading-tight font-bold tracking-tight">{title}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2 pb-1">{right}</div>
      </div>
    </header>
  );
}

export function Chip({ active, onClick, children, id }: { active?: boolean; onClick?: () => void; children: ReactNode; id?: string }) {
  return (
    <button
      id={id}
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full border px-3.5 py-1.5 text-[14px] font-medium whitespace-nowrap transition-all active:scale-95',
        active ? 'border-brand bg-brand text-white shadow-[0_0_18px_-4px] shadow-brand' : 'border-white/[0.08] bg-zinc-900 text-zinc-300',
      )}
    >
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, onClick, label, className, id, size = 20 }: { icon: LucideIcon; onClick: () => void; label: string; className?: string; id?: string; size?: number }) {
  return (
    <button
      id={id}
      aria-label={label}
      onClick={onClick}
      className={cn('grid h-9 w-9 place-items-center rounded-full bg-zinc-900 text-zinc-300 transition-all active:scale-90 active:bg-zinc-800', className)}
    >
      <Icon size={size} />
    </button>
  );
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-8 py-14 text-center">
      <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-brand/25 to-indigo-500/10 text-brand ring-1 ring-brand/20">
        <Icon size={28} />
      </div>
      <div className="text-[17px] font-semibold">{title}</div>
      {text && <p className="mt-1.5 max-w-[260px] text-[14px] leading-relaxed text-zinc-500">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function StatTile({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent?: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-zinc-900/80 p-3.5">
      <div className="text-[12px] font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-[22px] font-bold tracking-tight tabular" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[12px] text-zinc-500">{sub}</div>}
    </div>
  );
}

export function PrimaryButton({ children, onClick, className, disabled, id, tone = 'brand' }: { children: ReactNode; onClick: () => void; className?: string; disabled?: boolean; id?: string; tone?: 'brand' | 'neutral' | 'danger' | 'success' }) {
  return (
    <button
      id={id}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-[16px] font-semibold transition-all active:scale-[0.98] disabled:opacity-40',
        tone === 'brand' && 'bg-brand text-white shadow-lg shadow-brand/25 active:bg-brand-600',
        tone === 'neutral' && 'bg-zinc-800 text-zinc-100 active:bg-zinc-700',
        tone === 'danger' && 'bg-red-500/10 text-red-500 active:bg-red-500/20',
        tone === 'success' && 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function MuscleAvatar({ name, muscle, size = 44 }: { name: string; muscle: string; size?: number }) {
  const colors: Record<string, string> = {
    Chest: 'from-pink-500/30 to-pink-500/5 text-pink-300',
    Back: 'from-blue-500/30 to-blue-500/5 text-blue-300',
    Legs: 'from-emerald-500/30 to-emerald-500/5 text-emerald-300',
    Shoulders: 'from-amber-500/30 to-amber-500/5 text-amber-300',
    Biceps: 'from-violet-500/30 to-violet-500/5 text-violet-300',
    Triceps: 'from-orange-500/30 to-orange-500/5 text-orange-300',
    Core: 'from-cyan-500/30 to-cyan-500/5 text-cyan-300',
  };
  const initials = name
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return (
    <div
      className={cn('grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-bold ring-1 ring-white/10', colors[muscle] ?? 'from-zinc-700 to-zinc-800 text-zinc-300')}
      style={{ width: size, height: size, fontSize: size * 0.33 }}
    >
      {initials}
    </div>
  );
}
