// ============================================================
//  حضور بوت ديسكورد "تعريبات" (يظهر متصلاً في قائمة الأعضاء)
//  - Durable Object واحد يمسك اتصال Gateway مفتوحاً ويرسل نبضات القلب
//  - المنبّه (alarm) كل 30 ثانية يرسل النبضة ويبقي الكائن حياً، ويعيد الاتصال إن انقطع
//  - مهمة cron كل دقيقة توقظه لو توقف لأي سبب
//  يستقبل رسائل السيرفر (GUILDS + GUILD_MESSAGES + MESSAGE_CONTENT) ويمررها لـ worker/chatbot.js
//  (حارس الروابط والردود الذكية)؛ أزرار الطلبات ما زالت عبر /api/discord/interactions
// ============================================================

import { ChatBot } from './chatbot.js';

const GATEWAY = 'https://gateway.discord.gg/?v=10&encoding=json';
// GUILDS (1) + GUILD_MESSAGES (512) + MESSAGE_CONTENT (32768)
const INTENTS = 1 | (1 << 9) | (1 << 15);
const TICK_MS = 30_000;
const PRESENCE = {
  status: 'online',
  since: null,
  afk: false,
  // type 3 = "Watching": يظهر «يشاهد ta3reebat.com»
  activities: [{ name: 'ta3reebat.com', type: 3 }],
};

export class BotPresence {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.ws = null;
    this.seq = null;
    this.acked = true;
    this.connecting = null;
    this.chat = new ChatBot(state, env);
  }

  // يُستدعى من cron: يتأكد أن المنبّه يعمل والاتصال قائم
  async fetch(request) {
    // ‎/api/bot-status: حالة الاتصال وآخر الأحداث والأخطاء (بدون أسرار) لتشخيص البوت
    if (new URL(request.url).pathname === '/status') {
      return Response.json({ connected: !!this.ws, seq: this.seq, ...this.chat.status() });
    }
    await this.ensure();
    return new Response('ok');
  }

  async alarm() {
    await this.ensure();
  }

  async ensure() {
    if (!this.ws) {
      await this.connect();
    } else if (!this.acked) {
      // النبضة السابقة بلا رد: الاتصال ميت
      this.drop();
      await this.connect();
    } else {
      this.heartbeat();
    }
    await this.state.storage.setAlarm(Date.now() + TICK_MS);
  }

  drop() {
    try { this.ws?.close(1000, 'reconnect'); } catch {}
    this.ws = null;
    this.seq = null;
    this.acked = true;
  }

  heartbeat() {
    this.acked = false;
    this.send({ op: 1, d: this.seq });
  }

  send(payload) {
    try { this.ws?.send(JSON.stringify(payload)); } catch { this.ws = null; }
  }

  async connect() {
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const resp = await fetch(GATEWAY, { headers: { Upgrade: 'websocket' } });
      const ws = resp.webSocket;
      if (!ws) throw new Error(`Discord gateway: ${resp.status}`);
      ws.accept();
      this.ws = ws;
      this.acked = true;
      ws.addEventListener('message', (ev) => this.onMessage(ws, ev.data));
      const lost = (ev) => {
        this.chat.note(`closed ${ev?.code ?? ''} ${ev?.reason ?? ''}`);
        if (this.ws === ws) this.ws = null;
      };
      ws.addEventListener('close', lost);
      ws.addEventListener('error', lost);
    })().finally(() => { this.connecting = null; });
    return this.connecting;
  }

  onMessage(ws, data) {
    if (ws !== this.ws) return;
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (msg.s != null) this.seq = msg.s;
    switch (msg.op) {
      case 10: // Hello
        this.send({
          op: 2,
          d: {
            token: this.env.DISCORD_BOT_TOKEN,
            intents: INTENTS,
            properties: { os: 'cloudflare', browser: 'ta3reebat', device: 'ta3reebat' },
            presence: PRESENCE,
          },
        });
        break;
      case 0: // Dispatch
        this.chat.note(msg.t);
        if (msg.t === 'READY') this.chat.setBotId(msg.d.user.id);
        else if (msg.t === 'MESSAGE_CREATE')
          this.chat.onMessage(msg.d).catch((e) => this.chat.fail('onMessage', e));
        break;
      case 11: // Heartbeat ACK
        this.acked = true;
        break;
      case 1: // الخادم يطلب نبضة الآن
        this.send({ op: 1, d: this.seq });
        break;
      case 7: // Reconnect
        this.chat.note(`op ${msg.op}`);
      case 9: // Invalid Session
        this.drop(); // المنبّه التالي يعيد الاتصال
        break;
    }
  }
}

// يوقظ كائن الحضور (من cron)
export function botStatus(env) {
  return env.BOT_PRESENCE.get(env.BOT_PRESENCE.idFromName('bot')).fetch('https://presence/status');
}

export function keepPresence(env) {
  const stub = env.BOT_PRESENCE.get(env.BOT_PRESENCE.idFromName('bot'));
  return stub.fetch('https://presence/');
}
