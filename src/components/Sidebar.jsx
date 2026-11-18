import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

function Node({ label, icon, depth = 0, onDoubleClick, onClick, selected, children, toggleable, open, loading, badge }) {
  return (
    <div className="tree-node">
      <div
        className={`tree-row${selected ? ' selected' : ''}`}
        style={{ paddingLeft: 10 + depth * 16 }}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        <span className="tree-toggle">{toggleable ? (open ? '▼' : '▶') : ''}</span>
        <span className="tree-icon">{icon}</span>
        <span className="tree-label">{label}</span>
        {badge != null && <span className="tree-count">{badge}</span>}
        {loading && <span className="tree-count">…</span>}
      </div>
      {open && <div className="tree-children">{children}</div>}
    </div>
  );
}

export default function Sidebar({
  conn,
  treeVersion,
  saved,
  onOpenTable,
  onOpenDetails,
  onOpenView,
  onOpenFunction,
  onOpenSchema,
  onOpenQuery,
  onReconnectSaved,
  onEditSaved,
  onRemoveSaved,
}) {
  const [openConn, setOpenConn] = useState(false);
  const [schemas, setSchemas] = useState(null);
  const [openSchemas, setOpenSchemas] = useState({}); // name -> {tables, views, functions, loading}
  const [expandedTables, setExpandedTables] = useState({});

  useEffect(() => {
    if (!conn) {
      setSchemas(null);
      setOpenSchemas({});
      setOpenConn(false);
      return;
    }
    setOpenConn(true);
    setSchemas(null);
    setOpenSchemas({});
    api
      .schemas(conn.id)
      .then(setSchemas)
      .catch((e) => setSchemas({ error: e.message }));
  }, [conn, treeVersion]);

  const loadSchemaContent = useCallback(
    async (schemaName) => {
      if (!conn) return;
      setOpenSchemas((prev) => ({ ...prev, [schemaName]: { ...(prev[schemaName] || {}), loading: true, open: true } }));
      try {
        const [tables, views, functions] = await Promise.all([
          api.tables(conn.id, schemaName),
          api.views(conn.id, schemaName).catch(() => []),
          api.functions(conn.id, schemaName).catch(() => []),
        ]);
        setOpenSchemas((prev) => ({
          ...prev,
          [schemaName]: { tables, views, functions, loading: false, open: true },
        }));
      } catch (e) {
        setOpenSchemas((prev) => ({
          ...prev,
          [schemaName]: { ...(prev[schemaName] || {}), loading: false, error: e.message },
        }));
      }
    },
    [conn]
  );

  const toggleSchema = (name) => {
    const cur = openSchemas[name];
    if (!cur || !cur.open) return loadSchemaContent(name);
    setOpenSchemas((prev) => ({ ...prev, [name]: { ...cur, open: false } }));
  };

  const refresh = () => {
    if (!conn) return;
    api.schemas(conn.id).then(setSchemas).catch((e) => setSchemas({ error: e.message }));
    Object.keys(openSchemas).forEach((s) => openSchemas[s]?.open && loadSchemaContent(s));
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span>Explorer</span>
        <span>
          <button className="small" title="Refresh" onClick={refresh}>⟳</button>{' '}
          <button className="small" title="SQL Editor" onClick={onOpenQuery} disabled={!conn}>SQL</button>
        </span>
      </div>

      <div className="tree">
        {/* Saved connections when not connected */}
        {!conn && (
          <>
            <div className="section-title" style={{ padding: '4px 12px', margin: 0 }}>Saved connections</div>
            {saved.length === 0 && (
              <div style={{ padding: '10px 14px', color: 'var(--muted)' }}>No saved connections yet.</div>
            )}
            {saved.map((entry) => (
              <div key={entry.id} className="tree-row" onDoubleClick={() => onReconnectSaved(entry)}>
                <span className="tree-toggle" />
                <span className="tree-icon">🐘</span>
                <span className="tree-label">{entry.label}</span>
                <span className="tree-count">
                  <button className="small" onClick={() => onReconnectSaved(entry)}>Connect</button>{' '}
                  <button className="small" onClick={() => onEditSaved(entry)}>✎</button>{' '}
                  <button className="small danger" onClick={() => onRemoveSaved(entry)}>✕</button>
                </span>
              </div>
            ))}
          </>
        )}

        {conn && (
          <Node
            label={conn.label}
            icon="🐘"
            toggleable
            open={openConn}
            onClick={() => setOpenConn((v) => !v)}
          >
            {!schemas && <div style={{ padding: '4px 30px', color: 'var(--muted)' }}>Loading schemas…</div>}
            {schemas?.error && <div style={{ padding: '4px 30px', color: 'var(--red)' }}>{schemas.error}</div>}
            {Array.isArray(schemas) &&
              schemas.map((s) => {
                const st = openSchemas[s.name] || {};
                return (
                  <Node
                    key={s.name}
                    depth={1}
                    label={s.name}
                    icon="🗂"
                    toggleable
                    open={!!st.open}
                    loading={st.loading}
                    badge={st.tables ? st.tables.length + st.views.length : undefined}
                    onClick={() => toggleSchema(s.name)}
                    onDoubleClick={() => onOpenSchema(s.name)}
                  >
                    {st.error && <div style={{ padding: '4px 46px', color: 'var(--red)' }}>{st.error}</div>}
                    {st.tables && st.tables.length > 0 && (
                      <div className="section-title" style={{ padding: '2px 0 2px 46px', margin: 0 }}>Tables</div>
                    )}
                    {st.tables?.map((t) => {
                      const isTable = t.type !== 'view';
                      const key = `${s.name}.${t.name}`;
                      const exp = !!expandedTables[key];
                      return (
                        <React.Fragment key={key}>
                          <Node
                            depth={2}
                            label={t.name}
                            icon={typeIcon(t.type)}
                            toggleable={isTable}
                            open={exp}
                            badge={fmtRows(t.estimated_rows)}
                            onClick={() => isTable && setExpandedTables((p) => ({ ...p, [key]: !p[key] }))}
                            onDoubleClick={() => onOpenTable(s.name, t.name)}
                          />
                          {isTable &&
                            exp &&
                            ['Columns', 'Constraints', 'Indexes', 'Triggers'].map((sec) => (
                              <div
                                key={sec}
                                className="tree-row"
                                style={{ paddingLeft: 78 }}
                                onClick={() => onOpenDetails(s.name, t.name)}
                              >
                                <span className="tree-icon">▸</span>
                                <span className="tree-label" style={{ color: 'var(--muted)' }}>{sec}</span>
                              </div>
                            ))}
                        </React.Fragment>
                      );
                    })}
                    {st.views && st.views.length > 0 && (
                      <div className="section-title" style={{ padding: '2px 0 2px 46px', margin: 0 }}>Views</div>
                    )}
                    {st.views?.map((v) => (
                      <Node
                        key={v.name}
                        depth={2}
                        label={v.name}
                        icon="🧾"
                        onClick={() => onOpenView(s.name, v.name, v.definition)}
                      />
                    ))}
                    {st.functions && st.functions.length > 0 && (
                      <div className="section-title" style={{ padding: '2px 0 2px 46px', margin: 0 }}>Functions</div>
                    )}
                    {st.functions?.map((f, i) => (
                      <Node
                        key={`${f.name}-${i}`}
                        depth={2}
                        label={`${f.name}(${f.arguments || ''})`}
                        icon="ƒ"
                        onClick={() => onOpenFunction(s.name, f)}
                      />
                    ))}
                  </Node>
                );
              })}
          </Node>
        )}
      </div>
    </aside>
  );
}

function typeIcon(type) {
  switch (type) {
    case 'view':
      return '🧾';
    case 'materialized view':
      return '📊';
    case 'foreign table':
      return '🌐';
    case 'partitioned table':
      return '🪓';
    default:
      return '📄';
  }
}

function fmtRows(n) {
  if (n == null) return '';
  const num = Number(n);
  if (!num) return '0';
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}k`;
  return String(num);
}
