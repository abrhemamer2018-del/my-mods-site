import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

// قائمة التعريبات المنشورة (بدون المسودات) يقرؤها بوت ديسكورد حتى يجاوب الأعضاء عن الألعاب المعربة
// worker/chatbot.js: سطر لكل لعبة «الاسم العربي | English | صيغ أخرى | الحالة | الإصدار | نسخة اللعبة | الرابط»
export const GET: APIRoute = async () => {
  const all = (await getCollection('translations', (t) => !t.data.draft)).sort((a, b) =>
    a.data.title.localeCompare(b.data.title),
  );
  const status = { complete: 'مكتمل', beta: 'تجريبي', 'in-progress': 'قيد العمل' } as const;
  const games = all.map((t) => {
    const d = t.data;
    return [
      d.titleAr,
      d.title,
      d.aliases.join('، '),
      status[d.status] + (d.status === 'in-progress' && d.progress != null ? ` ${d.progress}%` : ''),
      `v${d.version}`,
      d.gameVersion ? `نسخة اللعبة ${d.gameVersion}` : '',
      `https://ta3reebat.com/translations/${t.id}/`,
    ].join(' | ');
  });
  return new Response(JSON.stringify({ count: games.length, games }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
