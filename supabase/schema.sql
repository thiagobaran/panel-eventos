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
