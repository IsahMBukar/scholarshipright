import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/env';
import FaqContent from './FaqContent';



export const metadata: Metadata = {
  title: 'FAQ — ScholarshipRight',
  description: 'Frequently asked questions about ScholarshipRight — AI matching, Scholara advisor, pricing, and more.',
  openGraph: {
    title: 'FAQ — ScholarshipRight',
    description: 'Frequently asked questions about ScholarshipRight — AI matching, Scholara advisor, pricing, and more.',
    url: `${SITE_URL}/faq`,
  },
  alternates: {
    canonical: `${SITE_URL}/faq`,
  },
};

// FAQ structured data for Google rich results
const FAQ_DATA = [
  { q: 'What is ScholarshipRight?', a: 'ScholarshipRight is an AI-powered platform that matches students to fully funded international scholarships. Instead of scrolling through hundreds of listings, you build a profile and our engine ranks 100+ awards by how well they fit you — with scores from 0 to 100.' },
  { q: 'Is ScholarshipRight free?', a: 'Yes. Building your profile, seeing your matches, and using Scholara (our AI advisor) are all free. No credit card required to sign up.' },
  { q: 'How does the matching work?', a: "Our engine combines semantic AI (it reads your research interests against each award's criteria) with rule-based filters (degree level, GPA, country, language scores). Every scholarship gets a 0–100 fit score." },
  { q: 'How long does it take to get matched?', a: 'About 30 seconds. Build your profile (4 minutes), and the engine scores every award instantly. You get a ranked list of your top matches with scores, amounts, deadlines, and explanations.' },
  { q: 'What is Scholara?', a: "Scholara is your AI scholarship advisor. It knows your profile, your matches, and every deadline. It can draft motivation letters, compare awards side by side, answer eligibility questions, and prep your documents." },
  { q: 'Can Scholara write my essays?', a: "Yes — Scholara drafts motivation letters, SOPs, and research proposals tailored to each award's actual criteria. But you should always review, personalize, and edit the output." },
  { q: 'Is Scholara available 24/7?', a: 'Yes. Ask anything, any time. Scholara answers instantly.' },
  { q: 'What scholarships do you cover?', a: "We index 100+ fully funded awards across 18+ countries: DAAD (Germany), Chevening (UK), MEXT (Japan), Fulbright (US), GKS (South Korea), Erasmus Mundus (EU), Commonwealth, Rhodes, and more. New awards are added monthly." },
  { q: 'What does "fully funded" mean?', a: "It means the scholarship covers tuition, living expenses, and usually flights and health insurance. Some also provide a monthly stipend." },
  { q: 'Do you cover undergraduate scholarships?', a: "Yes. While most fully funded international scholarships target master's and PhD students, we also index bachelor's-level awards where available." },
  { q: 'Can I apply through ScholarshipRight?', a: 'Currently, ScholarshipRight helps you discover, prepare, and track applications. You submit directly to the scholarship provider.' },
  { q: 'What data do you collect?', a: "We collect your name, email, and academic profile (degree, field, GPA, research interests, target countries). We never sell your data." },
];

export default function FaqPage() {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_DATA.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: a,
      },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <FaqContent />
    </>
  );
}
