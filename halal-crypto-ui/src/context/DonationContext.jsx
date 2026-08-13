import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import DonationModal from '../components/DonationModal';
import DonationSuccess from '../components/DonationSuccess';
import { donationsApi } from '../api/client';
import { DonationContext } from './donationState';

/**
 * Shared donation state.
 *
 * The modal + success dialog are mounted ONCE here, so every entry point
 * (dismissible banner, header button, sidebar link, mobile FAB) opens the same
 * instance instead of each rendering its own copy.
 */
export function DonationProvider({ children }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [successDonation, setSuccessDonation] = useState(null);

  // Backend-provided info (note, enabled flag). Donations stay available by
  // default so a failed/unauthenticated info call never hides the button.
  const [info, setInfo] = useState(null);
  const [donationsEnabled, setDonationsEnabled] = useState(true);

  // The banner is dismissible; the persistent button intentionally is not.
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [infoData, prefData] = await Promise.all([
          donationsApi.info(),
          donationsApi
            .getPreference()
            .catch(() => ({ donation_prompt_enabled: true })),
        ]);
        if (cancelled) return;
        setInfo(infoData);
        setDonationsEnabled(infoData?.donations_enabled !== false);
        setBannerDismissed(prefData?.donation_prompt_enabled === false);
      } catch {
        // Non-critical: keep the default "donations available" state.
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const openDonation = useCallback(() => setIsModalOpen(true), []);
  const closeDonation = useCallback(() => setIsModalOpen(false), []);

  /** Hide only the banner. The Donate button remains reachable everywhere. */
  const dismissBanner = useCallback(async () => {
    setBannerDismissed(true);
    try {
      await donationsApi.setPreference(false);
    } catch {
      // Best-effort; already hidden locally for this session.
    }
  }, []);

  const handleSuccess = useCallback((donation) => {
    setIsModalOpen(false);
    setSuccessDonation(donation);
  }, []);

  const value = useMemo(
    () => ({
      info,
      donationsEnabled,
      isBannerVisible: donationsEnabled && !bannerDismissed,
      openDonation,
      closeDonation,
      dismissBanner,
    }),
    [info, donationsEnabled, bannerDismissed, openDonation, closeDonation, dismissBanner],
  );

  return (
    <DonationContext.Provider value={value}>
      {children}

      <DonationModal
        isOpen={isModalOpen}
        onClose={closeDonation}
        onSuccess={handleSuccess}
        note={info?.note}
      />

      <DonationSuccess
        isOpen={Boolean(successDonation)}
        donation={successDonation}
        onClose={() => setSuccessDonation(null)}
      />
    </DonationContext.Provider>
  );
}
