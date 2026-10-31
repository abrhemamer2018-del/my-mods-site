// ============================================================
//  IndexNow: يُبلغ Bing (ومحركات بحث أخرى) بالصفحات الجديدة أو المعدّلة
//  المفتاح منشور في public/<KEY>.txt لإثبات ملكية الموقع
//
//  كل دقيقة (cron) يقرأ /indexnow-pages.json من النسخة المنشورة حالياً، ويقارنه بآخر نسخة
//  محفوظة في IndexNowState. عند النشر الجديد يبلغ بالصفحات التي تغيّرت بصمتها أو حُذفت.
//  هكذا يصل البلاغ بعد أن تصبح الصفحة الجديدة على الموقع، ولكل تعديل (لوحة التحكم أو Git).
// ============================================================
const SITE_URL = 'https://ta3reebat.com';
const INDEXNOW_KEY = 'f1246762d2966315fcb31ce6252e3253';
const MANIFEST = '/indexnow-pages.json';

async function submit(paths) {
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: 'ta3reebat.com',
      key: INDEXNOW_KEY,
      keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
      urlList: paths.map((p) => SITE_URL + p),
    }),
  });
  // 200 و 202 نجاح؛ غير ذلك نعيد المحاولة في الدقيقة القادمة
  if (!res.ok) throw new Error(`IndexNow ${res.status}`);
}

/** من cron: يرسل بصمات النسخة المنشورة إلى IndexNowState */
export async function indexNowCheck(env) {
  try {
    const res = await env.ASSETS.fetch(new URL(MANIFEST, SITE_URL));
    if (!res.ok) return;
    const body = await res.text();
    const stub = env.INDEXNOW_STATE.get(env.INDEXNOW_STATE.idFromName('main'));
    await stub.fetch('https://indexnow/check', { method: 'POST', body });
  } catch (err) {
    console.log('IndexNow check failed', err.message);
  }
}

export class IndexNowState {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const body = await request.text();
    const old = await this.state.storage.get('manifest');
    if (old === body) return new Response('same');

    const now = JSON.parse(body);
    const before = old ? JSON.parse(old) : {};
    const changed = Object.keys(now).filter((p) => now[p] !== before[p]);
    const removed = Object.keys(before).filter((p) => !(p in now));
    const paths = [...changed, ...removed];
    // IndexNow يقبل حتى 10000 رابط في الطلب
    for (let i = 0; i < paths.length; i += 10000) await submit(paths.slice(i, i + 10000));
    await this.state.storage.put('manifest', body);
    console.log(`IndexNow submitted ${paths.length} pages`);
    return new Response(`submitted ${paths.length}`);
  }
}
