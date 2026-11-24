// index.js — Battle Stars : Worker + Durable Objects (matchmaking mondial automatique + parties autoritaires par WebSocket)
import { DurableObject } from "cloudflare:workers";
import { Game } from "./game.js";

const SIZES = { show: 10, kn: 6, fb: 6 };          // Survivant 10 joueurs, 3 contre 3 et Football 6 joueurs
const WAIT_MS = 12000;                              // attente max avant de remplir les places libres avec des bots
const TICK_MS = 33, SNAP_EVERY = 2;                 // simulation 30 Hz, état envoyé 15 Hz
const GRACE_MS = 6000;                              // un joueur déconnecté peut revenir pendant 6 s, ensuite un bot le remplace
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const mkCode = n => { const a = crypto.getRandomValues(new Uint8Array(n)); let s = ""; for (const v of a) s += ALPHA[v % ALPHA.length]; return s; };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const send = (ws, o) => { try { ws.send(JSON.stringify(o)); } catch {} };

// ───────── Matchmaker : un seul exemplaire pour le monde entier. Il distribue les joueurs dans des parties « ouvertes » invisibles. ─────────
export class Matchmaker extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.open = {}; }
  async assign(mode) {
    mode = SIZES[mode] ? mode : "show";
    const now = Date.now();
    let o = this.open[mode];
    if (!o || o.n >= o.size || now > o.deadline - 1500)                       // pleine ou bientôt lancée : on ouvre une nouvelle partie
      o = this.open[mode] = { code: mkCode(5), n: 0, size: SIZES[mode], deadline: now + WAIT_MS };
    o.n++;
    return { code: o.code, mode, size: o.size, deadline: o.deadline, n: o.n };
  }
}

// ───────── GameRoom : une partie. Le serveur fait TOUT tourner ; les clients envoient seulement leurs intentions. ─────────
export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.g = null; this.pl = new Map(); this.timer = null; this.t2 = null; this.last = 0; this.n = 0; this.lt = 0;
    this.endSent = false; this.hostTok = null; this.priv = false; this.bots = true; this.deadline = 0; this.code = "";
  }
  async fetch(req) {
    if (req.headers.get("Upgrade") !== "websocket") return new Response("WebSocket requis", { status: 426 });
    const pair = new WebSocketPair(), [client, server] = Object.values(pair);
    server.accept();
    this.onSocket(server, Object.fromEntries(new URL(req.url).searchParams));
    return new Response(null, { status: 101, webSocket: client });
  }
  init(q) {
    const priv = q.priv === "1";
    let mode = SIZES[q.mode] ? q.mode : "show", size = SIZES[mode];
    if (priv && mode !== "show") size = q.size === "2" ? 2 : q.size === "6" ? 6 : 4;   // salon d'amis : 1 contre 1, 2 contre 2 (ou 3 contre 3)
    this.priv = priv; this.bots = priv ? q.bots === "1" : true;
    this.g = new Game({ mode, size }); this.deadline = Date.now() + WAIT_MS; this.code = String(q.code || "");
    this.last = Date.now(); this.n = 0; this.lt = 0; this.endSent = false; this.hostTok = null;
  }
  onSocket(ws, q) {
    if (!this.g) this.init(q);
    const g = this.g;
    const tok = String(q.tok || "").replace(/[^\w-]/g, "").slice(0, 40) || crypto.randomUUID();
    let pl = this.pl.get(tok);
    if (!pl) {
      if (g.phase !== "wait") { send(ws, { t: "err", e: "closed" }); ws.close(); return; }
      const f = g.addHuman({ name: q.name, icon: q.icon, char: q.char, pw: q.pw, tr: q.tr });
      if (!f) { send(ws, { t: "err", e: "full" }); ws.close(); return; }
      pl = { tok, id: f.id, ws: null, n: 0, sec: 0, dc: null };
      this.pl.set(tok, pl); if (!this.hostTok) this.hostTok = tok;
    } else if (pl.dc) { clearTimeout(pl.dc); pl.dc = null; }                       // reconnexion
    if (pl.ws && pl.ws !== ws) { try { pl.ws.close(); } catch {} }
    pl.ws = ws;
    ws.addEventListener("message", e => this.onMsg(pl, ws, e.data));
    const gone = () => this.onClose(pl, ws);
    ws.addEventListener("close", gone); ws.addEventListener("error", gone);
    send(ws, { t: "welcome", id: pl.id, tok, code: this.code, mode: g.mode, size: g.size, priv: this.priv, host: tok === this.hostTok, walls: g.walls, bush: g.bush });
    if (g.phase !== "wait") send(ws, { t: "start", players: g.roster(), it: g.intro });
    this.lobby(); this.run();
  }
  run() { if (!this.timer) { this.last = Date.now(); this.timer = setInterval(() => this.step(), TICK_MS); } }
  all(o) { for (const p of this.pl.values()) if (p.ws) send(p.ws, o); }
  lobby() {
    const g = this.g; if (!g) return;
    this.all({ t: "lobby", players: g.roster(), size: g.size, left: Math.max(0, Math.round((this.deadline - Date.now()) / 1000)), priv: this.priv, host: this.hostTok });
  }
  begin() {
    const g = this.g; if (!g || g.phase !== "wait") return;
    g.start();                                                                      // places libres → bots
    this.all({ t: "start", players: g.roster(), it: g.intro, mode: g.mode, size: g.size });
  }
  step(dt) {
    const g = this.g; if (!g) return;
    const now = Date.now(); dt = dt ?? Math.min(0.1, (now - this.last) / 1000); this.last = now;
    if (g.phase === "wait") {
      const full = g.f.length >= g.size;
      if (this.priv ? full : (full || now >= this.deadline)) this.begin();
      else if (++this.lt % 30 === 0) this.lobby();
    }
    g.tick(dt); this.n++;
    if (g.phase !== "wait" && this.n % SNAP_EVERY === 0) this.snaps();
    if (g.over && !this.endSent) {
      this.endSent = true; this.snaps(); this.all({ t: "end", r: g.result });
      this.t2 = setTimeout(() => this.shutdown(), 20000);
    }
  }
  snaps() { const g = this.g, ev = g.drainEv(); for (const p of this.pl.values()) if (p.ws) send(p.ws, g.snap(p.id, ev)); }
  onMsg(pl, ws, data) {
    const g = this.g; if (!g || typeof data !== "string" || data.length > 1500) return;
    const now = Date.now(); if (now - pl.sec >= 1000) { pl.sec = now; pl.n = 0; } if (++pl.n > 80) return;   // anti-spam
    let m; try { m = JSON.parse(data); } catch { return; }
    switch (m.t) {
      case "in": g.input(pl.id, m); break;
      case "start": if (this.priv && pl.tok === this.hostTok && g.phase === "wait" && (this.bots || g.f.length >= g.size)) this.begin(); break;
      case "team": g.setTeam(pl.id, m.v); this.lobby(); break;
      case "ping": send(ws, { t: "pong", c: m.c, s: Date.now() }); break;
      case "leave": try { ws.close(); } catch {} break;
    }
  }
  onClose(pl, ws) {
    if (pl.ws !== ws) return; pl.ws = null;
    const g = this.g; if (!g) return;
    if (g.phase === "wait") {
      g.removeHuman(pl.id); this.pl.delete(pl.tok);
      if (this.hostTok === pl.tok) { const n = this.pl.values().next().value; this.hostTok = n ? n.tok : null; }
      if (!this.pl.size) this.shutdown(); else this.lobby();
    } else if (!g.over) {
      pl.dc = setTimeout(() => { if (!pl.ws) { g.removeHuman(pl.id); if (![...this.pl.values()].some(p => p.ws)) this.shutdown(); } }, GRACE_MS);   // un bot prend la place
    } else if (![...this.pl.values()].some(p => p.ws)) this.shutdown();
  }
  shutdown() {
    clearInterval(this.timer); clearTimeout(this.t2); this.timer = this.t2 = null;
    for (const p of this.pl.values()) { clearTimeout(p.dc); try { p.ws && p.ws.close(); } catch {} }
    this.pl.clear(); this.g = null;
  }
}

// ───────── Point d'entrée : routes /api/*, le reste = le jeu (fichiers de ./public) ─────────
export default {
  async fetch(req, env) {
    const u = new URL(req.url), p = u.pathname;
    if (p === "/api/match") return json(await env.MATCH.get(env.MATCH.idFromName("global")).assign(u.searchParams.get("mode") || "show"));
    if (p === "/api/create") return json({ code: mkCode(4) });                      // code d'un salon d'amis
    if (p === "/api/health") return json({ ok: true, t: Date.now() });
    if (p === "/api/game") {
      const o = req.headers.get("Origin"); if (o && new URL(o).host !== u.host) return json({ e: "origin" }, 403);
      const c = (u.searchParams.get("code") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
      if (c.length < 4) return json({ e: "code" }, 400);
      return env.ROOMS.get(env.ROOMS.idFromName(c)).fetch(req);
    }
    return env.ASSETS.fetch(req);
  },
};
