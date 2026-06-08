'use client';

interface MatchScoreBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

export default function MatchScoreBadge({ score, size = 'md' }: MatchScoreBadgeProps) {
  const color = score >= 80 ? 'bg-green-100 text-green-700 border-green-300'
    : score >= 60 ? 'bg-yellow-100 text-yellow-700 border-yellow-300'
    : 'bg-gray-100 text-gray-600 border-gray-300';

  const sizeClasses = size === 'sm' ? 'w-10 h-10 text-caption'
    : size === 'lg' ? 'w-16 h-16 text-headline-md'
    : 'w-12 h-12 text-label-md';

  return (
    <div className={`${sizeClasses} ${color} rounded-full border-2 flex items-center justify-center font-bold`}>
      {Math.round(score)}%
    </div>
  );
}
