// ============================================================
//  بوت ديسكورد "تعريبات": طلبات التعريب (Interactions عبر HTTP)
//  ديسكورد يرسل ضغطات الأزرار والنماذج إلى /api/discord/interactions،
//  فلا يحتاج البوت جهازاً يعمل طوال الوقت.
//
//  - زر "طلب تعريب" (منشور مثبت في منتدى طلب-تعريب) → نموذج: رابط اللعبة في Steam أو اسمها
//  - يُقاس أعلى عدد لاعبين خلال 30 يوماً:
//      أقل من MIN_PEAK  → رفض مهذب مخفي (لا يراه غير صاحب الطلب)
//      MIN_PEAK..AUTO_PEAK → منشور "تحتاج تصويت"، ويدخل المراجعة عند VOTES_NEEDED صوتاً
//      أكثر من AUTO_PEAK → منشور "مطلوبة بقوة" يدخل المراجعة مباشرة
//  - الصوت = الانضمام إلى منشور الطلب (Thread member)، فيتابع اللاعب الطلب ولا يتكرر صوته
//
//  الإعدادات:
//    DISCORD_PUBLIC_KEY, DISCORD_REQUESTS_FORUM  في wrangler.jsonc (ليست سرية)
//    DISCORD_BOT_TOKEN  سر في Cloudflare (Settings → Variables and Secrets)
// ============================================================

export const MIN_PEAK = 300;
export const AUTO_PEAK = 1000;
export const VOTES_NEEDED = 5;

export const TAGS = {
  hot: 'مطلوبة بقوة',
  vote: 'تحتاج تصويت',
  ready: 'جاهزة للمراجعة',
};

const API = 'https://discord.com/api/v10';
const SITE_URL = 'https://ta3reebat.com';
const VOTES_FIELD = 'الأصوات';
const EPHEMERAL = 64;

/** نقطة الدخول: يتحقق من توقيع ديسكورد ثم يوزّع التفاعل */
export async function discordInteraction(request, env, ctx, helpers) {
  const body = await request.text();
  if (!(await verified(request, body, env.DISCORD_PUBLIC_KEY))) return new Response('bad signature', { status: 401 });
  const it = JSON.parse(body);

  // PING من ديسكورد عند ضبط الرابط في بوابة المطورين
  if (it.type === 1) return reply({ type: 1 });

  const id = it.data?.custom_id || '';
  const userId = it.member?.user?.id || it.user?.id;

  if (it.type === 3 && id === 'req:open') return reply(requestModal());

  if (it.type === 5 && id === 'req:modal') {
    const text = it.data.components?.[0]?.components?.[0]?.value || it.data.components?.[0]?.component?.value || '';
    ctx.waitUntil(background(env, it, () => handleRequest(env, it, userId, text.trim(), helpers)));
    return reply({ type: 5, data: { flags: EPHEMERAL } });
  }

  if (it.type === 3 && id === 'req:vote') {
    ctx.waitUntil(background(env, it, () => handleVote(env, it.channel_id, userId)));
    return reply({ type: 5, data: { flags: EPHEMERAL } });
  }

  return reply({ type: 4, data: { flags: EPHEMERAL, content: 'هذا الزر لم يعد يعمل.' } });
}

// ------------------------------------------------------------
//  طلب تعريب جديد
// ------------------------------------------------------------
function requestModal() {
  return {
    type: 9,
    data: {
      custom_id: 'req:modal',
      title: 'طلب تعريب',
      components: [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: 'game',
              label: 'رابط اللعبة في Steam أو اسمها بالإنجليزي',
              style: 1,
              min_length: 2,
              max_length: 200,
              required: true,
              placeholder: 'https://store.steampowered.com/app/...',
            },
          ],
        },
      ],
    },
  };
}

async function handleRequest(env, it, userId, text, { steamFind, origin }) {
  // رقم اللعبة من الرابط، أو البحث بالاسم
  let appId = text.match(/store\.steampowered\.com\/app\/(\d+)/i)?.[1] || text.match(/^\d{2,9}$/)?.[0];
  if (!appId) appId = (await steamFind(text))?.id;
  const game = appId && (await steamApp(appId));
  if (!game) {
    return 'ما لقينا اللعبة في Steam 🤔\nانسخ رابط صفحتها في متجر Steam وحطه في الطلب.';
  }
  const store = `https://store.steampowered.com/app/${game.id}/`;

  const done = await alreadyTranslated(env, origin, game.name);
  if (done) return `✅ **${game.name}** معرّبة من قبل! تلقاها هنا:\n${done}`;

  if (game.comingSoon) {
    return `**${game.name}** ما نزلت للحين على Steam، اطلبها بعد ما تنزل ونقيس عدد لاعبيها.`;
  }

  const peak = await peakPlayers(game.id);
  if (peak < MIN_PEAK) {
    return (
      `شكراً على طلبك 🌹\n` +
      `**${game.name}** أعلى عدد لاعبين فيها خلال آخر 30 يوم كان **${peak}** لاعب، ` +
      `وحالياً نستقبل طلبات الألعاب اللي يوصل لاعبينها **${MIN_PEAK}** لاعب أو أكثر، عشان نقدر نركز على الألعاب اللي يستفيد منها أكثر عدد.`
    );
  }

  // طلب مكرر: نضيف صوته على المنشور القديم
  const old = await findRequest(env, it.guild_id, game.name);
  if (old) {
    const v = await addVote(env, old, userId);
    return (
      `هذي اللعبة مطلوبة من قبل 👍 ${v.already ? 'وصوتك محسوب من قبل.' : 'أضفنا صوتك على الطلب.'}\n` +
      `https://discord.com/channels/${it.guild_id}/${old.id}`
    );
  }

  const hot = peak >= AUTO_PEAK;
  const tags = await forumTags(env);
  const thread = await dc(env, 'POST', `/channels/${env.DISCORD_REQUESTS_FORUM}/threads`, {
    name: game.name.slice(0, 100),
    auto_archive_duration: 10080,
    applied_tags: [tags[hot ? TAGS.hot : TAGS.vote]].filter(Boolean),
    message: {
      embeds: [requestEmbed(game, store, peak, hot, userId, 1)],
      components: voteButton(1),
      allowed_mentions: { parse: [] },
    },
  });
  await dc(env, 'PUT', `/channels/${thread.id}/thread-members/${userId}`);

  return (
    `تم نشر طلبك ✅\nhttps://discord.com/channels/${it.guild_id}/${thread.id}\n` +
    (hot
      ? 'اللعبة عليها إقبال كبير ودخلت قائمة المراجعة مباشرة.'
      : `تحتاج **${VOTES_NEEDED}** أصوات عشان تدخل قائمة المراجعة، شارك الرابط مع اللي يبونها معربة.`)
  );
}

function requestEmbed(game, store, peak, hot, userId, votes) {
  return {
    title: game.name,
    url: store,
    color: hot ? 0xf26b3a : 0x19c3d6,
    description: hot
      ? '🔥 اللعبة عليها إقبال كبير، ودخلت **قائمة المراجعة** مباشرة.'
      : `🗳️ تحتاج **${VOTES_NEEDED} أصوات** عشان تدخل قائمة المراجعة.\nإذا تبيها معربة اضغط الزر تحت 👇`,
    fields: [
      { name: 'أعلى عدد لاعبين (30 يوم)', value: peak.toLocaleString('en-US'), inline: true },
      { name: VOTES_FIELD, value: String(votes), inline: true },
      { name: 'طلبها', value: `<@${userId}>`, inline: true },
    ],
    image: game.image ? { url: game.image } : undefined,
    footer: { text: `Steam ${game.id} · ta3reebat.com` },
  };
}

function voteButton(votes) {
  return [
    {
      type: 1,
      components: [{ type: 2, style: 1, custom_id: 'req:vote', emoji: { name: '👍' }, label: `أبيها معربة (${votes})` }],
    },
  ];
}

// ------------------------------------------------------------
//  التصويت
// ------------------------------------------------------------
async function handleVote(env, threadId, userId) {
  const thread = await dc(env, 'GET', `/channels/${threadId}`);
  const v = await addVote(env, thread, userId);
  if (v.already) return 'صوتك محسوب من قبل 👍';
  if (v.ready) return `تم تسجيل صوتك 👍 ووصل الطلب ${VOTES_NEEDED} أصوات، ودخل قائمة المراجعة ✅`;
  return 'تم تسجيل صوتك 👍 وبيوصلك تنبيه إذا صار جديد في الطلب.';
}

/** يضيف اللاعب لمنشور الطلب، ويحدّث العداد والوسم في منشورات البوت → { already, votes, ready } */
async function addVote(env, thread, userId) {
  const isMember = await dc(env, 'GET', `/channels/${thread.id}/thread-members/${userId}`, undefined, true);
  if (isMember) return { already: true };

  if (thread.thread_metadata?.archived) {
    await dc(env, 'PATCH', `/channels/${thread.id}`, { archived: false });
  }
  await dc(env, 'PUT', `/channels/${thread.id}/thread-members/${userId}`);

  // البوت صاحب المنشور عضو فيه، فلا يُحسب صوتاً. ديسكورد يتوقف عن العد عند 50
  const fresh = await dc(env, 'GET', `/channels/${thread.id}`);
  const ours = fresh.owner_id === env.DISCORD_APP_ID;
  const votes = Math.max(1, (fresh.member_count || 1) - (ours ? 1 : 0));
  if (!ours) return { votes };

  const label = fresh.member_count >= 50 ? '+50' : String(votes);
  const msg = await dc(env, 'GET', `/channels/${thread.id}/messages/${thread.id}`, undefined, true);
  if (msg?.embeds?.[0]) {
    const embed = msg.embeds[0];
    embed.fields = (embed.fields || []).map((f) => (f.name === VOTES_FIELD ? { ...f, value: label } : f));
    await dc(env, 'PATCH', `/channels/${thread.id}/messages/${thread.id}`, {
      embeds: [embed],
      components: voteButton(label),
    });
  }

  let ready = false;
  const tags = await forumTags(env);
  const applied = fresh.applied_tags || [];
  if (votes >= VOTES_NEEDED && tags[TAGS.vote] && applied.includes(tags[TAGS.vote]) && tags[TAGS.ready]) {
    await dc(env, 'PATCH', `/channels/${thread.id}`, {
      applied_tags: [...applied.filter((t) => t !== tags[TAGS.vote]), tags[TAGS.ready]],
    });
    await dc(env, 'POST', `/channels/${thread.id}/messages`, {
      content: `✅ وصل الطلب **${VOTES_NEEDED} أصوات** ودخل قائمة المراجعة. شكراً لكل اللي صوّتوا!`,
    });
    ready = true;
  }
  return { votes, ready };
}

// ------------------------------------------------------------
//  Steam
// ------------------------------------------------------------
async function steamApp(id) {
  const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${id}&cc=us&l=en`);
  const d = res.ok ? (await res.json())?.[id]?.data : null;
  if (!d || !['game', 'dlc'].includes(d.type)) return null;
  return { id: String(d.steam_appid), name: d.name, image: d.header_image, comingSoon: !!d.release_date?.coming_soon };
}

/** أعلى عدد لاعبين في نفس الوقت خلال 30 يوماً: SteamCharts، ثم SteamSpy (ذروة أمس)، ثم العدد الحالي */
async function peakPlayers(id) {
  const ua = { 'User-Agent': 'Mozilla/5.0 (ta3reebat.com)' };
  const since = Date.now() - 30 * 86400000;
  const tries = await Promise.allSettled([
    fetch(`https://steamcharts.com/app/${id}/chart-data.json`, { headers: ua })
      .then((r) => (r.ok ? r.json() : []))
      .then((pts) => Math.max(0, ...pts.filter(([t]) => t >= since).map(([, n]) => n))),
    fetch(`https://steamspy.com/api.php?request=appdetails&appid=${id}`, { headers: ua })
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => Number(d.ccu) || 0),
    fetch(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${id}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => d.response?.player_count || 0),
  ]);
  return Math.max(0, ...tries.map((t) => (t.status === 'fulfilled' && Number.isFinite(t.value) ? t.value : 0)));
}

const norm = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** رابط صفحة التعريب إن كانت اللعبة معرّبة في الموقع (العنوان في الفهرس: "عربي (English)") */
async function alreadyTranslated(env, origin, name) {
  try {
    const index = await env.ASSETS.fetch(new URL('/admin-index.json', origin)).then((r) => r.json());
    const want = norm(name);
    for (const [slug, title] of Object.entries(index.translations || {})) {
      const en = title.match(/\(([^()]*)\)\s*$/)?.[1] || title;
      if (norm(en) === want) return `${SITE_URL}/translations/${slug}/`;
    }
  } catch {}
  return null;
}

// ------------------------------------------------------------
//  منتدى الطلبات
// ------------------------------------------------------------
/** منشور طلب قديم لنفس اللعبة (مفتوح أو مؤرشف)، بمطابقة الاسم الإنجليزي داخل العنوان */
async function findRequest(env, guildId, name) {
  const want = norm(name);
  if (want.length < 3) return null;
  const match = (t) => ` ${norm(t.name)} `.includes(` ${want} `);

  const active = await dc(env, 'GET', `/guilds/${guildId}/threads/active`);
  const hit = (active.threads || []).find((t) => t.parent_id === env.DISCORD_REQUESTS_FORUM && match(t));
  if (hit) return hit;

  let before = '';
  for (let page = 0; page < 5; page++) {
    const res = await dc(
      env,
      'GET',
      `/channels/${env.DISCORD_REQUESTS_FORUM}/threads/archived/public?limit=100${before ? `&before=${encodeURIComponent(before)}` : ''}`,
    );
    const found = (res.threads || []).find(match);
    if (found) return found;
    if (!res.has_more || !res.threads?.length) break;
    before = res.threads[res.threads.length - 1].thread_metadata.archive_timestamp;
  }
  return null;
}

/** وسوم المنتدى بالاسم → المعرّف */
async function forumTags(env) {
  const forum = await dc(env, 'GET', `/channels/${env.DISCORD_REQUESTS_FORUM}`);
  return Object.fromEntries((forum.available_tags || []).map((t) => [t.name, t.id]));
}

// ------------------------------------------------------------
//  أدوات
// ------------------------------------------------------------
/** يشغّل العمل بعد الرد المؤجل، ثم يكتب النتيجة في رسالة مخفية لصاحب التفاعل */
async function background(env, it, work) {
  let content;
  try {
    content = await work();
  } catch (err) {
    console.log('Discord interaction error', err.stack || err);
    content = 'صار خطأ عندنا 😅 حاول مرة ثانية بعد شوي.';
  }
  console.log('Discord reply', it.data?.custom_id, content);
  await fetch(`${API}/webhooks/${it.application_id}/${it.token}/messages/@original`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
  });
}

/** طلب إلى ديسكورد بتوكن البوت. optional: يرجع null عند 404 بدل الخطأ */
async function dc(env, method, path, body, optional = false) {
  if (!env.DISCORD_BOT_TOKEN) throw new Error('DISCORD_BOT_TOKEN غير مضبوط');
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'DiscordBot (https://ta3reebat.com, 1)',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (optional && res.status === 404) return null;
  if (!res.ok) throw new Error(`Discord ${method} ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? {} : res.json();
}

async function verified(request, body, publicKey) {
  const sig = request.headers.get('X-Signature-Ed25519');
  const time = request.headers.get('X-Signature-Timestamp');
  if (!sig || !time || !publicKey) return false;
  const hex = (h) => new Uint8Array(h.match(/../g).map((b) => parseInt(b, 16)));
  try {
    const key = await crypto.subtle.importKey('raw', hex(publicKey), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, hex(sig), new TextEncoder().encode(time + body));
  } catch {
    return false;
  }
}

function reply(data) {
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
}
