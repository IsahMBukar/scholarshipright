import type { Metadata } from 'next';
import AppTrackingContent from './AppTrackingContent';

export const metadata: Metadata = {
  title: 'Application Tracking — ScholarshipRight',
  description: 'Track every scholarship application from saved to submitted to accepted. Kanban dashboard with deadline reminders and status tracking.',
};

export default function AppTrackingPage() {
  return <AppTrackingContent />;
}
