-- ============================================================
-- GASTOS FAMILIA — Script SQL para Supabase (v2 — generalizado)
-- Ejecutar en: Supabase → SQL Editor → New query → Run
--
-- IMPORTANTE: este script reemplaza a "mama_movements" y
-- "obra_movements" por un modelo genérico de entidades y
-- proyectos. Como todavía no hay datos cargados en producción,
-- no hace falta migrar nada: simplemente se borran las tablas
-- viejas (si llegaron a crearse) y se crean las nuevas.
-- ============================================================

drop table if exists mama_movements;
drop table if exists obra_movements;

-- Tabla de configuración (categorías, secciones ocultas, etc.)
create table if not exists settings (
  key   text primary key,
  value jsonb not null
);

-- Tabla de transacciones (gastos, incluye categoría "Ajuste de cierre")
create table if not exists transactions (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  amount      numeric not null,
  category    text not null,
  description text,
  created_at  timestamptz default now()
);

-- Tabla de ingresos (incluye ingresos con descripción "Ajuste de cierre")
create table if not exists ingresos (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  amount      numeric not null,
  description text,
  created_at  timestamptz default now()
);

-- Tabla de movimientos USD (caja de dólares)
create table if not exists usd_movements (
  id            uuid primary key default gen_random_uuid(),
  date          date not null,
  usd100        numeric default 0,
  usd_cambio    numeric default 0,
  description   text,
  exchange_rate numeric,
  peso_amount   numeric,
  created_at    timestamptz default now()
);

-- ============================================================
-- ENTIDADES (deudores y acreedores) — genérico, reemplaza a "mamá"
-- ============================================================

-- Una fila por persona/entidad. "type" define la relación:
--   'deudor'   -> la entidad te debe a vos (ej: Marina)
--   'acreedor' -> vos le debés a la entidad (ej: Dani)
create table if not exists entities (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        text not null check (type in ('deudor','acreedor')),
  status      text not null default 'activo' check (status in ('activo','cerrado')),
  created_at  timestamptz default now()
);

-- Movimientos de caja asociados a una entidad.
-- "amount" SIEMPRE representa el flujo de caja real, no la deuda:
--   positivo = entró plata a tu bolsillo (cobraste / te pagaron / te prestaron)
--   negativo = salió plata de tu bolsillo (pagaste / le prestaste más)
-- El saldo de la deuda se calcula en la app según el "type" de la entidad,
-- así los datos crudos siempre reflejan la realidad física del efectivo.
create table if not exists entity_movements (
  id          uuid primary key default gen_random_uuid(),
  entity_id   uuid not null references entities(id) on delete cascade,
  date        date not null,
  amount      numeric not null,
  currency    text not null check (currency in ('ARS','USD')),
  description text,
  created_at  timestamptz default now()
);

-- ============================================================
-- PROYECTOS — genérico, reemplaza a "Obra Libertad"
-- ============================================================

-- Una fila por proyecto/obra. Las categorías de gasto son propias
-- de cada proyecto (igual que antes, pero ya no atado a un nombre fijo).
create table if not exists projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  status      text not null default 'activo' check (status in ('activo','cerrado')),
  categories  jsonb not null default '["Materiales","Mano de obra","Dirección de obra","Mobiliario/equipamiento","Otro"]',
  created_at  timestamptz default now()
);

-- Movimientos de gasto de un proyecto. "amount" siempre positivo
-- (es un costo). Si el gasto original fue en pesos, se guarda
-- normalizado a USD con la cotización usada (exchange_rate) para
-- mantener comparable el costo total del proyecto a través del tiempo.
create table if not exists project_movements (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  date          date not null,
  category      text not null,
  description   text,
  amount        numeric not null,
  currency      text not null check (currency in ('ARS','USD')),
  exchange_rate numeric,
  created_at    timestamptz default now()
);

-- ============================================================
-- Políticas de acceso público (sin login requerido)
-- La app no tiene autenticación — acceso libre por URL
-- ============================================================

alter table settings           enable row level security;
alter table transactions       enable row level security;
alter table ingresos           enable row level security;
alter table usd_movements      enable row level security;
alter table entities           enable row level security;
alter table entity_movements   enable row level security;
alter table projects           enable row level security;
alter table project_movements  enable row level security;

drop policy if exists "public_all" on settings;
drop policy if exists "public_all" on transactions;
drop policy if exists "public_all" on ingresos;
drop policy if exists "public_all" on usd_movements;

create policy "public_all" on settings           for all using (true) with check (true);
create policy "public_all" on transactions       for all using (true) with check (true);
create policy "public_all" on ingresos           for all using (true) with check (true);
create policy "public_all" on usd_movements      for all using (true) with check (true);
create policy "public_all" on entities           for all using (true) with check (true);
create policy "public_all" on entity_movements   for all using (true) with check (true);
create policy "public_all" on projects           for all using (true) with check (true);
create policy "public_all" on project_movements  for all using (true) with check (true);

-- ============================================================
-- Carga inicial: tu primer proyecto (Libertad) como fila real
-- en vez de estar hardcodeado en el código.
-- ============================================================
insert into projects (name, status, categories)
values ('Libertad', 'activo', '["Dirección de obra","Materiales","Mano de obra","Mobiliario/equipamiento","Otro"]')
on conflict do nothing;
