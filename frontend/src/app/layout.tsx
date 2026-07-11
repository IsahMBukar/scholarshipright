import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/env';
import './globals.css';
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';
import { AuthProvider } from '@/hooks/useAuth';
import { SessionExpiryHandler } from '@/components/SessionExpiryHandler';
import AuthModal from '@/components/AuthModal';


const SITE_NAME = 'ScholarshipRight';
const DEFAULT_DESC = 'AI-powered scholarship discovery platform. Find fully funded international scholarships matched to your profile.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'ScholarshipRight — Find Fully Funded Scholarships',
    template: '%s — ScholarshipRight',
  },
  description: DEFAULT_DESC,
  keywords: [
    'scholarships', 'fully funded scholarships', 'international scholarships',
    'study abroad', 'graduate scholarships', 'PhD scholarships', 'master scholarships',
    'scholarship finder', 'AI scholarship matching', 'free education',
    'scholarshipright', 'scholarship ai', 'ai scholarship finder',
    'resume ai builder', 'ai resume builder', 'resume builder',
    'ai coach', 'ai career coach', 'scholarship tracker',
    'application tracker', 'interview prep', 'interview preparation',
    'study abroad advisor', 'funded masters', 'funded phd',
    'bachelor scholarships', 'scholarship search', 'free scholarships',
  ],
  authors: [{ name: 'ScholarshipRight' }],
  creator: 'ScholarshipRight',
  publisher: 'ScholarshipRight',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: 'ScholarshipRight — Find Fully Funded Scholarships',
    description: DEFAULT_DESC,
    images: [
      {
        url: '/og-default.png',
        width: 1200,
        height: 630,
        alt: 'ScholarshipRight — Find Fully Funded Scholarships',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ScholarshipRight — Find Fully Funded Scholarships',
    description: DEFAULT_DESC,
    images: ['/og-default.png'],
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
  alternates: {
    canonical: SITE_URL,
  },
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
      <body className="bg-gray-100 text-text-primary antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:rounded-lg focus:text-sm focus:font-semibold focus:outline-none focus:ring-2 focus:ring-white"
        >
          Skip to content
        </a>
        {/* Organization structured data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: SITE_NAME,
              url: SITE_URL,
              description: DEFAULT_DESC,
              sameAs: [
                'https://x.com/scholarshipright',
                'https://instagram.com/scholarshipright',
                'https://facebook.com/scholarshipright',
                'https://linkedin.com/company/scholarshipright',
                'https://tiktok.com/@scholarshipright',
                'https://youtube.com/@scholarshipright',
              ],
            }),
          }}
        />
        <AuthProvider>
          <SessionExpiryHandler />
          <AuthModal />
          <ConfirmProvider>{children}</ConfirmProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
