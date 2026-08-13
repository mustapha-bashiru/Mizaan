import { createContext, useContext } from 'react';

export const DonationContext = createContext(null);

export function useDonation() {
  const ctx = useContext(DonationContext);
  if (!ctx) {
    throw new Error('useDonation must be used inside a <DonationProvider>');
  }
  return ctx;
}
