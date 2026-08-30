'use client';

// Admin Blog Management — list all posts, filter by status, quick actions.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import {
  PenSquare,
  Pencil,
  Eye,
  Archive,
  Search,
  ExternalLink,
  GitCompare,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import DataTable, { type Column } from '@/components/admin/ui/DataTable';
import Badge, { type BadgeTone } from '@/components/admin/ui/Badge';
import Button from '@/components/admin/ui/Button';
import Drawer from '@/components/admin/ui/Drawer';
import { useToast } from '@/components/admin/ui/Toast';
import { adminFetchAllPosts, adminFetchPost, updateBlogPost, validateScholarshipSlugs } from '@/lib/blog/api';
import type { BlogListOut, PaginatedBlogs, BlogPostOut } from '@/lib/blog/types';
import { ScholarshipPicker } from '@/components/blog/ScholarshipPicker';
import { useScholarshipValidation } from '@/lib/blog/useScholarshipValidation';

// ── Helpers ──────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'published':
      return 'positive';
    case 'draft':
      return 'neutral';
    case 'pending_review':
      return 'warning';
    case 'archived':
      return 'negative';
    default:
      return 'neutral';
  }
}

const BLOG_CATEGORIES = ['general', 'guides', 'tips', 'success-stories', 'application-help', 'essay-writing', 'interview-prep', 'funding', 'study-abroad'];
const BLOG_STATUSES = ['draft', 'published', 'pending_review', 'archived'] as const;

// ── Page ─────────────────────────────────────────────────────────

export default function AdminBlogsPage() {
  const queryClient = useQueryClient();
  const { success, error } = useToast();

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery<PaginatedBlogs>({
    queryKey: ['admin-blogs', page, statusFilter, search],
    queryFn: () =>
      adminFetchAllPosts({
        page,
        limit: 20,
        status: statusFilter || undefined,
        search: search || undefined,
      }),
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => updateBlogPost(id, { status: 'published' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-blogs'] });
      success('Post published');
    },
    onError: () => error('Failed to publish post'),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => updateBlogPost(id, { status: 'archived' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-blogs'] });
      success('Post archived');
    },
    onError: () => error('Failed to archive post'),
  });

  // Diff drawer state
  const [diffPostId, setDiffPostId] = useState<string | null>(null);
  const { data: diffPost, isLoading: diffLoading } = useQuery<BlogPostOut>({
    queryKey: ['admin-blog-diff', diffPostId],
    queryFn: () => adminFetchPost(diffPostId!),
    enabled: !!diffPostId,
  });

  const openDiff = useCallback((id: string) => setDiffPostId(id), []);
  const closeDiff = useCallback(() => setDiffPostId(null), []);

  const [editPostId, setEditPostId] = useState<string | null>(null);
  const openEdit = useCallback((id: string) => setEditPostId(id), []);
  const closeEdit = useCallback(() => setEditPostId(null), []);

  const columns: Column<BlogListOut>[] = [
    {
      key: 'title',
      header: 'Title',
      render: (row) => (
        <div className="max-w-[300px]">
          <p className="font-semibold text-text-primary truncate">{row.title}</p>
          <p className="text-[11px] text-text-secondary truncate">
            {row.author_name || 'Anonymous'} · {row.category}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={statusTone(row.status)} className="capitalize">
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'reading_time_minutes',
      header: 'Read Time',
      render: (row) => (
        <span className="text-sm text-text-secondary">
          {row.reading_time_minutes} min
        </span>
      ),
    },
    {
      key: 'view_count',
      header: 'Views',
      render: (row) => (
        <span className="text-sm text-text-secondary">{row.view_count}</span>
      ),
    },
    {
      key: 'published_at',
      header: 'Published',
      render: (row) => (
        <span className="text-sm text-text-secondary">
          {fmtDate(row.published_at)}
        </span>
      ),
    },
    {
      key: 'id',
      header: 'Actions',
      render: (row) => (
        <div className="flex items-center gap-1">
          <Link
            href={`/blog/${row.slug}`}
            target="_blank"
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-primary transition"
            title="View"
          >
            <ExternalLink className="w-4 h-4" />
          </Link>
          <Button size="sm" variant="ghost" onClick={() => openEdit(row.id)} title="Edit">
            <Pencil className="w-4 h-4" />
          </Button>
          {row.status !== 'published' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => publishMutation.mutate(row.id)}
              title={row.status === 'archived' ? 'Restore (publish)' : 'Publish'}
            >
              <Eye className="w-4 h-4" />
            </Button>
          )}
          {row.status === 'pending_review' && row.has_pending_changes && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => openDiff(row.id)}
              title="Review changes"
            >
              <GitCompare className="w-4 h-4" />
            </Button>
          )}
          {row.status !== 'archived' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => archiveMutation.mutate(row.id)}
              title="Archive"
            >
              <Archive className="w-4 h-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const statusOptions = [
    { value: '', label: 'All statuses' },
    { value: 'published', label: 'Published' },
    { value: 'draft', label: 'Draft' },
    { value: 'pending_review', label: 'Pending Review' },
    { value: 'archived', label: 'Archived' },
  ];

  return (
    <AdminLayout title="Blog Management" description="Manage all blog posts — create, publish, archive, or delete.">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
              <PenSquare className="w-6 h-6 text-primary" />
              Blog Management
            </h1>
            <p className="text-sm text-text-secondary mt-1">
              Manage all blog posts — create, publish, archive, or delete.
            </p>
          </div>
          <Link
            href="/blog/write"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-btn text-sm font-semibold bg-primary text-text-primary hover:bg-primary-readable hover:text-white transition"
          >
            <PenSquare className="w-4 h-4" />
            New Post
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search posts..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-4 py-2 rounded-btn border border-gray-200 text-sm bg-white focus:outline-none focus:border-primary transition"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-btn border border-gray-200 text-sm bg-white focus:outline-none focus:border-primary transition"
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Table */}
        <DataTable<BlogListOut>
          columns={columns}
          rows={data?.items ?? []}
          isLoading={isLoading}
          keyExtractor={(row) => row.id}
          rowClassName={(row) =>
            row.status === 'archived' ? 'opacity-60 bg-gray-50' : undefined
          }
        />

        {/* Pagination */}
        {data && data.pages > 1 && (
          <div className="flex items-center justify-between pt-4">
            <p className="text-sm text-text-secondary">
              {data.total} {data.total === 1 ? 'post' : 'posts'} total
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <span className="text-sm text-text-secondary px-2">
                {page} / {data.pages}
              </span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                disabled={page === data.pages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Diff Drawer */}
      <Drawer
        open={!!diffPostId}
        onClose={closeDiff}
        title="Review Changes"
        widthClass="w-[720px]"
      >
        {diffLoading ? (
          <div className="flex items-center gap-2 text-text-secondary text-sm py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-primary-readable" />
            Loading diff…
          </div>
        ) : diffPost ? (
          <div className="space-y-6">
            <div className="text-sm text-text-secondary">
              Post ID: {diffPost.id} · Status: <Badge tone={statusTone(diffPost.status)}>{diffPost.status}</Badge>
            </div>

            {diffPost.pending_changes && (
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-3">Changes (agent → pending_review)</h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3 text-sm max-h-[500px] overflow-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-gray-300">
                        <th className="pb-2 font-medium text-text-secondary">Field</th>
                        <th className="pb-2 font-medium text-text-secondary">Before (agent changed from)</th>
                        <th className="pb-2 font-medium text-text-secondary">After (current on post)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diffPost.pending_changes.changed_fields.map((field: string) => {
                        const oldVal = diffPost.pending_changes!.old?.[field];
                        const newVal = (diffPost as Record<string, unknown>)[field];
                        return (
                          <tr key={field} className="border-b border-gray-200">
                            <td className="py-2 font-medium text-text-primary">{field}</td>
                            <td className="py-2 text-text-secondary font-mono max-w-xs truncate">
                              {oldVal === undefined ? '—' : oldVal === null ? '(none)' : String(oldVal)}
                            </td>
                            <td className="py-2 text-text-primary font-mono max-w-xs truncate">
                              {newVal === undefined ? '—' : newVal === null ? '(none)' : String(newVal)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-text-secondary">
                  Edited via: {diffPost.pending_changes.edited_via || 'unknown'}
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-4 border-t">
              <Button
                variant="secondary"
                leftIcon={<XCircle className="w-3.5 h-3.5" />}
                onClick={() => updateBlogPost(diffPost.id, { status: 'archived' }).then(() => { closeDiff(); queryClient.invalidateQueries({ queryKey: ['admin-blogs'] }); })}>
                Reject (Archive)
              </Button>
              <Button
                leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                onClick={() => updateBlogPost(diffPost.id, { status: 'published' }).then(() => { closeDiff(); queryClient.invalidateQueries({ queryKey: ['admin-blogs'] }); })}>
                Approve (Publish)
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-text-secondary text-sm py-8 text-center">Post not found</div>
        )}
      </Drawer>

      <BlogEditDrawer postId={editPostId} open={!!editPostId} onClose={closeEdit} />
    </AdminLayout>
  );
}

function BlogEditDrawer({ postId, open, onClose }: { postId: string | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { success, error } = useToast();
  const { data: post, isLoading } = useQuery<BlogPostOut>({
    queryKey: ['admin-blog-edit', postId],
    queryFn: () => adminFetchPost(postId!),
    enabled: !!postId && open,
  });
  const [title, setTitle] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [body, setBody] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [category, setCategory] = useState('general');
  const [tags, setTags] = useState<string[]>([]);
  const [status, setStatus] = useState<string>('draft');
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const { slugErrors, setSlugErrors, validating } = useScholarshipValidation(body);

  useEffect(() => {
    if (post) {
      setTitle(post.title || '');
      setExcerpt(post.excerpt || '');
      setBody(post.body || '');
      setCoverImageUrl(post.cover_image_url || '');
      setCategory(post.category || 'general');
      setTags(post.tags || []);
      setStatus(post.status || 'draft');
    }
  }, [post]);

  const handlePickerSelect = useCallback((sch: { slug: string }) => {
    setBody((prev) => (prev ? `${prev}\n\n@[scholarship:${sch.slug}]` : `@[scholarship:${sch.slug}]`));
  }, []);

  const handleTagsAdd = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput('');
  };

  const handleSave = async () => {
    if (!postId) return;
    if (slugErrors && slugErrors.length > 0) {
      error(`Fix invalid slugs: ${slugErrors.map((e) => e.slug).join(', ')}`);
      return;
    }
    if (!title.trim() || title.trim().length < 3) {
      error('Title must be at least 3 characters');
      return;
    }
    if (!body.trim() || body.trim().length < 10) {
      error('Body must be at least 10 characters');
      return;
    }
    setSaving(true);
    try {
      await updateBlogPost(postId, {
        title: title.trim(),
        excerpt: excerpt.trim() || undefined,
        body: body.trim(),
        cover_image_url: coverImageUrl.trim() || undefined,
        category,
        tags,
        status,
      });
      success('Post updated');
      qc.invalidateQueries({ queryKey: ['admin-blogs'] });
      qc.invalidateQueries({ queryKey: ['admin-blog-edit'] });
      qc.invalidateQueries({ queryKey: ['admin-blog-diff'] });
      onClose();
    } catch (e: any) {
      if (e?.code === 'scholarship_tag_invalid' || e?.invalid_slugs) {
        const msg = e.message || 'Invalid scholarship slugs';
        error(msg);
        if (e.invalid_slugs) {
          try {
            const data = await validateScholarshipSlugs(e.invalid_slugs);
            setSlugErrors(data.invalid);
          } catch {}
        }
      } else {
        error(e instanceof Error ? e.message : 'Failed to update post');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={post ? `Edit: ${post.title}` : 'Edit Post'}
      widthClass="w-[760px]"
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving} disabled={!!slugErrors || validating}>
            Save changes
          </Button>
        </div>
      }
    >
      {isLoading ? (
        <div className="flex items-center gap-2 text-text-secondary text-sm py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : !post ? (
        <div className="text-sm text-text-secondary py-8 text-center">Post not found</div>
      ) : (
        <div className="space-y-5">
          <div>
            <label className="text-xs font-semibold text-text-primary">Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary"
              placeholder="Post title"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-text-primary">Excerpt</label>
            <textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={2}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary resize-none"
              placeholder="Brief excerpt shown in list"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-text-primary">Body * (Markdown)</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
              className={`w-full mt-1 px-3 py-2 rounded-lg border text-sm font-mono focus:outline-none focus:ring-1 resize-y ${slugErrors ? 'border-red-300 focus:border-red-400 focus:ring-red-200' : 'border-gray-200 focus:border-primary focus:ring-primary'}`}
              placeholder="Write Markdown. Use @[scholarship:slug] to embed cards."
            />
            {validating && <p className="text-xs text-gray-400 mt-1">Validating scholarships...</p>}
            {slugErrors && (
              <div className="mt-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm">
                <p className="font-semibold text-red-700 mb-1 text-xs">Invalid slugs — save blocked:</p>
                {slugErrors.map((err) => (
                  <div key={err.slug} className="text-red-700 text-xs">
                    <span className="font-mono font-bold">@{err.slug}</span>
                    {err.suggestions.length ? <span> — did you mean: {err.suggestions.map((s) => s.slug).join(', ')}?</span> : <span> — not found</span>}
                  </div>
                ))}
                <p className="text-[11px] text-red-500 mt-1">Only active scholarships can be tagged.</p>
              </div>
            )}
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs font-semibold mb-2">🎓 Tag Scholarships</p>
            <ScholarshipPicker onSelect={handlePickerSelect} selectedSlugs={new Set([...body.matchAll(/@\[scholarship:([a-z0-9\-]+)\]/g)].map((m) => m[1]))} />
            <p className="text-[11px] text-text-secondary mt-2">Picker appends @[scholarship:slug] to body. You can also type it manually — validation will catch typos.</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-text-primary">Cover Image URL</label>
            <input
              value={coverImageUrl}
              onChange={(e) => setCoverImageUrl(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary"
              placeholder="https://…"
            />
            {coverImageUrl && <img src={coverImageUrl} alt="cover preview" className="mt-2 w-full h-32 object-cover rounded border border-gray-200" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-text-primary">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-primary capitalize">
                {BLOG_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.replace(/-/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-text-primary">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-primary capitalize">
                {BLOG_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-text-primary">Tags</label>
            <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
              {tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 border border-gray-200">#{t}<button onClick={() => setTags(tags.filter((x) => x !== t))} className="text-gray-400 hover:text-red-500">×</button></span>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleTagsAdd(); } }} placeholder="Add tag…" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
              <Button size="sm" variant="secondary" onClick={handleTagsAdd}>Add</Button>
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}
