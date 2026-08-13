import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next'; 
import ProjectIntakeForm from './ProjectIntakeForm'; 
import ShariahReportViewer from './components/ShariahReportViewer';
import AuthModal from './components/AuthModal';
import SettingsView from './components/SettingsView';
import AuditHistoryView from './components/AuditHistoryView';
import MizanAILogo from './components/MizanAILogo';
import AboutView from './components/AboutView';
import ContactResearchTeam from './components/ContactResearchTeam';
import EcosystemBackground from './EcosystemBackground';

import DonationBanner from './components/DonationBanner';
import DonateButton from './components/DonateButton';
import { DonationProvider } from './context/DonationContext';
import { ApiError, auditApi, emailStore, tokenStore } from './api/client';

function AppContent() {

  // 1. Initialize translation
  const { t, i18n } = useTranslation();
  
  // 2. Initialize Theme State (with local storage & system preference fallback)
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const storedTheme = localStorage.getItem('theme');
      if (storedTheme) {
        return storedTheme === 'dark';
      }
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return true; 
  });

  // Navigation & View States
  const [currentView, setCurrentView] = useState('audit'); 
  const [report, setReport] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // Inputs carried over from "Re-run audit" on the history page.
  const [rerunContext, setRerunContext] = useState(null);
  
  // Execution States
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [warnings, setWarnings] = useState([]);

  // Authentication States
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [userEmail, setUserEmail] = useState(null);

  // 3. Theme Toggle Effect
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  // Handler for Theme Change from Settings dropdown or header button
  const handleToggleTheme = (selectedTheme) => {
    if (typeof selectedTheme === 'string') {
      setIsDarkMode(selectedTheme === 'dark');
    } else {
      setIsDarkMode((prev) => !prev);
    }
  };

  // 4. RTL Support & Language Persistence Effect
  useEffect(() => {
    const isRtl = i18n.language === 'ar';
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.lang = i18n.language;
    localStorage.setItem('app_language', i18n.language);
  }, [i18n.language]);

  // 5. User Session Effect
  useEffect(() => {
    const storedEmail = emailStore.get();
    if (storedEmail) {
      setUserEmail(storedEmail);
    }
  }, []);

  // Handle URL-triggered UI (e.g. after password reset we land on
  // `/?showLogin=1&resetSuccess=1`). This opens the auth modal and shows
  // a transient success notice.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const showLogin = params.get('showLogin');
      const resetSuccess = params.get('resetSuccess');
      if (showLogin === '1') setIsAuthModalOpen(true);
      if (resetSuccess === '1') {
        setNotice(t('password_reset_success', 'Your password was reset. You can now log in.'));
        // remove params without reloading
        params.delete('showLogin');
        params.delete('resetSuccess');
        const newQuery = params.toString();
        const newUrl = `${window.location.pathname}${newQuery ? `?${newQuery}` : ''}${window.location.hash || ''}`;
        window.history.replaceState({}, document.title, newUrl);
        // auto-clear notice after a short delay
        setTimeout(() => setNotice(null), 4000);
      }
    } catch {
      // ignore
    }
  }, [t]);

  // Language switch handler
  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

  const handleLogout = () => {
    tokenStore.clear();
    setUserEmail(null);
    setReport(null);
    setWarnings([]);
    setCurrentView('audit');
    setIsMobileMenuOpen(false);
  };

  /**
   * Called once the backend confirms the account was deleted.
   *
   * Reuses handleLogout so session teardown stays in one place: it clears the
   * token, drops the in-memory report and returns to the home view. The audit
   * history needs no explicit reset because AuditHistoryView owns that state
   * and is unmounted by the view change.
   */
  const handleAccountDeleted = () => {
    handleLogout();
    setNotice(
      t('account_deleted', 'Your account and all associated data have been deleted.'),
    );
  };


  const handleAuditSubmit = async (formData) => {
    if (!tokenStore.get()) {
      setError(t('error_auth_required', 'Please log in or register an account to run an analysis.'));
      setIsAuthModalOpen(true);
      return;
    }

    // Append the selected language to instruct the AI pipeline
    formData.append('language', i18n.language);

    setIsLoading(true);
    setError(null);
    setWarnings([]);

    try {
      const auditData = await auditApi.run(formData);
      // The archived id travels with the report so "Download PDF" can fetch the
      // authoritative server-rendered document instead of re-drawing a
      // simplified copy in the browser.
      setReport({
        ...auditData.report,
        audit_id: auditData.audit_id ?? null,
        report_id: auditData.report_id ?? auditData.report?.report_id ?? null,
      });
      // Skipped files or a failed URL scrape are reported without blocking.
      setWarnings(auditData.warnings || []);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleLogout();
        setIsAuthModalOpen(true);
        setError(t('error_session_expired', 'Your session has expired. Please log in again.'));
      } else if (err instanceof ApiError && err.isQuotaError) {
        // Daily fair-use cap, not a paywall.
        setError(err.message);
      } else {
        setError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getInitials = (email) => {
    return email ? email.charAt(0).toUpperCase() : 'U';
  };

  return (
    <div className="relative min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-emerald-500 selection:text-white overflow-x-hidden transition-colors duration-300">
      
      {/* Subtle Living Ecosystem Background Behind Everything */}
      <EcosystemBackground />

      {/* Foreground Container (Interactive Elements sit above z-10) */}
      <div className="relative z-10 flex flex-col min-h-screen">
        
        {/* PROFESSIONAL HEADER */}
        <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors duration-300">
          <div className="max-w-6xl mx-auto flex items-center justify-between h-16 px-4 sm:px-6">
            
            {/* Logo Area */}
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => { setCurrentView('audit'); setReport(null); }}>
              <MizanAILogo className="w-10 h-auto" />
              <div className="flex flex-col justify-center">
                <h1 className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight leading-none">
                  {t('app_name', 'MIZAAN AI')}
                </h1>
              </div>
            </div>

            {/* Desktop Navigation (Hidden on Mobile) */}
            <div className="hidden md:flex items-center gap-6">

              {/* Permanent Sadaqah entry point - never dismissible */}
              <DonateButton variant="header" />

              {/* Language & Theme Controls */}
              <div className="flex items-center gap-4 mr-2 border-r border-slate-300 dark:border-slate-700 pr-6">

                <select
                  id="languageSelect"
                  name="languageSelect"
                  aria-label={t('select_language', 'Select Language')}
                  onChange={(e) => changeLanguage(e.target.value)}
                  value={i18n.language}
                  className="bg-transparent text-slate-600 dark:text-slate-300 font-medium text-sm outline-none cursor-pointer"
                >
                  <option value="en" className="dark:bg-slate-900">🇺🇸 EN</option>
                  <option value="ar" className="dark:bg-slate-900">🇸🇦 AR</option>
                  <option value="fr" className="dark:bg-slate-900">🇫🇷 FR</option>
                </select>

                <button 
                  onClick={handleToggleTheme} 
                  className="text-slate-600 dark:text-slate-300 hover:text-emerald-500 transition cursor-pointer text-lg"
                  aria-label={t('toggle_theme', 'Toggle Theme')}
                >
                  {isDarkMode ? '☀️' : '🌙'}
                </button>
              </div>

              {userEmail ? (
                <>
                  <button onClick={() => { setCurrentView('audit'); setReport(null); }} className={`text-sm font-semibold transition cursor-pointer ${currentView === 'audit' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'}`}>
                    {t('audits', 'Audits')}
                  </button>
                  <button onClick={() => { setCurrentView('history'); setReport(null); }} className={`text-sm font-semibold transition cursor-pointer ${currentView === 'history' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'}`}>
                    {t('audit_history', 'Audit History')}
                  </button>
                  <button onClick={() => setCurrentView('settings')} className={`text-sm font-semibold transition cursor-pointer ${currentView === 'settings' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'}`}>
                    {t('settings', 'Settings')}
                  </button>
                  <button onClick={() => { setCurrentView('about'); setReport(null); }} className={`text-sm font-semibold transition cursor-pointer ${currentView === 'about' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'}`}>
                    {t('about', 'About')}
                  </button>


                  {/* Profile Avatar with Hover Dropdown */}
                  <div className="relative group cursor-pointer ml-2">
                    <div className="w-9 h-9 bg-emerald-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm">
                      {getInitials(userEmail)}
                    </div>
                    {/* Dropdown Menu */}
                    <div className="absolute ltr:right-0 rtl:left-0 mt-2 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 flex flex-col overflow-hidden transform origin-top-right z-50">
                      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{userEmail}</p>
                      </div>
                      {/* Lives in the dropdown rather than the header bar: the
                          top-level nav is already full, and this is a low-
                          frequency action. */}
                      <button onClick={() => { setCurrentView('contact'); setReport(null); }} className="text-left rtl:text-right px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition font-medium cursor-pointer border-b border-slate-200 dark:border-slate-800">
                        {t('contact_research', 'Contact Research Team')}
                      </button>
                      <button onClick={handleLogout} className="text-left rtl:text-right px-4 py-2.5 text-sm text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition font-medium cursor-pointer">
                        {t('logout', 'Logout')}
                      </button>

                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-4 ml-2">
                  {/* Visible before sign-in: visitors evaluating the platform
                      need the About page more than existing users do. */}
                  <button onClick={() => { setCurrentView('about'); setReport(null); }} className={`text-sm font-semibold transition cursor-pointer ${currentView === 'about' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'}`}>
                    {t('about', 'About')}
                  </button>
                  <button onClick={() => setIsAuthModalOpen(true)} className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-semibold text-sm transition cursor-pointer">
                    {t('sign_in', 'Sign In')}
                  </button>

                  <button onClick={() => { window.location.href = '/reset-password'; }} className="text-sm text-emerald-600 hover:underline ml-2">
                    {t('forgot_password', 'Forgot password?')}
                  </button>
                  <button onClick={() => setIsAuthModalOpen(true)} className="bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 font-bold px-4 py-2.5 rounded-lg text-sm transition cursor-pointer shadow-sm">
                    {t('join', 'Join')}
                  </button>
                </div>
              )}
            </div>

            {/* Mobile Menu Toggle Button */}
            <button 
              className="md:hidden text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white p-2 cursor-pointer"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
          </div>
        </header>

        {/* MOBILE SIDEBAR (Drawer) */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-50 flex ltr:justify-end rtl:justify-start">
            <div 
              className="fixed inset-0 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-sm" 
              onClick={() => setIsMobileMenuOpen(false)}
            ></div>
            
            <div className="relative w-64 bg-white dark:bg-slate-900 h-full shadow-2xl border-l rtl:border-l-0 rtl:border-r border-slate-200 dark:border-slate-800 flex flex-col transform transition-transform duration-300">
              <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
                <span className="font-bold text-slate-900 dark:text-slate-100">{t('menu', 'Menu')}</span>
                <button onClick={() => setIsMobileMenuOpen(false)} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 cursor-pointer">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex flex-col p-4 gap-4 flex-grow">
                
                {/* Mobile Language & Theme Controls */}
                <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800 p-2 rounded-lg">
                  <select 
                    onChange={(e) => changeLanguage(e.target.value)}
                    value={i18n.language}
                    className="bg-transparent text-slate-700 dark:text-slate-300 text-sm font-medium outline-none w-full"
                  >
                    <option value="en">🌐 English</option>
                    <option value="ar">🌐 Arabic</option>
                    <option value="fr">🌐 French</option>
                  </select>
                  <button onClick={handleToggleTheme} className="text-xl ltr:ml-2 rtl:mr-2 ltr:border-l rtl:border-r border-slate-300 dark:border-slate-600 ltr:pl-2 rtl:pr-2">
                    {isDarkMode ? '☀️' : '🌙'}
                  </button>
                </div>

                {/* Permanent Sadaqah entry point */}
                <DonateButton
                  variant="sidebar"
                  onClick={() => setIsMobileMenuOpen(false)}
                />


                {userEmail ? (
                  <>
                    <div className="h-px bg-slate-200 dark:bg-slate-800 my-2"></div>
                    <div className="px-2 mb-2">
                      <p className="text-xs text-slate-500 uppercase tracking-wider font-bold mb-1">{t('account', 'Account')}</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300 truncate">{userEmail}</p>
                    </div>
                    <button 
                      onClick={() => { setCurrentView('audit'); setReport(null); setIsMobileMenuOpen(false); }} 
                      className={`text-left rtl:text-right text-sm font-medium p-2 rounded-lg transition ${currentView === 'audit' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    >
                      📋 {t('audits', 'Audits')}
                    </button>
                    <button
                      onClick={() => { setCurrentView('history'); setReport(null); setIsMobileMenuOpen(false); }}
                      className={`text-left rtl:text-right text-sm font-medium p-2 rounded-lg transition ${currentView === 'history' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    >
                      🕘 {t('audit_history', 'Audit History')}
                    </button>
                    <button 
                      onClick={() => { setCurrentView('settings'); setIsMobileMenuOpen(false); }} 
                      className={`text-left rtl:text-right text-sm font-medium p-2 rounded-lg transition ${currentView === 'settings' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    >
                      ⚙️ {t('settings', 'Settings')}
                    </button>
                    <button
                      onClick={() => { setCurrentView('about'); setReport(null); setIsMobileMenuOpen(false); }}
                      className={`text-left rtl:text-right text-sm font-medium p-2 rounded-lg transition ${currentView === 'about' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    >
                      ℹ️ {t('about', 'About')}
                    </button>
                    <button
                      onClick={() => { setCurrentView('contact'); setReport(null); setIsMobileMenuOpen(false); }}
                      className={`text-left rtl:text-right text-sm font-medium p-2 rounded-lg transition ${currentView === 'contact' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    >
                      ✉️ {t('contact_research', 'Contact Research Team')}
                    </button>
                    <button onClick={handleLogout} className="text-left rtl:text-right text-sm font-medium text-rose-500 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition mt-auto">

                      {t('logout', 'Logout')}
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col gap-3 mt-4">
                    <button onClick={() => { setIsAuthModalOpen(true); setIsMobileMenuOpen(false); }} className="text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold p-3 rounded-lg text-sm transition cursor-pointer text-center">
                      {t('sign_in', 'Sign In')}
                    </button>
                    <button onClick={() => { setIsAuthModalOpen(true); setIsMobileMenuOpen(false); }} className="bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 font-bold p-3 rounded-lg text-sm transition cursor-pointer text-center">
                      {t('join', 'Join')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* MAIN CONTENT AREA */}
        <main className="max-w-4xl mx-auto py-10 px-4 space-y-6 flex-grow w-full">
          {error && (
            <div className="bg-rose-100 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-600/60 text-rose-700 dark:text-rose-200 p-4 rounded-xl text-xs flex items-center justify-between shadow-lg">
              <div>
                <strong className="font-bold block mb-0.5">{t('error_execution', 'Execution Error')}</strong>
                <span>{error}</span>
              </div>
              <button onClick={() => setError(null)} className="font-bold px-2 py-1 text-sm transition cursor-pointer hover:opacity-70">✕</button>
            </div>
          )}

          {notice && (
            <div className="bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-700/50 text-emerald-800 dark:text-emerald-200 p-4 rounded-xl text-sm shadow-sm">
              {notice}
            </div>
          )}

          {warnings.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700/60 text-amber-800 dark:text-amber-200 p-4 rounded-xl text-xs flex items-start justify-between shadow-sm">
              <div>
                <strong className="font-bold block mb-1">
                  {t('partial_warnings', 'Some inputs were skipped')}
                </strong>
                <ul className="list-disc ltr:pl-4 rtl:pr-4 space-y-0.5">
                  {warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
              <button onClick={() => setWarnings([])} className="font-bold px-2 py-1 text-sm transition cursor-pointer hover:opacity-70">✕</button>
            </div>
          )}

          {userEmail && <DonationBanner />}

          {currentView === 'about' ? (
            <AboutView />
          ) : currentView === 'contact' ? (
            <ContactResearchTeam />
          ) : currentView === 'settings' ? (

            <SettingsView
              userEmail={userEmail}
              currentTheme={isDarkMode ? 'dark' : 'light'}
              onToggleTheme={handleToggleTheme}
              onAccountDeleted={handleAccountDeleted}
            />

          ) : currentView === 'history' ? (
            <AuditHistoryView
              // Viewing a stored audit reuses the normal report viewer, and
              // carries the row id so its PDF download uses the same stored
              // document the history list serves.
              onViewReport={(storedReport, item) => {
                setReport({
                  ...storedReport,
                  audit_id: item?.id ?? null,
                  report_id: storedReport?.report_id ?? item?.report_id ?? null,
                });
                setCurrentView('audit');
              }}
              // Re-running goes back through the intake form so the daily
              // quota and validation still apply.
              onRerunAudit={(context) => {
                setRerunContext(context);
                setReport(null);
                setCurrentView('audit');
              }}
            />
          ) : !report ? (
            <ProjectIntakeForm
              onSubmit={handleAuditSubmit}
              isLoading={isLoading}
              prefill={rerunContext}
            />
          ) : (
            <ShariahReportViewer report={report} onReset={() => setReport(null)} />
          )}
        </main>

        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          onLoginSuccess={() => {
            setUserEmail(emailStore.get());
            setError(null);
          }}
        />

        {/* Mobile floating Donate action - hidden while the drawer is open */}
        {!isMobileMenuOpen && <DonateButton variant="fab" />}

      </div>
    </div>
  );
}

/**
 * Donation state lives above the app shell so the banner, the header button,
 * the sidebar link and the floating action button all drive a single modal.
 */
export default function App() {
  return (
    <DonationProvider>
      <AppContent />
    </DonationProvider>
  );
}
