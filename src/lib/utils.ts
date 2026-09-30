import { getCollection, type CollectionEntry } from 'astro:content';
import { NEW_BADGE_DAYS } from '../config';

export type Translation = CollectionEntry<'translations'>;

const dateFmt = new Intl.DateTimeFormat('ar', { month: 'long', year: 'numeric' });
const fullDateFmt = new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'long', year: 'numeric' });

export const formatMonth = (d: Date) => dateFmt.format(d);
export const formatDate = (d: Date) => fullDateFmt.format(d);

export const lastTouched = (t: Translation) => t.data.updatedDate ?? t.data.releaseDate;

export const isNew = (t: Translation) =>
  Date.now() - t.data.releaseDate.getTime() < NEW_BADGE_DAYS * 24 * 60 * 60 * 1000;

/** كل التعريبات المنشورة، الأحدث أولاً */
export async function getTranslations() {
  const all = await getCollection('translations', (t) => !t.data.draft);
  return all.sort((a, b) => b.data.releaseDate.getTime() - a.data.releaseDate.getTime());
}

export async function getArticles(kind?: 'article' | 'lesson') {
  const all = await getCollection('articles', (a) => !a.data.draft && (!kind || a.data.kind === kind));
  return all.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
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
