/**
 * Deliberately fictional business data for the first admin-dashboard pass.
 * Keeping it in one module makes the eventual API replacement straightforward.
 */

export type AdminPeriodKey = "30d" | "90d" | "12m";

export interface AdminPeriodSnapshot {
  label: string;
  visitors: number;
  signups: number;
  onboarded: number;
  trials: number;
  paid: number;
  bootcampBuyers: number;
  subscriptionRevenue: number;
  bootcampRevenue: number;
  trend: Array<{ label: string; subscriptions: number; bootcamps: number }>;
}

export const ADMIN_PERIODS: Record<AdminPeriodKey, AdminPeriodSnapshot> = {
  "30d": {
    label: "Last 30 days",
    visitors: 8_420,
    signups: 2_036,
    onboarded: 1_574,
    trials: 1_126,
    paid: 386,
    bootcampBuyers: 72,
    subscriptionRevenue: 1_486_320,
    bootcampRevenue: 936_928,
    trend: [
      { label: "W1", subscriptions: 286_000, bootcamps: 164_000 },
      { label: "W2", subscriptions: 332_000, bootcamps: 212_000 },
      { label: "W3", subscriptions: 398_000, bootcamps: 248_000 },
      { label: "W4", subscriptions: 470_320, bootcamps: 312_928 },
    ],
  },
  "90d": {
    label: "Last 90 days",
    visitors: 18_742,
    signups: 4_936,
    onboarded: 3_718,
    trials: 2_684,
    paid: 924,
    bootcampBuyers: 214,
    subscriptionRevenue: 4_568_740,
    bootcampRevenue: 2_741_786,
    trend: [
      { label: "Apr 21", subscriptions: 284_000, bootcamps: 118_000 },
      { label: "Apr 28", subscriptions: 301_000, bootcamps: 144_000 },
      { label: "May 05", subscriptions: 318_000, bootcamps: 172_000 },
      { label: "May 12", subscriptions: 326_000, bootcamps: 161_000 },
      { label: "May 19", subscriptions: 347_000, bootcamps: 184_000 },
      { label: "May 26", subscriptions: 365_000, bootcamps: 209_000 },
      { label: "Jun 02", subscriptions: 382_000, bootcamps: 218_000 },
      { label: "Jun 09", subscriptions: 397_000, bootcamps: 232_000 },
      { label: "Jun 16", subscriptions: 415_000, bootcamps: 258_000 },
      { label: "Jun 23", subscriptions: 438_000, bootcamps: 286_000 },
      { label: "Jun 30", subscriptions: 471_000, bootcamps: 274_000 },
      { label: "Jul 07", subscriptions: 524_740, bootcamps: 485_786 },
    ],
  },
  "12m": {
    label: "Last 12 months",
    visitors: 96_320,
    signups: 24_870,
    onboarded: 18_964,
    trials: 13_428,
    paid: 4_624,
    bootcampBuyers: 1_098,
    subscriptionRevenue: 22_846_400,
    bootcampRevenue: 13_806_902,
    trend: [
      { label: "Aug", subscriptions: 1_126_000, bootcamps: 624_000 },
      { label: "Sep", subscriptions: 1_248_000, bootcamps: 738_000 },
      { label: "Oct", subscriptions: 1_364_000, bootcamps: 804_000 },
      { label: "Nov", subscriptions: 1_526_000, bootcamps: 926_000 },
      { label: "Dec", subscriptions: 1_612_000, bootcamps: 868_000 },
      { label: "Jan", subscriptions: 1_748_000, bootcamps: 1_042_000 },
      { label: "Feb", subscriptions: 1_836_000, bootcamps: 1_104_000 },
      { label: "Mar", subscriptions: 1_924_000, bootcamps: 1_182_000 },
      { label: "Apr", subscriptions: 2_068_000, bootcamps: 1_276_000 },
      { label: "May", subscriptions: 2_184_000, bootcamps: 1_348_000 },
      { label: "Jun", subscriptions: 2_486_000, bootcamps: 1_624_000 },
      { label: "Jul", subscriptions: 3_724_400, bootcamps: 2_270_902 },
    ],
  },
};

export const ADMIN_PLAN_METRICS = [
  { plan: "Explorer", price: "Free", subscribers: 4_860, share: 76.4, conversion: 6.8, mrr: 0, change: 8.4 },
  { plan: "Pro", price: "₹1,499/mo", subscribers: 842, share: 13.2, conversion: 18.7, mrr: 1_262_158, change: 12.6 },
  { plan: "Career", price: "₹3,999/mo", subscribers: 286, share: 4.5, conversion: 31.4, mrr: 1_143_714, change: 17.2 },
  { plan: "Teams", price: "₹2,199/seat", subscribers: 376, share: 5.9, conversion: 24.8, mrr: 826_824, change: 9.1 },
] as const;

export const ADMIN_DOMAIN_INTERESTS = [
  { domain: "AI engineering", interested: 1_248, highIntent: 312, paid: 241, bootcamp: 78, conversion: 19.3, signal: "Agent course saves grew 28%" },
  { domain: "Product management", interested: 986, highIntent: 228, paid: 196, bootcamp: 61, conversion: 19.9, signal: "Interview practice drives upgrades" },
  { domain: "System design", interested: 814, highIntent: 206, paid: 178, bootcamp: 47, conversion: 21.9, signal: "Highest completion-to-purchase rate" },
  { domain: "Data engineering", interested: 621, highIntent: 142, paid: 112, bootcamp: 24, conversion: 18.0, signal: "Strong demand from Teams accounts" },
  { domain: "UX research", interested: 438, highIntent: 84, paid: 67, bootcamp: 4, conversion: 15.3, signal: "High interest, limited paid offer" },
  { domain: "Cybersecurity", interested: 372, highIntent: 96, paid: 51, bootcamp: 0, conversion: 13.7, signal: "96 users show unmet high intent" },
] as const;

export const ADMIN_BOOTCAMPS = [
  { name: "AI Agent Builder", domain: "AI engineering", buyers: 82, revenue: 1_229_918, conversion: 26.3, completion: 68.4, nextCohort: "Aug 12" },
  { name: "Product Leadership", domain: "Product management", buyers: 61, revenue: 731_939, conversion: 26.8, completion: 74.1, nextCohort: "Aug 19" },
  { name: "System Design Interview", domain: "System design", buyers: 47, revenue: 610_953, conversion: 22.8, completion: 71.6, nextCohort: "Aug 26" },
  { name: "Modern Data Engineering", domain: "Data engineering", buyers: 24, revenue: 335_976, conversion: 16.9, completion: 62.5, nextCohort: "Sep 02" },
] as const;

export type AdminUserStage = "Bootcamp buyer" | "Paid subscriber" | "Trial" | "Churn risk";

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  plan: "Explorer" | "Pro" | "Career" | "Teams";
  stage: AdminUserStage;
  domain: string;
  intent: number;
  source: string;
  joined: string;
  lastActive: string;
  progress: string;
  bootcamp?: string;
  spend: number;
}

export const ADMIN_USERS: AdminUserRow[] = [
  { id: "usr-2048", name: "Aarav Menon", email: "aarav.menon@example.com", plan: "Career", stage: "Bootcamp buyer", domain: "AI engineering", intent: 96, source: "YouTube", joined: "Jul 16", lastActive: "8 min ago", progress: "14 lessons", bootcamp: "AI Agent Builder", spend: 18_998 },
  { id: "usr-2047", name: "Meera Kulkarni", email: "meera.kulkarni@example.com", plan: "Pro", stage: "Paid subscriber", domain: "Product management", intent: 88, source: "Organic search", joined: "Jul 15", lastActive: "21 min ago", progress: "9 lessons", spend: 1_499 },
  { id: "usr-2046", name: "Rohan D'Souza", email: "rohan.dsouza@example.com", plan: "Teams", stage: "Bootcamp buyer", domain: "System design", intent: 93, source: "Company invite", joined: "Jul 14", lastActive: "1 hr ago", progress: "18 lessons", bootcamp: "System Design Interview", spend: 15_198 },
  { id: "usr-2045", name: "Nila Srinivasan", email: "nila.srinivasan@example.com", plan: "Explorer", stage: "Trial", domain: "Cybersecurity", intent: 91, source: "LinkedIn", joined: "Jul 14", lastActive: "2 hrs ago", progress: "6 lessons", spend: 0 },
  { id: "usr-2044", name: "Kabir Chawla", email: "kabir.chawla@example.com", plan: "Career", stage: "Bootcamp buyer", domain: "Product management", intent: 97, source: "Referral", joined: "Jul 13", lastActive: "3 hrs ago", progress: "22 lessons", bootcamp: "Product Leadership", spend: 15_998 },
  { id: "usr-2043", name: "Sana Qureshi", email: "sana.qureshi@example.com", plan: "Pro", stage: "Churn risk", domain: "Data engineering", intent: 42, source: "Organic search", joined: "Jun 28", lastActive: "12 days ago", progress: "3 lessons", spend: 2_998 },
  { id: "usr-2042", name: "Devika Iyer", email: "devika.iyer@example.com", plan: "Pro", stage: "Paid subscriber", domain: "UX research", intent: 79, source: "Community", joined: "Jul 11", lastActive: "Yesterday", progress: "11 lessons", spend: 1_499 },
  { id: "usr-2041", name: "Arjun Bhat", email: "arjun.bhat@example.com", plan: "Explorer", stage: "Trial", domain: "AI engineering", intent: 86, source: "GitHub", joined: "Jul 10", lastActive: "Yesterday", progress: "7 lessons", spend: 0 },
  { id: "usr-2040", name: "Tara Banerjee", email: "tara.banerjee@example.com", plan: "Teams", stage: "Paid subscriber", domain: "Data engineering", intent: 82, source: "Company invite", joined: "Jul 09", lastActive: "Yesterday", progress: "13 lessons", spend: 4_398 },
  { id: "usr-2039", name: "Ishaan Roy", email: "ishaan.roy@example.com", plan: "Career", stage: "Bootcamp buyer", domain: "AI engineering", intent: 94, source: "Webinar", joined: "Jul 08", lastActive: "2 days ago", progress: "19 lessons", bootcamp: "AI Agent Builder", spend: 18_998 },
  { id: "usr-2038", name: "Ananya Pillai", email: "ananya.pillai@example.com", plan: "Explorer", stage: "Trial", domain: "Product management", intent: 76, source: "Instagram", joined: "Jul 07", lastActive: "2 days ago", progress: "5 lessons", spend: 0 },
  { id: "usr-2037", name: "Viraj Kapoor", email: "viraj.kapoor@example.com", plan: "Pro", stage: "Churn risk", domain: "System design", intent: 38, source: "Organic search", joined: "Jun 19", lastActive: "18 days ago", progress: "2 lessons", spend: 2_998 },
];

export const ADMIN_ACTIONS = [
  { priority: "High", title: "Launch a cybersecurity bootcamp waitlist", detail: "96 high-intent users have no matching paid cohort.", impact: "Potential ₹11.5L cohort" },
  { priority: "High", title: "Recover Career trials before day 7", detail: "41 trial users completed 5 or more lessons without upgrading.", impact: "Estimated 12-18 conversions" },
  { priority: "Medium", title: "Intervene with inactive paid learners", detail: "67 subscribers have been inactive for more than 10 days.", impact: "₹2.1L MRR at risk" },
  { priority: "Medium", title: "Expand UX research paid content", detail: "438 interested learners currently have only one short course path.", impact: "Largest catalog coverage gap" },
] as const;

export interface TarsPeriodSnapshot {
  label: string;
  totalCost: number;
  activeLearners: number;
  tutorTurns: number;
  realtimeMinutes: number;
  generatedCourses: number;
  visualScans: number;
  trend: Array<{ label: string; cost: number; sessions: number }>;
}

export const TARS_PERIODS: Record<AdminPeriodKey, TarsPeriodSnapshot> = {
  "30d": {
    label: "Last 30 days",
    totalCost: 166_420,
    activeLearners: 2_146,
    tutorTurns: 27_184,
    realtimeMinutes: 6_420,
    generatedCourses: 462,
    visualScans: 11_840,
    trend: [
      { label: "W1", cost: 34_820, sessions: 4_180 },
      { label: "W2", cost: 39_600, sessions: 4_740 },
      { label: "W3", cost: 43_240, sessions: 5_120 },
      { label: "W4", cost: 48_760, sessions: 5_810 },
    ],
  },
  "90d": {
    label: "Last 90 days",
    totalCost: 482_000,
    activeLearners: 5_728,
    tutorTurns: 78_420,
    realtimeMinutes: 18_240,
    generatedCourses: 1_308,
    visualScans: 34_920,
    trend: [
      { label: "Apr 21", cost: 29_400, sessions: 3_610 },
      { label: "Apr 28", cost: 31_800, sessions: 3_880 },
      { label: "May 05", cost: 34_200, sessions: 4_120 },
      { label: "May 12", cost: 35_600, sessions: 4_260 },
      { label: "May 19", cost: 37_900, sessions: 4_490 },
      { label: "May 26", cost: 39_800, sessions: 4_760 },
      { label: "Jun 02", cost: 40_700, sessions: 4_940 },
      { label: "Jun 09", cost: 42_100, sessions: 5_120 },
      { label: "Jun 16", cost: 43_900, sessions: 5_350 },
      { label: "Jun 23", cost: 46_200, sessions: 5_680 },
      { label: "Jun 30", cost: 48_400, sessions: 5_920 },
      { label: "Jul 07", cost: 52_000, sessions: 6_280 },
    ],
  },
  "12m": {
    label: "Last 12 months",
    totalCost: 2_184_600,
    activeLearners: 18_624,
    tutorTurns: 356_840,
    realtimeMinutes: 82_430,
    generatedCourses: 5_862,
    visualScans: 161_300,
    trend: [
      { label: "Aug", cost: 112_400, sessions: 13_280 },
      { label: "Sep", cost: 124_600, sessions: 14_610 },
      { label: "Oct", cost: 138_200, sessions: 16_040 },
      { label: "Nov", cost: 149_800, sessions: 17_320 },
      { label: "Dec", cost: 157_400, sessions: 18_180 },
      { label: "Jan", cost: 168_600, sessions: 19_460 },
      { label: "Feb", cost: 174_200, sessions: 20_140 },
      { label: "Mar", cost: 181_800, sessions: 20_960 },
      { label: "Apr", cost: 194_600, sessions: 22_480 },
      { label: "May", cost: 207_400, sessions: 23_760 },
      { label: "Jun", cost: 249_600, sessions: 28_940 },
      { label: "Jul", cost: 326_000, sessions: 36_280 },
    ],
  },
};

export const TARS_COST_BREAKDOWN = [
  { name: "Realtime voice tutor", category: "OpenAI Realtime", cost: 198_400, share: 41.2, unit: "₹10.88 / voice min" },
  { name: "Course generation", category: "Research and writing", cost: 104_800, share: 21.7, unit: "₹80.12 / course" },
  { name: "Course artwork", category: "Image generation", cost: 78_200, share: 16.2, unit: "₹69.57 / image" },
  { name: "Visual guidance", category: "Tars screen vision", cost: 43_600, share: 9.0, unit: "₹1.25 / visual scan" },
  { name: "Transcription", category: "Learner speech", cost: 38_400, share: 8.0, unit: "₹2.11 / audio min" },
  { name: "Roleplay rendering", category: "Tavus face", cost: 18_600, share: 3.9, unit: "₹2.12 / roleplay" },
] as const;

export const TARS_FEATURE_USAGE = [
  { feature: "AI whiteboard", sessions: 18_420, share: 42.6, minutes: 24.2, cost: 146_800, completion: 76.4 },
  { feature: "Role playing", sessions: 8_760, share: 20.3, minutes: 17.6, cost: 124_600, completion: 68.9 },
  { feature: "Course builder", sessions: 6_540, share: 15.1, minutes: 12.8, cost: 112_400, completion: 81.2 },
  { feature: "Guided labs", sessions: 5_820, share: 13.5, minutes: 31.4, cost: 56_200, completion: 63.7 },
  { feature: "Assessments", sessions: 3_690, share: 8.5, minutes: 9.3, cost: 42_000, completion: 84.6 },
] as const;

export const TARS_PERSONALITIES = [
  { name: "Socratic Coach", learners: 2_418, share: 36.8, sessions: 18.4, completion: 73.2, satisfaction: 4.8 },
  { name: "Friendly Mentor", learners: 1_866, share: 28.4, sessions: 16.7, completion: 76.1, satisfaction: 4.7 },
  { name: "Technical Trainer", learners: 1_294, share: 19.7, sessions: 21.2, completion: 69.8, satisfaction: 4.6 },
  { name: "Professor", learners: 631, share: 9.6, sessions: 13.1, completion: 71.4, satisfaction: 4.5 },
  { name: "Interview Coach", learners: 361, share: 5.5, sessions: 11.8, completion: 66.2, satisfaction: 4.8 },
] as const;

export const TARS_PERSONALITY_FEATURE_MATRIX = [
  { personality: "Socratic Coach", values: [92, 64, 71, 78, 88] },
  { personality: "Friendly Mentor", values: [86, 82, 68, 72, 79] },
  { personality: "Technical Trainer", values: [79, 48, 94, 91, 83] },
  { personality: "Professor", values: [74, 31, 62, 58, 92] },
  { personality: "Interview Coach", values: [46, 98, 52, 43, 76] },
] as const;

export const TARS_OPERATIONAL_METRICS = [
  { label: "Average AI cost / active learner", value: "₹84.15", detail: "Down 6.2% from previous period" },
  { label: "Average realtime response", value: "1.4 sec", detail: "Voice turn to first audio" },
  { label: "Successful tutor turns", value: "98.7%", detail: "1,018 turns retried automatically" },
  { label: "Context cache reuse", value: "72.4%", detail: "Reduced repeated prompt processing" },
] as const;
