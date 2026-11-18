import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

function fmtBytes(n) {
  if (n == null) return '';
  const b = Number(n);
  const units = ['B', 'kB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function SchemaOverview({ connId, schema }) {
  const [sizes, setSizes] = useState(null);
  const [stats, setStats] = useState(null);
  const [server, setServer] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.sizes(connId, schema).catch(() => []),
      api.stats(connId).catch(() => null),
    ])
      .then(([s, st]) => {
        if (cancelled) return;
        setSizes(s);
        setServer(st);
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [connId, schema]);

  if (error) return <div className="query-error">{error}</div>;
  if (!sizes) return <div style={{ color: 'var(--muted)', padding: 20 }}>Loading…</div>;

  const total = sizes.reduce((acc, s) => acc + Number(s.total_bytes || 0), 0);

  return (
    <div>
      {server && (
        <>
          <div className="section-title">Server</div>
          <table className="grid" style={{ width: 'auto' }}>
            <tbody>
              <tr><td>Version</td><td>{server.version}</td></tr>
              <tr><td>Database size</td><td>{server.database_size}</td></tr>
              <tr><td>Connections (active/total/max)</td><td>{server.active_connections} / {server.total_connections} / {server.max_connections}</td></tr>
            </tbody>
          </table>
        </>
      )}

      <div className="section-title">Table sizes — schema “{schema}” (total {fmtBytes(total)})</div>
      <table className="grid">
        <thead>
          <tr>
            <th>Table</th>
            <th>Total</th>
            <th>Table</th>
            <th>Indexes</th>
            <th>Share</th>
          </tr>
        </thead>
        <tbody>
          {sizes.map((s) => {
            const share = total ? (Number(s.total_bytes) / total) * 100 : 0;
            return (
              <tr key={s.name}>
                <td>{s.name}</td>
                <td>{fmtBytes(s.total_bytes)}</td>
                <td>{fmtBytes(s.table_bytes)}</td>
                <td>{fmtBytes(s.index_bytes)}</td>
                <td>
                  <div style={{ background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden', height: 10, width: 160 }}>
                    <div style={{ width: `${share}%`, height: '100%', background: 'var(--accent)' }} />
                  </div>
                </td>
              </tr>
            );
          })}
          {sizes.length === 0 && (
            <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)' }}>No tables in this schema.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
