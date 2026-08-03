-- Panel de Eventos - esquema de base de datos para Supabase
-- Ejecutar este script completo en: Supabase > SQL Editor > New query > Run

create table if not exists public.eventos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  fecha date,
  nombre text not null default '',
  categoria text,           -- Videoclip, Publicidad, Película, Serie
  estudio text,              -- 1, 2, 3
  tipo_prod text,            -- Virtual Production, Back Projecting
  trackeo text,              -- Con trackeo, Sin trackeo

  equipamiento boolean not null default false,
  equipamiento_detalle text,

  integrantes jsonb not null default '[]'::jsonb, -- [{personaId, nombre, rol}, ...]
  director jsonb not null default '{}'::jsonb,    -- {nombre, telefono, email}

  razon_social text,
  empresa text,
  moneda text default 'ARS',
  importe numeric,
  cant_facturas integer,
  medio_pago text,
  forma_pago text,
  facturas_links text,

  -- Distribución entre razones sociales (M1 = con IVA, M2 = efectivo sin IVA)
  distribucion text default 'M1',          -- 'M1' | 'M2' | 'MIXTO'
  monto_m1 numeric,                        -- neto facturado por M1 (se le suma 21% IVA)
  monto_m2 numeric,                        -- efectivo cobrado por M2 (sin IVA)

  -- Archivos cargados después de creado el evento
  facturas jsonb not null default '[]'::jsonb,    -- [{id, name, path, size, uploadedAt}]
  comprobantes jsonb not null default '[]'::jsonb,

  -- Equipo técnico externo (de otra productora): [{nombre, rol}]
  equipo_externo jsonb not null default '[]'::jsonb,

  facturado boolean not null default false,
  comprobante_pago boolean not null default false,
  facturado_total boolean not null default false,

  observaciones text
);

-- Columnas agregadas en versiones posteriores: se aplican aunque la tabla ya exista.
alter table public.eventos add column if not exists distribucion text default 'M1';
alter table public.eventos add column if not exists monto_m1 numeric;
alter table public.eventos add column if not exists monto_m2 numeric;
alter table public.eventos add column if not exists facturas jsonb not null default '[]'::jsonb;
alter table public.eventos add column if not exists comprobantes jsonb not null default '[]'::jsonb;
alter table public.eventos add column if not exists equipo_externo jsonb not null default '[]'::jsonb;
alter table public.eventos add column if not exists partes jsonb not null default '[]'::jsonb;

-- Observaciones/mensajes internos del equipo por evento
alter table public.eventos add column if not exists mensajes jsonb not null default '[]'::jsonb;

-- Nuevos campos: modalidad de rodaje, desglose por factura, tipo de cambio USD→ARS
alter table public.eventos add column if not exists modalidad_rodaje text;
alter table public.eventos add column if not exists facturas_desglose jsonb not null default '[]'::jsonb;
alter table public.eventos add column if not exists tipo_cambio numeric;

-- Workflow borrador → confirmado → facturado
alter table public.eventos add column if not exists confirmado boolean not null default false;
alter table public.eventos add column if not exists confirmado_at timestamptz;
alter table public.eventos add column if not exists facturado_at timestamptz;
alter table public.eventos add column if not exists comprobante_pago_at timestamptz;

-- Mantiene "updated_at" al día en cada modificación
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_eventos_updated_at on public.eventos;
create trigger trg_eventos_updated_at
  before update on public.eventos
  for each row execute function public.set_updated_at();

-- Habilita Row Level Security
alter table public.eventos enable row level security;

-- Política simple: cualquiera con la API key (anon) puede leer y escribir.
-- Pensado para uso interno de la empresa (la URL no se comparte públicamente).
-- Si más adelante se agrega login de usuarios, conviene reemplazar esto por
-- políticas basadas en auth.uid().
drop policy if exists "Acceso interno completo" on public.eventos;
create policy "Acceso interno completo"
  on public.eventos
  for all
  using (true)
  with check (true);

-- Habilita Realtime para que los cambios se reflejen en todas las pantallas
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'eventos'
  ) then
    alter publication supabase_realtime add table public.eventos;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Personal (listado maestro de integrantes de la productora)
-- ---------------------------------------------------------------------

-- Categorías del personal (ej: Cámara, Iluminación, Producción, Arte…)
-- Se gestionan desde la app y se asignan a cada persona del listado.
create table if not exists public.personas_categorias (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nombre text not null
);

alter table public.personas_categorias enable row level security;

drop policy if exists "Acceso interno completo" on public.personas_categorias;
create policy "Acceso interno completo"
  on public.personas_categorias
  for all
  using (true)
  with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'personas_categorias'
  ) then
    alter publication supabase_realtime add table public.personas_categorias;
  end if;
end $$;

create table if not exists public.personas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  nombre text not null default '',
  rol_habitual text,
  telefono text,
  email text,
  activo boolean not null default true
);

-- Categorías asignadas a cada persona (puede tener varias, separadas por coma).
-- Tipo TEXT para soportar múltiples IDs: "uuid1,uuid2".
-- Migración desde UUID: ALTER TABLE personas DROP CONSTRAINT IF EXISTS personas_categoria_id_fkey;
--                       ALTER TABLE personas ALTER COLUMN categoria_id TYPE TEXT;
alter table public.personas
  add column if not exists categoria_id text;
-- Si la columna ya existe como UUID, ejecutar manualmente:
-- ALTER TABLE personas DROP CONSTRAINT IF EXISTS personas_categoria_id_fkey;
-- ALTER TABLE personas ALTER COLUMN categoria_id TYPE TEXT;

alter table public.personas enable row level security;

drop policy if exists "Acceso interno completo" on public.personas;
create policy "Acceso interno completo"
  on public.personas
  for all
  using (true)
  with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'personas'
  ) then
    alter publication supabase_realtime add table public.personas;
  end if;
end $$;

-- Sectores del personal (área de la empresa: Cacodelphia, LED, Cine…), un
-- nivel arriba de categoría. Cada persona pertenece a un solo sector, pero
-- puede tener cualquier categoría dentro de ese sector (ej: cámara y unreal
-- son categorías distintas, ambas del sector Cacodelphia). Se siembra con
-- "Cacodelphia", "LED" y "Cine" la primera vez que se abre Personal.
create table if not exists public.personas_sectores (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nombre text not null
);
alter table public.personas_sectores enable row level security;
drop policy if exists "Acceso interno completo" on public.personas_sectores;
create policy "Acceso interno completo"
  on public.personas_sectores
  for all
  using (true)
  with check (true);
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'personas_sectores'
  ) then
    alter publication supabase_realtime add table public.personas_sectores;
  end if;
end $$;

alter table public.personas add column if not exists sector_id text;

-- ---------------------------------------------------------------------
-- Asistencia del personal (presente / ausente / franco / medio día / vacaciones / feriado / ART por día)
-- ---------------------------------------------------------------------
create table if not exists public.asistencias (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  persona_id uuid not null references public.personas(id) on delete cascade,
  fecha date not null,
  estado text not null default 'presente', -- presente | ausente | franco | mediodia | vacaciones | feriado | art
  observacion text,
  unique (persona_id, fecha)
);
alter table public.asistencias enable row level security;
drop policy if exists "Acceso interno completo" on public.asistencias;
create policy "Acceso interno completo"
  on public.asistencias
  for all
  using (true)
  with check (true);
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'asistencias'
  ) then
    alter publication supabase_realtime add table public.asistencias;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Clientes (productoras que contratan a la empresa)
-- ---------------------------------------------------------------------
-- Cada evento puede asociarse a un cliente. Al elegirlo en el evento se
-- autocompletan razón social, CUIT, dirección y equipo externo por defecto.
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  razon_social text not null default '',
  cuit text,
  telefono text,
  email text,
  domicilio text,
  director jsonb not null default '{}'::jsonb,        -- {nombre, telefono, email}
  equipo_externo jsonb not null default '[]'::jsonb,  -- [{nombre, rol}]
  contactos jsonb not null default '[]'::jsonb,       -- [{nombre, email}]
  notas text,
  activo boolean not null default true
);

-- Columna agregada después: emails/contactos de reclamo del cliente
alter table public.clientes add column if not exists contactos jsonb not null default '[]'::jsonb;

alter table public.clientes enable row level security;

drop policy if exists "Acceso interno completo" on public.clientes;
create policy "Acceso interno completo"
  on public.clientes
  for all
  using (true)
  with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'clientes'
  ) then
    alter publication supabase_realtime add table public.clientes;
  end if;
end $$;

-- Vínculo del evento con el cliente + CUIT snapshot
alter table public.eventos add column if not exists cliente_id text;
alter table public.eventos add column if not exists cuit text;

-- Registro de pagos/cobros del evento: [{id, fecha, monto, medio, nota}]
alter table public.eventos add column if not exists pagos jsonb not null default '[]'::jsonb;

-- Cronograma de cuotas de pago/facturación: [{id, label, dias, fecha, monto}]
-- "dias" = offset en días desde la fecha del evento; "fecha" = fecha fija (uno u otro).
alter table public.eventos add column if not exists cuotas_pago jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------
-- Usuarios (login + roles)
-- ---------------------------------------------------------------------
-- Tabla simple de usuarios para login interno. Las contraseñas se guardan
-- como SHA-256 hex con salt por usuario (calculado en el cliente).
-- Roles iniciales: 'admin', 'contabilidad', 'produccion'. Se pueden
-- agregar nuevos roles desde el panel de Usuarios.
create table if not exists public.usuarios (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nombre text not null unique,
  password_hash text not null,
  password_salt text not null,
  rol text not null default 'produccion',
  activo boolean not null default true
);

-- Contraseña visible para administradores (se guarda junto con el hash)
alter table public.usuarios add column if not exists password_visible text not null default '';

alter table public.usuarios enable row level security;

drop policy if exists "Acceso interno completo" on public.usuarios;
create policy "Acceso interno completo"
  on public.usuarios
  for all
  using (true)
  with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'usuarios'
  ) then
    alter publication supabase_realtime add table public.usuarios;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- LED: catálogo de módulos de pantalla y equipos de video (venta/alquiler)
-- ---------------------------------------------------------------------
-- Módulos de pantalla LED: pitch, medidas físicas y resolución de cada
-- módulo. Se siembra automáticamente desde la app (seedLedModulosIniciales)
-- con el catálogo provisto en Excel la primera vez que se abre el módulo.
create table if not exists public.led_modulos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  codigo text unique,
  nombre text not null,
  pitch numeric,
  ancho_mm numeric,
  alto_mm numeric,
  pitch_ancho_px numeric,
  pitch_alto_px numeric,
  ancho_1m_px numeric,
  alto_1m_px numeric,
  carpeta text,
  tipo_equipo text,
  activo boolean not null default true
);
alter table public.led_modulos enable row level security;
drop policy if exists "Acceso interno completo" on public.led_modulos;
create policy "Acceso interno completo"
  on public.led_modulos
  for all
  using (true)
  with check (true);
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'led_modulos'
  ) then
    alter publication supabase_realtime add table public.led_modulos;
  end if;
end $$;

-- Equipos de video: senders, escaladores, media servers y procesadores.
-- Igual que arriba, se siembra automáticamente desde la app.
create table if not exists public.led_equipos_video (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  codigo text unique,
  nombre text not null,
  carpeta text,
  tipo_equipo text,
  puertos_ethernet numeric,
  puertos_fibra numeric,
  capacidad_max_pixeles numeric,
  resolucion text,
  maximo_alto_ancho text,
  input_hdmi numeric,
  input_displayport numeric,
  input_dvi numeric,
  input_sdi numeric,
  contenido_interno boolean not null default false,
  observaciones text,
  activo boolean not null default true
);
alter table public.led_equipos_video enable row level security;
drop policy if exists "Acceso interno completo" on public.led_equipos_video;
create policy "Acceso interno completo"
  on public.led_equipos_video
  for all
  using (true)
  with check (true);
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'led_equipos_video'
  ) then
    alter publication supabase_realtime add table public.led_equipos_video;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- LED: clientes y eventos/trabajos (instalación fija o alquiler), en
-- paralelo a "clientes"/"eventos" de Estudios pero con su propio negocio.
-- ---------------------------------------------------------------------
create table if not exists public.clientes_led (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  razon_social text not null default '',
  cuit text,
  telefono text,
  email text,
  domicilio text,
  director jsonb not null default '{}'::jsonb,
  contactos jsonb not null default '[]'::jsonb,
  notas text,
  activo boolean not null default true
);
alter table public.clientes_led enable row level security;
drop policy if exists "Acceso interno completo" on public.clientes_led;
create policy "Acceso interno completo"
  on public.clientes_led
  for all
  using (true)
  with check (true);
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'clientes_led'
  ) then
    alter publication supabase_realtime add table public.clientes_led;
  end if;
end $$;

create table if not exists public.eventos_led (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  fecha date,
  nombre text not null default '',

  -- Instalación fija o alquiler/evento temporal; interior o exterior;
  -- tamaño de pantalla deseado — insumos para sugerir módulo + reproductor.
  tipo_instalacion text,           -- 'fija' | 'temporal'
  ubicacion text,                  -- 'indoor' | 'outdoor'
  ancho_pantalla_m numeric,
  alto_pantalla_m numeric,

  -- Partes: Armado y Desarme son fechas puntuales (como Estudios); Servicio
  -- es un período continuo (fecha_inicio -> fecha_fin), no días sueltos.
  armado_fechas jsonb not null default '[]'::jsonb,
  servicio_inicio date,
  servicio_fin date,
  desarme_fechas jsonb not null default '[]'::jsonb,

  -- Personal asignado: [{personaId, nombre, rol, partes: ["Armado","Servicio","Desarme"]}]
  integrantes jsonb not null default '[]'::jsonb,

  cliente_id text,
  razon_social text,
  cuit text,
  empresa text,
  moneda text default 'ARS',
  distribucion text default 'M1',
  monto_m1 numeric,
  monto_m2 numeric,
  cant_facturas integer,
  facturas_desglose jsonb not null default '[]'::jsonb,
  tipo_cambio numeric,
  medio_pago text,
  forma_pago text,
  cuotas_pago jsonb not null default '[]'::jsonb,

  facturas jsonb not null default '[]'::jsonb,
  comprobantes jsonb not null default '[]'::jsonb,
  pagos jsonb not null default '[]'::jsonb,
  mensajes jsonb not null default '[]'::jsonb,

  facturado boolean not null default false,
  comprobante_pago boolean not null default false,
  facturado_total boolean not null default false,
  confirmado boolean not null default false,
  confirmado_at timestamptz,
  facturado_at timestamptz,
  comprobante_pago_at timestamptz,

  observaciones text
);
drop trigger if exists trg_eventos_led_updated_at on public.eventos_led;
create trigger trg_eventos_led_updated_at
  before update on public.eventos_led
  for each row execute function public.set_updated_at();
alter table public.eventos_led enable row level security;
drop policy if exists "Acceso interno completo" on public.eventos_led;
create policy "Acceso interno completo"
  on public.eventos_led
  for all
  using (true)
  with check (true);
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'eventos_led'
  ) then
    alter publication supabase_realtime add table public.eventos_led;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Storage: bucket para facturas y comprobantes de pago de cada evento
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('eventos-archivos', 'eventos-archivos', false)
on conflict (id) do nothing;

-- Política simple, acorde al resto del esquema: cualquier cliente con la
-- API key (anon) puede subir/leer/borrar archivos de este bucket.
-- La URL de la app no es pública. Si más adelante se agrega login, conviene
-- reemplazar esto por políticas basadas en auth.uid().
drop policy if exists "Acceso interno archivos eventos" on storage.objects;
create policy "Acceso interno archivos eventos"
  on storage.objects
  for all
  using (bucket_id = 'eventos-archivos')
  with check (bucket_id = 'eventos-archivos');
