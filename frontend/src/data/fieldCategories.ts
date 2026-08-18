// Broad study-area categories for the 2,498-entry CIP field list.
// Users shouldn't face a flat wall of 2,498 options — the picker
// (components/form/FieldOfStudyPicker) lets them narrow by category
// first, then search within it.
//
// Classification is keyword-based (heuristic). It's intentionally
// coarse: bucket membership only pre-filters the option list, and
// every field is still reachable via the "All" tab or search.

import { FIELDS_OF_STUDY, type FieldOfStudy } from './fieldsOfStudy';

export interface FieldCategory {
  id: string;
  label: string;
}

export const FIELD_CATEGORIES: FieldCategory[] = [
  { id: 'computer-it', label: 'Computer & IT' },
  { id: 'engineering', label: 'Engineering & Trades' },
  { id: 'business', label: 'Business & Economics' },
  { id: 'health', label: 'Health & Medicine' },
  { id: 'science', label: 'Natural Sciences' },
  { id: 'social', label: 'Social Sciences' },
  { id: 'law', label: 'Law & Legal' },
  { id: 'education', label: 'Education & Teaching' },
  { id: 'arts', label: 'Arts, Design & Media' },
  { id: 'agriculture', label: 'Agriculture & Environment' },
  { id: 'other', label: 'Other' },
];

// First matching category wins — rule order matters (specific before broad).
const RULES: { cat: string; keys: string[] }[] = [
  {
    cat: 'computer-it',
    keys: [
      'computer', 'software', 'information technology', 'information systems',
      'information science', 'information resources', 'informatics', 'artificial intelligence',
      'machine learning', 'cyber', 'programming', 'cloud computing', 'blockchain',
      'computational', 'networking', 'web development', 'web page', 'database', 'video game',
      'data science', 'data processing', 'data entry', 'data analytics', 'data modeling',
      'human computer', 'systems analysis', 'telecommunications', 'information processing',
      'computer science', 'coding', 'system administration', 'network',
    ],
  },
  {
    cat: 'engineering',
    keys: [
      'engineering', 'engineer', 'drafting', 'cad/', 'robotics', 'mechatronics', 'manufacturing',
      'construction', 'architect', 'electrical', 'mechanical', 'civil', 'chemical engineering',
      'chemical technology', 'aerospace', 'aeronautic', 'astronautical', 'aviation', 'avionics',
      'automotive', 'machinist', 'machining', 'welding', 'carpentry', 'plumbing', 'electrician',
      'masonry', 'roofing', 'hvac', 'building maintenance', 'nuclear engineering', 'military technologies',
      'fire protection', 'surveying', 'transportation engineering', 'engineering technology',
      'aircraft', 'airline', 'airframe', 'air traffic', 'air transportation', 'airpower',
      'air science', 'pilot', 'flight attendant', 'flight crew', 'autobody', 'bicycle',
      'appliance installation', 'blasting', 'boilermaking', 'cabinetmaking', 'carpet',
      'concrete', 'drywall', 'sheet metal', 'ironwork', 'millwright', 'machine tool',
      'tool and die', 'industrial machinery', 'stationary', 'pipeline', 'pipelayer',
      'water well', 'infrastructure', 'operating engineer', 'drilling', 'heavy equipment',
      'power plant', 'energy', 'renewable energy', 'solar', 'wind energy', 'mining',
      'petroleum', 'oil', 'gas', 'geothermal', 'turbine', 'engines', 'diesel',
      'air & space', 'alternative fuel', 'vehicle',
    ],
  },
  {
    cat: 'business',
    keys: [
      'business', 'management', 'accounting', 'finance', 'marketing',
      'economics', 'economy', 'commerce', 'entrepreneur', 'logistics', 'insurance', 'banking',
      'hospitality', 'tourism', 'actuarial', 'human resources', 'supply chain',
      'operations research', 'taxation', 'tax', 'investment', 'securities', 'real estate',
      'merchandising', 'auditing', 'bookkeeping', 'trade', 'sales', 'retail',
      'procurement', 'e-commerce', 'consumer', 'fashion merchandising', 'business statistics',
      'administrative', 'advertising', 'auctioneering', 'casino', 'customer service',
      'call center', 'warehousing', 'wholesale', 'franchise', 'office',
    ],
  },
  {
    cat: 'health',
    keys: [
      'health', 'medic', 'medicine', 'nursing', 'pharmacy', 'pharmac', 'dental', 'dentistry',
      'clinical', 'therapy', 'therapist', 'epidemi', 'nutrition', 'anatomy', 'physiology',
      'pathology', 'psychiatr', 'surgery', 'surgical', 'pediatr', 'oncolog', 'cardio',
      'immunolog', 'hospital', 'patient', 'veterinary', 'biomedical', 'genetic counseling',
      'audiology', 'speech', 'occupational therapy', 'physical therapy', 'rehabilitation',
      'maternity', 'obstetric', 'gynec', 'emergency medicine', 'paramedic', 'radiology',
      'anesthes', 'phlebotomy', 'optometr', 'ophthalm', 'chiropract', 'acupuncture',
      'midwifery', 'medical laboratory', 'allied health', 'nurse', 'geriatric', 'mental health',
      'behavioral health', 'sports medicine', 'kinesiology', 'exercise science', 'healthcare',
      'aging', 'addiction', 'physician', 'residency', 'fellowship', 'neurology', 'dermat',
      'cyto', 'disease', 'vascular', 'gastro', 'endocrin', 'nephro', 'hemato', 'rheumato',
      'ortho', 'urology', 'psychosom', 'pulmon', 'diagnostic', 'sonography', 'mammography',
      'birthing', 'blood bank', 'hearing', 'vision', 'toxicology', 'virology', 'bacteriology',
      'athletic', 'cardiac', 'heart', 'vein', 'obesity', 'diet', 'wellness', 'smoking', 'substance',
    ],
  },
  {
    cat: 'science',
    keys: [
      'biology', 'biochemistry', 'biophysics', 'chemistry', 'physics', 'mathematics',
      'math', 'statistics', 'astronomy', 'astrophysics', 'geology', 'meteorology',
      'ecology', 'genetics', 'microbiology', 'neuroscience', 'zoology', 'botany',
      'marine science', 'oceanography', 'earth science', 'geoscience', 'materials science',
      'optics', 'acoustics', 'molecular', 'cellular', 'genomics', 'biostatistics',
      'food science', 'environmental science', 'atmospheric', 'space science', 'chemical',
      'physical sciences', 'natural sciences', 'scientific', 'climate', 'bioenergy',
      'biotechnology', 'biometry', 'cosmology', 'paleontology', 'crystallography',
      'metallurgy', 'entomology', 'algebra', 'geometry', 'calculus', 'topology',
      'trigonometry', 'number theory', 'discrete mathematics', 'arithmetic', 'astrobiology',
    ],
  },
  {
    cat: 'social',
    keys: [
      'psychology', 'sociology', 'anthropology', 'political science', 'government', 'history',
      'geography', 'philosophy', 'religion', 'theology', 'linguistics', 'literature',
      'language', 'communication', 'journalism', 'media studies', 'public policy',
      'public administration', 'international relations', 'criminology', 'social work',
      'archaeology', 'area studies', 'gender studies', 'cultural', 'urban studies',
      'demography', 'counseling', 'human development', 'family studies', 'peace studies',
      'conflict resolution', 'women', 'ethnic', 'african', 'asian studies', 'european studies',
      'middle eastern', 'latin american', 'native american', 'american studies', 'canadian studies',
      'slavic', 'baltic', 'citizenship', 'public affairs', 'community', 'military',
      'interpersonal', 'social sciences', 'humanities', 'bible', 'biblical', 'chaplain',
      'church', 'ministry', 'pastoral', 'missionary', 'catholic', 'christian', 'buddhist',
      'islamic', 'jewish', 'hindu', 'behavioral science', 'behavior', 'cognitive',
      'regional planning', 'deaf', 'disability', 'ethics', 'command & control', 'c4i',
      'anthrozoology', 'archeology',
    ],
  },
  {
    cat: 'law',
    keys: [
      'law', 'legal', 'jurisprudence', 'paralegal', 'attorney', 'litigation', 'criminal',
      'criminology', 'forensic', 'compliance', 'court', 'corrections', 'police',
      'law enforcement', 'justice', 'investigation',
    ],
  },
  {
    cat: 'education',
    keys: [
      'education', 'teaching', 'teacher', 'curriculum', 'instruction', 'pedagogy', 'school',
      'student', 'literacy', 'library', 'educational', 'early childhood', 'higher education',
      'special education', 'bilingual', 'tutoring', 'vocational', 'career', 'home schooling',
      'child care', 'child development', 'parenting', 'college', 'postsecondary', 'academic',
      'remedial', 'basic skills', 'developmental', 'iep', 'transition', 'counseling program',
      'archive', 'archival',
    ],
  },
  {
    cat: 'arts',
    keys: [
      'art', 'design', 'music', 'dance', 'theatre', 'theater', 'film', 'cinema', 'photography',
      'creative writing', 'visual', 'performing', 'performance', 'fashion', 'interior', 'animation',
      'broadcast', 'media', 'drama', 'textile', 'crafts', 'painting', 'sculpture', 'ceramic',
      'jewelry', 'illustration', 'graphic', 'game design', 'multimedia', 'digital arts',
      'commercial art', 'fine arts', 'apparel', 'cosmetology', 'culinary', 'baking', 'floral',
      'acting', 'ballet', 'instrument', 'conducting', 'comedy', 'esthetician', 'barber',
      'bartending', 'cooking', 'brewing', 'salon', 'nail technician', 'tattoo', 'video',
      'fashion design', 'interior design', 'industrial design', 'wearable', 'gaming',
    ],
  },
  {
    cat: 'agriculture',
    keys: [
      'agricultur', 'agri', 'horticulture', 'animal sciences', 'crop', 'soil science',
      'forestry', 'environmental studies', 'food processing', 'aquaculture', 'fisheries',
      'fishing', 'poultry', 'livestock', 'animal husbandry', 'plant science', 'agronomy', 'ranch',
      'farm', 'equine', 'natural resources', 'conservation', 'wildlife', 'sustainability',
      'climate change', 'environmental', 'beekeeping', 'dairy', 'apiculture', 'viticulture',
      'landscaping', 'lawn', 'pest', 'botanical', 'organic agriculture', 'animal training',
    ],
  },
];

const compiled = RULES.map(r => ({
  cat: r.cat,
  re: new RegExp(`(^|[^a-z])(${r.keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'i'),
}));

// Exact-label overrides — checked BEFORE keyword rules for cases where a
// generic keyword (e.g. 'history') would otherwise win over the true bucket.
const EXACT_OVERRIDES: Record<string, string> = {
  'art history': 'arts',
  'art history, criticism & conservation': 'arts',
  'art history, criticism & conservation, other': 'arts',
  'music history, literature, and theory': 'arts',
  'music history, literature and theory': 'arts',
  'dance history, theory, and criticism': 'arts',
  'theatre history, literature, and criticism': 'arts',
  'theater history, literature, and criticism': 'arts',
  'film history, theory, and criticism': 'arts',
  'photography: history, theory, and criticism': 'arts',
  'architectural history & criticism, general': 'arts',
  'architectural history, criticism, & conservation': 'arts',
  'architectural history, criticism, & conservation, other': 'arts',
  'history of philosophy': 'social',
  'history of science and technology': 'science',
  'history of science, technology, and society': 'social',
  'history and philosophy of science and technology': 'science',
};

export function categorizeField(name: string): string {
  const key = name.toLowerCase().trim();
  const override = EXACT_OVERRIDES[key];
  if (override) return override;
  const lower = ` ${key} `;
  for (const { cat, re } of compiled) {
    if (re.test(lower)) return cat;
  }
  return 'other';
}

export interface CategorizedField extends FieldOfStudy {
  category: string;
}

/** Full list with category tags — computed once at module load. */
export const CATEGORIZED_FIELDS: CategorizedField[] = FIELDS_OF_STUDY.map(f => ({
  ...f,
  category: categorizeField(f.value),
}));

export const FIELD_COUNTS: Record<string, number> = CATEGORIZED_FIELDS.reduce((acc, f) => {
  acc[f.category] = (acc[f.category] || 0) + 1;
  return acc;
}, {} as Record<string, number>);

/** Options for a category (+ optional search query), capped for render perf. */
export function getFieldOptions(category: string, query = '', limit = 60): CategorizedField[] {
  const q = query.toLowerCase().trim();
  const pool = category === 'all' ? CATEGORIZED_FIELDS : CATEGORIZED_FIELDS.filter(f => f.category === category);
  if (!q) return pool.slice(0, limit);
  return pool.filter(f => f.label.toLowerCase().includes(q)).slice(0, limit);
}

/** Label for a category id (undefined for 'all'). */
export function categoryLabel(id: string): string {
  return FIELD_CATEGORIES.find(c => c.id === id)?.label ?? id;
}