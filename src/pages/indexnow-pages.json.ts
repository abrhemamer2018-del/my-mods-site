import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { getArticles, getTranslations, seriesOf, SERIES } from '../lib/utils';

// بصمة محتوى كل صفحة مهمة: الخادم (worker/indexnow.js) يقارنها بعد كل نشر،
// فيبلغ Bing (IndexNow) بالصفحات التي تغيّرت فقط، مهما كانت طريقة تعديلها (لوحة التحكم أو Git)
// fsPath (مسار الصورة على جهاز البناء) يختلف بين بناء وآخر، فلا يدخل في البصمة
const hash = (x: unknown) =>
  createHash('sha1')
    .update(JSON.stringify(x, (k, v) => (k === 'fsPath' ? undefined : v)))
    .digest('hex')
    .slice(0, 16);

export const GET: APIRoute = async () => {
  const translations = await getTranslations();
  const articles = await getArticles();
  const pages: Record<string, string> = {};

  for (const t of translations) pages[`/translations/${t.id}/`] = hash([t.data, t.body]);
  for (const a of articles) pages[`/articles/${a.id}/`] = hash([a.data, a.body]);
  for (const s of SERIES) {
    const ids = translations.filter((t) => seriesOf(t)?.slug === s.slug).map((t) => t.id);
    if (ids.length >= 2) pages[`/series/${s.slug}/`] = hash(ids);
  }
  // القوائم تتغير عند إضافة تعريب أو مقال
  const list = hash(translations.map((t) => t.id));
  pages['/'] = list;
  pages['/translations/'] = list;
  pages['/articles/'] = hash(articles.map((a) => a.id));

  return new Response(JSON.stringify(pages), { headers: { 'Content-Type': 'application/json' } });
};
