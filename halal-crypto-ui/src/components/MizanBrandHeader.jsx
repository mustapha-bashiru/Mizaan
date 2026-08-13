import React from 'react';
import MizanAILogo from './MizanAILogo';
import { BRAND } from '../config/about';


/**
 * Brand header used above the audit form.
 *
 * Delegates the artwork to MizanAILogo so there is a single source of truth
 * for the mark. Previously this component inlined its own divergent SVG,
 * which drifted from the logo used elsewhere in the app.
 */
export default function MizanBrandHeader({ className = '' }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <MizanAILogo className="h-12 w-12 shrink-0" />

      <div className="flex flex-col">
        <span className="text-lg font-bold uppercase leading-none tracking-tight text-slate-900 dark:text-white">
          {BRAND.name}
        </span>

        <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">
          Ethical • Transparent • Shariah Compliant
        </span>
      </div>
    </div>
  );
}
