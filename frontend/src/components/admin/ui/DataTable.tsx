'use client';

// Generic DataTable.
//
// - Server-driven (no in-memory dataset assumption) — `data` is already filtered
//   + paginated by the backend. We expose sort/filter state so the parent can
//   translate it into a new request.
// - Generic over row type T.
// - Sortable column header click cycles: none → asc → desc → none.
// - Per-column text filter (debounced via the parent's onFilterChange).
// - Pagination controls at the bottom (page + page size).
// - Skeleton row state, empty state, error state.
//
// Pitfalls avoided:
//  - We never sort/filter in-memory; we always defer to the server so the
//    table scales to large lists.
//  - Selection is by stable row id (keyExtractor), not array index, so React
//    keys stay correct after re-ordering.

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
  Fragment,
} from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronUp, ChevronsUpDown, Search } from 'lucide-react';
import Button from './Button';
import Badge from './Badge';
import EmptyState from './EmptyState';

export type SortDir = 'asc' | 'desc' | null;

export interface Column<T> {
  key: string;
  header: string;
  // Accessor returns the sortable value (string | number | null).
  accessor?: (row: T) => string | number | null;
  // Optional custom cell renderer. Default: String(value).
  cell?: (row: T) => ReactNode;
  // Alias for cell — some pages use "render" instead.
  render?: (row: T) => ReactNode;
  // Right-align numeric columns.
  align?: 'left' | 'right' | 'center';
  // Disable sorting on this column.
  disableSort?: boolean;
  // Disable filter on this column.
  disableFilter?: boolean;
  // Set a CSS width hint.
  width?: string;
}

export interface DataTableProps<T> {
  rows: T[];
  total?: number;
  page?: number;
  pageSize?: number;
  columns: Column<T>[];
  isLoading?: boolean;
  error?: string | null;
  keyExtractor: (row: T) => string | number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  onSortChange?: (key: string | null, dir: SortDir) => void;
  onFilterChange?: (key: string, value: string) => void;
  // Initial values (e.g. restored from URL).
  initialSortKey?: string | null;
  initialSortDir?: SortDir;
  initialFilters?: Record<string, string>;
  // Row click handler. If absent, rows aren't clickable.
  onRowClick?: (row: T) => void;
  // Optional toolbar shown above the table (e.g. bulk actions).
  toolbar?: (selected: T[]) => ReactNode;
  // Empty state copy.
  emptyMessage?: string;
  // Optional rich empty state (overrides emptyMessage if provided).
  emptyState?: ReactNode;
}

interface SortState {
  key: string | null;
  dir: SortDir;
}

export default function DataTable<T>({
  rows,
  total = 0,
  page = 1,
  pageSize: pageSizeProp,
  columns,
  isLoading,
  error,
  keyExtractor,
  onPageChange,
  onPageSizeChange,
  onSortChange,
  onFilterChange,
  initialSortKey = null,
  initialSortDir = null,
  initialFilters = {},
  onRowClick,
  toolbar,
  emptyMessage = 'No results.',
  emptyState,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState>({
    key: initialSortKey,
    dir: initialSortDir,
  });
  const [filters, setFilters] = useState<Record<string, string>>(initialFilters);
  const [selected, setSelected] = useState<Set<string | number>>(new Set());

  const pageSize = pageSizeProp ?? (rows.length || 10);
  const hasPagination = !!pageSizeProp;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleHeaderClick = useCallback(
    (col: Column<T>) => {
      if (col.disableSort) return;
      let next: SortState;
      if (sort.key !== col.key) next = { key: col.key, dir: 'asc' };
      else if (sort.dir === 'asc') next = { key: col.key, dir: 'desc' };
      else if (sort.dir === 'desc') next = { key: null, dir: null };
      else next = { key: col.key, dir: 'asc' };
      setSort(next);
      onSortChange?.(next.key, next.dir);
    },
    [onSortChange, sort]
  );

  const handleFilterInput = useCallback(
    (key: string, value: string) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
      onFilterChange?.(key, value);
    },
    [onFilterChange]
  );

  const toggleRow = useCallback(
    (id: string | number) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    []
  );

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === rows.length) return new Set();
      return new Set(rows.map((r) => keyExtractor(r)));
    });
  }, [rows, keyExtractor]);

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(keyExtractor(r))),
    [rows, selected, keyExtractor]
  );

  // Keyboard shortcuts: ←/→ for pagination (only when no input is focused)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture when user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowLeft' && hasPagination && page > 1) {
        e.preventDefault();
        onPageChange?.(page - 1);
      } else if (e.key === 'ArrowRight' && hasPagination && page < totalPages) {
        e.preventDefault();
        onPageChange?.(page + 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [page, totalPages, onPageChange, hasPagination]);

  const sortIcon = (col: Column<T>) => {
    if (col.disableSort) return null;
    if (sort.key !== col.key)
      return <ChevronsUpDown className="w-3.5 h-3.5 opacity-30" />;
    if (sort.dir === 'asc') return <ChevronUp className="w-3.5 h-3.5 text-primary" />;
    if (sort.dir === 'desc') return <ChevronDown className="w-3.5 h-3.5 text-primary" />;
    return null;
  };

  return (
    <div className="bg-white rounded-card border border-gray-200 overflow-hidden">
      {/* Toolbar */}
      {toolbar && (
        <div className="flex items-center gap-2 px-4 h-12 border-b border-gray-200 bg-gray-50/50">
          {selectedRows.length > 0 ? (
            <Fragment>
              <Badge tone="primary">{selectedRows.length} selected</Badge>
              {toolbar(selectedRows)}
            </Fragment>
          ) : (
            <span className="text-xs text-text-secondary">
              {total} {total === 1 ? 'result' : 'results'}
            </span>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table
          className="w-full text-sm"
          role="table"
          aria-label={`Data table with ${columns.length} columns`}
          aria-busy={isLoading || undefined}
        >
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="w-10 h-10 px-3">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  className="rounded border-gray-300"
                  checked={rows.length > 0 && selected.size === rows.length}
                  onChange={toggleAll}
                />
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={
                    sort.key === col.key
                      ? sort.dir === 'asc'
                        ? 'ascending'
                        : sort.dir === 'desc'
                        ? 'descending'
                        : 'none'
                      : undefined
                  }
                  style={col.width ? { width: col.width } : undefined}
                  className={clsx(
                    'h-10 px-3 text-xs font-semibold uppercase tracking-wide text-text-secondary',
                    col.align === 'right' && 'text-right',
                    col.align === 'center' && 'text-center',
                    col.align !== 'right' && col.align !== 'center' && 'text-left',
                    !col.disableSort && 'cursor-pointer select-none'
                  )}
                  onClick={() => handleHeaderClick(col)}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {col.header}
                    {sortIcon(col)}
                  </span>
                </th>
              ))}
            </tr>
            {/* Filter row — only shown when onFilterChange is provided */}
            {onFilterChange && (
            <tr className="border-b border-gray-200 bg-white">
              <th />
              {columns.map((col) => {
                if (col.disableFilter) return <th key={col.key} />;
                return (
                  <th key={col.key} className="px-2 py-1.5">
                    <div className="relative">
                      <Search
                        className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary pointer-events-none"
                        aria-hidden="true"
                      />
                      <label className="sr-only" htmlFor={`filter-${col.key}`}>
                        Filter {col.header}
                      </label>
                      <input
                        id={`filter-${col.key}`}
                        type="text"
                        value={filters[col.key] ?? ''}
                        onChange={(e) => handleFilterInput(col.key, e.target.value)}
                        placeholder="Filter"
                        className="w-full h-8 pl-7 pr-2 text-xs bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                      />
                    </div>
                  </th>
                );
              })}
            </tr>
            )}
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: Math.min(pageSize, 8) }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b border-gray-100">
                  {columns.map((col) => (
                    <td key={col.key} className="px-3 py-3">
                      <div className="h-4 w-3/4 rounded bg-gray-100 animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : error ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-12 text-center text-sm text-red-600">
                  {error}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="p-0">
                  {emptyState ?? (
                    <EmptyState title="No results" description={emptyMessage} />
                  )}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const id = keyExtractor(row);
                const checked = selected.has(id);
                return (
                  <tr
                    key={id}
                    className={clsx(
                      'border-b border-gray-100 transition-colors',
                      onRowClick && 'cursor-pointer hover:bg-gray-50',
                      checked && 'bg-primary/5'
                    )}
                    onClick={() => onRowClick?.(row)}
                  >
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label="Select row"
                        className="rounded border-gray-300"
                        checked={checked}
                        onChange={() => toggleRow(id)}
                      />
                    </td>
                    {columns.map((col) => {
                      const value = col.accessor?.(row);
                      return (
                        <td
                          key={col.key}
                          className={clsx(
                            'px-3 py-3 align-middle',
                            col.align === 'right' && 'text-right tabular-nums',
                            col.align === 'center' && 'text-center'
                          )}
                        >
                          {(col.cell || col.render) ? (col.cell || col.render)!(row) : value ?? <span className="text-text-secondary">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination — only shown when pageSize is explicitly set */}
      {hasPagination && (
        <div className="flex items-center justify-between gap-3 px-4 h-12 border-t border-gray-200 bg-gray-50/50">
          <div className="text-xs text-text-secondary">
            {total === 0 ? '0 results' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
            <span className="hidden lg:inline ml-2 text-text-secondary/60">(← → to navigate)</span>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
              className="h-8 px-2 text-xs bg-white border border-gray-200 rounded-md"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => onPageChange?.(page - 1)}
              >
                Prev
              </Button>
              <span className="text-xs text-text-secondary px-2">
                Page {page} / {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => onPageChange?.(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
