'use client';

// Bulk import drawer — paste multiple URLs (one per line) to batch-import
// scholarships into the review queue.

import { useState, useCallback } from 'react';
import { Upload, Link2, AlertTriangle, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import Drawer from './ui/Drawer';
import Button from './ui/Button';
import { useToast } from './ui/Toast';
import { adminApi } from '@/lib/admin/api';
import { AdminApiError } from '@/lib/admin/client';
import Badge, { type BadgeTone } from './ui/Badge';

export interface BulkImportDrawerProps {
  open: boolean;
  onClose: () => void;
}

interface ImportResult {
  index: number;
  url?: string;
  name?: string;
  status: string;
  pending_id?: string;
  error?: string;
}

export default function BulkImportDrawer({ open, onClose }: BulkImportDrawerProps) {
  const { success, error } = useToast();
  const [urlText, setUrlText] = useState('');
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [summary, setSummary] = useState<{ total: number; submitted: number; duplicates: number; errors: number } | null>(null);

  const handleImport = useCallback(async () => {
    const urls = urlText
      .split('\n')
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    if (urls.length === 0) return;

    setImporting(true);
    setResults(null);
    setSummary(null);

    try {
      const response = await adminApi.bulkImportUrls(urls);
      setResults(response.results);
      setSummary({
        total: response.total,
        submitted: response.submitted,
        duplicates: response.duplicates,
        errors: response.errors,
      });

      if (response.submitted > 0) {
        success(`${response.submitted} scholarship(s) submitted to review queue`);
      }
    } catch (err) {
      const message = err instanceof AdminApiError ? err.message : 'Import failed';
      error(message);
    } finally {
      setImporting(false);
    }
  }, [urlText, success, error]);

  const handleClose = useCallback(() => {
    if (!importing) {
      setUrlText('');
      setResults(null);
      setSummary(null);
      onClose();
    }
  }, [importing, onClose]);

  const urlCount = urlText.split('\n').filter((u) => u.trim().length > 0).length;

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      title="Bulk Import Scholarships"
      widthClass="w-[640px]"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-text-secondary">
            {urlCount > 0 && `${urlCount} URL${urlCount !== 1 ? 's' : ''} ready`}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={handleClose} disabled={importing}>
              {results ? 'Close' : 'Cancel'}
            </Button>
            {!results && (
              <Button
                onClick={handleImport}
                loading={importing}
                disabled={urlCount === 0}
                leftIcon={importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              >
                Import {urlCount > 0 ? `(${urlCount})` : ''}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Instructions */}
        <div className="bg-primary/5 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-text-primary">Paste URLs</h3>
          </div>
          <p className="text-xs text-text-secondary">
            Enter one scholarship URL per line. Each URL will be analyzed by AI to extract
            scholarship details, then submitted to the review queue for your approval.
          </p>
        </div>

        {/* URL input */}
        {!results && (
          <div>
            <textarea
              className="w-full border border-gray-200 rounded-lg p-3 text-sm font-mono focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
              rows={10}
              placeholder={`https://www.chevening.org/scholarships/\nhttps://www.daad.de/en/study-and-research-in-germany/scholarships/\nhttps://foreign.fulbrightonline.org/`}
              value={urlText}
              onChange={(e) => setUrlText(e.target.value)}
              disabled={importing}
            />
          </div>
        )}

        {/* Loading state */}
        {importing && (
          <div className="flex items-center justify-center gap-3 py-8">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-sm text-text-secondary">
              Extracting scholarship data from {urlCount} URL{urlCount !== 1 ? 's' : ''}...
            </span>
          </div>
        )}

        {/* Summary */}
        {summary && (
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-text-primary">{summary.total}</div>
              <div className="text-xs text-text-secondary">Total</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-green-700">{summary.submitted}</div>
              <div className="text-xs text-green-600">Submitted</div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-yellow-700">{summary.duplicates}</div>
              <div className="text-xs text-yellow-600">Duplicates</div>
            </div>
            <div className="bg-red-50 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-red-700">{summary.errors}</div>
              <div className="text-xs text-red-600">Errors</div>
            </div>
          </div>
        )}

        {/* Results table */}
        {results && results.length > 0 && (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary">#</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary">Name / URL</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.map((r, i) => (
                  <tr key={i} className={r.status === 'error' ? 'bg-red-50' : ''}>
                    <td className="px-3 py-2 text-text-secondary">{r.index + 1}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-text-primary truncate max-w-xs">
                        {r.name || 'Unknown'}
                      </div>
                      {r.url && (
                        <div className="text-xs text-text-secondary truncate max-w-xs">{r.url}</div>
                      )}
                      {r.error && (
                        <div className="text-xs text-red-600 mt-0.5">{r.error}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <ResultBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Hint */}
        {!results && !importing && (
          <p className="text-xs text-text-center text-text-secondary">
            The AI will extract scholarship name, country, funding type, deadline,
            requirements, and more from each URL. All submissions go to the review queue.
          </p>
        )}
      </div>
    </Drawer>
  );
}

function ResultBadge({ status }: { status: string }) {
  const config: Record<string, { tone: BadgeTone; label: string }> = {
    submitted: { tone: 'positive', label: 'Submitted' },
    duplicate: { tone: 'warning', label: 'Duplicate' },
    error: { tone: 'negative', label: 'Error' },
  };
  const { tone, label } = config[status] || { tone: 'neutral', label: status };
  return <Badge tone={tone}>{label}</Badge>;
}
