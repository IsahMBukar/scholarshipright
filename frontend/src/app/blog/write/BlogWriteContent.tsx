'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminLayout from '@/components/admin/AdminLayout';
import { createBlogPost, validateScholarshipSlugs } from '@/lib/blog/api';
import { useAuth } from '@/hooks/useAuth';
import type { BlogCreatePayload } from '@/lib/blog/types';
import { ScholarshipPicker, type SchSearchResult } from '@/components/blog/ScholarshipPicker';
import { useScholarshipValidation } from '@/lib/blog/useScholarshipValidation';

// ── Tag chips input ───────────────────────────────────────────────

function TagInput({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [input, setInput] = useState('');

  const addTag = () => {
    const t = input.trim().toLowerCase();
    if (t && !tags.includes(t)) {
      onChange([...tags, t]);
    }
    setInput('');
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#fdfbf7] text-[#d4972e] border border-[#f0ebe0]"
          >
            #{tag}
            <button
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              className="ml-0.5 text-gray-400 hover:text-red-500 transition"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder="Add a tag..."
          className="flex-1 px-3 py-2 rounded-lg border border-[#f0ebe0] bg-white text-sm text-[#1a1a1a] placeholder:text-gray-400 focus:outline-none focus:border-[#f5b942] transition"
        />
        <button
          onClick={addTag}
          className="px-3 py-2 rounded-lg text-sm font-medium bg-[#fdfbf7] text-[#d4972e] border border-[#f0ebe0] hover:bg-[#f5b942]/10 transition"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ── Main editor component ─────────────────────────────────────────

const CATEGORIES = [
  'general',
  'guides',
  'tips',
  'success-stories',
  'application-help',
  'essay-writing',
  'interview-prep',
  'funding',
  'study-abroad',
];

export default function BlogWriteContent() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [title, setTitle] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [body, setBody] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [category, setCategory] = useState('general');
  const [tags, setTags] = useState<string[]>([]);
  const [scholarshipSlugs, setScholarshipSlugs] = useState<string[]>([]);
  const [selectedSchMap, setSelectedSchMap] = useState<
    Map<string, SchSearchResult>
  >(new Map());
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { slugErrors, setSlugErrors, validating } = useScholarshipValidation(body);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=/blog/write');
    }
  }, [user, authLoading, router]);

  const handleScholarshipSelect = (sch: SchSearchResult) => {
    if (!scholarshipSlugs.includes(sch.slug)) {
      setScholarshipSlugs((prev) => [...prev, sch.slug]);
      setSelectedSchMap((prev) => new Map(prev).set(sch.slug, sch));
      // Append tag marker to body
      setBody((prev) =>
        prev ? `${prev}\n\n@[scholarship:${sch.slug}]` : `@[scholarship:${sch.slug}]`,
      );
    }
  };

  const removeScholarshipTag = (slug: string) => {
    setScholarshipSlugs((prev) => prev.filter((s) => s !== slug));
    setSelectedSchMap((prev) => {
      const next = new Map(prev);
      next.delete(slug);
      return next;
    });
    // Remove marker from body
    setBody((prev) => prev.replace(new RegExp(`@\\[scholarship:${slug}\\]\n?\n?`, 'g'), '').trim());
  };

  const handleSave = async (status: 'draft' | 'published') => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (!body.trim()) {
      setError('Body is required');
      return;
    }
    if (slugErrors && slugErrors.length > 0) {
      const bad = slugErrors.map((e) => e.slug).join(', ');
      setError(`Fix invalid scholarship slugs before saving: ${bad}`);
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payload: BlogCreatePayload = {
        title: title.trim(),
        excerpt: excerpt.trim() || undefined,
        body: body.trim(),
        cover_image_url: coverImageUrl.trim() || undefined,
        category,
        tags,
        status,
      };
      const post = await createBlogPost(payload);
      router.push(`/blog/${post.slug}`);
    } catch (e: any) {
      if (e?.suggestions || e?.invalid_slugs) {
        const sug = e.suggestions ? Object.entries(e.suggestions).map(([k, v]: any) => `${k} → ${(v as any[]).map((s) => s.slug).join(', ') || 'no suggestions'}`).join('; ') : '';
        setError(`${e.message}${sug ? ` (${sug})` : ''}`);
        if (e.invalid_slugs) {
          try {
            const data = await validateScholarshipSlugs(e.invalid_slugs);
            setSlugErrors(data.invalid);
          } catch {}
        }
      } else {
        setError(e instanceof Error ? e.message : 'Failed to save post');
      }
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return (
      <AdminLayout title="Write a Post">
        <div className="animate-pulse space-y-4 max-w-[720px] mx-auto p-6">
          <div className="h-8 bg-gray-100 rounded w-1/3" />
          <div className="h-12 bg-gray-100 rounded" />
          <div className="h-64 bg-gray-100 rounded" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Write a Post" description="Share your scholarship knowledge with the community.">
      <div className="pt-28 sm:pt-32 pb-20 px-4">
        <div className="max-w-[900px] mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <Link
                href="/blog"
                className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#d4972e] transition mb-2"
              >
                <span className="material-symbols-outlined text-base">
                  arrow_back
                </span>
                Back to blog
              </Link>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1a1a1a]">
                Write a Post
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPreview(!preview)}
                className="px-4 py-2 rounded-full text-sm font-medium border border-[#f0ebe0] text-gray-600 hover:border-[#f5b942]/40 transition"
              >
                {preview ? 'Edit' : 'Preview'}
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* ── Main editor ──────────────────────────────── */}
            <div className="lg:col-span-2 space-y-6">
              {/* Title */}
              <input
                type="text"
                placeholder="Post title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-2xl sm:text-3xl font-extrabold text-[#1a1a1a] placeholder:text-gray-300 bg-transparent border-0 border-b-2 border-[#f0ebe0] pb-3 focus:outline-none focus:border-[#f5b942] transition"
              />

              {/* Excerpt */}
              <textarea
                placeholder="Brief excerpt (shown in the blog list)..."
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                rows={2}
                className="w-full text-sm text-gray-600 placeholder:text-gray-400 bg-white border border-[#f0ebe0] rounded-xl px-4 py-3 focus:outline-none focus:border-[#f5b942] focus:ring-2 focus:ring-[#f5b942]/20 transition resize-none"
              />

              {/* Body editor / preview */}
              {preview ? (
                <div className="blog-body bg-white border border-[#f0ebe0] rounded-xl p-6 min-h-[300px]">
                  <p className="text-sm text-gray-400 mb-4 italic">
                    Preview — scholarship cards will appear inline when published
                  </p>
                  <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                    {body || 'Nothing written yet...'}
                  </div>
                </div>
              ) : (
                <textarea
                  placeholder="Write your post in Markdown...

## Getting Started

Use **bold**, *italic*, and [links](url).

- Bullet points work too
- Tag scholarships below to embed them

@[scholarship:slug-here] will show as an inline card"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={16}
                  className={`w-full text-sm text-[#1a1a1a] placeholder:text-gray-400 bg-white border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 transition resize-y font-mono leading-relaxed ${slugErrors ? 'border-red-300 focus:border-red-400 focus:ring-red-200' : 'border-[#f0ebe0] focus:border-[#f5b942] focus:ring-[#f5b942]/20'}`}
                />
              )}
              {validating && <p className="text-xs text-gray-400">Validating scholarships...</p>}
              {slugErrors && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm">
                  <p className="font-semibold text-red-700 mb-1">Invalid scholarship slugs — save blocked:</p>
                  {slugErrors.map((err) => (
                    <div key={err.slug} className="text-red-700 text-xs">
                      <span className="font-mono font-bold">@{err.slug}</span>
                      {err.suggestions.length ? (
                        <span> — did you mean: {err.suggestions.map((s) => s.slug).join(', ')}?</span>
                      ) : (
                        <span> — not found (inactive or typo)</span>
                      )}
                    </div>
                  ))}
                  <p className="text-[11px] text-red-500 mt-1">Only active scholarships can be tagged. Use search below to find correct slug.</p>
                </div>
              )}

              {/* Scholarship tags */}
              <div className="bg-white border border-[#f0ebe0] rounded-xl p-5">
                <h3 className="text-sm font-bold text-[#1a1a1a] mb-1">
                  🎓 Tag Scholarships
                </h3>
                <p className="text-xs text-gray-500 mb-3">
                  Search and select scholarships to embed as inline cards in your
                  post.
                </p>

                <ScholarshipPicker
                  onSelect={handleScholarshipSelect}
                  selectedSlugs={new Set(scholarshipSlugs)}
                />

                {/* Selected scholarships */}
                {scholarshipSlugs.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {scholarshipSlugs.map((slug) => {
                      const sch = selectedSchMap.get(slug);
                      return (
                        <div
                          key={slug}
                          className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#fdfbf7] border border-[#f0ebe0]"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[#1a1a1a] truncate">
                              {sch?.name || slug}
                            </p>
                            <p className="text-[10px] text-gray-500">
                              {sch?.host_country} · @{scholarshipSlugs.indexOf(slug) + 1}
                            </p>
                          </div>
                          <button
                            onClick={() => removeScholarshipTag(slug)}
                            className="text-gray-400 hover:text-red-500 transition text-sm"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ── Sidebar ──────────────────────────────────── */}
            <div className="space-y-6">
              {/* Cover image */}
              <div className="bg-white border border-[#f0ebe0] rounded-xl p-5">
                <h3 className="text-sm font-bold text-[#1a1a1a] mb-3">
                  Cover Image
                </h3>
                <input
                  type="url"
                  placeholder="Image URL..."
                  value={coverImageUrl}
                  onChange={(e) => setCoverImageUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#f0ebe0] bg-white text-sm text-[#1a1a1a] placeholder:text-gray-400 focus:outline-none focus:border-[#f5b942] transition"
                />
                {coverImageUrl && (
                  <div className="mt-3 rounded-lg overflow-hidden border border-[#f0ebe0]">
                    <img
                      src={coverImageUrl}
                      alt="Cover preview"
                      className="w-full h-32 object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Category */}
              <div className="bg-white border border-[#f0ebe0] rounded-xl p-5">
                <h3 className="text-sm font-bold text-[#1a1a1a] mb-3">
                  Category
                </h3>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#f0ebe0] bg-white text-sm text-[#1a1a1a] focus:outline-none focus:border-[#f5b942] transition capitalize"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c.replace(/-/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tags */}
              <div className="bg-white border border-[#f0ebe0] rounded-xl p-5">
                <h3 className="text-sm font-bold text-[#1a1a1a] mb-3">Tags</h3>
                <TagInput tags={tags} onChange={setTags} />
              </div>

              {/* Actions */}
              <div className="space-y-3">
                <button
                  onClick={() => handleSave('published')}
                  disabled={saving || !!slugErrors}
                  title={slugErrors ? `Fix invalid slugs: ${slugErrors.map((e) => e.slug).join(', ')}` : undefined}
                  className="w-full py-3 rounded-xl text-sm font-bold text-[#1a1a1a] bg-[#f5b942] hover:bg-[#d4972e] hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Publishing...' : 'Publish'}
                </button>
                <button
                  onClick={() => handleSave('draft')}
                  disabled={saving || !!slugErrors}
                  title={slugErrors ? `Fix invalid slugs: ${slugErrors.map((e) => e.slug).join(', ')}` : undefined}
                  className="w-full py-3 rounded-xl text-sm font-medium text-gray-600 bg-white border border-[#f0ebe0] hover:border-[#f5b942]/40 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save as Draft
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
