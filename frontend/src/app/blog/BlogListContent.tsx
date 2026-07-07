'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import LandingShell from '@/components/LandingShell';
import { fetchBlogPosts, fetchBlogCategories } from '@/lib/blog/api';
import type { BlogListOut, PaginatedBlogs } from '@/lib/blog/types';

// ── Blog card ────────────────────────────────────────────────────

function BlogCard({ post }: { post: BlogListOut }) {
  const dateStr = post.published_at
    ? new Date(post.published_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group block bg-white rounded-2xl border border-[#f0ebe0] overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-12px_rgba(212,151,46,0.18)] hover:border-[#f5b942]/40"
    >
      {/* Cover image or placeholder */}
      <div className="aspect-[16/9] overflow-hidden bg-[#fdfbf7]">
        {post.cover_image_url ? (
          <img
            src={post.cover_image_url}
            alt={post.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#fdfbf7] to-[#f5e6c8]">
            <div className="text-center">
              <span className="text-4xl">📝</span>
              <p className="text-xs text-[#d4972e]/60 font-semibold mt-1.5">ScholarshipRight</p>
            </div>
          </div>
        )}
      </div>

      <div className="p-5 sm:p-6">
        {/* Category + date */}
        <div className="flex items-center gap-2 mb-3">
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#fdfbf7] text-[#d4972e] border border-[#f0ebe0]">
            {post.category}
          </span>
          {dateStr && (
            <span className="text-[11px] text-gray-400">{dateStr}</span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-base sm:text-lg font-bold text-[#1a1a1a] mb-2 leading-snug group-hover:text-[#d4972e] transition-colors line-clamp-2">
          {post.title}
        </h3>

        {/* Excerpt */}
        {post.excerpt && (
          <p className="text-sm text-gray-600 leading-relaxed line-clamp-2 mb-4">
            {post.excerpt}
          </p>
        )}

        {/* Footer: author + reading time */}
        <div className="flex items-center justify-between pt-3 border-t border-[#f0ebe0]">
          <span className="text-xs text-gray-500 font-medium">
            {post.author_name || 'Anonymous'}
          </span>
          <span className="text-xs text-gray-400">
            {post.reading_time_minutes} min read
          </span>
        </div>
      </div>
    </Link>
  );
}

// ── Category tabs ─────────────────────────────────────────────────

function CategoryTabs({
  categories,
  active,
  onSelect,
}: {
  categories: string[];
  active: string;
  onSelect: (c: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onSelect('')}
        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
          active === ''
            ? 'bg-[#1a1a1a] text-white'
            : 'bg-white text-gray-600 border border-[#f0ebe0] hover:border-[#f5b942]/40 hover:text-[#1a1a1a]'
        }`}
      >
        All
      </button>
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => onSelect(cat)}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all capitalize ${
            active === cat
              ? 'bg-[#1a1a1a] text-white'
              : 'bg-white text-gray-600 border border-[#f0ebe0] hover:border-[#f5b942]/40 hover:text-[#1a1a1a]'
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────

export default function BlogListContent() {
  const [posts, setPosts] = useState<BlogListOut[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBlogCategories().then(setCategories).catch((e) => console.error('[BlogList] Categories:', e));
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchBlogPosts({ page, limit: 12, category: activeCategory || undefined })
      .then((data: PaginatedBlogs) => {
        setPosts(data.items);
        setTotalPages(data.pages);
        setTotal(data.total);
      })
      .catch(() => {
        setPosts([]);
      })
      .finally(() => setLoading(false));
  }, [page, activeCategory]);

  const handleCategoryChange = (cat: string) => {
    setActiveCategory(cat);
    setPage(1);
  };

  return (
    <LandingShell>
      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="pt-28 sm:pt-32 pb-10 px-4">
        <div className="max-w-[1100px] mx-auto text-center">
          <span className="inline-block px-3 py-1 mb-4 text-[11px] font-bold uppercase tracking-widest text-[#d4972e] bg-[#fdfbf7] border border-[#f0ebe0] rounded-full">
            Blog
          </span>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[#1a1a1a] mb-4 leading-tight">
            Scholarship{' '}
            <span className="sr-shimmer">Guides &amp; Stories</span>
          </h1>
          <p className="text-base sm:text-lg text-gray-600 max-w-[560px] mx-auto leading-relaxed">
            Expert tips on applications, essays, interviews, and finding the
            right fully funded scholarship for your goals.
          </p>
        </div>
      </section>

      {/* ── Filters + grid ────────────────────────────────── */}
      <section className="pb-20 px-4">
        <div className="max-w-[1100px] mx-auto">
          {/* Category filter */}
          {categories.length > 0 && (
            <div className="mb-8">
              <CategoryTabs
                categories={categories}
                active={activeCategory}
                onSelect={handleCategoryChange}
              />
            </div>
          )}

          {/* Post count */}
          {!loading && (
            <p className="text-sm text-gray-400 mb-6">
              {total} {total === 1 ? 'article' : 'articles'}
            </p>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl border border-[#f0ebe0] overflow-hidden animate-pulse"
                >
                  <div className="aspect-[16/9] bg-gray-100" />
                  <div className="p-5 space-y-3">
                    <div className="h-4 bg-gray-100 rounded w-1/4" />
                    <div className="h-5 bg-gray-100 rounded w-3/4" />
                    <div className="h-4 bg-gray-100 rounded w-full" />
                    <div className="h-4 bg-gray-100 rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && posts.length === 0 && (
            <div className="text-center py-20">
              <p className="text-6xl mb-4">📝</p>
              <p className="text-lg font-semibold text-gray-600 mb-2">
                No articles yet
              </p>
              <p className="text-sm text-gray-400">
                Check back soon for scholarship guides and tips.
              </p>
            </div>
          )}

          {/* Post grid */}
          {!loading && posts.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {posts.map((post) => (
                <BlogCard key={post.id} post={post} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-10">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 rounded-full text-sm font-medium border border-[#f0ebe0] text-gray-600 hover:border-[#f5b942]/40 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500 px-3">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 rounded-full text-sm font-medium border border-[#f0ebe0] text-gray-600 hover:border-[#f5b942]/40 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </section>
    </LandingShell>
  );
}
