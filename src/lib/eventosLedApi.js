import { supabase, isSupabaseConfigured } from "./supabaseClient";

const TABLE = "eventos_led";
const LOCAL_KEY = "eventos-led-data-v1";

/* ---------- mapeo JS (camelCase) <-> DB (snake_case) ---------- */
const num = (v) => (v === "" || v == null ? null : Number(v));

const toDb = (e) => {
  const distribucion = e.distribucion || "M1";
  const empresa =
    distribucion === "MIXTO" ? "MG M1 + M2" : distribucion === "M2" ? "MG M2" : "MG M1";
  const montoM1 = distribucion === "M2" ? null : num(e.montoM1);
  const montoM2 = distribucion === "M1" ? null : num(e.montoM2);

  return {
    id: e.id,
    fecha: e.fecha || null,
    nombre: e.nombre || "",
    tipo_instalacion: e.tipoInstalacion || null,
    ubicacion: e.ubicacion || null,
    ancho_pantalla_m: num(e.anchoPantallaM),
    alto_pantalla_m: num(e.altoPantallaM),
    armado_fechas: Array.isArray(e.armadoFechas) ? e.armadoFechas : [],
    servicio_inicio: e.servicioInicio || null,
    servicio_fin: e.servicioFin || null,
    desarme_fechas: Array.isArray(e.desarmeFechas) ? e.desarmeFechas : [],
    cliente_id: e.clienteId || null,
    razon_social: e.razonSocial || null,
    cuit: e.cuit || null,
    empresa,
    moneda: e.moneda || "ARS",
    distribucion,
    monto_m1: montoM1,
    monto_m2: montoM2,
    cant_facturas: num(e.cantFacturas),
    facturas_desglose: Array.isArray(e.facturasDesglose) ? e.facturasDesglose : [],
    tipo_cambio: num(e.tipoCambio),
    medio_pago: e.medioPago || null,
    forma_pago: e.formaPago || null,
    cuotas_pago: Array.isArray(e.cuotasPago) ? e.cuotasPago : [],
    facturas: Array.isArray(e.facturas) ? e.facturas : [],
    comprobantes: Array.isArray(e.comprobantes) ? e.comprobantes : [],
    pagos: Array.isArray(e.pagos) ? e.pagos : [],
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

const fromDb = (r) => ({
  id: r.id,
  fecha: r.fecha || "",
  nombre: r.nombre || "",
  tipoInstalacion: r.tipo_instalacion || "",
  ubicacion: r.ubicacion || "",
  anchoPantallaM: r.ancho_pantalla_m ?? "",
  altoPantallaM: r.alto_pantalla_m ?? "",
  armadoFechas: Array.isArray(r.armado_fechas) ? r.armado_fechas : [],
  servicioInicio: r.servicio_inicio || "",
  servicioFin: r.servicio_fin || "",
  desarmeFechas: Array.isArray(r.desarme_fechas) ? r.desarme_fechas : [],
  clienteId: r.cliente_id || "",
  razonSocial: r.razon_social || "",
  cuit: r.cuit || "",
  empresa: r.empresa || "",
  moneda: r.moneda || "ARS",
  distribucion: r.distribucion || "M1",
  montoM1: r.monto_m1 ?? "",
  montoM2: r.monto_m2 ?? "",
  cantFacturas: r.cant_facturas ?? "",
  facturasDesglose: Array.isArray(r.facturas_desglose) ? r.facturas_desglose : [],
  tipoCambio: r.tipo_cambio ?? "",
  medioPago: r.medio_pago || "",
  formaPago: r.forma_pago || "",
  cuotasPago: Array.isArray(r.cuotas_pago) ? r.cuotas_pago : [],
  facturas: Array.isArray(r.facturas) ? r.facturas : [],
  comprobantes: Array.isArray(r.comprobantes) ? r.comprobantes : [],
  pagos: Array.isArray(r.pagos) ? r.pagos : [],
  mensajes: Array.isArray(r.mensajes) ? r.mensajes : [],
  facturado: !!r.facturado,
  comprobantePago: !!r.comprobante_pago,
  facturadoTotal: !!r.facturado_total,
  confirmado: !!r.confirmado,
  confirmadoAt: r.confirmado_at || null,
  facturadoAt: r.facturado_at || null,
  comprobantePagoAt: r.comprobante_pago_at || null,
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
export async function listEventosLed() {
  if (!isSupabaseConfigured) return loadLocal();
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("fecha", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(fromDb);
}

export async function upsertEventoLed(evento) {
  if (!isSupabaseConfigured) {
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

export async function deleteEventoLed(id) {
  if (!isSupabaseConfigured) {
    saveLocal(loadLocal().filter((e) => e.id !== id));
    return;
  }
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

/** Se suscribe a cambios en tiempo real. */
export function subscribeEventosLed(onChange) {
  if (!isSupabaseConfigured) return () => {};
  const channel = supabase
    .channel("eventos-led-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}
