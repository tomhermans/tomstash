const AIRTABLE_LONG_TEXT_LIMIT = 100_000;

const request = async (url, options) => {
  try {
    return await fetch(url, options);
  } catch {
    throw new Error("Network error. Check your settings.");
  }
};

const readJson = async (res) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

const trimSlash = (value) => value.trim().replace(/\/+$/, "");

const compact = (obj) =>
  Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== ""),
  );

const record = (p) => ({
  url: p.url,
  title: p.title,
  description: p.description,
  tags: p.tags,
  category: p.category,
  favicon_url: p.favicon_url,
  image_url: p.image_url,
  author: p.author,
  reading_time: p.reading_time,
  lang: p.lang,
  content_md: p.content_md,
});

const failure = (res, body, fallback) =>
  new Error(
    body?.error?.message ||
      (typeof body?.error === "string" && body.error) ||
      body?.message ||
      `${fallback} (HTTP ${res.status})`,
  );

const apiBackend = {
  label: "Custom API (your own server)",
  steps: [
    "Your server must accept POST /api/links/index.json with an X-API-Key header and answer CORS requests.",
    "The reference server in the repository's server/ folder does this.",
  ],
  fields: [
    {
      key: "apiEndpoint",
      label: "API Endpoint URL",
      type: "url",
      placeholder: "https://yoursite.example.com",
      help: "Base URL without a trailing slash.",
      required: true,
    },
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      placeholder: "Your API key",
      help: "Sent as the X-API-Key header.",
      required: true,
    },
  ],
  origins: () => [],
  save: async (cfg, payload) => {
    const res = await request(`${trimSlash(cfg.apiEndpoint)}/api/links/index.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": cfg.apiKey },
      body: JSON.stringify(payload),
    });
    const body = await readJson(res);
    if (!body) throw new Error("Unexpected response from server");
    if (!res.ok || !body.data) throw new Error(body.error || "Failed to save");
  },
  test: async (cfg) => {
    const res = await request(`${trimSlash(cfg.apiEndpoint)}/api/links/index.json?limit=1`, {
      headers: { "X-API-Key": cfg.apiKey },
    });
    if (!res.ok) throw failure(res, await readJson(res), "Server rejected the request");
  },
};

const supabaseHeaders = (cfg) => ({
  apikey: cfg.anonKey,
  Authorization: `Bearer ${cfg.anonKey}`,
});

const supabaseUrl = (cfg) =>
  `${trimSlash(cfg.url)}/rest/v1/${encodeURIComponent(cfg.table || "links")}`;

const supabaseBackend = {
  label: "Supabase",
  steps: [
    "1. Create a project at supabase.com and run server/schema.sql plus integrations/supabase-rls.sql in the SQL editor.",
    "2. In Project Settings > API, copy the Project URL and the anon public key.",
    "3. Paste them below and click Test connection.",
  ],
  fields: [
    {
      key: "url",
      label: "Project URL",
      type: "url",
      placeholder: "https://abcdefgh.supabase.co",
      required: true,
    },
    {
      key: "anonKey",
      label: "Anon public key",
      type: "password",
      placeholder: "eyJ...",
      required: true,
    },
    {
      key: "table",
      label: "Table name",
      type: "text",
      placeholder: "links",
      default: "links",
      required: true,
    },
  ],
  origins: (cfg) => [`${new URL(cfg.url).origin}/*`],
  save: async (cfg, payload) => {
    const row = {
      ...record(payload),
      content_fetched_at: payload.content_md ? new Date().toISOString() : null,
    };
    const res = await request(supabaseUrl(cfg), {
      method: "POST",
      headers: {
        ...supabaseHeaders(cfg),
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });
    if (!res.ok) throw failure(res, await readJson(res), "Failed to save");
  },
  test: async (cfg) => {
    const res = await request(`${supabaseUrl(cfg)}?select=url&limit=1`, {
      headers: supabaseHeaders(cfg),
    });
    if (!res.ok) throw failure(res, await readJson(res), "Could not reach the table");
  },
};

const airtableUrl = (cfg) =>
  `https://api.airtable.com/v0/${cfg.baseId.trim()}/${encodeURIComponent(cfg.table.trim())}`;

const airtableBackend = {
  label: "Airtable",
  steps: [
    "1. Create a base with a table whose field names match the list in the README (url, title, description, tags, ...).",
    "2. Create a personal access token at airtable.com/create/tokens with the scopes data.records:read and data.records:write, limited to that base.",
    "3. Copy the base ID (starts with app) from the base's API docs or URL, then click Test connection.",
  ],
  fields: [
    {
      key: "token",
      label: "Personal access token",
      type: "password",
      placeholder: "pat...",
      required: true,
    },
    {
      key: "baseId",
      label: "Base ID",
      type: "text",
      placeholder: "appXXXXXXXXXXXXXX",
      required: true,
    },
    {
      key: "table",
      label: "Table name",
      type: "text",
      placeholder: "Links",
      default: "Links",
      required: true,
    },
  ],
  origins: () => ["https://api.airtable.com/*"],
  save: async (cfg, payload) => {
    const now = new Date().toISOString();
    const fields = compact({
      ...record(payload),
      tags: payload.tags.join(", "),
      content_md: payload.content_md?.slice(0, AIRTABLE_LONG_TEXT_LIMIT),
      created_at: now,
      content_fetched_at: payload.content_md ? now : null,
    });
    const res = await request(airtableUrl(cfg), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ records: [{ fields }], typecast: true }),
    });
    if (!res.ok) throw failure(res, await readJson(res), "Failed to save");
  },
  test: async (cfg) => {
    const res = await request(`${airtableUrl(cfg)}?maxRecords=1`, {
      headers: { Authorization: `Bearer ${cfg.token.trim()}` },
    });
    if (!res.ok) throw failure(res, await readJson(res), "Could not reach the table");
  },
};

const sheetsPost = async (cfg, body) => {
  const res = await request(cfg.url.trim(), {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...body, secret: cfg.secret || "" }),
  });
  const result = await readJson(res);
  if (!result) {
    throw new Error(
      "Unexpected response. Deploy the script as a web app that 'Anyone' can access.",
    );
  }
  if (!result.ok) throw new Error(result.error || "Failed to save");
};

const sheetsBackend = {
  label: "Google Sheets (Apps Script)",
  steps: [
    "1. Create a Google Sheet, open Extensions > Apps Script, and paste in integrations/google-apps-script.gs.",
    "2. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.",
    "3. Copy the web app URL below. Optionally set the same secret in the script and here.",
  ],
  fields: [
    {
      key: "url",
      label: "Web app URL",
      type: "url",
      placeholder: "https://script.google.com/macros/s/.../exec",
      required: true,
    },
    {
      key: "secret",
      label: "Shared secret (optional)",
      type: "password",
      placeholder: "Same value as SECRET in the script",
      help: "Anyone with the URL can add rows, so a secret is recommended.",
    },
  ],
  origins: () => ["https://script.google.com/*", "https://script.googleusercontent.com/*"],
  save: (cfg, payload) =>
    sheetsPost(cfg, {
      ...record(payload),
      tags: payload.tags.join(", "),
      saved_at: new Date().toISOString(),
    }),
  test: (cfg) => sheetsPost(cfg, { ping: true }),
};

export const BACKENDS = {
  api: apiBackend,
  supabase: supabaseBackend,
  airtable: airtableBackend,
  sheets: sheetsBackend,
};

export const isConfigured = (id, cfg) =>
  BACKENDS[id].fields.every((f) => !f.required || (cfg[f.key] || "").trim());

export const loadSettings = async () => {
  const stored = await chrome.storage.sync.get([
    "backend",
    "config",
    "apiKey",
    "apiEndpoint",
    "customPrompt",
  ]);
  const backend = BACKENDS[stored.backend] ? stored.backend : "api";
  const configs = {
    ...stored.config,
    api: { apiEndpoint: stored.apiEndpoint || "", apiKey: stored.apiKey || "" },
  };
  return { backend, configs, config: configs[backend] || {}, customPrompt: stored.customPrompt };
};

export const requestAccess = async (id, cfg) => {
  try {
    const origins = BACKENDS[id].origins(cfg);
    if (origins.length) await chrome.permissions.request({ origins });
  } catch {
    return;
  }
};
