/**
 * Frontend-only donation configuration.
 *
 * Mizaan is a free, non-profit research project. Nothing here unlocks
 * features - it only describes how a supporter can voluntarily give Sadaqah.
 *
 * IMPORTANT: every address below is a PLACEHOLDER. Replace them with the real
 * project wallets (and wire `handlers` to a payment provider) before going
 * live. No payment processing happens in the frontend today.
 */

export const PRESET_AMOUNTS = [5, 10, 25, 50];

export const MIN_AMOUNT = 1;
export const MAX_AMOUNT = 100000;

/**
 * Marker used by the placeholder wallet addresses below.
 *
 * While an address still contains it, the UI hides the "wallet verified"
 * badge and shows a "not configured yet" notice instead - we never want to
 * imply an unverified address has been checked by the team.
 */
const PLACEHOLDER_MARKER = 'placeholder';

export const isPlaceholderAddress = (address = '') =>
  address.toLowerCase().includes(PLACEHOLDER_MARKER);


/** Payment methods rendered as selectable cards inside the donation modal. */
export const PAYMENT_METHODS = [
  {
    id: 'card',
    type: 'fiat',
    label: 'Card',
    symbol: '💳',
    hint: 'Visa / Mastercard',
  },
  {
    id: 'usdt',
    type: 'crypto',
    label: 'USDT',
    symbol: '₮',
    hint: 'Tether',
    network: 'TRC20',
    // Shown as a prominent warning so funds are not sent on the wrong chain.
    networkWarning: 'Send USDT on the TRC20 (Tron) network only. Transfers on any other network will be permanently lost.',
    address: 'TMaQDxfedhaU4peJtD3LDXWoGRRNzEDg7T',
  },
  {
    id: 'bitcoin',
    type: 'crypto',
    label: 'Bitcoin',
    symbol: '₿',
    hint: 'BTC',
    network: 'Bitcoin',
    networkWarning: 'Send BTC on the Bitcoin network only.',
    address: '15tRJyhUakNUZYXNbKLaq5MkSLG6k5DQ3V',
  },
  {
    id: 'ethereum',
    type: 'crypto',
    label: 'Ethereum',
    symbol: 'Ξ',
    hint: 'ETH / ERC20',
    network: 'ERC20',
    networkWarning: 'Send ETH or ERC20 tokens on the Ethereum mainnet only.',
    address: '0x419c8b979352b26297e023e1c554331b57d6ab63',
  },
  {
    id: 'solana',
    type: 'crypto',
    label: 'Solana',
    symbol: '◎',
    hint: 'SOL / SPL',
    network: 'Solana',
    networkWarning: 'Send SOL or SPL tokens on the Solana network only.',
    address: '2qfyMhCdVbHYqfoUyE8ecEEcuoFpAB6AuBno8hDpbKbq',
  },
];

export const getPaymentMethod = (id) =>
  PAYMENT_METHODS.find((method) => method.id === id) || null;

/**
 * Placeholder handlers.
 *
 * Each returns a resolved result so the UI flow can be exercised end-to-end.
 * Swap the bodies for real provider calls (Stripe/Paystack checkout session,
 * on-chain transaction lookup, ...) when the backend is ready.
 */
export const donationHandlers = {
  /** Card checkout - will later redirect to / mount a hosted provider form. */
  async startCardDonation({ amount, currency = 'USD' }) {
    // TODO: create a checkout session on the backend and redirect the donor.
    return { status: 'pending_integration', amount, currency, method: 'card' };
  },

  /** Crypto: the donor sends manually, so we only acknowledge the intent. */
  async acknowledgeCryptoDonation({ amount, methodId, currency = 'USD' }) {
    // TODO: optionally record the pledge / poll the chain for confirmation.
    return { status: 'pending_integration', amount, currency, method: methodId };
  },
};
