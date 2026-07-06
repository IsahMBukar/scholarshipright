'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import LandingShell from '@/components/LandingShell';
import { fetchBlogPost } from '@/lib/blog/api';
import type { BlogPostOut, ScholarshipTagOut } from '@/lib/blog/types';

// ── Inline scholarship card ───────────────────────────────────────

function ScholarshipInlineCard({ tag }: { tag: ScholarshipTagOut }) {
  const deadlineStr = tag.deadline
    ? new Date(tag.deadline).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  const daysLeft = tag.deadline
    ? Math.ceil(
        (new Date(tag.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      )
    : null;

  return (
    <Link
      href={`/scholarships/${tag.slug}`}
      className="my-6 block bg-white rounded-2xl border border-[#f0ebe0] p-4 sm:p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-8px_rgba(212,151,46,0.15)] hover:border-[#f5b942]/40 group no-underline"
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#fdfbf7] border border-[#f0ebe0] flex items-center justify-center text-lg">
          🎓
        </div>

        <div className="min-w-0 flex-1">
          {/* Name + provider */}
          <h4 className="text-sm font-bold text-[#1a1a1a] group-hover:text-[#d4972e] transition-colors leading-snug">
            {tag.name}
          </h4>
          <p className="text-xs text-gray-500 mt-0.5">
            {tag.provider && <span>{tag.provider} · </span>}
            {tag.host_country}
          </p>

          {/* Tags row */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {tag.funding_type && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                {tag.funding_type}
              </span>
            )}
            {tag.degree_levels.slice(0, 3).map((lvl) => (
              <span
                key={lvl}
                className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#fdfbf7] text-[#d4972e] border border-[#f0ebe0]"
              >
                {lvl}
              </span>
            ))}
            {deadlineStr && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                  daysLeft !== null && daysLeft <= 30
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : 'bg-[#fdfbf7] text-gray-600 border-[#f0ebe0]'
                }`}
              >
                {daysLeft !== null && daysLeft <= 30 ? '⏰' : '📅'}{' '}
                {daysLeft === 0
                  ? 'Deadline today'
                  : daysLeft !== null && daysLeft < 0
                  ? 'Deadline passed'
                  : deadlineStr}
              </span>
            )}
          </div>
        </div>

        {/* Arrow */}
        <div className="flex-shrink-0 text-gray-300 group-hover:text-[#f5b942] transition-colors">
          <span className="material-symbols-outlined text-lg">arrow_forward</span>
        </div>
      </div>
    </Link>
  );
}

// ── Body renderer with scholarship cards ──────────────────────────

function RenderBody({
  htmlBody,
  scholarshipTags,
}: {
  htmlBody: string;
  scholarshipTags: ScholarshipTagOut[];
}) {
  // Build a map of slug → tag for quick lookup
  const tagMap = new Map<string, ScholarshipTagOut>();
  for (const tag of scholarshipTags) {
    tagMap.set(tag.slug, tag);
  }

  // Split htmlBody on @[scholarship:slug] markers and interleave cards
  const parts = htmlBody.split(/(@\[scholarship:[a-z0-9-]+\])/g);

  return (
    <div className="blog-body">
      {parts.map((part, i) => {
        const match = part.match(/^@\[scholarship:([a-z0-9-]+)\]$/);
        if (match) {
          const slug = match[1];
          const tag = tagMap.get(slug);
          if (tag) {
            return <ScholarshipInlineCard key={`sch-${i}`} tag={tag} />;
          }
          // Fallback: render as text if scholarship not found
          return (
            <span key={`sch-${i}`} className="text-[#d4972e] font-semibold">
              [{slug}]
            </span>
          );
        }
        // Regular HTML content
        return (
          <div
            key={`txt-${i}`}
            dangerouslySetInnerHTML={{ __html: part }}
          />
        );
      })}
    </div>
  );
}

// ── Main detail component ─────────────────────────────────────────

export default function BlogDetailContent({ slug }: { slug: string }) {
  const [post, setPost] = useState<BlogPostOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchBlogPost(slug)
      .then(setPost)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <LandingShell>
        <div className="pt-28 sm:pt-32 pb-20 px-4">
          <div className="max-w-[720px] mx-auto animate-pulse space-y-6">
            <div className="h-6 bg-gray-100 rounded w-1/4" />
            <div className="h-10 bg-gray-100 rounded w-3/4" />
            <div className="h-4 bg-gray-100 rounded w-1/2" />
            <div className="aspect-[16/9] bg-gray-100 rounded-2xl" />
            <div className="space-y-3">
              <div className="h-4 bg-gray-100 rounded w-full" />
              <div className="h-4 bg-gray-100 rounded w-5/6" />
              <div className="h-4 bg-gray-100 rounded w-4/6" />
            </div>
          </div>
        </div>
      </LandingShell>
    );
  }

  if (error || !post) {
    return (
      <LandingShell>
        <div className="pt-28 sm:pt-32 pb-20 px-4 text-center">
          <p className="text-6xl mb-4">📄</p>
          <p className="text-lg font-semibold text-gray-600 mb-2">
            Article not found
          </p>
          <p className="text-sm text-gray-400 mb-6">
            {error || 'This post may have been removed or the link is incorrect.'}
          </p>
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#d4972e] hover:text-[#1a1a1a] transition"
          >
            ← Back to blog
          </Link>
        </div>
      </LandingShell>
    );
  }

  const dateStr = post.published_at
    ? new Date(post.published_at).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  return (
    <LandingShell>
      <article className="pt-28 sm:pt-32 pb-20 px-4">
        <div className="max-w-[720px] mx-auto">
          {/* Back link + Category */}
          <div className="flex items-center justify-between mb-8">
            <Link
              href="/blog"
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#d4972e] transition"
            >
              <span className="material-symbols-outlined text-base">arrow_back</span>
              Back to blog
            </Link>
            <span className="px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-[#d4972e] bg-[#fdfbf7] border border-[#f0ebe0] rounded-full">
              {post.category}
            </span>
          </div>

          {/* Title */}
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-[#1a1a1a] mb-4 leading-tight">
            {post.title}
          </h1>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-3 mb-6 text-sm text-gray-500">
            <span className="font-medium text-gray-700">
              {post.author_name || 'Anonymous'}
            </span>
            <span className="w-1 h-1 rounded-full bg-gray-300" />
            {dateStr && <span>{dateStr}</span>}
            <span className="w-1 h-1 rounded-full bg-gray-300" />
            <span>{post.reading_time_minutes} min read</span>
            <span className="w-1 h-1 rounded-full bg-gray-300" />
            <span>{post.view_count} views</span>
          </div>

          {/* Excerpt */}
          {post.excerpt && (
            <p className="text-lg text-gray-600 leading-relaxed mb-8 pb-8 border-b border-[#f0ebe0]">
              {post.excerpt}
            </p>
          )}

          {/* Cover image */}
          {post.cover_image_url && (
            <div className="mb-8 rounded-2xl overflow-hidden border border-[#f0ebe0]">
              <img
                src={post.cover_image_url}
                alt={post.title}
                className="w-full h-auto"
              />
            </div>
          )}

          {/* Body with inline scholarship cards */}
          <RenderBody
            htmlBody={post.html_body}
            scholarshipTags={post.scholarship_tags}
          />

          {/* Tags */}
          {post.tags.length > 0 && (
            <div className="mt-10 pt-6 border-t border-[#f0ebe0]">
              <div className="flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 rounded-full text-xs font-medium bg-[#fdfbf7] text-gray-600 border border-[#f0ebe0]"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </article>

      {/* Blog body styles */}
      <style jsx global>{`
        .blog-body h2 {
          font-size: 1.5rem;
          font-weight: 800;
          color: #1a1a1a;
          margin-top: 2rem;
          margin-bottom: 0.75rem;
          line-height: 1.3;
        }
        .blog-body h3 {
          font-size: 1.25rem;
          font-weight: 700;
          color: #1a1a1a;
          margin-top: 1.5rem;
          margin-bottom: 0.5rem;
          line-height: 1.4;
        }
        .blog-body p {
          font-size: 1rem;
          line-height: 1.8;
          color: #374151;
          margin-bottom: 1rem;
        }
        .blog-body ul,
        .blog-body ol {
          margin-bottom: 1rem;
          padding-left: 1.5rem;
        }
        .blog-body li {
          font-size: 1rem;
          line-height: 1.8;
          color: #374151;
          margin-bottom: 0.25rem;
        }
        .blog-body ul li {
          list-style-type: disc;
        }
        .blog-body ol li {
          list-style-type: decimal;
        }
        .blog-body blockquote {
          border-left: 3px solid #f5b942;
          padding: 0.75rem 1.25rem;
          margin: 1.5rem 0;
          background: #fdfbf7;
          border-radius: 0 0.75rem 0.75rem 0;
          font-style: italic;
          color: #4a4a4a;
        }
        .blog-body code {
          background: #f3f4f6;
          padding: 0.15rem 0.4rem;
          border-radius: 0.25rem;
          font-size: 0.875rem;
          font-family: 'JetBrains Mono', monospace;
        }
        .blog-body pre {
          background: #1a1a1a;
          color: #e5e7eb;
          padding: 1.25rem;
          border-radius: 0.75rem;
          overflow-x: auto;
          margin: 1.5rem 0;
        }
        .blog-body pre code {
          background: transparent;
          padding: 0;
          color: inherit;
        }
        .blog-body a {
          color: #d4972e;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .blog-body a:hover {
          color: #1a1a1a;
        }
        .blog-body img {
          border-radius: 0.75rem;
          border: 1px solid #f0ebe0;
          margin: 1.5rem 0;
        }
        .blog-body hr {
          border: none;
          border-top: 1px solid #f0ebe0;
          margin: 2rem 0;
        }
      `}</style>
    </LandingShell>
  );
}
