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
export const VOTES_NEEDED = 10;
// عضو نُشر له طلب لا يرسل طلباً جديداً قبل أسبوع
export const REQUEST_EVERY = 7 * 86400000;
// أصوات كل عضو خلال 7 أيام (صاحب السيرفر مستثنى؛ صوت صاحب الطلب على طلبه ما يُحسب منها)
export const VOTES_PER_WEEK = 3;
// سقف شغل صاحب السيرفر: ما يكون في «جاهزة للمراجعة» + «قيد التعريب» أكثر من هذا العدد (user's rule 2026-11-11:
// ما يقدر يعرّب أكثر من 3 ألعاب في اليوم). اللي تكمّل أصواتها والقائمة مليانة تاخذ «بانتظار دورها» (queueTick)
export const READY_CAP = 3;

export const TAGS = {
  hot: 'مطلوبة بقوة',
  vote: 'تحتاج تصويت',
  ready: 'جاهزة للمراجعة',
  // لعبة جربناها وما نقدر نعرّبها: البوت لا يضيف أصواتاً ولا يعيد فتح منشورها (الوسم يضيفه صاحب السيرفر بيده)
  closed: 'غير ممكنة',
  // لعبة نزل تعريبها في الموقع: منشورها مقفل ومؤرشف (closeTranslatedRequest)
  done: 'تم التعريب',
  progress: 'قيد التعريب',
  queue: 'بانتظار دورها',
};

const API = 'https://discord.com/api/v10';
const SITE_URL = 'https://ta3reebat.com';
const VOTES_FIELD = 'الأصوات';
const VOTE_TEXT =
  `🗳️ تحتاج **${VOTES_NEEDED} أصوات** عشان تدخل قائمة المراجعة، وما نعرّب لعبة ما وصلت ${VOTES_NEEDED} أصوات.\n` +
  'إذا تبيها معربة اضغط الزر تحت 👇';
const NO_DATES = 'ما نعطي مواعيد، وأول ما يتغير شي بيوصلكم تنبيه هنا 🔔';
const READY_TEXT = `✅ وصلت **${VOTES_NEEDED} أصوات** ودخلت **قائمة المراجعة**.\n${NO_DATES}`;
const queueText = (pos, n) =>
  `✅ وصلت **${VOTES_NEEDED} أصوات** وهي الحين **بانتظار دورها** للمراجعة.\n📋 دورها: **${pos} من ${n}**.\n${NO_DATES}`;
const PROGRESS_TEXT = '🛠️ **قيد التعريب**: بدأنا نشتغل عليها.\nما نعطي مواعيد، وأول ما ينزل التعريب بيوصلكم تنبيه هنا 🔔';
const CLOSED_TEXT = '⛔ **غير ممكنة**: جربنا نعرّبها وللأسف ما نقدر حالياً.';
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

  if (it.type === 3 && id === 'ask:open') {
    ctx.waitUntil(background(env, it, () => openInquiry(env, it, userId)));
    return reply({ type: 5, data: { flags: EPHEMERAL } });
  }

  if (it.type === 3 && id === 'ask:close') {
    ctx.waitUntil(background(env, it, () => closeInquiry(env, it.channel_id, userId)));
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
    if (v.limit) {
      return {
        dm:
          `هذي اللعبة مطلوبة من قبل 👍
https://discord.com/channels/${it.guild_id}/${old.id}

` + limitText(v.next),
      };
    }
    if (v.closed) {
      return {
        dm:
          `شكراً على طلبك 🌹
` +
          `**${game.name}** جربناها من قبل وللأسف ما نقدر نعرّبها حالياً، والسبب مكتوب هنا:
` +
          `https://discord.com/channels/${it.guild_id}/${old.id}

` +
          LIVE_TIP,
      };
    }
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
  if (v.closed) return `هذي اللعبة ما نقدر نعرّبها حالياً، والسبب مكتوب في المنشور.

${LIVE_TIP}`;
  if (v.already) return 'صوتك محسوب من قبل 👍';
  if (v.limit) return limitText(v.next);
  if (v.ready) return `تم تسجيل صوتك 👍 ووصل الطلب ${VOTES_NEEDED} أصوات، ودخل قائمة المراجعة ✅`;
  if (v.queued) return `تم تسجيل صوتك 👍 ووصل الطلب ${VOTES_NEEDED} أصوات، ودخل طابور الانتظار للمراجعة ⏳`;
  return 'تم تسجيل صوتك 👍 وبيوصلك تنبيه إذا صار جديد في الطلب.';
}

function limitText(next) {
  const t = Math.ceil(next / 1000);
  return `كل عضو له **${VOTES_PER_WEEK} أصوات** في الأسبوع، واستخدمتها كلها 🗳️
تقدر تصوّت مرة ثانية <t:${t}:R> (<t:${t}:f>).`;
}

/** يضيف اللاعب لمنشور الطلب، ويحدّث العداد والوسم في منشورات البوت → { already, votes, ready } */
async function addVote(env, thread, userId) {
  const tags = await forumTags(env);
  if (tags[TAGS.closed] && (thread.applied_tags || []).includes(tags[TAGS.closed])) return { closed: true };

  const isMember = await dc(env, 'GET', `/channels/${thread.id}/thread-members/${userId}`, undefined, true);
  if (isMember) return { already: true };

  // حد الأصوات الأسبوعي: كل صوت سطر "<@id> صوّت" في روم السجل المخفي
  if (userId !== env.DISCORD_OWNER_ID) {
    const used = await logTimes(env, userId, 'صوّت');
    if (used.length >= VOTES_PER_WEEK) return { limit: true, next: Math.min(...used) + REQUEST_EVERY };
  }

  if (thread.thread_metadata?.archived) {
    await dc(env, 'PATCH', `/channels/${thread.id}`, { archived: false });
  }
  await dc(env, 'PUT', `/channels/${thread.id}/thread-members/${userId}`);
  await dc(env, 'POST', `/channels/${env.DISCORD_REQUESTS_LOG}/messages`, {
    content: `<@${userId}> صوّت على **${thread.name}**
https://discord.com/channels/${thread.guild_id}/${thread.id}`,
    allowed_mentions: { parse: [] },
  });

  // البوت عضو في منشوراته وفي الطلبات القديمة التي رد عليها، فلا يُحسب صوتاً. ديسكورد يتوقف عن العد عند 50
  const fresh = await dc(env, 'GET', `/channels/${thread.id}`);
  const ours = fresh.owner_id === env.DISCORD_APP_ID;
  const votes = Math.max(1, (fresh.member_count || 2) - 1);

  // "مطلوبة بقوة" (قبل 2026-10-30) تحتاج الأصوات أيضاً
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

  let queued = false;
  if (ready) {
    const posts = await allPosts(env);
    const live = (p) => !hasTag(p, tags[TAGS.closed]) && !hasTag(p, tags[TAGS.done]);
    const busy = posts.filter((p) => live(p) && (hasTag(p, tags[TAGS.ready]) || hasTag(p, tags[TAGS.progress]))).length;
    const keep = applied.filter((t) => !waiting.includes(t));
    if (busy < READY_CAP || !tags[TAGS.queue]) {
      await dc(env, 'PATCH', `/channels/${thread.id}`, { applied_tags: [...keep, tags[TAGS.ready]] });
      await say(env, thread.id, `✅ وصل الطلب **${VOTES_NEEDED} أصوات** ودخل قائمة المراجعة. شكراً لكل اللي صوّتوا!`);
      await notifyOwner(env, `✅ **طلب وصل ${VOTES_NEEDED} أصوات ودخل قائمة المراجعة:** ${fresh.name}\n` +
        `https://discord.com/channels/${fresh.guild_id}/${thread.id}`);
    } else {
      queued = true;
      await dc(env, 'PATCH', `/channels/${thread.id}`, { applied_tags: [...keep, tags[TAGS.queue]] });
      const n = posts.filter((p) => live(p) && hasTag(p, tags[TAGS.queue])).length + 1;
      if (msg?.embeds?.[0]) {
        await dc(env, 'PATCH', `/channels/${thread.id}/messages/${thread.id}`, {
          embeds: [{ ...msg.embeds[0], description: queueText(n, n) }],
        });
      }
      await say(env, thread.id,
        `✅ وصل الطلب **${VOTES_NEEDED} أصوات**! قائمة المراجعة مليانة الحين، فدخل **طابور الانتظار** (دوره ${n}).\n` +
        'أول ما يفضى مكان يدخل لحاله، واللي أصواته أكثر يدخل أول. كمّلوا التصويت 👍');
    }
  }
  return { votes, ready: ready && !queued, queued };
}

// ------------------------------------------------------------
//  طابور المراجعة (كل 10 دقائق من cron)
// ------------------------------------------------------------
const hasTag = (t, id) => !!id && (t.applied_tags || []).includes(id);
const votesOf = (t) => Math.max(1, (t.member_count || 2) - 1);

/** كل منشورات منتدى الطلبات (المفتوحة والمؤرشفة) */
async function allPosts(env) {
  const forum = await dc(env, 'GET', `/channels/${env.DISCORD_REQUESTS_FORUM}`);
  const active = await dc(env, 'GET', `/guilds/${forum.guild_id}/threads/active`);
  const posts = (active.threads || []).filter((t) => t.parent_id === env.DISCORD_REQUESTS_FORUM);
  let before = '';
  for (let page = 0; page < 5; page++) {
    const res = await dc(env, 'GET',
      `/channels/${env.DISCORD_REQUESTS_FORUM}/threads/archived/public?limit=100${before ? `&before=${encodeURIComponent(before)}` : ''}`);
    posts.push(...(res.threads || []));
    if (!res.has_more || !res.threads?.length) break;
    before = res.threads[res.threads.length - 1].thread_metadata.archive_timestamp;
  }
  return posts;
}

/** رسالة من البوت داخل المنشور (توصل تنبيه لكل اللي صوّتوا، بدون منشن) */
async function say(env, threadId, content) {
  const t = await dc(env, 'GET', `/channels/${threadId}`);
  if (t.thread_metadata?.archived) await dc(env, 'PATCH', `/channels/${threadId}`, { archived: false });
  await dc(env, 'POST', `/channels/${threadId}/messages`, { content, allowed_mentions: { parse: [] } });
}

/** يغيّر نص بطاقة الطلب (منشورات البوت فقط) ويرجّع النص القديم، أو null إذا ما فيه بطاقة */
async function setCard(env, threadId, description, removeButton = false) {
  const msg = await dc(env, 'GET', `/channels/${threadId}/messages/${threadId}`, undefined, true);
  const embed = msg?.embeds?.[0];
  if (!embed) return null;
  const old = embed.description || '';
  if (old !== description || (removeButton && msg.components?.length)) {
    const t = await dc(env, 'GET', `/channels/${threadId}`);
    if (t.thread_metadata?.archived) await dc(env, 'PATCH', `/channels/${threadId}`, { archived: false });
    await dc(env, 'PATCH', `/channels/${threadId}/messages/${threadId}`, {
      embeds: [{ ...embed, description }],
      ...(removeButton ? { components: [] } : {}),
    });
  }
  return old;
}

/** يدخل ألعاب الطابور لما يفضى مكان، يحدّث أرقام الدور، ويبلغ المصوّتين لما صاحب السيرفر يحط
 *  «قيد التعريب» أو «غير ممكنة» بيده */
export async function queueTick(env) {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_REQUESTS_FORUM) return;
  const tags = await forumTags(env);
  if (!tags[TAGS.queue]) return;
  const posts = (await allPosts(env)).filter((t) => t.owner_id === env.DISCORD_APP_ID);

  for (const t of posts) {
    if (hasTag(t, tags[TAGS.done])) continue;
    if (hasTag(t, tags[TAGS.closed])) {
      const old = await setCard(env, t.id, CLOSED_TEXT, true);
      if (old !== null && !old.startsWith('⛔')) {
        await say(env, t.id, `⛔ للأسف جربنا نعرّب **${t.name}** وما نقدر نعرّبها حالياً.\n\n${LIVE_TIP}`);
        await dc(env, 'PATCH', `/channels/${t.id}`, { archived: true, locked: true });
      } else if (old !== null && !t.thread_metadata?.archived) {
        await dc(env, 'PATCH', `/channels/${t.id}`, { archived: true, locked: true });
      }
    } else if (hasTag(t, tags[TAGS.progress])) {
      const old = await setCard(env, t.id, PROGRESS_TEXT);
      if (old !== null && !old.startsWith('🛠️')) {
        await say(env, t.id, `🛠️ بدأنا تعريب **${t.name}**! أول ما ينزل بيوصلكم تنبيه هنا.`);
      }
    }
  }

  const live = (t) => !hasTag(t, tags[TAGS.closed]) && !hasTag(t, tags[TAGS.done]);
  let busy = posts.filter((t) => live(t) && (hasTag(t, tags[TAGS.ready]) || hasTag(t, tags[TAGS.progress]))).length;
  // الأكثر أصواتاً أول، ولو تساووا الأقدم أول
  const queue = posts
    .filter((t) => live(t) && hasTag(t, tags[TAGS.queue]))
    .sort((a, b) => votesOf(b) - votesOf(a) || (BigInt(a.id) < BigInt(b.id) ? -1 : 1));

  while (busy < READY_CAP && queue.length) {
    const t = queue.shift();
    busy++;
    await dc(env, 'PATCH', `/channels/${t.id}`, {
      applied_tags: [...t.applied_tags.filter((x) => x !== tags[TAGS.queue]), tags[TAGS.ready]],
    });
    await setCard(env, t.id, READY_TEXT);
    await say(env, t.id, `✅ جا دور **${t.name}** ودخلت قائمة المراجعة!\n${NO_DATES}`);
    await notifyOwner(env, `✅ **دخلت قائمة المراجعة من الطابور:** ${t.name}\nhttps://discord.com/channels/${t.guild_id}/${t.id}`);
  }
  for (let i = 0; i < queue.length; i++) await setCard(env, queue[i].id, queueText(i + 1, queue.length));
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
async function findRequest(env, guildId, name, exact = false) {
  const want = norm(name);
  if (want.length < 3) return null;
  // exact: الاسم كاملاً (إقفال منشور بعد التعريب)، فـ Far Cry لا يقفل منشور Far Cry 3
  const match = (t) => (exact ? norm(t.name) === want : ` ${norm(t.name)} `.includes(` ${want} `));

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

/** نزل تعريب اللعبة في الموقع: منشور طلبها يأخذ وسم «تم التعريب» ويُقفل ويؤرشف، وتنزل فيه رسالة بالرابط
 *  (تنبيه للمصوّتين، بدون منشن)،
 *  فيختفي من «تحتاج تصويت» و«جاهزة للمراجعة». الطلب المكرر بعدها يأخذ رابط الموقع (alreadyTranslated) */
export async function closeTranslatedRequest(env, name, url) {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_REQUESTS_FORUM) return null;
  const forum = await dc(env, 'GET', `/channels/${env.DISCORD_REQUESTS_FORUM}`);
  const tags = Object.fromEntries((forum.available_tags || []).map((t) => [t.name, t.id]));
  const post = tags[TAGS.done] && (await findRequest(env, forum.guild_id, name, true));
  if (!post) return null;
  if (post.thread_metadata?.archived) await dc(env, 'PATCH', `/channels/${post.id}`, { archived: false });
  await dc(env, 'PATCH', `/channels/${post.id}`, { applied_tags: [tags[TAGS.done]] });
  if (post.owner_id === env.DISCORD_APP_ID && url) {
    await setCard(env, post.id, `🎉 **تم التعريب**: ${url}`, true);
    await say(env, post.id, `🎉 نزل تعريب **${post.name}**! شكراً لكل اللي صوّتوا 🌹\n${url}`);
  }
  await dc(env, 'PATCH', `/channels/${post.id}`, { archived: true, locked: true });
  return post.id;
}

/** وقت آخر طلب لهذا العضو خلال الأسبوع، أو null (حذف سطره من روم السجل يسمح له بطلب جديد) */
async function lastRequestAt(env, userId) {
  const times = await logTimes(env, userId, 'طلب');
  return times.length ? Math.max(...times) : null;
}

/** أوقات أسطر هذا العضو من نوع kind ("طلب" أو "صوّت") خلال آخر 7 أيام في روم السجل المخفي.
 *  كل سطر يبدأ بمنشن العضو ثم النوع؛ حذف السطر يرجّع له الطلب أو الصوت */
async function logTimes(env, userId, kind) {
  const since = Date.now() - REQUEST_EVERY;
  const head = `<@${userId}> ${kind} `;
  const times = [];
  let before = '';
  for (let page = 0; page < 15; page++) {
    const msgs = await dc(env, 'GET', `/channels/${env.DISCORD_REQUESTS_LOG}/messages?limit=100${before ? `&before=${before}` : ''}`);
    for (const m of msgs) {
      const at = Date.parse(m.timestamp);
      if (at < since) return times;
      if (m.author?.id === env.DISCORD_APP_ID && m.content.startsWith(head)) times.push(at);
    }
    if (msgs.length < 100) break;
    before = msgs[msgs.length - 1].id;
  }
  return times;
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

// ------------------------------------------------------------
//  الاستفسارات (user's rule 2026-11-12): زر «فتح استفسار» في روم ❓استفسارات يفتح Thread خاص (type 12)
//  ما يشوفه غير صاحبه والإدارة (Admin يشوف كل الـ Threads الخاصة، ومنشن رتبة Admin يضيفهم للصفحة).
//  الأعضاء ما يقدرون يكتبون في الروم نفسه ولا يفتحون Threads بأنفسهم؛ يكتبون داخل صفحتهم بس.
// ------------------------------------------------------------
export const INQUIRY_CHANNEL = '1570271165853860002';
const ADMIN_ROLE = '1556989733945475103';

async function openInquiry(env, it, userId) {
  const user = it.member?.user || it.user || {};
  const name = (user.global_name || user.username || 'عضو').slice(0, 40);
  // صفحة مفتوحة وحدة لكل عضو
  const active = await dc(env, 'GET', `/guilds/${it.guild_id}/threads/active`);
  for (const t of active.threads || []) {
    if (t.parent_id !== INQUIRY_CHANNEL) continue;
    if (await dc(env, 'GET', `/channels/${t.id}/thread-members/${userId}`, undefined, true)) {
      return `عندك صفحة استفسار مفتوحة: <#${t.id}>\nاكتب فيها، وإذا خلصت اضغط «إغلاق الاستفسار».`;
    }
  }
  const t = await dc(env, 'POST', `/channels/${INQUIRY_CHANNEL}/threads`, {
    name: `❓ ${name}`,
    type: 12,
    invitable: false,
    auto_archive_duration: 10080,
  });
  await dc(env, 'PUT', `/channels/${t.id}/thread-members/${userId}`);
  await dc(env, 'POST', `/channels/${t.id}/messages`, {
    content:
      `أهلاً <@${userId}> 👋 هذي صفحتك الخاصة، ما يشوفها غيرك وغير <@&${ADMIN_ROLE}>.\n` +
      'اكتب استفسارك بالتفصيل هنا (وأرفق صورة إذا تحتاج)، وبنرد عليك هنا بأقرب وقت.\n' +
      '⚠️ إذا عندك مشكلة في تعريب لعبة، البلاغ يكون في <#1558118652979454053> عشان نتابعه مع باقي البلاغات.',
    allowed_mentions: { users: [userId], roles: [ADMIN_ROLE] },
    components: [
      { type: 1, components: [{ type: 2, style: 4, custom_id: 'ask:close', emoji: { name: '🔒' }, label: 'إغلاق الاستفسار' }] },
    ],
  });
  await notifyOwner(env, `❓ **استفسار جديد** من <@${userId}> (${user.username}): <#${t.id}>`);
  return `✅ انفتحت لك صفحة خاصة: <#${t.id}>\nاكتب استفسارك هناك.`;
}

async function closeInquiry(env, threadId, userId) {
  const t = await dc(env, 'GET', `/channels/${threadId}`, undefined, true);
  if (!t || t.parent_id !== INQUIRY_CHANNEL) return 'هذا الزر يشتغل داخل صفحة الاستفسار بس.';
  await dc(env, 'POST', `/channels/${threadId}/messages`, {
    content: `🔒 <@${userId}> قفل الاستفسار. إذا احتجت شي ثاني افتح استفسار جديد من <#${INQUIRY_CHANNEL}>.`,
    allowed_mentions: { parse: [] },
  });
  await dc(env, 'PATCH', `/channels/${threadId}`, { archived: true, locked: true });
  return '🔒 انقفل الاستفسار.';
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
