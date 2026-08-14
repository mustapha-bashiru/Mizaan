import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ProjectIntakeForm from './ProjectIntakeForm';
import ShariahReportViewer from './components/ShariahReportViewer';
import AuthModal from './components/AuthModal';
import SettingsView from './components/SettingsView';
import AuditHistoryView from './components/AuditHistoryView';
import AppSidebar from './components/AppSidebar';
import AboutView from './components/AboutView';
import ContactResearchTeam from './components/ContactResearchTeam';
import EcosystemBackground from './EcosystemBackground';
import DonationBanner from './components/DonationBanner';
import { DonationProvider } from './context/DonationContext';
import { ApiError, auditApi, emailStore, tokenStore } from './api/client';

function AppContent() {
  const { t, i18n } = useTranslation();
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const stored = typeof window !== 'undefined' && localStorage.getItem('theme');
    return stored ? stored === 'dark' : true;
  });
  const [currentView, setCurrentView] = useState('audit');
  const [report, setReport] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [rerunContext, setRerunContext] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [userEmail, setUserEmail] = useState(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);
  useEffect(() => {
    document.documentElement.dir = i18n.language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = i18n.language;
    localStorage.setItem('app_language', i18n.language);
  }, [i18n.language]);
  useEffect(() => { const email = emailStore.get(); if (email) setUserEmail(email); }, []);
  useEffect(() => {
    if (!isMobileMenuOpen) return undefined;
    const oldOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => event.key === 'Escape' && setIsMobileMenuOpen(false);
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', closeOnEscape); };
  }, [isMobileMenuOpen]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('showLogin') === '1') setIsAuthModalOpen(true);
    if (params.get('resetSuccess') === '1') {
      setNotice(t('password_reset_success', 'Your password was reset. You can now log in.'));
      params.delete('showLogin'); params.delete('resetSuccess');
      const query = params.toString();
      window.history.replaceState({}, document.title, `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
      setTimeout(() => setNotice(null), 4000);
    }
  }, [t]);

  const navigate = (view) => { setCurrentView(view); if (view !== 'audit') setReport(null); setIsMobileMenuOpen(false); };
  const handleLogout = () => { tokenStore.clear(); setUserEmail(null); setReport(null); setWarnings([]); navigate('audit'); };
  const handleAuditSubmit = async (formData) => {
    if (!tokenStore.get()) { setError(t('error_auth_required', 'Please log in or register an account to run an analysis.')); setIsAuthModalOpen(true); return; }
    formData.append('language', i18n.language); setIsLoading(true); setError(null); setWarnings([]);
    try {
      const auditData = await auditApi.run(formData);
      setReport({ ...auditData.report, audit_id: auditData.audit_id ?? null, report_id: auditData.report_id ?? auditData.report?.report_id ?? null });
      setWarnings(auditData.warnings || []);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { handleLogout(); setIsAuthModalOpen(true); setError(t('error_session_expired', 'Your session has expired. Please log in again.')); } else setError(err.message);
    } finally { setIsLoading(false); }
  };
  const viewTitle = { history: t('audit_history', 'Audit History'), settings: t('settings', 'Settings'), about: t('about', 'About'), contact: t('contact_research', 'Contact Research Team') }[currentView] || t('audits', 'Audits');

  return <div className="relative min-h-screen overflow-x-hidden bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <EcosystemBackground />
    <AppSidebar collapsed={isSidebarCollapsed} currentView={currentView} userEmail={userEmail} isDarkMode={isDarkMode} language={i18n.language} onToggleCollapsed={() => setIsSidebarCollapsed((value) => !value)} onNavigate={navigate} onLanguageChange={(lng) => i18n.changeLanguage(lng)} onToggleTheme={() => setIsDarkMode((value) => !value)} onSignIn={() => setIsAuthModalOpen(true)} onLogout={handleLogout} />
    <AppSidebar mobile open={isMobileMenuOpen} currentView={currentView} userEmail={userEmail} isDarkMode={isDarkMode} language={i18n.language} onClose={() => setIsMobileMenuOpen(false)} onNavigate={navigate} onLanguageChange={(lng) => i18n.changeLanguage(lng)} onToggleTheme={() => setIsDarkMode((value) => !value)} onSignIn={() => { setIsAuthModalOpen(true); setIsMobileMenuOpen(false); }} onLogout={handleLogout} />
    <div className={`relative z-10 flex min-h-screen flex-col transition-[margin] duration-200 ${isSidebarCollapsed ? 'md:ltr:ml-20 md:rtl:mr-20' : 'md:ltr:ml-64 md:rtl:mr-64'}`}>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/85"><div className="flex h-16 items-center gap-3 px-3 sm:px-6"><button type="button" onClick={() => setIsMobileMenuOpen(true)} className="grid h-11 w-11 place-items-center rounded-md text-2xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 md:hidden" aria-label={t('menu', 'Menu')}>☰</button><div className="min-w-0"><p className="truncate text-sm font-bold">{viewTitle}</p><p className="truncate text-xs text-slate-500">{userEmail || t('subtitle', 'Ethical and transparent Shariah audit')}</p></div></div></header>
      <main className="w-full flex-grow space-y-6 px-3 py-5 sm:px-6 sm:py-8 xl:px-10">
        {error && <div className="flex items-center justify-between rounded-lg border border-rose-300 bg-rose-100 p-4 text-xs text-rose-700 dark:border-rose-600/60 dark:bg-rose-950/80 dark:text-rose-200"><span><strong className="me-2">{t('error_execution', 'Execution Error')}</strong>{error}</span><button type="button" onClick={() => setError(null)} aria-label={t('close', 'Close')}>×</button></div>}
        {notice && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-700/50 dark:bg-emerald-950/50 dark:text-emerald-200">{notice}</div>}
        {warnings.length > 0 && <div className="flex items-start justify-between rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/60 dark:text-amber-200"><div><strong className="mb-1 block">{t('partial_warnings', 'Some inputs were skipped')}</strong><ul className="list-disc ltr:pl-4 rtl:pr-4">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div><button type="button" onClick={() => setWarnings([])} aria-label={t('close', 'Close')}>×</button></div>}
        {userEmail && <DonationBanner />}
        {currentView === 'about' ? <AboutView /> : currentView === 'contact' ? <ContactResearchTeam /> : currentView === 'settings' ? <SettingsView userEmail={userEmail} currentTheme={isDarkMode ? 'dark' : 'light'} onToggleTheme={(theme) => setIsDarkMode(typeof theme === 'string' ? theme === 'dark' : (value) => !value)} onAccountDeleted={() => { handleLogout(); setNotice(t('account_deleted', 'Your account and all associated data have been deleted.')); }} /> : currentView === 'history' ? <AuditHistoryView onViewReport={(storedReport, item) => { setReport({ ...storedReport, audit_id: item?.id ?? null, report_id: storedReport?.report_id ?? item?.report_id ?? null }); navigate('audit'); }} onRerunAudit={(context) => { setRerunContext(context); setReport(null); navigate('audit'); }} /> : !report ? <ProjectIntakeForm onSubmit={handleAuditSubmit} isLoading={isLoading} prefill={rerunContext} /> : <ShariahReportViewer report={report} onReset={() => setReport(null)} />}
      </main>
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} onLoginSuccess={() => { setUserEmail(emailStore.get()); setError(null); }} />
    </div>
  </div>;
}

export default function App() { return <DonationProvider><AppContent /></DonationProvider>; }