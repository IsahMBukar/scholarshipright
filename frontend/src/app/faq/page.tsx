import type { Metadata } from 'next';
import FaqContent from './FaqContent';

export const metadata: Metadata = {
  title: 'FAQ — ScholarshipRight',
  description: 'Frequently asked questions about ScholarshipRight — AI matching, Scholara advisor, pricing, and more.',
};

export default function FaqPage() {
  return <FaqContent />;
}
