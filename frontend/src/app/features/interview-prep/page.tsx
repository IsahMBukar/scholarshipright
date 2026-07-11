import type { Metadata } from 'next';
import InterviewPrepContent from './InterviewPrepContent';

export const metadata: Metadata = {
  title: 'Interview Prep — ScholarshipRight',
  description: 'AI-powered mock interviews for scholarship applications. Practice with tailored questions, get scored on your answers, and walk in prepared.',
  keywords: ['interview prep', 'interview preparation', 'ai interview prep', 'scholarship interview', 'mock interview ai', 'interview practice'],
};

export default function InterviewPrepPage() {
  return <InterviewPrepContent />;
}
