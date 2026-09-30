import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

// فهرس بسيط للعناوين تستخدمه لوحة التحكم (يشمل المسودات)
export const GET: APIRoute = async () => {
  const translations = Object.fromEntries(
    (await getCollection('translations')).map((t) => [t.id, `${t.data.titleAr} (${t.data.title})`]),
  );
  const articles = Object.fromEntries((await getCollection('articles')).map((a) => [a.id, a.data.title]));
  return new Response(JSON.stringify({ translations, articles }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
