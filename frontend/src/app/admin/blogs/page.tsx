'use client';

// Admin Blog Management — list all posts, filter by status, quick actions.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import {
  PenSquare,
  Eye,
  Archive,
  Trash2,
  Search,
  ExternalLink,
} from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import DataTable, { type Column } from '@/components/admin/ui/DataTable';
import Badge, { type BadgeTone } from '@/components/admin/ui/Badge';
import Button from '@/components/admin/ui/Button';
import { useToast } from '@/components/admin/ui/Toast';
import { adminFetchAllPosts, updateBlogPost, deleteBlogPost } from '@/lib/blog/api';
import type { BlogListOut, PaginatedBlogs } from '@/lib/blog/types';

// ── Helpers ──────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
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

// ── Page ─────────────────────────────────────────────────────────

export default function AdminBlogsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
      toast('Post published');
    },
    onError: () => toast('Failed to publish post'),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => updateBlogPost(id, { status: 'archived' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-blogs'] });
      toast('Post archived');
    },
    onError: () => toast('Failed to archive post'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteBlogPost(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-blogs'] });
      toast('Post deleted');
    },
    onError: () => toast('Failed to delete post'),
  });

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
        <Badge tone={statusTone('published')} className="capitalize">
          {row.published_at ? 'published' : 'draft'}
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
          {!row.published_at && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => publishMutation.mutate(row.id)}
              title="Publish"
            >
              <Eye className="w-4 h-4" />
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => archiveMutation.mutate(row.id)}
            title="Archive"
          >
            <Archive className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (confirm('Delete this post permanently?')) {
                deleteMutation.mutate(row.id);
              }
            }}
            title="Delete"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </Button>
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
        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          loading={isLoading}
          emptyMessage="No blog posts found"
          rowKey={(row) => row.id}
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
                variant="outline"
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
                variant="outline"
                onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                disabled={page === data.pages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
