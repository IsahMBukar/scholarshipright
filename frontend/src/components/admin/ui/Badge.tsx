// Small badge. Tone variants for status pills.

import clsx from 'clsx';
import { type ReactNode } from 'react';

export type BadgeTone =
  | 'neutral'
  | 'primary'
  | 'positive'
  | 'warning'
  | 'negative'
  | 'info';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-gray-100 text-text-secondary',
  primary: 'bg-primary/10 text-primary',
  positive: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  negative: 'bg-red-50 text-red-700',
  info: 'bg-sky-50 text-sky-700',
};

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

export default function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 h-5 px-2 rounded-full text-[11px] font-medium',
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
