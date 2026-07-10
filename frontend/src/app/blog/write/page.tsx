import type { Metadata } from 'next';
import BlogWriteContent from './BlogWriteContent';

export const metadata: Metadata = {
  title: 'Write a Post — ScholarshipRight',
  description: 'Share your scholarship knowledge with the community.',
  robots: { index: false, follow: false },
};

export default function BlogWritePage() {
  return <BlogWriteContent />;
}
