import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function TableDetails({ connId, schema, table }) {
  const [columns, setColumns] = useState(null);
  const [constraints, setConstraints] = useState(null);
  const [indexes, setIndexes] = useState(null);
  const [triggers, setTriggers] = useState(null);
  const [ddl, setDdl] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([
      api.columns(connId, schema, table),
      api.constraints(connId, schema, table),
      api.indexes(connId, schema, table),
      api.triggers(connId, schema, table).catch(() => []),
      api.ddl(connId, schema, table).catch(() => ({ ddl: '(unavailable)' })),
    ])
      .then(([c, k, i, t, d]) => {
        if (cancelled) return;
        setColumns(c);
        setConstraints(k);
        setIndexes(i);
        setTriggers(t);
        setDdl(d.ddl);
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [connId, schema, table]);

  const copyDdl = async () => {
    try {
      await navigator.clipboard.writeText(ddl || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  if (error) return <div className="query-error">{error}</div>;
  if (!columns) return <div style={{ color: 'var(--muted)', padding: 20 }}>Loading…</div>;

  return (
    <div>
      <div className="section-title">Columns ({columns.length})</div>
      <table className="grid">
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Type</th>
            <th>Nullable</th>
            <th>Default</th>
            <th>Key</th>
            <th>Comment</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((c) => (
            <tr key={c.position}>
              <td>{c.position}</td>
              <td>{c.name}</td>
              <td>{c.data_type}</td>
              <td>{c.nullable ? 'yes' : 'no'}</td>
              <td>{c.default_value || ''}</td>
              <td>
                {c.is_primary_key && <span className="badge pk">PK</span>}{' '}
                {c.is_identity && <span className="badge">IDENTITY</span>}{' '}
                {c.is_generated && <span className="badge">GENERATED</span>}
              </td>
              <td>{c.comment || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="section-title">Constraints ({constraints?.length ?? 0})</div>
      <table className="grid">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Definition</th>
          </tr>
        </thead>
        <tbody>
          {constraints?.map((k) => (
            <tr key={k.name}>
              <td>{k.name}</td>
              <td>
                <span className={`badge ${k.type === 'PRIMARY KEY' ? 'pk' : k.type === 'UNIQUE' ? 'uk' : k.type === 'FOREIGN KEY' ? 'fk' : ''}`}>
                  {k.type}
                </span>
              </td>
              <td title={k.definition}>{k.definition}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="section-title">Indexes ({indexes?.length ?? 0})</div>
      <table className="grid">
        <thead>
          <tr>
            <th>Name</th>
            <th>Unique</th>
            <th>Primary</th>
            <th>Definition</th>
          </tr>
        </thead>
        <tbody>
          {indexes?.map((i) => (
            <tr key={i.name}>
              <td>{i.name}</td>
              <td>{i.is_unique ? '✓' : ''}</td>
              <td>{i.is_primary ? '✓' : ''}</td>
              <td title={i.definition}>{i.definition}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {triggers && triggers.length > 0 && (
        <>
          <div className="section-title">Triggers ({triggers.length})</div>
          <table className="grid">
            <thead>
              <tr>
                <th>Name</th>
                <th>Function</th>
                <th>Definition</th>
              </tr>
            </thead>
            <tbody>
              {triggers.map((t) => (
                <tr key={t.name}>
                  <td>{t.name}</td>
                  <td>{t.function_name}</td>
                  <td title={t.definition}>{t.definition}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="section-title">
        DDL{' '}
        <button className="small" onClick={copyDdl}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="code">{ddl}</pre>
    </div>
  );
}
