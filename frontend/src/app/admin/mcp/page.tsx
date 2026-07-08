'use client';

// MCP Admin page — manage API keys and view request logs.
//
// Features:
// - List/create/revoke API keys
// - View request logs (filterable by key, tool, success/failure)
// - Stats: total requests, by tool, by key

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Key,
  Shield,
  Activity,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import Badge from '@/components/admin/ui/Badge';
import Button from '@/components/admin/ui/Button';
import Drawer from '@/components/admin/ui/Drawer';
import { useToast } from '@/components/admin/ui/Toast';
import { adminFetch } from '@/lib/admin/client';
import { useConfirm } from '@/components/ui/ConfirmDialog';

// ── Types ─────────────────────────────────────────────────────────

interface McpKey {
  id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  rate_limit_per_hour: number;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

interface McpLogEntry {
  id: string;
  key_id: string | null;
  key_name: string | null;
  auth_identity: string | null;
  tool_name: string;
  arguments: Record<string, any> | null;
  ip_address: string | null;
  success: boolean;
  error_message: string | null;
  created_at: string;
}

interface McpLogStats {
  total_requests: number;
  successful: number;
  failed: number;
  by_tool: Record<string, number>;
  by_key: Record<string, number>;
}

// ── Main Page ─────────────────────────────────────────────────────

function maskIdentity(identity: string | null): string {
  if (!identity) return '';
  return identity.substring(0, 4) + '*****';
}

export default function McpAdminPage() {
  const queryClient = useQueryClient();
  const { success, error, info } = useToast();
  const confirm = useConfirm();

  const [tab, setTab] = useState<'keys' | 'logs'>('keys');
  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyRateLimit, setNewKeyRateLimit] = useState(50);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  // Fetch keys
  const { data: keys } = useQuery({
    queryKey: ['admin', 'mcp', 'keys'],
    queryFn: () => adminFetch<{ items: McpKey[] }>('/api/admin/mcp/keys'),
  });

  // Fetch logs
  const { data: logs } = useQuery({
    queryKey: ['admin', 'mcp', 'logs'],
    queryFn: () => adminFetch<{ items: McpLogEntry[]; total: number }>(
      '/api/admin/mcp/logs?limit=100'
    ),
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['admin', 'mcp', 'stats'],
    queryFn: () => adminFetch<McpLogStats>('/api/admin/mcp/logs/stats'),
  });

  // Create key mutation
  const createKey = useMutation({
    mutationFn: async () => {
      const resp = await adminFetch<{ id: string; key: string; name: string }>(
        '/api/admin/mcp/keys',
        { method: 'POST', body: { name: newKeyName, rate_limit_per_hour: newKeyRateLimit } }
      );
      return resp;
    },
    onSuccess: (data: { id: string; key: string; name: string }) => {
      setCreatedKey(data.key);
      setShowKey(true);
      queryClient.invalidateQueries({ queryKey: ['admin', 'mcp', 'keys'] });
      success(`API key "${data.name}" created`);
    },
    onError: () => {
      error('Failed to create key');
    },
  });

  // Revoke key mutation
  const revokeKey = useMutation({
    mutationFn: async (id: string) => {
      await adminFetch(`/api/admin/mcp/keys/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'mcp', 'keys'] });
      info('Key revoked');
    },
  });

  const keyItems = keys?.items ?? [];
  const logItems = logs?.items ?? [];

  return (
    <AdminLayout title="MCP Integration">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
              <Shield className="w-6 h-6" />
              MCP Management
            </h1>
            <p className="text-sm text-text-secondary mt-1">
              Manage API keys and monitor MCP agent requests.
            </p>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-2xl font-bold text-text-primary">{stats.total_requests}</div>
              <div className="text-xs text-text-secondary">Total Requests</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-2xl font-bold text-green-600">{stats.successful}</div>
              <div className="text-xs text-text-secondary">Successful</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
              <div className="text-xs text-text-secondary">Failed</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-2xl font-bold text-text-primary">
                {Object.keys(stats.by_tool).length}
              </div>
              <div className="text-xs text-text-secondary">Tools Used</div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          <button
            onClick={() => setTab('keys')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              tab === 'keys' ? 'bg-white shadow text-text-primary' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Key className="w-4 h-4 inline mr-1.5" />
            API Keys
          </button>
          <button
            onClick={() => setTab('logs')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              tab === 'logs' ? 'bg-white shadow text-text-primary' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Activity className="w-4 h-4 inline mr-1.5" />
            Request Logs
          </button>
        </div>

        {/* Keys Tab */}
        {tab === 'keys' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setCreatedKey(null);
                  setNewKeyName('');
                  setCreateOpen(true);
                }}
                leftIcon={<Plus className="w-3.5 h-3.5" />}
              >
                New API Key
              </Button>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-text-secondary">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-text-secondary">Key Prefix</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-text-secondary">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-text-secondary">Rate Limit</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-text-secondary">Last Used</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {keyItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-text-secondary">
                        No API keys created yet
                      </td>
                    </tr>
                  ) : (
                    keyItems.map((key: any) => (
                      <tr key={key.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium">{key.name}</td>
                        <td className="px-4 py-3">
                          <code className="text-xs bg-gray-100 px-2 py-0.5 rounded">{key.key_prefix}...</code>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={key.is_active ? 'positive' : 'negative'}>
                            {key.is_active ? 'Active' : 'Revoked'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm">{key.rate_limit_per_hour}/hr</td>
                        <td className="px-4 py-3 text-sm text-text-secondary">
                          {key.last_used_at ? new Date(key.last_used_at).toLocaleString() : 'Never'}
                        </td>
                        <td className="px-4 py-3">
                          {key.is_active ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                const ok = await confirm({
                                  title: 'Revoke Key',
                                  description: `Revoke "${key.name}"? This will immediately block all agents using this key.`,
                                  confirmLabel: 'Revoke',
                                  tone: 'danger',
                                });
                                if (ok) revokeKey.mutate(key.id);
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Logs Tab */}
        {tab === 'logs' && (
          <div className="space-y-4">
            {/* Tool breakdown */}
            {stats && Object.keys(stats.by_tool).length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {Object.entries(stats.by_tool).map(([tool, count]) => (
                  <Badge key={tool} tone="neutral">
                    {String(tool)}: {String(count)}
                  </Badge>
                ))}
              </div>
            )}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-text-secondary">Time</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-text-secondary">Key</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-text-secondary">Tool</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-text-secondary">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-text-secondary">IP</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-text-secondary">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {logItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-text-secondary">
                        No MCP requests yet
                      </td>
                    </tr>
                  ) : (
                    logItems.map((log: any) => (
                      <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-xs text-text-secondary">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {log.key_name || (log.auth_identity ? maskIdentity(log.auth_identity) : null) || <span className="text-text-secondary">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={log.tool_name === 'add_scholarship' ? 'primary' : 'neutral'}>
                            {log.tool_name}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {log.success ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-500" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono">
                          {log.ip_address || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-red-600 max-w-[200px] truncate">
                          {log.error_message || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create Key Drawer */}
      <Drawer
        open={createOpen}
        onClose={() => {
          if (!createKey.isPending) {
            setCreateOpen(false);
            setCreatedKey(null);
          }
        }}
        title="New MCP API Key"
        widthClass="w-[480px]"
        footer={
          createdKey ? (
            <Button onClick={() => setCreateOpen(false)}>Done</Button>
          ) : (
            <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={createKey.isPending}>
                Cancel
              </Button>
              <Button
                onClick={() => createKey.mutate()}
                loading={createKey.isPending}
                disabled={!newKeyName.trim()}
                leftIcon={<Plus className="w-3.5 h-3.5" />}
              >
                Create Key
              </Button>
            </div>
          )
        }
      >
        {createdKey ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-green-800 mb-2">Key Created!</h3>
              <p className="text-xs text-green-700 mb-3">
                Copy this key now — it will not be shown again.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white border border-green-200 rounded px-3 py-2 text-sm font-mono break-all">
                  {showKey ? createdKey : '••••••••••••••••••••••••••••••••'}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(createdKey);
                    success('Key copied to clipboard');
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>
            <p className="text-xs text-text-secondary">
              Use this key in your MCP agent&apos;s Authorization header:
            </p>
            <code className="block bg-gray-50 rounded p-3 text-xs font-mono">
              Authorization: Bearer ***
            </code>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-text-primary">Key Name</label>
              <p className="text-xs text-text-secondary mb-2">
                A descriptive name for this key (e.g. &quot;Claude Desktop&quot;, &quot;ChatGPT Agent&quot;)
              </p>
              <input
                type="text"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Claude Desktop Agent"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-text-primary">Rate Limit (per hour)</label>
              <p className="text-xs text-text-secondary mb-2">
                Maximum requests this key can make per hour
              </p>
              <input
                type="number"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                value={newKeyRateLimit}
                onChange={(e) => setNewKeyRateLimit(Number(e.target.value))}
                min={1}
                max={1000}
              />
            </div>
          </div>
        )}
      </Drawer>
    </AdminLayout>
  );
}
