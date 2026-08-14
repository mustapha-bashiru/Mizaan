import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import DonateButton from './DonateButton';
import MizanAILogo from './MizanAILogo';

const icons = {
  audit: '▤', history: '◷', settings: '⚙', about: 'ⓘ', contact: '✉',
};

export default function AppSidebar({
  mobile = false,
  open = false,
  collapsed = false,
  currentView,
  userEmail,
  isDarkMode,
  language,
  onClose,
  onToggleCollapsed,
  onNavigate,
  onLanguageChange,
  onToggleTheme,
  onSignIn,
  onLogout,
}) {
  const { t } = useTranslation();
  const expanded = mobile || !collapsed;
  const items = userEmail
    ? [
        ['audit', t('audits', 'Audits')],
        ['history', t('audit_history', 'Audit History')],
        ['settings', t('settings', 'Settings')],
        ['about', t('about', 'About')],
        ['contact', t('contact_research', 'Contact Research Team')],
      ]
    : [['about', t('about', 'About')]];

  const panel = (
    <motion.aside
      initial={false}
      animate={{ x: mobile && !open ? (language === 'ar' ? '100%' : '-100%') : 0 }}
      transition={{ type: 'spring', stiffness: 360, damping: 34 }}
      className={`${mobile ? 'relative h-full w-[min(19rem,86vw)] shadow-2xl' : `fixed inset-y-0 z-40 hidden md:flex ${collapsed ? 'w-20' : 'w-64'} ltr:left-0 rtl:right-0`} flex-col border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ltr:border-r rtl:border-l transition-[width] duration-200`}
      aria-label={t('menu', 'Menu')}
    >
      <div className={`flex h-16 shrink-0 items-center border-b border-slate-200 px-4 dark:border-slate-800 ${expanded ? 'justify-between' : 'justify-center'}`}>
        <button type="button" onClick={() => onNavigate('audit')} className="flex min-w-0 items-center gap-3" aria-label={t('app_name', 'Mizaan')}>
          <MizanAILogo className="h-10 w-10 shrink-0" />
          {expanded && <span className="truncate text-lg font-black text-emerald-600 dark:text-emerald-400">{t('app_name', 'MIZAAN')}</span>}
        </button>
        {mobile && (
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center text-2xl text-slate-500" aria-label={t('close', 'Close')}>×</button>
        )}
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
        {items.map(([view, label]) => (
          <button
            key={view}
            type="button"
            onClick={() => onNavigate(view)}
            title={!expanded ? label : undefined}
            className={`flex min-h-11 items-center rounded-md px-3 text-sm font-semibold transition ${expanded ? 'gap-3' : 'justify-center'} ${currentView === view ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
          >
            <span className="w-5 shrink-0 text-center text-lg" aria-hidden="true">{icons[view]}</span>
            {expanded && <span className="text-start leading-5">{label}</span>}
          </button>
        ))}
      </nav>

      <div className="space-y-2 border-t border-slate-200 p-3 dark:border-slate-800">
        {expanded ? (
          <>
            <DonateButton variant="sidebar" onClick={mobile ? onClose : undefined} />
            <div className="grid grid-cols-[1fr_44px] gap-2">
              <select aria-label={t('select_language', 'Select Language')} value={language} onChange={(event) => onLanguageChange(event.target.value)} className="min-h-11 min-w-0 rounded-md border border-slate-200 bg-slate-50 px-2 text-sm dark:border-slate-700 dark:bg-slate-800">
                <option value="en">English</option><option value="fr">Français</option><option value="ar">العربية</option>
              </select>
              <button type="button" onClick={onToggleTheme} className="grid h-11 w-11 place-items-center rounded-md border border-slate-200 dark:border-slate-700" aria-label={t('toggle_theme', 'Toggle theme')}>{isDarkMode ? '☀' : '☾'}</button>
            </div>
            {userEmail ? (
              <div className="pt-1">
                <p className="truncate px-2 pb-2 text-xs text-slate-500">{userEmail}</p>
                <button type="button" onClick={onLogout} className="min-h-11 w-full rounded-md px-3 text-start text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30">{t('logout', 'Logout')}</button>
              </div>
            ) : (
              <button type="button" onClick={onSignIn} className="min-h-11 w-full rounded-md bg-slate-900 px-3 text-sm font-bold text-white dark:bg-white dark:text-slate-900">{t('sign_in', 'Sign In')}</button>
            )}
          </>
        ) : (
          <button type="button" onClick={onToggleTheme} title={t('toggle_theme', 'Toggle theme')} className="grid h-11 w-full place-items-center rounded-md text-lg hover:bg-slate-100 dark:hover:bg-slate-800">{isDarkMode ? '☀' : '☾'}</button>
        )}
        {!mobile && (
          <button type="button" onClick={onToggleCollapsed} className="grid h-10 w-full place-items-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={collapsed ? t('expand_menu', 'Expand menu') : t('collapse_menu', 'Collapse menu')} title={collapsed ? t('expand_menu', 'Expand menu') : t('collapse_menu', 'Collapse menu')}>
            <span className="ltr:block rtl:hidden">{collapsed ? '›' : '‹'}</span><span className="hidden rtl:block">{collapsed ? '‹' : '›'}</span>
          </button>
        )}
      </div>
    </motion.aside>
  );

  if (!mobile) return panel;
  return (
    <div className={`fixed inset-0 z-50 flex transition-opacity duration-200 md:hidden ${open ? 'visible opacity-100' : 'invisible pointer-events-none opacity-0'}`} aria-hidden={!open}>
      <button type="button" className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} aria-label={t('close', 'Close')} tabIndex={open ? 0 : -1} />
      {panel}
    </div>
  );
}