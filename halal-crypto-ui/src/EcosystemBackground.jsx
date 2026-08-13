import React from 'react';

export default function EcosystemBackground() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 select-none">

       {/* Bottom Right Stripe */}
      <div className="absolute bottom-[10%] right-[50%] text-indigo-400/40 text-6xl font-black">
         $
      </div>

    </div>
  );
}