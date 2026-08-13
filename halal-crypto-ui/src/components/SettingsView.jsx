import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { settingsApi } from '../api/client';

/**
 * Word the user must type to arm the delete button.
 *
 * Deliberately untranslated: matching it against a localised string would mean
 * the confirmation changes with the interface language, and a user who switched
 * languages mid-session could be shown one word while the check expects
 * another.
 */
const DELETE_CONFIRM_WORD = 'DELETE';

export default function SettingsView({ userEmail, currentTheme, onToggleTheme, onAccountDeleted }) {
  const { t, i18n } = useTranslation();

  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Delete-account state, kept separate from the profile form so a failed
  // deletion never clears or overwrites unsaved profile edits.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');


  // Quota loaded from the backend, not from localStorage.
  const [analysesRemaining, setAnalysesRemaining] = useState(null);
  const [dailyLimit, setDailyLimit] = useState(null);

  const [language, setLanguage] = useState(i18n.language || 'en');
  const [openSection, setOpenSection] = useState('preferences');

  // Sync email field when prop changes.
  useEffect(() => {
    if (userEmail) setEmail(userEmail);
  }, [userEmail]);

  // Keep language dropdown in sync with global i18n.
  useEffect(() => {
    setLanguage(i18n.language || 'en');
  }, [i18n.language]);

  // Load real quota from the backend.
  useEffect(() => {
    settingsApi.getProfile()
      .then((data) => {
        setAnalysesRemaining(data.analyses_remaining ?? null);
        setDailyLimit(data.daily_audit_limit ?? null);
      })
      .catch(() => {
        // Non-critical; quota display stays blank.
      });
  }, []);

  const toggleSection = (section) => {
    setOpenSection(openSection === section ? null : section);
  };

  const handleLanguageChange = (e) => {
    const lang = e.target.value;
    setLanguage(lang);
    i18n.changeLanguage(lang);
    localStorage.setItem('i18nextLng', lang);
  };

  const handleThemeSelect = (e) => {
    const theme = e.target.value;
    if (onToggleTheme && theme !== currentTheme) onToggleTheme(theme);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const payload = {};
      if (email && email !== userEmail) payload.email = email;
      if (currentPassword) payload.current_password = currentPassword;
      if (newPassword) payload.new_password = newPassword;

      const data = await settingsApi.updateProfile(payload);

      // If the email changed the backend issues a fresh token.
      if (data.access_token) {
        localStorage.setItem('access_token', data.access_token);
      }

      setMessage({ type: 'success', text: data.message || t('profile_updated', 'Profile updated successfully!') });
      setCurrentPassword('');
      setNewPassword('');

      // Refresh quota display.
      if (data.analyses_remaining != null) setAnalysesRemaining(data.analyses_remaining);
      if (data.daily_audit_limit != null) setDailyLimit(data.daily_audit_limit);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  // Both proofs are required before the button arms: the password (which the
  // backend re-verifies) and the typed word (which guards against a stray
  // click on a form the browser has autofilled).
  const canDelete =
    deletePassword.length > 0 && deleteConfirm.trim() === DELETE_CONFIRM_WORD;

  const handleDeleteAccount = async () => {
    if (!canDelete || deleting) return;

    setDeleting(true);
    setDeleteError('');

    try {
      await settingsApi.deleteAccount(deletePassword);
      // The account no longer exists, so the stored token resolves to nothing.
      // Hand off to the parent, which clears the session and returns home.
      onAccountDeleted?.();
    } catch (err) {
      setDeleteError(err.message);
      // Only re-enable on failure; on success the view is being torn down.
      setDeleting(false);
    }
  };

  const usedToday =
    analysesRemaining === null || dailyLimit === null
      ? null
      : Math.max(0, dailyLimit - analysesRemaining);

  const quotaLabel =
    analysesRemaining === null
      ? t('loading', 'Loading…')
      : dailyLimit === null
        ? `${analysesRemaining} remaining`
        : `${usedToday} / ${dailyLimit}`;

  return (
    <div className="max-w-3xl mx-auto space-y-6 font-sans text-slate-900 dark:text-slate-100 transition-colors duration-200">

      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          {t('account_settings', 'Account Settings')}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {t('account_settings_desc', 'Manage your credentials and app preferences.')}
        </p>
      </div>

      {/* Usage card — no subscription tier, no upgrade CTA */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm dark:shadow-lg transition-colors duration-200">
        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
          {t('daily_usage', 'Daily Fair-Use Quota')}
        </p>
        <div className="flex items-center gap-3">
          <span className="text-emerald-500 dark:text-emerald-400 text-xl">⚡</span>
          <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
            {t('audits_used_today', 'Audits used today')}: {quotaLabel}
          </span>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
          {t('quota_note', 'The quota resets at midnight UTC. Mizaan is free for everyone — no subscription required.')}
        </p>
      </div>

      {/* Feedback message */}
      {message.text && (
        <div className={`p-4 rounded-xl text-sm font-medium ${
          message.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
            : 'bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
        }`}>
          {message.text}
        </div>
      )}

      {/* Accordion */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm dark:shadow-lg overflow-hidden transition-colors duration-200">

        {/* Personal information */}
        <div className="border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => toggleSection('personal')}
            className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition cursor-pointer"
          >
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {t('personal_info', 'Personal Information')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t('personal_info_desc', 'Update your email address and change your password.')}
              </p>
            </div>
            <span className="text-slate-400 dark:text-slate-500 text-xs">
              {openSection === 'personal' ? '▲' : '▼'}
            </span>
          </button>

          {openSection === 'personal' && (
            <div className="p-5 pt-0 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
              <form onSubmit={handleUpdate} className="space-y-5 mt-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    {t('user_email', 'Email Address')}
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg p-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500 ltr:text-left rtl:text-right transition-colors duration-200"
                  />
                </div>

                <div className="border-t border-slate-200 dark:border-slate-800/60 pt-5 mt-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
                    {t('change_password', 'Change Password')}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        {t('current_password', 'Current Password')}
                      </label>
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="current-password"
                        className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg p-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500 transition-colors duration-200"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        {t('new_password', 'New Password')}
                      </label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        minLength={8}
                        className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg p-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500 transition-colors duration-200"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white font-bold rounded-lg text-sm transition cursor-pointer shadow-md"
                >
                  {loading ? t('saving', 'Saving...') : t('save_personal_info', 'Save Personal Info')}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Preferences */}
        <div className="border-b border-slate-200 dark:border-slate-800">

          <button
            type="button"
            onClick={() => toggleSection('preferences')}
            className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition cursor-pointer"
          >
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {t('app_preferences', 'App Preferences')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t('app_preferences_desc', 'Manage your language and display theme.')}
              </p>
            </div>
            <span className="text-slate-400 dark:text-slate-500 text-xs">
              {openSection === 'preferences' ? '▲' : '▼'}
            </span>
          </button>

          {openSection === 'preferences' && (
            <div className="p-5 pt-0 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
              <div className="space-y-5 mt-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    {t('language_display', 'Language Display')}
                  </label>
                  <select
                    value={language}
                    onChange={handleLanguageChange}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg p-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer transition-colors duration-200"
                  >
                    <option value="en">English</option>
                    <option value="ar">Arabic (العربية)</option>
                    <option value="fr">French (Français)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    {t('interface_theme', 'Interface Theme')}
                  </label>
                  <select
                    value={currentTheme || 'light'}
                    onChange={handleThemeSelect}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg p-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer transition-colors duration-200"
                  >
                    <option value="light">{t('theme_light', 'Light Mode')}</option>
                    <option value="dark">{t('theme_dark', 'Dark Mode')}</option>
                  </select>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                    {t('theme_note', 'Changes apply instantly to the entire application dashboard.')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Danger zone */}
        <div>
          <button
            type="button"
            onClick={() => toggleSection('danger')}
            className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition cursor-pointer"
          >
            <div>
              <h3 className="text-sm font-bold text-rose-600 dark:text-rose-400">
                {t('danger_zone', 'Danger Zone')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t('danger_zone_desc', 'Permanently delete your account and all associated data.')}
              </p>
            </div>
            <span className="text-slate-400 dark:text-slate-500 text-xs">
              {openSection === 'danger' ? '▲' : '▼'}
            </span>
          </button>

          {openSection === 'danger' && (
            <div className="p-5 pt-0 border-t border-slate-100 dark:border-slate-800 bg-rose-50/40 dark:bg-rose-950/10">
              <div className="mt-5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-slate-900 p-5">
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {t('delete_account', 'Delete Account')}
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                  {t(
                    'delete_account_warning',
                    'This permanently deletes your account, your audit history and every report generated from it. This action cannot be undone.',
                  )}
                </p>

                {!deleteOpen ? (
                  <button
                    type="button"
                    onClick={() => setDeleteOpen(true)}
                    className="mt-4 px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-sm transition cursor-pointer shadow-sm"
                  >
                    {t('delete_account', 'Delete Account')}
                  </button>
                ) : (
                  <div className="mt-5 space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        {t('current_password', 'Current Password')}
                      </label>
                      <input
                        type="password"
                        value={deletePassword}
                        onChange={(e) => setDeletePassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="current-password"
                        className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg p-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-rose-500 transition-colors duration-200"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        {t('delete_confirm_label', 'Type {{word}} to confirm', {
                          word: DELETE_CONFIRM_WORD,
                        })}
                      </label>
                      <input
                        type="text"
                        value={deleteConfirm}
                        onChange={(e) => setDeleteConfirm(e.target.value)}
                        placeholder={DELETE_CONFIRM_WORD}
                        autoComplete="off"
                        className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg p-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-rose-500 ltr:text-left rtl:text-right transition-colors duration-200"
                      />
                    </div>

                    {deleteError && (
                      <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
                        {deleteError}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={handleDeleteAccount}
                        disabled={!canDelete || deleting}
                        className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold rounded-lg text-sm transition cursor-pointer shadow-sm"
                      >
                        {deleting
                          ? t('deleting_account', 'Deleting…')
                          : t('delete_account_permanently', 'Permanently Delete Account')}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setDeleteOpen(false);
                          setDeletePassword('');
                          setDeleteConfirm('');
                          setDeleteError('');
                        }}
                        disabled={deleting}
                        className="px-5 py-2.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-lg text-sm transition cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        {t('cancel', 'Cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


