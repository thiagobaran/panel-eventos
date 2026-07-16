import { supabase, isSupabaseConfigured } from "./supabaseClient";

const TABLE = "eventos";
const LOCAL_KEY = "eventos-data-v1";

/* ---------- mapeo JS (camelCase) <-> DB (snake_case) ---------- */
const num = (v) => (v === "" || v == null ? null : Number(v));

const toDb = (e) => {
  const distribucion = e.distribucion || "M1";
  const empresa =
    distribucion === "MIXTO"
      ? "MG M1 + M2"
      : distribucion === "M2"
      ? "MG M2"
      : "MG M1";
  const montoM1 = distribucion === "M2" ? null : num(e.montoM1);
  const montoM2 = distribucion === "M1" ? null : num(e.montoM2);
  const importe = (Number(montoM1) || 0) + (Number(montoM2) || 0);

  const estudioVal = Array.isArray(e.estudio) ? JSON.stringify(e.estudio) : (e.estudio || null);

  return {
    id: e.id,
    fecha: e.fecha || null,
    nombre: e.nombre || "",
    categoria: e.categoria || null,
    estudio: estudioVal,
    modalidad_rodaje: e.modalidadRodaje || null,
    tipo_prod: e.tipoProd || null,
    trackeo: e.trackeo || null,
    equipamiento: !!e.equipamiento,
    equipamiento_detalle: e.equipamientoDetalle || null,
    integrantes: e.integrantes || [],
    director: e.director || {},
    razon_social: e.razonSocial || null,
    cliente_id: e.clienteId || null,
    cuit: e.cuit || null,
    empresa,
    moneda: e.moneda || "ARS",
    importe: importe || null,
    distribucion,
    monto_m1: montoM1,
    monto_m2: montoM2,
    cant_facturas: num(e.cantFacturas),
    facturas_desglose: Array.isArray(e.facturasDesglose) ? e.facturasDesglose : [],
    tipo_cambio: num(e.tipoCambio),
    medio_pago: e.medioPago || null,
    forma_pago: e.formaPago || null,
    facturas_links: e.facturasLinks || null,
    facturas: Array.isArray(e.facturas) ? e.facturas : [],
    comprobantes: Array.isArray(e.comprobantes) ? e.comprobantes : [],
    pagos: Array.isArray(e.pagos) ? e.pagos : [],
    equipo_externo: Array.isArray(e.equipoExterno) ? e.equipoExterno : [],
    partes: Array.isArray(e.partes) ? e.partes : [],
    mensajes: Array.isArray(e.mensajes) ? e.mensajes : [],
    facturado: !!e.facturado,
    comprobante_pago: !!e.comprobantePago,
    facturado_total: !!e.facturadoTotal,
    confirmado: !!e.confirmado,
    confirmado_at: e.confirmadoAt || null,
    facturado_at: e.facturadoAt || null,
    comprobante_pago_at: e.comprobantePagoAt || null,
    observaciones: e.observaciones || null,
  };
};

const fromDb = (r) => {
  // Compat: eventos previos no tienen distribucion/montoM1/montoM2.
  let distribucion = r.distribucion;
  let montoM1 = r.monto_m1;
  let montoM2 = r.monto_m2;
  if (!distribucion) {
    distribucion = r.empresa === "MG M2" ? "M2" : "M1";
    if (distribucion === "M1" && montoM1 == null) montoM1 = r.importe ?? null;
    if (distribucion === "M2" && montoM2 == null) montoM2 = r.importe ?? null;
  }
  // estudio: parse JSON-stringified array from text column, or legacy single string
  let estudio = [];
  if (Array.isArray(r.estudio)) {
    estudio = r.estudio;
  } else if (typeof r.estudio === "string" && r.estudio) {
    try { const p = JSON.parse(r.estudio); if (Array.isArray(p)) estudio = p; else estudio = [r.estudio]; } catch { estudio = [r.estudio]; }
  }

  return {
    id: r.id,
    fecha: r.fecha || "",
    nombre: r.nombre || "",
    categoria: r.categoria || "",
    estudio,
    modalidadRodaje: r.modalidad_rodaje || "",
    tipoProd: r.tipo_prod || "",
    trackeo: r.trackeo || "",
    equipamiento: !!r.equipamiento,
    equipamientoDetalle: r.equipamiento_detalle || "",
    integrantes: r.integrantes || [],
    director: r.director || { nombre: "", telefono: "", email: "" },
    razonSocial: r.razon_social || "",
    clienteId: r.cliente_id || "",
    cuit: r.cuit || "",
    empresa: r.empresa || "",
    moneda: r.moneda || "ARS",
    importe: r.importe ?? "",
    distribucion,
    montoM1: montoM1 ?? "",
    montoM2: montoM2 ?? "",
    cantFacturas: r.cant_facturas ?? "",
    facturasDesglose: Array.isArray(r.facturas_desglose) ? r.facturas_desglose : [],
    tipoCambio: r.tipo_cambio ?? "",
    medioPago: r.medio_pago || "",
    formaPago: r.forma_pago || "",
    facturasLinks: r.facturas_links || "",
    facturas: Array.isArray(r.facturas) ? r.facturas : [],
    comprobantes: Array.isArray(r.comprobantes) ? r.comprobantes : [],
    pagos: Array.isArray(r.pagos) ? r.pagos : [],
    equipoExterno: Array.isArray(r.equipo_externo) ? r.equipo_externo : [],
    partes: Array.isArray(r.partes) ? r.partes : [],
    mensajes: Array.isArray(r.mensajes) ? r.mensajes : [],
    facturado: !!r.facturado,
    comprobantePago: !!r.comprobante_pago,
    facturadoTotal: !!r.facturado_total,
    confirmado: !!r.confirmado,
    confirmadoAt: r.confirmado_at || null,
    facturadoAt: r.facturado_at || null,
    comprobantePagoAt: r.comprobante_pago_at || null,
    observaciones: r.observaciones || "",
  };
};

/* ---------- modo local (sin Supabase configurado) ---------- */
function loadLocal() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY)) || [];
  } catch {
    return [];
  }
}
function saveLocal(data) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
}

/* ---------- API pública ---------- */
export async function listEventos() {
  if (!isSupabaseConfigured) return loadLocal();
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("fecha", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(fromDb);
}

export async function upsertEvento(evento) {
  if (!isSupabaseConfigured) {
    // Normalizamos por round-trip para derivar empresa/importe igual que en DB
    const normalized = fromDb(toDb(evento));
    const data = loadLocal();
    const idx = data.findIndex((e) => e.id === normalized.id);
    if (idx >= 0) data[idx] = normalized;
    else data.unshift(normalized);
    saveLocal(data);
    return normalized;
  }
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(toDb(evento))
    .select()
    .single();
  if (error) throw error;
  return fromDb(data);
}

export async function deleteEvento(id) {
  if (!isSupabaseConfigured) {
    saveLocal(loadLocal().filter((e) => e.id !== id));
    return;
  }
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

/** Se suscribe a cambios en tiempo real (otros usuarios cargando/editando eventos). */
export function subscribeEventos(onChange) {
  if (!isSupabaseConfigured) return () => {};
  const channel = supabase
    .channel("eventos-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}
