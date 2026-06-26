import type { Metadata } from 'next';
import './globals.css';
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';
import { AuthProvider } from '@/hooks/useAuth';
import { SessionExpiryHandler } from '@/components/SessionExpiryHandler';
import AuthModal from '@/components/AuthModal';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-gray-100 text-text-primary antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:rounded-lg focus:text-sm focus:font-semibold focus:outline-none focus:ring-2 focus:ring-white"
        >
          Skip to content
        </a>
        <AuthProvider>
          <SessionExpiryHandler />
          <AuthModal />
          <ConfirmProvider>{children}</ConfirmProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

export const metadata: Metadata = {
  title: 'ScholarshipRight — Find Fully Funded Scholarships',
  description: 'AI-powered scholarship discovery platform. Find fully funded international scholarships matched to your profile.',
};
