import { supabase, isSupabaseConfigured } from "./supabaseClient";

const TABLE = "eventos";
const LOCAL_KEY = "eventos-data-v1";

/* ---------- mapeo JS (camelCase) <-> DB (snake_case) ---------- */
const toDb = (e) => ({
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
  empresa: e.empresa || null,
  moneda: e.moneda || "ARS",
  importe: e.importe === "" || e.importe == null ? null : Number(e.importe),
  cant_facturas:
    e.cantFacturas === "" || e.cantFacturas == null
      ? null
      : Number(e.cantFacturas),
  medio_pago: e.medioPago || null,
  forma_pago: e.formaPago || null,
  facturas_links: e.facturasLinks || null,
  facturado: !!e.facturado,
  comprobante_pago: !!e.comprobantePago,
  facturado_total: !!e.facturadoTotal,
  observaciones: e.observaciones || null,
});

const fromDb = (r) => ({
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
  cantFacturas: r.cant_facturas ?? "",
  medioPago: r.medio_pago || "",
  formaPago: r.forma_pago || "",
  facturasLinks: r.facturas_links || "",
  facturado: !!r.facturado,
  comprobantePago: !!r.comprobante_pago,
  facturadoTotal: !!r.facturado_total,
  observaciones: r.observaciones || "",
});

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
    const data = loadLocal();
    const idx = data.findIndex((e) => e.id === evento.id);
    if (idx >= 0) data[idx] = evento;
    else data.unshift(evento);
    saveLocal(data);
    return evento;
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
