import type { Metadata } from 'next';
import AiMatchingContent from './AiMatchingContent';

export const metadata: Metadata = {
  title: 'AI Matching Engine — ScholarshipRight',
  description: 'How our AI matching engine scores 100+ scholarships against your profile in 30 seconds. Semantic understanding, not keyword search.',
  keywords: ['ai scholarship matching', 'scholarship matching engine', 'ai scholarship finder', 'scholarship matching', 'scholarship score', 'scholarship fit score'],
};

export default function AiMatchingPage() {
  return <AiMatchingContent />;
}
