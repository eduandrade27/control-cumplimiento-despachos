do $$
begin
  if exists (
    select 1
    from pg_views
    where schemaname = 'despachos'
      and viewname = 'vw_pedidos'
  ) and not exists (
    select 1
    from pg_views
    where schemaname = 'despachos'
      and viewname = 'vw_pedidos_base'
  ) then
    execute 'alter view despachos.vw_pedidos rename to vw_pedidos_base';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_views
    where schemaname = 'despachos'
      and viewname = 'vw_pedido_causa'
  ) and not exists (
    select 1
    from pg_views
    where schemaname = 'despachos'
      and viewname = 'vw_pedido_causa_base'
  ) then
    execute 'alter view despachos.vw_pedido_causa rename to vw_pedido_causa_base';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_views
    where schemaname = 'despachos'
      and viewname = 'vw_pedido_area'
  ) and not exists (
    select 1
    from pg_views
    where schemaname = 'despachos'
      and viewname = 'vw_pedido_area_base'
  ) then
    execute 'alter view despachos.vw_pedido_area rename to vw_pedido_area_base';
  end if;
end
$$;

create or replace view despachos.vw_pedidos as
select
  base.*,
  exists (
    select 1
    from despachos.lineas_despacho line
    where line.fecha::text = base.fecha::text
      and coalesce(nullif(btrim(line.orden_venta), ''), '') = coalesce(nullif(btrim(base.orden_venta::text), ''), '')
      and line.cant_despachada is not null
  ) as has_guia
from despachos.vw_pedidos_base base;

create or replace view despachos.vw_pedido_causa as
select
  base.*,
  exists (
    select 1
    from despachos.lineas_despacho line
    where line.fecha::text = base.fecha::text
      and coalesce(nullif(btrim(line.orden_venta), ''), '') = coalesce(nullif(btrim(base.orden_venta::text), ''), '')
      and line.cant_despachada is not null
  ) as has_guia
from despachos.vw_pedido_causa_base base;

create or replace view despachos.vw_pedido_area as
select
  base.*,
  exists (
    select 1
    from despachos.lineas_despacho line
    where line.fecha::text = base.fecha::text
      and coalesce(nullif(btrim(line.orden_venta), ''), '') = coalesce(nullif(btrim(base.orden_venta::text), ''), '')
      and line.cant_despachada is not null
  ) as has_guia
from despachos.vw_pedido_area_base base;

grant select on despachos.vw_pedidos to anon, authenticated;
grant select on despachos.vw_pedido_causa to anon, authenticated;
grant select on despachos.vw_pedido_area to anon, authenticated;