'use client';

// Lightweight toast notification system.
// - Stack-based, max 5 visible at once (oldest dropped).
// - Auto-dismiss after `duration` ms (default 4s, errors 6s).
// - 4 tones: success | error | info | warning.
// - Accessible: aria-live=polite, role=alert for errors.
//
// Why roll our own instead of pulling sonner/react-hot-toast:
//   - Zero new deps (we're already at 49+ visx/etc packages).
//   - Total file is ~250 lines and the API surface is small.
//   - Matches brand exactly (gold accent, pill shapes).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import clsx from 'clsx';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  duration: number; // ms; 0 = sticky
}

interface ToastContextValue {
  toast: (t: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => void;
  dismiss: (id: string) => void;
  // Convenience helpers
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const MAX_VISIBLE = 5;

const ICONS: Record<ToastTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const TONE_STYLES: Record<ToastTone, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  error: 'border-red-200 bg-red-50 text-red-900',
  info: 'border-sky-200 bg-sky-50 text-sky-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
};

const ICON_COLORS: Record<ToastTone, string> = {
  success: 'text-emerald-600',
  error: 'text-red-600',
  info: 'text-sky-600',
  warning: 'text-amber-600',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback<ToastContextValue['toast']>(
    (t) => {
      const id = `t${++counter.current}`;
      const duration = t.duration ?? (t.tone === 'error' ? 6000 : 4000);
      const next: Toast = {
        id,
        tone: t.tone,
        title: t.title,
        description: t.description,
        duration,
      };
      setToasts((prev) => {
        const merged = [...prev, next];
        // Cap visible queue. Drop oldest non-sticky.
        if (merged.length > MAX_VISIBLE) {
          const dropped = merged.slice(0, merged.length - MAX_VISIBLE);
          dropped.forEach((d) => {
            const tm = timers.current.get(d.id);
            if (tm) {
              clearTimeout(tm);
              timers.current.delete(d.id);
            }
          });
          return merged.slice(-MAX_VISIBLE);
        }
        return merged;
      });
      if (duration > 0) {
        const tm = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, tm);
      }
    },
    [dismiss]
  );

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timers.current.forEach((tm) => clearTimeout(tm));
      timers.current.clear();
    };
  }, []);

  const value: ToastContextValue = {
    toast,
    dismiss,
    success: (title, description) => toast({ tone: 'success', title, description }),
    error: (title, description) => toast({ tone: 'error', title, description }),
    info: (title, description) => toast({ tone: 'info', title, description }),
    warning: (title, description) => toast({ tone: 'warning', title, description }),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      role="region"
      aria-label="Notifications"
      className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-[360px] max-w-[calc(100vw-2rem)] pointer-events-none"
    >
      {toasts.map((t) => {
        const Icon = ICONS[t.tone];
        return (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            aria-live={t.tone === 'error' ? 'assertive' : 'polite'}
            className={clsx(
              'pointer-events-auto flex items-start gap-2 rounded-card border p-3 shadow-sm',
              'animate-in slide-in-from-right-4 fade-in duration-200',
              TONE_STYLES[t.tone]
            )}
          >
            <Icon className={clsx('w-4 h-4 mt-0.5 shrink-0', ICON_COLORS[t.tone])} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium leading-tight">{t.title}</div>
              {t.description && (
                <div className="text-xs mt-0.5 opacity-80 break-words">
                  {t.description}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label="Dismiss"
              className="opacity-60 hover:opacity-100 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
