// ============================================================
//  إعدادات الموقع العامة — عدّل هذه القيم لتناسبك
// ============================================================

export const SITE = {
  name: 'تعريبات',
  tagline: 'تعريبات ومودات عربية للألعاب',
  description:
    'موقع لعرض وتحميل تعريبات الألعاب والمودات العربية، مع شروحات التثبيت وسجل التحديثات.',
  lang: 'ar',
  // رابط زر "ادعمنا" — اتركه فارغاً '' لإخفاء الزر
  donateUrl: 'https://ko-fi.com/ibrahimalobaidi',
  // عدد التحميلات في الرئيسية يُحسب تلقائياً من GitHub Releases.
  // أضف هنا تحميلات سابقة من خارج GitHub (مثل Nexus و MediaFire) لتُجمع معه، أو اتركه 0
  downloadsOffset: 0,
};

// روابط التواصل — احذف أي سطر لا تحتاجه
export const SOCIAL: { label: string; url: string; icon: string }[] = [
  { label: 'ديسكورد', url: 'https://discord.gg/FtpStyNE8', icon: 'discord' },
  { label: 'يوتيوب', url: 'https://www.youtube.com/@IBO-MO', icon: 'youtube' },
  { label: 'إكس (تويتر)', url: 'https://x.com/ta3reebat', icon: 'x' },
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

// شارة "جديد": تظهر على أحدث NEW_BADGE_MAX تعريبات فقط، بشرط ألا يتجاوز عمرها NEW_BADGE_DAYS يوماً
export const NEW_BADGE_DAYS = 30;
export const NEW_BADGE_MAX = 3;
