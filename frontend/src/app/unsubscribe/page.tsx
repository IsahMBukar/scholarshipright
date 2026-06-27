import type { Metadata } from 'next';
import UnsubscribeContent from './UnsubscribeContent';

export const metadata: Metadata = {
  title: 'Unsubscribe — ScholarshipRight',
  description: 'Manage your email preferences for ScholarshipRight.',
  robots: { index: false },
};

export default function UnsubscribePage() {
  return <UnsubscribeContent />;
}
