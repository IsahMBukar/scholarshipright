import type { Metadata } from 'next';
import ContactContent from './ContactContent';

export const metadata: Metadata = {
  title: 'Contact — ScholarshipRight',
  description: 'Get in touch with the ScholarshipRight team. Questions, feedback, partnerships — we\'d love to hear from you.',
};

export default function ContactPage() {
  return <ContactContent />;
}
