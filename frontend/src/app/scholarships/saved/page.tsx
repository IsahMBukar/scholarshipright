import { redirect } from 'next/navigation';

export default function ScholarshipsSavedPage() {
  redirect('/scholarships?tab=saved');
}
