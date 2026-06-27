import type { Metadata } from 'next';
import TermsContent from './TermsContent';

export const metadata: Metadata = {
  title: 'Terms of Service — ScholarshipRight',
  description: 'The rules governing your use of ScholarshipRight.',
};

export default function TermsPage() {
  return <TermsContent />;
}
