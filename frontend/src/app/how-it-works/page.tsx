import type { Metadata } from 'next';
import HowItWorksContent from './HowItWorksContent';

export const metadata: Metadata = {
  title: 'How It Works',
  description: 'How ScholarshipRight matches you to fully funded scholarships in 30 seconds. AI matching, Scholara advisor, and everything else — explained step by step.',
};

export default function HowItWorksPage() {
  return <HowItWorksContent />;
}
