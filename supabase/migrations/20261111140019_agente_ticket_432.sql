-- Cambios de estructura aplicados por el Agente IA (ticket #432, pronim-erp). Ya están en la base.

-- Permitir origen 'devolucion' en créditos de clientes
alter table pronimerp.cliente_creditos_movimientos drop constraint cliente_creditos_movimientos_origen_check, add constraint cliente_creditos_movimientos_origen_check check (origen in ('recepcion','venta','ajuste_manual','nota_credito','descuento_promo','cashback','consignacion','devolucion'));

-- Cabecera de devoluciones de prendas vendidas
create table if not exists pronimerp.ventas_devoluciones (id uuid primary key default gen_random_uuid(), empresa_id uuid not null, cliente_id uuid not null, venta_original_id uuid not null, sucursal_id uuid not null, venta_nueva_id uuid, total numeric not null default 0, credito_movimiento_id uuid, requiere_nota_credito boolean not null default false, observaciones text, created_by uuid, usuario_nombre text, created_at timestamptz not null default now());
grant INSERT, SELECT, UPDATE, DELETE on "pronimerp".ventas_devoluciones to authenticated;
grant TRUNCATE, INSERT, TRIGGER, REFERENCES, SELECT, UPDATE, DELETE on "pronimerp".ventas_devoluciones to service_role;
alter table "pronimerp".ventas_devoluciones enable row level security;
create policy ventas_devoluciones_delete_1 on "pronimerp".ventas_devoluciones for delete to public using (pronimerp.puede_acceder_empresa(empresa_id));
create policy ventas_devoluciones_insert_2 on "pronimerp".ventas_devoluciones for insert to public with check (pronimerp.puede_acceder_empresa(empresa_id));
create policy ventas_devoluciones_select_3 on "pronimerp".ventas_devoluciones for select to public using (pronimerp.puede_acceder_empresa(empresa_id));
create policy ventas_devoluciones_update_4 on "pronimerp".ventas_devoluciones for update to public using (pronimerp.puede_acceder_empresa(empresa_id)) with check (pronimerp.puede_acceder_empresa(empresa_id));

-- Prendas devueltas por devolución
create table if not exists pronimerp.ventas_devoluciones_items (id uuid primary key default gen_random_uuid(), empresa_id uuid not null, devolucion_id uuid not null, venta_item_id uuid not null, venta_original_id uuid not null, producto_id uuid not null, cantidad numeric not null, precio_venta numeric not null, total numeric not null, created_at timestamptz not null default now());
grant INSERT, SELECT, UPDATE, DELETE on "pronimerp".ventas_devoluciones_items to authenticated;
grant TRUNCATE, INSERT, TRIGGER, REFERENCES, SELECT, UPDATE, DELETE on "pronimerp".ventas_devoluciones_items to service_role;
alter table "pronimerp".ventas_devoluciones_items enable row level security;
create policy ventas_devoluciones_items_delete_1 on "pronimerp".ventas_devoluciones_items for delete to public using (pronimerp.puede_acceder_empresa(empresa_id));
create policy ventas_devoluciones_items_insert_2 on "pronimerp".ventas_devoluciones_items for insert to public with check (pronimerp.puede_acceder_empresa(empresa_id));
create policy ventas_devoluciones_items_select_3 on "pronimerp".ventas_devoluciones_items for select to public using (pronimerp.puede_acceder_empresa(empresa_id));
create policy ventas_devoluciones_items_update_4 on "pronimerp".ventas_devoluciones_items for update to public using (pronimerp.puede_acceder_empresa(empresa_id)) with check (pronimerp.puede_acceder_empresa(empresa_id));
