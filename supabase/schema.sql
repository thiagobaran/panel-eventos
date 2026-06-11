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

  integrantes jsonb not null default '[]'::jsonb, -- [{nombre, rol}, ...]
  director jsonb not null default '{}'::jsonb,    -- {nombre, contacto}

  razon_social text,
  empresa text,
  moneda text default 'ARS',
  importe numeric,
  cant_facturas integer,
  medio_pago text,
  forma_pago text,
  facturas_links text,

  facturado boolean not null default false,
  comprobante_pago boolean not null default false,
  facturado_total boolean not null default false,

  observaciones text
);

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
