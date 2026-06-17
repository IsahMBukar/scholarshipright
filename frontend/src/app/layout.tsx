import type { Metadata } from 'next';
import './globals.css';
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';

// Mounted at the root so any page (login, onboarding, profile, admin,
// etc.) can call `useConfirm()` to get a styled confirmation modal
// without each layout having to wire the provider. The dialog is
// rendered at z-[80] so it sits above most page content; pages that
// need it above everything else can pass a higher z-index on their
// own overlays.
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
        <ConfirmProvider>{children}</ConfirmProvider>
      </body>
    </html>
  );
}

export const metadata: Metadata = {
  title: 'ScholarshipRight — Find Fully Funded Scholarships',
  description: 'AI-powered scholarship discovery platform. Find fully funded international scholarships matched to your profile.',
};
