// Scholarship category definitions for SEO pages.
// Each entry maps a URL slug to API filter params and page metadata.

export interface CategoryDefinition {
  slug: string;
  label: string;           // Human-readable label
  title: string;           // <title> tag
  description: string;     // meta description
  h1: string;              // Page heading
  intro: string;           // Intro paragraph
  params: Record<string, string>; // API query params
}

// ── Degree-level categories ────────────────────────────────────────
const DEGREE_CATEGORIES: CategoryDefinition[] = [
  {
    slug: 'undergraduate',
    label: 'Undergraduate',
    title: 'Undergraduate Scholarships — ScholarshipRight',
    description: 'Fully funded undergraduate and bachelor\'s degree scholarships for international students. Browse and filter by country, field, and funding type.',
    h1: 'Undergraduate Scholarships',
    intro: 'Bachelor\'s degree scholarships for international students. While most fully funded awards target graduate students, these undergraduate scholarships cover tuition, living expenses, and more.',
    params: { degree: 'bachelor' },
  },
  {
    slug: 'masters',
    label: "Master's",
    title: "Master's Scholarships — ScholarshipRight",
    description: 'Fully funded master\'s degree scholarships worldwide. DAAD, Chevening, Erasmus Mundus, and 100+ more. AI-matched to your profile.',
    h1: "Master's Scholarships",
    intro: 'The largest category of fully funded international scholarships. Master\'s awards cover tuition, stipend, flights, and health insurance across 18+ countries.',
    params: { degree: 'master' },
  },
  {
    slug: 'phd',
    label: 'PhD',
    title: 'PhD Scholarships — ScholarshipRight',
    description: 'Fully funded PhD and doctoral scholarships internationally. Research positions, stipends, and full tuition coverage.',
    h1: 'PhD Scholarships',
    intro: 'Doctoral and research scholarships with full funding. PhD awards typically include a monthly stipend, tuition waiver, and research support.',
    params: { degree: 'phd' },
  },
];

// ── Funding-type categories ────────────────────────────────────────
const FUNDING_CATEGORIES: CategoryDefinition[] = [
  {
    slug: 'fully-funded',
    label: 'Fully Funded',
    title: 'Fully Funded Scholarships — ScholarshipRight',
    description: '100+ fully funded scholarships covering tuition, living, flights, and insurance. Browse by country and degree level.',
    h1: 'Fully Funded Scholarships',
    intro: 'Scholarships that cover everything: tuition, monthly stipend, round-trip flights, and health insurance. No out-of-pocket costs.',
    params: { funding: 'fully_funded' },
  },
  {
    slug: 'no-ielts',
    label: 'No IELTS',
    title: 'Scholarships Without IELTS — ScholarshipRight',
    description: 'Fully funded scholarships that don\'t require IELTS. Many accept Duolingo, TOEFL, or waive English tests entirely.',
    h1: 'Scholarships Without IELTS',
    intro: 'Don\'t have IELTS? These scholarships accept alternative English tests (Duolingo, TOEFL, PTE, Cambridge) or waive the requirement entirely.',
    params: { no_ielts: 'true' },
  },
  {
    slug: 'no-application-fee',
    label: 'No Application Fee',
    title: 'Scholarships With No Application Fee — ScholarshipRight',
    description: 'Fully funded scholarships with zero application fees. Apply without spending a cent.',
    h1: 'Scholarships With No Application Fee',
    intro: 'These scholarships have no application fee — apply for free. Focus your time on the application, not the cost.',
    params: { no_fee: 'true' },
  },
];

// ── Country categories ─────────────────────────────────────────────
const COUNTRY_CATEGORIES: CategoryDefinition[] = [
  {
    slug: 'germany',
    label: 'Germany',
    title: 'Scholarships in Germany — ScholarshipRight',
    description: 'Fully funded scholarships in Germany. DAAD, Heinrich Böll, Konrad Adenauer, and more. Tuition-free + stipend.',
    h1: 'Scholarships in Germany',
    intro: 'Germany is one of the top destinations for fully funded study — most public universities charge zero tuition, and scholarships like DAAD cover living expenses.',
    params: { country: 'Germany' },
  },
  {
    slug: 'united-kingdom',
    label: 'United Kingdom',
    title: 'Scholarships in the UK — ScholarshipRight',
    description: 'Fully funded scholarships in the United Kingdom. Chevening, Commonwealth, Rhodes, Gates Cambridge, and more.',
    h1: 'Scholarships in the UK',
    intro: 'The UK offers some of the world\'s most prestigious scholarships: Chevening, Commonwealth, Rhodes, and Gates Cambridge — all fully funded.',
    params: { country: 'United Kingdom' },
  },
  {
    slug: 'united-states',
    label: 'United States',
    title: 'Scholarships in the USA — ScholarshipRight',
    description: 'Fully funded scholarships in the United States. Fulbright, Hubert Humphrey, and university-funded awards.',
    h1: 'Scholarships in the USA',
    intro: 'US scholarships range from government-funded (Fulbright) to university-specific awards. Most cover tuition, stipend, and health insurance.',
    params: { country: 'United States' },
  },
  {
    slug: 'japan',
    label: 'Japan',
    title: 'Scholarships in Japan — ScholarshipRight',
    description: 'Fully funded scholarships in Japan. MEXT (Japanese Government Scholarship) covers tuition, stipend, and flights.',
    h1: 'Scholarships in Japan',
    intro: 'Japan\'s MEXT scholarship is one of the most generous in the world — full tuition, monthly stipend, and round-trip flights. No Japanese language required for most programs.',
    params: { country: 'Japan' },
  },
  {
    slug: 'canada',
    label: 'Canada',
    title: 'Scholarships in Canada — ScholarshipRight',
    description: 'Fully funded scholarships in Canada. Vanier, Trudeau, university-funded awards, and more.',
    h1: 'Scholarships in Canada',
    intro: 'Canada offers strong scholarship programs for international students, with pathways to post-study work permits and permanent residency.',
    params: { country: 'Canada' },
  },
  {
    slug: 'south-korea',
    label: 'South Korea',
    title: 'Scholarships in South Korea — ScholarshipRight',
    description: 'Fully funded scholarships in South Korea. GKS (Korean Government Scholarship) covers tuition, stipend, flights, and language training.',
    h1: 'Scholarships in South Korea',
    intro: 'South Korea\'s GKS (Global Korea Scholarship) is fully funded with tuition, ₩1.6M/month stipend, round-trip flights, and a free Korean language course.',
    params: { country: 'South Korea' },
  },
  {
    slug: 'turkey',
    label: 'Turkey',
    title: 'Scholarships in Turkey — ScholarshipRight',
    description: 'Fully funded scholarships in Turkey. Türkiye Scholarships cover tuition, stipend, housing, and flights.',
    h1: 'Scholarships in Turkey',
    intro: 'Türkiye Scholarships is a government-funded program covering tuition, monthly stipend, accommodation, health insurance, and a one-year Turkish language course.',
    params: { country: 'Turkey' },
  },
  {
    slug: 'australia',
    label: 'Australia',
    title: 'Scholarships in Australia — ScholarshipRight',
    description: 'Fully funded scholarships in Australia. RTP, Australia Awards, and university-funded positions.',
    h1: 'Scholarships in Australia',
    intro: 'Australia\'s scholarships (RTP, Australia Awards) cover tuition and living costs, with strong post-study work rights.',
    params: { country: 'Australia' },
  },
];

// ── All categories ─────────────────────────────────────────────────
export const ALL_CATEGORIES: CategoryDefinition[] = [
  ...DEGREE_CATEGORIES,
  ...FUNDING_CATEGORIES,
  ...COUNTRY_CATEGORIES,
];

// Lookup by slug
export const CATEGORY_BY_SLUG = Object.fromEntries(
  ALL_CATEGORIES.map((c) => [c.slug, c])
) as Record<string, CategoryDefinition>;

// For generateStaticParams
export const ALL_CATEGORY_SLUGS = ALL_CATEGORIES.map((c) => c.slug);
