/**
 * Metadata queries used by the viewer UI.
 * All queries are pure SELECTs against pg_catalog / information_schema,
 * compatible with PostgreSQL 9.4+ (uses pg_catalog for reliability).
 */

export function listDatabasesSql() {
  return `
    SELECT d.datname AS name,
           pg_encoding_to_char(d.encoding) AS encoding,
           d.datcollate AS collation,
           obj_description(d.oid, 'pg_database') AS comment,
           pg_catalog.pg_get_userbyid(d.datdba) AS owner
    FROM pg_catalog.pg_database d
    WHERE d.datallowconn
      AND d.datname NOT IN ('template1')
    ORDER BY d.datname`;
}

export function listSchemasSql() {
  return `
    SELECT n.nspname AS name,
           pg_catalog.pg_get_userbyid(n.nspowner) AS owner,
           obj_description(n.oid, 'pg_namespace') AS comment
    FROM pg_catalog.pg_namespace n
    WHERE n.nspname NOT LIKE 'pg_%'
      AND n.nspname <> 'information_schema'
    ORDER BY n.nspname`;
}

const RELKIND_MAP = `
  CASE c.relkind
    WHEN 'r' THEN 'table'
    WHEN 'p' THEN 'partitioned table'
    WHEN 'm' THEN 'materialized view'
    WHEN 'v' THEN 'view'
    WHEN 'f' THEN 'foreign table'
    ELSE c.relkind::text
  END`;

export function listTablesSql(schema) {
  return `
    SELECT n.nspname AS schema,
           c.relname AS name,
           ${RELKIND_MAP} AS type,
           pg_catalog.pg_get_userbyid(c.relowner) AS owner,
           obj_description(c.oid, 'pg_class') AS comment,
           COALESCE(s.n_live_tup, 0)::bigint AS estimated_rows,
           pg_total_relation_size(c.oid) AS total_bytes
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_catalog.pg_stat_user_tables s ON s.relid = c.oid
    WHERE c.relkind IN ('r','p','m','v','f')
      AND n.nspname = $1
    ORDER BY n.nspname, c.relname`;
}

export function tableColumnsSql(schema, table) {
  return `
    SELECT a.attnum::int AS position,
           a.attname AS name,
           format_type(a.atttypid, a.atttypmod) AS data_type,
           NOT a.attnotnull AS nullable,
           COALESCE(pg_get_expr(ad.adbin, ad.adrelid), '') AS default_value,
           col_description(a.attrelid, a.attnum) AS comment,
           a.attidentity <> '' AS is_identity,
           a.attgenerated <> '' AS is_generated,
           bool_or(i.indisprimary) AS is_primary_key
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_catalog.pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
    LEFT JOIN pg_catalog.pg_index i ON i.indrelid = c.oid AND a.attnum = ANY(i.indkey)
    WHERE n.nspname = $1 AND c.relname = $2
      AND a.attnum > 0 AND NOT a.attisdropped
    GROUP BY a.attnum, a.attname, a.atttypid, a.atttypmod, a.attnotnull,
             ad.adbin, ad.adrelid, a.attrelid, a.attidentity, a.attgenerated
    ORDER BY a.attnum`;
}

export function tableConstraintsSql(schema, table) {
  return `
    SELECT con.conname AS name,
           CASE con.contype
             WHEN 'p' THEN 'PRIMARY KEY'
             WHEN 'f' THEN 'FOREIGN KEY'
             WHEN 'u' THEN 'UNIQUE'
             WHEN 'c' THEN 'CHECK'
             WHEN 't' THEN 'TRIGGER'
             WHEN 'x' THEN 'EXCLUSION'
             ELSE con.contype::text
           END AS type,
           pg_get_constraintdef(con.oid) AS definition,
           conf.nspname AS foreign_schema,
           confc.relname AS foreign_table,
           con.convalidated AS validated
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_catalog.pg_class confc ON confc.oid = con.confrelid
    LEFT JOIN pg_catalog.pg_namespace conf ON conf.oid = confc.relnamespace
    WHERE n.nspname = $1 AND c.relname = $2
    ORDER BY con.conname`;
}

export function tableIndexesSql(schema, table) {
  return `
    SELECT i.indexname AS name,
           i.indisunique AS is_unique,
           i.indisprimary AS is_primary,
           max(i.indexdef) AS definition
    FROM pg_catalog.pg_indexes i
    WHERE i.schemaname = $1 AND i.tablename = $2
    GROUP BY i.indexname, i.indisunique, i.indisprimary
    ORDER BY i.indexname`;
}

export function viewsSql(schema) {
  return `
    SELECT table_name AS name,
           coalesce(view_definition,'') AS definition
    FROM information_schema.views
    WHERE table_schema = $1
    ORDER BY table_name`;
}

export function functionsSql(schema) {
  return `
    SELECT p.proname AS name,
           pg_get_function_arguments(p.oid) AS arguments,
           pg_get_function_result(p.oid) AS return_type,
           CASE p.prokind WHEN 'f' THEN 'function' WHEN 'p' THEN 'procedure' WHEN 'a' THEN 'aggregate' WHEN 'w' THEN 'window' ELSE p.prokind::text END AS kind,
           l.lanname AS language,
           pg_get_functiondef(p.oid) AS definition
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_catalog.pg_language l ON l.oid = p.prolang
    WHERE n.nspname = $1
    ORDER BY p.proname`;
}

export function triggersSql(schema, table) {
  return `
    SELECT tg.tgname AS name,
           cl.relname AS table_name,
           pp.proname AS function_name,
           pg_get_triggerdef(tg.oid) AS definition
    FROM pg_catalog.pg_trigger tg
    JOIN pg_catalog.pg_class cl ON cl.oid = tg.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
    JOIN pg_catalog.pg_proc pp ON pp.oid = tg.tgfoid
    WHERE n.nspname = $1 AND cl.relname = $2 AND NOT tg.tgisinternal
    ORDER BY tg.tgname`;
}

export function tableSizesSql(schema) {
  return `
    SELECT c.relname AS name,
           pg_total_relation_size(c.oid) AS total_bytes,
           pg_relation_size(c.oid) AS table_bytes,
           pg_indexes_size(c.oid) AS index_bytes
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = $1 AND c.relkind IN ('r','p','m')
    ORDER BY pg_total_relation_size(c.oid) DESC`;
}

export function serverStatsSql() {
  return `
    SELECT (SELECT setting::bigint FROM pg_settings WHERE name='max_connections') AS max_connections,
           count(*) FILTER (WHERE state <> 'idle') AS active_connections,
           count(*) AS total_connections,
           pg_size_pretty(pg_database_size(current_database())) AS database_size,
           version() AS version
    FROM pg_stat_activity`;
}

export function recentStatsSql(schema) {
  return `
    SELECT relname AS name,
           (seq_scan + idx_scan)::bigint AS scans,
           n_tup_ins::bigint AS inserts,
           n_tup_upd::bigint AS updates,
           n_tup_del::bigint AS deletes,
           last_vacuum, last_autovacuum, last_analyze, last_autoanalyze
    FROM pg_catalog.pg_stat_user_tables
    WHERE schemaname = $1
    ORDER BY seq_scan + idx_scan DESC NULLS LAST
    LIMIT 50`;
}

/**
 * Build a paginated SELECT for browsing table data.
 */
export function buildBrowseQuery({ schema, table, columns = '*', orderBy, orderDir = 'asc', page = 0, pageSize = 100, where }) {
  const cols =
    columns === '*' || !Array.isArray(columns) || columns.length === 0
      ? '*'
      : columns.map((c) => quoteIdent(c)).join(', ');
  let sql = `SELECT ${cols} FROM ${quoteIdent(schema)}.${quoteIdent(table)}`;
  if (where && String(where).trim()) {
    sql += ` WHERE ${String(where).trim()}`;
  }
  if (orderBy && /^[A-Za-z_][A-Za-z0-9_$]*$/.test(orderBy)) {
    sql += ` ORDER BY ${quoteIdent(orderBy)} ${orderDir === 'desc' ? 'DESC' : 'ASC'}`;
  }
  const size = Math.max(1, Math.min(Number(pageSize) || 100, 1000));
  const p = Math.max(0, Number(page) || 0);
  sql += ` LIMIT ${size} OFFSET ${p * size}`;
  return sql;
}

export function buildCountQuery({ schema, table, where }) {
  let sql = `SELECT count(*)::bigint AS total FROM ${quoteIdent(schema)}.${quoteIdent(table)}`;
  if (where && String(where).trim()) sql += ` WHERE ${String(where).trim()}`;
  return sql;
}

/** Generate a CREATE TABLE DDL approximation from catalog info. */
export async function generateCreateTable(pool, schema, table) {
  const cols = await pool.query(tableColumnsSql(schema, table), [schema, table]);
  const cons = await pool.query(tableConstraintsSql(schema, table), [schema, table]);
  const lines = cols.rows.map((c) => {
    let def = `    ${quoteIdent(c.name)} ${c.data_type}`;
    if (!c.nullable) def += ' NOT NULL';
    if (c.default_value) def += ` DEFAULT ${c.default_value}`;
    return def;
  });
  for (const k of cons.rows) {
    lines.push(`    CONSTRAINT ${quoteIdent(k.name)} ${k.definition}`);
  }
  return `CREATE TABLE ${quoteIdent(schema)}.${quoteIdent(table)} (\n${lines.join(',\n')}\n);`;
}

export function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}
