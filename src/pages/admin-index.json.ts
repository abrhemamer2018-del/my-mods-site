import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

// فهرس بسيط للعناوين تستخدمه لوحة التحكم (يشمل المسودات)
// dates: تاريخ إصدار كل تعريب، لترتيب الإرسال إلى ديسكورد من الأقدم للأحدث
export const GET: APIRoute = async () => {
  const all = await getCollection('translations');
  const translations = Object.fromEntries(all.map((t) => [t.id, `${t.data.titleAr} (${t.data.title})`]));
  const dates = Object.fromEntries(all.map((t) => [t.id, t.data.releaseDate.toISOString().slice(0, 10)]));
  const articles = Object.fromEntries((await getCollection('articles')).map((a) => [a.id, a.data.title]));
  return new Response(JSON.stringify({ translations, articles, dates }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
