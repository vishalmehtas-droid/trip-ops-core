-- Read-only. Follow-up to export_schema.sql, which only covered the public schema.
-- Lists the "app" schema (permission checks, guards, audit and pricing functions)
-- and any other custom schema, as SQL text, one statement per row.
-- Append the "ddl" column of every row, in order, to supabase/schema_snapshot.sql.
-- Sections: 0 custom schemas, 2 enums, 3 sequences, 4 tables, 8 views,
-- 9 functions, 10 triggers on non-public tables that call app functions.
with
custom as (
  select n.oid, n.nspname from pg_namespace n
  where n.nspname not in ('public', 'auth', 'storage', 'extensions', 'graphql', 'graphql_public',
      'realtime', '_realtime', 'vault', 'pgbouncer', 'pgsodium', 'pgsodium_masks', 'net',
      'supabase_functions', 'supabase_migrations', 'cron', 'information_schema', '_analytics')
    and n.nspname not like 'pg\_%'
),
stmts(section, object, ddl) as (
  select 0, c.nspname::text, format('CREATE SCHEMA IF NOT EXISTS %I;', c.nspname)
  from custom c

  union all
  select 2, c.nspname || '.' || t.typname,
    format('CREATE TYPE %I.%I AS ENUM (%s);', c.nspname, t.typname,
      (select string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder)
       from pg_enum e where e.enumtypid = t.oid))
  from pg_type t join custom c on c.oid = t.typnamespace
  where t.typtype = 'e'

  union all
  select 3, s.schemaname || '.' || s.sequencename,
    format('CREATE SEQUENCE IF NOT EXISTS %I.%I START %s INCREMENT %s; -- last_value: %s',
      s.schemaname, s.sequencename, s.start_value, s.increment_by, coalesce(s.last_value::text, 'unused'))
  from pg_sequences s join custom c on c.nspname = s.schemaname

  union all
  select 4, c.nspname || '.' || r.relname,
    format(E'CREATE TABLE %I.%I (\n%s\n);', c.nspname, r.relname,
      (select string_agg(format('  %I %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
          case when d.adbin is not null then ' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid) else '' end,
          case when a.attnotnull then ' NOT NULL' else '' end), E',\n' order by a.attnum)
       from pg_attribute a
       left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
       where a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped))
  from pg_class r join custom c on c.oid = r.relnamespace
  where r.relkind in ('r', 'p')

  union all
  select 8, c.nspname || '.' || v.relname,
    format(E'CREATE OR REPLACE VIEW %I.%I AS\n%s', c.nspname, v.relname, pg_get_viewdef(v.oid, true))
  from pg_class v join custom c on c.oid = v.relnamespace
  where v.relkind = 'v'

  union all
  select 9, c.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
    pg_get_functiondef(p.oid) || ';'
  from pg_proc p join custom c on c.oid = p.pronamespace
  where p.prokind in ('f', 'p')
    and not exists (select 1 from pg_depend dep where dep.objid = p.oid and dep.deptype = 'e')

  union all
  select 10, tn.nspname || '.' || r.relname || '.' || tg.tgname,
    pg_get_triggerdef(tg.oid, true) || ';'
  from pg_trigger tg
  join pg_class r on r.oid = tg.tgrelid
  join pg_namespace tn on tn.oid = r.relnamespace
  join pg_proc p on p.oid = tg.tgfoid
  join custom c on c.oid = p.pronamespace
  where not tg.tgisinternal and tn.nspname <> 'public'
)
select section, object, ddl from stmts order by section, object;
