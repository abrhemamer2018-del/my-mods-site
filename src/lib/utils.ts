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
  return all.sort((a, b) => b.data.releaseDate.getTime() - a.data.releaseDate.getTime());
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
