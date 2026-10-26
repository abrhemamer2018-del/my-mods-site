import type { Translation } from './utils';

// مستودع ملفات التعريبات على GitHub (نفس FILES_REPO في wrangler.jsonc)
const FILES_REPO = 'abrhemamer2017-debug/files';

let counts: Promise<Map<string, number>> | undefined;

/**
 * عدد تحميلات كل ملف (اسم الملف ← العدد) من GitHub Releases، يُجلب مرة واحدة أثناء بناء الموقع.
 * الموقع يُبنى من جديد مع كل حفظ في لوحة التحكم، فتبقى الأرقام حديثة.
 * إن فشل الجلب تُرجع قائمة فارغة فيختفي قسم "الأكثر تحميلاً" بدل أن يفشل البناء
 */
export function downloadCounts() {
  counts ??= (async () => {
    const map = new Map<string, number>();
    try {
      // GITHUB_TOKEN اختياري في إعدادات البناء: يرفع حد طلبات GitHub
      const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'ta3reebat-build' };
      if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
      const get = async (path: string) => {
        const res = await fetch(`https://api.github.com/repos/${FILES_REPO}${path}`, { headers });
        if (!res.ok) throw new Error(`GitHub ${res.status}`);
        return res.json();
      };
      for (const r of await get('/releases?per_page=100')) {
        for (let page = 1; ; page++) {
          const assets = await get(`/releases/${r.id}/assets?per_page=100&page=${page}`);
          for (const a of assets) {
            // "prev:123" في وصف الملف = تحميلات النسخ التي استُبدلت بنفس الاسم (يكتبه Tarib Publisher)
            const prev = Number(String(a.label ?? '').match(/prev:(\d+)/)?.[1] ?? 0);
            map.set(a.name, (map.get(a.name) ?? 0) + a.download_count + prev);
          }
          if (assets.length < 100) break;
        }
      }
    } catch (e) {
      console.warn('[downloads] تعذّر جلب عدد التحميلات، سيُخفى قسم "الأكثر تحميلاً":', (e as Error).message);
      map.clear();
    }
    return map;
  })();
  return counts;
}

/** عدد تحميلات تعريب واحد (مجموع ملفاته في GitHub)، أو 0 */
export async function downloadsOf(t: Translation) {
  const map = await downloadCounts();
  return t.data.downloads.reduce((sum, d) => sum + (map.get(decodeURIComponent(d.url.split('/').pop() ?? '')) ?? 0), 0);
}

/** التعريبات الأكثر تحميلاً (الأعلى أولاً)، بدون التي لا تحميلات لها */
export async function topDownloaded(all: Translation[], count = 5) {
  const withCounts = await Promise.all(all.map(async (t) => ({ t, n: await downloadsOf(t) })));
  return withCounts
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, count)
    .map((x) => x.t);
}
