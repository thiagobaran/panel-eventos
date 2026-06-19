import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Plus, Search, Calendar, Film, Layers, Camera, Crosshair,
  Wrench, Users, Building2, Phone, FileText, Check, X,
  Trash2, Pencil, AlertTriangle, Clock, DollarSign, ChevronLeft,
  Download, Upload, WifiOff, RefreshCw, Paperclip, Receipt, Eye, EyeOff,
  LogOut, KeyRound, UserCog, ShieldCheck, Lock,
  BarChart2, ChevronRight, MessageSquare, Send, Printer, Copy,
} from "lucide-react";
import { listEventos, upsertEvento, deleteEvento, subscribeEventos } from "./lib/eventosApi";
import { listPersonas, upsertPersona, deletePersona, subscribePersonas } from "./lib/personasApi";
import {
  listCategoriasPersonal, upsertCategoriaPersonal, deleteCategoriaPersonal,
  subscribeCategoriasPersonal
} from "./lib/categoriasPersonalApi";
import { subirArchivo, urlArchivo, borrarArchivo } from "./lib/storageApi";
import { isSupabaseConfigured } from "./lib/supabaseClient";
import {
  listUsuarios, crearUsuario, actualizarUsuario, cambiarPassword, borrarUsuario,
  loginUsuario, seedUsuariosIniciales, ensurePruebaUser, guardarSesion, leerSesion, subscribeUsuarios,
  ROLES, perms,
} from "./lib/usuariosApi";

/* ---------- constantes ---------- */
const CATEGORIAS = ["Videoclip", "Publicidad", "Película", "Serie"];
const ESTUDIOS = ["1", "2", "3"];
const MONEDAS = ["ARS", "USD"];
const TIPO_PROD = ["Virtual Production", "Back Projecting"];
const TRACKEO = ["Con trackeo", "Sin trackeo"];

// Distribución de facturación entre las dos razones sociales.
// M1 = factura con IVA · M2 = efectivo (sin IVA) · MIXTO = una parte por cada una
const DISTRIBUCION_OPCIONES = [
  { value: "M1", label: "Todo M1", help: "Factura con IVA" },
  { value: "M2", label: "Todo M2", help: "Efectivo, sin IVA" },
  { value: "MIXTO", label: "M1 + M2", help: "Mixto: parte facturado, parte efectivo" },
];
const DISTRIBUCION_FILTRO = [
  { value: "M1", label: "MG M1" },
  { value: "M2", label: "MG M2" },
  { value: "MIXTO", label: "Mixto" },
];

const MESES_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const EST_COLORS = { "1": "#D4AF37", "2": "#9b8cff", "3": "#4FD18B" };
const PARTES_PROD = ["Armado", "Armado + Prelight", "Prelighting", "Rodaje", "Desarme"];
const PARTES_COLORS = {
  "Armado": "#4FD18B",
  "Armado + Prelight": "#F0B429",
  "Prelighting": "#9b8cff",
  "Rodaje": "#F2557A",
  "Desarme": "#64B5F6",
};
const getColorPartes = (partes) => {
  if (!partes || partes.length === 0) return "#D4AF37";
  const prio = ["Rodaje", "Prelighting", "Armado + Prelight", "Armado", "Desarme"];
  for (const p of prio) { if (partes.includes(p)) return PARTES_COLORS[p]; }
  return "#D4AF37";
};
const getFechasEvento = (ev) => {
  const fechasPartes = new Set((ev.partes || []).flatMap((p) => p.fechas || []));
  if (fechasPartes.size > 0) return fechasPartes;
  if (ev.fecha) return new Set([ev.fecha]);
  return new Set();
};

const C = {
  bg: "#000000",
  panel: "#141414",
  panel2: "#1F1B12",
  border: "#3A3122",
  text: "#F5F1E8",
  dim: "#A39A88",
  gold: "#D4AF37",
  onGold: "#1A1400",
  amber: "#F0B429",
  rose: "#F2557A",
  green: "#4FD18B",
};

const nuevoEvento = () => ({
  id: crypto.randomUUID(),
  fecha: "",
  nombre: "",
  categoria: "",
  estudio: "",
  tipoProd: "",
  trackeo: "",
  equipamiento: false,
  equipamientoDetalle: "",
  integrantes: [],
  equipoExterno: [],
  director: { nombre: "", telefono: "", email: "" },
  razonSocial: "",
  empresa: "",
  moneda: "ARS",
  importe: "",
  distribucion: "M1",
  montoM1: "",
  montoM2: "",
  cantFacturas: "",
  medioPago: "",
  formaPago: "",
  facturas: [],
  comprobantes: [],
  partes: PARTES_PROD.map((tipo) => ({ tipo, fechas: [] })),
  mensajes: [],
  facturado: false,
  comprobantePago: false,
  facturadoTotal: false,
  observaciones: "",
});

/* ---------- helpers ---------- */
const totalDias = (partes) =>
  new Set((partes || []).flatMap((p) => p.fechas || [])).size;

// Dado un array de partes de un evento y los tipos asignados a un integrante,
// devuelve el Set de fechas en las que ese integrante trabajaría.
// Si el integrante no tiene partes asignadas, se considera que va a todas.
const getFechasTrabajo = (eventPartes, integrantePartes) => {
  if (!eventPartes || eventPartes.length === 0) return new Set();
  const filtro = (integrantePartes || []).length > 0 ? integrantePartes : PARTES_PROD;
  return new Set(eventPartes.filter((p) => filtro.includes(p.tipo)).flatMap((p) => p.fechas || []));
};

// Lectura de mensajes: guardamos en localStorage la última vez que cada usuario
// abrió el detalle de cada evento. Con eso calculamos cuántos mensajes nuevos hay.
const READS_KEY = "panel-eventos-reads-v1";
const marcarLeido = (eventoId, userId) => {
  try {
    const reads = JSON.parse(localStorage.getItem(READS_KEY) || "{}");
    if (!reads[eventoId]) reads[eventoId] = {};
    reads[eventoId][userId] = new Date().toISOString();
    localStorage.setItem(READS_KEY, JSON.stringify(reads));
  } catch {}
};
const mensajesNoLeidos = (mensajes, eventoId, userId) => {
  if (!userId || !mensajes?.length) return 0;
  try {
    const reads = JSON.parse(localStorage.getItem(READS_KEY) || "{}");
    const ultima = reads[eventoId]?.[userId];
    if (!ultima) return mensajes.length;
    return mensajes.filter((m) => m.fecha > ultima).length;
  } catch { return 0; }
};

const fmtMoneda = (n, m) => {
  const v = Number(n) || 0;
  return new Intl.NumberFormat("es-AR", {
    style: "currency", currency: m === "USD" ? "USD" : "ARS",
    maximumFractionDigits: 0,
  }).format(v);
};
const conIva = (n) => (Number(n) || 0) * 1.21;
const fmtFecha = (f) => {
  if (!f) return "—";
  const [y, mo, d] = f.split("-");
  return `${d}/${mo}/${y}`;
};
const fmtBytes = (b) => {
  const n = Number(b) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

// Totales derivados de la distribución M1 / M2 / MIXTO.
const montoM1 = (ev) => Number(ev?.montoM1) || 0;
const montoM2 = (ev) => Number(ev?.montoM2) || 0;
const totalNeto = (ev) => montoM1(ev) + montoM2(ev);
const totalFacturable = (ev) => montoM1(ev) * 1.21 + montoM2(ev);
const empresaLabel = (d) =>
  d === "MIXTO" ? "MG M1 + M2" : d === "M2" ? "MG M2" : "MG M1";

/* ===================================================================== */
export default function PanelEventos() {
  /* ---------- sesión / usuarios ---------- */
  const [usuario, setUsuario] = useState(() => leerSesion());
  const [bootError, setBootError] = useState("");
  const [usuarios, setUsuarios] = useState([]);
  const [seedInfo, setSeedInfo] = useState(null); // {sembrados, defaults} si recién creamos los iniciales

  const recargarUsuarios = useCallback(async () => {
    try {
      const data = await listUsuarios();
      setUsuarios(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Bootstrap: si no hay usuarios todavía en la base, los sembramos.
  useEffect(() => {
    (async () => {
      try {
        const info = await seedUsuariosIniciales();
        if (info.sembrados) setSeedInfo(info);
        await ensurePruebaUser();
        await recargarUsuarios();
      } catch (e) {
        console.error(e);
        const msg = String(e?.message || "");
        if (e?.code === "42P01" || /relation .* does not exist|could not find the table/i.test(msg)) {
          setBootError(
            "Falta correr la versión actualizada de supabase/schema.sql en Supabase " +
            "(SQL Editor → New query → Run) para crear la tabla de usuarios."
          );
        } else {
          setBootError("No se pudo inicializar usuarios: " + msg);
        }
      }
    })();
  }, [recargarUsuarios]);

  // Realtime: si el admin agrega/edita usuarios desde otra pantalla
  useEffect(() => {
    const unsub = subscribeUsuarios(() => recargarUsuarios());
    return unsub;
  }, [recargarUsuarios]);

  const hacerLogin = async (nombre, password) => {
    const u = await loginUsuario(nombre, password);
    if (!u) throw new Error("Usuario o contraseña incorrectos.");
    guardarSesion(u);
    setUsuario(u);
    return u;
  };

  const hacerLogout = () => {
    guardarSesion(null);
    setUsuario(null);
  };

  const p = useMemo(() => perms(usuario?.rol), [usuario]);

  /* ---------- datos del panel ---------- */
  const [eventos, setEventos] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [categoriasPersonal, setCategoriasPersonal] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [vista, setVista] = useState("home"); // home | lista | form | detalle | dashboard | personal | usuarios
  const [editId, setEditId] = useState(null);
  const [duplicandoBase, setDuplicandoBase] = useState(null);
  const [verId, setVerId] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroCat, setFiltroCat] = useState("");
  const [filtroEmp, setFiltroEmp] = useState("");
  const [filtroTiempo, setFiltroTiempo] = useState("proximos"); // proximos | finalizados | todos

  const recargar = useCallback(async () => {
    try {
      const data = await listEventos();
      setEventos(data);
      setError("");
    } catch (e) {
      console.error(e);
      setError("No se pudieron cargar los eventos. Revisá la conexión con la base de datos.");
    }
  }, []);

  const recargarPersonas = useCallback(async () => {
    try {
      const data = await listPersonas();
      setPersonas(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const recargarCategoriasPersonal = useCallback(async () => {
    try {
      const data = await listCategoriasPersonal();
      setCategoriasPersonal(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  /* carga inicial */
  useEffect(() => {
    (async () => {
      setCargando(true);
      await Promise.all([recargar(), recargarPersonas(), recargarCategoriasPersonal()]);
      setCargando(false);
    })();
  }, [recargar, recargarPersonas, recargarCategoriasPersonal]);

  /* tiempo real: refresca si otro usuario carga/edita/borra un evento */
  useEffect(() => {
    const unsub = subscribeEventos(() => recargar());
    return unsub;
  }, [recargar]);

  /* tiempo real: refresca si otro usuario edita el listado de personal */
  useEffect(() => {
    const unsub = subscribePersonas(() => recargarPersonas());
    return unsub;
  }, [recargarPersonas]);

  /* tiempo real: categorías del personal */
  useEffect(() => {
    const unsub = subscribeCategoriasPersonal(() => recargarCategoriasPersonal());
    return unsub;
  }, [recargarCategoriasPersonal]);

  const guardarEvento = async (ev) => {
    setGuardando(true);
    try {
      await upsertEvento(ev);
      await recargar();
      setVista("lista");
      setEditId(null);
      setDuplicandoBase(null);
    } catch (e) {
      console.error(e);
      alert("No se pudo guardar el evento: " + e.message);
    } finally {
      setGuardando(false);
    }
  };

  const actualizarEvento = async (id, patch) => {
    const ev = eventos.find((e) => e.id === id);
    if (!ev) return;
    try {
      await upsertEvento({ ...ev, ...patch });
      await recargar();
    } catch (e) {
      console.error(e);
      alert("No se pudo actualizar el evento: " + e.message);
    }
  };

  const duplicarEvento = (ev) => {
    const copia = {
      ...nuevoEvento(),
      ...ev,
      id: crypto.randomUUID(),
      nombre: "",
      fecha: "",
      facturas: [],
      comprobantes: [],
      mensajes: [],
      facturado: false,
      comprobantePago: false,
      facturadoTotal: false,
    };
    setDuplicandoBase(copia);
    setEditId(null);
    setVista("form");
  };

  const borrarEvento = async (id) => {
    try {
      await deleteEvento(id);
      await recargar();
      if (verId === id) setVista("lista");
    } catch (e) {
      console.error(e);
      alert("No se pudo borrar el evento: " + e.message);
    }
  };

  const guardarPersona = async (persona) => {
    try {
      await upsertPersona(persona);
      await recargarPersonas();
    } catch (e) {
      console.error(e);
      alert("No se pudo guardar la persona: " + e.message);
    }
  };

  const borrarPersona = async (id) => {
    try {
      await deletePersona(id);
      await recargarPersonas();
    } catch (e) {
      console.error(e);
      alert("No se pudo borrar la persona: " + e.message);
    }
  };

  const explicarErrorSchema = (e, fallback) => {
    const msg = String(e?.message || e || "");
    const code = e?.code || "";
    const faltaTabla =
      code === "42P01" ||
      /relation .* does not exist/i.test(msg) ||
      /could not find the table/i.test(msg);
    if (faltaTabla) {
      return (
        "Falta correr la versión actualizada de supabase/schema.sql en " +
        "Supabase (SQL Editor → New query → Run). El script es idempotente: " +
        "agrega lo nuevo sin tocar lo que ya tenés.\n\nError original: " + msg
      );
    }
    return fallback + msg;
  };

  const guardarCategoriaPersonal = async (categoria) => {
    try {
      await upsertCategoriaPersonal(categoria);
      await recargarCategoriasPersonal();
    } catch (e) {
      console.error(e);
      alert(explicarErrorSchema(e, "No se pudo guardar la categoría: "));
    }
  };

  const borrarCategoriaPersonal = async (id) => {
    try {
      await deleteCategoriaPersonal(id);
      await Promise.all([recargarCategoriasPersonal(), recargarPersonas()]);
    } catch (e) {
      console.error(e);
      alert(explicarErrorSchema(e, "No se pudo borrar la categoría: "));
    }
  };

  const liberarPersonaDeEvento = async (eventoId, personaId) => {
    const ev = eventos.find((x) => x.id === eventoId);
    if (!ev) return;
    const integrantes = (ev.integrantes || []).filter(
      (i) => i.personaId !== personaId
    );
    try {
      await upsertEvento({ ...ev, integrantes });
      await recargar();
    } catch (e) {
      console.error(e);
      alert("No se pudo liberar la persona del otro evento: " + e.message);
    }
  };

  const reemplazarEnEvento = async (eventoId, personaIdActual, personaIdNuevo) => {
    const ev = eventos.find((x) => x.id === eventoId);
    if (!ev) return;
    const nuevaPersona = personas.find((p) => p.id === personaIdNuevo);
    if (!nuevaPersona) return;
    const integrantes = (ev.integrantes || []).map((i) =>
      i.personaId === personaIdActual
        ? { ...i, personaId: personaIdNuevo, nombre: nuevaPersona.nombre }
        : i
    );
    try {
      await upsertEvento({ ...ev, integrantes });
      await recargar();
    } catch (e) {
      console.error(e);
      alert("No se pudo reemplazar la persona: " + e.message);
    }
  };

  /* exportar / importar JSON (respaldo manual) */
  const exportarJSON = () => {
    const blob = new Blob([JSON.stringify(eventos, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eventos-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* filtrado */
  const hoyISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const conteosTiempo = useMemo(() => {
    let prox = 0, fin = 0;
    for (const e of eventos) {
      if (!e.fecha) continue;
      if (e.fecha >= hoyISO) prox += 1; else fin += 1;
    }
    return { proximos: prox, finalizados: fin, todos: eventos.length };
  }, [eventos, hoyISO]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return eventos.filter((e) => {
      if (filtroTiempo === "proximos" && (!e.fecha || e.fecha < hoyISO)) return false;
      if (filtroTiempo === "finalizados" && (!e.fecha || e.fecha >= hoyISO)) return false;
      if (filtroCat && e.categoria !== filtroCat) return false;
      if (filtroEmp && (e.distribucion || "M1") !== filtroEmp) return false;
      if (!q) return true;
      return (
        (e.nombre || "").toLowerCase().includes(q) ||
        (e.razonSocial || "").toLowerCase().includes(q) ||
        (e.director?.nombre || "").toLowerCase().includes(q) ||
        e.integrantes?.some((i) =>
          (i.nombre + " " + i.rol).toLowerCase().includes(q)
        )
      );
    });
  }, [eventos, busqueda, filtroCat, filtroEmp, filtroTiempo, hoyISO]);

  const pendFact = eventos.filter((e) => e.nombre && !e.facturado);
  const pendComp = eventos.filter(
    (e) => e.nombre && e.facturado && !e.comprobantePago
  );

  const eventoEdit = editId ? eventos.find((e) => e.id === editId) : null;
  const eventoVer = verId ? eventos.find((e) => e.id === verId) : null;

  /* ---------- handlers de usuarios (admin) ---------- */
  const onCrearUsuario = async (datos) => {
    await crearUsuario(datos);
    await recargarUsuarios();
  };
  const onActualizarUsuario = async (datos) => {
    await actualizarUsuario(datos);
    await recargarUsuarios();
  };
  const onCambiarPassword = async (id, nueva) => {
    await cambiarPassword(id, nueva);
    await recargarUsuarios();
  };
  const onBorrarUsuario = async (id) => {
    if (id === usuario?.id) {
      alert("No podés borrar tu propio usuario.");
      return;
    }
    await borrarUsuario(id);
    await recargarUsuarios();
  };

  /* ---------- Login screen ---------- */
  if (!usuario) {
    return (
      <Login
        onLogin={hacerLogin}
        bootError={bootError}
        seedInfo={seedInfo}
        hayUsuarios={usuarios.length > 0}
      />
    );
  }

  return (
    <div
      style={{ background: C.bg, color: C.text, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
      className="min-h-screen w-full"
    >
      <style>{`
        *::-webkit-scrollbar{width:10px;height:10px}
        *::-webkit-scrollbar-thumb{background:${C.border};border-radius:6px}
        input,select,textarea{outline:none}
        input:focus,select:focus,textarea:focus{border-color:${C.gold}!important;box-shadow:0 0 0 1px ${C.gold}}
        .led{box-shadow:0 0 0 1px ${C.border},0 0 24px -8px ${C.gold}40}
        button:focus-visible{outline:2px solid ${C.gold};outline-offset:2px}
        button:not(:disabled),select,input[type="checkbox"],input[type="radio"],label[for]{cursor:pointer}
        button:not(:disabled):hover{filter:brightness(1.09)}
        @media (prefers-reduced-motion: no-preference){.fade{animation:f .25s ease both}}
        @keyframes f{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
        @keyframes slideR{from{opacity:0;transform:translateX(52px) scale(0.96)}to{opacity:1;transform:none}}
        @keyframes slideL{from{opacity:0;transform:translateX(-52px) scale(0.96)}to{opacity:1;transform:none}}
        .slide-r{animation:slideR 0.35s cubic-bezier(0.34,1.56,0.64,1) both}
        .slide-l{animation:slideL 0.35s cubic-bezier(0.34,1.56,0.64,1) both}
      `}</style>

      {/* HEADER */}
      <header
        className="sticky top-0 z-20 px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap"
        style={{ background: `${C.bg}f2`, borderBottom: `1px solid ${C.border}`, backdropFilter: "blur(8px)" }}
      >
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="Cacodelphia" style={{ height: 34 }} className="object-contain" />
          <div className="leading-tight">
            <div className="font-semibold tracking-tight text-sm sm:text-base">Sistema eventos Cacodelphia</div>
            <div style={{ color: C.dim }} className="text-[11px] font-mono">Estudios</div>
          </div>
        </div>

        <nav className="flex items-center gap-1 ml-auto">
          <Tab active={vista === "home"} onClick={() => setVista("home")} icon={<BarChart2 size={15} />}>Resumen</Tab>
          <Tab active={vista === "lista"} onClick={() => setVista("lista")} icon={<Layers size={15} />}>Eventos</Tab>
          <Tab active={vista === "personal"} onClick={() => setVista("personal")} icon={<Users size={15} />}>Personal</Tab>
          <Tab active={vista === "dashboard"} onClick={() => setVista("dashboard")} icon={<AlertTriangle size={15} />}>
            Pendientes
            {(pendFact.length + pendComp.length) > 0 && (
              <span className="ml-1.5 text-[10px] font-mono px-1.5 rounded-full"
                style={{ background: C.amber, color: "#1a1200" }}>
                {pendFact.length + pendComp.length}
              </span>
            )}
          </Tab>
          {p.usuarios && (
            <Tab active={vista === "usuarios"} onClick={() => setVista("usuarios")} icon={<UserCog size={15} />}>
              Usuarios
            </Tab>
          )}
          <div className="ml-2 flex items-center gap-2 pl-2" style={{ borderLeft: `1px solid ${C.border}` }}>
            <div className="hidden sm:flex flex-col leading-tight items-end">
              <span className="text-xs font-medium">{usuario.nombre}</span>
              <span className="text-[10px] font-mono uppercase tracking-wide" style={{ color: C.gold }}>{usuario.rol}</span>
            </div>
            <IconBtn onClick={hacerLogout} title="Cerrar sesión">
              <LogOut size={15} />
            </IconBtn>
          </div>
        </nav>
      </header>

      {!isSupabaseConfigured && (
        <div className="px-4 sm:px-6 py-2 text-xs flex items-center gap-2 flex-wrap"
          style={{ background: `${C.amber}1a`, borderBottom: `1px solid ${C.border}`, color: C.amber }}>
          <WifiOff size={13} />
          Modo local: los datos se guardan solo en este navegador. Configurá Supabase (ver README) para compartir los eventos con todo el equipo.
        </div>
      )}
      {error && (
        <div className="px-4 sm:px-6 py-2 text-xs flex items-center gap-2 flex-wrap"
          style={{ background: `${C.rose}1a`, borderBottom: `1px solid ${C.border}`, color: C.rose }}>
          <AlertTriangle size={13} /> {error}
          <button onClick={recargar} className="ml-2 underline flex items-center gap-1"><RefreshCw size={12} /> Reintentar</button>
        </div>
      )}

      <main className="px-4 sm:px-6 py-5 max-w-6xl mx-auto">
        {cargando ? (
          <div style={{ color: C.dim }} className="font-mono text-sm py-20 text-center">cargando…</div>
        ) : vista === "form" ? (
          <FormEvento
            base={eventoEdit || duplicandoBase || nuevoEvento()}
            onCancel={() => { setVista("lista"); setEditId(null); setDuplicandoBase(null); }}
            onSave={guardarEvento}
            guardando={guardando}
            personas={personas}
            eventos={eventos}
            onLiberarPersona={liberarPersonaDeEvento}
            onReemplazarEnEvento={reemplazarEnEvento}
            onIrAPersonal={() => setVista("personal")}
            perms={p}
          />
        ) : vista === "detalle" && eventoVer ? (
          <Detalle
            ev={eventoVer}
            onBack={() => setVista("lista")}
            onEdit={() => { setEditId(eventoVer.id); setVista("form"); }}
            onDelete={() => borrarEvento(eventoVer.id)}
            onUpdate={(patch) => actualizarEvento(eventoVer.id, patch)}
            onDuplicate={() => duplicarEvento(eventoVer)}
            perms={p}
            usuario={usuario}
            personas={personas}
            eventos={eventos}
          />
        ) : vista === "dashboard" ? (
          <Dashboard
            pendFact={pendFact}
            pendComp={pendComp}
            onVer={(id) => { setVerId(id); setVista("detalle"); }}
          />
        ) : vista === "usuarios" && p.usuarios ? (
          <Usuarios
            usuarios={usuarios}
            actual={usuario}
            onCrear={onCrearUsuario}
            onActualizar={onActualizarUsuario}
            onCambiarPassword={onCambiarPassword}
            onBorrar={onBorrarUsuario}
          />
        ) : vista === "personal" ? (
          <Personal
            personas={personas}
            categorias={categoriasPersonal}
            onSave={guardarPersona}
            onDelete={borrarPersona}
            onSaveCategoria={guardarCategoriaPersonal}
            onDeleteCategoria={borrarCategoriaPersonal}
            perms={p}
            eventos={eventos}
          />
        ) : vista === "home" ? (
          <Home eventos={eventos} personas={personas} onVer={(id) => { setVerId(id); setVista("detalle"); }} />
        ) : (
          <Lista
            eventos={filtrados}
            total={eventos.length}
            busqueda={busqueda} setBusqueda={setBusqueda}
            filtroCat={filtroCat} setFiltroCat={setFiltroCat}
            filtroEmp={filtroEmp} setFiltroEmp={setFiltroEmp}
            filtroTiempo={filtroTiempo} setFiltroTiempo={setFiltroTiempo}
            conteosTiempo={conteosTiempo}
            onVer={(id) => { setVerId(id); setVista("detalle"); }}
            onEdit={(id) => { setEditId(id); setVista("form"); }}
            onDelete={borrarEvento}
            onNuevo={() => { setEditId(null); setVista("form"); }}
            onExportar={exportarJSON}
            perms={p}
            usuario={usuario}
          />
        )}
      </main>
    </div>
  );
}

/* ---------- Tab ---------- */
function Tab({ active, onClick, icon, children }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md transition-colors"
      style={{
        background: active ? C.panel2 : "transparent",
        color: active ? C.text : C.dim,
        border: `1px solid ${active ? C.border : "transparent"}`,
      }}
    >
      {icon}<span className="hidden sm:inline">{children}</span>
    </button>
  );
}

/* ---------- Badge ---------- */
function Badge({ color, children, solid }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{
        color: solid ? C.onGold : color,
        background: solid ? color : `${color}1a`,
        border: `1px solid ${color}40`,
      }}
    >
      {children}
    </span>
  );
}

/* ====================== LISTA ====================== */
function Lista({ eventos, total, busqueda, setBusqueda, filtroCat, setFiltroCat, filtroEmp, setFiltroEmp, filtroTiempo, setFiltroTiempo, conteosTiempo, onVer, onEdit, onDelete, onNuevo, onExportar, perms = {}, usuario = {} }) {
  const hoyISO = new Date().toISOString().slice(0, 10);
  const tabs = [
    { value: "proximos", label: "Próximos", count: conteosTiempo.proximos },
    { value: "finalizados", label: "Finalizados", count: conteosTiempo.finalizados },
    { value: "todos", label: "Todos", count: conteosTiempo.todos },
  ];
  return (
    <div className="fade">
      {/* pestañas por fecha + acciones */}
      <div className="flex flex-wrap gap-1.5 mb-3 items-center">
        {tabs.map((t) => {
          const active = filtroTiempo === t.value;
          return (
            <button
              key={t.value}
              onClick={() => setFiltroTiempo(t.value)}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md transition-colors"
              style={{
                background: active ? C.panel2 : "transparent",
                color: active ? C.text : C.dim,
                border: `1px solid ${active ? C.gold : C.border}`,
              }}
            >
              <Calendar size={13} />
              {t.label}
              <span className="font-mono text-[10px] px-1.5 rounded-full"
                style={{ background: active ? C.gold : C.panel2, color: active ? C.onGold : C.dim }}>
                {t.count}
              </span>
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-1.5">
          {perms.importarExportar && (
            <button
              onClick={onExportar}
              title="Exportar respaldo (JSON)"
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md"
              style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.dim }}
            >
              <Download size={15} /> <span className="hidden sm:inline">Descargar eventos</span>
            </button>
          )}
          {perms.eventoCrear && (
            <button
              onClick={onNuevo}
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md transition-colors"
              style={{ background: C.gold, color: C.onGold }}
            >
              <Plus size={16} /> <span className="hidden sm:inline">Nuevo evento</span>
            </button>
          )}
        </div>
      </div>

      {/* filtros */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={15} color={C.dim} className="absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar evento, director, razón social, integrante…"
            className="w-full text-sm pl-9 pr-3 py-2 rounded-md"
            style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}
          />
        </div>
        <Select value={filtroCat} onChange={setFiltroCat} placeholder="Categoría" options={CATEGORIAS} compact />
        <SelectKV value={filtroEmp} onChange={setFiltroEmp} placeholder="Empresa" options={DISTRIBUCION_FILTRO} compact />
      </div>

      {eventos.length === 0 ? (
        <div className="rounded-xl text-center py-16 px-4" style={{ background: C.panel, border: `1px dashed ${C.border}` }}>
          <Film size={28} color={C.dim} className="mx-auto mb-3" />
          <p className="text-sm" style={{ color: C.dim }}>
            {total === 0 ? "Todavía no cargaste eventos." : "Ningún evento coincide con el filtro."}
          </p>
          {total === 0 && perms.eventoCrear && (
            <button onClick={onNuevo} className="mt-4 text-sm font-medium px-4 py-2 rounded-md inline-flex items-center gap-1.5"
              style={{ background: C.gold, color: C.onGold }}>
              <Plus size={15} /> Cargar el primero
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-2.5">
          {eventos.map((e) => {
            const finalizado = e.fecha && e.fecha < hoyISO;
            return (
            <div key={e.id} onClick={() => onVer(e.id)}
              className="group rounded-xl p-3.5 cursor-pointer transition-colors flex flex-col sm:flex-row sm:items-center gap-3"
              style={{
                background: C.panel,
                border: `1px solid ${C.border}`,
                opacity: finalizado ? 0.78 : 1,
              }}
              onMouseEnter={(ev) => ev.currentTarget.style.borderColor = C.gold + "80"}
              onMouseLeave={(ev) => ev.currentTarget.style.borderColor = C.border}
            >
              <div className="font-mono text-xs w-20 shrink-0 flex items-center gap-1.5" style={{ color: finalizado ? C.dim : C.gold }}>
                <Calendar size={13} /> {fmtFecha(e.fecha)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{e.nombre || <span style={{ color: C.dim }}>Sin nombre</span>}</div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {e.categoria && <Badge color={C.gold}><Film size={11} />{e.categoria}</Badge>}
                  {e.tipoProd && <Badge color="#9b8cff">{e.tipoProd}</Badge>}
                  {e.trackeo && <Badge color={e.trackeo === "Con trackeo" ? C.green : C.dim}><Crosshair size={11} />{e.trackeo.replace(" trackeo", "")}</Badge>}
                  <Badge color={C.dim}><Building2 size={11} />{empresaLabel(e.distribucion)}</Badge>
                  {totalDias(e.partes) > 0 && <Badge color={C.amber}><Clock size={11} />{totalDias(e.partes)}d</Badge>}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {/* Badge de mensajes no leídos */}
                {(() => {
                  const noLeidos = mensajesNoLeidos(e.mensajes, e.id, usuario?.id);
                  return noLeidos > 0 ? (
                    <button
                      onClick={(ev) => { ev.stopPropagation(); onVer(e.id); }}
                      title={`${noLeidos} observación${noLeidos > 1 ? "es" : ""} sin leer`}
                      className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full shrink-0"
                      style={{ background: C.amber, color: "#1a1200" }}
                    >
                      <MessageSquare size={11} /> {noLeidos}
                    </button>
                  ) : null;
                })()}
                <div className="text-right">
                  <div className="font-mono text-sm">{fmtMoneda(totalFacturable(e), e.moneda)}</div>
                  <div className="flex gap-1 justify-end mt-1 flex-wrap">
                    {finalizado && <Badge color={C.dim}>Finalizado</Badge>}
                    {e.facturado ? <Badge solid color={C.green}>Facturado</Badge> : <Badge color={C.amber}>S/ facturar</Badge>}
                    {e.facturado && !e.comprobantePago && <Badge color={C.rose}>S/ comprob.</Badge>}
                  </div>
                </div>
                <div className="flex gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                  {perms.eventoEditar && (
                    <IconBtn onClick={(ev) => { ev.stopPropagation(); onEdit(e.id); }} title="Editar"><Pencil size={15} /></IconBtn>
                  )}
                  {perms.eventoBorrar && (
                    <IconBtn onClick={(ev) => { ev.stopPropagation(); if (confirm("¿Borrar evento?")) onDelete(e.id); }} title="Borrar" danger><Trash2 size={15} /></IconBtn>
                  )}
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ====================== DASHBOARD ====================== */
function Dashboard({ pendFact, pendComp, onVer }) {
  return (
    <div className="fade grid gap-5">
      <TablaPend
        titulo="Pendientes de facturación"
        icon={<AlertTriangle size={16} color={C.amber} />}
        color={C.amber}
        rows={pendFact}
        onVer={onVer}
        vacio="Nada pendiente de facturar. 🎬"
      />
      <TablaPend
        titulo="Pendientes de comprobante de pago"
        icon={<Clock size={16} color={C.rose} />}
        color={C.rose}
        rows={pendComp}
        onVer={onVer}
        vacio="Todos los comprobantes cargados."
      />
    </div>
  );
}

function TablaPend({ titulo, icon, color, rows, onVer, vacio }) {
  return (
    <section className="rounded-xl overflow-hidden" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
        {icon}<h2 className="font-semibold text-sm">{titulo}</h2>
        <span className="ml-auto font-mono text-xs px-2 py-0.5 rounded-full" style={{ background: `${color}1a`, color }}>{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm px-4 py-8 text-center" style={{ color: C.dim }}>{vacio}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: C.dim }} className="text-[11px] uppercase tracking-wide">
                {["Fecha", "Evento", "Estudio", "Distrib.", "Monto M1", "Monto M2", "Total"].map((h) => (
                  <th key={h} className="text-left font-medium px-4 py-2 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} onClick={() => onVer(e.id)} className="cursor-pointer transition-colors"
                  style={{ borderTop: `1px solid ${C.border}` }}
                  onMouseEnter={(ev) => ev.currentTarget.style.background = C.panel2}
                  onMouseLeave={(ev) => ev.currentTarget.style.background = "transparent"}>
                  <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap" style={{ color: C.dim }}>{fmtFecha(e.fecha)}</td>
                  <td className="px-4 py-2.5 font-medium">{e.nombre}</td>
                  <td className="px-4 py-2.5">{e.estudio || "—"}</td>
                  <td className="px-4 py-2.5 text-xs">{empresaLabel(e.distribucion)}</td>
                  <td className="px-4 py-2.5 font-mono whitespace-nowrap text-xs">
                    {montoM1(e) ? fmtMoneda(montoM1(e) * 1.21, e.moneda) : "—"}
                  </td>
                  <td className="px-4 py-2.5 font-mono whitespace-nowrap text-xs">
                    {montoM2(e) ? fmtMoneda(montoM2(e), e.moneda) : "—"}
                  </td>
                  <td className="px-4 py-2.5 font-mono whitespace-nowrap" style={{ color: C.gold }}>
                    {fmtMoneda(totalFacturable(e), e.moneda)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ====================== CALENDARIO MES ====================== */
function CalendarioMes({ anio, mes, eventos, onVer }) {
  const hoy = new Date().toISOString().slice(0, 10);
  const prefix = `${anio}-${String(mes + 1).padStart(2, "0")}`;
  const firstDow = new Date(anio, mes, 1).getDay();
  const daysInMonth = new Date(anio, mes + 1, 0).getDate();
  const startOffset = (firstDow + 6) % 7;
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const getEventosDelDia = (day) => {
    if (!day) return [];
    const dateStr = `${prefix}-${String(day).padStart(2, "0")}`;
    return eventos
      .filter((ev) => getFechasEvento(ev).has(dateStr))
      .map((ev) => ({
        ...ev,
        partesDelDia: (ev.partes || []).filter((p) => (p.fechas || []).includes(dateStr)).map((p) => p.tipo),
      }));
  };

  const DIAS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

  return (
    <div className="rounded-xl p-4 mb-6" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-2 mb-4">
        <Calendar size={15} color={C.amber} />
        <h2 className="text-sm font-semibold">Calendario — {MESES_ES[mes]} {anio}</h2>
        <div className="ml-auto flex flex-wrap gap-2">
          {PARTES_PROD.map((p) => (
            <span key={p} className="flex items-center gap-1 text-[10px]" style={{ color: C.dim }}>
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: PARTES_COLORS[p] }} />
              {p}
            </span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-0.5">
        {DIAS.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-wide py-1.5" style={{ color: C.dim }}>
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, idx) => {
          if (!day) return <div key={`e-${idx}`} className="rounded-lg" style={{ minHeight: 56 }} />;
          const dateStr = `${prefix}-${String(day).padStart(2, "0")}`;
          const isHoy = dateStr === hoy;
          const evsDia = getEventosDelDia(day);
          const tieneCosas = evsDia.length > 0;
          return (
            <div key={day} className="rounded-lg p-1 flex flex-col" style={{
              minHeight: 56,
              background: isHoy ? `${C.gold}18` : tieneCosas ? `${C.panel2}` : "transparent",
              border: `1px solid ${isHoy ? C.gold + "60" : tieneCosas ? C.border : "transparent"}`,
            }}>
              <span className="text-[10px] font-mono text-right leading-none mb-0.5"
                style={{ color: isHoy ? C.gold : tieneCosas ? C.text : C.dim }}>
                {day}
              </span>
              <div className="flex flex-col gap-0.5 mt-0.5">
                {evsDia.slice(0, 3).map((ev) => (
                  <button key={ev.id}
                    onClick={() => onVer(ev.id)}
                    title={`${ev.nombre || "Sin nombre"}${ev.partesDelDia.length ? ` — ${ev.partesDelDia.join(", ")}` : ""}`}
                    className="text-left rounded px-1 py-0.5 text-[8px] leading-tight truncate transition-opacity hover:opacity-75"
                    style={{ background: getColorPartes(ev.partesDelDia), color: "#fff" }}>
                    {ev.nombre || "Sin nombre"}
                  </button>
                ))}
                {evsDia.length > 3 && (
                  <span className="text-[8px] text-center" style={{ color: C.dim }}>+{evsDia.length - 3} más</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ====================== BARCHART 12 MESES ====================== */
function BarChart12Meses({ eventos, mesActual, anioActual }) {
  const meses = useMemo(() => {
    const arr = [];
    for (let i = 11; i >= 0; i--) {
      let m = mesActual - i, a = anioActual;
      while (m < 0) { m += 12; a--; }
      const pref = `${a}-${String(m + 1).padStart(2, "0")}`;
      const evs = eventos.filter((e) => e.fecha?.startsWith(pref));
      const total = evs.reduce((s, e) => s + totalFacturable(e), 0);
      arr.push({ mes: m, anio: a, total, label: MESES_ES[m].slice(0, 3) });
    }
    return arr;
  }, [eventos, mesActual, anioActual]);

  const maxVal = Math.max(...meses.map((m) => m.total), 1);

  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: C.dim }}>Últimos 12 meses</p>
      <div className="flex items-end gap-1" style={{ height: 72 }}>
        {meses.map((m, i) => {
          const pct = m.total / maxVal;
          const isActual = m.mes === mesActual && m.anio === anioActual;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
              <div className="w-full flex items-end" style={{ height: 56 }}>
                <div className="w-full rounded-t transition-all duration-700"
                  title={`${m.label} ${m.anio}: ${fmtMoneda(m.total, "ARS")}`}
                  style={{
                    height: `${Math.max(pct * 100, m.total > 0 ? 5 : 0)}%`,
                    background: isActual ? C.gold : `${C.gold}35`,
                    minHeight: m.total > 0 ? 2 : 0,
                  }} />
              </div>
              <span className="text-[8px] font-mono w-full text-center truncate"
                style={{ color: isActual ? C.gold : C.dim }}>
                {m.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ====================== PDF MODAL ====================== */
function generarHtmlPdf(ev, sel) {
  const fmtD = (f) => { if (!f) return "—"; const [y,m,d] = f.split("-"); return `${d}/${m}/${y}`; };
  const fmtM = (n, mon) => new Intl.NumberFormat("es-AR", { style: "currency", currency: mon === "USD" ? "USD" : "ARS", maximumFractionDigits: 0 }).format(Number(n) || 0);

  const secciones = [];

  if (sel.produccion) {
    let rows = "";
    const campos = [
      ["Fecha", fmtD(ev.fecha)],
      ["Categoría", ev.categoria || "—"],
      ["Estudio", ev.estudio ? `Estudio ${ev.estudio}` : "—"],
      ["Tipo producción", ev.tipoProd || "—"],
      ["Trackeo", ev.trackeo || "—"],
      ["Equipamiento", ev.equipamiento ? `Sí — ${ev.equipamientoDetalle || ""}` : "No"],
    ];
    campos.forEach(([l, v]) => { rows += `<tr><td class="lbl">${l}</td><td>${v}</td></tr>`; });
    secciones.push(`<div class="sec"><div class="sec-hdr">Producción</div><div class="sec-body"><table>${rows}</table></div></div>`);
  }

  if (sel.facturacion) {
    const dist = ev.distribucion === "MIXTO" ? "M1 + M2" : ev.distribucion === "M2" ? "MG M2" : "MG M1";
    let rows = "";
    const m1 = Number(ev.montoM1) || 0;
    const m2 = Number(ev.montoM2) || 0;
    const campos = [
      ["Empresa", dist],
      ["Razón social", ev.razonSocial || "—"],
      ["Moneda", ev.moneda || "ARS"],
      ...(m1 ? [["Monto M1 (c/IVA)", fmtM(m1 * 1.21, ev.moneda)]] : []),
      ...(m2 ? [["Monto M2 (efectivo)", fmtM(m2, ev.moneda)]] : []),
      ["Total facturable", fmtM((m1 * 1.21) + m2, ev.moneda)],
      ["Medio de pago", ev.medioPago || "—"],
      ["Forma de pago", ev.formaPago || "—"],
      ["Cant. facturas", ev.cantFacturas || "—"],
      ["Facturado", ev.facturado ? "Sí" : "No"],
      ["Comprobante de pago", ev.comprobantePago ? "Adjunto" : "Pendiente"],
    ];
    campos.forEach(([l, v]) => { rows += `<tr><td class="lbl">${l}</td><td>${v}</td></tr>`; });
    secciones.push(`<div class="sec"><div class="sec-hdr">Facturación</div><div class="sec-body"><table>${rows}</table></div></div>`);
  }

  if (sel.equipo && ev.integrantes?.length) {
    let rows = `<tr><th>Nombre</th><th>Rol</th><th>Fases</th></tr>`;
    ev.integrantes.forEach((i) => {
      const fases = i.partes?.length ? i.partes.join(", ") : "Todas";
      rows += `<tr><td>${i.nombre || "—"}</td><td>${i.rol || "—"}</td><td style="font-size:11px;color:#666">${fases}</td></tr>`;
    });
    secciones.push(`<div class="sec"><div class="sec-hdr">Equipo</div><div class="sec-body"><table class="data">${rows}</table></div></div>`);
  }

  if (sel.partes && ev.partes?.length) {
    const COLS = { "Armado": "#4FD18B", "Armado + Prelight": "#e6a800", "Prelighting": "#9b8cff", "Rodaje": "#e8335a", "Desarme": "#64B5F6" };
    let inner = "";
    ev.partes.filter(p => p.fechas?.length).forEach((p) => {
      const fechasStr = (p.fechas || []).map(fmtD).join(" · ");
      const color = COLS[p.tipo] || "#888";
      inner += `<div class="fase-row"><span class="fase-dot" style="background:${color}"></span><strong>${p.tipo}</strong><span class="fase-fechas">${fechasStr}</span></div>`;
    });
    if (!inner) inner = `<p style="color:#888;font-size:12px">Sin fechas cargadas.</p>`;
    secciones.push(`<div class="sec"><div class="sec-hdr">Partes del proyecto</div><div class="sec-body">${inner}</div></div>`);
  }

  if (sel.direccion && ev.director) {
    const d = ev.director;
    let rows = "";
    [["Nombre", d.nombre || "—"], ["Teléfono", d.telefono || "—"], ["Email", d.email || "—"]].forEach(([l,v]) => {
      rows += `<tr><td class="lbl">${l}</td><td>${v}</td></tr>`;
    });
    secciones.push(`<div class="sec"><div class="sec-hdr">Dirección</div><div class="sec-body"><table>${rows}</table></div></div>`);
  }

  if (sel.externo && ev.equipoExterno?.length) {
    let rows = `<tr><th>Nombre</th><th>Rol</th></tr>`;
    ev.equipoExterno.forEach((x) => { rows += `<tr><td>${x.nombre || "—"}</td><td>${x.rol || "—"}</td></tr>`; });
    secciones.push(`<div class="sec"><div class="sec-hdr">Equipo técnico externo</div><div class="sec-body"><table class="data">${rows}</table></div></div>`);
  }

  if (sel.observaciones && ev.observaciones) {
    secciones.push(`<div class="sec"><div class="sec-hdr">Observaciones</div><div class="sec-body"><p style="white-space:pre-wrap;line-height:1.6">${ev.observaciones}</p></div></div>`);
  }

  const fecha = new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${ev.nombre || "Evento"}</title><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Arial,Helvetica,sans-serif;background:#fff;color:#1a1a1a;padding:24px 28px;max-width:800px;margin:0 auto;font-size:13px}
    h1{font-size:22px;font-weight:700;margin-bottom:2px;color:#1a1400}
    .meta{color:#888;font-size:11px;margin-bottom:20px;border-bottom:2px solid #D4AF37;padding-bottom:10px}
    .meta strong{color:#D4AF37}
    .sec{margin-bottom:14px;border:1px solid #e0d9cc;border-radius:6px;overflow:hidden;page-break-inside:avoid}
    .sec-hdr{background:#f8f5ef;padding:7px 12px;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b5f3e;border-bottom:1px solid #e0d9cc}
    .sec-body{padding:12px}
    table{width:100%;border-collapse:collapse}
    th{text-align:left;font-size:11px;color:#888;padding:4px 8px;border-bottom:1px solid #eee}
    td{padding:5px 8px;font-size:12px;vertical-align:top}
    table.data tr:nth-child(even) td{background:#faf8f4}
    .lbl{color:#999;width:140px;font-size:11px}
    .fase-row{display:flex;align-items:baseline;gap:8px;margin-bottom:7px;flex-wrap:wrap}
    .fase-dot{display:inline-block;width:9px;height:9px;border-radius:50%;flex-shrink:0;margin-top:3px}
    .fase-fechas{color:#666;font-size:11px}
    @media print{body{padding:0}@page{margin:1.5cm}}
  </style></head><body>
    <h1>${ev.nombre || "Sin nombre"}</h1>
    <div class="meta">Fecha: <strong>${new Date(ev.fecha + "T12:00:00").toLocaleDateString("es-AR", {day:"2-digit",month:"long",year:"numeric"}) || "—"}</strong> &nbsp;·&nbsp; ${ev.categoria || ""} ${ev.estudio ? "· Estudio " + ev.estudio : ""} &nbsp;·&nbsp; Generado el ${fecha}</div>
    ${secciones.join("")}
  </body></html>`;
}

function PdfModal({ ev, onClose }) {
  const SECCIONES = [
    { id: "produccion", label: "Producción" },
    { id: "facturacion", label: "Facturación" },
    { id: "equipo", label: "Equipo" },
    { id: "partes", label: "Partes del proyecto" },
    { id: "direccion", label: "Dirección" },
    { id: "externo", label: "Equipo técnico externo" },
    { id: "observaciones", label: "Observaciones" },
  ];
  const [sel, setSel] = useState(() => SECCIONES.reduce((a, s) => ({ ...a, [s.id]: true }), {}));
  const toggle = (id) => setSel((p) => ({ ...p, [id]: !p[id] }));

  const generar = async () => {
    const html = generarHtmlPdf(ev, sel);
    const nombreLimpio = (ev.nombre || "evento").replace(/[^a-zA-Z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
    const defaultName = `${nombreLimpio}${ev.fecha ? "-" + ev.fecha : ""}.html`;

    if (typeof window.showSaveFilePicker === "function") {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: defaultName,
          types: [{ description: "Documento HTML", accept: { "text/html": [".html"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(html);
        await writable.close();
        onClose();
        return;
      } catch (e) {
        if (e.name === "AbortError") return;
      }
    }

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = defaultName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-6 overflow-y-auto"
      style={{ background: "rgba(0,0,0,0.85)" }}
      onClick={onClose}>
      <div className="rounded-xl p-5 w-full max-w-sm"
        style={{ background: C.panel, border: `1px solid ${C.border}` }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-3">
          <Printer size={16} color={C.gold} />
          <h2 className="font-semibold text-sm flex-1">Exportar PDF — {ev.nombre || "Sin nombre"}</h2>
          <button onClick={onClose} style={{ color: C.dim }}><X size={16} /></button>
        </div>
        <p className="text-xs mb-3" style={{ color: C.dim }}>Elegí qué secciones incluir:</p>
        <div className="grid gap-1.5 mb-4">
          {SECCIONES.map((s) => (
            <label key={s.id}
              className="flex items-center gap-2.5 cursor-pointer px-3 py-2 rounded-lg"
              style={{ background: C.panel2, border: `1px solid ${sel[s.id] ? C.gold + "50" : C.border}` }}>
              <input type="checkbox" checked={sel[s.id]} onChange={() => toggle(s.id)}
                className="w-3.5 h-3.5 rounded" style={{ accentColor: C.gold }} />
              <span className="text-sm">{s.label}</span>
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 text-sm px-3 py-2 rounded-md"
            style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.dim }}>
            Cancelar
          </button>
          <button onClick={generar}
            className="flex-1 text-sm font-semibold px-3 py-2 rounded-md flex items-center justify-center gap-1.5"
            style={{ background: C.gold, color: C.onGold }}>
            <Printer size={13} /> Imprimir / PDF
          </button>
        </div>
      </div>
    </div>
  );
}

/* ====================== HOME / RESUMEN ====================== */
function AnimNum({ value }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    prevRef.current = value;
    if (from === to) return;
    let start = null;
    const duration = 550;
    const step = (ts) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [value]);
  return <>{display}</>;
}

function StatCard({ label, value, color, icon, fullRow }) {
  return (
    <div
      className={`rounded-xl p-4 flex flex-col gap-2${fullRow ? " col-span-2 sm:col-span-1" : ""}`}
      style={{ background: C.panel, border: `1px solid ${C.border}` }}
    >
      <div className="flex items-center gap-1.5" style={{ color }}>
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-4xl font-bold font-mono leading-none" style={{ color }}>
        <AnimNum value={value} />
      </div>
    </div>
  );
}

/* ---- DonutSVG ---- */
function DonutSVG({ segments, size = 130 }) {
  const thickness = Math.max(Math.round(size * 0.16), 10);
  const r = (size - thickness) / 2;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={`${C.border}60`} strokeWidth={thickness} />
      </svg>
    );
  }

  const nonZero = segments.filter((d) => d.value > 0).length;
  const GAP = nonZero > 1 ? 4 : 0;
  const usable = circ - nonZero * GAP;
  const arcs = [];
  let cum = 0;
  for (const seg of segments) {
    if (seg.value <= 0) continue;
    const len = (seg.value / total) * usable;
    arcs.push({ color: seg.color, len, offset: circ - cum });
    cum += len + GAP;
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`rotate(-90, ${cx}, ${cy})`}>
        {arcs.map((arc, i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={arc.color} strokeWidth={thickness}
            strokeDasharray={`${arc.len} ${circ - arc.len}`}
            strokeDashoffset={arc.offset}
          />
        ))}
      </g>
    </svg>
  );
}

/* ---- SideMonthMini ---- */
function SideMonthMini({ mes, anio, evs, onClick, disabled, position }) {
  const total = evs.length;
  const segs = ESTUDIOS.map((s) => ({ value: evs.filter((e) => e.estudio === s).length, color: EST_COLORS[s] }));
  const sinEst = evs.filter((e) => !e.estudio).length;
  if (sinEst > 0) segs.push({ value: sinEst, color: C.dim });

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1.5 rounded-xl py-3 px-2 transition-all shrink-0"
      style={{
        background: C.panel2,
        border: `1px solid ${C.border}`,
        opacity: disabled ? 0.15 : 0.38,
        cursor: disabled ? "default" : "pointer",
        width: 84,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.opacity = "0.7"; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = disabled ? "0.15" : "0.38"; }}
    >
      {position === "prev" && <ChevronLeft size={13} color={C.dim} />}
      <span className="text-[11px] font-semibold" style={{ color: C.text }}>
        {MESES_ES[mes].slice(0, 3)} <span style={{ color: C.dim }}>{String(anio).slice(2)}</span>
      </span>
      <div className="relative">
        <DonutSVG segments={segs} size={52} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono font-bold text-xs" style={{ color: C.dim }}>{total}</span>
        </div>
      </div>
      {position === "next" && <ChevronRight size={13} color={C.dim} />}
    </button>
  );
}

/* ---- CenterMonthChart ---- */
function CenterMonthChart({ evs }) {
  const total = evs.length;
  const estData = ESTUDIOS.map((s) => ({
    label: `Est. ${s}`,
    value: evs.filter((e) => e.estudio === s).length,
    color: EST_COLORS[s],
  }));
  const sinEst = evs.filter((e) => !e.estudio).length;
  if (sinEst > 0) estData.push({ label: "S/est.", value: sinEst, color: C.dim });
  const catMap = evs.reduce((acc, e) => { if (e.categoria) acc[e.categoria] = (acc[e.categoria] || 0) + 1; return acc; }, {});
  const cats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      {/* Donut */}
      <div className="relative shrink-0">
        <DonutSVG segments={estData} size={138} />
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-3xl font-bold font-mono leading-none" style={{ color: total > 0 ? C.gold : C.dim }}>
            {total}
          </span>
          <span className="text-[10px] mt-0.5" style={{ color: C.dim }}>proyectos</span>
        </div>
      </div>

      {/* Breakdown */}
      <div className="flex-1 w-full grid gap-2.5">
        {estData.filter((d) => d.value > 0).map((d) => (
          <div key={d.label} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="text-xs w-14 shrink-0" style={{ color: C.dim }}>{d.label}</span>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: `${C.border}60` }}>
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${total > 0 ? (d.value / total) * 100 : 0}%`, background: d.color }} />
            </div>
            <span className="font-mono font-bold text-sm w-4 text-right" style={{ color: d.color }}>{d.value}</span>
          </div>
        ))}
        {total === 0 && (
          <p className="text-sm text-center py-3" style={{ color: C.dim }}>Sin proyectos en este mes</p>
        )}
        {cats.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {cats.map(([cat, cnt]) => (
              <span key={cat} className="text-[11px] px-2 py-0.5 rounded-full"
                style={{ background: `${C.gold}15`, color: C.gold, border: `1px solid ${C.gold}30` }}>
                {cat} ×{cnt}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Home({ eventos, onVer }) {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth());
  const [scope, setScope] = useState("mes");
  const [animDir, setAnimDir] = useState(null);

  // Max month that has any event (to cap the "next" button)
  const maxEvento = useMemo(() => {
    const fechas = eventos.map((e) => e.fecha).filter(Boolean);
    if (!fechas.length) return { mes: hoy.getMonth(), anio: hoy.getFullYear() };
    const max = fechas.sort().at(-1);
    const [ay, am] = max.split("-").map(Number);
    return { mes: am - 1, anio: ay };
  }, [eventos]);

  const esTope = anio > maxEvento.anio || (anio === maxEvento.anio && mes >= maxEvento.mes);

  const navMes = (dir) => {
    if (dir > 0 && esTope) return;
    let m = mes + dir, a = anio;
    if (m < 0) { m = 11; a--; }
    if (m > 11) { m = 0; a++; }
    setMes(m); setAnio(a);
  };

  const go = (dir) => {
    if (dir > 0 && esTope) return;
    setAnimDir(dir > 0 ? "right" : "left");
    navMes(dir);
  };

  const getEvs = (m, a) => {
    const prefix = `${a}-${String(m + 1).padStart(2, "0")}`;
    return eventos.filter((e) => e.fecha?.startsWith(prefix));
  };

  const getMAdj = (offset) => {
    let m = mes + offset, a = anio;
    if (m < 0) { m += 12; a--; }
    if (m > 11) { m -= 12; a++; }
    return { mes: m, anio: a, evs: getEvs(m, a) };
  };

  const prevM = getMAdj(-1);
  const nextM = getMAdj(1);

  const prefixMes = `${anio}-${String(mes + 1).padStart(2, "0")}`;

  const eventosMes = useMemo(
    () => eventos.filter((e) => e.fecha?.startsWith(prefixMes)),
    [eventos, prefixMes]
  );

  const estStats = ESTUDIOS.map((s) => ({
    estudio: s,
    count: eventosMes.filter((e) => e.estudio === s).length,
    color: EST_COLORS[s],
  }));

  const categoriaStats = useMemo(() => {
    const map = {};
    eventosMes.forEach((e) => { if (e.categoria) map[e.categoria] = (map[e.categoria] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [eventosMes]);

  const finStats = useMemo(() => {
    const totalMes = eventosMes.reduce((s, e) => s + totalFacturable(e), 0);
    const facturadoMes = eventosMes.filter((e) => e.facturado).reduce((s, e) => s + totalFacturable(e), 0);
    const pendienteMes = eventosMes.filter((e) => !e.facturado).reduce((s, e) => s + totalFacturable(e), 0);
    const m1Mes = eventosMes.reduce((s, e) => s + montoM1(e) * 1.21, 0);
    const m2Mes = eventosMes.reduce((s, e) => s + montoM2(e), 0);
    const tieneUSD = eventosMes.some((e) => e.moneda === "USD");
    return { totalMes, facturadoMes, pendienteMes, m1Mes, m2Mes, tieneUSD };
  }, [eventosMes]);

  const teamStats = useMemo(() => {
    const evs = scope === "mes" ? eventosMes : eventos;
    const map = new Map();
    evs.forEach((ev) => {
      (ev.integrantes || []).forEach((i) => {
        if (!i.nombre) return;
        const key = i.personaId || i.nombre;
        if (!map.has(key)) map.set(key, { nombre: i.nombre, count: 0, roles: {} });
        const s = map.get(key);
        s.count++;
        if (i.rol) s.roles[i.rol] = (s.roles[i.rol] || 0) + 1;
      });
    });
    return [...map.values()]
      .sort((a, b) => b.count - a.count)
      .map((s) => {
        const sorted = Object.entries(s.roles).sort((a, b) => b[1] - a[1]);
        return { ...s, rolPrincipal: sorted[0]?.[0] || "—", secundarios: sorted.slice(1).map((r) => r[0]) };
      });
  }, [scope, eventosMes, eventos]);

  const maxTeam = teamStats[0]?.count || 1;

  const rankColors = ["#D4AF37", "#A8A8A8", "#cd7f32"];

  return (
    <div className="fade">
      {/* Header + month nav */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Resumen</h1>
          <p className="text-xs mt-0.5" style={{ color: C.dim }}>Vista general de proyectos e integrantes</p>
        </div>
        <div
          className="ml-auto flex items-center gap-1 rounded-xl px-3 py-1.5"
          style={{ background: C.panel, border: `1px solid ${C.border}` }}
        >
          <button
            onClick={() => go(-1)}
            className="p-1 rounded transition-colors"
            style={{ color: C.dim }}
            onMouseEnter={(e) => e.currentTarget.style.color = C.text}
            onMouseLeave={(e) => e.currentTarget.style.color = C.dim}
          >
            <ChevronLeft size={16} />
          </button>
          <span className="font-semibold text-sm w-40 text-center select-none">
            {MESES_ES[mes]} {anio}
          </span>
          <button
            onClick={() => go(1)}
            className="p-1 rounded transition-colors"
            style={{ color: esTope ? C.border : C.dim, cursor: esTope ? "default" : "pointer" }}
            onMouseEnter={(e) => { if (!esTope) e.currentTarget.style.color = C.text; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = esTope ? C.border : C.dim; }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Calendario */}
      <CalendarioMes anio={anio} mes={mes} eventos={eventos} onVer={onVer} />

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Proyectos en el mes"
          value={eventosMes.length}
          color={C.gold}
          icon={<Film size={15} />}
          fullRow
        />
        {estStats.map((s) => (
          <StatCard
            key={s.estudio}
            label={`Estudio ${s.estudio}`}
            value={s.count}
            color={s.color}
            icon={<Building2 size={15} />}
          />
        ))}
      </div>

      {/* Estadísticas financieras */}
      {eventosMes.length > 0 && (
        <div className="rounded-xl p-4 mb-6" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-2 mb-4">
            <DollarSign size={15} color={C.green} />
            <h2 className="text-sm font-semibold">Facturación — {MESES_ES[mes]} {anio}</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {[
              { label: "Total del mes", val: finStats.totalMes, color: C.gold },
              { label: "Facturado", val: finStats.facturadoMes, color: C.green },
              { label: "Sin facturar", val: finStats.pendienteMes, color: C.amber },
              { label: "MG M1 c/IVA", val: finStats.m1Mes, color: C.dim },
            ].map(({ label, val, color }) => (
              <div key={label} className="rounded-xl p-3 flex flex-col gap-1"
                style={{ background: C.panel2, border: `1px solid ${C.border}` }}>
                <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color }}>{label}</span>
                <span className="font-mono font-bold text-sm" style={{ color }}>
                  {fmtMoneda(val, "ARS")}
                </span>
              </div>
            ))}
          </div>
          <BarChart12Meses eventos={eventos} mesActual={mes} anioActual={anio} />
        </div>
      )}

      {/* Carousel chart */}
      <div className="rounded-xl p-4 mb-6" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-2 mb-4">
          <BarChart2 size={15} color={C.gold} />
          <h2 className="text-sm font-semibold">Proyectos por mes</h2>
        </div>
        <div className="flex items-center gap-2">
          {/* Mes anterior */}
          <SideMonthMini
            mes={prevM.mes} anio={prevM.anio} evs={prevM.evs}
            onClick={() => go(-1)} position="prev"
          />
          {/* Centro animado */}
          <div
            key={`${mes}-${anio}`}
            className={`flex-1 rounded-xl p-4 ${animDir === "right" ? "slide-r" : animDir === "left" ? "slide-l" : ""}`}
            style={{ background: C.panel2, border: `1px solid ${C.border}` }}
          >
            <CenterMonthChart evs={eventosMes} />
          </div>
          {/* Mes siguiente */}
          <SideMonthMini
            mes={nextM.mes} anio={nextM.anio} evs={nextM.evs}
            onClick={() => go(1)} position="next"
            disabled={esTope}
          />
        </div>
      </div>

      {/* Categorías del mes */}
      {categoriaStats.length > 0 && (
        <div className="rounded-xl p-4 mb-6" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-2 mb-3">
            <Film size={15} color={C.amber} />
            <h2 className="text-sm font-semibold">Categorías</h2>
            <span className="text-xs" style={{ color: C.dim }}>— {MESES_ES[mes]} {anio}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {categoriaStats.map(([cat, count]) => {
              const pct = eventosMes.length > 0 ? (count / eventosMes.length) * 100 : 0;
              return (
                <div
                  key={cat}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg"
                  style={{ background: C.panel2, border: `1px solid ${C.border}` }}
                >
                  <span className="text-sm">{cat}</span>
                  <span className="font-mono font-bold text-sm" style={{ color: C.amber }}>{count}</span>
                  <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: C.border }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        background: C.amber,
                        transition: "width 0.5s ease",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Integrantes */}
      <div className="rounded-xl p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Users size={15} color={C.gold} />
          <h2 className="text-sm font-semibold">Integrantes</h2>
          {/* Toggle scope */}
          <div
            className="ml-auto flex items-center gap-0.5 p-0.5 rounded-lg"
            style={{ background: C.panel2, border: `1px solid ${C.border}` }}
          >
            {[
              { value: "mes", label: MESES_ES[mes] },
              { value: "todo", label: "Todo el tiempo" },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setScope(opt.value)}
                className="text-xs font-medium px-3 py-1.5 rounded-md transition-all"
                style={{
                  background: scope === opt.value ? C.panel : "transparent",
                  color: scope === opt.value ? C.text : C.dim,
                  border: scope === opt.value ? `1px solid ${C.border}` : "1px solid transparent",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {teamStats.length === 0 ? (
          <div className="text-center py-12" style={{ color: C.dim }}>
            <Users size={28} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">
              {scope === "mes"
                ? `Sin proyectos con integrantes en ${MESES_ES[mes]} ${anio}.`
                : "Sin datos de integrantes."}
            </p>
          </div>
        ) : (
          <div className="grid gap-2">
            {teamStats.map((persona, idx) => (
              <div
                key={persona.nombre}
                className="flex items-center gap-3 rounded-xl p-3 transition-colors"
                style={{
                  background: C.panel2,
                  border: `1px solid ${idx === 0 ? `${C.gold}40` : C.border}`,
                  boxShadow: idx === 0 ? `0 0 16px ${C.gold}10` : "none",
                }}
              >
                {/* Rank */}
                <span
                  className="font-mono text-lg w-7 text-center shrink-0 select-none"
                  style={{ color: rankColors[idx] || C.border }}
                >
                  {idx < 3 ? ["❶","❷","❸"][idx] : idx + 1}
                </span>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-sm">{persona.nombre}</span>
                    {persona.rolPrincipal !== "—" && (
                      <span
                        className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                        style={{
                          background: `${C.gold}18`,
                          color: C.gold,
                          border: `1px solid ${C.gold}35`,
                        }}
                      >
                        {persona.rolPrincipal}
                      </span>
                    )}
                    {persona.secundarios.slice(0, 3).map((r) => (
                      <span
                        key={r}
                        className="text-[11px] px-2 py-0.5 rounded-full"
                        style={{ background: C.panel, color: C.dim, border: `1px solid ${C.border}` }}
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                  {/* Progress bar */}
                  <div
                    className="mt-2 rounded-full overflow-hidden"
                    style={{ height: 3, background: `${C.border}80` }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(persona.count / maxTeam) * 100}%`,
                        background: idx === 0 ? C.gold : idx === 1 ? "#A8A8A8" : idx === 2 ? "#cd7f32" : `${C.gold}45`,
                        transition: "width 0.7s cubic-bezier(0.34,1.56,0.64,1)",
                      }}
                    />
                  </div>
                </div>

                {/* Count */}
                <div className="text-right shrink-0">
                  <div
                    className="text-2xl font-bold font-mono leading-none"
                    style={{ color: idx === 0 ? C.gold : C.text }}
                  >
                    <AnimNum value={persona.count} />
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: C.dim }}>
                    {persona.count === 1 ? "proyecto" : "proyectos"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ====================== PERSONAL ====================== */
function Personal({ personas, categorias, onSave, onDelete, onSaveCategoria, onDeleteCategoria, perms = {}, eventos = [] }) {
  const vacio = { nombre: "", rolHabitual: "", telefono: "", email: "", categoriaId: "", activo: true };
  const [editando, setEditando] = useState(null); // null | "new" | persona id
  const [f, setF] = useState(vacio);
  const [filtroCatId, setFiltroCatId] = useState(""); // "" todas, "__sin" sin categoría, o id
  const [catAbierto, setCatAbierto] = useState(false);
  const [tabPersonal, setTabPersonal] = useState("lista"); // "lista" | "disponibilidad"

  const empezarNuevo = () => { setF(vacio); setEditando("new"); };
  const empezarEditar = (p) => { setF({ ...vacio, ...p }); setEditando(p.id); };
  const cancelar = () => { setEditando(null); setF(vacio); };
  const guardar = async () => {
    if (!f.nombre.trim()) { alert("Poné el nombre de la persona."); return; }
    await onSave(f);
    cancelar();
  };

  const nombreCategoria = (id) => categorias.find((c) => c.id === id)?.nombre || "";

  const filtradas = useMemo(() => {
    if (!filtroCatId) return personas;
    if (filtroCatId === "__sin") return personas.filter((p) => !p.categoriaId);
    return personas.filter((p) => p.categoriaId === filtroCatId);
  }, [personas, filtroCatId]);

  // Personas agrupadas por categoría (para vista sin filtro)
  const grupos = useMemo(() => {
    const map = new Map();
    categorias.forEach((c) => map.set(c.id, { categoria: c, items: [] }));
    map.set("__sin", { categoria: { id: "__sin", nombre: "Sin categoría" }, items: [] });
    filtradas.forEach((p) => {
      const key = p.categoriaId && map.has(p.categoriaId) ? p.categoriaId : "__sin";
      map.get(key).items.push(p);
    });
    return [...map.values()].filter((g) => g.items.length > 0);
  }, [filtradas, categorias]);

  return (
    <div className="fade max-w-3xl mx-auto">
      {/* Header fijo: título + tabs siempre en el mismo lugar */}
      <div className="flex items-center gap-3 mb-3">
        <h1 className="text-lg font-semibold flex-1">Personal</h1>
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg" style={{ background: C.panel2, border: `1px solid ${C.border}` }}>
          {[{ v: "lista", l: "Listado" }, { v: "disponibilidad", l: "Disponibilidad" }].map(({ v, l }) => (
            <button key={v} onClick={() => { setTabPersonal(v); setEditando(null); }}
              className="text-xs font-medium px-3 py-1.5 rounded-md transition-all"
              style={{ background: tabPersonal === v ? C.panel : "transparent", color: tabPersonal === v ? C.text : C.dim, border: tabPersonal === v ? `1px solid ${C.border}` : "1px solid transparent" }}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {/* Botones de acción — solo en lista, en fila separada para no mover los tabs */}
      {tabPersonal === "lista" && editando === null && (perms.categoriaAgregar || perms.personalAgregar) && (
        <div className="flex gap-2 justify-end mb-4">
          {perms.categoriaAgregar && (
            <button onClick={() => setCatAbierto(true)} className="text-sm font-medium px-3 py-1.5 rounded-md flex items-center gap-1.5"
              style={{ background: C.gold, color: C.onGold }}>
              <Plus size={15} /> Agregar categoría
            </button>
          )}
          {perms.personalAgregar && (
            <button onClick={empezarNuevo} className="text-sm font-medium px-3 py-1.5 rounded-md flex items-center gap-1.5"
              style={{ background: C.gold, color: C.onGold }}>
              <Plus size={15} /> Agregar persona
            </button>
          )}
        </div>
      )}
      {tabPersonal === "lista" && editando === null && !(perms.categoriaAgregar || perms.personalAgregar) && (
        <div className="mb-4" />
      )}

      {tabPersonal === "disponibilidad" && (
        <DisponibilidadPersonal personas={personas} eventos={eventos} />
      )}

      {tabPersonal === "lista" && (<>
      <CategoriasPersonal
        categorias={categorias}
        personas={personas}
        onSave={onSaveCategoria}
        onDelete={onDeleteCategoria}
        abierto={catAbierto}
        setAbierto={setCatAbierto}
        perms={perms}
      />

      {editando !== null && (
        <div className="rounded-xl p-4 mb-4 grid sm:grid-cols-2 gap-3.5" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
          <Field label="Nombre" full>
            <Input value={f.nombre} onChange={(v) => setF({ ...f, nombre: v })} placeholder="Nombre y apellido" />
          </Field>
          <Field label="Categoría">
            <select value={f.categoriaId || ""} onChange={(e) => setF({ ...f, categoriaId: e.target.value })}
              className="w-full text-sm px-3 py-2 rounded-md"
              style={{ background: C.panel2, border: `1px solid ${C.border}`, color: f.categoriaId ? C.text : C.dim, colorScheme: "dark" }}>
              <option value="" style={{ background: C.panel2, color: C.dim }}>Sin categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id} style={{ background: C.panel2, color: C.text }}>{c.nombre}</option>
              ))}
            </select>
          </Field>
          <Field label="Rol habitual">
            <Input value={f.rolHabitual} onChange={(v) => setF({ ...f, rolHabitual: v })} placeholder="DF, gaffer, op. LED…" />
          </Field>
          <Field label="Teléfono">
            <Input value={f.telefono} onChange={(v) => setF({ ...f, telefono: v })} placeholder="+54 9 11 ..." />
          </Field>
          <Field label="Email" full>
            <Input type="email" value={f.email} onChange={(v) => setF({ ...f, email: v })} placeholder="nombre@ejemplo.com" />
          </Field>
          <div className="sm:col-span-2 flex gap-2 justify-end">
            <button onClick={cancelar} className="text-sm px-4 py-2 rounded-md" style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.dim }}>Cancelar</button>
            <button onClick={guardar} className="text-sm font-medium px-5 py-2 rounded-md flex items-center gap-1.5" style={{ background: C.gold, color: C.onGold }}>
              <Check size={16} /> Guardar
            </button>
          </div>
        </div>
      )}

      {personas.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs" style={{ color: C.dim }}>Filtrar:</span>
          <button
            onClick={() => setFiltroCatId("")}
            className="text-xs px-2.5 py-1 rounded-full"
            style={{
              background: !filtroCatId ? C.gold : C.panel2,
              color: !filtroCatId ? C.onGold : C.dim,
              border: `1px solid ${!filtroCatId ? C.gold : C.border}`,
            }}
          >
            Todas
          </button>
          {categorias.map((c) => (
            <button
              key={c.id}
              onClick={() => setFiltroCatId(c.id)}
              className="text-xs px-2.5 py-1 rounded-full"
              style={{
                background: filtroCatId === c.id ? C.gold : C.panel2,
                color: filtroCatId === c.id ? C.onGold : C.dim,
                border: `1px solid ${filtroCatId === c.id ? C.gold : C.border}`,
              }}
            >
              {c.nombre}
            </button>
          ))}
          <button
            onClick={() => setFiltroCatId("__sin")}
            className="text-xs px-2.5 py-1 rounded-full"
            style={{
              background: filtroCatId === "__sin" ? C.gold : C.panel2,
              color: filtroCatId === "__sin" ? C.onGold : C.dim,
              border: `1px solid ${filtroCatId === "__sin" ? C.gold : C.border}`,
            }}
          >
            Sin categoría
          </button>
        </div>
      )}

      {personas.length === 0 ? (
        <div className="rounded-xl text-center py-16 px-4" style={{ background: C.panel, border: `1px dashed ${C.border}` }}>
          <Users size={28} color={C.dim} className="mx-auto mb-3" />
          <p className="text-sm" style={{ color: C.dim }}>Todavía no cargaste personal.</p>
        </div>
      ) : grupos.length === 0 ? (
        <div className="rounded-xl text-center py-10 px-4" style={{ background: C.panel, border: `1px dashed ${C.border}` }}>
          <p className="text-sm" style={{ color: C.dim }}>Ninguna persona en esta categoría.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {grupos.map((g) => (
            <div key={g.categoria.id}>
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.gold }}>
                  {g.categoria.nombre}
                </h2>
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: C.panel2, color: C.dim }}>
                  {g.items.length}
                </span>
              </div>
              <div className="grid gap-2">
                {g.items.map((p) => (
                  <div key={p.id} className="rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center gap-2" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{p.nombre}</div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5 text-xs" style={{ color: C.dim }}>
                        {p.categoriaId && nombreCategoria(p.categoriaId) && (
                          <Badge color={C.gold}>{nombreCategoria(p.categoriaId)}</Badge>
                        )}
                        {p.rolHabitual && <span className="font-mono px-2 py-0.5 rounded" style={{ background: C.panel2 }}>{p.rolHabitual}</span>}
                        {p.telefono && <span>{p.telefono}</span>}
                        {p.email && <span>{p.email}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {perms.personalEditar && (
                        <IconBtn onClick={() => empezarEditar(p)} title="Editar"><Pencil size={15} /></IconBtn>
                      )}
                      {perms.personalBorrar && (
                        <IconBtn onClick={() => { if (confirm("¿Borrar de la lista de personal?")) onDelete(p.id); }} title="Borrar" danger><Trash2 size={15} /></IconBtn>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      </>)}
    </div>
  );
}

/* ====================== DISPONIBILIDAD DEL PERSONAL ====================== */
function DisponibilidadPersonal({ personas, eventos }) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [fecha, setFecha] = useState(hoy);
  const [filtro, setFiltro] = useState("todos"); // "todos" | "libres" | "ocupados"

  const estadoPorPersona = useMemo(() => {
    if (!fecha) return [];
    return personas.map((p) => {
      const eventosOcupado = eventos.filter((ev) => {
        const enEvento = (ev.integrantes || []).find((i) => i.personaId === p.id);
        if (!enEvento) return false;
        const fechasTrabajo = getFechasTrabajo(ev.partes, enEvento.partes || []);
        if (fechasTrabajo.size > 0) return fechasTrabajo.has(fecha);
        return ev.fecha === fecha;
      });
      return { persona: p, eventosOcupado };
    });
  }, [personas, eventos, fecha]);

  const filtrados = useMemo(() => {
    if (filtro === "libres") return estadoPorPersona.filter((e) => e.eventosOcupado.length === 0);
    if (filtro === "ocupados") return estadoPorPersona.filter((e) => e.eventosOcupado.length > 0);
    return estadoPorPersona;
  }, [estadoPorPersona, filtro]);

  const libres = estadoPorPersona.filter((e) => e.eventosOcupado.length === 0).length;
  const ocupados = estadoPorPersona.filter((e) => e.eventosOcupado.length > 0).length;

  return (
    <div>
      <div className="rounded-xl p-4 mb-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: C.dim }}>Consultar disponibilidad para el día:</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
              className="text-sm px-3 py-2 rounded-md"
              style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.text, colorScheme: "dark" }} />
          </div>
          {fecha && (
            <div className="flex gap-3 mt-4">
              <div className="text-center">
                <div className="text-2xl font-bold font-mono" style={{ color: C.green }}>{libres}</div>
                <div className="text-[11px]" style={{ color: C.dim }}>libres</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold font-mono" style={{ color: C.rose }}>{ocupados}</div>
                <div className="text-[11px]" style={{ color: C.dim }}>ocupados</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold font-mono" style={{ color: C.gold }}>{personas.length}</div>
                <div className="text-[11px]" style={{ color: C.dim }}>total</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {fecha && personas.length > 0 && (
        <>
          <div className="flex gap-1.5 mb-3 flex-wrap">
            {[
              { v: "todos", l: "Todos" },
              { v: "libres", l: `Libres (${libres})` },
              { v: "ocupados", l: `Ocupados (${ocupados})` },
            ].map(({ v, l }) => (
              <button key={v} onClick={() => setFiltro(v)}
                className="text-xs px-3 py-1.5 rounded-full"
                style={{
                  background: filtro === v ? (v === "libres" ? C.green : v === "ocupados" ? C.rose : C.gold) : C.panel2,
                  color: filtro === v ? (v === "todos" ? C.onGold : "#fff") : C.dim,
                  border: `1px solid ${filtro === v ? "transparent" : C.border}`,
                }}>
                {l}
              </button>
            ))}
          </div>

          <div className="grid gap-2">
            {filtrados.map(({ persona, eventosOcupado }) => {
              const libre = eventosOcupado.length === 0;
              return (
                <div key={persona.id} className="rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2"
                  style={{ background: C.panel, border: `1px solid ${libre ? C.green + "30" : C.rose + "30"}` }}>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: libre ? C.green : C.rose }} />
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{persona.nombre}</div>
                      {persona.rolHabitual && (
                        <div className="text-[11px]" style={{ color: C.dim }}>{persona.rolHabitual}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-sm">
                    {libre ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: `${C.green}20`, color: C.green }}>
                        Disponible
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {eventosOcupado.map((ev) => {
                          const integrante = (ev.integrantes || []).find((i) => i.personaId === persona.id);
                          const partes = integrante?.partes?.length ? integrante.partes.join(", ") : "Todas";
                          return (
                            <span key={ev.id}
                              className="text-xs px-2 py-0.5 rounded-full"
                              style={{ background: `${C.rose}20`, color: C.rose, border: `1px solid ${C.rose}30` }}
                              title={`Fases: ${partes}`}>
                              {ev.nombre || "Sin nombre"} — {partes}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {filtrados.length === 0 && (
            <div className="rounded-xl py-10 text-center" style={{ background: C.panel, border: `1px dashed ${C.border}` }}>
              <Users size={24} color={C.dim} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm" style={{ color: C.dim }}>Sin resultados para este filtro.</p>
            </div>
          )}
        </>
      )}

      {!fecha && (
        <div className="rounded-xl py-12 text-center" style={{ background: C.panel, border: `1px dashed ${C.border}` }}>
          <Calendar size={28} color={C.dim} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm" style={{ color: C.dim }}>Elegí una fecha para ver quién está disponible.</p>
        </div>
      )}
    </div>
  );
}

/* Bloque para gestionar las categorías del personal (crear / renombrar / borrar). */
function CategoriasPersonal({ categorias, personas, onSave, onDelete, abierto, setAbierto, perms = {} }) {
  const [nuevo, setNuevo] = useState("");
  const [editId, setEditId] = useState(null);
  const [editNombre, setEditNombre] = useState("");

  const cuenta = (id) => personas.filter((p) => p.categoriaId === id).length;

  const agregar = async () => {
    const n = nuevo.trim();
    if (!n) return;
    if (categorias.some((c) => c.nombre.toLowerCase() === n.toLowerCase())) {
      alert("Ya existe una categoría con ese nombre.");
      return;
    }
    await onSave({ nombre: n });
    setNuevo("");
  };

  const guardarEdicion = async () => {
    const n = editNombre.trim();
    if (!n) return;
    await onSave({ id: editId, nombre: n });
    setEditId(null);
    setEditNombre("");
  };

  const borrar = async (c) => {
    const usados = cuenta(c.id);
    const msg = usados > 0
      ? `Hay ${usados} persona(s) asignadas a "${c.nombre}". Si la borrás, quedan sin categoría. ¿Continuar?`
      : `¿Borrar la categoría "${c.nombre}"?`;
    if (confirm(msg)) await onDelete(c.id);
  };

  return (
    <div className="rounded-xl mb-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        className="w-full flex items-center gap-2 px-4 py-3"
      >
        <Layers size={15} color={C.gold} />
        <span className="text-sm font-semibold">Categorías del personal</span>
        <span className="font-mono text-[11px] px-2 py-0.5 rounded-full" style={{ background: C.panel2, color: C.dim }}>
          {categorias.length}
        </span>
        <span className="ml-auto text-xs" style={{ color: C.dim }}>
          {abierto ? "Ocultar" : "Gestionar"}
        </span>
      </button>

      {abierto && (
        <div className="px-4 pb-4">
          {perms.categoriaAgregar && (
            <div className="flex gap-2 mb-3">
              <Input
                value={nuevo}
                onChange={setNuevo}
                placeholder="Nueva categoría (ej: Cámara, Iluminación, Producción…)"
              />
              <button
                onClick={agregar}
                className="text-sm font-medium px-3 py-2 rounded-md flex items-center gap-1.5 shrink-0"
                style={{ background: C.gold, color: C.onGold }}
              >
                <Plus size={14} /> Agregar
              </button>
            </div>
          )}

          {categorias.length === 0 ? (
            <p className="text-xs py-2" style={{ color: C.dim }}>
              Todavía no hay categorías. Creá la primera arriba.
            </p>
          ) : (
            <div className="grid gap-1.5">
              {categorias.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 px-3 py-2 rounded"
                  style={{ background: C.panel2, border: `1px solid ${C.border}` }}
                >
                  {editId === c.id ? (
                    <>
                      <Input value={editNombre} onChange={setEditNombre} placeholder="Nombre" />
                      <IconBtn onClick={guardarEdicion} title="Guardar"><Check size={14} /></IconBtn>
                      <IconBtn onClick={() => { setEditId(null); setEditNombre(""); }} title="Cancelar"><X size={14} /></IconBtn>
                    </>
                  ) : (
                    <>
                      <span className="text-sm flex-1">{c.nombre}</span>
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: C.panel, color: C.dim }}>
                        {cuenta(c.id)}
                      </span>
                      {perms.categoriaEditar && (
                        <IconBtn onClick={() => { setEditId(c.id); setEditNombre(c.nombre); }} title="Renombrar"><Pencil size={13} /></IconBtn>
                      )}
                      {perms.categoriaBorrar && (
                        <IconBtn onClick={() => borrar(c)} title="Borrar" danger><Trash2 size={13} /></IconBtn>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ====================== DETALLE ====================== */
function Detalle({ ev, onBack, onEdit, onDelete, onUpdate, onDuplicate, perms = {}, usuario = {}, personas = [], eventos = [] }) {
  const [pdfModal, setPdfModal] = useState(false);
  useEffect(() => {
    if (usuario?.id && ev?.id) marcarLeido(ev.id, usuario.id);
  }, [ev?.id, ev?.mensajes?.length, usuario?.id]);

  return (
    <div className="fade">
      {pdfModal && <PdfModal ev={ev} onClose={() => setPdfModal(false)} />}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <IconBtn onClick={onBack} title="Volver"><ChevronLeft size={18} /></IconBtn>
        <h1 className="text-lg font-semibold flex-1 truncate">{ev.nombre || "Sin nombre"}</h1>
        <button onClick={() => setPdfModal(true)}
          className="text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-md"
          style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.dim }}>
          <Printer size={14} /> PDF
        </button>
        {perms.eventoEditar && (
          <button onClick={onDuplicate} title="Duplicar evento"
            className="text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-md"
            style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.dim }}>
            <Copy size={14} /> Duplicar
          </button>
        )}
        {perms.eventoEditar && (
          <button onClick={onEdit} className="text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-md" style={{ background: C.panel2, border: `1px solid ${C.border}` }}><Pencil size={14} /> Editar</button>
        )}
        {perms.eventoBorrar && (
          <IconBtn onClick={() => { if (confirm("¿Borrar evento?")) onDelete(); }} title="Borrar" danger><Trash2 size={16} /></IconBtn>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {ev.categoria && <Badge color={C.gold}><Film size={11} />{ev.categoria}</Badge>}
        {ev.tipoProd && <Badge color="#9b8cff">{ev.tipoProd}</Badge>}
        {ev.trackeo && <Badge color={ev.trackeo === "Con trackeo" ? C.green : C.dim}><Crosshair size={11} />{ev.trackeo}</Badge>}
        {ev.equipamiento ? <Badge color={C.green}><Wrench size={11} />Con equipamiento</Badge> : <Badge color={C.dim}><Wrench size={11} />Sin equipamiento</Badge>}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <MensajesEquipo ev={ev} usuario={usuario} onUpdate={onUpdate} />

        <ProduccionCard ev={ev} onUpdate={onUpdate} perms={perms} />

        <FacturacionCard ev={ev} onUpdate={onUpdate} perms={perms} />

        <Card titulo="Estado administrativo" icon={<DollarSign size={15} color={C.gold} />}>
          <p className="text-xs mb-1" style={{ color: C.dim }}>
            {perms.eventoFacturar
              ? "Editable solo por administración una vez creado el evento."
              : "Solo administración / contabilidad puede modificar este estado."}
          </p>
          <Toggle checked={ev.facturado} onChange={(v) => onUpdate({ facturado: v })} label="Facturado" disabled={!perms.eventoFacturar} />
          <Toggle checked={ev.comprobantePago} onChange={(v) => onUpdate({ comprobantePago: v })} label="Comprobante de pago adjunto" disabled={!perms.eventoFacturar} />
          <Toggle checked={ev.facturadoTotal} onChange={(v) => onUpdate({ facturadoTotal: v })} label="Facturado total" disabled={!perms.eventoFacturar} />
          <p className="text-[11px] mt-2" style={{ color: C.dim }}>
            Los marcadores se actualizan automáticamente al subir archivos en la sección de abajo.
          </p>
        </Card>

        {perms.archivos ? (
          <Archivos ev={ev} onUpdate={onUpdate} />
        ) : (
          <div className="sm:col-span-2 rounded-xl p-4 flex items-center gap-2 text-xs"
               style={{ background: C.panel, border: `1px dashed ${C.border}`, color: C.dim }}>
            <Lock size={14} color={C.dim} />
            Los archivos (facturas y comprobantes) los administra el área de contabilidad.
          </div>
        )}

        <EquipoCard ev={ev} onUpdate={onUpdate} perms={perms} personas={personas} eventos={eventos} />

        <DireccionCard ev={ev} onUpdate={onUpdate} perms={perms} />

        <EquipoExternoCard ev={ev} onUpdate={onUpdate} perms={perms} />

        <PartesDetalle ev={ev} onUpdate={onUpdate} perms={perms} />

        {ev.observaciones && (
          <Card titulo="Observaciones" icon={<FileText size={15} color={C.dim} />} full>
            <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: C.text }}>{ev.observaciones}</p>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ====================== PARTES DEL PROYECTO (edición inline desde detalle) ====================== */
function PartesDetalle({ ev, onUpdate, perms }) {
  const [editandoIdx, setEditandoIdx] = useState(null);
  const [fechaInput, setFechaInput] = useState("");
  const [partesTmp, setPartesTmp] = useState(null);

  const partes = useMemo(() => {
    const existentes = Array.isArray(ev.partes) ? ev.partes : [];
    return PARTES_PROD.map((tipo) => {
      const ex = existentes.find((p) => p.tipo === tipo);
      return ex || { tipo, fechas: [] };
    });
  }, [ev.partes]);

  const display = partesTmp || partes;
  const total = totalDias(display);
  const canEdit = perms?.eventoEditar;

  const startEdit = (idx) => {
    setEditandoIdx(idx);
    setPartesTmp(partes.map((p) => ({ ...p, fechas: [...(p.fechas || [])] })));
    setFechaInput("");
  };
  const cancelEdit = () => { setEditandoIdx(null); setPartesTmp(null); setFechaInput(""); };

  const addFecha = () => {
    if (!fechaInput || editandoIdx === null) return;
    setPartesTmp((prev) => prev.map((p, i) => {
      if (i !== editandoIdx) return p;
      if ((p.fechas || []).includes(fechaInput)) return p;
      return { ...p, fechas: [...(p.fechas || []), fechaInput].sort() };
    }));
    setFechaInput("");
  };
  const delFecha = (fecha) => {
    setPartesTmp((prev) => prev.map((p, i) => {
      if (i !== editandoIdx) return p;
      return { ...p, fechas: (p.fechas || []).filter((d) => d !== fecha) };
    }));
  };
  const guardar = () => {
    const allFechas = partesTmp.flatMap((p) => p.fechas || []).filter(Boolean).sort();
    onUpdate({ partes: partesTmp, fecha: allFechas.length > 0 ? allFechas[0] : "" });
    setEditandoIdx(null); setPartesTmp(null); setFechaInput("");
  };

  if (total === 0 && !canEdit) return null;

  return (
    <Card titulo="Partes del proyecto" icon={<Clock size={15} color={C.amber} />} full>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        {display.map((parte, idx) => {
          const isEditing = editandoIdx === idx;
          const fechas = parte.fechas || [];
          return (
            <div key={parte.tipo} className="rounded-lg p-2.5 flex flex-col gap-1.5"
              style={{ background: isEditing ? `${C.amber}0d` : C.panel2, border: `1px solid ${isEditing ? C.amber + "55" : C.border}`, transition: "border-color 0.15s" }}>
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold leading-tight" style={{ color: C.amber }}>{parte.tipo}</div>
                {canEdit && editandoIdx === null && (
                  <button type="button" onClick={() => startEdit(idx)} title="Editar fechas"
                    className="p-1 rounded flex items-center gap-0.5 hover:opacity-80"
                    style={{ background: `${C.amber}22`, border: `1px solid ${C.amber}50`, color: C.amber }}>
                    <Pencil size={11} />
                  </button>
                )}
              </div>
              {/* Chips */}
              <div className="flex flex-wrap gap-1 flex-1">
                {fechas.length === 0 && !isEditing && (
                  <span className="text-[10px]" style={{ color: C.dim }}>Sin fechas</span>
                )}
                {fechas.map((fecha) =>
                  isEditing ? (
                    <button key={fecha} type="button" onClick={() => delFecha(fecha)}
                      className="inline-flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded"
                      style={{ background: `${C.rose}22`, border: `1px solid ${C.rose}55`, color: C.rose }} title="Quitar">
                      {fmtFecha(fecha)} <X size={8} />
                    </button>
                  ) : (
                    <span key={fecha} className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                      style={{ background: `${C.amber}18`, color: C.text }}>
                      {fmtFecha(fecha)}
                    </span>
                  )
                )}
              </div>
              {/* Input agregar (solo editando) */}
              {isEditing && (
                <div className="flex gap-1">
                  <input type="date" value={fechaInput} onChange={(e) => setFechaInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addFecha()}
                    className="flex-1 min-w-0 text-[11px] rounded px-1.5 py-1 outline-none"
                    style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }} />
                  <button type="button" onClick={addFecha}
                    className="px-2 py-1 rounded" style={{ background: C.amber, color: C.onGold }} title="Agregar">
                    <Plus size={12} />
                  </button>
                </div>
              )}
              {/* Footer */}
              {isEditing ? (
                <div className="flex gap-1">
                  <button type="button" onClick={guardar}
                    className="flex-1 text-[11px] font-semibold px-2 py-1 rounded flex items-center justify-center gap-1"
                    style={{ background: C.green, color: "#000" }}>
                    <Check size={11} /> Guardar
                  </button>
                  <button type="button" onClick={cancelEdit}
                    className="px-2 py-1 rounded" style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.dim }}>
                    <X size={11} />
                  </button>
                </div>
              ) : (
                fechas.length > 0 && (
                  <div className="text-[11px] font-mono" style={{ color: C.dim }}>
                    {fechas.length} {fechas.length === 1 ? "día" : "días"}
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
      {total > 0 && (
        <div className="flex items-center gap-2 pt-2 mt-1" style={{ borderTop: `1px solid ${C.border}` }}>
          <Clock size={13} color={C.amber} />
          <span className="text-sm font-semibold" style={{ color: C.amber }}>
            Total: {total} {total === 1 ? "día" : "días"} de producción
          </span>
        </div>
      )}
    </Card>
  );
}

/* ====================== CARDS EDITABLES DEL DETALLE ====================== */

function EditCardBtn({ onClick }) {
  return (
    <button type="button" onClick={onClick} title="Editar"
      className="p-1 rounded flex items-center gap-1 text-[11px] hover:opacity-80"
      style={{ background: `${C.amber}22`, border: `1px solid ${C.amber}50`, color: C.amber }}>
      <Pencil size={11} /> Editar
    </button>
  );
}

function EditCardFooter({ onSave, onCancel }) {
  return (
    <div className="flex gap-2 pt-1" style={{ borderTop: `1px solid ${C.border}` }}>
      <button type="button" onClick={onSave}
        className="flex-1 text-sm font-semibold px-3 py-1.5 rounded flex items-center justify-center gap-1.5"
        style={{ background: C.green, color: "#000" }}>
        <Check size={13} /> Guardar
      </button>
      <button type="button" onClick={onCancel}
        className="px-3 py-1.5 rounded text-sm"
        style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.dim }}>
        Cancelar
      </button>
    </div>
  );
}

function ProduccionCard({ ev, onUpdate, perms }) {
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState({});
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const startEdit = () => {
    setF({
      fecha: ev.fecha || "", categoria: ev.categoria || "",
      estudio: ev.estudio || "", tipoProd: ev.tipoProd || "",
      trackeo: ev.trackeo || "", equipamiento: !!ev.equipamiento,
      equipamientoDetalle: ev.equipamientoDetalle || "",
    });
    setEditando(true);
  };

  return (
    <Card titulo="Producción" icon={<Camera size={15} color={C.gold} />}
      action={perms?.eventoEditar && !editando ? <EditCardBtn onClick={startEdit} /> : null}>
      {editando ? (
        <div className="grid gap-2">
          <div><label className="text-[11px] block mb-1" style={{ color: C.dim }}>Fecha</label>
            <Input type="date" value={f.fecha} onChange={(v) => set("fecha", v)} /></div>
          <div><label className="text-[11px] block mb-1" style={{ color: C.dim }}>Categoría</label>
            <Select value={f.categoria} onChange={(v) => set("categoria", v)} options={CATEGORIAS} placeholder="Elegir" /></div>
          <div><label className="text-[11px] block mb-1" style={{ color: C.dim }}>Estudio</label>
            <Select value={f.estudio} onChange={(v) => set("estudio", v)} options={ESTUDIOS} placeholder="Elegir" /></div>
          <div><label className="text-[11px] block mb-1" style={{ color: C.dim }}>Tipo de producción</label>
            <Select value={f.tipoProd} onChange={(v) => set("tipoProd", v)} options={TIPO_PROD} placeholder="Elegir" /></div>
          <div><label className="text-[11px] block mb-1" style={{ color: C.dim }}>Trackeo</label>
            <Select value={f.trackeo} onChange={(v) => set("trackeo", v)} options={TRACKEO} placeholder="Elegir" /></div>
          <Toggle checked={f.equipamiento} onChange={(v) => set("equipamiento", v)} label="Equipamiento" />
          {f.equipamiento && (
            <div><label className="text-[11px] block mb-1" style={{ color: C.dim }}>Detalle equipamiento</label>
              <Input value={f.equipamientoDetalle} onChange={(v) => set("equipamientoDetalle", v)} placeholder="Cámaras, LED wall…" /></div>
          )}
          <EditCardFooter onSave={() => { onUpdate(f); setEditando(false); }} onCancel={() => setEditando(false)} />
        </div>
      ) : (
        <>
          <Dato k="Fecha" v={fmtFecha(ev.fecha)} mono />
          <Dato k="Categoría" v={ev.categoria || "—"} />
          <Dato k="Estudio" v={ev.estudio || "—"} />
          <Dato k="Tipo" v={ev.tipoProd || "—"} />
          <Dato k="Trackeo" v={ev.trackeo || "—"} />
          {ev.equipamiento && ev.equipamientoDetalle && <Dato k="Equipamiento" v={ev.equipamientoDetalle} />}
        </>
      )}
    </Card>
  );
}

function FacturacionCard({ ev, onUpdate, perms }) {
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState({});
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const startEdit = () => {
    setF({
      distribucion: ev.distribucion || "M1", moneda: ev.moneda || "ARS",
      razonSocial: ev.razonSocial || "", montoM1: ev.montoM1 ?? "",
      montoM2: ev.montoM2 ?? "", cantFacturas: ev.cantFacturas ?? "",
      medioPago: ev.medioPago || "", formaPago: ev.formaPago || "",
    });
    setEditando(true);
  };

  return (
    <Card titulo="Facturación" icon={<DollarSign size={15} color={C.green} />}
      action={perms?.eventoFacturar && !editando ? <EditCardBtn onClick={startEdit} /> : null}>
      {editando ? (
        <div className="grid gap-2">
          <div><label className="text-[11px] block mb-1" style={{ color: C.dim }}>Distribución</label>
            <SelectKV value={f.distribucion} onChange={(v) => set("distribucion", v)} options={DISTRIBUCION_OPCIONES} /></div>
          <div><label className="text-[11px] block mb-1" style={{ color: C.dim }}>Moneda</label>
            <Select value={f.moneda} onChange={(v) => set("moneda", v)} options={MONEDAS} /></div>
          <div><label className="text-[11px] block mb-1" style={{ color: C.dim }}>Razón social</label>
            <Input value={f.razonSocial} onChange={(v) => set("razonSocial", v)} placeholder="Razón social…" /></div>
          {(f.distribucion === "M1" || f.distribucion === "MIXTO") && (
            <div><label className="text-[11px] block mb-1" style={{ color: C.dim }}>Monto M1 (neto)</label>
              <Input type="number" value={f.montoM1} onChange={(v) => set("montoM1", v)} placeholder="0" /></div>
          )}
          {(f.distribucion === "M2" || f.distribucion === "MIXTO") && (
            <div><label className="text-[11px] block mb-1" style={{ color: C.dim }}>Monto M2 (efectivo)</label>
              <Input type="number" value={f.montoM2} onChange={(v) => set("montoM2", v)} placeholder="0" /></div>
          )}
          <div><label className="text-[11px] block mb-1" style={{ color: C.dim }}>Cant. facturas</label>
            <Input type="number" value={f.cantFacturas} onChange={(v) => set("cantFacturas", v)} placeholder="0" /></div>
          <div><label className="text-[11px] block mb-1" style={{ color: C.dim }}>Medio de pago</label>
            <Input value={f.medioPago} onChange={(v) => set("medioPago", v)} placeholder="Transferencia, efectivo…" /></div>
          <div><label className="text-[11px] block mb-1" style={{ color: C.dim }}>Forma de pago</label>
            <Input value={f.formaPago} onChange={(v) => set("formaPago", v)} placeholder="Contado, cuotas…" /></div>
          <EditCardFooter onSave={() => { onUpdate(f); setEditando(false); }} onCancel={() => setEditando(false)} />
        </div>
      ) : (
        <>
          <Dato k="Distribución" v={empresaLabel(ev.distribucion)} />
          <Dato k="Razón social" v={ev.razonSocial || "—"} />
          {(ev.distribucion === "M1" || ev.distribucion === "MIXTO") && (
            <><Dato k="Monto M1 (neto)" v={fmtMoneda(montoM1(ev), ev.moneda)} mono />
              <Dato k="Monto M1 + IVA" v={fmtMoneda(montoM1(ev) * 1.21, ev.moneda)} mono accent /></>
          )}
          {(ev.distribucion === "M2" || ev.distribucion === "MIXTO") && (
            <Dato k="Monto M2 (efectivo)" v={fmtMoneda(montoM2(ev), ev.moneda)} mono />
          )}
          <Dato k="Total facturable" v={fmtMoneda(totalFacturable(ev), ev.moneda)} mono accent />
          <Dato k="Cant. facturas" v={ev.cantFacturas || "—"} />
          <Dato k="Medio de pago" v={ev.medioPago || "—"} />
          <Dato k="Forma de pago" v={ev.formaPago || "—"} />
        </>
      )}
    </Card>
  );
}

function DireccionCard({ ev, onUpdate, perms }) {
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState({ nombre: "", telefono: "", email: "" });

  const startEdit = () => {
    setF({ nombre: ev.director?.nombre || "", telefono: ev.director?.telefono || "", email: ev.director?.email || "" });
    setEditando(true);
  };

  return (
    <Card titulo="Dirección" icon={<Phone size={15} color={C.amber} />}
      action={perms?.eventoEditar && !editando ? <EditCardBtn onClick={startEdit} /> : null}>
      {editando ? (
        <div className="grid gap-2">
          <div><label className="text-[11px] block mb-1" style={{ color: C.dim }}>Director</label>
            <Input value={f.nombre} onChange={(v) => setF((p) => ({ ...p, nombre: v }))} placeholder="Nombre del director" /></div>
          <div><label className="text-[11px] block mb-1" style={{ color: C.dim }}>Teléfono</label>
            <Input value={f.telefono} onChange={(v) => setF((p) => ({ ...p, telefono: v }))} placeholder="+54 9 11…" /></div>
          <div><label className="text-[11px] block mb-1" style={{ color: C.dim }}>Email</label>
            <Input value={f.email} onChange={(v) => setF((p) => ({ ...p, email: v }))} placeholder="director@…" /></div>
          <EditCardFooter onSave={() => { onUpdate({ director: f }); setEditando(false); }} onCancel={() => setEditando(false)} />
        </div>
      ) : (
        <>
          <Dato k="Director" v={ev.director?.nombre || "—"} />
          <Dato k="Teléfono" v={ev.director?.telefono || "—"} mono />
          <Dato k="Email" v={ev.director?.email || "—"} mono />
        </>
      )}
    </Card>
  );
}

function EquipoCard({ ev, onUpdate, perms, personas = [], eventos = [] }) {
  const [editando, setEditando] = useState(false);
  const [integrantes, setIntegrantes] = useState([]);
  const [nuevo, setNuevo] = useState({ personaId: "", rol: "" });

  const startEdit = () => {
    setIntegrantes((ev.integrantes || []).map((i) => ({ ...i, partes: i.partes || [] })));
    setNuevo({ personaId: "", rol: "" });
    setEditando(true);
  };

  // Misma lógica de conflictos que en FormEvento
  const partesSuperpuestas = (a, b) => {
    const fa = (a || []).length === 0 ? PARTES_PROD : a;
    const fb = (b || []).length === 0 ? PARTES_PROD : b;
    return fa.some((p) => fb.includes(p));
  };

  const conflictosPorPersona = (personaId, idx) => {
    if (!personaId) return [];
    const integranteActual = integrantes[idx];
    const fechasTrabajo = getFechasTrabajo(ev.partes, integranteActual?.partes || []);
    const usarFechaSimple = fechasTrabajo.size === 0;
    return eventos.filter((otro) => {
      if (otro.id === ev.id) return false;
      const enOtro = (otro.integrantes || []).find((x) => x.personaId === personaId);
      if (!enOtro) return false;
      const fechasOtro = getFechasTrabajo(otro.partes || [], enOtro.partes || []);
      const otroSimple = fechasOtro.size === 0;
      if (usarFechaSimple && otroSimple) return ev.fecha && otro.fecha && ev.fecha === otro.fecha;
      if (usarFechaSimple) return ev.fecha ? fechasOtro.has(ev.fecha) : false;
      if (otroSimple) return otro.fecha ? fechasTrabajo.has(otro.fecha) : false;
      for (const d of fechasTrabajo) { if (fechasOtro.has(d)) return true; }
      return false;
    });
  };

  const dupInternos = (idx) => {
    const actual = integrantes[idx];
    if (!actual?.personaId) return [];
    return integrantes.filter((x, i) =>
      i !== idx && x.personaId === actual.personaId && partesSuperpuestas(actual.partes, x.partes)
    );
  };

  const toggleParte = (idx, tipo) => {
    setIntegrantes((prev) => prev.map((x, i) => {
      if (i !== idx) return x;
      const p = x.partes || [];
      return { ...x, partes: p.includes(tipo) ? p.filter((t) => t !== tipo) : [...p, tipo] };
    }));
  };

  const addIntegrante = () => {
    if (!nuevo.personaId) return;
    const persona = personas.find((p) => p.id === nuevo.personaId);
    setIntegrantes((prev) => [...prev, { personaId: nuevo.personaId, nombre: persona?.nombre || "", rol: nuevo.rol, partes: [] }]);
    setNuevo({ personaId: "", rol: "" });
  };

  const delIntegrante = (idx) => setIntegrantes((prev) => prev.filter((_, i) => i !== idx));
  const setRol = (idx, rol) => setIntegrantes((prev) => prev.map((x, i) => i === idx ? { ...x, rol } : x));

  const guardar = () => {
    const dups = integrantes.filter((_, idx) => dupInternos(idx).length > 0);
    if (dups.length > 0) {
      const nombres = [...new Set(dups.map((i) => i.nombre || "?"))];
      alert(`Hay personas con fases superpuestas:\n${nombres.map((n) => `• ${n}`).join("\n")}\nCambiá las fases o quitá una entrada.`);
      return;
    }
    onUpdate({ integrantes });
    setEditando(false);
  };

  return (
    <Card titulo="Equipo" icon={<Users size={15} color={C.gold} />}
      action={perms?.eventoEditar && !editando ? <EditCardBtn onClick={startEdit} /> : null}>
      {editando ? (
        <div className="grid gap-3">
          {integrantes.map((integ, idx) => {
            const choques = conflictosPorPersona(integ.personaId, idx);
            const dups = dupInternos(idx);
            const hayError = choques.length > 0 || dups.length > 0;
            const todasSel = (integ.partes || []).length === PARTES_PROD.length;
            return (
              <div key={idx} className="grid gap-1.5 pb-2.5" style={{ borderBottom: `1px solid ${C.border}` }}>
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-sm font-medium truncate" style={{ color: hayError ? C.rose : C.text }}>{integ.nombre}</span>
                  <input value={integ.rol} onChange={(e) => setRol(idx, e.target.value)} placeholder="Rol"
                    className="text-sm px-2 py-1 rounded w-32 outline-none"
                    style={{ background: C.panel2, border: `1px solid ${hayError ? C.rose : C.border}`, color: C.text }} />
                  <button type="button" onClick={() => delIntegrante(idx)}
                    className="p-1 rounded" style={{ color: C.rose }} title="Quitar"><X size={14} /></button>
                </div>
                {/* Chips de partes */}
                <div className="flex flex-wrap items-center gap-1.5 pl-1">
                  <span className="text-[10px]" style={{ color: C.dim }}>Fases:</span>
                  <button type="button"
                    onClick={() => setIntegrantes((prev) => prev.map((x, i) => i === idx ? { ...x, partes: todasSel ? [] : [...PARTES_PROD] } : x))}
                    className="text-[10px] px-2 py-0.5 rounded-full transition-colors"
                    style={{ background: todasSel ? `${C.gold}22` : C.panel, color: todasSel ? C.gold : C.dim, border: `1px solid ${todasSel ? C.gold + "60" : C.border}` }}>
                    {todasSel ? "✓ Todas" : "Todas"}
                  </button>
                  {PARTES_PROD.map((tipo) => {
                    const sel = (integ.partes || []).includes(tipo);
                    return (
                      <button key={tipo} type="button" onClick={() => toggleParte(idx, tipo)}
                        className="text-[10px] px-2 py-0.5 rounded-full transition-colors"
                        style={{ background: sel ? `${C.amber}22` : C.panel, color: sel ? C.amber : C.dim, border: `1px solid ${sel ? C.amber + "60" : C.border}` }}>
                        {tipo}
                      </button>
                    );
                  })}
                  {(integ.partes || []).length === 0 && (
                    <span className="text-[10px] italic" style={{ color: C.dim }}>Sin especificar (se añade en todas)</span>
                  )}
                </div>
                {dups.length > 0 && (
                  <div className="text-[11px] px-2 py-1.5 rounded flex items-center gap-1.5"
                    style={{ background: `${C.rose}1a`, border: `1px solid ${C.rose}55`, color: C.rose }}>
                    <AlertTriangle size={11} /> Misma persona con fases superpuestas en este evento.
                  </div>
                )}
                {choques.length > 0 && (
                  <div className="text-[11px] px-2 py-1.5 rounded" style={{ background: `${C.rose}1a`, border: `1px solid ${C.rose}55`, color: C.rose }}>
                    <div className="flex items-center gap-1.5 font-medium mb-0.5"><AlertTriangle size={11} /> Conflicto con otro evento:</div>
                    {choques.map((c) => <div key={c.id}>· {c.nombre || "Sin nombre"}</div>)}
                  </div>
                )}
              </div>
            );
          })}
          {/* Fila para agregar nuevo integrante */}
          <div className="flex gap-2">
            <select value={nuevo.personaId} onChange={(e) => setNuevo((p) => ({ ...p, personaId: e.target.value }))}
              className="flex-1 text-sm px-2 py-1.5 rounded"
              style={{ background: C.panel2, border: `1px solid ${C.border}`, color: nuevo.personaId ? C.text : C.dim, colorScheme: "dark" }}>
              <option value="" style={{ color: C.dim }}>Agregar persona…</option>
              {personas.map((p) => <option key={p.id} value={p.id} style={{ background: C.panel2, color: C.text }}>{p.nombre}</option>)}
            </select>
            <input value={nuevo.rol} onChange={(e) => setNuevo((p) => ({ ...p, rol: e.target.value }))} placeholder="Rol"
              className="text-sm px-2 py-1 rounded w-24 outline-none"
              style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.text }} />
            <button type="button" onClick={addIntegrante}
              className="px-2 py-1 rounded" style={{ background: C.amber, color: C.onGold }} title="Agregar">
              <Plus size={14} />
            </button>
          </div>
          <EditCardFooter onSave={guardar} onCancel={() => setEditando(false)} />
        </div>
      ) : (
        ev.integrantes?.length ? (
          <div className="grid gap-2">
            {ev.integrantes.map((i, idx) => (
              <div key={idx} className="py-1" style={{ borderBottom: idx < ev.integrantes.length - 1 ? `1px solid ${C.border}` : "none" }}>
                <div className="flex items-center justify-between text-sm">
                  <span>{i.nombre}</span>
                  <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ background: C.panel2, color: C.dim }}>{i.rol}</span>
                </div>
                {(i.partes || []).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {i.partes.map((p) => (
                      <span key={p} className="text-[9px] px-1.5 py-0.5 rounded-full"
                        style={{ background: `${C.amber}18`, color: C.amber, border: `1px solid ${C.amber}40` }}>{p}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : <p className="text-sm" style={{ color: C.dim }}>Sin integrantes cargados.</p>
      )}
    </Card>
  );
}

function EquipoExternoCard({ ev, onUpdate, perms }) {
  const lista = ev.equipoExterno || [];
  const [editando, setEditando] = useState(false);
  const [items, setItems] = useState([]);
  const [copiado, setCopiado] = useState(false);

  const textoCreditos = useMemo(() => {
    if (lista.length === 0) return "";
    const fecha = ev.fecha ? fmtFecha(ev.fecha) : "";
    const head = `${ev.nombre || "Evento"}${fecha ? " · " + fecha : ""}\nEquipo técnico:`;
    return `${head}\n${lista.map((p) => `· ${p.nombre}${p.rol ? " — " + p.rol : ""}`).join("\n")}`;
  }, [lista, ev.nombre, ev.fecha]);

  const copiar = async () => {
    try { await navigator.clipboard.writeText(textoCreditos); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }
    catch (e) { alert("No se pudo copiar: " + e.message); }
  };

  const startEdit = () => { setItems(lista.map((i) => ({ ...i }))); setEditando(true); };
  const addItem = () => setItems((prev) => [...prev, { nombre: "", rol: "" }]);
  const setItem = (idx, k, v) => setItems((prev) => prev.map((x, i) => i === idx ? { ...x, [k]: v } : x));
  const delItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  return (
    <Card titulo="Equipo técnico externo" icon={<Users size={15} color="#9b8cff" />}
      action={perms?.eventoEditar && !editando ? <EditCardBtn onClick={startEdit} /> : null}>
      {editando ? (
        <div className="grid gap-2">
          {items.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input value={item.nombre} onChange={(e) => setItem(idx, "nombre", e.target.value)} placeholder="Nombre"
                className="flex-1 text-sm px-2 py-1 rounded outline-none"
                style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.text }} />
              <input value={item.rol} onChange={(e) => setItem(idx, "rol", e.target.value)} placeholder="Rol"
                className="text-sm px-2 py-1 rounded w-28 outline-none"
                style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.text }} />
              <button type="button" onClick={() => delItem(idx)}
                className="p-1 rounded" style={{ color: C.rose }} title="Quitar"><X size={14} /></button>
            </div>
          ))}
          <button type="button" onClick={addItem}
            className="text-sm flex items-center gap-1.5 px-3 py-1.5 rounded self-start"
            style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.dim }}>
            <Plus size={13} /> Agregar persona externa
          </button>
          <EditCardFooter onSave={() => { onUpdate({ equipoExterno: items }); setEditando(false); }} onCancel={() => setEditando(false)} />
        </div>
      ) : (
        <>
          {lista.length === 0 ? (
            <p className="text-sm" style={{ color: C.dim }}>Sin equipo externo cargado.</p>
          ) : (
            <>
              <div className="grid gap-1.5">
                {lista.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm py-1"
                    style={{ borderBottom: idx < lista.length - 1 ? `1px solid ${C.border}` : "none" }}>
                    <span>{p.nombre || <span style={{ color: C.dim }}>Sin nombre</span>}</span>
                    <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ background: C.panel2, color: C.dim }}>{p.rol || "—"}</span>
                  </div>
                ))}
              </div>
              <button type="button" onClick={copiar}
                className="mt-1 text-xs font-medium px-3 py-1.5 rounded-md inline-flex items-center gap-1.5 self-start"
                style={{ background: C.panel2, border: `1px solid ${C.border}`, color: copiado ? C.green : C.gold }}>
                {copiado ? <Check size={13} /> : <FileText size={13} />}
                {copiado ? "Copiado" : "Copiar créditos para redes"}
              </button>
            </>
          )}
        </>
      )}
    </Card>
  );
}

/* ====================== MENSAJES DEL EQUIPO (observaciones por evento) ====================== */
function MensajesEquipo({ ev, usuario, onUpdate }) {
  const [texto, setTexto] = useState("");
  const mensajes = ev.mensajes || [];

  const fmtMsgFecha = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) + " " +
      d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  };

  const enviar = () => {
    const t = texto.trim();
    if (!t) return;
    const nuevo = {
      id: crypto.randomUUID(),
      texto: t,
      autorNombre: usuario.nombre || "?",
      autorId: usuario.id || "",
      fecha: new Date().toISOString(),
    };
    onUpdate({ mensajes: [...mensajes, nuevo] });
    setTexto("");
  };

  const borrar = (id) => {
    onUpdate({ mensajes: mensajes.filter((m) => m.id !== id) });
  };

  const puedeEliminar = (m) =>
    usuario.rol === "admin" || m.autorId === usuario.id;

  return (
    <div className="sm:col-span-2 rounded-xl p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare size={15} color={C.amber} />
        <h3 className="text-sm font-semibold">Observaciones del equipo</h3>
        {mensajes.length > 0 && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full ml-auto"
            style={{ background: `${C.amber}1a`, color: C.amber, border: `1px solid ${C.amber}40` }}>
            {mensajes.length}
          </span>
        )}
      </div>

      {/* Lista de mensajes */}
      {mensajes.length > 0 && (
        <div className="grid gap-2 mb-3">
          {mensajes.map((m) => (
            <div key={m.id} className="rounded-lg px-3 py-2.5 relative"
              style={{ background: C.panel2, border: `1px solid ${C.border}` }}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold" style={{ color: C.gold }}>{m.autorNombre}</span>
                  <span className="text-[10px] font-mono" style={{ color: C.dim }}>{fmtMsgFecha(m.fecha)}</span>
                </div>
                {puedeEliminar(m) && (
                  <IconBtn onClick={() => borrar(m.id)} title="Eliminar" danger><X size={13} /></IconBtn>
                )}
              </div>
              <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: C.text }}>{m.texto}</p>
            </div>
          ))}
        </div>
      )}

      {/* Input para nuevo mensaje */}
      <div className="flex gap-2">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
          placeholder="Escribí una observación… (Enter para enviar)"
          className="flex-1 text-sm px-3 py-2 rounded-md"
          style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.text }}
        />
        <button
          onClick={enviar}
          disabled={!texto.trim()}
          className="text-sm font-medium px-3 py-2 rounded-md flex items-center gap-1.5 shrink-0"
          style={{
            background: texto.trim() ? C.gold : C.panel2,
            color: texto.trim() ? C.onGold : C.dim,
            border: `1px solid ${texto.trim() ? C.gold : C.border}`,
          }}
        >
          <Send size={14} /> Enviar
        </button>
      </div>
    </div>
  );
}

/* ====================== ARCHIVOS (facturas + comprobantes) ====================== */
function Archivos({ ev, onUpdate }) {
  const facturas = ev.facturas || [];
  const comprobantes = ev.comprobantes || [];
  const maxFact = Number(ev.cantFacturas) || 0;
  const restantes = Math.max(0, maxFact - facturas.length);

  return (
    <div className="sm:col-span-2 rounded-xl p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-2 mb-3">
        <Paperclip size={15} color={C.gold} />
        <h3 className="text-sm font-semibold">Archivos del evento</h3>
        <span className="ml-auto text-[11px]" style={{ color: C.dim }}>
          {isSupabaseConfigured ? "Guardados en la nube" : "Modo local (este navegador)"}
        </span>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <ArchivoLista
          ev={ev}
          tipo="facturas"
          titulo="Facturas"
          icono={<Receipt size={14} color={C.green} />}
          archivos={facturas}
          max={maxFact}
          textoVacio={
            maxFact > 0
              ? `Falta cargar ${restantes} de ${maxFact} factura(s).`
              : "Definí cuántas facturas se van a emitir (en Editar → Facturación) y después subilas acá."
          }
          onUpdate={onUpdate}
        />
        <ArchivoLista
          ev={ev}
          tipo="comprobantes"
          titulo="Comprobantes de pago"
          icono={<DollarSign size={14} color={C.amber} />}
          archivos={comprobantes}
          textoVacio="No hay comprobantes cargados todavía."
          onUpdate={onUpdate}
        />
      </div>
    </div>
  );
}

function ArchivoLista({ ev, tipo, titulo, icono, archivos, max, textoVacio, onUpdate }) {
  const [subiendo, setSubiendo] = useState(false);
  const inputRef = useRef(null);
  const lleno = max ? archivos.length >= max : false;

  const subir = async (files) => {
    if (!files?.length) return;
    if (max) {
      const disponible = Math.max(0, max - archivos.length);
      if (disponible === 0) {
        alert(`Ya cargaste las ${max} facturas indicadas. Editá el evento si necesitás más.`);
        return;
      }
      if (files.length > disponible) {
        alert(`Solo podés cargar ${disponible} archivo(s) más (cant. facturas = ${max}).`);
        return;
      }
    }
    setSubiendo(true);
    try {
      const nuevos = [];
      for (const f of files) {
        nuevos.push(await subirArchivo(ev.id, tipo, f));
      }
      const lista = [...archivos, ...nuevos];
      const patch = { [tipo]: lista };
      if (tipo === "facturas") {
        if (max && lista.length >= max) {
          patch.facturado = true;
          patch.facturadoTotal = true;
        } else if (lista.length > 0) {
          patch.facturado = true;
        }
      }
      if (tipo === "comprobantes" && lista.length > 0) patch.comprobantePago = true;
      await onUpdate(patch);
    } catch (e) {
      console.error(e);
      alert("No se pudo subir el archivo: " + e.message);
    } finally {
      setSubiendo(false);
    }
  };

  const eliminar = async (meta) => {
    if (!confirm(`¿Borrar "${meta.name}"?`)) return;
    try {
      await borrarArchivo(meta);
      const lista = archivos.filter((x) => x.id !== meta.id);
      const patch = { [tipo]: lista };
      if (tipo === "facturas" && lista.length === 0) {
        patch.facturado = false;
        patch.facturadoTotal = false;
      } else if (tipo === "facturas" && max && lista.length < max) {
        patch.facturadoTotal = false;
      }
      if (tipo === "comprobantes" && lista.length === 0) patch.comprobantePago = false;
      await onUpdate(patch);
    } catch (e) {
      console.error(e);
      alert("No se pudo borrar el archivo: " + e.message);
    }
  };

  const abrir = async (meta) => {
    try {
      const url = await urlArchivo(meta);
      if (!url) {
        alert("No se puede abrir el archivo (sin conexión al storage).");
        return;
      }
      window.open(url, "_blank", "noopener");
    } catch (e) {
      alert("No se pudo abrir: " + e.message);
    }
  };

  return (
    <div className="rounded-lg p-3" style={{ background: C.panel2, border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-2 mb-2">
        {icono}
        <span className="text-sm font-medium">{titulo}</span>
        <span className="ml-auto font-mono text-[11px] px-2 py-0.5 rounded-full" style={{ background: C.panel, color: C.dim }}>
          {archivos.length}{max ? ` / ${max}` : ""}
        </span>
      </div>

      {archivos.length === 0 ? (
        <p className="text-xs py-2" style={{ color: C.dim }}>{textoVacio}</p>
      ) : (
        <div className="grid gap-1.5 mb-3">
          {archivos.map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-xs px-2.5 py-2 rounded" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
              <FileText size={13} color={C.gold} className="shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="truncate" title={a.name}>{a.name}</div>
                <div className="font-mono text-[10px]" style={{ color: C.dim }}>
                  {fmtBytes(a.size)} · {a.uploadedAt ? fmtFecha(a.uploadedAt.slice(0, 10)) : "—"}
                </div>
              </div>
              <IconBtn onClick={() => abrir(a)} title="Abrir / descargar"><Eye size={14} /></IconBtn>
              <IconBtn onClick={() => eliminar(a)} title="Borrar" danger><Trash2 size={14} /></IconBtn>
            </div>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = "";
          subir(files);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={subiendo || lleno}
        className="w-full text-xs font-medium px-3 py-2 rounded-md flex items-center justify-center gap-1.5 transition-colors"
        style={{
          background: lleno ? C.panel : C.gold,
          color: lleno ? C.dim : C.onGold,
          border: `1px solid ${lleno ? C.border : C.gold}`,
          cursor: subiendo || lleno ? "not-allowed" : "pointer",
          opacity: subiendo ? 0.7 : 1,
        }}
      >
        <Upload size={13} />
        {subiendo
          ? "Subiendo…"
          : lleno
          ? "Cant. de facturas completa"
          : `Subir ${tipo === "facturas" ? "factura" : "comprobante"}`}
      </button>
    </div>
  );
}

function Card({ titulo, icon, children, full, action }) {
  return (
    <div className={`rounded-xl p-4 ${full ? "sm:col-span-2" : ""}`} style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-2 mb-3">{icon}<h3 className="text-sm font-semibold flex-1">{titulo}</h3>{action}</div>
      <div className="grid gap-2">{children}</div>
    </div>
  );
}
function Dato({ k, v, mono, accent }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span style={{ color: C.dim }} className="text-[13px]">{k}</span>
      <span className={mono ? "font-mono" : ""} style={{ color: accent ? C.gold : C.text, textAlign: "right" }}>{v}</span>
    </div>
  );
}

/* ====================== FORMULARIO ====================== */
function FormEvento({ base, onCancel, onSave, guardando, personas = [], eventos = [], onLiberarPersona, onReemplazarEnEvento, onIrAPersonal, perms = {} }) {
  const [f, setF] = useState(() => {
    // Garantiza que partes siempre tiene los 5 tipos, incluso en eventos viejos
    const partesExistentes = Array.isArray(base.partes) ? base.partes : [];
    const partes = PARTES_PROD.map((tipo) => {
      const existente = partesExistentes.find((p) => p.tipo === tipo);
      return existente || { tipo, fechas: [] };
    });
    return { ...base, partes };
  });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setDir = (k, v) => setF((p) => ({ ...p, director: { ...p.director, [k]: v } }));

  // Estado para el input de fecha pendiente por parte (indexado)
  const [fechaInputs, setFechaInputs] = useState(() => Array(PARTES_PROD.length).fill(""));
  // Reemplazo de integrante en otro evento: { eventoId, personaId, nuevoId }
  const [reemplazando, setReemplazando] = useState(null);

  const addFecha = (tipoIdx, fecha) => {
    if (!fecha) return;
    const nuevasPartes = f.partes.map((p, i) => {
      if (i !== tipoIdx) return p;
      if ((p.fechas || []).includes(fecha)) return p;
      return { ...p, fechas: [...(p.fechas || []), fecha].sort() };
    });
    const allFechas = nuevasPartes.flatMap((p) => p.fechas || []).filter(Boolean).sort();
    setF((prev) => ({
      ...prev,
      partes: nuevasPartes,
      ...(allFechas.length > 0 && !prev.fecha ? { fecha: allFechas[0] } : {}),
    }));
    setFechaInputs((prev) => { const n = [...prev]; n[tipoIdx] = ""; return n; });
  };

  const delFecha = (tipoIdx, fecha) => {
    const nuevasPartes = f.partes.map((p, i) => {
      if (i !== tipoIdx) return p;
      return { ...p, fechas: (p.fechas || []).filter((d) => d !== fecha) };
    });
    const allFechas = nuevasPartes.flatMap((p) => p.fechas || []).filter(Boolean).sort();
    setF((prev) => ({
      ...prev,
      partes: nuevasPartes,
      // Si se quedó sin fechas en partes, limpiar fecha del evento también
      ...(allFechas.length === 0 ? { fecha: "" } : { fecha: allFechas[0] }),
    }));
  };

  const addIntegrante = () => set("integrantes", [...f.integrantes, { personaId: "", nombre: "", rol: "", partes: [] }]);

  const toggleIntegranteParte = (idx, tipo) => {
    const partes = f.integrantes[idx]?.partes || [];
    const nuevasPartes = partes.includes(tipo) ? partes.filter((p) => p !== tipo) : [...partes, tipo];
    setIntegrante(idx, "partes", nuevasPartes);
  };
  const setIntegrante = (i, k, v) =>
    set("integrantes", f.integrantes.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)));
  const elegirPersona = (i, personaId) => {
    const p = personas.find((p) => p.id === personaId);
    set("integrantes", f.integrantes.map((x, idx) => idx === i
      ? { ...x, personaId, nombre: p ? p.nombre : "", rol: x.rol || (p ? p.rolHabitual : "") }
      : x));
  };
  const delIntegrante = (i) => set("integrantes", f.integrantes.filter((_, idx) => idx !== i));

  /* Equipo técnico externo (de otra productora). Inputs libres. */
  const equipoExterno = f.equipoExterno || [];
  const addExterno = () => set("equipoExterno", [...equipoExterno, { nombre: "", rol: "" }]);
  const setExterno = (i, k, v) =>
    set("equipoExterno", equipoExterno.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)));
  const delExterno = (i) => set("equipoExterno", equipoExterno.filter((_, idx) => idx !== i));

  /* Conflicto de personal: superposición de fechas de trabajo (partes o fecha principal). */
  const conflictosPorPersona = (personaId) => {
    if (!personaId) return [];
    const integranteActual = f.integrantes.find((x) => x.personaId === personaId);
    const fechasTrabajo = getFechasTrabajo(f.partes, integranteActual?.partes || []);
    const usarFechaSimple = fechasTrabajo.size === 0;

    return eventos.filter((ev) => {
      if (ev.id === f.id) return false;
      const integranteEnOtro = (ev.integrantes || []).find((x) => x.personaId === personaId);
      if (!integranteEnOtro) return false;
      const fechasOtro = getFechasTrabajo(ev.partes || [], integranteEnOtro.partes || []);
      const otroSimple = fechasOtro.size === 0;

      if (usarFechaSimple && otroSimple) return f.fecha && ev.fecha && f.fecha === ev.fecha;
      if (usarFechaSimple) return f.fecha ? fechasOtro.has(f.fecha) : false;
      if (otroSimple) return ev.fecha ? fechasTrabajo.has(ev.fecha) : false;
      for (const d of fechasTrabajo) { if (fechasOtro.has(d)) return true; }
      return false;
    });
  };

  // Fechas en las que se superpone la persona entre dos eventos (para mostrar en el warning)
  const fechasConflicto = (ev, personaId) => {
    const integranteActual = f.integrantes.find((x) => x.personaId === personaId);
    const fechasTrabajo = getFechasTrabajo(f.partes, integranteActual?.partes || []);
    const integranteEnOtro = (ev.integrantes || []).find((x) => x.personaId === personaId);
    const fechasOtro = getFechasTrabajo(ev.partes || [], integranteEnOtro?.partes || []);
    if (fechasTrabajo.size > 0 && fechasOtro.size > 0) {
      return [...fechasTrabajo].filter((d) => fechasOtro.has(d));
    }
    if (f.fecha && ev.fecha && f.fecha === ev.fecha) return [f.fecha];
    return [];
  };
  const liberarYReintentar = async (eventoId, personaId) => {
    if (!onLiberarPersona) return;
    const ev = eventos.find((x) => x.id === eventoId);
    if (!ev) return;
    if (!confirm(`Quitar a esta persona del evento "${ev.nombre || "sin nombre"}" para asignarla acá?`)) return;
    await onLiberarPersona(eventoId, personaId);
  };

  // Verifica si dos listas de partes se superponen (vacío = todas las fases)
  const partesSuperpuestas = (a, b) => {
    const fa = (a || []).length === 0 ? PARTES_PROD : a;
    const fb = (b || []).length === 0 ? PARTES_PROD : b;
    return fa.some((p) => fb.includes(p));
  };
  // Devuelve los otros integrantes del mismo evento que sean la misma persona con partes superpuestas
  const dupInternos = (idx) => {
    const actual = f.integrantes[idx];
    if (!actual?.personaId) return [];
    return f.integrantes.filter((x, i) =>
      i !== idx && x.personaId === actual.personaId && partesSuperpuestas(actual.partes, x.partes)
    );
  };

  const submit = () => {
    if (!f.nombre.trim()) { alert("Poné al menos el nombre del evento."); return; }
    // Bloqueo: misma persona con fases superpuestas dentro del mismo evento
    const conDups = f.integrantes.filter((int, idx) =>
      int.personaId && dupInternos(idx).length > 0
    );
    if (conDups.length > 0) {
      const nombres = [...new Set(conDups.map((i) => personas.find((p) => p.id === i.personaId)?.nombre || "?"))];
      alert(`Las siguientes personas están cargadas dos veces con fases superpuestas:\n\n${nombres.map((n) => `• ${n}`).join("\n")}\n\nCambiá las fases para que no se repitan, o quitá una de las entradas.`);
      return;
    }
    // Bloqueo: si hay personas en conflicto que no fueron liberadas, frenamos.
    const choques = f.integrantes
      .filter((i) => i.personaId)
      .flatMap((i) => conflictosPorPersona(i.personaId).map((c) => ({ p: i, c })));
    if (choques.length > 0) {
      const lista = choques
        .map((x) => `• ${personas.find((p) => p.id === x.p.personaId)?.nombre || "?"} ya está en "${x.c.nombre}"`)
        .join("\n");
      alert(
        `No podés guardar el evento porque hay personas con doble asignación el ${fmtFecha(f.fecha)}:\n\n${lista}\n\nLiberalas del otro evento o quitalas de acá.`
      );
      return;
    }
    onSave(f);
  };

  return (
    <div className="fade max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-5">
        <IconBtn onClick={onCancel} title="Volver"><ChevronLeft size={18} /></IconBtn>
        <h1 className="text-lg font-semibold">{base.nombre ? "Editar evento" : "Nuevo evento"}</h1>
      </div>

      <div className="grid gap-5">
        {/* Producción */}
        <Seccion titulo="Producción" icon={<Camera size={15} color={C.gold} />}>
          <Field label="Nombre del evento" full>
            <Input value={f.nombre} onChange={(v) => set("nombre", v)} placeholder="Ej: Videoclip — Artista X" />
          </Field>
          <Field label={totalDias(f.partes) > 0 ? "Fecha (auto desde partes)" : "Fecha"}>
            <Input type="date" value={f.fecha} onChange={(v) => set("fecha", v)} />
          </Field>
          <Field label="Categoría">
            <Select value={f.categoria} onChange={(v) => set("categoria", v)} options={CATEGORIAS} placeholder="Elegir" />
          </Field>
          <Field label="Estudio">
            <Select value={f.estudio} onChange={(v) => set("estudio", v)} options={ESTUDIOS} placeholder="Elegir" />
          </Field>
          <Field label="Tipo de producción">
            <Select value={f.tipoProd} onChange={(v) => set("tipoProd", v)} options={TIPO_PROD} placeholder="Elegir" />
          </Field>
          <Field label="Trackeo">
            <Select value={f.trackeo} onChange={(v) => set("trackeo", v)} options={TRACKEO} placeholder="Elegir" />
          </Field>
          <div className="sm:col-span-2 flex flex-col sm:flex-row gap-3 sm:items-center">
            <Toggle checked={f.equipamiento} onChange={(v) => set("equipamiento", v)} label="Equipamiento" />
            {f.equipamiento && (
              <Input value={f.equipamientoDetalle} onChange={(v) => set("equipamientoDetalle", v)} placeholder="Detalle (cámaras, LED wall, grip…)" />
            )}
          </div>
        </Seccion>

        {/* Partes del proyecto */}
        <Seccion titulo="Partes del proyecto" icon={<Clock size={15} color={C.amber} />}>
          <div className="sm:col-span-2 grid gap-2.5">
            <p className="text-xs" style={{ color: C.dim }}>
              Agregá las fechas de cada etapa. El total se calcula sumando días únicos entre todas las partes. La fecha del evento se auto-completa con el día más temprano.
            </p>
            {f.partes.map((parte, idx) => {
              const fechaInput = fechaInputs[idx] || "";
              const agregar = () => {
                if (!fechaInput) return;
                addFecha(idx, fechaInput);
              };
              return (
                <div key={parte.tipo} className="rounded-lg p-3" style={{ background: C.panel2, border: `1px solid ${C.border}` }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{parte.tipo}</span>
                    {parte.fechas.length > 0 && (
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-full" style={{ background: `${C.amber}1a`, color: C.amber, border: `1px solid ${C.amber}40` }}>
                        {parte.fechas.length} {parte.fechas.length === 1 ? "día" : "días"}
                      </span>
                    )}
                  </div>
                  {parte.fechas.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {parte.fechas.map((fecha) => (
                        <button
                          key={fecha}
                          type="button"
                          onClick={() => delFecha(idx, fecha)}
                          className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-md"
                          style={{ background: `${C.amber}22`, border: `1px solid ${C.amber}55`, color: C.amber }}
                          title="Click para quitar"
                        >
                          {fmtFecha(fecha)} <X size={9} />
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 items-center">
                    <input
                      type="date"
                      value={fechaInput}
                      onChange={(e) => setFechaInputs((prev) => { const n = [...prev]; n[idx] = e.target.value; return n; })}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregar(); } }}
                      className="text-sm px-2 py-1.5 rounded-md flex-1"
                      style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text, colorScheme: "dark" }}
                    />
                    <button
                      type="button"
                      onClick={agregar}
                      className="text-sm px-3 py-1.5 rounded-md flex items-center gap-1 shrink-0 font-medium"
                      style={{ background: C.gold, color: C.onGold, opacity: fechaInput ? 1 : 0.4, cursor: fechaInput ? "pointer" : "default" }}
                    >
                      <Plus size={14} /> Agregar
                    </button>
                  </div>
                </div>
              );
            })}
            {totalDias(f.partes) > 0 && (
              <div className="flex items-center justify-end gap-2 px-1 pt-1">
                <Clock size={13} color={C.amber} />
                <span className="text-sm font-semibold" style={{ color: C.amber }}>
                  Total: {totalDias(f.partes)} {totalDias(f.partes) === 1 ? "día" : "días"} de producción
                </span>
              </div>
            )}
          </div>
        </Seccion>

        {/* Equipo */}
        <Seccion titulo="Integrantes y roles" icon={<Users size={15} color={C.gold} />}>
          <div className="sm:col-span-2 grid gap-2">
            {personas.length === 0 && (
              <p className="text-xs px-3 py-2 rounded-md" style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.dim }}>
                Todavía no hay personal cargado.{" "}
                {onIrAPersonal && (
                  <button type="button" onClick={onIrAPersonal} className="underline" style={{ color: C.gold }}>
                    Cargalo en la sección Personal
                  </button>
                )}
              </p>
            )}
            {f.integrantes.map((integrante, idx) => {
              const choques = conflictosPorPersona(integrante.personaId);
              const dups = dupInternos(idx);
              const hayError = choques.length > 0 || dups.length > 0;
              return (
                <div key={idx} className="grid gap-1.5">
                  {/* Fila: persona + rol + quitar */}
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <select value={integrante.personaId || ""} onChange={(e) => elegirPersona(idx, e.target.value)}
                      className="text-sm px-3 py-2 rounded-md sm:flex-1"
                      style={{
                        background: C.panel2,
                        border: `1px solid ${hayError ? C.rose : C.border}`,
                        color: integrante.personaId ? C.text : C.dim,
                        colorScheme: "dark",
                      }}>
                      <option value="" style={{ background: C.panel2, color: C.dim }}>Elegir persona…</option>
                      {personas.map((p) => <option key={p.id} value={p.id} style={{ background: C.panel2, color: C.text }}>{p.nombre}</option>)}
                    </select>
                    <Input value={integrante.rol} onChange={(v) => setIntegrante(idx, "rol", v)} placeholder="Rol en este evento (DF, gaffer…)" />
                    <IconBtn onClick={() => delIntegrante(idx)} title="Quitar" danger><X size={16} /></IconBtn>
                  </div>

                  {/* Chips de partes (visible solo si hay persona elegida) */}
                  {integrante.personaId && (
                    <div className="flex flex-wrap items-center gap-1.5 pl-1">
                      <span className="text-[10px]" style={{ color: C.dim }}>Seleccioná las fases donde participa:</span>
                      {/* Botón toggle todas */}
                      {(() => {
                        const todasSel = (integrante.partes || []).length === PARTES_PROD.length;
                        return (
                          <button type="button"
                            onClick={() => setIntegrante(idx, "partes", todasSel ? [] : [...PARTES_PROD])}
                            className="text-[10px] px-2 py-0.5 rounded-full transition-colors"
                            style={{
                              background: todasSel ? `${C.gold}22` : C.panel,
                              color: todasSel ? C.gold : C.dim,
                              border: `1px solid ${todasSel ? C.gold + "60" : C.border}`,
                            }}>
                            {todasSel ? "✓ Todas" : "Todas"}
                          </button>
                        );
                      })()}
                      {PARTES_PROD.map((tipo) => {
                        const sel = (integrante.partes || []).includes(tipo);
                        return (
                          <button key={tipo} type="button" onClick={() => toggleIntegranteParte(idx, tipo)}
                            className="text-[10px] px-2 py-0.5 rounded-full transition-colors"
                            style={{
                              background: sel ? `${C.amber}22` : C.panel,
                              color: sel ? C.amber : C.dim,
                              border: `1px solid ${sel ? C.amber + "60" : C.border}`,
                            }}>
                            {tipo}
                          </button>
                        );
                      })}
                      {(integrante.partes || []).length === 0 && (
                        <span className="text-[10px] italic" style={{ color: C.dim }}>Sin especificar (se añade en todas)</span>
                      )}
                    </div>
                  )}

                  {/* Duplicado interno: misma persona con fases superpuestas en este mismo evento */}
                  {dups.length > 0 && (
                    <div className="text-xs px-3 py-2 rounded-md" style={{ background: `${C.rose}1a`, border: `1px solid ${C.rose}55`, color: C.rose }}>
                      <div className="flex items-center gap-1.5 font-medium">
                        <AlertTriangle size={13} />
                        Esta persona ya está cargada en este evento con fases superpuestas. Cambiá las fases para que no se repitan, o quitá una de las entradas.
                      </div>
                    </div>
                  )}

                  {/* Conflicto: persona ya asignada en otro evento */}
                  {choques.length > 0 && (
                    <div className="text-xs px-3 py-2 rounded-md" style={{ background: `${C.rose}1a`, border: `1px solid ${C.rose}55`, color: C.rose }}>
                      <div className="flex items-center gap-1.5 font-medium mb-1.5">
                        <AlertTriangle size={13} />
                        Conflicto de fechas:
                      </div>
                      <div className="grid gap-2">
                        {choques.map((c) => {
                          const integranteEnOtro = (c.integrantes || []).find((x) => x.personaId === integrante.personaId);
                          const rolEnOtro = integranteEnOtro?.rol;
                          const overlap = fechasConflicto(c, integrante.personaId);
                          const esReemplazando = reemplazando?.eventoId === c.id && reemplazando?.personaId === integrante.personaId;
                          return (
                            <div key={c.id} className="grid gap-1">
                              <div className="flex items-start justify-between gap-2">
                                <div style={{ color: C.text }}>
                                  <span className="font-medium">· {c.nombre || "Sin nombre"}</span>
                                  {rolEnOtro && <span style={{ color: C.dim }}> — como {rolEnOtro}</span>}
                                  {overlap.length > 0 && (
                                    <div className="text-[10px] mt-0.5" style={{ color: C.dim }}>
                                      Superposición: {overlap.map(fmtFecha).join(", ")}
                                    </div>
                                  )}
                                </div>
                                {perms.liberarPersona ? (
                                  <div className="flex gap-1 shrink-0">
                                    <button type="button" onClick={() => liberarYReintentar(c.id, integrante.personaId)}
                                      className="text-[10px] font-medium px-2 py-1 rounded"
                                      style={{ background: C.rose, color: "#1a0008" }}>
                                      Liberar
                                    </button>
                                    <button type="button"
                                      onClick={() => setReemplazando({ eventoId: c.id, personaId: integrante.personaId, nuevoId: "" })}
                                      className="text-[10px] font-medium px-2 py-1 rounded"
                                      style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.text }}>
                                      Reemplazar
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-[10px] shrink-0" style={{ color: C.dim }}>
                                    Solo admin o producción puede liberar
                                  </span>
                                )}
                              </div>
                              {/* UI de reemplazo inline */}
                              {esReemplazando && (
                                <div className="flex gap-1.5 items-center mt-1 flex-wrap">
                                  <select
                                    value={reemplazando.nuevoId}
                                    onChange={(e) => setReemplazando((prev) => ({ ...prev, nuevoId: e.target.value }))}
                                    className="text-xs px-2 py-1 rounded flex-1 min-w-0"
                                    style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.text, colorScheme: "dark" }}>
                                    <option value="">Elegir reemplazo en "{c.nombre}"…</option>
                                    {personas
                                      .filter((p) => p.id !== integrante.personaId && !(c.integrantes || []).some((x) => x.personaId === p.id))
                                      .map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                                  </select>
                                  <button type="button" disabled={!reemplazando.nuevoId}
                                    onClick={async () => {
                                      await onReemplazarEnEvento(c.id, integrante.personaId, reemplazando.nuevoId);
                                      setReemplazando(null);
                                    }}
                                    className="text-[10px] font-medium px-2 py-1 rounded shrink-0"
                                    style={{ background: reemplazando.nuevoId ? C.gold : C.panel2, color: reemplazando.nuevoId ? C.onGold : C.dim }}>
                                    Confirmar
                                  </button>
                                  <button type="button" onClick={() => setReemplazando(null)}
                                    className="text-[10px] px-2 py-1 rounded shrink-0"
                                    style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.dim }}>
                                    Cancelar
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <button onClick={addIntegrante} className="self-start text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-md mt-1"
              style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.gold }}>
              <Plus size={14} /> Agregar integrante
            </button>
          </div>
        </Seccion>

        {/* Equipo técnico externo */}
        <Seccion titulo="Equipo técnico externo" icon={<Users size={15} color="#9b8cff" />}>
          <div className="sm:col-span-2 grid gap-2">
            <p className="text-xs" style={{ color: C.dim }}>
              Equipo aportado por otra productora. Útil para los créditos en
              redes sociales. No usa el listado interno de personal.
            </p>
            {equipoExterno.map((i, idx) => (
              <div key={idx} className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <Input value={i.nombre} onChange={(v) => setExterno(idx, "nombre", v)} placeholder="Nombre y apellido" />
                <Input value={i.rol} onChange={(v) => setExterno(idx, "rol", v)} placeholder="Rol en el evento" />
                <IconBtn onClick={() => delExterno(idx)} title="Quitar" danger><X size={16} /></IconBtn>
              </div>
            ))}
            <button onClick={addExterno} className="self-start text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-md mt-1"
              style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.gold }}>
              <Plus size={14} /> Agregar técnico externo
            </button>
          </div>
        </Seccion>

        {/* Dirección */}
        <Seccion titulo="Dirección" icon={<Phone size={15} color={C.amber} />}>
          <Field label="Director" full>
            <Input value={f.director.nombre} onChange={(v) => setDir("nombre", v)} placeholder="Nombre del director" />
          </Field>
          <Field label="Teléfono">
            <Input value={f.director.telefono} onChange={(v) => setDir("telefono", v)} placeholder="+54 9 11 ..." />
          </Field>
          <Field label="Email">
            <Input type="email" value={f.director.email} onChange={(v) => setDir("email", v)} placeholder="director@ejemplo.com" />
          </Field>
        </Seccion>

        {/* Facturación */}
        <Seccion titulo="Facturación" icon={<DollarSign size={15} color={C.green} />}>
          <Field label="Razón social (facturación)" full>
            <Input value={f.razonSocial} onChange={(v) => set("razonSocial", v)} placeholder="Razón social + CUIT" />
          </Field>

          <Field label="Distribución" full>
            <div className="grid sm:grid-cols-3 gap-2">
              {DISTRIBUCION_OPCIONES.map((o) => {
                const active = (f.distribucion || "M1") === o.value;
                return (
                  <button
                    type="button"
                    key={o.value}
                    onClick={() => set("distribucion", o.value)}
                    className="text-left rounded-md px-3 py-2 transition-colors"
                    style={{
                      background: active ? C.gold : C.panel2,
                      color: active ? C.onGold : C.text,
                      border: `1px solid ${active ? C.gold : C.border}`,
                    }}
                  >
                    <div className="text-sm font-semibold">{o.label}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: active ? C.onGold : C.dim }}>{o.help}</div>
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Moneda">
            <Select value={f.moneda} onChange={(v) => set("moneda", v)} options={MONEDAS} />
          </Field>
          <Field label="Cant. facturas a emitir">
            <Input type="number" value={f.cantFacturas} onChange={(v) => set("cantFacturas", v)} placeholder="0" />
          </Field>

          {(f.distribucion === "M1" || f.distribucion === "MIXTO") && (
            <>
              <Field label="Monto M1 (neto, sin IVA)">
                <Input type="number" value={f.montoM1} onChange={(v) => set("montoM1", v)} placeholder="0" />
              </Field>
              <Field label="Monto M1 + IVA (auto)">
                <div className="font-mono text-sm px-3 py-2 rounded-md" style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.gold }}>
                  {fmtMoneda(conIva(f.montoM1), f.moneda)}
                </div>
              </Field>
            </>
          )}

          {(f.distribucion === "M2" || f.distribucion === "MIXTO") && (
            <Field label="Monto M2 (efectivo, sin IVA)" full={f.distribucion === "M2"}>
              <Input type="number" value={f.montoM2} onChange={(v) => set("montoM2", v)} placeholder="0" />
            </Field>
          )}

          <Field label="Total facturable (auto)" full>
            <div className="font-mono text-sm px-3 py-2 rounded-md flex items-center justify-between" style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.gold }}>
              <span>{fmtMoneda(totalFacturable(f), f.moneda)}</span>
              <span className="text-[11px]" style={{ color: C.dim }}>
                {f.distribucion === "M1" && "= M1 + IVA"}
                {f.distribucion === "M2" && "= efectivo M2"}
                {f.distribucion === "MIXTO" && "= (M1 + IVA) + efectivo M2"}
              </span>
            </div>
          </Field>

          <Field label="Medio de pago">
            <Input value={f.medioPago} onChange={(v) => set("medioPago", v)} placeholder="Transferencia, efectivo…" />
          </Field>
          <Field label="Forma de pago">
            <Input value={f.formaPago} onChange={(v) => set("formaPago", v)} placeholder="Contado, 30 días…" />
          </Field>

          <div className="sm:col-span-2 text-xs px-3 py-2 rounded-md flex items-start gap-2" style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.dim }}>
            <Paperclip size={14} className="mt-0.5 shrink-0" />
            <span>
              Las <strong style={{ color: C.text }}>facturas</strong> y <strong style={{ color: C.text }}>comprobantes de pago</strong> se cargan como archivo
              desde el detalle del evento, una vez creado. Lo mismo aplica para los marcadores
              "Facturado", "Comprobante de pago" y "Facturado total".
            </span>
          </div>
        </Seccion>

        {/* Observaciones */}
        <Seccion titulo="Observaciones" icon={<FileText size={15} color={C.dim} />}>
          <div className="sm:col-span-2">
            <textarea value={f.observaciones} onChange={(e) => set("observaciones", e.target.value)}
              rows={4} placeholder="Notas, pendientes, detalles del set…"
              className="w-full text-sm px-3 py-2 rounded-md resize-y"
              style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.text }} />
          </div>
        </Seccion>

        <div className="flex gap-2 justify-end pb-8">
          <button onClick={onCancel} className="text-sm px-4 py-2 rounded-md" style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.dim }}>Cancelar</button>
          <button onClick={submit} disabled={guardando} className="text-sm font-medium px-5 py-2 rounded-md flex items-center gap-1.5"
            style={{ background: C.gold, color: C.onGold, opacity: guardando ? 0.6 : 1, cursor: guardando ? "wait" : "pointer" }}>
            <Check size={16} /> {guardando ? "Guardando…" : "Guardar evento"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- form primitives ---------- */
function Seccion({ titulo, icon, children }) {
  return (
    <section className="rounded-xl p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-2 mb-3.5">{icon}<h2 className="text-sm font-semibold">{titulo}</h2></div>
      <div className="grid sm:grid-cols-2 gap-3.5">{children}</div>
    </section>
  );
}
function Field({ label, full, children }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="block text-[12px] mb-1.5" style={{ color: C.dim }}>{label}</label>
      {children}
    </div>
  );
}
function Input({ value, onChange, placeholder, type = "text" }) {
  return (
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full text-sm px-3 py-2 rounded-md"
      style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.text, colorScheme: "dark" }} />
  );
}
function Select({ value, onChange, options, placeholder, compact }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className={`text-sm px-3 py-2 rounded-md ${compact ? "" : "w-full"}`}
      style={{ background: compact ? C.panel : C.panel2, border: `1px solid ${C.border}`, color: value ? C.text : C.dim, colorScheme: "dark" }}>
      {placeholder && <option value="" style={{ background: C.panel2, color: C.dim }}>{placeholder}</option>}
      {options.map((o) => <option key={o} value={o} style={{ background: C.panel2, color: C.text }}>{o}</option>)}
    </select>
  );
}
function SelectKV({ value, onChange, options, placeholder, compact }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className={`text-sm px-3 py-2 rounded-md ${compact ? "" : "w-full"}`}
      style={{ background: compact ? C.panel : C.panel2, border: `1px solid ${C.border}`, color: value ? C.text : C.dim, colorScheme: "dark" }}>
      {placeholder && <option value="" style={{ background: C.panel2, color: C.dim }}>{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value} style={{ background: C.panel2, color: C.text }}>{o.label}</option>)}
    </select>
  );
}
function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className="flex items-center gap-2 text-sm"
      style={{ cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1 }}
      title={disabled ? "No tenés permiso para cambiar esto" : undefined}
    >
      <span className="grid place-items-center rounded transition-colors" style={{
        width: 20, height: 20, background: checked ? C.gold : C.panel2,
        border: `1px solid ${checked ? C.gold : C.border}`,
      }}>
        {checked && <Check size={14} color={C.onGold} />}
      </span>
      <span style={{ color: checked ? C.text : C.dim }}>{label}</span>
    </button>
  );
}
function IconBtn({ onClick, children, title, danger }) {
  return (
    <button onClick={onClick} title={title}
      className="grid place-items-center rounded-md transition-colors"
      style={{ width: 32, height: 32, background: C.panel2, border: `1px solid ${C.border}`, color: danger ? C.rose : C.dim }}
      onMouseEnter={(e) => e.currentTarget.style.color = danger ? C.rose : C.text}
      onMouseLeave={(e) => e.currentTarget.style.color = danger ? C.rose : C.dim}>
      {children}
    </button>
  );
}

/* ====================== LOGIN ====================== */
function Login({ onLogin, bootError, seedInfo, hayUsuarios }) {
  const [nombre, setNombre] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      await onLogin(nombre, password);
    } catch (err) {
      setError(err.message || "No se pudo iniciar sesión.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div
      style={{ background: C.bg, color: C.text, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
      className="min-h-screen w-full flex items-center justify-center px-4"
    >
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6 justify-center">
          <img src="/logo.png" alt="Cacodelphia" style={{ height: 44 }} className="object-contain" />
          <div className="leading-tight">
            <div className="font-semibold tracking-tight">Sistema eventos Cacodelphia</div>
            <div style={{ color: C.dim }} className="text-[11px] font-mono">Estudios</div>
          </div>
        </div>

        {bootError && (
          <div className="mb-4 p-3 rounded-md text-xs flex items-start gap-2"
               style={{ background: `${C.rose}1a`, border: `1px solid ${C.rose}40`, color: C.rose }}>
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{bootError}</span>
          </div>
        )}

        <form onSubmit={submit} className="rounded-xl p-5"
              style={{ background: C.panel, border: `1px solid ${C.border}` }}>
          <h1 className="text-base font-semibold mb-4 flex items-center gap-2">
            <KeyRound size={16} color={C.gold} /> Iniciar sesión
          </h1>

          <label className="text-xs block mb-1" style={{ color: C.dim }}>Usuario</label>
          <Input value={nombre} onChange={setNombre} placeholder="Usuario" />

          <label className="text-xs block mb-1 mt-3" style={{ color: C.dim }}>Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••"
            autoComplete="current-password"
            className="w-full text-sm px-3 py-2 rounded-md"
            style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.text, colorScheme: "dark" }}
          />

          {error && (
            <div className="mt-3 text-xs flex items-center gap-1.5" style={{ color: C.rose }}>
              <AlertTriangle size={12} /> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={cargando}
            className="mt-4 w-full text-sm font-medium px-4 py-2.5 rounded-md flex items-center justify-center gap-1.5"
            style={{ background: C.gold, color: C.onGold, opacity: cargando ? 0.6 : 1 }}
          >
            {cargando ? "Verificando…" : (<><KeyRound size={14} /> Entrar</>)}
          </button>

          {!hayUsuarios && !bootError && (
            <p className="text-[11px] mt-3 text-center" style={{ color: C.dim }}>
              Inicializando usuarios… recargá la página si tarda más de unos segundos.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

/* ====================== USUARIOS (admin) ====================== */
function Usuarios({ usuarios, actual, onCrear, onActualizar, onCambiarPassword, onBorrar }) {
  const [creando, setCreando] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoPass, setNuevoPass] = useState("");
  const [mostrarNuevoPass, setMostrarNuevoPass] = useState(false);
  const [nuevoRol, setNuevoRol] = useState("produccion");
  const [editPassId, setEditPassId] = useState(null);
  const [editPassValor, setEditPassValor] = useState("");
  const [mostrarEditPass, setMostrarEditPass] = useState(false);
  const [editRolId, setEditRolId] = useState(null);
  const [editRolValor, setEditRolValor] = useState("");
  const [passVisibles, setPassVisibles] = useState({});
  const togglePassVisible = (id) => setPassVisibles((p) => ({ ...p, [id]: !p[id] }));

  const rolLabel = (r) => ROLES.find((x) => x.value === r)?.label || r;

  const crear = async () => {
    try {
      await onCrear({ nombre: nuevoNombre, password: nuevoPass, rol: nuevoRol });
      setNuevoNombre(""); setNuevoPass(""); setNuevoRol("produccion");
      setCreando(false);
    } catch (e) {
      alert("No se pudo crear el usuario: " + e.message);
    }
  };

  const guardarPass = async (id) => {
    try {
      await onCambiarPassword(id, editPassValor);
      setEditPassId(null); setEditPassValor("");
      alert("Contraseña actualizada.");
    } catch (e) {
      alert("No se pudo cambiar la contraseña: " + e.message);
    }
  };

  const guardarRol = async (u) => {
    try {
      await onActualizar({ id: u.id, rol: editRolValor });
      setEditRolId(null);
    } catch (e) {
      alert("No se pudo cambiar el rol: " + e.message);
    }
  };

  const toggleActivo = async (u) => {
    if (u.id === actual.id && u.activo) {
      alert("No podés desactivar tu propio usuario.");
      return;
    }
    try { await onActualizar({ id: u.id, activo: !u.activo }); }
    catch (e) { alert("No se pudo actualizar el usuario: " + e.message); }
  };

  const borrar = async (u) => {
    if (u.id === actual.id) { alert("No podés borrar tu propio usuario."); return; }
    if (!confirm(`¿Borrar al usuario "${u.nombre}"? Esta acción no se puede deshacer.`)) return;
    try { await onBorrar(u.id); }
    catch (e) { alert("No se pudo borrar el usuario: " + e.message); }
  };

  return (
    <div className="fade max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <h1 className="text-lg font-semibold flex-1">Usuarios</h1>
        {!creando && (
          <button onClick={() => setCreando(true)}
            className="text-sm font-medium px-3 py-1.5 rounded-md flex items-center gap-1.5"
            style={{ background: C.gold, color: C.onGold }}>
            <Plus size={15} /> Agregar usuario
          </button>
        )}
      </div>

      <p className="text-xs mb-4" style={{ color: C.dim }}>
        Cada usuario tiene un rol que define qué puede hacer en el panel. Los
        roles se pueden ampliar en el futuro; por ahora hay {ROLES.length}.
      </p>

      {creando && (
        <div className="rounded-xl p-4 mb-4 grid sm:grid-cols-2 gap-3" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
          <Field label="Nombre de usuario">
            <Input value={nuevoNombre} onChange={setNuevoNombre} placeholder="username" />
          </Field>
          <Field label="Contraseña">
            <div className="relative">
              <input
                type={mostrarNuevoPass ? "text" : "password"}
                value={nuevoPass}
                onChange={(e) => setNuevoPass(e.target.value)}
                placeholder="mínimo 4 caracteres"
                className="w-full text-sm px-3 py-2 pr-9 rounded-md"
                style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.text, colorScheme: "dark" }}
              />
              <button type="button" onClick={() => setMostrarNuevoPass((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2"
                style={{ color: C.dim }}>
                {mostrarNuevoPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </Field>
          <Field label="Rol" full>
            <select value={nuevoRol} onChange={(e) => setNuevoRol(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-md"
              style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.text, colorScheme: "dark" }}>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value} style={{ background: C.panel2, color: C.text }}>
                  {r.label} — {r.desc}
                </option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2 flex gap-2 justify-end">
            <button onClick={() => { setCreando(false); setNuevoNombre(""); setNuevoPass(""); }}
              className="text-sm px-4 py-2 rounded-md"
              style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.dim }}>
              Cancelar
            </button>
            <button onClick={crear} className="text-sm font-medium px-5 py-2 rounded-md flex items-center gap-1.5"
              style={{ background: C.gold, color: C.onGold }}>
              <Check size={16} /> Crear
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-2">
        {usuarios.map((u) => {
          const yo = u.id === actual.id;
          return (
            <div key={u.id} className="rounded-xl p-3.5"
                 style={{ background: C.panel, border: `1px solid ${C.border}`, opacity: u.activo ? 1 : 0.6 }}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{u.nombre}</span>
                    {yo && <Badge color={C.gold}>Vos</Badge>}
                    {!u.activo && <Badge color={C.dim}>Desactivado</Badge>}
                  </div>
                  {/* Contraseña actual visible para el admin */}
                  <div className="flex items-center gap-1.5 mt-1">
                    <KeyRound size={11} color={C.dim} />
                    <span className="text-[11px]" style={{ color: C.dim }}>Contraseña:</span>
                    {u.passwordVisible ? (
                      <>
                        <span className="text-[11px] font-mono" style={{ color: passVisibles[u.id] ? C.text : C.dim }}>
                          {passVisibles[u.id] ? u.passwordVisible : "●".repeat(u.passwordVisible.length)}
                        </span>
                        <button type="button" onClick={() => togglePassVisible(u.id)} style={{ color: C.dim, lineHeight: 1 }}>
                          {passVisibles[u.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                      </>
                    ) : (
                      <span className="text-[11px] italic" style={{ color: C.dim }}>sin registro (cambiala para guardarla)</span>
                    )}
                  </div>
                  <div className="text-xs mt-1 flex items-center gap-2 flex-wrap" style={{ color: C.dim }}>
                    {editRolId === u.id ? (
                      <>
                        <select value={editRolValor} onChange={(e) => setEditRolValor(e.target.value)}
                          className="text-xs px-2 py-1 rounded"
                          style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.text, colorScheme: "dark" }}>
                          {ROLES.map((r) => (
                            <option key={r.value} value={r.value} style={{ background: C.panel2, color: C.text }}>{r.label}</option>
                          ))}
                        </select>
                        <IconBtn onClick={() => guardarRol(u)} title="Guardar rol"><Check size={14} /></IconBtn>
                        <IconBtn onClick={() => setEditRolId(null)} title="Cancelar"><X size={14} /></IconBtn>
                      </>
                    ) : (
                      <>
                        <Badge color={C.gold}>{rolLabel(u.rol)}</Badge>
                        <span style={{ color: C.dim }}>{ROLES.find((r) => r.value === u.rol)?.desc || ""}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex gap-1 flex-wrap">
                  {editRolId !== u.id && (
                    <button
                      onClick={() => { setEditRolId(u.id); setEditRolValor(u.rol); }}
                      title="Cambiar rol"
                      className="text-xs px-2 py-1.5 rounded-md flex items-center gap-1"
                      style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.dim }}
                    >
                      <UserCog size={12} /> Rol
                    </button>
                  )}
                  <button
                    onClick={() => { setEditPassId(u.id); setEditPassValor(""); }}
                    title="Cambiar contraseña"
                    className="text-xs px-2 py-1.5 rounded-md flex items-center gap-1"
                    style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.dim }}
                  >
                    <KeyRound size={12} /> Contraseña
                  </button>
                  <button
                    onClick={() => toggleActivo(u)}
                    className="text-xs px-2 py-1.5 rounded-md"
                    style={{ background: C.panel2, border: `1px solid ${C.border}`, color: u.activo ? C.dim : C.amber }}
                  >
                    {u.activo ? "Desactivar" : "Activar"}
                  </button>
                  <IconBtn onClick={() => borrar(u)} title="Borrar usuario" danger><Trash2 size={14} /></IconBtn>
                </div>
              </div>

              {editPassId === u.id && (
                <div className="flex gap-2 mt-3 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
                  <div className="relative flex-1">
                    <input
                      type={mostrarEditPass ? "text" : "password"}
                      value={editPassValor}
                      onChange={(e) => setEditPassValor(e.target.value)}
                      placeholder="Nueva contraseña (mínimo 4 caracteres)"
                      className="w-full text-sm px-3 py-2 pr-9 rounded-md"
                      style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.text, colorScheme: "dark" }}
                    />
                    <button type="button" onClick={() => setMostrarEditPass((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2"
                      style={{ color: C.dim }}>
                      {mostrarEditPass ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <button onClick={() => guardarPass(u.id)}
                    className="text-sm font-medium px-3 py-2 rounded-md flex items-center gap-1.5"
                    style={{ background: C.gold, color: C.onGold }}>
                    <Check size={14} /> Guardar
                  </button>
                  <IconBtn onClick={() => { setEditPassId(null); setEditPassValor(""); setMostrarEditPass(false); }} title="Cancelar"><X size={14} /></IconBtn>
                </div>
              )}
            </div>
          );
        })}
        {usuarios.length === 0 && (
          <div className="rounded-xl text-center py-10 px-4" style={{ background: C.panel, border: `1px dashed ${C.border}` }}>
            <p className="text-sm" style={{ color: C.dim }}>No hay usuarios cargados todavía.</p>
          </div>
        )}
      </div>
    </div>
  );
}
