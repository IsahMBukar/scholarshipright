'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useNotifications } from '@/hooks/useNotifications';
import type { Notification } from '@/services/api';

export default function NotificationBell() {
  const { notifications, unreadCount, loading, load, markRead, markAllRead, remove } = useNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => { setOpen(!open); if (!open) load(); }}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
      >
        <span className="material-symbols-outlined text-[22px] text-text-secondary">
          {unreadCount > 0 ? 'notifications_active' : 'notifications'}
        </span>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[min(360px,calc(100vw-2rem))] bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-[15px] font-bold text-text-primary">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-[12px] text-primary font-medium hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <span className="material-symbols-outlined text-4xl text-gray-300 mb-2 block">notifications_none</span>
                <p className="text-[13px] text-text-secondary">No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`flex gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors group ${
                    !n.is_read ? 'bg-primary-light/10' : ''
                  }`}
                >
                  {/* Unread dot */}
                  <div className="pt-1.5 flex-shrink-0">
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${
                        !n.is_read ? 'bg-primary' : 'bg-transparent'
                      }`}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {n.link ? (
                      <Link
                        href={n.link}
                        onClick={() => { markRead(n.id); setOpen(false); }}
                        className="block"
                      >
                        <NotificationContent n={n} />
                      </Link>
                    ) : (
                      <div onClick={() => markRead(n.id)} className="cursor-pointer">
                        <NotificationContent n={n} />
                      </div>
                    )}
                    <p className="text-[11px] text-text-secondary mt-1">{timeAgo(n.created_at)}</p>
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={() => remove(n.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 self-start mt-1 hover:bg-red-50 rounded transition-all"
                  >
                    <span className="material-symbols-outlined text-[16px] text-red-400">close</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationContent({ n }: { n: Notification }) {
  return (
    <>
      <p className={`text-[13px] leading-snug ${!n.is_read ? 'font-semibold text-text-primary' : 'font-medium text-text-secondary'}`}>
        {n.title}
      </p>
      <p className="text-[12px] text-text-secondary mt-0.5 line-clamp-2">{n.message}</p>
    </>
  );
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
