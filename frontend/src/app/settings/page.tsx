'use client';

import { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import { useLogout } from '@/hooks/useLogout';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { fetchMe, changePassword, fetchPreferences, updatePreferences } from '@/services/api';
import type { MeUser, NotificationPreferences } from '@/services/api';
import PasswordField from '@/components/auth/PasswordField';
import Button from '@/components/admin/ui/Button';

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

  // Notification preferences
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState(false);
  const [prefsError, setPrefsError] = useState<string | null>(null);

  useEffect(() => {
    fetchMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
    fetchPreferences()
      .then(setPrefs)
      .catch(() => {})
      .finally(() => setPrefsLoading(false));
  }, []);

  const hasPassword = user?.has_password ?? true; // default to true (safer)

  const handlePasswordChange = async () => {
    setPwError('');
    setPwSuccess('');

    if (hasPassword && !currentPw) {
      setPwError('Enter your current password.');
      return;
    }
    if (newPw.length < 8) {
      setPwError('Password must be at least 8 characters.');
      return;
    }
    if (newPw !== confirmPw) {
      setPwError('Passwords do not match.');
      return;
    }
    if (hasPassword && newPw === currentPw) {
      setPwError('New password must be different from current password.');
      return;
    }

    setPwLoading(true);
    try {
      await changePassword(newPw, hasPassword ? currentPw : undefined);
      setPwSuccess(hasPassword ? 'Password changed successfully.' : 'Password set successfully.');
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err) {
      const error = err as { response?: { data?: { detail?: { user_message?: string } | string } } };
      const data = error?.response?.data;
      if (data?.detail && typeof data.detail === 'object' && 'user_message' in data.detail) {
        setPwError(data.detail.user_message || 'Unknown error');
      } else if (typeof data?.detail === 'string') {
        setPwError(data.detail);
      } else {
        setPwError('Failed to update password. Please try again.');
      }
    } finally {
      setPwLoading(false);
    }
  };

  const handlePrefToggle = async (key: keyof NotificationPreferences) => {
    if (!prefs) return;
    const newValue = !prefs[key];
    setPrefs({ ...prefs, [key]: newValue });
    setPrefsSaved(false);
    setPrefsError(null);
    setPrefsSaving(true);
    try {
      await updatePreferences({ [key]: newValue });
      setPrefsSaved(true);
      setTimeout(() => setPrefsSaved(false), 2000);
    } catch {
      // Revert on error
      setPrefs({ ...prefs, [key]: !newValue });
      setPrefsError('Failed to save preference. Please try again.');
    } finally {
      setPrefsSaving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout showRightPanel={false}>
        <PageHeader title="SETTINGS" />
        <div className="px-4 md:px-6 py-10 max-w-[760px] mx-auto">
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

      <div className="px-4 md:px-6 pb-10 max-w-[760px] mx-auto space-y-5">

        {/* ─── Account Info ─── */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 md:p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[20px] text-primary">person</span>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-[15px] font-bold text-text-primary">Account</h2>
              <p className="text-[12px] text-text-secondary">
                Signed in as{' '}
                <span className="font-mono text-text-primary break-all">
                  {user?.email || 'Unable to load account info'}
                </span>
              </p>
            </div>
          </div>
        </section>

        {/* ─── Set / Change Password ─── */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 md:p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[20px] text-amber-700">lock</span>
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-text-primary">
                {hasPassword ? 'Change Password' : 'Set Password'}
              </h2>
              <p className="text-[12px] text-text-secondary">
                {hasPassword
                  ? 'Update your password to keep your account secure.'
                  : 'You signed in with Google. Set a password to also login with email.'}
              </p>
            </div>
          </div>

          <div className="grid gap-3">
            {/* Current password — only shown if user already has one */}
            {hasPassword && (
              <PasswordField
                id="current-password"
                label="Current Password"
                value={currentPw}
                onChange={setCurrentPw}
                placeholder="Enter current password"
                autoComplete="current-password"
                disabled={pwLoading}
              />
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              <PasswordField
                id="new-password"
                label={hasPassword ? 'New Password' : 'Password'}
                value={newPw}
                onChange={setNewPw}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                disabled={pwLoading}
                showStrength
              />

              <PasswordField
                id="confirm-password"
                label="Confirm Password"
                value={confirmPw}
                onChange={setConfirmPw}
                placeholder="Re-enter password"
                autoComplete="new-password"
                disabled={pwLoading}
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

            <div className="pt-1">
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={handlePasswordChange}
                disabled={pwLoading}
                loading={pwLoading}
                leftIcon={!pwLoading ? <span className="material-symbols-outlined text-[16px]">save</span> : undefined}
              >
                {pwLoading ? 'Saving…' : (hasPassword ? 'Update Password' : 'Set Password')}
              </Button>
            </div>
          </div>
        </section>

        {/* ─── Notification Preferences ─── */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 md:p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[20px] text-blue-600">notifications</span>
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-text-primary">Email Preferences</h2>
              <p className="text-[12px] text-text-secondary">
                Choose which emails you want to receive. Auth emails are always sent.
              </p>
            </div>
          </div>

          {prefsLoading ? (
            <div className="space-y-3 animate-pulse">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 bg-gray-100 rounded-lg" />
              ))}
            </div>
          ) : prefs ? (
            <div className="divide-y divide-gray-100">
              {[
                { key: 'email_new_matches' as const, icon: '🎯', label: 'New match alerts', desc: 'When a new scholarship scores 70%+ against your profile' },
                { key: 'email_match_improvements' as const, icon: '📈', label: 'Match improvements', desc: 'When an existing match score increases significantly' },
                { key: 'email_deadline_reminders' as const, icon: '🔔', label: 'Deadline reminders', desc: '14-day, 7-day, and 2-day reminders for saved scholarships' },
                { key: 'email_weekly_digest' as const, icon: '📬', label: 'Weekly digest', desc: 'Your top 5 matches summary, every Sunday at 9 AM' },
                { key: 'email_marketing' as const, icon: '✨', label: 'Product updates', desc: 'New features, tips, and scholarship discovery guides' },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => handlePrefToggle(item.key)}
                  role="switch"
                  aria-checked={prefs[item.key]}
                  aria-label={`${item.label}: ${prefs[item.key] ? 'on' : 'off'}`}
                  className="w-full flex items-center gap-4 py-3.5 first:pt-0 last:pb-0 hover:bg-gray-50 -mx-1 px-1 rounded-lg transition-colors text-left"
                >
                  <span className="text-lg flex-shrink-0 w-8 text-center">{item.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-text-primary">{item.label}</p>
                    <p className="text-[11px] text-text-secondary mt-0.5">{item.desc}</p>
                  </div>
                  <div className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${prefs[item.key] ? 'bg-primary' : 'bg-gray-300'}`}>
                    <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${prefs[item.key] ? 'left-[18px]' : 'left-0.5'}`} />
                  </div>
                </button>
              ))}

              {prefsError && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200 mt-3">
                  <span className="material-symbols-outlined text-[14px] text-red-500">error</span>
                  <p className="flex-1 text-[12px] text-red-700">{prefsError}</p>
                  <button onClick={() => setPrefsError(null)} className="text-red-400 hover:text-red-600">
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
              )}
              {prefsSaved && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 mt-3">
                  <span className="material-symbols-outlined text-[14px] text-emerald-600">check_circle</span>
                  <p className="text-[12px] text-emerald-700">Preferences saved</p>
                </div>
              )}
              {prefsSaving && (
                <div className="flex items-center gap-2 p-2 mt-3">
                  <span className="w-3 h-3 border-2 border-gray-300 border-t-primary rounded-full animate-spin" />
                  <p className="text-[12px] text-text-secondary">Saving…</p>
                </div>
              )}
            </div>
          ) : null}
        </section>

        {/* ─── Sign Out ─── */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 md:p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[20px] text-red-600">logout</span>
              </div>
              <div className="min-w-0">
                <h2 className="text-[15px] font-bold text-text-primary">Sign Out</h2>
                <p className="text-[12px] text-text-secondary">
                  Sign out of your account on this device.
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
              className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-[13px] font-bold hover:bg-red-100 hover:border-red-300 transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[16px]">logout</span>
              {loggingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
