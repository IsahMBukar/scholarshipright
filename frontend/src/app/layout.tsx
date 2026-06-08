import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ScholarshipRight — Find Fully Funded Scholarships',
  description: 'AI-powered scholarship discovery platform. Find fully funded international scholarships matched to your profile.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-gray-100 text-text-primary antialiased">{children}</body>
    </html>
  );
}
