// ============================================================
//  إعدادات الموقع العامة — عدّل هذه القيم لتناسبك
// ============================================================

export const SITE = {
  name: 'تعريبات',
  tagline: 'لتعريب الألعاب إلى العربية مجاناً',
  description:
    'تعريبات كاملة ومجانية لألعابك المفضّلة، مع أداة تثبيت بضغطة واحدة.',
  lang: 'ar',
  // رابط زر "ادعمنا" — اتركه فارغاً '' لإخفاء الزر
  donateUrl: 'https://ko-fi.com/ibrahimalobaidi',
  // عدد التحميلات في الرئيسية يُحسب تلقائياً من GitHub Releases.
  // أضف هنا تحميلات سابقة من خارج GitHub (مثل Nexus و MediaFire) لتُجمع معه، أو اتركه 0
  downloadsOffset: 0,
  // رابط قناة #الإبلاغ-عن-مشكلة في ديسكورد (يظهر في نموذج الإبلاغ)
  reportDiscordUrl: 'https://discord.gg/DugSmwpDW',
  // بريد طلبات إزالة المحتوى (صفحة /copyright/). يُحوَّل إلى بريدك عبر Cloudflare Email Routing
  copyrightEmail: 'copyright@ta3reebat.com',
};

// روابط التواصل — احذف أي سطر لا تحتاجه
export const SOCIAL: { label: string; url: string; icon: string }[] = [
  { label: 'ديسكورد', url: 'https://discord.gg/FtpStyNE8', icon: 'discord' },
  { label: 'يوتيوب', url: 'https://www.youtube.com/@ta3reebat', icon: 'youtube' },
  { label: 'إكس (تويتر)', url: 'https://x.com/ta3reebat', icon: 'x' },
  { label: 'ادعمنا على Ko-fi', url: 'https://ko-fi.com/ibrahimalobaidi', icon: 'heart' },
];

// برنامج تعريبات لايف (صفحة /live/). عند إصدار نسخة جديدة: حدّث الرقم والرابط والحجم فقط
export const LIVE = {
  // اسم شريحة البرنامج في قائمة البانر (src/data/hero.json ولوحة التحكم)
  heroSlug: 'ta3reebat-live',
  name: 'تعريبات لايف',
  tagline: 'عرّب أي لعبة فوراً وأنت تلعب… بضغطة زر',
  version: '1.1.2',
  label: 'تجريبي',
  sizeMB: 305,
  // ملف البرنامج في GitHub Releases (مستودع الملفات)
  downloadUrl:
    'https://github.com/abrhemamer2017-debug/files/releases/download/ta3reebat-live-v1.1.2/Ta3reebat-Live-v1.1.2-beta.zip',
};

export const NAV: { label: string; href: string; badge?: string }[] = [
  { label: 'الرئيسية', href: '/' },
  { label: 'التعريبات', href: '/translations/' },
  { label: 'قادمة', href: '/upcoming/' },
  { label: 'تعريبات لايف', href: '/live/', badge: 'جديد' },
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
