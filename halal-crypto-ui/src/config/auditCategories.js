/**
 * Intake taxonomies for the two audit modes.
 *
 * Design notes
 * ------------
 * * `value` is what the backend receives (`category` form field) and what is
 *   replayed by "Re-run audit". Existing values are therefore never renamed,
 *   only added to, so archived audits keep resolving to the same option.
 * * `labelKey` / `label` follow the project convention of
 *   `t('key', 'English default')`, so English needs no i18n entry while
 *   French and Arabic are translated in `src/i18n.js`.
 * * Options are grouped so a long list still renders as a scannable
 *   `<optgroup>` select on desktop and mobile. The list is deliberately broad:
 *   a project forced into a loosely-related category produces a weaker audit
 *   than one that names its actual mechanism, so meme tokens, Telegram mini
 *   apps, gambling, tokenised sukuk, dropshipping, MLM and the rest each get
 *   an explicit entry.
 * * The list is long enough that `filterCategoryGroups` exists to back a
 *   search box in the intake form.
 */

export const CRYPTO_CATEGORY_GROUPS = [
  {
    id: 'trading',
    labelKey: 'catgrp_trading',
    label: 'Trading & Markets',
    options: [
      {
        value: 'DEX / Automated Market Maker',
        labelKey: 'cat_dex',
        label: 'DEX / Automated Market Maker',
      },
      {
        value: 'DEX Aggregator / Intent Solver',
        labelKey: 'cat_dex_aggregator',
        label: 'DEX Aggregator / Intent Solver',
      },
      {
        value: 'Spot Order-Book Exchange / RFQ',
        labelKey: 'cat_orderbook',
        label: 'Spot Order-Book Exchange / RFQ',
      },
      {
        value: 'Perpetuals & Derivatives',
        labelKey: 'cat_perpetuals',
        label: 'Perpetuals & Derivatives',
      },
      {
        value: 'Options & Structured Products',
        labelKey: 'cat_options',
        label: 'Options & Structured Products',
      },
      {
        value: 'Synthetic Assets',
        labelKey: 'cat_synthetics',
        label: 'Synthetic Assets',
      },
      {
        value: 'Prediction Markets',
        labelKey: 'cat_prediction',
        label: 'Prediction Markets',
      },
      {
        value: 'Centralized Exchange / Brokerage',
        labelKey: 'cat_cex',
        label: 'Centralized Exchange / Brokerage',
      },
      {
        value: 'Market Making / Liquidity Provision',
        labelKey: 'cat_market_maker',
        label: 'Market Making / Liquidity Provision',
      },
      {
        value: 'Trading Bot / Algorithmic Strategy',
        labelKey: 'cat_trading_bot',
        label: 'Trading Bot / Algorithmic Strategy',
      },
      {
        value: 'Copy Trading / Social Trading',
        labelKey: 'cat_copy_trading',
        label: 'Copy Trading / Social Trading',
      },
      {
        value: 'Launchpad / Token Sale Platform',
        labelKey: 'cat_launchpad',
        label: 'Launchpad / Token Sale Platform',
      },
    ],
  },
  {
    id: 'yield',
    labelKey: 'catgrp_yield',
    label: 'Lending, Yield & Staking',
    options: [
      {
        value: 'Lending & Borrowing',
        labelKey: 'cat_lending',
        label: 'Lending & Borrowing',
      },
      {
        value: 'CDP / Collateralized Debt Position',
        labelKey: 'cat_cdp',
        label: 'CDP / Collateralized Debt Position',
      },
      {
        value: 'Undercollateralized / Credit Lending',
        labelKey: 'cat_credit_lending',
        label: 'Undercollateralized / Credit Lending',
      },
      {
        value: 'Flash Loan / Leverage Protocol',
        labelKey: 'cat_flash_loan',
        label: 'Flash Loan / Leverage Protocol',
      },
      {
        value: 'Yield Aggregator / Staking',
        labelKey: 'cat_yield',
        label: 'Yield Aggregator / Staking',
      },
      {
        value: 'Fixed-Rate / Yield Tokenization',
        labelKey: 'cat_fixed_yield',
        label: 'Fixed-Rate / Yield Tokenization',
      },
      {
        value: 'Liquid Staking Derivatives',
        labelKey: 'cat_liquid_staking',
        label: 'Liquid Staking Derivatives',
      },
      {
        value: 'Restaking / Shared Security',
        labelKey: 'cat_restaking',
        label: 'Restaking / Shared Security',
      },
      {
        value: 'Staking Infrastructure / Validator',
        labelKey: 'cat_validator',
        label: 'Staking Infrastructure / Validator',
      },
      {
        value: 'Islamic Finance Protocol (Murabaha / Mudarabah / Sukuk)',
        labelKey: 'cat_islamic_defi',
        label: 'Islamic Finance Protocol (Murabaha / Mudarabah / Sukuk)',
      },
      {
        value: 'Insurance / Takaful Protocol',
        labelKey: 'cat_crypto_insurance',
        label: 'Insurance / Takaful Protocol',
      },
    ],
  },
  {
    id: 'assets',
    labelKey: 'catgrp_assets',
    label: 'Assets, Payments & RWA',
    options: [
      {
        value: 'Stablecoin / Algorithmic Stablecoin',
        labelKey: 'cat_stablecoin',
        label: 'Stablecoin / Algorithmic Stablecoin',
      },
      {
        value: 'Payments & Remittance',
        labelKey: 'cat_payments',
        label: 'Payments & Remittance',
      },
      {
        value: 'Merchant Gateway / Fiat On-Off Ramp',
        labelKey: 'cat_onramp',
        label: 'Merchant Gateway / Fiat On-Off Ramp',
      },
      {
        value: 'Crypto Card / Neobank',
        labelKey: 'cat_crypto_card',
        label: 'Crypto Card / Neobank',
      },
      {
        value: 'Real World Assets (RWA)',
        labelKey: 'cat_rwa',
        label: 'Real World Assets (RWA)',
      },
      {
        value: 'Tokenized Treasuries / Bonds & Sukuk',
        labelKey: 'cat_tokenized_bonds',
        label: 'Tokenized Treasuries / Bonds & Sukuk',
      },
      {
        value: 'Tokenized Real Estate',
        labelKey: 'cat_tokenized_realestate',
        label: 'Tokenized Real Estate',
      },
      {
        value: 'Tokenized Equity / Securities',
        labelKey: 'cat_tokenized_equity',
        label: 'Tokenized Equity / Securities',
      },
      {
        value: 'Tokenized Commodities / Gold-Backed',
        labelKey: 'cat_commodities',
        label: 'Tokenized Commodities / Gold-Backed',
      },
      {
        value: 'Asset Management / Index & Fund',
        labelKey: 'cat_asset_mgmt',
        label: 'Asset Management / Index & Fund',
      },
    ],
  },
  {
    id: 'infrastructure',
    labelKey: 'catgrp_infra',
    label: 'Infrastructure & Tooling',
    options: [
      {
        value: 'Layer 1 / Layer 2 Blockchain',
        labelKey: 'cat_l1_l2',
        label: 'Layer 1 / Layer 2 Blockchain',
      },
      {
        value: 'Bitcoin Layer 2 / Sidechain',
        labelKey: 'cat_bitcoin_l2',
        label: 'Bitcoin Layer 2 / Sidechain',
      },
      {
        value: 'Appchain / Rollup-as-a-Service',
        labelKey: 'cat_appchain',
        label: 'Appchain / Rollup-as-a-Service',
      },
      {
        value: 'Data Availability / Modular Blockchain',
        labelKey: 'cat_data_availability',
        label: 'Data Availability / Modular Blockchain',
      },
      {
        value: 'Bridge / Cross-Chain Interoperability',
        labelKey: 'cat_bridge',
        label: 'Bridge / Cross-Chain Interoperability',
      },
      {
        value: 'Oracle / Data Infrastructure',
        labelKey: 'cat_oracle',
        label: 'Oracle / Data Infrastructure',
      },
      {
        value: 'Analytics / Indexing & Data Marketplace',
        labelKey: 'cat_analytics',
        label: 'Analytics / Indexing & Data Marketplace',
      },
      {
        value: 'RPC / Node Infrastructure',
        labelKey: 'cat_node_infra',
        label: 'RPC / Node Infrastructure',
      },
      {
        value: 'MEV / Block Building Infrastructure',
        labelKey: 'cat_mev',
        label: 'MEV / Block Building Infrastructure',
      },
      {
        value: 'Wallet / Custody Solution',
        labelKey: 'cat_wallet',
        label: 'Wallet / Custody Solution',
      },
      {
        value: 'Account Abstraction / Smart Accounts',
        labelKey: 'cat_account_abstraction',
        label: 'Account Abstraction / Smart Accounts',
      },
      {
        value: 'Identity / KYC & Reputation',
        labelKey: 'cat_identity',
        label: 'Identity / KYC & Reputation',
      },
      {
        value: 'Security / Audit & Monitoring Platform',
        labelKey: 'cat_security',
        label: 'Security / Audit & Monitoring Platform',
      },
      {
        value: 'Decentralized Storage / CDN',
        labelKey: 'cat_storage',
        label: 'Decentralized Storage / CDN',
      },
      {
        value: 'Naming Service / Web3 Domains',
        labelKey: 'cat_naming',
        label: 'Naming Service / Web3 Domains',
      },
      {
        value: 'DePIN (Decentralized Physical Infrastructure)',
        labelKey: 'cat_depin',
        label: 'DePIN (Decentralized Physical Infrastructure)',
      },
      {
        value: 'Privacy / Mixer Protocol',
        labelKey: 'cat_privacy',
        label: 'Privacy / Mixer Protocol',
      },
      {
        value: 'AI / Compute Network',
        labelKey: 'cat_ai_compute',
        label: 'AI / Compute Network',
      },
    ],
  },
  {
    id: 'apps',
    labelKey: 'catgrp_apps',
    label: 'Apps, Gaming & Community',
    options: [
      {
        value: 'GameFi / Play-to-Earn',
        labelKey: 'cat_gamefi',
        label: 'GameFi / Play-to-Earn',
      },
      {
        value: 'Telegram Mini App / Tap-to-Earn Game',
        labelKey: 'cat_tg_mini_app',
        label: 'Telegram Mini App / Tap-to-Earn Game',
      },
      {
        value: 'Move-to-Earn / Learn-to-Earn',
        labelKey: 'cat_move_to_earn',
        label: 'Move-to-Earn / Learn-to-Earn',
      },
      {
        value: 'Gambling / Casino & Lottery',
        labelKey: 'cat_gambling',
        label: 'Gambling / Casino & Lottery',
      },
      {
        value: 'NFT / Digital Collectibles',
        labelKey: 'cat_nft',
        label: 'NFT / Digital Collectibles',
      },
      {
        value: 'NFT Marketplace / Trading Platform',
        labelKey: 'cat_nft_marketplace',
        label: 'NFT Marketplace / Trading Platform',
      },
      {
        value: 'NFT Lending / Fractionalization',
        labelKey: 'cat_nft_finance',
        label: 'NFT Lending / Fractionalization',
      },
      {
        value: 'Metaverse / Virtual Land',
        labelKey: 'cat_metaverse',
        label: 'Metaverse / Virtual Land',
      },
      {
        value: 'SocialFi / Creator Token',
        labelKey: 'cat_socialfi',
        label: 'SocialFi / Creator Token',
      },
      {
        value: 'Meme / Community Token',
        labelKey: 'cat_meme',
        label: 'Meme / Community Token',
      },
      {
        value: 'Fan Token / Sports & Fantasy',
        labelKey: 'cat_fan_token',
        label: 'Fan Token / Sports & Fantasy',
      },
      {
        value: 'Music / Media & IP Rights',
        labelKey: 'cat_media_ip',
        label: 'Music / Media & IP Rights',
      },
      {
        value: 'Token-Gated Membership / Loyalty & Rewards',
        labelKey: 'cat_loyalty',
        label: 'Token-Gated Membership / Loyalty & Rewards',
      },
      {
        value: 'Airdrop / Points & Incentive Programme',
        labelKey: 'cat_airdrop',
        label: 'Airdrop / Points & Incentive Programme',
      },
      {
        value: 'DAO / Governance Protocol',
        labelKey: 'cat_dao',
        label: 'DAO / Governance Protocol',
      },
      {
        value: 'Crowdfunding / ICO & Fundraising',
        labelKey: 'cat_crypto_crowdfunding',
        label: 'Crowdfunding / ICO & Fundraising',
      },
      {
        value: 'Public Goods / Grants Funding',
        labelKey: 'cat_public_goods',
        label: 'Public Goods / Grants Funding',
      },
      {
        value: 'Charity / Zakat & Waqf Protocol',
        labelKey: 'cat_crypto_charity',
        label: 'Charity / Zakat & Waqf Protocol',
      },
      {
        value: 'ReFi / Carbon Credits & Sustainability',
        labelKey: 'cat_refi',
        label: 'ReFi / Carbon Credits & Sustainability',
      },
      {
        value: 'Mining / Cloud Mining',
        labelKey: 'cat_mining',
        label: 'Mining / Cloud Mining',
      },
    ],
  },
  {
    id: 'other',
    labelKey: 'catgrp_other',
    label: 'Other',
    options: [
      {
        value: 'Other / Hybrid Protocol',
        labelKey: 'cat_other_crypto',
        label: 'Other / Hybrid Protocol',
      },
    ],
  },
];

export const ECOMMERCE_CATEGORY_GROUPS = [
  {
    id: 'marketplaces',
    labelKey: 'bizgrp_marketplace',
    label: 'Marketplaces & Platforms',
    options: [
      {
        value: 'Freelance Marketplace (Samsar / Brokerage)',
        labelKey: 'cat_freelance',
        label: 'Freelance Marketplace (Samsar / Brokerage)',
      },
      {
        value: 'Multi-Vendor E-Commerce Marketplace',
        labelKey: 'biz_multivendor',
        label: 'Multi-Vendor E-Commerce Marketplace',
      },
      {
        value: 'Managed Marketplace / Merchant of Record',
        labelKey: 'biz_managed_marketplace',
        label: 'Managed Marketplace / Merchant of Record',
      },
      {
        value: 'Gig / On-Demand Services (Delivery, Rides)',
        labelKey: 'biz_gig',
        label: 'Gig / On-Demand Services (Delivery, Rides)',
      },
      {
        value: 'Food Delivery / Quick Commerce',
        labelKey: 'biz_food_delivery',
        label: 'Food Delivery / Quick Commerce',
      },
      {
        value: 'Booking & Rental Platform (Ijarah)',
        labelKey: 'biz_booking',
        label: 'Booking & Rental Platform (Ijarah)',
      },
      {
        value: 'Ticketing & Events Platform',
        labelKey: 'biz_ticketing',
        label: 'Ticketing & Events Platform',
      },
      {
        value: 'Real Estate Marketplace / PropTech',
        labelKey: 'biz_real_estate',
        label: 'Real Estate Marketplace / PropTech',
      },
      {
        value: 'Recruitment / Talent & Staffing',
        labelKey: 'biz_recruitment',
        label: 'Recruitment / Talent & Staffing',
      },
      {
        value: 'Peer-to-Peer Resale / Classifieds',
        labelKey: 'biz_p2p_resale',
        label: 'Peer-to-Peer Resale / Classifieds',
      },
      {
        value: 'Auction / Bidding Marketplace',
        labelKey: 'biz_auction',
        label: 'Auction / Bidding Marketplace',
      },
      {
        value: 'Lead Generation / Comparison Platform',
        labelKey: 'biz_lead_gen',
        label: 'Lead Generation / Comparison Platform',
      },
    ],
  },
  {
    id: 'retail',
    labelKey: 'bizgrp_retail',
    label: 'Retail & Commerce',
    options: [
      {
        value: 'Commission-Based E-Commerce',
        labelKey: 'cat_ecommerce',
        label: 'Commission-Based E-Commerce',
      },
      {
        value: 'Direct-to-Consumer Retail / Online Store',
        labelKey: 'biz_dtc',
        label: 'Direct-to-Consumer Retail / Online Store',
      },
      {
        value: 'Dropshipping / Print-on-Demand',
        labelKey: 'biz_dropshipping',
        label: 'Dropshipping / Print-on-Demand',
      },
      {
        value: 'Reseller / White-Label Commerce',
        labelKey: 'biz_reseller',
        label: 'Reseller / White-Label Commerce',
      },
      {
        value: 'Preorder / Made-to-Order (Salam & Istisna)',
        labelKey: 'biz_preorder',
        label: 'Preorder / Made-to-Order (Salam & Istisna)',
      },
      {
        value: 'Social Commerce / Live Selling',
        labelKey: 'biz_social_commerce',
        label: 'Social Commerce / Live Selling',
      },
      {
        value: 'Omnichannel Retail (Online & Physical)',
        labelKey: 'biz_omnichannel',
        label: 'Omnichannel Retail (Online & Physical)',
      },
      {
        value: 'Wholesale / B2B Distribution',
        labelKey: 'biz_wholesale',
        label: 'Wholesale / B2B Distribution',
      },
      {
        value: 'Digital Goods / Service Platform',
        labelKey: 'cat_digital_goods',
        label: 'Digital Goods / Service Platform',
      },
    ],
  },
  {
    id: 'recurring',
    labelKey: 'bizgrp_recurring',
    label: 'Recurring & Usage Models',
    options: [
      {
        value: 'Subscription Model (Ijarah)',
        labelKey: 'cat_subscription',
        label: 'Subscription Model (Ijarah)',
      },
      {
        value: 'SaaS / Software Licensing',
        labelKey: 'biz_saas',
        label: 'SaaS / Software Licensing',
      },
      {
        value: 'Media / Streaming Subscription',
        labelKey: 'biz_streaming',
        label: 'Media / Streaming Subscription',
      },
      {
        value: 'Consumables / Replenishment Subscription',
        labelKey: 'biz_replenishment',
        label: 'Consumables / Replenishment Subscription',
      },
      {
        value: 'Rental / Product-as-a-Service (Ijarah)',
        labelKey: 'biz_paas_rental',
        label: 'Rental / Product-as-a-Service (Ijarah)',
      },
      {
        value: 'Membership / Creator Platform',
        labelKey: 'biz_membership',
        label: 'Membership / Creator Platform',
      },
      {
        value: 'Usage-Based / Pay-As-You-Go',
        labelKey: 'biz_usage_based',
        label: 'Usage-Based / Pay-As-You-Go',
      },
      {
        value: 'Freemium / In-App Purchases',
        labelKey: 'biz_freemium',
        label: 'Freemium / In-App Purchases',
      },
    ],
  },
  {
    id: 'monetization',
    labelKey: 'bizgrp_monetization',
    label: 'Monetization & Growth',
    options: [
      {
        value: 'Advertising & Sponsorship',
        labelKey: 'biz_advertising',
        label: 'Advertising & Sponsorship',
      },
      {
        value: 'Affiliate / Referral Marketing',
        labelKey: 'biz_affiliate',
        label: 'Affiliate / Referral Marketing',
      },
      {
        value: 'Listing Fees / Paid Placement',
        labelKey: 'biz_listing_fees',
        label: 'Listing Fees / Paid Placement',
      },
      {
        value: 'Data / API Monetization',
        labelKey: 'biz_data_api',
        label: 'Data / API Monetization',
      },
      {
        value: 'Tips / Donations & Patronage',
        labelKey: 'biz_tips',
        label: 'Tips / Donations & Patronage',
      },
      {
        value: 'Loyalty & Rewards Programme',
        labelKey: 'biz_loyalty',
        label: 'Loyalty & Rewards Programme',
      },
      {
        value: 'Revenue Share / Profit Share Partnership',
        labelKey: 'biz_revshare',
        label: 'Revenue Share / Profit Share Partnership',
      },
      {
        value: 'Licensing / Franchise Model',
        labelKey: 'biz_franchise',
        label: 'Licensing / Franchise Model',
      },
      {
        value: 'Multi-Level / Network Marketing (MLM)',
        labelKey: 'biz_mlm',
        label: 'Multi-Level / Network Marketing (MLM)',
      },
    ],
  },
  {
    id: 'finance',
    labelKey: 'bizgrp_finance',
    label: 'Financial & Funding',
    options: [
      {
        value: 'Fintech / Payment Processing',
        labelKey: 'biz_fintech',
        label: 'Fintech / Payment Processing',
      },
      {
        value: 'Remittance / Foreign Exchange',
        labelKey: 'biz_remittance',
        label: 'Remittance / Foreign Exchange',
      },
      {
        value: 'Buy Now Pay Later / Instalment Sales',
        labelKey: 'biz_bnpl',
        label: 'Buy Now Pay Later / Instalment Sales',
      },
      {
        value: 'Lending / Credit Marketplace',
        labelKey: 'biz_lending',
        label: 'Lending / Credit Marketplace',
      },
      {
        value: 'Factoring / Invoice Financing',
        labelKey: 'biz_factoring',
        label: 'Factoring / Invoice Financing',
      },
      {
        value: 'Savings / Rotating Savings (ROSCA)',
        labelKey: 'biz_savings',
        label: 'Savings / Rotating Savings (ROSCA)',
      },
      {
        value: 'Crowdfunding / P2P Funding',
        labelKey: 'biz_crowdfunding',
        label: 'Crowdfunding / P2P Funding',
      },
      {
        value: 'Insurance / Takaful Provider',
        labelKey: 'biz_insurance',
        label: 'Insurance / Takaful Provider',
      },
      {
        value: 'Investment / Wealth Platform',
        labelKey: 'biz_investment',
        label: 'Investment / Wealth Platform',
      },
      {
        value: 'Trading / Brokerage Platform (Stocks, Forex)',
        labelKey: 'biz_brokerage',
        label: 'Trading / Brokerage Platform (Stocks, Forex)',
      },
    ],
  },
  {
    id: 'services',
    labelKey: 'bizgrp_services',
    label: 'Services & Content',
    options: [
      {
        value: 'Agency / Professional Services',
        labelKey: 'biz_agency',
        label: 'Agency / Professional Services',
      },
      {
        value: 'Legal / Accounting & Compliance Services',
        labelKey: 'biz_legal',
        label: 'Legal / Accounting & Compliance Services',
      },
      {
        value: 'Education / Online Courses & Coaching',
        labelKey: 'biz_education',
        label: 'Education / Online Courses & Coaching',
      },
      {
        value: 'Media / Publishing & News',
        labelKey: 'biz_media',
        label: 'Media / Publishing & News',
      },
      {
        value: 'Healthcare / Wellness Platform',
        labelKey: 'biz_healthcare',
        label: 'Healthcare / Wellness Platform',
      },
      {
        value: 'Travel & Hospitality',
        labelKey: 'biz_travel',
        label: 'Travel & Hospitality',
      },
      {
        value: 'Gaming / Esports Platform',
        labelKey: 'biz_gaming',
        label: 'Gaming / Esports Platform',
      },
      {
        value: 'Betting / Gambling Operator',
        labelKey: 'biz_betting',
        label: 'Betting / Gambling Operator',
      },
      {
        value: 'Logistics & Supply Chain',
        labelKey: 'biz_logistics',
        label: 'Logistics & Supply Chain',
      },
      {
        value: 'Agriculture / Food Supply Chain',
        labelKey: 'biz_agriculture',
        label: 'Agriculture / Food Supply Chain',
      },
      {
        value: 'Manufacturing / Production',
        labelKey: 'biz_manufacturing',
        label: 'Manufacturing / Production',
      },
      {
        value: 'Telecommunications / Utilities',
        labelKey: 'biz_telecom',
        label: 'Telecommunications / Utilities',
      },
    ],
  },
  {
    id: 'other',
    labelKey: 'bizgrp_other',
    label: 'Other',
    options: [
      {
        value: 'Nonprofit / Donation-Funded',
        labelKey: 'biz_nonprofit',
        label: 'Nonprofit / Donation-Funded',
      },
      {
        value: 'Charity / Zakat & Waqf Platform',
        labelKey: 'biz_charity',
        label: 'Charity / Zakat & Waqf Platform',
      },
      {
        value: 'Cooperative / Mutual Model',
        labelKey: 'biz_cooperative',
        label: 'Cooperative / Mutual Model',
      },
      {
        value: 'Other / Hybrid Model',
        labelKey: 'biz_other',
        label: 'Other / Hybrid Model',
      },
    ],
  },
];

export const DEFAULT_CRYPTO_CATEGORY = 'DEX / Automated Market Maker';
export const DEFAULT_ECOMMERCE_CATEGORY =
  'Freelance Marketplace (Samsar / Brokerage)';

/** Returns the grouped options for an audit mode. */
export function categoryGroupsForMode(mode) {
  return mode === 'crypto' ? CRYPTO_CATEGORY_GROUPS : ECOMMERCE_CATEGORY_GROUPS;
}

/** Returns the pre-selected option for an audit mode. */
export function defaultCategoryForMode(mode) {
  return mode === 'crypto' ? DEFAULT_CRYPTO_CATEGORY : DEFAULT_ECOMMERCE_CATEGORY;
}

/**
 * True when a value is present in the given groups.
 *
 * A re-run of an older audit can carry a category that has since been renamed
 * or that belongs to the other mode. The caller keeps such a value selectable
 * instead of silently swapping the user's saved input for the default.
 */
export function isKnownCategory(groups, value) {
  return groups.some((group) =>
    group.options.some((option) => option.value === value),
  );
}

/**
 * Narrows the grouped options to those matching a free-text query.
 *
 * Both the localized label and the underlying English value are searched, so
 * an Arabic or French user can still find an option by typing the term they
 * know it by (for example "DEX" or "MLM"). Groups that end up empty are
 * dropped so the select never renders a heading with nothing under it.
 *
 * @param {Array} groups     Groups from `categoryGroupsForMode`.
 * @param {string} query     Raw text typed by the user.
 * @param {Function} labelFor Maps an option to its displayed label.
 */
export function filterCategoryGroups(groups, query, labelFor) {
  const needle = (query || '').trim().toLowerCase();
  if (!needle) return groups;

  // Multi-word queries match on every term, in any order ("token gold" finds
  // "Tokenized Commodities / Gold-Backed").
  const terms = needle.split(/\s+/);
  const matches = (option) => {
    const haystack = `${labelFor(option)} ${option.value}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  };

  return groups
    .map((group) => ({ ...group, options: group.options.filter(matches) }))
    .filter((group) => group.options.length > 0);
}
