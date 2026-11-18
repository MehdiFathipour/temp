import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const HISTORY_KEY = 'pg-viewer.queryHistory.v1';

export default function QueryEditor({ connId }) {
  const [sql, setSql] = useState(() => localStorage.getItem('pg-viewer.lastQuery') || 'select 1 as hello;');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(1000);
  const [timeoutMs, setTimeoutMs] = useState(30000);
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    } catch {
      return [];
    }
  });
  const areaRef = useRef();

  useEffect(() => {
    localStorage.setItem('pg-viewer.lastQuery', sql);
  }, [sql]);

  const run = async () => {
    if (!sql.trim() || busy) return;
    setBusy(true);
    setError(null);
    const start = Date.now();
    try {
      const res = await api.runQuery(connId, sql, { statementTimeout: Number(timeoutMs) || undefined });
      setResult(res);
      const entry = { sql: sql.trim(), at: new Date().toISOString(), ms: Date.now() - start };
      const next = [entry, ...history.filter((h) => h.sql !== entry.sql)].slice(0, 50);
      setHistory(next);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch (e) {
      setError(e.message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      run();
    }
    // Tab inserts two spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      const t = e.target;
      const { selectionStart: s, selectionEnd: en } = t;
      const next = sql.slice(0, s) + '  ' + sql.slice(en);
      setSql(next);
      requestAnimationFrame(() => {
        t.selectionStart = t.selectionEnd = s + 2;
      });
    }
  };

  const exportJson = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result.rows, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'query-result.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportCsv = () => {
    if (!result || !result.fields?.length) return;
    const esc = (v) => {
      if (v === null || v === undefined) return '';
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = result.fields.map((f) => esc(f.name)).join(',');
    const lines = result.rows.map((r) => result.fields.map((f) => esc(r[f.name])).join(','));
    const blob = new Blob([header + '\n' + lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'query-result.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="query-editor">
      <textarea
        ref={areaRef}
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        onKeyDown={onKeyDown}
        spellCheck={false}
        placeholder="SELECT … (-- Ctrl/Cmd+Enter to run)"
      />
      <div className="query-toolbar">
        <button className="primary" onClick={run} disabled={busy}>
          {busy ? 'Running…' : '▶ Run (Ctrl/⌘+Enter)'}
        </button>
        <label style={{ color: 'var(--muted)', fontSize: 12 }}>
          Rows ≤{' '}
          <input
            type="number"
            min="1"
            max="10000"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            style={{ width: 80 }}
          />
        </label>
        <label style={{ color: 'var(--muted)', fontSize: 12 }}>
          Timeout ms{' '}
          <input
            type="number"
            min="1000"
            step="1000"
            value={timeoutMs}
            onChange={(e) => setTimeoutMs(Number(e.target.value))}
            style={{ width: 90 }}
          />
        </label>
        <button onClick={exportCsv} disabled={!result}>CSV</button>
        <button onClick={exportJson} disabled={!result}>JSON</button>
        {history.length > 0 && (
          <select
            style={{ maxWidth: 260 }}
            onChange={(e) => {
              const h = history[Number(e.target.value)];
              if (h) setSql(h.sql);
              e.target.selectedIndex = 0;
            }}
            defaultValue=""
          >
            <option value="" disabled>History…</option>
            {history.map((h, i) => (
              <option key={i} value={i}>{h.sql.slice(0, 80)}</option>
            ))}
          </select>
        )}
        <span className="query-meta">
          {result ? `${result.rowCount} row(s) · ${result.elapsedMs} ms${result.truncated ? ' (truncated)' : ''}` : ''}
        </span>
      </div>

      {error && <div className="query-error">{error}</div>}

      <div className="query-results">
        {result && result.fields.length > 0 && (
          <table className="grid">
            <thead>
              <tr>
                <th>#</th>
                {result.fields.map((f) => (
                  <th key={f.name}>{f.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--muted)' }}>{i + 1}</td>
                  {result.fields.map((f) => {
                    const v = row[f.name];
                    const disp = v === null || v === undefined ? null : typeof v === 'object' ? JSON.stringify(v) : String(v);
                    return disp === null ? (
                      <td key={f.name} className="null">NULL</td>
                    ) : (
                      <td key={f.name} className={typeof v === 'number' ? 'number' : ''} title={disp}>
                        {disp}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {result && result.fields.length === 0 && (
          <div style={{ padding: 14, color: 'var(--muted)' }}>
            Statement executed successfully ({result.rowCount ?? 0} rows affected).
          </div>
        )}
      </div>
    </div>
  );
}
