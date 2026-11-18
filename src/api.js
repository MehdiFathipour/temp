// Tiny API client. The base URL can be overridden via ?apiBase= (used by Electron).
const params = new URLSearchParams(window.location.search);
export const API_BASE = params.get('apiBase') || '/api';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

export const api = {
  health: () => request('/health'),

  connect: (def) => request('/connections', { method: 'POST', body: def }),
  listConnections: () => request('/connections'),
  disconnect: (id) => request(`/connections/${id}`, { method: 'DELETE' }),

  databases: (id) => request(`/connections/${id}/databases`),
  schemas: (id) => request(`/connections/${id}/schemas`),
  tables: (id, schema) => request(`/connections/${id}/schemas/${encodeURIComponent(schema)}/tables`),
  views: (id, schema) => request(`/connections/${id}/schemas/${encodeURIComponent(schema)}/views`),
  functions: (id, schema) => request(`/connections/${id}/schemas/${encodeURIComponent(schema)}/functions`),
  sizes: (id, schema) => request(`/connections/${id}/schemas/${encodeURIComponent(schema)}/sizes`),
  stats: (id) => request(`/connections/${id}/stats`),

  columns: (id, schema, table) =>
    request(`/connections/${id}/schemas/${encodeURIComponent(schema)}/tables/${encodeURIComponent(table)}/columns`),
  constraints: (id, schema, table) =>
    request(`/connections/${id}/schemas/${encodeURIComponent(schema)}/tables/${encodeURIComponent(table)}/constraints`),
  indexes: (id, schema, table) =>
    request(`/connections/${id}/schemas/${encodeURIComponent(schema)}/tables/${encodeURIComponent(table)}/indexes`),
  triggers: (id, schema, table) =>
    request(`/connections/${id}/schemas/${encodeURIComponent(schema)}/tables/${encodeURIComponent(table)}/triggers`),
  ddl: (id, schema, table) =>
    request(`/connections/${id}/schemas/${encodeURIComponent(schema)}/tables/${encodeURIComponent(table)}/ddl`),
  tableData: (id, schema, table, query = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== ''))
    ).toString();
    return request(
      `/connections/${id}/schemas/${encodeURIComponent(schema)}/tables/${encodeURIComponent(table)}/data${qs ? `?${qs}` : ''}`
    );
  },

  runQuery: (id, sql, opts = {}) =>
    request(`/connections/${id}/query`, { method: 'POST', body: { sql, ...opts } }),
};

// Saved connections live in localStorage so the app works on any platform.
const LS_KEY = 'pg-viewer.connections.v1';

export function loadSavedConnections() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || [];
  } catch {
    return [];
  }
}

export function saveConnection(conn) {
  const list = loadSavedConnections().filter((c) => c.id !== conn.id);
  list.push(conn);
  localStorage.setItem(LS_KEY, JSON.stringify(list));
  return list;
}

export function removeSavedConnection(id) {
  const list = loadSavedConnections().filter((c) => c.id !== id);
  localStorage.setItem(LS_KEY, JSON.stringify(list));
  return list;
}
