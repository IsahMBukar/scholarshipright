'use client';

import { useEffect } from 'react';
import { API_URL } from '@/lib/env';

/**
 * Fires POST /api/blog/{slug}/view once per browser session per post.
 * sessionStorage prevents the same browser from counting multiple views
 * (Redis IP dedup on the backend handles the server-side duplicate too).
 */
export default function BlogViewTracker({ slug }: { slug: string }) {
  useEffect(() => {
    const key = `blog-viewed:${slug}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');

    fetch(`${API_URL}/api/blog/${slug}/view`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {
      // silent — view tracking is fire-and-forget
    });
  }, [slug]);

  return null; // renders nothing
}
