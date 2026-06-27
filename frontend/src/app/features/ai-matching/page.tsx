import type { Metadata } from 'next';
import AiMatchingContent from './AiMatchingContent';

export const metadata: Metadata = {
  title: 'AI Matching Engine — ScholarshipRight',
  description: 'How our AI matching engine scores 100+ scholarships against your profile in 30 seconds. Semantic understanding, not keyword search.',
};

export default function AiMatchingPage() {
  return <AiMatchingContent />;
}
