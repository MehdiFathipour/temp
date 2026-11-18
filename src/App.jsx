import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, loadSavedConnections, saveConnection, removeSavedConnection } from './api.js';
import Sidebar from './components/Sidebar.jsx';
import ConnectionModal from './components/ConnectionModal.jsx';
import DataBrowser from './components/DataBrowser.jsx';
import TableDetails from './components/TableDetails.jsx';
import QueryEditor from './components/QueryEditor.jsx';
import SchemaOverview from './components/SchemaOverview.jsx';

let tabSeq = 1;

export default function App() {
  const [saved, setSaved] = useState(() => loadSavedConnections());
  const [activeConn, setActiveConn] = useState(null); // {id,label,...} live connection
  const [treeVersion, setTreeVersion] = useState(0);
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSaved, setEditingSaved] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef();

  const showToast = useCallback((msg, isError) => {
    setToast({ msg, isError });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const openTab = useCallback((tab) => {
    setTabs((prev) => {
      const existing = prev.find((t) => t.key === tab.key);
      if (existing) {
        setActiveTabId(existing.id);
        return prev;
      }
      const next = [...prev, { ...tab, id: tabSeq++ }];
      setActiveTabId(next[next.length - 1].id);
      return next;
    });
  }, []);

  const closeTab = useCallback((id) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      setActiveTabId((cur) => {
        if (cur !== id) return cur;
        const fallback = next[Math.max(0, idx - 1)];
        return fallback ? fallback.id : null;
      });
      return next;
    });
  }, []);

  const handleConnect = useCallback(
    async (def) => {
      const res = await api.connect(def);
      setActiveConn(res.connection);
      setTreeVersion((v) => v + 1);
      // persist to saved list (without password? keep it — localStorage is local-only)
      const entry = {
        id: def.savedId || `saved_${Date.now().toString(36)}`,
        label: def.label || res.connection.label,
        def: { ...def, id: undefined }, // server-side id not persisted
      };
      setSaved(saveConnection(entry));
      showToast(`Connected: ${res.connection.label}`);
      return res;
    },
    [showToast]
  );

  const handleDisconnect = useCallback(async () => {
    if (!activeConn) return;
    try {
      await api.disconnect(activeConn.id);
    } catch {
      /* ignore */
    }
    setActiveConn(null);
    setTabs([]);
    setActiveTabId(null);
  }, [activeConn]);

  const handleReconnectSaved = useCallback(
    async (entry) => {
      try {
        await handleConnect({ ...entry.def, savedId: entry.id, label: entry.label });
      } catch (e) {
        showToast(e.message, true);
      }
    },
    [handleConnect, showToast]
  );

  const handleRemoveSaved = useCallback((entry) => {
    setSaved(removeSavedConnection(entry.id));
  }, []);

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId) || null, [tabs, activeTabId]);

  // Keyboard: Ctrl/Cmd+Enter handled inside editor; Ctrl+W closes tab
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w' && activeTabId) {
        e.preventDefault();
        closeTab(activeTabId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTabId, closeTab]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">PG<span>Viewer</span></div>
        {activeConn ? (
          <>
            <button onClick={() => setModalOpen(true)}>New connection…</button>
            <button onClick={handleDisconnect}>Disconnect</button>
            <div className="spacer" />
            <div className="status ok">
              {activeConn.label} · {activeConn.serverVersion?.split(' ').slice(0, 2).join(' ')}
            </div>
          </>
        ) : (
          <>
            <button className="primary" onClick={() => setModalOpen(true)}>
              Connect to PostgreSQL…
            </button>
            <div className="spacer" />
            <div className="status">No active connection</div>
          </>
        )}
      </header>

      <div className="main">
        <Sidebar
          conn={activeConn}
          treeVersion={treeVersion}
          saved={saved}
          onOpenTable={(schema, table) =>
            openTab({ key: `data:${activeConn.id}:${schema}.${table}`, type: 'data', schema, table, title: `${schema}.${table}` })
          }
          onOpenDetails={(schema, table) =>
            openTab({ key: `details:${activeConn.id}:${schema}.${table}`, type: 'details', schema, table, title: `${schema}.${table} (info)` })
          }
          onOpenView={(schema, name, definition) =>
            openTab({ key: `view:${activeConn.id}:${schema}.${name}`, type: 'definition', schema, table: name, definition, title: `${schema}.${name} (view)` })
          }
          onOpenFunction={(schema, fn) =>
            openTab({
              key: `fn:${activeConn.id}:${schema}.${fn.name}`,
              type: 'definition',
              schema,
              table: fn.name,
              definition: fn.definition,
              title: `${schema}.${fn.name}()`,
            })
          }
          onOpenSchema={(schema) =>
            openTab({ key: `schema:${activeConn.id}:${schema}`, type: 'schema', schema, title: `Schema: ${schema}` })
          }
          onOpenQuery={() =>
            openTab({ key: `query:${activeConn.id}`, type: 'query', title: 'SQL Editor' })
          }
          onReconnectSaved={handleReconnectSaved}
          onEditSaved={(entry) => {
            setEditingSaved(entry);
            setModalOpen(true);
          }}
          onRemoveSaved={handleRemoveSaved}
        />

        <section className="content">
          {tabs.length > 0 && (
            <div className="tabs">
              {tabs.map((t) => (
                <div
                  key={t.id}
                  className={`tab${t.id === activeTabId ? ' active' : ''}`}
                  onClick={() => setActiveTabId(t.id)}
                  title={t.title}
                >
                  <span className="tree-label">{t.title}</span>
                  <span
                    className="close"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(t.id);
                    }}
                  >
                    ✕
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="panel">
            {!activeConn && (
              <div className="empty-state">
                <h2>PostgreSQL Viewer</h2>
                <p>Connect to a PostgreSQL server to browse databases, schemas, tables, views, functions and run SQL.</p>
                <p>Works with any hosted or local PostgreSQL ≥ 9.4 instance.</p>
                <button className="primary" onClick={() => setModalOpen(true)}>
                  Connect…
                </button>
              </div>
            )}

            {activeConn && tabs.length === 0 && (
              <div className="empty-state">
                <h2>Ready</h2>
                <p>Use the sidebar to explore, or open the SQL editor.</p>
                <button onClick={() => openTab({ key: `query:${activeConn.id}`, type: 'query', title: 'SQL Editor' })}>
                  Open SQL Editor
                </button>
              </div>
            )}

            {activeTab && activeTab.type === 'data' && (
              <DataBrowser connId={activeConn.id} schema={activeTab.schema} table={activeTab.table} />
            )}
            {activeTab && activeTab.type === 'details' && (
              <TableDetails connId={activeConn.id} schema={activeTab.schema} table={activeTab.table} />
            )}
            {activeTab && activeTab.type === 'schema' && (
              <SchemaOverview connId={activeConn.id} schema={activeTab.schema} />
            )}
            {activeTab && activeTab.type === 'query' && (
              <QueryEditor connId={activeConn.id} connLabel={activeConn.label} />
            )}
            {activeTab && activeTab.type === 'definition' && (
              <div>
                <div className="section-title">
                  {activeTab.schema}.{activeTab.table}
                </div>
                <pre className="code">{activeTab.definition ?? '(definition unavailable)'}</pre>
              </div>
            )}
          </div>
        </section>
      </div>

      {modalOpen && (
        <ConnectionModal
          initial={editingSaved}
          onClose={() => {
            setModalOpen(false);
            setEditingSaved(null);
          }}
          onConnect={handleConnect}
        />
      )}

      {toast && <div className={`toast${toast.isError ? ' error' : ''}`}>{toast.msg}</div>}
    </div>
  );
}
