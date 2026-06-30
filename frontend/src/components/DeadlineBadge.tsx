interface DeadlineBadgeProps {
  deadline: string;
}

export default function DeadlineBadge({ deadline }: DeadlineBadgeProps) {
  const deadlineDate = new Date(deadline);
  const now = new Date();
  const diffTime = deadlineDate.getTime() - now.getTime();
  const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  let color = 'bg-gray-100 text-gray-600';
  let label = '';

  if (daysLeft < 0) {
    color = 'bg-gray-200 text-gray-500';
    label = 'Expired';
  } else if (daysLeft <= 7) {
    color = 'bg-red-100 text-red-700';
    label = `${daysLeft}d left`;
  } else if (daysLeft <= 30) {
    color = 'bg-orange-100 text-orange-700';
    label = `${daysLeft}d left`;
  } else {
    color = 'bg-green-100 text-green-700';
    label = `${daysLeft}d left`;
  }

  return (
    <span className={`px-3 py-1 ${color} text-caption rounded-full font-medium`}>
      {label}
    </span>
  );
}
