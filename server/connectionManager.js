import pg from 'pg';

/**
 * ConnectionManager
 * Keeps a pool of live PostgreSQL connections keyed by connection id.
 * Connections are defined either by explicit params (host/port/user/...)
 * or by a single postgres:// connection URI.
 */
export class ConnectionManager {
  constructor() {
    /** @type {Map<string, object>} */
    this.connections = new Map();
  }

  static makeId() {
    return `conn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Normalize & validate a connection definition coming from the client.
   */
  static normalizeConfig(def = {}) {
    const cfg = {
      connectionString: def.connectionString?.trim() || undefined,
      host: def.host?.trim() || 'localhost',
      port: Number(def.port) || 5432,
      user: def.user?.trim() || 'postgres',
      password: def.password ?? '',
      database: def.database?.trim() || 'postgres',
      ssl: def.ssl ? { rejectUnauthorized: def.sslRejectUnauthorized !== false } : undefined,
      application_name: 'pg-viewer',
      connectionTimeoutMillis: 10000,
    };
    if (cfg.connectionString) {
      // let pg parse the URI for defaults
      cfg.host = undefined;
      cfg.port = undefined;
      cfg.user = undefined;
      cfg.password = undefined;
      cfg.database = undefined;
    }
    return cfg;
  }

  async connect(def) {
    const config = ConnectionManager.normalizeConfig(def);
    const pool = new pg.Pool({
      ...config,
      max: 5,
      idleTimeoutMillis: 30000,
    });

    // Fail fast with a meaningful error
    const client = await pool.connect();
    try {
      const r = await client.query('select current_database() as db, version() as v, current_schema() as s');
      const label =
        def.label?.trim() ||
        (config.connectionString
          ? redactUri(config.connectionString)
          : `${config.user}@${config.host}:${config.port}/${r.rows[0].db}`);
      const id = def.id && this.connections.has(def.id) ? def.id : ConnectionManager.makeId();

      // If replacing an existing id, close the old pool first
      const prev = this.connections.get(id);
      if (prev) await prev.pool.end().catch(() => {});

      this.connections.set(id, {
        id,
        label,
        pool,
        config: publicConfig(config),
        connectedAt: new Date().toISOString(),
        serverVersion: r.rows[0].v,
        currentDatabase: r.rows[0].db,
        currentSchema: r.rows[0].s,
      });
      return id;
    } finally {
      client.release();
    }
  }

  get(id) {
    const c = this.connections.get(id);
    if (!c) {
      const err = new Error(`Unknown connection id: ${id}`);
      err.status = 404;
      throw err;
    }
    return c;
  }

  list() {
    return [...this.connections.values()].map((c) => ({
      id: c.id,
      label: c.label,
      config: c.config, // never contains secrets
      connectedAt: c.connectedAt,
      serverVersion: c.serverVersion,
      currentDatabase: c.currentDatabase,
      currentSchema: c.currentSchema,
    }));
  }

  async disconnect(id) {
    const c = this.connections.get(id);
    if (!c) return false;
    await c.pool.end().catch(() => {});
    this.connections.delete(id);
    return true;
  }

  async query(id, sql, params = [], rowLimit = 1000) {
    const conn = this.get(id);
    const start = Date.now();
    const res = await conn.pool.query(sql, params);
    const elapsedMs = Date.now() - start;
    const fields = res.fields
      ? res.fields.map((f) => ({ name: f.name, dataTypeId: f.dataTypeID }))
      : Object.keys(res.rows?.[0] ?? {});
    let rows = res.rows ?? [];
    let truncated = false;
    if (rowLimit > 0 && rows.length > rowLimit) {
      rows = rows.slice(0, rowLimit);
      truncated = true;
    }
    return {
      fields,
      rows,
      rowCount: res.rowCount ?? rows.length,
      truncated,
      elapsedMs,
      command: res.command ?? null,
    };
  }

  async closeAll() {
    await Promise.all([...this.connections.values()].map((c) => c.pool.end().catch(() => {})));
    this.connections.clear();
  }
}

function publicConfig(cfg) {
  const { password, ...rest } = cfg;
  const out = { ...rest };
  if (out.connectionString) out.connectionString = redactUri(out.connectionString);
  return out;
}

function redactUri(uri) {
  try {
    return uri.replace(/\/\/([^:@/]+):([^@/]+)@/, '//$1:****@');
  } catch {
    return '****';
  }
}
