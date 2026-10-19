import { getCollection, type CollectionEntry } from 'astro:content';
import { NAV, NEW_BADGE_DAYS, NEW_BADGE_MAX } from '../config';

export type Translation = CollectionEntry<'translations'>;

const dateFmt = new Intl.DateTimeFormat('ar', { month: 'long', year: 'numeric' });
const fullDateFmt = new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'long', year: 'numeric' });

export const formatMonth = (d: Date) => dateFmt.format(d);
export const formatDate = (d: Date) => fullDateFmt.format(d);

export const lastTouched = (t: Translation) => t.data.updatedDate ?? t.data.releaseDate;

/** هل يحمل التعريب شارة "جديد"؟ (من أحدث NEW_BADGE_MAX، وعمره أقل من NEW_BADGE_DAYS) */
export async function isNew(t: Translation) {
  const newest = (await getTranslations()).slice(0, NEW_BADGE_MAX).map((x) => x.id);
  return newest.includes(t.id) && Date.now() - t.data.releaseDate.getTime() < NEW_BADGE_DAYS * 86400000;
}

/** كل التعريبات المنشورة، الأحدث أولاً */
export async function getTranslations() {
  const all = await getCollection('translations', (t) => !t.data.draft);
  const t = (x: (typeof all)[number]) => (x.data.addedAt ?? x.data.releaseDate).getTime();
  return all.sort((a, b) => t(b) - t(a));
}

// ------------------------------------------------------------
//  "تعريبات أخرى قد تعجبك": ألعاب من نفس السلسلة أولاً، ثم الأقرب في وسوم Steam
// ------------------------------------------------------------

// كلمات لا تميّز السلسلة (تُحذف من الاسم قبل المقارنة)
const SERIES_SKIP = new Set(['the', 'a', 'an', 'of', 'and', 'complete', 'edition', 'remastered', 'remake', 'definitive', 'enhanced', 'goty', 'directors', 'cut', 'ii', 'iii', 'iv', 'v', 'vi', 'vii']);
// كلمات شائعة في أول الاسم لا تكفي وحدها لاعتبار لعبتين من سلسلة واحدة (Dead Space و Dead Island)
const SERIES_COMMON = new Set(['dead', 'dark', 'black', 'star', 'red', 'life', 'lost', 'grand', 'final', 'like', 'little', 'new', 'super', 'deep', 'two', 'planet']);
// سلاسل بأسماء مختلفة
const SERIES_ALIAS: Record<string, string> = { 'like dragon': 'yakuza', 'lost judgment': 'judgment' };

/** مفتاح السلسلة من الاسم الإنجليزي: "Nioh 2 – The Complete Edition" و "Nioh: Complete Edition" ← "nioh" */
function seriesKey(title: string) {
  const words = title
    .toLowerCase()
    .replace(/[™®]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !SERIES_SKIP.has(w) && !/^\d+$/.test(w));
  const key = SERIES_COMMON.has(words[0]) ? words.slice(0, 2).join(' ') : (words[0] ?? '');
  return SERIES_ALIAS[key] ?? key;
}

// وسوم عامة توجد في أغلب الألعاب، فوزنها في التشابه قليل
const GENERIC_TAGS = new Set(['Singleplayer', 'Multiplayer', 'Action', 'Adventure', 'Indie', 'Casual', '3D', '2D', 'Great Soundtrack', 'Atmospheric', 'Third Person', 'First-Person', 'Colorful', 'Beautiful', 'Classic', 'Co-op', 'Online Co-Op', 'Controller', 'Story Rich', 'Open World', 'Fantasy', 'Funny', 'Cinematic', 'Female Protagonist', 'Realistic']);

/** درجة التشابه بين لعبتين من وسوم Steam: الوسوم المشتركة الأعلى ترتيباً تزن أكثر */
function tagScore(a: string[], b: string[]) {
  const rank = new Map(b.map((t, i) => [t, i]));
  let score = 0;
  a.forEach((t, i) => {
    const j = rank.get(t);
    if (j === undefined) return;
    score += (GENERIC_TAGS.has(t) ? 0.2 : 1) * (1 - i / 14) * (1 - j / 14);
  });
  return score;
}

/**
 * يختار count تعريبات مشابهة: حتى 3 من نفس السلسلة (الأقرب تاريخاً أولاً)، والباقي الأعلى تشابهاً في الوسوم.
 * عند التساوي (أو غياب الوسوم) يكمل بالتعريبات التالية بالترتيب، حتى تعرض كل صفحة مجموعة مختلفة
 */
export function relatedTranslations(item: Translation, all: Translation[], count = 4) {
  const pos = all.findIndex((t) => t.id === item.id);
  const others = all.map((_, k) => all[(pos + 1 + k) % all.length]).filter((t) => t.id !== item.id);
  const key = seriesKey(item.data.title);
  const when = (t: Translation) => (t.data.gameRelease ?? t.data.releaseDate).getTime();
  const series = others
    .filter((t) => key && seriesKey(t.data.title) === key)
    .sort((a, b) => Math.abs(when(a) - when(item)) - Math.abs(when(b) - when(item)))
    .slice(0, Math.min(3, count));
  const picked = new Set(series.map((t) => t.id));
  const similar = others
    .filter((t) => !picked.has(t.id))
    .map((t, i) => ({ t, i, s: tagScore(item.data.tags, t.data.tags) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, count - series.length)
    .map((x) => x.t);
  return [...series, ...similar];
}

export async function getArticles(kind?: 'article' | 'lesson') {
  const all = await getCollection('articles', (a) => !a.data.draft && (!kind || a.data.kind === kind));
  return all.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

/** يستخرج معرّف الفيديو من أي رابط يوتيوب (watch / youtu.be / shorts / embed / live) */
export function youtubeId(url?: string) {
  const m = url?.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m?.[1];
}

/** "محدث منذ يومين" */
export function timeAgo(d: Date) {
  const rtf = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' });
  const days = Math.round((d.getTime() - Date.now()) / 86400000);
  if (Math.abs(days) < 30) return rtf.format(days, 'day');
  const months = Math.round(days / 30);
  if (Math.abs(months) < 12) return rtf.format(months, 'month');
  return rtf.format(Math.round(days / 365), 'year');
}

/** التعريبات القادمة: حالتها "قيد العمل" أو "تجريبي" */
export async function getUpcoming() {
  return (await getTranslations()).filter((t) => t.data.status !== 'complete');
}

/** روابط القائمة: يظهر "تعريبات قادمة" فقط عند وجود تعريب قيد العمل */
export async function getNav() {
  const hasUpcoming = (await getUpcoming()).length > 0;
  return NAV.filter((item) => item.href !== '/upcoming/' || hasUpcoming);
}
