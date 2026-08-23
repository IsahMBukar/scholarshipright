'use client';

import { useState, useEffect } from 'react';
import { validateScholarshipSlugs } from '@/lib/blog/api';

export type SlugError = { slug: string; suggestions: { slug: string; name: string; host_country?: string }[] };

export function useScholarshipValidation(body: string) {
  const [slugErrors, setSlugErrors] = useState<SlugError[] | null>(null);
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    const slugs = [...body.matchAll(/@\[scholarship:([a-z0-9\-]+)\]/g)].map((m) => m[1]);
    const unique = [...new Set(slugs)];
    if (unique.length === 0) {
      setSlugErrors(null);
      return;
    }
    const t = setTimeout(async () => {
      setValidating(true);
      try {
        const data = await validateScholarshipSlugs(unique);
        setSlugErrors(data.invalid.length ? data.invalid : null);
      } catch {
        setSlugErrors(null);
      } finally {
        setValidating(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [body]);

  return { slugErrors, setSlugErrors, validating };
}

export function extractScholarshipSlugs(body: string): string[] {
  return [...new Set([...body.matchAll(/@\[scholarship:([a-z0-9\-]+)\]/g)].map((m) => m[1]))];
}
