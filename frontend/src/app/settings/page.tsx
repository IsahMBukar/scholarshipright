'use client';

import { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import { useLogout } from '@/hooks/useLogout';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { fetchMe, changePassword } from '@/services/api';
import type { MeUser } from '@/services/api';

export default function SettingsPage() {
  const [user, setUser] = useState<MeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const { logout, loggingOut } = useLogout();
  const showConfirm = useConfirm();

  // Password form
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  useEffect(() => {
    fetchMe()
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handlePasswordChange = async () => {
    setPwError('');
    setPwSuccess('');

    if (!currentPw) {
      setPwError('Enter your current password.');
      return;
    }
    if (newPw.length < 8) {
      setPwError('New password must be at least 8 characters.');
      return;
    }
    if (newPw !== confirmPw) {
      setPwError('Passwords do not match.');
      return;
    }
    if (newPw === currentPw) {
      setPwError('New password must be different from current password.');
      return;
    }

    setPwLoading(true);
    try {
      await changePassword(currentPw, newPw);
      setPwSuccess('Password changed successfully.');
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err: any) {
      const data = err?.response?.data;
      if (data?.detail?.user_message) {
        setPwError(data.detail.user_message);
      } else if (typeof data?.detail === 'string') {
        setPwError(data.detail);
      } else {
        setPwError('Failed to change password. Please try again.');
      }
    } finally {
      setPwLoading(false);
    }
  };

  if (loading) {
    return (
      <AppLayout showRightPanel={false}>
        <PageHeader title="SETTINGS" />
        <div className="px-4 md:px-6 py-10 max-w-[640px]">
          <div className="space-y-4 animate-pulse">
            <div className="h-24 bg-gray-200 rounded-2xl" />
            <div className="h-48 bg-gray-200 rounded-2xl" />
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout showRightPanel={false}>
      <PageHeader title="SETTINGS" />

      <div className="px-4 md:px-6 pb-10 max-w-[640px] space-y-5">

        {/* ─── Account Info ─── */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 md:p-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px] text-primary">person</span>
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-text-primary">Account</h2>
              <p className="text-[12px] text-text-secondary">
                Signed in as{' '}
                <span className="font-mono text-text-primary">
                  {user?.email || '—'}
                </span>
              </p>
            </div>
          </div>
        </section>

        {/* ─── Change Password ─── */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 md:p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px] text-amber-700">lock</span>
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-text-primary">Change Password</h2>
              <p className="text-[12px] text-text-secondary">
                Update your password to keep your account secure.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {/* Current password */}
            <div className="relative">
              <label className="block text-[12px] font-semibold text-text-secondary mb-1">
                Current Password
              </label>
              <input
                type={showCurrentPw ? 'text' : 'password'}
                value={currentPw}
                onChange={e => setCurrentPw(e.target.value)}
                placeholder="Enter current password"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-[14px] text-text-primary placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary pr-11"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPw(!showCurrentPw)}
                className="absolute right-3 bottom-2.5 text-text-secondary hover:text-text-primary"
                tabIndex={-1}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {showCurrentPw ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>

            {/* New password */}
            <div className="relative">
              <label className="block text-[12px] font-semibold text-text-secondary mb-1">
                New Password
              </label>
              <input
                type={showNewPw ? 'text' : 'password'}
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-[14px] text-text-primary placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary pr-11"
              />
              <button
                type="button"
                onClick={() => setShowNewPw(!showNewPw)}
                className="absolute right-3 bottom-2.5 text-text-secondary hover:text-text-primary"
                tabIndex={-1}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {showNewPw ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>

            {/* Confirm new password */}
            <div>
              <label className="block text-[12px] font-semibold text-text-secondary mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-[14px] text-text-primary placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>

            {/* Error / Success messages */}
            {pwError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
                <span className="material-symbols-outlined text-[16px] text-red-600 mt-0.5">error</span>
                <p className="text-[13px] text-red-700">{pwError}</p>
              </div>
            )}
            {pwSuccess && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <span className="material-symbols-outlined text-[16px] text-emerald-600 mt-0.5">check_circle</span>
                <p className="text-[13px] text-emerald-700">{pwSuccess}</p>
              </div>
            )}

            <button
              onClick={handlePasswordChange}
              disabled={pwLoading}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white text-[13px] font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {pwLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">save</span>
                  Update Password
                </>
              )}
            </button>
          </div>
        </section>

        {/* ─── Sign Out ─── */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 md:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px] text-red-600">logout</span>
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-text-primary">Sign Out</h2>
              <p className="text-[12px] text-text-secondary">
                Sign out of your ScholarshipRight account on this device.
              </p>
            </div>
          </div>
          <button
            onClick={async () => {
              const ok = await showConfirm({
                title: 'Sign out of ScholarshipRight?',
                description: 'You will be returned to the login page. Any unsaved changes will be lost.',
                confirmLabel: 'Sign out',
                cancelLabel: 'Cancel',
                tone: 'danger',
              });
              if (ok) logout();
            }}
            disabled={loggingOut}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-[13px] font-bold hover:bg-red-100 hover:border-red-300 transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[16px]">logout</span>
            {loggingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </section>
      </div>
    </AppLayout>
  );
}
