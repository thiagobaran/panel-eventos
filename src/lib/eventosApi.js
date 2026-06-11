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

  return {
    id: e.id,
    fecha: e.fecha || null,
    nombre: e.nombre || "",
    categoria: e.categoria || null,
    estudio: e.estudio || null,
    tipo_prod: e.tipoProd || null,
    trackeo: e.trackeo || null,
    equipamiento: !!e.equipamiento,
    equipamiento_detalle: e.equipamientoDetalle || null,
    integrantes: e.integrantes || [],
    director: e.director || {},
    razon_social: e.razonSocial || null,
    empresa,
    moneda: e.moneda || "ARS",
    importe: importe || null,
    distribucion,
    monto_m1: montoM1,
    monto_m2: montoM2,
    cant_facturas: num(e.cantFacturas),
    medio_pago: e.medioPago || null,
    forma_pago: e.formaPago || null,
    facturas_links: e.facturasLinks || null,
    facturas: Array.isArray(e.facturas) ? e.facturas : [],
    comprobantes: Array.isArray(e.comprobantes) ? e.comprobantes : [],
    facturado: !!e.facturado,
    comprobante_pago: !!e.comprobantePago,
    facturado_total: !!e.facturadoTotal,
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
  return {
    id: r.id,
    fecha: r.fecha || "",
    nombre: r.nombre || "",
    categoria: r.categoria || "",
    estudio: r.estudio || "",
    tipoProd: r.tipo_prod || "",
    trackeo: r.trackeo || "",
    equipamiento: !!r.equipamiento,
    equipamientoDetalle: r.equipamiento_detalle || "",
    integrantes: r.integrantes || [],
    director: r.director || { nombre: "", telefono: "", email: "" },
    razonSocial: r.razon_social || "",
    empresa: r.empresa || "",
    moneda: r.moneda || "ARS",
    importe: r.importe ?? "",
    distribucion,
    montoM1: montoM1 ?? "",
    montoM2: montoM2 ?? "",
    cantFacturas: r.cant_facturas ?? "",
    medioPago: r.medio_pago || "",
    formaPago: r.forma_pago || "",
    facturasLinks: r.facturas_links || "",
    facturas: Array.isArray(r.facturas) ? r.facturas : [],
    comprobantes: Array.isArray(r.comprobantes) ? r.comprobantes : [],
    facturado: !!r.facturado,
    comprobantePago: !!r.comprobante_pago,
    facturadoTotal: !!r.facturado_total,
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
