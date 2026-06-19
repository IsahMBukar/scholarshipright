// Converts the structured FilterState the FilterPanel holds into
// the flat query-string params the backend /api/scholarships
// endpoint expects. Kept separate from the panel and the page so
// neither has to know about the other's shape.
//
// If the backend grows a new filter param, this is the only place
// to touch.
import type { FilterState } from '@/components/FilterPanel';

export function filtersToApiParams(
  f: FilterState,
  extra: { search?: string; limit?: string; page?: string } = {},
): Record<string, string> {
  const params: Record<string, string> = { limit: extra.limit || '50' };
  if (extra.page) params.page = extra.page;
  if (extra.search) params.search = extra.search;

  if (f.countries.length) params.country = f.countries.join(',');
  if (f.fields.length) params.field = f.fields.join(',');
  if (f.degrees.length) params.degree = f.degrees.join(',');
  if (f.languageTests.length) params.language_test = f.languageTests.join(',');
  if (f.funding) params.funding = f.funding;
  if (f.minStipend) params.min_stipend = String(f.minStipend);

  if (f.noIelts) params.no_ielts = 'true';
  if (f.noFee) params.no_fee = 'true';
  if (f.verifiedOnly) params.verified = 'true';

  if (f.deadlineSoon) {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    params.deadline_before = d.toISOString().split('T')[0];
  }

  return params;
}
