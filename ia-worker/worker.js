// AlexPicks · Cloudflare Worker
//  POST /            → Lee la foto de un boleto con IA (solo admins). Secreto: ANTHROPIC_API_KEY
//  GET  /vapid       → Llave pública para notificaciones push
//  POST /suscribir   → Guarda la suscripción push de un celular (KV "PUSH")
//  POST /desuscribir → La borra
//  POST /notificar   → Envía una notificación a todos los suscritos (solo admins)
// Las suscripciones y las llaves de notificación viven en el KV vinculado como PUSH.

const ORIGENES = ["https://alexmz24k.github.io"];
const ADMINS = ["alexitozenil@gmail.com", "prokiller548@gmail.com"];
const FIREBASE_API_KEY = "AIzaSyC50jJFVDbRCjxGQsm-ioTt-xlDQU1-YUo"; // clave pública de la app (no es secreta)
const MODELO = "claude-sonnet-5-5";

const DEPORTES = ["Fútbol","Béisbol","Basquetbol","Americano","Tenis","Americano Colegial","Basquetbol Colegial","Combinación"];
const TIPOS = ["Moneyline","Handicap/Spread","Over/Under","Parlay/Combinada","Especial por jugador","PlayBoost","Freebet"];

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
      tipo: { type: "string", enum: TIPOS, description: "Tipo de apuesta. Un parlay o Same Game Parlay (SGP) es 'Parlay/Combinada'." },
      deporte: { type: "string", enum: [...DEPORTES, ""], description: "Deporte de la apuesta sencilla. Vacío si es parlay de varios deportes." },
      descripcion: { type: "string", description: "Para apuesta sencilla: SOLO el pick, corto y claro, sin el partido. Ej. 'Steelers ML', 'Over 2.5 goles', 'Lakers -5.5', 'Ambos equipos marcan: Sí'. Vacío si es parlay." },
      partido: { type: "string", description: "Para apuesta sencilla: el partido, ej. 'Tigres vs Toluca', 'Bills @ Rams'. Vacío si es parlay o no aparece." },
      patas: { type: "array", description: "Solo para parlay/SGP: cada selección.", items: { type: "object", properties: {
        deporte: { type: "string", enum: [...DEPORTES, ""] },
        desc: { type: "string", description: "Selección corta, ej. 'Steelers ML', 'Over 45.5 puntos'." } }, required: ["deporte","desc"] } },
      momio: { type: "integer", description: "Momio TOTAL del boleto en formato americano, ej. -117 o 250. Si viene en decimal, conviértelo." },
      apuesta: { type: "number", description: "Monto apostado en pesos (sin símbolos)." },
      pago_total: { type: "number", description: "Pago o 'Ganancia Total' mostrado (incluye lo apostado). 0 si no aparece." },
      fecha: { type: "string", description: "Fecha del partido en formato YYYY-MM-DD. Los boletos usan dd/mm. Si no trae año, usa el año de 'hoy' (o el anterior si quedaría en el futuro lejano)." },
      resultado: { type: "string", enum: ["Ganada","Perdida","Pendiente","Nula"], description: "GANADO/Ganada → Ganada, PERDIDO → Perdida, ABIERTA/en juego → Pendiente, ANULADA/reembolso → Nula." },
      notas: { type: "string", description: "Dudas o datos que no se pudieron leer bien. Vacío si todo está claro." },
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

async function rutasPush(request, env, origin, ruta) {
  if (!env.PUSH) return json({ error: "Falta vincular el KV 'PUSH' al Worker" }, 500, origin);
  if (ruta === "/vapid") return json({ publicKey: (await llavesVapid(env)).publicKey }, 200, origin);
  let body = {}; try { body = await request.json(); } catch { }
  if (ruta === "/suscribir") {
    const sub = body.subscription;
    let host = ""; try { host = new URL(sub.endpoint).hostname; } catch { }
    if (!sub || !sub.keys || !sub.keys.p256dh || !sub.keys.auth || !PUSH_HOSTS.some(r => r.test(host))) return json({ error: "Suscripción inválida" }, 400, origin);
    const tipos = { picks: body.tipos?.picks !== false, resultados: body.tipos?.resultados !== false };
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
    const { tipo = "picks", title = "AlexPicks", body: texto = "", url = "./", tag, apuesta, bankAdmin } = body;
    // Mensaje personalizado con el dinero de cada quien (solo resultados)
    const pesos = n => "$" + Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const textoPara = reg => {
      if (tipo !== "resultados" || !apuesta) return texto;
      const pf = reg.perfil || {};
      const [yy, mm] = String(apuesta.fecha || "").split("-").map(Number);
      const clave = yy + "-" + (mm - 1);
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
    let enviados = 0, borrados = 0, fallidos = 0;
    await Promise.all(claves.map(async k => {
      const reg = await env.PUSH.get(k, "json"); if (!reg || reg.tipos?.[tipo] === false) return;
      try {
        const r = await enviarPush(v, reg.sub, { title, body: textoPara(reg), url, tag });
        if (r.status === 404 || r.status === 410) { await env.PUSH.delete(k); borrados++; }
        else if (r.ok) enviados++; else fallidos++;
      } catch { fallidos++; }
    }));
    return json({ ok: true, enviados, borrados, fallidos, total: claves.length }, 200, origin);
  }
  return json({ error: "Ruta no encontrada" }, 404, origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
    if (!ORIGENES.includes(origin)) return json({ error: "Origen no permitido" }, 403, origin);
    const ruta = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
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
- "Ganancia Total" o "Pago" es lo que se cobra en total (incluye lo apostado); va en pago_total.
- Un SGP / Same Game Parlay / combinada cuenta como "Parlay/Combinada" y cada selección es una pata.
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
