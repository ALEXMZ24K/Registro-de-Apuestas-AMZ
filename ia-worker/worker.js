// Se publica solo desde GitHub (Cloudflare Workers Builds) al cambiar main.
// AlexPicks · Cloudflare Worker
//  POST /            → Lee la foto de un boleto con IA (solo admins). Secreto: ANTHROPIC_API_KEY
//  GET  /vapid       → Llave pública para notificaciones push
//  POST /suscribir   → Guarda la suscripción push de un celular (KV "PUSH")
//  POST /desuscribir → La borra
//  POST /notificar   → Envía una notificación a todos los suscritos (solo admins)
//  GET  /partidos[?k=liga&d=AAAAMMDD] → Ligas disponibles, o partidos del día de una liga (ESPN)
//  GET  /marcador?q=k~fecha~id,… → Marcador en vivo de los partidos elegidos
//  GET  /auto-estado → Cómo va la calificación automática (última revisión, últimos picks calificados)
//  Cron (cada minuto; califica cada 3 min, los demás manda avisos en tandas) → Califica solos los picks que terminaron. Secreto: FIREBASE_SA (cuenta de servicio de Firebase)
// Las suscripciones y las llaves de notificación viven en el KV vinculado como PUSH.

import { calificarTodo, estadoAuto } from "./auto.js";

const ORIGENES = ["https://alexmz24k.github.io"];
const ADMINS = ["alexitozenil@gmail.com", "prokiller548@gmail.com"];
const FIREBASE_API_KEY = "AIzaSyC50jJFVDbRCjxGQsm-ioTt-xlDQU1-YUo"; // clave pública de la app (no es secreta)
const MODELO = "claude-sonnet-5-5";

const DEPORTES = ["Fútbol","Béisbol","Basquetbol","Americano","Tenis","Americano Colegial","Basquetbol Colegial","Combinación"];
const TIPOS = ["Moneyline","Handicap/Spread","Over/Under","Parlay/Combinada","Crear apuesta","Especial por jugador","PlayBoost","Freebet"];

const cors = origin => ({
  "Access-Control-Allow-Origin": ORIGENES.includes(origin) ? origin : ORIGENES[0],
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Vary": "Origin",
});
const json = (obj, status, origin) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors(origin) } });

const HERRAMIENTA = {
  name: "registrar_apuesta",
  description: "Registra los datos de la apuesta leída del boleto.",
  input_schema: {
    type: "object",
    properties: {
      tipo: { type: "string", enum: TIPOS, description: "Tipo de apuesta. Si TODAS las selecciones son del MISMO partido (Crear Apuesta, SGP, Same Game Parlay) es 'Crear apuesta'. Si son de partidos distintos es 'Parlay/Combinada'." },
      deporte: { type: "string", enum: [...DEPORTES, ""], description: "Deporte de la apuesta sencilla. Vacío si es parlay de varios deportes. En Crear apuesta, el deporte del partido." },
      descripcion: { type: "string", description: "Para apuesta sencilla: SOLO el pick, corto y claro, sin el partido. Ej. 'Steelers ML', 'Over 2.5 goles', 'Lakers -5.5', 'Ambos equipos marcan: Sí'. Vacío si es parlay." },
      partido: { type: "string", description: "Para apuesta sencilla o Crear apuesta: el partido, ej. 'Tigres vs Toluca', 'Bills @ Rams'. Vacío si es parlay de varios partidos o no aparece." },
      patas: { type: "array", description: "Solo para parlay, Crear apuesta o freebet combinada: cada selección.", items: { type: "object", properties: {
        deporte: { type: "string", enum: [...DEPORTES, ""] },
        desc: { type: "string", description: "Selección corta, ej. 'Steelers ML', 'Over 45.5 puntos'." },
        partido: { type: "string", description: "Partido de esta selección si aparece, ej. 'Bills @ Rams'. Vacío si no aparece." } }, required: ["deporte","desc"] } },
      momio: { type: "integer", description: "Momio TOTAL del boleto en formato americano, ej. -117 o 250. Si viene en decimal, conviértelo." },
      apuesta: { type: "number", description: "Monto apostado en pesos (sin símbolos)." },
      pago_total: { type: "number", description: "Pago o 'Ganancia Total' mostrado (incluye lo apostado). 0 si no aparece." },
      fecha: { type: "string", description: "Fecha del partido en formato YYYY-MM-DD. Los boletos usan dd/mm. Si no trae año, usa el año de 'hoy' (o el anterior si quedaría en el futuro lejano)." },
      resultado: { type: "string", enum: ["Ganada","Perdida","Pendiente","Nula"], description: "GANADO/Ganada → Ganada, PERDIDO → Perdida, ABIERTA/en juego → Pendiente, ANULADA/reembolso → Nula." },
      notas: { type: "string", description: "Dudas o datos que no se pudieron leer bien. Vacío si todo está claro." },
      otras: { type: "array", description: "Si en la captura hay MÁS apuestas ya hechas además de la que registraste, una entrada por cada una (aunque no se vea su selección). Vacío si solo hay una.",
        items: { type: "object", properties: {
          partido: { type: "string", description: "El partido como aparece, ej. 'WAS Commanders @ SF 49ers'." },
          momio: { type: "integer" }, apuesta: { type: "number" },
          seleccion: { type: "string", description: "La selección si se ve; vacío si la apuesta está cerrada/colapsada y no se ve." } }, required: ["partido"] } },
    },
    required: ["tipo","deporte","descripcion","partido","patas","momio","apuesta","pago_total","fecha","resultado","notas"],
  },
};

// ── Utilidades ──
const te = new TextEncoder();
const b64u = buf => { const b = new Uint8Array(buf); let s = ""; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const deB64u = s => { s = String(s).replace(/-/g, "+").replace(/_/g, "/"); s += "=".repeat((4 - s.length % 4) % 4); const r = atob(s); const u = new Uint8Array(r.length); for (let i = 0; i < r.length; i++) u[i] = r.charCodeAt(i); return u; };
const unir = (...arrs) => { const n = arrs.reduce((t, a) => t + a.length, 0); const o = new Uint8Array(n); let i = 0; for (const a of arrs) { o.set(a, i); i += a.length; } return o; };
const sha256hex = async t => [...new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode(t)))].map(b => b.toString(16).padStart(2, "0")).join("");

// ¿Quien llama es admin? (sesión de Google de la app)
async function emailAdmin(request) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const look = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: token }),
  });
  const quien = look.ok ? await look.json() : null;
  const email = ((quien && quien.users && quien.users[0] && quien.users[0].email) || "").toLowerCase();
  return ADMINS.includes(email) ? email : null;
}

// ── Web Push (RFC 8291 aes128gcm + VAPID RFC 8292) ──
const VAPID_SUB = "https://alexmz24k.github.io/Registro-de-Apuestas-AMZ/";
async function llavesVapid(env) {
  let v = await env.PUSH.get("_vapid", "json");
  if (!v) {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    v = { publicKey: b64u(await crypto.subtle.exportKey("raw", kp.publicKey)), jwk: await crypto.subtle.exportKey("jwk", kp.privateKey) };
    await env.PUSH.put("_vapid", JSON.stringify(v));
  }
  return v;
}
async function jwtVapid(v, aud) {
  const enc = o => b64u(te.encode(JSON.stringify(o)));
  const sinFirma = enc({ typ: "JWT", alg: "ES256" }) + "." + enc({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: VAPID_SUB });
  const key = await crypto.subtle.importKey("jwk", v.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const firma = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(sinFirma));
  return sinFirma + "." + b64u(firma);
}
async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, len * 8));
}
async function cifrarPush(sub, texto) {
  const uaPub = deB64u(sub.keys.p256dh), auth = deB64u(sub.keys.auth);
  const as = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(auth, ecdh, unir(te.encode("WebPush: info\0"), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, key, unir(te.encode(texto), new Uint8Array([2]))));
  const cab = new Uint8Array(16 + 4 + 1 + asPub.length);
  cab.set(salt, 0); new DataView(cab.buffer).setUint32(16, 4096); cab[20] = asPub.length; cab.set(asPub, 21);
  return unir(cab, ct);
}
async function enviarPush(v, sub, datos) {
  const body = await cifrarPush(sub, JSON.stringify(datos));
  const jwt = await jwtVapid(v, new URL(sub.endpoint).origin);
  return fetch(sub.endpoint, { method: "POST", body, headers: {
    "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", "TTL": "86400", "Urgency": "high",
    "Authorization": `vapid t=${jwt}, k=${v.publicKey}` } });
}
const PUSH_HOSTS = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/, /^web\.push\.apple\.com$/];

// Envía una notificación a los celulares suscritos, en TANDAS: el plan gratis de Cloudflare permite máximo 50
// conexiones hacia afuera por ejecución, así que cada llamada manda hasta 40 y dice desde dónde seguir ("siguiente").
const TANDA = 40;
async function avisarTodos(env, body, desde = "", max = TANDA) {
  const { tipo = "picks", title = "AlexPicks", body: texto = "", url = "./", tag, apuesta, bankAdmin } = body;
  // Mensaje personalizado con el dinero de cada quien (solo resultados)
  const pesos = n => "$" + Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const textoPara = reg => {
    if (!apuesta || (tipo !== "resultados" && tipo !== "picks")) return texto;
    const pf = reg.perfil || {};
    const [yy, mm] = String(apuesta.fecha || "").split("-").map(Number);
    const clave = yy + "-" + (mm - 1);
    // Pick nuevo: "· 3% del bank" → "· Apuesta $1,500 (3%)" con el bank de cada quien (si no tiene bank, se queda el %)
    if (tipo === "picks") {
      const bankP = Number((pf.admin ? (bankAdmin || {}) : (pf.bancos || {}))[clave]) || 0;
      if (!(bankP > 0) || !/% del bank\s*$/.test(texto)) return texto;
      return texto.replace(/([\d.]+)% del bank\s*$/, (_, pc) => "Apuesta " + pesos(bankP * (Number(apuesta.monto) || 0) / 100) + " (" + pc + "%)");
    }
    const desc = apuesta.descripcion || "";
    if (pf.noMet && pf.noMet.includes(String(apuesta.id))) return desc + " · (no la metiste)";
    const ini = pf.inicios && pf.inicios[clave];
    if (ini && String(apuesta.fecha) < ini) return texto;
    const bank = Number((pf.admin ? (bankAdmin || {}) : (pf.bancos || {}))[clave]) || 0;
    if (!(bank > 0)) return texto;
    const monto = bank * (Number(apuesta.monto) || 0) / 100;
    const c = Number(apuesta.cuota) || 0, dec = c > 0 ? c / 100 + 1 : c < 0 ? 100 / Math.abs(c) + 1 : 1;
    if (apuesta.resultado === "Ganada") return desc + " · Ganaste +" + pesos(monto * (dec - 1));
    if (apuesta.resultado === "Perdida") return desc + " · Perdiste -" + pesos(monto);
    if (apuesta.resultado === "Nula") return desc + " · Se te devuelven " + pesos(monto);
    return texto;
  };
  const v = await llavesVapid(env);
  let cursor, claves = [];
  do { const l = await env.PUSH.list({ prefix: "s:", cursor }); claves.push(...l.keys.map(k => k.name)); cursor = l.list_complete ? null : l.cursor; } while (cursor);
  claves.sort();
  // Se sigue por NOMBRE de la suscripción (no por posición), así borrar las vencidas no hace que se salte a nadie
  const parte = claves.filter(k => !desde || k > desde).slice(0, max);
  const siguiente = parte.length && claves.indexOf(parte[parte.length - 1]) < claves.length - 1 ? parte[parte.length - 1] : null;
  let enviados = 0, borrados = 0, fallidos = 0;
  await Promise.all(parte.map(async k => {
    const reg = await env.PUSH.get(k, "json"); if (!reg || reg.tipos?.[tipo] === false) return;
    try {
      const r = await enviarPush(v, reg.sub, { title, body: textoPara(reg), url, tag });
      if (r.status === 404 || r.status === 410) { await env.PUSH.delete(k); borrados++; }
      else if (r.ok) enviados++; else fallidos++;
    } catch { fallidos++; }
  }));
  return { enviados, borrados, fallidos, total: claves.length, procesados: parte.length, siguiente };
}
// Avisos del Worker (calificación automática): se forman en una cola y salen en tandas, una por minuto
async function encolarAviso(env, aviso) {
  const cola = (await env.PUSH.get("_cola", "json")) || [];
  cola.push({ aviso, desde: "" });
  await env.PUSH.put("_cola", JSON.stringify(cola.slice(-200)));
}
async function procesarCola(env) {
  const cola = await env.PUSH.get("_cola", "json");
  if (!cola || !cola.length) return;
  let presupuesto = TANDA;
  while (cola.length && presupuesto > 0) {
    const job = cola[0];
    const r = await avisarTodos(env, job.aviso, job.desde || "", presupuesto);
    presupuesto -= r.procesados;
    if (r.siguiente) { job.desde = r.siguiente; if (!r.procesados) break; } else cola.shift();
  }
  if (cola.length) await env.PUSH.put("_cola", JSON.stringify(cola)); else await env.PUSH.delete("_cola");
}

async function rutasPush(request, env, origin, ruta) {
  if (!env.PUSH) return json({ error: "Falta vincular el KV 'PUSH' al Worker" }, 500, origin);
  if (ruta === "/vapid") return json({ publicKey: (await llavesVapid(env)).publicKey }, 200, origin);
  let body = {}; try { body = await request.json(); } catch { }
  if (ruta === "/suscribir") {
    const sub = body.subscription;
    let host = ""; try { host = new URL(sub.endpoint).hostname; } catch { }
    if (!sub || !sub.keys || !sub.keys.p256dh || !sub.keys.auth || !PUSH_HOSTS.some(r => r.test(host))) return json({ error: "Suscripción inválida" }, 400, origin);
    const tipos = { picks: body.tipos?.picks !== false, resultados: body.tipos?.resultados !== false, recordatorios: body.tipos?.recordatorios !== false };
    // Perfil para personalizar los avisos de resultado (bank por mes, día de inicio y picks que no metió)
    const pf = body.perfil || {};
    const perfil = { admin: !!pf.admin, bancos: pf.bancos && typeof pf.bancos === "object" ? pf.bancos : {}, inicios: pf.inicios && typeof pf.inicios === "object" ? pf.inicios : {}, noMet: Array.isArray(pf.noMet) ? pf.noMet.slice(-500).map(String) : [] };
    await env.PUSH.put("s:" + await sha256hex(sub.endpoint), JSON.stringify({ sub: { endpoint: sub.endpoint, keys: sub.keys }, tipos, perfil, t: Date.now() }));
    return json({ ok: true }, 200, origin);
  }
  if (ruta === "/desuscribir") {
    if (body.endpoint) await env.PUSH.delete("s:" + await sha256hex(body.endpoint));
    return json({ ok: true }, 200, origin);
  }
  if (ruta === "/notificar") {
    if (!(await emailAdmin(request))) return json({ error: "Solo los admins pueden notificar" }, 403, origin);
    return json({ ok: true, ...(await avisarTodos(env, body, typeof body.desde === "string" ? body.desde : "")) }, 200, origin);
  }
  return json({ error: "Ruta no encontrada" }, 404, origin);
}

// ───────── Partidos y marcadores (datos públicos de ESPN) ─────────
const LIGAS = [
  ["soccer/mex.1","Liga MX","Fútbol"],["soccer/uefa.champions","Champions League","Fútbol"],["soccer/uefa.europa","Europa League","Fútbol"],
  ["soccer/uefa.europa.conf","Conference League","Fútbol"],["soccer/eng.1","Premier League","Fútbol"],["soccer/esp.1","LaLiga","Fútbol"],
  ["soccer/ita.1","Serie A","Fútbol"],["soccer/ger.1","Bundesliga","Fútbol"],["soccer/fra.1","Ligue 1","Fútbol"],["soccer/por.1","Liga Portugal","Fútbol"],
  ["soccer/ned.1","Eredivisie","Fútbol"],["soccer/usa.1","MLS","Fútbol"],["soccer/mex.2","Liga de Expansión","Fútbol"],
  ["soccer/conmebol.libertadores","Libertadores","Fútbol"],["soccer/conmebol.sudamericana","Sudamericana","Fútbol"],
  ["soccer/concacaf.champions","Concacaf Champions","Fútbol"],["soccer/fifa.friendly","Amistosos","Fútbol"],
  ["soccer/fifa.worldq.concacaf","Eliminatoria Concacaf","Fútbol"],["soccer/fifa.worldq.conmebol","Eliminatoria Conmebol","Fútbol"],["soccer/uefa.nations","Nations League","Fútbol"],
  ["football/nfl","NFL","Americano"],["football/college-football","NCAA Football","Americano Colegial","&groups=80"],
  ["basketball/nba","NBA","Basquetbol"],["basketball/wnba","WNBA","Basquetbol"],["basketball/mens-college-basketball","NCAA Basketball","Basquetbol Colegial","&groups=50"],
  ["baseball/mlb","MLB","Béisbol"],
];
// Estadísticas del equipo que nos interesan (remates, tiros a puerta, córners, tarjetas…)
const EST = ["shotsOnTarget", "totalShots", "wonCorners", "yellowCards", "redCards", "foulsCommitted", "possessionPct", "offsides", "saves"];
const estMapa = arr => { const m = {}; (arr || []).forEach(x => { if (x && EST.includes(x.name) && x.displayValue !== undefined) m[x.name] = x.displayValue; }); return m; };
const valor = x => (x && typeof x === "object") ? (x.displayValue ?? x.value ?? "") : (x ?? "");
function evNorm(e) {
  const c = (e.competitions || [])[0] || {}, st = c.status || e.status || {}, cs = c.competitors || [];
  const eq = x => { const t = x.team || x.athlete || {}; return { id: String(t.id || ""), est: estMapa(x.statistics), n: t.shortDisplayName || t.displayName || "", full: t.displayName || "", a: t.abbreviation || "",
    l: t.logo || (t.logos && t.logos[0] && t.logos[0].href) || "", c: t.color ? "#" + t.color : "", s: String(valor(x.score)),
    ls: (x.linescores || []).map(l => Number(l.value ?? l.displayValue) || 0) }; };
  const h = cs.find(x => x.homeAway === "home") || cs[0] || {}, a = cs.find(x => x.homeAway === "away") || cs[1] || {};
  return { id: String(e.id), t: e.date, st: (st.type && st.type.state) || "pre", det: (st.type && (st.type.shortDetail || st.type.detail)) || "", clk: st.displayClock || "", per: Number(st.period) || 0, h: eq(h), a: eq(a) };
}
async function scoreboard(k, fecha, ttl) {
  const lg = LIGAS.find(l => l[0] === k);
  const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${k}/scoreboard?dates=${fecha}&limit=200${(lg && lg[3]) || ""}`,
    { cf: { cacheTtl: ttl, cacheEverything: true } });
  if (!r.ok) return [];
  const d = await r.json().catch(() => null);
  return ((d && d.events) || []).map(evNorm);
}
// Estadísticas de cada JUGADOR (para picks de jugador), sacadas del detalle del partido de ESPN.
// Regresa [{n:"Shohei Ohtani", s:{h:1,hr:0,...}}] con nombres cortos de estadística.
const MAPA_JUG = {
  batting: { hits: "h", runs: "r", RBIs: "rbi", homeRuns: "hr", walks: "bb", strikeouts: "so" },
  pitching: { strikeouts: "k", hits: "ha", earnedRuns: "er" },
  passing: { passingYards: "pay", passingTouchdowns: "patd", interceptions: "int", "completions/passingAttempts": "cmp" },
  rushing: { rushingYards: "ruy", rushingTouchdowns: "rutd", rushingAttempts: "rua" },
  receiving: { receptions: "rec", receivingYards: "rey", receivingTouchdowns: "retd" },
  nba: { points: "pts", rebounds: "reb", assists: "ast", "threePointFieldGoalsMade-threePointFieldGoalsAttempted": "tres", steals: "stl", blocks: "blk" },
};
function jugadoresDe(d) {
  const out = {};
  const add = (n, k, v) => { const x = Number(String(v ?? "").split(/[-\/]/)[0]); if (!n || !k || isNaN(x)) return; (out[n] = out[n] || {})[k] = (out[n][k] || 0) + x; };
  ((d && d.boxscore && d.boxscore.players) || []).forEach(t => (t.statistics || []).forEach(g => {
    const mapa = MAPA_JUG[g.type] || MAPA_JUG[g.name] || (g.keys && g.keys.includes("points") ? MAPA_JUG.nba : null);
    if (!mapa) return;
    (g.athletes || []).forEach(a => { const n = a.athlete && a.athlete.displayName; (g.keys || []).forEach((k, i) => { if (mapa[k]) add(n, mapa[k], (a.stats || [])[i]); }); });
  }));
  // Fútbol: vienen en "rosters", con nombre de estadística
  ((d && d.rosters) || []).forEach(t => (t.roster || []).forEach(p => { const n = p.athlete && p.athlete.displayName;
    (Array.isArray(p.stats) ? p.stats : []).forEach(x => { const k = { shotsOnTarget: "sot", totalShots: "sh", totalGoals: "g" }[x && x.name]; if (k) add(n, k, x.value ?? x.displayValue); }); }));
  return Object.keys(out).map(n => ({ n, s: out[n] }));
}

// Marcador (y estadísticas) de una lista de partidos "liga~AAAAMMDD~id" (con "~j" al final: también las de cada jugador)
async function marcadores(lista) {
  const pedidos = lista.map(x => x.split("~")).filter(x => x.length >= 3 && LIGAS.some(l => l[0] === x[0])).slice(0, 30);
  const conJug = new Set(pedidos.filter(x => x[3] === "j").map(x => x[2]));
  const grupos = {};
  pedidos.forEach(([k, f, id]) => { const g = k + "~" + f; grupos[g] = grupos[g] || []; if (!grupos[g].includes(id)) grupos[g].push(id); });
  const ev = {}, faltan = [];
  await Promise.all(Object.keys(grupos).map(async g => {
    const [k, f] = g.split("~");
    try { (await scoreboard(k, f.replace(/\D/g, "").slice(0, 8), 25)).forEach(e => { if (grupos[g].includes(e.id)) {
      ev[e.id] = { st: e.st, det: e.det, clk: e.clk, hs: e.h.s, as: e.a.s, t: e.t, eh: e.h.est, ea: e.a.est, per: e.per, hl: e.h.ls, al: e.a.ls };
      // Si el marcador no trae tiros a puerta, se piden al detalle del partido (solo fútbol en juego o terminado)
      const jug = conJug.has(e.id) && e.st !== "pre";
      if (jug || (k.startsWith("soccer") && e.st !== "pre" && !("shotsOnTarget" in e.h.est))) faltan.push({ k, id: e.id, hid: e.h.id, aid: e.a.id, jug });
    } }); } catch {}
  }));
  await Promise.all(faltan.slice(0, 10).map(async x => {
    try {
      const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${x.k}/summary?event=${x.id}`, { cf: { cacheTtl: 25, cacheEverything: true } });
      if (!r.ok) return;
      const d = await r.json().catch(() => null);
      const teams = (d && d.boxscore && d.boxscore.teams) || [];
      const de = id => { const t = teams.find(t => t.team && String(t.team.id) === id); return t ? estMapa(t.statistics) : null; };
      const h = de(x.hid) || (teams[0] && teams[0].homeAway === "home" ? estMapa(teams[0].statistics) : null);
      const a = de(x.aid) || (teams[1] && teams[1].homeAway === "away" ? estMapa(teams[1].statistics) : null);
      if (h) ev[x.id].eh = h; if (a) ev[x.id].ea = a;
      if (x.jug) ev[x.id].j = jugadoresDe(d);
    } catch {}
  }));
  return ev;
}
async function rutasMarcador(request, origin, ruta) {
  const u = new URL(request.url);
  const resp = (obj, seg) => new Response(JSON.stringify(obj), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=" + seg, ...cors(origin) } });
  if (ruta === "/partidos") {
    // Sin liga: solo la lista de ligas. Con liga: los partidos de ese día (una liga por llamada = poco CPU)
    const k = u.searchParams.get("k");
    if (!k) return resp({ ok: true, ligas: LIGAS.map(([k, liga, dep]) => ({ k, liga, dep })) }, 3600);
    const lg = LIGAS.find(l => l[0] === k);
    const d = (u.searchParams.get("d") || "").replace(/\D/g, "").slice(0, 8);
    if (!lg || d.length !== 8) return json({ error: "Datos inválidos" }, 400, origin);
    let ev = []; try { ev = await scoreboard(k, d, 60); } catch {}
    return resp({ ok: true, ev }, 60);
  }
  // /marcador?q=soccer/mex.1~20261013~401234,...
  const ev = await marcadores((u.searchParams.get("q") || "").split(","));
  return resp({ ok: true, ev }, 25);
}


export default {
  // Cada pocos minutos: califica solos los picks cuyo partido ya terminó (ver auto.js)
  // Cada minuto: cada 3 min califica; los otros minutos manda la siguiente tanda de avisos pendientes
  // (separado para no pasar el límite de 50 conexiones por ejecución)
  async scheduled(event, env, ctx) {
    const min = new Date(event.scheduledTime || Date.now()).getUTCMinutes();
    ctx.waitUntil(min % 3 === 0 ? calificarTodo(env, { marcadores, avisarTodos: encolarAviso }) : procesarCola(env));
  },
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
    if (!ORIGENES.includes(origin)) return json({ error: "Origen no permitido" }, 403, origin);
    const ruta = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
    if (ruta === "/partidos" || ruta === "/marcador") return rutasMarcador(request, origin, ruta);
    if (ruta === "/auto-estado") return json({ ok: true, ...(await estadoAuto(env)) }, 200, origin);
    // Diagnóstico de solo lectura: qué perfil tiene guardado cada celular suscrito (sin datos personales ni direcciones)
    if (ruta === "/push-diag" && env.PUSH) {
      let cursor, claves = [];
      do { const l = await env.PUSH.list({ prefix: "s:", cursor }); claves.push(...l.keys.map(k => k.name)); cursor = l.list_complete ? null : l.cursor; } while (cursor);
      const subs = await Promise.all(claves.map(async k => { const r = await env.PUSH.get(k, "json") || {}; const pf = r.perfil || {};
        let host = ""; try { host = new URL(r.sub.endpoint).hostname; } catch { }
        return { id: k.slice(2, 8), host, admin: !!pf.admin, meses: Object.keys(pf.bancos || {}).filter(m => Number(pf.bancos[m]) > 0), resultados: r.tipos?.resultados !== false, hace_h: r.t ? Math.round((Date.now() - r.t) / 36e5) : null }; }));
      return json({ ok: true, total: subs.length, subs }, 200, origin);
    }
    if (ruta !== "/") return rutasPush(request, env, origin, ruta);
    if (request.method !== "POST") return json({ error: "Usa POST" }, 405, origin);
    if (!env.ANTHROPIC_API_KEY) return json({ error: "Falta el secreto ANTHROPIC_API_KEY en Cloudflare" }, 500, origin);

    // 1) Verificar que sea un admin con sesión de Google en la app
    if (!(await emailAdmin(request))) return json({ error: "Solo los admins pueden leer boletos" }, 403, origin);

    // 2) Leer la imagen
    let body;
    try { body = await request.json(); } catch { return json({ error: "Datos inválidos" }, 400, origin); }
    const { image, mediaType = "image/jpeg", hoy = new Date().toISOString().slice(0, 10) } = body || {};
    if (!image || image.length > 7_000_000) return json({ error: "Imagen faltante o muy grande" }, 400, origin);

    // 3) Pedirle a Claude que lea el boleto
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: env.MODELO || MODELO,
        max_tokens: 1024,
        tools: [HERRAMIENTA],
        tool_choice: { type: "auto" },
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
          { type: "text", text:
`Es una captura de un boleto de apuestas deportivas de México (por ejemplo Playdoit). Hoy es ${hoy}.
Extrae los datos y SIEMPRE responde llamando a la herramienta registrar_apuesta. Reglas:
- La captura puede ser la pantalla COMPLETA de la casa de apuestas. Lee SOLO las apuestas ya hechas: las que tienen "Apuesta total", "Ganancia Total", un ID o estado (ABIERTO, GANADO, PERDIDO), normalmente en "Historial" o "Mis apuestas". IGNORA la lista de partidos y momios de arriba (Hándicap, Totales, Ganador, botones con momios), los banners y los menús: eso NO es una apuesta.
- Si hay varias apuestas hechas, registra la que se ve COMPLETA (abierta, con su selección visible); si hay varias completas, la primera. Las demás van en "otras".
- "Ganancia Total" o "Pago" es lo que se cobra en total (incluye lo apostado); va en pago_total.
- Si todas las selecciones son del MISMO partido (Crear Apuesta, SGP, Same Game Parlay) el tipo es "Crear apuesta": pon el partido en "partido" y cada selección es una pata. Escribe cada selección clara y completa, ej. "Cruz Azul ML", "Más de 1.5 goles", "1er tiempo más de 0.5 goles".
- Un parlay con selecciones de partidos DISTINTOS es "Parlay/Combinada".
- NFL/fútbol americano → "Americano"; NCAA football → "Americano Colegial"; NBA → "Basquetbol"; NCAA basketball → "Basquetbol Colegial"; MLB → "Béisbol"; soccer/Liga MX → "Fútbol".
- Escribe los picks cortos y en español cuando aplique (ML = Moneyline). Usa nombres de equipo reconocibles.
- No inventes datos: si algo no se lee, ponlo en notas.` },
        ] }],
      }),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data) return json({ error: "La IA no respondió", detalle: data && data.error && data.error.message }, 502, origin);
    const uso = (data.content || []).find(c => c.type === "tool_use");
    if (!uso) return json({ error: "No se pudo leer el boleto" }, 422, origin);
    return json({ ok: true, apuesta: uso.input }, 200, origin);
  },
};
