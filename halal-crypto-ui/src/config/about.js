/**
 * Public-facing "About" content: platform identity, founder profile and the
 * research contact address.
 *
 * These values are centralised here (rather than inlined in the view) because
 * several of them appear in more than one place — the research email is used by
 * both the About page and the sidebar's Contact Research Team action, and the
 * brand tagline is shared with the navbar. Editing a link or an address should
 * be a one-line change in a single file.
 *
 * Nothing here is a secret. These are published contact details and profile
 * links, so they belong in source rather than in environment variables.
 */

export const BRAND = {
  name: 'Mizaan AI',
  tagline: 'AI-Powered Ethical Audit Platform',
};

/** Address used for all inbound research and bug-report traffic. */
export const RESEARCH_EMAIL = 'support@mizaanai.co';

/** Pre-filled subject/body for the Contact Research Team mail draft. */
export const RESEARCH_SUBJECT = 'Mizaan AI Feedback';
export const RESEARCH_BODY = 'Please describe your issue or suggestion.';

/**
 * Builds the mailto: URL for the research team.
 *
 * Subject and body are percent-encoded via encodeURIComponent so that spaces
 * and punctuation survive the handoff to the OS mail client. Without encoding,
 * the body would be truncated at the first special character.
 */
export function researchMailto() {
  const subject = encodeURIComponent(RESEARCH_SUBJECT);
  const body = encodeURIComponent(RESEARCH_BODY);
  return `mailto:${RESEARCH_EMAIL}?subject=${subject}&body=${body}`;
}

/**
 * The topics we invite through the research channel.
 *
 * Each entry pairs a translation key with the English source string. The view
 * passes both to `t()`, so the English text doubles as the i18n fallback and a
 * missing translation degrades to readable copy rather than a raw key.
 */
export const RESEARCH_TOPICS = [
  { key: 'topic_bug_reports', label: 'Bug reports' },
  { key: 'topic_feature_requests', label: 'Feature requests' },
  { key: 'topic_research_feedback', label: 'Research feedback' },
  { key: 'topic_false_positives', label: 'False positives' },
  { key: 'topic_security_concerns', label: 'Security concerns' },
  { key: 'topic_suggestions', label: 'Suggestions' },
];


/**
 * Founder profile.
 *
 * Every value here was supplied directly by the founder. Nothing is inferred,
 * expanded or embellished — no title beyond "Founder", and no achievements,
 * credentials, education or employment history. Keep it that way: this page
 * carries credibility weight, and an invented detail costs more than a missing
 * one.
 */
export const FOUNDER = {
  name: 'Bashiru Mustapha',
  role: 'Founder',
  photo: '/founder.jpeg',
  bio: 'I am a technology-focused developer and data analyst with experience in web application development, data analysis, AI solutions, and emerging Web3 technologies. I build practical digital products that combine technology, analytical thinking, and ethical considerations. Mizaan AI is one of my projects, created to explore how AI can support more transparent and responsible digital auditing.',
  // Translation keys paired with the founder's own wording as the fallback.
  bioKey: 'about_founder_bio',
  roleKey: 'about_founder_role',
  expertise: [
    { key: 'expertise_web_development', label: 'Web Development' },
    { key: 'expertise_data_analysis', label: 'Data Analysis & Data Science' },
    { key: 'expertise_ai_prompt', label: 'AI & Prompt Engineering' },
    {
      key: 'expertise_backend',
      label: 'Backend & Application Development',
    },
    { key: 'expertise_web3', label: 'Web3 & Blockchain' },
  ],

  links: [
    {
      label: 'GitHub',
      href: 'https://github.com/mustapha-bashiru',
      icon: 'github',
    },
    {
      label: 'LinkedIn',
      href: 'https://linkedin.com/in/bashiru-mustapha-768415307',
      icon: 'linkedin',
    },
    {
      label: 'Upwork',
      href: 'https://www.upwork.com/freelancers/~01ddfa952f4a7feb6f',
      icon: 'upwork',
    },
    {
      // The founder's personal address, deliberately distinct from
      // RESEARCH_EMAIL: this link reaches the person, the research channel
      // reaches the project.
      label: 'Email',
      href: 'mailto:mustaphabashiru442@gmail.com',
      icon: 'email',
    },
  ],
};

/**
 * The "why this exists" narrative, as translation keys with English fallbacks.
 */
export const VISION = [
  {
    titleKey: 'about_vision_problem_title',
    title: 'The problem',
    bodyKey: 'about_vision_problem_body',
    body: 'Anyone trying to judge whether a crypto protocol or digital asset is ethically sound faces the same wall: the analysis is scarce, inconsistent between reviewers, and usually expensive. Most people end up guessing, or trusting a claim they cannot verify.',
  },
  {
    titleKey: 'about_vision_approach_title',
    title: 'The approach',
    bodyKey: 'about_vision_approach_body',
    body: 'Mizaan AI runs a structured assessment across defined ethical and Shariah compliance categories, then reports a risk score alongside the reasoning and references behind it. The output is auditable — you can see why a verdict was reached, not just what it was.',
  },
  {
    titleKey: 'about_vision_vision_title',
    title: 'The vision',
    bodyKey: 'about_vision_vision_body',
    body: 'Ethical auditing should be infrastructure, not a luxury service. Mizaan AI is free, transparent about its limitations, and built so that a reader can check the work rather than take it on faith. AI does the analysis at scale; the reasoning stays open to scrutiny.',
  },
];

/** Byline for the foot of the About page. */
export const FOUNDER_ATTRIBUTION_KEY = 'about_built_by';
export const FOUNDER_ATTRIBUTION = `Built by ${FOUNDER.name}`;


