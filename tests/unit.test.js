import test from 'node:test';
import assert from 'node:assert/strict';
import { ConnectionManager } from '../server/connectionManager.js';
import {
  buildBrowseQuery,
  buildCountQuery,
  quoteIdent,
  listSchemasSql,
  tableColumnsSql,
} from '../server/metadata.js';

test('normalizeConfig defaults', () => {
  const cfg = ConnectionManager.normalizeConfig({});
  assert.equal(cfg.host, 'localhost');
  assert.equal(cfg.port, 5432);
  assert.equal(cfg.user, 'postgres');
  assert.equal(cfg.database, 'postgres');
  assert.equal(cfg.ssl, undefined);
});

test('normalizeConfig explicit params', () => {
  const cfg = ConnectionManager.normalizeConfig({
    host: 'db.example.com',
    port: '6543',
    user: 'alice',
    password: 'secret',
    database: 'app',
    ssl: true,
  });
  assert.equal(cfg.host, 'db.example.com');
  assert.equal(cfg.port, 6543);
  assert.equal(cfg.user, 'alice');
  assert.equal(cfg.password, 'secret');
  assert.equal(cfg.database, 'app');
  assert.deepEqual(cfg.ssl, { rejectUnauthorized: true });
});

test('normalizeConfig URI overrides params', () => {
  const cfg = ConnectionManager.normalizeConfig({
    connectionString: ' postgres://u:p@h:1/d ',
    host: 'ignored',
  });
  assert.equal(cfg.connectionString, 'postgres://u:p@h:1/d');
  assert.equal(cfg.host, undefined);
  assert.equal(cfg.port, undefined);
});

test('makeId uniqueness & prefix', () => {
  const a = ConnectionManager.makeId();
  const b = ConnectionManager.makeId();
  assert.match(a, /^conn_/);
  assert.notEqual(a, b);
});

test('get unknown id throws 404', () => {
  const m = new ConnectionManager();
  assert.throws(() => m.get('nope'), (e) => e.status === 404);
});

test('list empty', () => {
  const m = new ConnectionManager();
  assert.deepEqual(m.list(), []);
});

test('quoteIdent escapes double quotes', () => {
  assert.equal(quoteIdent('simple'), '"simple"');
  assert.equal(quoteIdent('we"ird'), '"we""ird"');
});

test('buildBrowseQuery basics', () => {
  const sql = buildBrowseQuery({ schema: 'public', table: 'users', page: 2, pageSize: 50 });
  assert.match(sql, /SELECT \* FROM "public"\."users"/);
  assert.match(sql, /LIMIT 50 OFFSET 100/);
});

test('buildBrowseQuery order + where + columns', () => {
  const sql = buildBrowseQuery({
    schema: 'app',
    table: 'orders',
    columns: ['id', 'total'],
    orderBy: 'created_at',
    orderDir: 'desc',
    where: 'total > 10',
    page: 0,
    pageSize: 10,
  });
  assert.match(sql, /SELECT "id", "total" FROM "app"\."orders"/);
  assert.match(sql, /WHERE total > 10/);
  assert.match(sql, /ORDER BY "created_at" DESC/);
  assert.match(sql, /LIMIT 10 OFFSET 0/);
});

test('buildBrowseQuery clamps page size', () => {
  const sql = buildBrowseQuery({ schema: 's', table: 't', pageSize: 999999 });
  assert.match(sql, /LIMIT 1000/);
});

test('buildBrowseQuery rejects invalid orderBy', () => {
  const sql = buildBrowseQuery({ schema: 's', table: 't', orderBy: 'a; DROP TABLE x--' });
  assert.doesNotMatch(sql, /ORDER BY/);
});

test('buildCountQuery with where', () => {
  const sql = buildCountQuery({ schema: 'public', table: 't', where: 'x = 1' });
  assert.equal(sql, 'SELECT count(*)::bigint AS total FROM "public"."t" WHERE x = 1');
});

test('metadata SQL sanity', () => {
  assert.match(listSchemasSql(), /pg_namespace/);
  assert.match(tableColumnsSql('a', 'b'), /\$1/);
});
