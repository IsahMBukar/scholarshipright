import type { Metadata } from 'next';
import AboutContent from './AboutContent';

export const metadata: Metadata = {
  title: 'About — ScholarshipRight',
  description: 'Our mission: make fully funded scholarships accessible to every student, everywhere.',
};

export default function AboutPage() {
  return <AboutContent />;
}
