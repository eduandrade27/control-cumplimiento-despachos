create table if not exists despachos.catalogo_causas_compartido (
  catalog_key text primary key,
  summary jsonb not null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table despachos.catalogo_causas_compartido enable row level security;

create policy if not exists catalogo_causas_compartido_select_authenticated
on despachos.catalogo_causas_compartido
for select
to authenticated
using (true);

create policy if not exists catalogo_causas_compartido_write_admin
on despachos.catalogo_causas_compartido
for all
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

insert into despachos.catalogo_causas_compartido (catalog_key, summary)
values ('default', '{"foundSheet":false,"sheetName":"Causas","validRows":0,"causesWithSi":0,"causesWithNo":0,"causesWithEmptyOrInvalid":0,"missingRequiredHeaders":[],"missingOptionalHeaders":[],"message":"","headerRowIndex":null,"rows":[]}'::jsonb)
on conflict (catalog_key) do nothing;
