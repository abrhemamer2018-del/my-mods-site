// ============================================================
//  خادم لوحة التحكم (Cloudflare Worker)
//  - يخدم ملفات الموقع الثابتة
//  - /api/* : تسجيل الدخول، قراءة وحفظ التعريبات والمقالات في GitHub
//
//  الأسرار المطلوبة في Cloudflare (Settings → Variables and Secrets):
//    ADMIN_USER      اسم المستخدم
//    ADMIN_PASSWORD  كلمة المرور
//    GITHUB_TOKEN    توكن GitHub بصلاحية Contents: Read and write على المستودع
// ============================================================
import { parse, stringify } from 'yaml';

const SESSION_DAYS = 7;
const PATHS = {
  translations: 'src/content/translations',
  articles: 'src/content/articles',
};
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FILE_RE = /^[a-z0-9][a-z0-9._-]*\.(webp|jpg|jpeg|png|gif)$/i;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    try {
      return await handleApi(request, env, url);
    } catch (err) {
      const status = err.status || 500;
      return json({ error: err.expose ? err.message : 'حدث خطأ في الخادم' }, status);
    }
  },
};

async function handleApi(request, env, url) {
  const route = url.pathname.slice('/api/'.length);
  const method = request.method;

  // حماية من الطلبات القادمة من مواقع أخرى
  if (method !== 'GET') {
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) throw httpError(403, 'طلب غير مسموح');
  }

  if (route === 'login' && method === 'POST') return login(request, env);
  if (route === 'logout' && method === 'POST') {
    return json({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });
  }

  // عدد التحميلات الحقيقي (عام، لا يحتاج تسجيل دخول)
  if (route === 'downloads' && method === 'GET') return downloadsCount(env);

  // كل ما بعد هذا يحتاج تسجيل دخول
  const user = await currentUser(request, env);
  if (route === 'me') return json({ user });
  if (!user) throw httpError(401, 'يجب تسجيل الدخول');
  if (!env.GITHUB_TOKEN) throw httpError(500, 'لم يتم ضبط GITHUB_TOKEN في إعدادات Cloudflare');

  const gh = github(env);

  if (route === 'list' && method === 'GET') return json(await listEntries(gh, env, url));
  if (route === 'entry' && method === 'GET') return json(await readEntry(gh, url));
  if (route === 'entry' && method === 'POST') return json(await saveEntry(gh, await request.json()));
  if (route === 'entry' && method === 'DELETE') return json(await deleteEntry(gh, url));
  if (route === 'file' && method === 'GET') return readFile(gh, url);
  if (route === 'asset-size' && method === 'GET') return json(await assetSize(env, url));
  if (HOME_LISTS[route] && method === 'GET') return json(await readHomeList(gh, HOME_LISTS[route]));
  if (HOME_LISTS[route] && method === 'POST') return json(await saveHomeList(gh, HOME_LISTS[route], await request.json()));
  if (route === 'discord' && method === 'POST') return json(await announceToDiscord(gh, env, await request.json()));

  throw httpError(404, 'غير موجود');
}

// ------------------------------------------------------------
//  تسجيل الدخول والجلسات
// ------------------------------------------------------------
async function login(request, env) {
  if (!env.ADMIN_USER || !env.ADMIN_PASSWORD) {
    throw httpError(500, 'لم يتم ضبط ADMIN_USER و ADMIN_PASSWORD في إعدادات Cloudflare');
  }
  if (env.LOGIN_LIMITER) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const { success } = await env.LOGIN_LIMITER.limit({ key: ip });
    if (!success) throw httpError(429, 'محاولات كثيرة، انتظر دقيقة ثم حاول مرة أخرى');
  }
  const { username = '', password = '' } = await request.json().catch(() => ({}));
  const ok =
    (await safeEqual(String(username), env.ADMIN_USER)) &
    (await safeEqual(String(password), env.ADMIN_PASSWORD));
  if (!ok) {
    await new Promise((r) => setTimeout(r, 800)); // إبطاء محاولات التخمين
    throw httpError(401, 'اسم المستخدم أو كلمة المرور غير صحيحة');
  }
  const exp = Date.now() + SESSION_DAYS * 86400000;
  const token = `${exp}.${await sign(env, String(exp))}`;
  return json({ ok: true, user: env.ADMIN_USER }, 200, {
    'Set-Cookie': cookie(token, SESSION_DAYS * 86400),
  });
}

async function currentUser(request, env) {
  if (!env.ADMIN_USER || !env.ADMIN_PASSWORD) return null;
  const match = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)session=([^;]+)/);
  if (!match) return null;
  const [exp, sig] = match[1].split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return null;
  return (await safeEqual(sig, await sign(env, exp))) ? env.ADMIN_USER : null;
}

function cookie(value, maxAge) {
  return `session=${value}; Path=/api/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

// المفتاح مشتق من كلمة المرور: تغييرها يُخرج كل الجلسات القديمة
async function sign(env, data) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`${env.ADMIN_USER}:${env.ADMIN_PASSWORD}:session`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

// ------------------------------------------------------------
//  عدد التحميلات: مجموع تحميلات كل ملفات GitHub Releases
//  يُحفظ مؤقتاً 15 دقيقة حتى لا نطلب GitHub مع كل زائر
// ------------------------------------------------------------
const DOWNLOADS_CACHE_SECONDS = 900;

async function downloadsCount(env) {
  const cacheKey = new Request('https://cache.internal/downloads-count');
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const res = await fetch(`${env.GITHUB_API || 'https://api.github.com'}/repos/${env.GITHUB_REPO}/releases?per_page=100`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'mods-site',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}),
    },
  });
  if (!res.ok) throw httpError(502, 'تعذّر جلب عدد التحميلات');
  const releases = await res.json();
  const total = releases.reduce(
    (sum, r) => sum + (r.assets || []).reduce((s, a) => s + (a.download_count || 0), 0),
    0,
  );

  const out = new Response(JSON.stringify({ total }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${DOWNLOADS_CACHE_SECONDS}`,
    },
  });
  await cache.put(cacheKey, out.clone());
  return out;
}

// ------------------------------------------------------------
//  GitHub
// ------------------------------------------------------------
function github(env) {
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH || 'main';
  const base = `${env.GITHUB_API || 'https://api.github.com'}/repos/${repo}`;

  async function call(path, init = {}, accept = 'application/vnd.github+json') {
    const res = await fetch(base + path, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: accept,
        'User-Agent': 'mods-site-admin',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (!res.ok && res.status !== 404) {
      const text = await res.text();
      const msg =
        res.status === 401 || res.status === 403
          ? 'توكن GitHub غير صالح أو لا يملك صلاحية الكتابة'
          : `خطأ من GitHub (${res.status})`;
      console.log('GitHub error', res.status, text);
      throw httpError(502, msg);
    }
    return res;
  }

  return {
    env,
    branch,
    async tree() {
      const res = await call(`/git/trees/${branch}?recursive=1`);
      return (await res.json()).tree || [];
    },
    async raw(path) {
      const res = await call(`/contents/${encodePath(path)}?ref=${branch}`, {}, 'application/vnd.github.raw+json');
      return res.status === 404 ? null : res;
    },
    /** يحفظ عدة ملفات في commit واحد. files: [{path, base64}] | [{path, text}] | [{path, delete:true}] */
    async commit(message, files) {
      const ref = await (await call(`/git/ref/heads/${branch}`)).json();
      const parent = await (await call(`/git/commits/${ref.object.sha}`)).json();
      const tree = [];
      for (const f of files) {
        if (f.delete) {
          tree.push({ path: f.path, mode: '100644', type: 'blob', sha: null });
          continue;
        }
        const blob = await (
          await call('/git/blobs', {
            method: 'POST',
            body: JSON.stringify(
              f.base64 !== undefined
                ? { content: f.base64, encoding: 'base64' }
                : { content: f.text, encoding: 'utf-8' },
            ),
          })
        ).json();
        tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
      }
      const newTree = await (
        await call('/git/trees', {
          method: 'POST',
          body: JSON.stringify({ base_tree: parent.tree.sha, tree }),
        })
      ).json();
      const commit = await (
        await call('/git/commits', {
          method: 'POST',
          body: JSON.stringify({ message, tree: newTree.sha, parents: [ref.object.sha] }),
        })
      ).json();
      await call(`/git/refs/heads/${branch}`, {
        method: 'PATCH',
        body: JSON.stringify({ sha: commit.sha }),
      });
      return commit.sha;
    },
  };
}

const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');

// ------------------------------------------------------------
//  المحتوى
// ------------------------------------------------------------
function checkType(type) {
  if (!PATHS[type]) throw httpError(400, 'نوع غير صحيح');
  return type;
}
function checkSlug(slug) {
  if (!SLUG_RE.test(slug || '')) {
    throw httpError(400, 'الرابط (slug) يجب أن يكون أحرفاً إنجليزية صغيرة وأرقاماً وشرطات فقط');
  }
  return slug;
}
function entryPath(type, slug) {
  return type === 'translations' ? `${PATHS[type]}/${slug}/index.md` : `${PATHS[type]}/${slug}.md`;
}
function mediaDir(type, slug) {
  return type === 'translations' ? `${PATHS[type]}/${slug}` : `${PATHS[type]}/images`;
}

async function listEntries(gh, env, url) {
  const type = checkType(url.searchParams.get('type'));
  const tree = await gh.tree();
  const prefix = PATHS[type] + '/';
  const slugs = tree
    .filter((t) => t.type === 'blob' && t.path.startsWith(prefix))
    .map((t) => t.path.slice(prefix.length))
    .map((p) =>
      type === 'translations'
        ? p.endsWith('/index.md') && p.split('/').length === 2 && p.split('/')[0]
        : !p.includes('/') && p.endsWith('.md') && p.slice(0, -3),
    )
    .filter(Boolean);

  // العناوين من فهرس الموقع المنشور (قد لا يحتوي أحدث الإضافات قبل انتهاء البناء)
  let titles = {};
  let dates = {};
  try {
    const res = await env.ASSETS.fetch(new URL('/admin-index.json', url.origin));
    if (res.ok) {
      const index = await res.json();
      titles = index[type] || {};
      if (type === 'translations') dates = index.dates || {};
    }
  } catch {}

  return slugs.map((slug) => ({ slug, title: titles[slug] || null, date: dates[slug] || null }));
}

async function readEntry(gh, url) {
  const type = checkType(url.searchParams.get('type'));
  const slug = checkSlug(url.searchParams.get('slug'));
  const res = await gh.raw(entryPath(type, slug));
  if (!res) throw httpError(404, 'غير موجود');
  const text = await res.text();
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw httpError(500, 'صيغة الملف غير صحيحة');
  return { type, slug, data: parse(m[1]) || {}, body: m[2].replace(/^\r?\n/, '') };
}

async function readFile(gh, url) {
  const path = url.searchParams.get('path') || '';
  const allowed = Object.values(PATHS).some((p) => path.startsWith(p + '/'));
  if (!allowed || path.includes('..') || !FILE_RE.test(path.split('/').pop())) {
    throw httpError(400, 'مسار غير صحيح');
  }
  const res = await gh.raw(path);
  if (!res) throw httpError(404, 'غير موجود');
  const ext = path.split('.').pop().toLowerCase();
  const types = { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif' };
  return new Response(res.body, {
    headers: { 'Content-Type': types[ext], 'Cache-Control': 'private, max-age=300' },
  });
}

// ------------------------------------------------------------
//  قوائم الصفحة الرئيسية التي تُختار من لوحة التحكم (بالترتيب):
//   - التعريبات المثبتة: src/data/pinned.json
//   - البانر الرئيسي:    src/data/hero.json
//  كلاهما بصيغة { "slugs": [...] }
// ------------------------------------------------------------
const HOME_LISTS = {
  pinned: { path: 'src/data/pinned.json', max: 8, label: 'التعريبات المثبتة' },
  hero: { path: 'src/data/hero.json', max: 8, label: 'البانر الرئيسي' },
};

async function readHomeList(gh, cfg) {
  const res = await gh.raw(cfg.path);
  if (!res) return { slugs: [] };
  try {
    const data = JSON.parse(await res.text());
    return { slugs: Array.isArray(data.slugs) ? data.slugs : [] };
  } catch {
    return { slugs: [] };
  }
}

async function saveHomeList(gh, cfg, payload) {
  const slugs = Array.isArray(payload.slugs) ? payload.slugs : null;
  if (!slugs) throw httpError(400, 'بيانات ناقصة');
  if (slugs.length > cfg.max) throw httpError(400, `الحد الأقصى ${cfg.max} تعريبات`);
  if (new Set(slugs).size !== slugs.length) throw httpError(400, 'يوجد تعريب مكرر في القائمة');
  slugs.forEach(checkSlug);
  // كل تعريب في القائمة يجب أن يكون موجوداً فعلاً، حتى لا يُكسر بناء الموقع
  const tree = await gh.tree();
  const existing = new Set(
    tree
      .filter((t) => t.type === 'blob' && t.path.startsWith(PATHS.translations + '/') && t.path.endsWith('/index.md'))
      .map((t) => t.path.split('/').slice(-2)[0]),
  );
  const missing = slugs.find((s) => !existing.has(s));
  if (missing) throw httpError(400, `التعريب "${missing}" غير موجود`);
  const text = JSON.stringify({ slugs }, null, 2) + '\n';
  const sha = await gh.commit(`تحديث ${cfg.label}`, [{ path: cfg.path, text }]);
  return { ok: true, sha };
}

// ------------------------------------------------------------
//  ديسكورد: إعلان التعريبات عبر Webhook
//  السر DISCORD_WEBHOOK_URL يُضاف في Cloudflare (Settings → Variables and Secrets)
// ------------------------------------------------------------
const SITE_URL = 'https://ta3reebat.com';

/** يرسل تعريباً واحداً (من لوحة التحكم): { slug } */
async function announceToDiscord(gh, env, payload) {
  if (!env.DISCORD_WEBHOOK_URL) {
    throw httpError(500, 'لم يتم ضبط DISCORD_WEBHOOK_URL في إعدادات Cloudflare');
  }
  const slug = checkSlug(payload.slug);
  const res = await gh.raw(entryPath('translations', slug));
  if (!res) throw httpError(404, 'التعريب غير موجود');
  const m = (await res.text()).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) throw httpError(500, 'صيغة الملف غير صحيحة');
  await postDiscord(env, slug, parse(m[1]) || {});
  return { ok: true };
}

/** رسالة ديسكورد: اسم اللعبة، الوصف، البانر، الحجم، ورابط صفحة التعريب */
async function postDiscord(env, slug, d) {
  const page = `${SITE_URL}/translations/${slug}/`;
  const img = String(d.banner || d.cover || '').replace(/^\.\//, '');
  const imageUrl = img
    ? `https://raw.githubusercontent.com/${env.GITHUB_REPO}/${env.GITHUB_BRANCH || 'main'}/${PATHS.translations}/${slug}/${encodeURIComponent(img)}`
    : undefined;
  const dl = (d.downloads || [])[0];
  const fields = [
    { name: 'الإصدار', value: `v${d.version || '1.0'}`, inline: true },
    { name: 'المنصة', value: (d.platforms || ['PC']).join(', '), inline: true },
  ];
  if (dl?.size) fields.push({ name: 'الحجم', value: dl.size, inline: true });

  const summary = String(d.summary || '');
  const body = {
    username: 'تعريبات',
    avatar_url: `${SITE_URL}/icon-512.png`,
    content: `🎮 **تعريب جديد: ${d.titleAr || d.title}**`,
    embeds: [
      {
        title: `${d.title}${d.titleAr ? ` | ${d.titleAr}` : ''}`,
        url: page,
        description: `${summary.length > 300 ? summary.slice(0, 300) + '…' : summary}\n\n**[⬇️ صفحة التعريب والتحميل](${page})**`,
        color: 0x19c3d6,
        fields,
        image: imageUrl ? { url: imageUrl } : undefined,
        footer: { text: 'ta3reebat.com' },
      },
    ],
  };

  // قناة المنتدى (Forum) تحتاج عنواناً لكل منشور. اسم اللعبة أولاً حتى تظهر "تعريب" على اليمين
  // في واجهة ديسكورد الإنجليزية، مثل المنشورات اليدوية: "Star Wars Outlaws تعريب"
  const send = (b) =>
    fetch(env.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(b),
    });
  let res = await send({ ...body, thread_name: `${d.title} تعريب`.slice(-100) });
  // إن كان الـ Webhook لقناة نصية عادية، يرفض ديسكورد العنوان، فنعيد الإرسال بدونه
  if (res.status === 400) {
    const err = await res.text();
    if (/thread/i.test(err)) res = await send(body);
    else {
      console.log('Discord error', res.status, err);
      throw httpError(502, 'خطأ من ديسكورد (400)');
    }
  }
  if (!res.ok) {
    console.log('Discord error', res.status, await res.text());
    throw httpError(502, res.status === 429 ? 'ديسكورد طلب التمهل، حاول بعد قليل' : `خطأ من ديسكورد (${res.status})`);
  }
}

/** حجم ملف من GitHub Releases انطلاقاً من رابط التحميل المباشر، مثل "7.06 MB" */
async function assetSize(env, url) {
  const link = url.searchParams.get('url') || '';
  const m = link.match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/releases\/download\/([^/]+)\/([^/?#]+)$/);
  if (!m) throw httpError(400, 'ليس رابط تحميل من GitHub Releases');
  const [, owner, repo, tag, file] = m;
  const res = await fetch(
    `${env.GITHUB_API || 'https://api.github.com'}/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(decodeURIComponent(tag))}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'mods-site-admin',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}),
      },
    },
  );
  if (!res.ok) throw httpError(404, 'لم يُعثر على صفحة الملفات في GitHub');
  const asset = ((await res.json()).assets || []).find((a) => a.name === decodeURIComponent(file));
  if (!asset) throw httpError(404, 'لم يُعثر على الملف في GitHub، تأكد من الرابط');
  return { bytes: asset.size, size: formatSize(asset.size) };
}

function formatSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${i >= 2 ? n.toFixed(2) : Math.round(n)} ${units[i]}`;
}

async function saveEntry(gh, payload) {
  const type = checkType(payload.type);
  const slug = checkSlug(payload.slug);
  const data = payload.data;
  if (!data || typeof data !== 'object') throw httpError(400, 'بيانات ناقصة');
  if (!data.title) throw httpError(400, 'العنوان مطلوب');

  const path = entryPath(type, slug);
  const exists = !!(await gh.raw(path));
  if (payload.isNew && exists) throw httpError(409, 'يوجد عنصر بنفس الرابط (slug) مسبقاً، اختر رابطاً آخر');
  if (!payload.isNew && !exists) throw httpError(404, 'العنصر غير موجود');

  const dir = mediaDir(type, slug);
  const files = [];
  for (const up of payload.uploads || []) {
    if (!FILE_RE.test(up.name || '') || typeof up.base64 !== 'string') throw httpError(400, 'اسم ملف غير صحيح');
    files.push({ path: `${dir}/${up.name}`, base64: up.base64 });
  }
  for (const name of payload.deletes || []) {
    if (!FILE_RE.test(name)) throw httpError(400, 'اسم ملف غير صحيح');
    files.push({ path: `${dir}/${name}`, delete: true });
  }

  // الصور المتاحة بعد الحفظ = الموجودة في المستودع + المرفوعة − المحذوفة
  const images = new Set(
    (await gh.tree())
      .filter((t) => t.type === 'blob' && t.path.startsWith(dir + '/'))
      .map((t) => t.path.slice(dir.length + 1)),
  );
  for (const f of files) {
    const name = f.path.slice(dir.length + 1);
    f.delete ? images.delete(name) : images.add(name);
  }

  const cleaned = clean(data);
  const problem = validate(type, cleaned, images);
  if (problem) throw httpError(400, problem);

  const front = stringify(cleaned, { lineWidth: 0 }).trimEnd();
  const body = String(payload.body || '').replace(/\r\n/g, '\n').trim();
  files.push({ path, text: `---\n${front}\n---\n\n${body}\n` });

  const label = type === 'translations' ? 'تعريب' : 'مقال';
  const sha = await gh.commit(`${payload.isNew ? 'إضافة' : 'تعديل'} ${label}: ${data.title}`, files);

  // تعريب جديد غير مسودة: إعلان تلقائي في ديسكورد (فشل الإعلان لا يُفشل الحفظ)
  let discord = null;
  if (type === 'translations' && payload.isNew && !cleaned.draft && gh.env.DISCORD_WEBHOOK_URL) {
    try {
      await postDiscord(gh.env, slug, cleaned);
      discord = 'sent';
    } catch (err) {
      console.log('Discord announce failed', err.message);
      discord = 'failed';
    }
  }
  return { ok: true, sha, discord };
}

async function deleteEntry(gh, url) {
  const type = checkType(url.searchParams.get('type'));
  const slug = checkSlug(url.searchParams.get('slug'));
  const tree = await gh.tree();
  const files =
    type === 'translations'
      ? tree.filter((t) => t.type === 'blob' && t.path.startsWith(`${PATHS[type]}/${slug}/`))
      : tree.filter((t) => t.path === entryPath(type, slug));
  if (!files.length) throw httpError(404, 'غير موجود');
  await gh.commit(`حذف: ${slug}`, files.map((f) => ({ path: f.path, delete: true })));
  return { ok: true };
}

/** يحذف الحقول الفارغة حتى يبقى الملف نظيفاً */
function clean(value) {
  if (Array.isArray(value)) return value.map(clean).filter((v) => v !== undefined);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const c = clean(v);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  if (value === '' || value === null || value === undefined) return undefined;
  return value;
}

/**
 * يتحقق من البيانات بنفس شروط src/content.config.ts قبل الحفظ،
 * حتى لا يُحفظ ملف يُفشل بناء الموقع ويوقف النشر.
 * يُرجع رسالة الخطأ، أو null إذا كانت البيانات سليمة.
 */
function validate(type, d, images) {
  const isStr = (v) => typeof v === 'string' && v.trim() !== '';
  const isDate = (v) => (typeof v === 'string' || v instanceof Date) && !isNaN(new Date(v).getTime());
  const strList = (v) => v === undefined || (Array.isArray(v) && v.every(isStr));
  const objList = (v, check) => v === undefined || (Array.isArray(v) && v.every((o) => o && typeof o === 'object' && check(o)));
  const optional = (v, check) => v === undefined || check(v);
  const isBool = (v) => typeof v === 'boolean';
  const prefix = type === 'translations' ? './' : './images/';
  const imageOk = (v) => isStr(v) && v.startsWith(prefix) && images.has(v.slice(prefix.length));

  if (type === 'translations') {
    if (!isStr(d.title)) return 'اسم اللعبة الأصلي مطلوب';
    if (!isStr(d.titleAr)) return 'اسم اللعبة بالعربية مطلوب';
    if (!isStr(d.summary)) return 'الوصف القصير مطلوب';
    if (!['modern', 'retro', 'vn', 'mod'].includes(d.category)) return 'التصنيف غير صحيح';
    if (!optional(d.status, (v) => ['complete', 'beta', 'in-progress'].includes(v))) return 'الحالة غير صحيحة';
    if (!optional(d.progress, (v) => typeof v === 'number' && v >= 0 && v <= 100)) return 'نسبة الإنجاز يجب أن تكون بين 0 و 100';
    if (!strList(d.platforms)) return 'المنصات غير صحيحة';
    if (!isDate(d.releaseDate)) return 'تاريخ الإصدار مطلوب';
    if (!optional(d.updatedDate, isDate)) return 'تاريخ آخر تحديث غير صحيح';
    if (!optional(d.version, isStr) || !optional(d.gameVersion, isStr)) return 'رقم الإصدار غير صحيح';
    if (!optional(d.featured, isBool) || !optional(d.draft, isBool)) return 'بيانات غير صحيحة';
    if (!imageOk(d.cover)) return 'صورة الغلاف مطلوبة';
    if (!optional(d.banner, imageOk)) return 'صورة البانر غير موجودة، أعد اختيارها';
    if (!(d.screenshots === undefined || (Array.isArray(d.screenshots) && d.screenshots.every(imageOk)))) {
      return 'إحدى لقطات الشاشة غير موجودة، احذفها وأعد إضافتها';
    }
    const ytOk = (v) =>
      isStr(v) && /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(v) &&
      /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)[\w-]{11}/.test(v);
    if (!optional(d.video, ytOk)) return 'رابط الفيديو يجب أن يكون رابط فيديو من يوتيوب يبدأ بـ https://';
    const dlOk = (o) => isStr(o.label) && isStr(o.url) && /^https?:\/\//i.test(o.url) && optional(o.size, isStr);
    if (!objList(d.downloads, dlOk)) return 'كل رابط تحميل يحتاج اسماً ورابطاً يبدأ بـ https://';
    if (!strList(d.requirements)) return 'المتطلبات غير صحيحة';
    if (!objList(d.team, (o) => isStr(o.name) && isStr(o.role))) return 'كل عضو في الفريق يحتاج اسماً ودوراً';
    const clOk = (o) => isStr(o.version) && isDate(o.date) && Array.isArray(o.notes) && o.notes.every(isStr);
    if (!objList(d.changelog, clOk)) return 'كل إصدار في سجل التحديثات يحتاج رقم إصدار وتاريخ';
  } else {
    if (!isStr(d.title)) return 'العنوان مطلوب';
    if (!isStr(d.description)) return 'الوصف القصير مطلوب';
    if (!isDate(d.date)) return 'التاريخ مطلوب';
    if (!optional(d.kind, (v) => ['article', 'lesson'].includes(v))) return 'النوع غير صحيح';
    if (!optional(d.cover, imageOk)) return 'صورة الغلاف غير موجودة، أعد اختيارها';
    if (!strList(d.tags)) return 'الوسوم غير صحيحة';
    if (!optional(d.draft, isBool)) return 'بيانات غير صحيحة';
  }
  return null;
}

// ------------------------------------------------------------
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}
function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}
