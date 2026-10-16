// Calificación automática en el Worker (corre sola cada pocos minutos, aunque nadie tenga la app abierta).
// Usa la MISMA lógica que la app (../calificar.js) para decidir si un pick ganó o perdió.
//
// Necesita el secreto FIREBASE_SA en Cloudflare: el JSON de una cuenta de servicio de Firebase
// (Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada).
//
// Interruptor en Firestore, documento config/auto:
//   calificar: false → apagado (lo cambia Alex en Más → Admin)
//   real: true       → califica de verdad. Si no, solo "modo prueba": anota qué calificaría, sin tocar nada.
import "../calificar.js";

const C = globalThis.Calif;
const PROYECTO = "registro-de-apuestas-amz";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROYECTO}/databases/(default)/documents`;
const DIAS = 3; // revisa picks de hasta 3 días atrás

// ── Valores de Firestore (REST) ↔ JS ──
export const deFS = v => {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(deFS);
  if ("mapValue" in v) return deCampos(v.mapValue.fields || {});
  return null;
};
export const deCampos = f => { const o = {}; for (const k in f) o[k] = deFS(f[k]); return o; };
export const aFS = x => {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === "boolean") return { booleanValue: x };
  if (typeof x === "number") return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (typeof x === "string") return { stringValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(aFS) } };
  if (typeof x === "object") { const fields = {}; for (const k in x) if (x[k] !== undefined) fields[k] = aFS(x[k]); return { mapValue: { fields } }; }
  return { nullValue: null };
};

// ── Acceso a Firestore con la cuenta de servicio (token de Google, guardado ~50 min en KV) ──
const b64u = buf => { const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf); let s = ""; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
async function tokenGoogle(env) {
  const guardado = await env.PUSH.get("_gtoken", "json");
  if (guardado && guardado.exp > Date.now() + 60000) return guardado.t;
  const sa = JSON.parse(env.FIREBASE_SA);
  const ahora = Math.floor(Date.now() / 1000);
  const enc = o => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const sinFirma = enc({ alg: "RS256", typ: "JWT" }) + "." + enc({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", iat: ahora, exp: ahora + 3600 });
  const pem = String(sa.private_key).replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const llave = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const firma = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", llave, new TextEncoder().encode(sinFirma));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=" + sinFirma + "." + b64u(firma) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error("Google no dio acceso (" + r.status + "): " + (d.error_description || d.error || ""));
  await env.PUSH.put("_gtoken", JSON.stringify({ t: d.access_token, exp: Date.now() + 50 * 60000 }), { expirationTtl: 3300 });
  return d.access_token;
}
async function fs(token, ruta, opc = {}) {
  const r = await fetch(BASE + ruta, { ...opc, headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(opc.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, d };
}
const leerDoc = async (token, ruta) => { const r = await fs(token, ruta); return r.ok ? deCampos(r.d.fields || {}) : null; };

// Fecha de hoy menos n días, en hora de México (sin horario de verano desde 2022)
const fechaMx = (n = 0) => new Date(Date.now() - 6 * 3600e3 - n * 864e5).toISOString().slice(0, 10);

// ── Lo mismo que hace cambiarResultado en la app ──
const finDe = (evento, ev) => { const v = evento && evento.id && ev[evento.id]; return v && v.st === "post" && v.hs !== "" && v.as !== "" ? { ...evento, fin: { hs: v.hs, as: v.as } } : evento; };
export function cambiosDe(a, r, ev) {
  if (!r.res) return { patas: r.patas };
  const c = { resultado: r.res, auto: true };
  if (a.evento) c.evento = finDe(a.evento, ev);
  let patas = r.patas || a.patas;
  if (Array.isArray(patas) && patas.length) {
    patas = patas.map(p => { const o = typeof p === "object" && p ? { ...p } : { deporte: "", desc: p }; if (o.evento) o.evento = finDe(o.evento, ev); return o; });
    if (r.res === "Ganada" && C.esCombo(a)) patas = patas.map(o => (o.desc && String(o.desc).trim() && !o.res ? { ...o, res: "G" } : o));
    c.patas = patas;
  }
  return c;
}
// Texto de la notificación (igual que la app)
export function avisoDe(a, res, bankAdmin) {
  const c = Number(a.cuota) || 0, dec = c > 0 ? c / 100 + 1 : c < 0 ? 100 / Math.abs(c) + 1 : 1;
  const pct = res === "Ganada" ? "+" + (Number(a.monto || 0) * (dec - 1)).toFixed(1) + "% del bank" : "-" + Number(a.monto || 0) + "% del bank";
  return { tipo: "resultados", title: (res === "Ganada" ? "✅ ¡Ganada!" : "❌ Perdida"), body: a.descripcion + " · " + pct, tag: "res-" + a.id, url: "./",
    apuesta: { id: a.id, monto: a.monto, cuota: a.cuota, fecha: a.fecha, resultado: res, descripcion: a.descripcion }, bankAdmin: bankAdmin || {} };
}

// ── Estado visible en la app (Más → Admin) ──
export async function estadoAuto(env) {
  const e = env.PUSH ? await env.PUSH.get("_auto", "json") : null;
  return { estado: e || null, configurado: !!env.FIREBASE_SA };
}
async function guardarEstado(env, nuevo) {
  const viejo = (await env.PUSH.get("_auto", "json")) || {};
  const hechos = [...(nuevo.hechos || []), ...(viejo.hechos || [])].slice(0, 12);
  const e = { ...nuevo, hechos };
  // Para no gastar escrituras: solo se guarda si cambió algo o cada 15 min
  const cambio = (nuevo.hechos || []).length || e.modo !== viejo.modo || e.error !== viejo.error || e.pendientes !== viejo.pendientes || JSON.stringify(e.seria) !== JSON.stringify(viejo.seria);
  if (cambio || !viejo.t || Date.now() - viejo.t > 15 * 60000) await env.PUSH.put("_auto", JSON.stringify(e));
}

export async function calificarTodo(env, { marcadores, avisarTodos }) {
  const t = Date.now();
  if (!env.FIREBASE_SA) return guardarEstado(env, { t, modo: "sin-configurar", error: "Falta el secreto FIREBASE_SA en Cloudflare" });
  try {
    const token = await tokenGoogle(env);
    const cfg = (await leerDoc(token, "/config/auto")) || {};
    if (cfg.calificar === false) return guardarEstado(env, { t, modo: "apagado" });
    const real = cfg.real === true;

    // Picks pendientes (solo de los últimos días y con partido elegido)
    const q = await fs(token, ":runQuery", { method: "POST", body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: "apuestas" }], where: { fieldFilter: { field: { fieldPath: "resultado" }, op: "EQUAL", value: { stringValue: "Pendiente" } } }, limit: 150 } }) });
    if (!q.ok) throw new Error("Firestore " + q.status + ": " + JSON.stringify(q.d).slice(0, 200));
    const lim = fechaMx(DIAS);
    const picks = (Array.isArray(q.d) ? q.d : []).filter(x => x.document).map(x => ({ ...deCampos(x.document.fields || {}), _ruta: x.document.name.split("/documents")[1], _upd: x.document.updateTime }))
      .filter(a => String(a.fecha || "") >= lim);
    const eventos = [...new Set(picks.flatMap(a => [a.evento, ...(Array.isArray(a.patas) ? a.patas : []).map(p => p && typeof p === "object" ? p.evento : null)])
      .filter(e => e && e.id && e.k && e.f && !e.fin).map(e => e.k + "~" + e.f + "~" + e.id))];
    if (!eventos.length) return guardarEstado(env, { t, modo: real ? "real" : "prueba", pendientes: picks.length, seria: [] });
    const ev = await marcadores(eventos);

    const hechos = [], seria = [];
    let bankAdmin = null;
    for (const a of picks) {
      const r = C.resultadoAuto(a, ev);
      if (!r) continue;
      if (!real) { seria.push({ d: a.descripcion || "Parlay", res: r.res || "patas" }); continue; }
      const cambios = cambiosDe(a, r, ev);
      const campos = Object.keys(cambios);
      const url = a._ruta + "?" + campos.map(c => "updateMask.fieldPaths=" + c).join("&") + "&currentDocument.updateTime=" + encodeURIComponent(a._upd);
      const fields = {}; campos.forEach(c => { fields[c] = aFS(cambios[c]); });
      const w = await fs(token, url, { method: "PATCH", body: JSON.stringify({ fields }) });
      if (!w.ok) continue; // si Alex lo cambió justo antes (o falló), no se toca ni se avisa
      if (r.res) {
        if (!bankAdmin) bankAdmin = (await leerDoc(token, "/config/bankrolls")) || {};
        try { await avisarTodos(env, avisoDe(a, r.res, bankAdmin)); } catch {}
        hechos.push({ d: a.descripcion || "Parlay", res: r.res, t: Date.now() });
      }
    }
    return guardarEstado(env, { t, modo: real ? "real" : "prueba", pendientes: picks.length, hechos, seria });
  } catch (e) {
    return guardarEstado(env, { t, modo: "error", error: String(e && e.message || e).slice(0, 300) });
  }
}
