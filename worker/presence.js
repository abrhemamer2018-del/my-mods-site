// ============================================================
//  حضور بوت ديسكورد "تعريبات" (يظهر متصلاً في قائمة الأعضاء)
//  - Durable Object واحد يمسك اتصال Gateway مفتوحاً ويرسل نبضات القلب
//  - المنبّه (alarm) كل 30 ثانية يرسل النبضة ويبقي الكائن حياً، ويعيد الاتصال إن انقطع
//  - مهمة cron كل دقيقة توقظه لو توقف لأي سبب
//  لا يستقبل أي أحداث (intents = 0)؛ الطلبات ما زالت عبر /api/discord/interactions
// ============================================================

const GATEWAY = 'https://gateway.discord.gg/?v=10&encoding=json';
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
  }

  // يُستدعى من cron: يتأكد أن المنبّه يعمل والاتصال قائم
  async fetch() {
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
      const lost = () => { if (this.ws === ws) this.ws = null; };
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
            intents: 0,
            properties: { os: 'cloudflare', browser: 'ta3reebat', device: 'ta3reebat' },
            presence: PRESENCE,
          },
        });
        break;
      case 11: // Heartbeat ACK
        this.acked = true;
        break;
      case 1: // الخادم يطلب نبضة الآن
        this.send({ op: 1, d: this.seq });
        break;
      case 7: // Reconnect
      case 9: // Invalid Session
        this.drop(); // المنبّه التالي يعيد الاتصال
        break;
    }
  }
}

// يوقظ كائن الحضور (من cron)
export function keepPresence(env) {
  const stub = env.BOT_PRESENCE.get(env.BOT_PRESENCE.idFromName('bot'));
  return stub.fetch('https://presence/');
}
