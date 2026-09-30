// ============================================================
//  إعدادات الموقع العامة — عدّل هذه القيم لتناسبك
// ============================================================

export const SITE = {
  name: 'تعريباتي',
  tagline: 'تعريبات ومودات عربية للألعاب',
  description:
    'موقع لعرض وتحميل تعريبات الألعاب والمودات العربية، مع شروحات التثبيت وسجل التحديثات.',
  lang: 'ar',
  // رابط زر "ادعمنا" — اتركه فارغاً '' لإخفاء الزر
  donateUrl: 'https://ko-fi.com/ibrahimalobaidi',
  // رقم يظهر في الإحصائيات بالصفحة الرئيسية (عدّله يدوياً)
  totalDownloads: '120K',
};

// روابط التواصل — احذف أي سطر لا تحتاجه
export const SOCIAL: { label: string; url: string; icon: string }[] = [
  { label: 'ديسكورد', url: 'https://discord.gg/MNmtmnSsu', icon: 'discord' },
  { label: 'يوتيوب', url: 'https://www.youtube.com/@IBO-MO', icon: 'youtube' },
  { label: 'إكس (تويتر)', url: 'https://x.com/Web3Nftvisitor', icon: 'x' },
  { label: 'ادعمنا على Ko-fi', url: 'https://ko-fi.com/ibrahimalobaidi', icon: 'heart' },
];

export const NAV = [
  { label: 'الرئيسية', href: '/' },
  { label: 'التعريبات', href: '/translations/' },
  { label: 'المقالات', href: '/articles/' },
  { label: 'الدروس', href: '/lessons/' },
  { label: 'تواصل', href: '/contact/' },
];

// أسماء التصنيفات كما تظهر في الموقع
export const CATEGORY_LABELS = {
  modern: 'لعبة حديثة',
  retro: 'لعبة ريترو',
  vn: 'رواية مرئية',
  mod: 'مود',
} as const;

export const STATUS_LABELS = {
  complete: 'مكتمل',
  beta: 'تجريبي',
  'in-progress': 'قيد العمل',
} as const;

// كم يوماً يبقى فيها التعريب مُعلَّماً بشارة "جديد"
export const NEW_BADGE_DAYS = 30;
