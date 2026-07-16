// Función serverless (Vercel) para el asistente de consultas en lenguaje natural.
//
// IMPORTANTE: este archivo corre en el SERVIDOR, no en el navegador. La API key
// de Anthropic se lee de una variable de entorno del servidor (ANTHROPIC_API_KEY)
// y NUNCA se expone al cliente. No usar el prefijo VITE_ para esta variable.
//
// Enfoque "texto → filtro": a Claude solo le mandamos la pregunta del usuario y la
// descripción de los campos disponibles (no los datos de los eventos). Devuelve un
// filtro estructurado en JSON que la app aplica localmente. Así el gasto de tokens
// es mínimo y los montos/razones sociales nunca salen del navegador.

const MODEL = process.env.ASISTENTE_MODEL || "claude-haiku-4-5-20251001";

const CATEGORIAS = ["VIDEO CLIP", "RODAJE SERIE", "RODAJE LARGO", "EVENTO / DEMO", "PUBLICIDAD"];
const MODALIDADES = ["En estudio", "Rodaje externo", "Servicio virtual"];
const ESTUDIOS = ["1", "2", "3"];
const EMPRESAS = ["M1", "M2", "MIXTO"];

const systemPrompt = (hoy) => `Sos un traductor de preguntas a filtros para un panel de gestión de eventos de una productora audiovisual. La fecha de hoy es ${hoy} (formato YYYY-MM-DD, zona horaria Argentina).

Tu única tarea es convertir la pregunta del usuario en un objeto JSON con esta forma EXACTA (no agregues campos):

{
  "intencion": "listar" | "sumar" | "contar" | "dias_persona" | "demora",
  "metrica_demora": "facturacion" | "comprobante" | null,
  "moneda_metrica": "ARS" | "USD" | "ambas" | null,
  "agrupar_por": "proyecto" | "persona" | "categoria" | "estudio" | "modalidad" | "empresa" | "mes" | null,
  "filtros": {
    "desde": "YYYY-MM-DD" | null,
    "hasta": "YYYY-MM-DD" | null,
    "categorias": ${JSON.stringify(CATEGORIAS)} (subconjunto) | [],
    "modalidades": ${JSON.stringify(MODALIDADES)} (subconjunto) | [],
    "estudios": ${JSON.stringify(ESTUDIOS)} (subconjunto) | [],
    "empresas": ${JSON.stringify(EMPRESAS)} (subconjunto) | [],
    "moneda": "ARS" | "USD" | null,
    "estado": "borrador" | "listo" | "facturado" | "sin_facturar" | "sin_comprobante" | "vencido" | "sin_cobrar" | "cobrado_parcial" | "cobrado" | null,
    "persona": string | null,
    "texto": string | null
  },
  "explicacion": string
}

Reglas sobre "intencion":
- "sumar": preguntan cuánto/monto/total de plata facturada. Definí "moneda_metrica" ("ARS", "USD" o "ambas"; si no aclara, "ambas").
- "contar": preguntan cuántos eventos/proyectos/cantidad.
- "listar": quieren ver/mostrar cuáles eventos.
- "dias_persona": preguntan cuántos días trabajó/laburó una persona (poné el nombre en filtros.persona; si preguntan por todas las personas, usá agrupar_por="persona").
- "demora": preguntan cuánto se demoró/tardó una facturación o un comprobante de pago. Definí "metrica_demora": "facturacion" (demora entre confirmar y facturar) o "comprobante" (demora entre facturar y cargar el comprobante de pago).

Reglas sobre "agrupar_por":
- Usalo cuando pidan un desglose "por proyecto", "por persona", "por categoría", "por estudio", "por mes", "por empresa" (ej: "facturación por proyecto este mes"). Si no piden desglose, dejalo en null.

Reglas sobre "filtros":
- "desde"/"hasta": resolvé fechas relativas ("este mes", "la semana que viene", "junio", "el año pasado", "esta semana") a rango absoluto usando la fecha de hoy. Si no hay referencia temporal, dejá ambas en null.
- "estado": "listo" = confirmado pero no facturado; "sin_facturar" = todo lo no facturado; "sin_comprobante" = facturado sin comprobante de pago; "vencido" = pago vencido; "sin_cobrar" = sin ningún pago recibido; "cobrado_parcial" = cobrado en parte; "cobrado" = cobrado en su totalidad.
- "persona": nombre de un integrante o director mencionado.
- "texto": solo si buscan por nombre de evento/razón social específica que no encaja en otro campo.
- Dejá en null o [] todo lo que no aplique.

"explicacion": una frase corta y clara en español de qué se está buscando.

Respondé ÚNICAMENTE con el JSON, sin texto adicional, sin markdown, sin backticks.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "metodo_no_permitido" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // No hay key cargada: el asistente queda inactivo pero la app no se rompe.
    res.status(200).json({ error: "no_configurado" });
    return;
  }

  try {
    const { pregunta, hoy } = req.body || {};
    if (!pregunta || typeof pregunta !== "string") {
      res.status(400).json({ error: "pregunta_invalida" });
      return;
    }
    const fechaHoy = (typeof hoy === "string" && /^\d{4}-\d{2}-\d{2}$/.test(hoy))
      ? hoy
      : new Date().toISOString().slice(0, 10);

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: systemPrompt(fechaHoy),
        messages: [{ role: "user", content: pregunta.slice(0, 500) }],
      }),
    });

    if (!r.ok) {
      const detalle = await r.text();
      res.status(502).json({ error: "error_anthropic", detalle: detalle.slice(0, 300) });
      return;
    }

    const data = await r.json();
    const texto = (data?.content || []).map((b) => b.text || "").join("").trim();

    let spec;
    try {
      // Por si el modelo envuelve en ```json ... ```
      const limpio = texto.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      spec = JSON.parse(limpio);
    } catch {
      res.status(200).json({ error: "no_entendido", crudo: texto.slice(0, 200) });
      return;
    }

    res.status(200).json({ spec });
  } catch (e) {
    res.status(500).json({ error: "error_interno", detalle: String(e).slice(0, 200) });
  }
}
