// AlexPicks · Lector de boletos con IA (Cloudflare Worker)
// Recibe la foto de un boleto, verifica que quien la manda sea admin de AlexPicks
// y le pide a Claude que extraiga los datos de la apuesta.
// La clave de Anthropic vive SOLO como secreto ANTHROPIC_API_KEY en Cloudflare.

const ORIGENES = ["https://alexmz24k.github.io"];
const ADMINS = ["alexitozenil@gmail.com", "prokiller548@gmail.com"];
const FIREBASE_API_KEY = "AIzaSyC50jJFVDbRCjxGQsm-ioTt-xlDQU1-YUo"; // clave pública de la app (no es secreta)
const MODELO = "claude-sonnet-5-5";

const DEPORTES = ["Fútbol","Béisbol","Basquetbol","Americano","Tenis","Americano Colegial","Basquetbol Colegial","Combinación"];
const TIPOS = ["Moneyline","Handicap/Spread","Over/Under","Parlay/Combinada","Especial por jugador","PlayBoost","Freebet"];

const cors = origin => ({
  "Access-Control-Allow-Origin": ORIGENES.includes(origin) ? origin : ORIGENES[0],
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
    if (request.method !== "POST") return json({ error: "Usa POST" }, 405, origin);
    if (!ORIGENES.includes(origin)) return json({ error: "Origen no permitido" }, 403, origin);
    if (!env.ANTHROPIC_API_KEY) return json({ error: "Falta el secreto ANTHROPIC_API_KEY en Cloudflare" }, 500, origin);

    // 1) Verificar que sea un admin con sesión de Google en la app
    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Inicia sesión" }, 401, origin);
    const look = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: token }),
    });
    const quien = look.ok ? await look.json() : null;
    const email = ((quien && quien.users && quien.users[0] && quien.users[0].email) || "").toLowerCase();
    if (!ADMINS.includes(email)) return json({ error: "Solo los admins pueden leer boletos" }, 403, origin);

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
