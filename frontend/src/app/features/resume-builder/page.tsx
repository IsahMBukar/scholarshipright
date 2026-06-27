import type { Metadata } from 'next';
import ResumeBuilderContent from './ResumeBuilderContent';

export const metadata: Metadata = {
  title: 'AI Resume Builder — ScholarshipRight',
  description: 'Upload your resume, get AI analysis with issue detection, auto-rewrite weak sections, and export a polished PDF. Built for scholarship applications.',
};

export default function ResumeBuilderPage() {
  return <ResumeBuilderContent />;
}
