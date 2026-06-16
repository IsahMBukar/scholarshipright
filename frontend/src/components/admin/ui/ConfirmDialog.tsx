'use client';

// Confirmation dialog. Pair with the useConfirm hook.
//
// Usage:
//   const confirm = useConfirm();
//   ...
//   const ok = await confirm({ title: 'Revoke invite?', ... });
//   if (ok) doRevoke();
//
// Why we built our own:
//   - No native dialog APIs work consistently across browsers / iframes / Proot
//   - window.confirm() is blocking, unstyled, and breaks E2E test runners
//   - We need a brand-matching pill button, danger variant, and async support

import { type ReactNode, useState, useCallback, createContext, useContext } from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';
import Button from './Button';

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
}

type Resolver = (ok: boolean) => void;

interface ConfirmContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function useConfirm(): ConfirmContextValue['confirm'] {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx.confirm;
}

interface PendingDialog {
  opts: ConfirmOptions;
  resolve: Resolver;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingDialog | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ opts, resolve });
    });
  }, []);

  const close = useCallback(
    (ok: boolean) => {
      if (!pending) return;
      pending.resolve(ok);
      setPending(null);
    },
    [pending]
  );

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {pending && (
        <Dialog
          opts={pending.opts}
          onConfirm={() => close(true)}
          onCancel={() => close(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

function Dialog({
  opts,
  onConfirm,
  onCancel,
}: {
  opts: ConfirmOptions;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const tone = opts.tone ?? 'primary';
  const Icon = tone === 'danger' ? AlertTriangle : Info;
  const iconWrap = tone === 'danger' ? 'bg-red-50' : 'bg-amber-50';
  const iconColor = tone === 'danger' ? 'text-red-600' : 'text-amber-600';

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onCancel}
      />
      <div className="relative bg-white rounded-card border border-gray-200 shadow-xl w-full max-w-md p-6">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="absolute top-3 right-3 w-8 h-8 rounded-md hover:bg-gray-100 flex items-center justify-center text-text-secondary"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-full ${iconWrap} flex items-center justify-center shrink-0`}>
            <Icon className={`w-5 h-5 ${iconColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="confirm-title" className="text-base font-semibold text-text-primary">
              {opts.title}
            </h2>
            {opts.description && (
              <div className="text-sm text-text-secondary mt-1">
                {opts.description}
              </div>
            )}
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={onCancel}>
                {opts.cancelLabel ?? 'Cancel'}
              </Button>
              <Button
                variant={tone === 'danger' ? 'danger' : 'primary'}
                onClick={onConfirm}
              >
                {opts.confirmLabel ?? 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
