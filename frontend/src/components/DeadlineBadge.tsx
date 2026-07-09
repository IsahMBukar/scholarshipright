import { getDeadlineInfo } from '@/components/scholarship/ScholarshipAtoms';

interface DeadlineBadgeProps {
  deadline: string;
  openDate?: string | null;
}

export default function DeadlineBadge({ deadline, openDate }: DeadlineBadgeProps) {
  const dl = getDeadlineInfo(deadline, openDate);

  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[13px] font-medium border ${dl.color}`}>
      <span className="material-symbols-outlined text-[14px]">{dl.icon}</span>
      {dl.label}
    </span>
  );
}
