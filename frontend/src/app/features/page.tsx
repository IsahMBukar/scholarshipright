import type { Metadata } from 'next';
import FeaturesContent from './FeaturesContent';

export const metadata: Metadata = {
  title: 'Features — ScholarshipRight',
  description: 'AI matching, resume builder, application tracking, AI coaching, and interview prep. Everything you need to win fully funded scholarships.',
};

export default function FeaturesPage() {
  return <FeaturesContent />;
}
