// ============================================================
//  إعادة البناء تلقائياً: أحياناً يفشل بناء Cloudflare (Workers Builds) قبل أن يبدأ
//  ("Build failed to initialize and was timed out") فلا تظهر التعريبات الجديدة حتى يُضغط Retry.
//
//  كل دقيقة (cron) يقرأ آخر البناءات؛ إن فشل آخرها في مرحلة التجهيز (قبل تنزيل الكود)
//  يبدأ بناءً جديداً لنفس الـ commit، حتى 3 محاولات. فشل الكود نفسه (خطأ في البناء) لا يُعاد.
//  يحتاج السر CF_BUILDS_TOKEN (API Token بصلاحية Workers CI: Edit)؛ بدونه لا يفعل شيئاً.
// ============================================================
const MAX_ATTEMPTS = 3;
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export async function buildRetryCheck(env) {
  if (!env.CF_BUILDS_TOKEN || !env.CF_ACCOUNT_ID || !env.WORKER_TAG) return;
  try {
    const api = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/builds`;
    const headers = { Authorization: `Bearer ${env.CF_BUILDS_TOKEN}`, 'Content-Type': 'application/json' };
    const res = await fetch(`${api}/workers/${env.WORKER_TAG}/builds?per_page=20`, { headers });
    if (!res.ok) throw new Error(`builds ${res.status}`);
    const builds = ((await res.json()).result || []).sort((a, b) => Date.parse(b.created_on) - Date.parse(a.created_on));

    // بناء يعمل الآن (أو ينتظر): ننتظره
    if (builds.some((b) => b.status !== 'stopped')) return;
    // البناءات المتخطاة/الملغاة سبقها بناء أحدث يغطيها
    const latest = builds.find((b) => b.build_outcome !== 'skipped' && b.build_outcome !== 'cancelled');
    if (!latest || latest.build_outcome !== 'fail' || latest.running_on) return;
    if (Date.now() - Date.parse(latest.created_on) > MAX_AGE_MS) return;

    const commit = latest.build_trigger_metadata?.commit_hash;
    const branch = latest.build_trigger_metadata?.branch || 'main';
    if (!commit || !latest.trigger?.trigger_uuid) return;
    const attempts = builds.filter(
      (b) => b.build_trigger_metadata?.commit_hash === commit && b.build_outcome === 'fail' && !b.running_on,
    ).length;
    if (attempts >= MAX_ATTEMPTS) return;

    const start = await fetch(`${api}/triggers/${latest.trigger.trigger_uuid}/builds`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ branch, commit_hash: commit }),
    });
    console.log('Build retry', commit.slice(0, 7), `attempt ${attempts + 1}`, start.status);
  } catch (err) {
    console.log('Build retry check failed', err.message);
  }
}
