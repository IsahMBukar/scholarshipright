import { redirect } from 'next/navigation';

export default function ScholarshipsAppliedPage() {
  redirect('/scholarships?tab=applied');
}
