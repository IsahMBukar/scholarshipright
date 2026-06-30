interface FundingTagsProps {
  fundingType: string;
  coversTuition?: boolean;
  coversLiving?: boolean;
  coversFlight?: boolean;
  coversHealth?: boolean;
  monthlyStipend?: number;
}

export default function FundingTags({
  fundingType,
  coversTuition,
  coversLiving,
  coversFlight,
  coversHealth,
  monthlyStipend,
}: FundingTagsProps) {
  const tags: Array<{ label: string; color: string }> = [];

  if (fundingType === 'fully_funded') {
    tags.push({ label: 'Fully Funded', color: 'bg-primary-light text-primary' });
  } else if (fundingType === 'partial') {
    tags.push({ label: 'Partial', color: 'bg-yellow-100 text-yellow-700' });
  } else {
    tags.push({ label: 'Stipend Only', color: 'bg-blue-100 text-blue-700' });
  }

  if (coversFlight) tags.push({ label: '✈️ Flight', color: 'bg-tertiary-fixed text-tertiary' });
  if (coversLiving) tags.push({ label: '🏠 Living', color: 'bg-secondary-fixed text-on-secondary-container' });
  if (coversHealth) tags.push({ label: '🏥 Health', color: 'bg-error-container text-error' });
  if (monthlyStipend && monthlyStipend > 0) tags.push({ label: `$${monthlyStipend}/mo`, color: 'bg-primary-fixed text-primary' });

  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span key={tag.label} className={`px-2 py-0.5 ${tag.color} text-caption rounded-full`}>
          {tag.label}
        </span>
      ))}
    </div>
  );
}
