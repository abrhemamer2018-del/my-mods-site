// ============================================================
//  بوت ديسكورد "تعريبات": طلبات التعريب (Interactions عبر HTTP)
//  ديسكورد يرسل ضغطات الأزرار والنماذج إلى /api/discord/interactions،
//  فلا يحتاج البوت جهازاً يعمل طوال الوقت.
//
//  - زر "طلب تعريب" (منشور مثبت في منتدى طلب-تعريب) → نموذج: رابط اللعبة في Steam أو اسمها
//  - يُقاس أعلى عدد لاعبين خلال 30 يوماً:
//      أقل من MIN_PEAK  → رفض مهذب مخفي (لا يراه غير صاحب الطلب)
//      MIN_PEAK أو أكثر → منشور "تحتاج تصويت"، ويصير "جاهزة للمراجعة" عند VOTES_NEEDED أصوات
//    (منذ 2026-10-30 الشرطان معاً: ما نعرّب لعبة ما وصلت VOTES_NEEDED أصوات، وصوت صاحب الطلب واحد منها)
//  - الصوت = الانضمام إلى منشور الطلب (Thread member)، فيتابع اللاعب الطلب ولا يتكرر صوته
//
//  الإعدادات:
//    DISCORD_PUBLIC_KEY, DISCORD_REQUESTS_FORUM, DISCORD_REQUESTS_LOG  في wrangler.jsonc (ليست سرية)
//    DISCORD_BOT_TOKEN  سر في Cloudflare (Settings → Variables and Secrets)
// ============================================================

export const MIN_PEAK = 1000;
export const VOTES_NEEDED = 5;
// عضو نُشر له طلب لا يرسل طلباً جديداً قبل أسبوع
export const REQUEST_EVERY = 7 * 86400000;

export const TAGS = {
  hot: 'مطلوبة بقوة',
  vote: 'تحتاج تصويت',
  ready: 'جاهزة للمراجعة',
};

const API = 'https://discord.com/api/v10';
const SITE_URL = 'https://ta3reebat.com';
const VOTES_FIELD = 'الأصوات';
const VOTE_TEXT =
  `🗳️ تحتاج **${VOTES_NEEDED} أصوات** عشان تدخل قائمة المراجعة، وما نعرّب لعبة ما وصلت ${VOTES_NEEDED} أصوات.\n` +
  'إذا تبيها معربة اضغط الزر تحت 👇';
const READY_TEXT = `✅ وصلت **${VOTES_NEEDED} أصوات** ودخلت **قائمة المراجعة**.`;
const EPHEMERAL = 64;
const LIVE_TIP =
  `💡 تقدر تلعبها بالعربي الحين مع برنامج **تعريبات لايف**: يترجم نصوص أي لعبة للعربي مباشرة على الشاشة وأنت تلعب.\n` +
  `${SITE_URL}/live/`;

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

  if (game.antiCheat) {
    return (
      `شكراً على طلبك 🌹\n` +
      `**${game.name}** فيها نظام مضاد للغش (Anti-Cheat)، وتعديل ملفاتها ممكن يسبب حظر حسابك، عشان كذا ما نعرّب الألعاب اللي فيها هالنظام.\n\n` +
      LIVE_TIP
    );
  }

  const peak = await peakPlayers(game.id);
  if (peak < MIN_PEAK) {
    // الرفض يصل في رسالة خاصة، فلا يبقى شيء في السيرفر
    return {
      dm:
      `شكراً على طلبك 🌹\n` +
      `**${game.name}** أعلى عدد لاعبين فيها خلال آخر 30 يوم كان **${peak}** لاعب، ` +
      `وحالياً نستقبل طلبات الألعاب اللي يوصل لاعبينها **${MIN_PEAK}** لاعب أو أكثر، عشان نقدر نركز على الألعاب اللي يستفيد منها أكثر عدد.\n\n` +
      LIVE_TIP,
    };
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

  // طلب واحد ناجح في الأسبوع لكل عضو (التصويت على طلب قديم لا يُحسب)
  const last = userId !== env.DISCORD_OWNER_ID && (await lastRequestAt(env, userId));
  if (last) {
    const next = Math.ceil((last + REQUEST_EVERY) / 1000);
    return {
      dm:
        `شكراً على طلبك 🌹\n` +
        `نستقبل طلب تعريب واحد في الأسبوع من كل عضو، وطلبك الأخير كان قبل أقل من أسبوع.\n` +
        `تقدر تطلب **${game.name}** <t:${next}:R> (<t:${next}:f>).`,
    };
  }

  const tags = await forumTags(env);
  const thread = await dc(env, 'POST', `/channels/${env.DISCORD_REQUESTS_FORUM}/threads`, {
    name: game.name.slice(0, 100),
    auto_archive_duration: 10080,
    applied_tags: [tags[TAGS.vote]].filter(Boolean),
    message: {
      embeds: [requestEmbed(game, store, peak, userId, 1)],
      components: voteButton(1),
      allowed_mentions: { parse: [] },
    },
  });
  await dc(env, 'PUT', `/channels/${thread.id}/thread-members/${userId}`);
  await dc(env, 'POST', `/channels/${env.DISCORD_REQUESTS_LOG}/messages`, {
    content: `<@${userId}> طلب **${game.name}** (${peak.toLocaleString('en-US')} لاعب)\nhttps://discord.com/channels/${it.guild_id}/${thread.id}`,
    allowed_mentions: { parse: [] },
  });
  return (
    `تم نشر طلبك ✅\nhttps://discord.com/channels/${it.guild_id}/${thread.id}\n` +
    `يحتاج **${VOTES_NEEDED}** أصوات (صوتك واحد منها) عشان يدخل قائمة المراجعة، شارك الرابط مع اللي يبونها معربة.`
  );
}

function requestEmbed(game, store, peak, userId, votes) {
  return {
    title: game.name,
    url: store,
    color: 0x19c3d6,
    description: VOTE_TEXT,
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

  // البوت عضو في منشوراته وفي الطلبات القديمة التي رد عليها، فلا يُحسب صوتاً. ديسكورد يتوقف عن العد عند 50
  const fresh = await dc(env, 'GET', `/channels/${thread.id}`);
  const ours = fresh.owner_id === env.DISCORD_APP_ID;
  const votes = Math.max(1, (fresh.member_count || 2) - 1);

  // "مطلوبة بقوة" (قبل 2026-10-30) تحتاج الأصوات أيضاً
  const tags = await forumTags(env);
  const applied = fresh.applied_tags || [];
  const waiting = [tags[TAGS.vote], tags[TAGS.hot]].filter((t) => t && applied.includes(t));
  const ready = votes >= VOTES_NEEDED && waiting.length > 0 && !!tags[TAGS.ready];

  const label = fresh.member_count >= 50 ? '+50' : String(votes);
  const msg = ours && (await dc(env, 'GET', `/channels/${thread.id}/messages/${thread.id}`, undefined, true));
  if (msg?.embeds?.[0]) {
    const embed = msg.embeds[0];
    embed.fields = (embed.fields || []).map((f) => (f.name === VOTES_FIELD ? { ...f, value: label } : f));
    if (ready) embed.description = READY_TEXT;
    await dc(env, 'PATCH', `/channels/${thread.id}/messages/${thread.id}`, {
      embeds: [embed],
      components: voteButton(label),
    });
  }

  if (ready) {
    await dc(env, 'PATCH', `/channels/${thread.id}`, {
      applied_tags: [...applied.filter((t) => !waiting.includes(t)), tags[TAGS.ready]],
    });
    await dc(env, 'POST', `/channels/${thread.id}/messages`, {
      content: `✅ وصل الطلب **${VOTES_NEEDED} أصوات** ودخل قائمة المراجعة. شكراً لكل اللي صوّتوا!`,
    });
    await notifyOwner(env, `✅ **طلب وصل ${VOTES_NEEDED} أصوات ودخل قائمة المراجعة:** ${fresh.name}\n` +
      `https://discord.com/channels/${fresh.guild_id}/${thread.id}`);
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
  return {
    id: String(d.steam_appid),
    name: d.name,
    image: d.header_image,
    comingSoon: !!d.release_date?.coming_soon,
    // VAC (8) أو MMO (20) من تصنيفات Steam
    antiCheat: (d.categories || []).some((c) => c.id === 8 || c.id === 20) || (await antiCheatNotice(id)),
  };
}

/** صفحة اللعبة في المتجر تذكر نظام مكافحة الغش (إفصاح Steam عن Kernel، أو اسم النظام) */
async function antiCheatNotice(id) {
  const html = await fetch(`https://store.steampowered.com/app/${id}/?l=english&cc=us`, {
    headers: { Cookie: 'birthtime=0; wants_mature_content=1; lastagecheckage=1-0-1990' },
  })
    .then((r) => (r.ok ? r.text() : ''))
    .catch(() => '');
  return /Kernel Level Anti-Cheat|Easy Anti-Cheat|BattlEye/i.test(html);
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

// اسم اللعبة بلا لاحقة النسخة، فـ BioShock تطابق تعريب BioShock Remastered
const base = (s) =>
  norm(s)
    .replace(/\b(remastered|remaster|definitive|enhanced|complete|ultimate|deluxe|goty|game of the year|directors cut|director s cut|edition|hd)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** رابط صفحة التعريب إن كانت اللعبة معرّبة في الموقع (العنوان في الفهرس: "عربي (English)") */
async function alreadyTranslated(env, origin, name) {
  try {
    const index = await env.ASSETS.fetch(new URL('/admin-index.json', origin)).then((r) => r.json());
    const want = base(name);
    for (const [slug, title] of Object.entries(index.translations || {})) {
      const en = title.match(/\(([^()]*)\)\s*$/)?.[1] || title;
      if (base(en) === want) return `${SITE_URL}/translations/${slug}/`;
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

/** وقت آخر طلب لهذا العضو خلال الأسبوع من روم السجل المخفي، أو null.
 *  كل سطر في السجل يبدأ بمنشن صاحب الطلب؛ حذف السطر يسمح له بطلب جديد */
async function lastRequestAt(env, userId) {
  const since = Date.now() - REQUEST_EVERY;
  let before = '';
  for (let page = 0; page < 5; page++) {
    const msgs = await dc(env, 'GET', `/channels/${env.DISCORD_REQUESTS_LOG}/messages?limit=100${before ? `&before=${before}` : ''}`);
    for (const m of msgs) {
      const at = Date.parse(m.timestamp);
      if (at < since) return null;
      if (m.author?.id === env.DISCORD_APP_ID && m.content.startsWith(`<@${userId}>`)) return at;
    }
    if (msgs.length < 100) break;
    before = msgs[msgs.length - 1].id;
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
/** يشغّل العمل بعد الرد المؤجل، ثم يكتب النتيجة في رسالة مخفية لصاحب التفاعل.
 *  النتيجة { dm } تُرسل خاصاً ويُحذف الرد المخفي؛ وإن كانت رسائله الخاصة مقفلة تبقى في الرد المخفي */
async function background(env, it, work) {
  let content;
  try {
    content = await work();
  } catch (err) {
    console.log('Discord interaction error', err.stack || err);
    content = 'صار خطأ عندنا 😅 حاول مرة ثانية بعد شوي.';
  }
  console.log('Discord reply', it.data?.custom_id, content);
  const original = `${API}/webhooks/${it.application_id}/${it.token}/messages/@original`;
  if (content?.dm) {
    const userId = it.member?.user?.id || it.user?.id;
    try {
      const ch = await dc(env, 'POST', '/users/@me/channels', { recipient_id: userId });
      await dc(env, 'POST', `/channels/${ch.id}/messages`, { content: content.dm, allowed_mentions: { parse: [] } });
      await fetch(original, { method: 'DELETE' });
      return;
    } catch (err) {
      console.log('DM failed', err.message);
      content = content.dm;
    }
  }
  await fetch(original, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
  });
}

/** تنبيه لصاحب السيرفر في قناة التنبيهات الخاصة مع منشن. فشله لا يوقف الطلب */
async function notifyOwner(env, content) {
  if (!env.DISCORD_ALERTS_CHANNEL) return;
  try {
    await dc(env, 'POST', `/channels/${env.DISCORD_ALERTS_CHANNEL}/messages`, {
      content: `<@${env.DISCORD_OWNER_ID}> ${content}`,
      allowed_mentions: { users: [env.DISCORD_OWNER_ID] },
      flags: 4,
    });
  } catch (err) {
    console.log('notifyOwner failed', err.message);
  }
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
