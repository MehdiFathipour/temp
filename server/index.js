import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { ConnectionManager } from './connectionManager.js';
import * as md from './metadata.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  const manager = new ConnectionManager();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  // ---- helpers ----------------------------------------------------------
  const wrap = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error(err);
      res.status(status).json({ error: err.message || String(err), code: err.code });
    }
  };

  const runSql = (id, sql, params) => manager.query(id, sql, params, 5000);

  // ---- connections ------------------------------------------------------
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.post('/api/connections', wrap(async (req, res) => {
    try {
      const id = await manager.connect(req.body ?? {});
      res.json({ id, connection: manager.list().find((c) => c.id === id) });
    } catch (err) {
      // node-driver aggregates connection failures into AggregateError with no message
      const detail = err.errors?.map((e) => `${e.code || ''} ${e.message}`.trim()).join('; ') || err.message;
      res.status(500).json({ error: `Connection failed: ${detail || 'unknown error'}`, code: err.code });
    }
  }));

  app.get('/api/connections', wrap(async (_req, res) => res.json(manager.list())));

  app.delete('/api/connections/:id', wrap(async (req, res) => {
    const ok = await manager.disconnect(req.params.id);
    res.json({ disconnected: ok });
  }));

  // ---- metadata ---------------------------------------------------------
  app.get('/api/connections/:id/databases', wrap(async (req, res) => {
    const r = await runSql(req.params.id, md.listDatabasesSql());
    res.json(r.rows);
  }));

  app.get('/api/connections/:id/schemas', wrap(async (req, res) => {
    const r = await runSql(req.params.id, md.listSchemasSql());
    res.json(r.rows);
  }));

  app.get('/api/connections/:id/schemas/:schema/tables', wrap(async (req, res) => {
    const r = await runSql(req.params.id, md.listTablesSql(req.params.schema), [req.params.schema]);
    res.json(r.rows);
  }));

  app.get('/api/connections/:id/schemas/:schema/views', wrap(async (req, res) => {
    const r = await runSql(req.params.id, md.viewsSql(req.params.schema), [req.params.schema]);
    res.json(r.rows);
  }));

  app.get('/api/connections/:id/schemas/:schema/functions', wrap(async (req, res) => {
    const r = await runSql(req.params.id, md.functionsSql(req.params.schema), [req.params.schema]);
    res.json(r.rows);
  }));

  app.get('/api/connections/:id/schemas/:schema/sizes', wrap(async (req, res) => {
    const r = await runSql(req.params.id, md.tableSizesSql(req.params.schema), [req.params.schema]);
    res.json(r.rows);
  }));

  app.get('/api/connections/:id/stats', wrap(async (req, res) => {
    const r = await runSql(req.params.id, md.serverStatsSql());
    res.json(r.rows[0] ?? {});
  }));

  app.get('/api/connections/:id/schemas/:schema/tables/:table/columns', wrap(async (req, res) => {
    const { schema, table } = req.params;
    const r = await runSql(req.params.id, md.tableColumnsSql(schema, table), [schema, table]);
    res.json(r.rows);
  }));

  app.get('/api/connections/:id/schemas/:schema/tables/:table/constraints', wrap(async (req, res) => {
    const { schema, table } = req.params;
    const r = await runSql(req.params.id, md.tableConstraintsSql(schema, table), [schema, table]);
    res.json(r.rows);
  }));

  app.get('/api/connections/:id/schemas/:schema/tables/:table/indexes', wrap(async (req, res) => {
    const { schema, table } = req.params;
    const r = await runSql(req.params.id, md.tableIndexesSql(schema, table), [schema, table]);
    res.json(r.rows);
  }));

  app.get('/api/connections/:id/schemas/:schema/tables/:table/triggers', wrap(async (req, res) => {
    const { schema, table } = req.params;
    const r = await runSql(req.params.id, md.triggersSql(schema, table), [schema, table]);
    res.json(r.rows);
  }));

  app.get('/api/connections/:id/schemas/:schema/tables/:table/ddl', wrap(async (req, res) => {
    const conn = manager.get(req.params.id);
    const ddl = await md.generateCreateTable(conn.pool, req.params.schema, req.params.table);
    res.json({ ddl });
  }));

  // Browse table data with pagination + optional filter/order
  app.get('/api/connections/:id/schemas/:schema/tables/:table/data', wrap(async (req, res) => {
    const { schema, table } = req.params;
    const page = Number(req.query.page ?? 0);
    const pageSize = Math.max(1, Math.min(Number(req.query.pageSize ?? 100), 1000));
    const orderBy = req.query.orderBy;
    const orderDir = req.query.orderDir === 'desc' ? 'desc' : 'asc';
    const where = req.query.where;

    const countSql = md.buildCountQuery({ schema, table, where });
    const browseSql = md.buildBrowseQuery({ schema, table, orderBy, orderDir, page, pageSize, where });

    const countRes = await runSql(req.params.id, countSql);
    const dataRes = await manager.query(req.params.id, browseSql, [], 1000);
    res.json({
      fields: dataRes.fields,
      rows: dataRes.rows,
      total: Number(countRes.rows[0]?.total ?? 0),
      page,
      pageSize,
      elapsedMs: dataRes.elapsedMs,
    });
  }));

  // ---- ad-hoc SQL -------------------------------------------------------
  app.post('/api/connections/:id/query', wrap(async (req, res) => {
    const { sql, params = [], statementTimeout } = req.body ?? {};
    if (!sql || !String(sql).trim()) return res.status(400).json({ error: 'sql is required' });
    const conn = manager.get(req.params.id);
    if (statementTimeout) {
      await conn.pool.query(`SET statement_timeout = ${Math.max(1000, Number(statementTimeout) || 30000)}`);
    }
    const r = await manager.query(req.params.id, sql, params, Number(req.query.limit ?? 1000));
    res.json(r);
  }));

  // ---- static frontend (production build) -------------------------------
  const distDir = path.join(__dirname, '..', 'dist');
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get(/^\/(?!api\/).*/, (_req, res, next) => {
      res.sendFile(path.join(distDir, 'index.html'), (err) => err && next());
    });
  }

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: err.message });
  });

  return { app, manager };
}

// Start when run directly (not imported by Electron main with its own flow)
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const PORT = Number(process.env.PORT || 3001);
  const { app, manager } = createApp();
  const server = app.listen(PORT, () => {
    console.log(`pg-viewer API listening on http://localhost:${PORT}`);
  });
  const shutdown = async () => {
    console.log('\nShutting down…');
    await manager.closeAll();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
