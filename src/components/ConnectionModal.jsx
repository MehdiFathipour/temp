import React, { useState } from 'react';

const EMPTY = {
  label: '',
  mode: 'params', // 'params' | 'uri'
  connectionString: '',
  host: 'localhost',
  port: '5432',
  database: 'postgres',
  user: 'postgres',
  password: '',
  ssl: false,
};

export default function ConnectionModal({ initial, onClose, onConnect }) {
  const [form, setForm] = useState(() => {
    if (!initial) return { ...EMPTY };
    const d = initial.def || {};
    return {
      ...EMPTY,
      ...d,
      label: initial.label || d.label || '',
      mode: d.connectionString ? 'uri' : 'params',
      port: String(d.port ?? 5432),
      ssl: !!d.ssl,
      password: d.password ?? '',
    };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setBool = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.checked }));

  const buildDef = () => {
    const base = { label: form.label.trim() || undefined, savedId: initial?.id };
    if (form.mode === 'uri') {
      return { ...base, connectionString: form.connectionString.trim(), ssl: form.ssl || undefined };
    }
    return {
      ...base,
      host: form.host.trim(),
      port: Number(form.port) || 5432,
      database: form.database.trim(),
      user: form.user.trim(),
      password: form.password,
      ssl: form.ssl || undefined,
    };
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConnect(buildDef());
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3>{initial ? 'Edit connection' : 'New PostgreSQL connection'}</h3>

        <div className="form-grid">
          <div className="form-field full">
            <label>Name / label</label>
            <input value={form.label} onChange={set('label')} placeholder="My production DB" autoFocus />
          </div>

          <div className="form-field full">
            <label>
              <input type="radio" checked={form.mode === 'params'} onChange={() => setForm((f) => ({ ...f, mode: 'params' }))} /> Host &amp; parameters&nbsp;&nbsp;
              <input type="radio" checked={form.mode === 'uri'} onChange={() => setForm((f) => ({ ...f, mode: 'uri' }))} /> Connection URI
            </label>
          </div>

          {form.mode === 'uri' ? (
            <div className="form-field full">
              <label>Connection string</label>
              <input
                value={form.connectionString}
                onChange={set('connectionString')}
                placeholder="postgres://user:password@host:5432/dbname?sslmode=require"
                style={{ fontFamily: 'var(--mono)' }}
              />
            </div>
          ) : (
            <>
              <div className="form-field">
                <label>Host</label>
                <input value={form.host} onChange={set('host')} placeholder="localhost" />
              </div>
              <div className="form-field">
                <label>Port</label>
                <input value={form.port} onChange={set('port')} placeholder="5432" />
              </div>
              <div className="form-field">
                <label>Database</label>
                <input value={form.database} onChange={set('database')} placeholder="postgres" />
              </div>
              <div className="form-field">
                <label>User</label>
                <input value={form.user} onChange={set('user')} placeholder="postgres" />
              </div>
              <div className="form-field full">
                <label>Password</label>
                <input type="password" value={form.password} onChange={set('password')} placeholder="" />
              </div>
            </>
          )}

          <div className="form-field full">
            <label>
              <input type="checkbox" checked={form.ssl} onChange={setBool('ssl')} /> Use SSL/TLS
            </label>
          </div>
        </div>

        {error && <div className="error-text">{error}</div>}

        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy} onClick={submit}>
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  );
}
