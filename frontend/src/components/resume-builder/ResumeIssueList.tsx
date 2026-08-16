'use client';

import { useState } from 'react';
import type { ResumeIssue } from '@/services/api';

const SEVERITY_STYLES: Record<
  string,
  { chip: string; iconColor: string; icon: string; label: string }
> = {
  urgent: { chip: 'bg-red-50 text-red-600', iconColor: 'text-red-500', icon: 'error', label: 'Urgent' },
  severe: { chip: 'bg-amber-50 text-amber-700', iconColor: 'text-amber-500', icon: 'warning', label: 'Severe' },
  likely: { chip: 'bg-blue-50 text-blue-600', iconColor: 'text-blue-500', icon: 'info', label: 'Likely' },
};

const SEVERITY_ORDER = ['urgent', 'severe', 'likely'];

interface Props {
  issues: ResumeIssue[];
  /** Whether the detail list starts expanded (header count bar always shows). */
  defaultOpen?: boolean;
}

/**
 * Collapsible resume-issue panel. The header always shows one severity chip
 * per present class (urgent/severe/likely); expanding reveals each issue's
 * message and suggestion.
 */
export default function ResumeIssueList({ issues, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  if (!issues.length) return null;

  const counts = SEVERITY_ORDER.map((sev) => ({
    sev,
    count: issues.filter((i) => i.severity === sev).length,
    styles: SEVERITY_STYLES[sev],
  })).filter((c) => c.count > 0);

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          {counts.map(({ sev, count, styles }) => (
            <span key={sev} className={`px-2 py-0.5 rounded-[6px] text-[11px] font-medium ${styles.chip}`}>
              {count} {styles.label}
            </span>
          ))}
        </div>
        <span
          className={`material-symbols-outlined text-[16px] text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          expand_more
        </span>
      </button>

      {open && (
        <ul className="flex flex-col gap-2 px-3 pb-2.5">
          {issues.map((issue, idx) => {
            const styles = SEVERITY_STYLES[issue.severity] ?? SEVERITY_STYLES.likely;
            return (
              <li key={idx} className="flex items-start gap-2 text-[12px]">
                <span className={`material-symbols-outlined text-[16px] mt-px flex-shrink-0 ${styles.iconColor}`}>
                  {styles.icon}
                </span>
                <div className="min-w-0">
                  <p className="text-text-primary leading-snug">{issue.message}</p>
                  {issue.suggestion && (
                    <p className="text-text-secondary mt-0.5 leading-snug">{issue.suggestion}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}