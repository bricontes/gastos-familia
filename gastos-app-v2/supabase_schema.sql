-- ============================================================
-- GASTOS FAMILIA — Script SQL para Supabase
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- ============================================================

-- Tabla de configuración (categorías, etc.)
create table if not exists settings (
  key   text primary key,
  value jsonb not null
);

-- Tabla de transacciones (gastos)
create table if not exists transactions (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  amount      numeric not null,
  category    text not null,
  description text,
  created_at  timestamptz default now()
);

-- Tabla de ingresos
create table if not exists ingresos (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  amount      numeric not null,
  description text,
  created_at  timestamptz default now()
);

-- Tabla de movimientos USD
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

-- Tabla de gastos de obra
create table if not exists obra_movements (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  category    text not null,
  description text,
  pesos       numeric default 0,
  usd         numeric default 0,
  pay_method  text,
  created_at  timestamptz default now()
);

-- ============================================================
-- Políticas de acceso público (sin login requerido)
-- La app no tiene autenticación — acceso libre por URL
-- ============================================================

alter table settings        enable row level security;
alter table transactions    enable row level security;
alter table ingresos        enable row level security;
alter table usd_movements   enable row level security;
alter table obra_movements  enable row level security;

-- Permitir todo a usuarios anónimos (acceso por API key pública)
create policy "public_all" on settings        for all using (true) with check (true);
create policy "public_all" on transactions    for all using (true) with check (true);
create policy "public_all" on ingresos        for all using (true) with check (true);
create policy "public_all" on usd_movements   for all using (true) with check (true);
create policy "public_all" on obra_movements  for all using (true) with check (true);
