import type { Metadata } from 'next';
import { type ReactNode } from 'react';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function CoachingLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
