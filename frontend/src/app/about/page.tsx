import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/env';
import AboutContent from './AboutContent';

export const metadata: Metadata = {
  title: 'About — ScholarshipRight',
  description: 'Our mission: make fully funded scholarships accessible to every student, everywhere.',
  openGraph: {
    title: 'About — ScholarshipRight',
    description: 'Our mission: make fully funded scholarships accessible to every student, everywhere.',
    url: `${SITE_URL}/about`,
  },
  alternates: {
    canonical: `${SITE_URL}/about`,
  },
};

export default function AboutPage() {
  return <AboutContent />;
}
