// Stat / KPI card. Big number, label, optional delta / icon.

import { type ReactNode } from 'react';
import clsx from 'clsx';

export interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  delta?: { value: number; label: string }; // % change
  icon?: ReactNode;
  tone?: 'default' | 'positive' | 'warning' | 'negative';
}

const TONE_TEXT: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'text-text-primary',
  positive: 'text-emerald-600',
  warning: 'text-amber-600',
  negative: 'text-red-600',
};

export default function StatCard({ label, value, hint, delta, icon, tone = 'default' }: StatCardProps) {
  return (
    <div className="bg-white rounded-card border border-gray-200 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-medium uppercase tracking-wide text-text-secondary">
          {label}
        </div>
        {icon && <div className="text-text-secondary">{icon}</div>}
      </div>
      <div className={clsx('mt-2 text-3xl font-semibold tabular-nums', TONE_TEXT[tone])}>
        {value}
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-text-secondary">
        {delta && (
          <span
            className={clsx(
              'inline-flex items-center font-medium',
              delta.value >= 0 ? 'text-emerald-600' : 'text-red-600'
            )}
          >
            {delta.value >= 0 ? '+' : ''}
            {delta.value.toFixed(1)}%
          </span>
        )}
        {hint && <span>{hint}</span>}
      </div>
    </div>
  );
}
