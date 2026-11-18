import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';

const PAGE_SIZES = [25, 50, 100, 250, 500];

export default function DataBrowser({ connId, schema, table }) {
  const [data, setData] = useState(null);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [orderBy, setOrderBy] = useState(null);
  const [orderDir, setOrderDir] = useState('asc');
  const [whereInput, setWhereInput] = useState('');
  const [where, setWhere] = useState('');
  const reqSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++reqSeq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api.tableData(connId, schema, table, {
        page,
        pageSize,
        orderBy: orderBy || undefined,
        orderDir: orderBy ? orderDir : undefined,
        where: where || undefined,
      });
      if (seq !== reqSeq.current) return; // stale response
      setData(res);
    } catch (e) {
      if (seq === reqSeq.current) setError(e.message);
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, [connId, schema, table, page, pageSize, orderBy, orderDir, where]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .columns(connId, schema, table)
      .then(setColumns)
      .catch(() => setColumns([]));
  }, [connId, schema, table]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  const clickHeader = (colName) => {
    if (orderBy === colName) {
      setOrderDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setOrderBy(colName);
      setOrderDir('asc');
    }
    setPage(0);
  };

  const applyFilter = () => {
    setWhere(whereInput.trim());
    setPage(0);
  };

  const copyCell = (text) => {
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  const exportCsv = () => {
    if (!data) return;
    const esc = (v) => {
      if (v === null || v === undefined) return '';
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = data.fields.map((f) => esc(f.name)).join(',');
    const lines = data.rows.map((r) => data.fields.map((f) => esc(r[f.name])).join(','));
    const blob = new Blob([header + '\n' + lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${schema}.${table}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <div className="browse-toolbar">
        <input
          type="text"
          placeholder={`WHERE condition, e.g. id > 10 AND name ILIKE 'a%'`}
          value={whereInput}
          onChange={(e) => setWhereInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && applyFilter()}
        />
        <button onClick={applyFilter}>Filter</button>
        {where && (
          <button
            className="small"
            onClick={() => {
              setWhereInput('');
              setWhere('');
              setPage(0);
            }}
          >
            Clear
          </button>
        )}
        <select
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
            setPage(0);
          }}
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>{s} rows</option>
          ))}
        </select>
        <button onClick={load} title="Reload">⟳</button>
        <button onClick={exportCsv} disabled={!data}>Export CSV (page)</button>
        <span className="query-meta">
          {data ? `${data.total.toLocaleString()} total rows · ${data.elapsedMs} ms` : ''}
        </span>
      </div>

      {error && <div className="query-error">{error}</div>}

      {loading && !data && <div style={{ color: 'var(--muted)', padding: 20 }}>Loading…</div>}

      {data && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table className="grid">
              <thead>
                <tr>
                  <th style={{ cursor: 'default' }}>#</th>
                  {data.fields.map((f) => (
                    <th key={f.name} onClick={() => clickHeader(f.name)}>
                      {f.name}
                      {orderBy === f.name ? (orderDir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--muted)' }}>{page * pageSize + i + 1}</td>
                    {data.fields.map((f) => (
                      <Cell key={f.name} value={row[f.name]} onCopy={copyCell} />
                    ))}
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={data.fields.length + 1} style={{ textAlign: 'center', color: 'var(--muted)' }}>
                      No rows
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <button className="small" disabled={page === 0} onClick={() => setPage(0)}>⏮</button>
            <button className="small" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Prev</button>
            <span>
              Page {page + 1} / {totalPages}
            </span>
            <button className="small" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
            <button className="small" disabled={page + 1 >= totalPages} onClick={() => setPage(totalPages - 1)}>⏭</button>
          </div>
        </>
      )}
    </div>
  );
}

function Cell({ value, onCopy }) {
  const display = useMemo(() => stringify(value), [value]);
  if (value === null || value === undefined) {
    return <td className="null" title="NULL">NULL</td>;
  }
  const cls = typeof value === 'number' ? 'number' : '';
  return (
    <td className={cls} title={`${display}\n(click to copy)`} onClick={() => onCopy(display)} style={{ cursor: 'copy' }}>
      {display}
    </td>
  );
}

function stringify(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
