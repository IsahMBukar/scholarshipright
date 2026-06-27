import type { Metadata } from 'next';
import AiCoachContent from './AiCoachContent';

export const metadata: Metadata = {
  title: 'AI Coach — Scholara — ScholarshipRight',
  description: 'Meet Scholara, your AI scholarship advisor. Drafts essays, compares awards, answers eligibility questions, and preps your documents 24/7.',
};

export default function AiCoachPage() {
  return <AiCoachContent />;
}
