#!/usr/bin/env node
// Bidda Compliance MCP Server (local edition).
//
// A stdio Model Context Protocol server that exposes Bidda's free discovery and
// intelligence tools. The MCP protocol is served LOCALLY by this process; only
// the underlying compliance DATA is fetched from Bidda's public REST API
// (https://bidda.com/api/v1), which needs no authentication for the discovery
// tier. This is a real local server, not an MCP proxy.
//
// The full hosted server (all 25 tools, including subscriber and paid vault
// tools) is available as a remote Streamable-HTTP endpoint at
// https://bidda.com/mcp. This local edition implements the free tools so it can
// run anywhere with no key.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE = (process.env.BIDDA_BASE_URL || "https://bidda.com").replace(/\/+$/, "");
const API = `${BASE}/api/v1`;
const UA = "bidda-mcp-server/1.6.0 (+https://bidda.com)";

async function getJSON(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { "user-agent": UA, accept: "application/json", ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`${opts.method || "GET"} ${url} -> HTTP ${res.status}`);
  return res.json();
}

// The discovery index (10,000+ nodes) is cached in memory after the first call.
let _index = null;
async function loadIndex() {
  if (_index) return _index;
  const data = await getJSON(`${API}/nodes/index.json`);
  _index = Array.isArray(data) ? data : data.nodes || [];
  return _index;
}

const siteUrl = (id) => `${BASE}/intelligence/${id}`;

const TOOLS = [
  {
    name: "list_pillars",
    description:
      "List every sovereign compliance pillar (regulated domain) in the Bidda registry with its live node count. Call this first to map the regulatory landscape.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "search_nodes",
    description:
      "Keyword search across the Bidda registry of source-verified compliance obligations. Returns matching nodes with their id, title, pillar, and a plain-language summary (BLUF). Use to find the rule that governs a topic, law, standard, or MITRE technique.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keywords, a regulation name, or a topic (e.g. 'GDPR breach notification')." },
        pillar: { type: "string", description: "Optional exact pillar/domain name to restrict results (see list_pillars)." },
        limit: { type: "integer", description: "Max results (default 10, max 50).", minimum: 1, maximum: 50 },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_node",
    description:
      "Fetch the free discovery view of a single compliance node by its id: title, pillar, version, last-updated date, plain-language summary (BLUF), dependency ids, and available crosswalk dimensions. The full 13-key vault node (deterministic workflow, actionable schema, primary citations) is available via the paid vault API.",
    inputSchema: {
      type: "object",
      properties: { node_id: { type: "string", description: "The node id, e.g. 'eu-ai-act-article-10-data-governance-training'." } },
      required: ["node_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_dependency_chain",
    description:
      "Walk the prerequisite tree for a compliance node. Returns the prior obligations a node depends on, up to max_depth levels deep, so an agent can see the full chain of rules it must already satisfy.",
    inputSchema: {
      type: "object",
      properties: {
        node_id: { type: "string", description: "The node id to start from." },
        max_depth: { type: "integer", description: "How many dependency levels to walk (default 2, max 5).", minimum: 1, maximum: 5 },
      },
      required: ["node_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_latest_changes",
    description:
      "Regulatory change feed: primary sources whose documents changed within the tracking window, with counts by status. Use to see what recently moved before relying on a cached rule.",
    inputSchema: { type: "object", properties: { limit: { type: "integer", description: "Max change entries to return (default 25, max 100).", minimum: 1, maximum: 100 } }, additionalProperties: false },
  },
  {
    name: "browse_topics",
    description:
      "Browse the registry by cross-cutting topic (e.g. 'data breach notification', 'AI transparency', 'logging & monitoring') across every pillar and jurisdiction. Returns each topic with its node, pillar, and jurisdiction counts.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Optional substring to filter topic labels." } }, additionalProperties: false },
  },
  {
    name: "check_action_compliance",
    description:
      "Pre-flight compliance check: describe an action in natural language (e.g. 'process EU resident biometric data') and get a ranked list of regulations that may apply plus a risk indicator (LOW / MODERATE / HIGH). The headline runtime gate for autonomous agents.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "The action or change to assess, in plain language." },
        jurisdiction: { type: "string", description: "Optional jurisdiction hint (e.g. 'eu', 'us', 'uk')." },
        limit: { type: "integer", description: "Max regulatory matches to return (default 10, max 25).", minimum: 1, maximum: 25 },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
];

const discovery = (n) => ({
  node_id: n.node_id,
  title: n.title,
  pillar: n.domain,
  version: n.version,
  last_updated: n.last_updated,
  bluf: n.bluf,
  dependencies: n.dependencies || [],
  url: siteUrl(n.node_id),
});

const handlers = {
  async list_pillars() {
    const idx = await loadIndex();
    const counts = new Map();
    for (const n of idx) counts.set(n.domain, (counts.get(n.domain) || 0) + 1);
    const pillars = [...counts.entries()].map(([pillar, nodes]) => ({ pillar, nodes })).sort((a, b) => b.nodes - a.nodes);
    return { total_nodes: idx.length, pillar_count: pillars.length, pillars };
  },

  async search_nodes({ query, pillar, limit = 10 }) {
    const idx = await loadIndex();
    const q = String(query || "").toLowerCase().trim();
    const lim = Math.min(Math.max(limit | 0 || 10, 1), 50);
    const hits = idx.filter((n) => {
      if (pillar && n.domain !== pillar) return false;
      const hay = `${n.title} ${n.bluf} ${n.domain} ${n.node_id}`.toLowerCase();
      return q.split(/\s+/).every((t) => hay.includes(t));
    });
    return { query, pillar: pillar || null, match_count: hits.length, results: hits.slice(0, lim).map(discovery) };
  },

  async get_node({ node_id }) {
    if (!node_id) throw new Error("node_id is required");
    const n = await getJSON(`${API}/nodes/${encodeURIComponent(node_id)}.json`);
    return { ...discovery(n), crosswalk_dimensions: (n.crosswalks && n.crosswalks._available_keys) || [], vault_url: `${API}/vault/nodes/${node_id}.json` };
  },

  async get_dependency_chain({ node_id, max_depth = 2 }) {
    if (!node_id) throw new Error("node_id is required");
    const idx = await loadIndex();
    const byId = new Map(idx.map((n) => [n.node_id, n]));
    if (!byId.has(node_id)) throw new Error(`Unknown node_id: ${node_id}`);
    const depth = Math.min(Math.max(max_depth | 0 || 2, 1), 5);
    const seen = new Set([node_id]);
    const edges = [];
    let frontier = [node_id];
    for (let d = 0; d < depth && frontier.length; d++) {
      const next = [];
      for (const id of frontier) {
        for (const dep of (byId.get(id)?.dependencies) || []) {
          edges.push({ from: id, to: dep, resolves: byId.has(dep), title: byId.get(dep)?.title || null });
          if (!seen.has(dep)) { seen.add(dep); next.push(dep); }
        }
      }
      frontier = next;
    }
    return { node_id, max_depth: depth, prerequisite_count: seen.size - 1, edges };
  },

  async get_latest_changes({ limit = 25 }) {
    const data = await getJSON(`${API}/changes.json`);
    const lim = Math.min(Math.max(limit | 0 || 25, 1), 100);
    const changes = Array.isArray(data.regulatory_changes) ? data.regulatory_changes.slice(0, lim) : [];
    return {
      window_days: data.window_days,
      generated_at: data.generated_at,
      total_sources_tracked: data.total_sources_tracked,
      regulatory_changes_in_window: data.regulatory_changes_in_window,
      by_status: data.regulatory_by_status || null,
      changes,
    };
  },

  async browse_topics({ query } = {}) {
    const data = await getJSON(`${API}/topics-index.json`);
    let topics = Array.isArray(data.topics) ? data.topics : [];
    if (query) { const q = String(query).toLowerCase(); topics = topics.filter((t) => `${t.label} ${t.id}`.toLowerCase().includes(q)); }
    return {
      total_golden_nodes: data.total_golden_nodes,
      topic_count: topics.length,
      topics: topics.map((t) => ({ id: t.id, label: t.label, node_count: t.node_count, pillar_count: t.pillar_count, jurisdiction_count: t.jurisdiction_count })),
    };
  },

  async check_action_compliance({ action, jurisdiction, limit = 10 }) {
    if (!action) throw new Error("action is required");
    const body = { content: action, limit: Math.min(Math.max(limit | 0 || 10, 1), 25) };
    if (jurisdiction) body.jurisdiction = jurisdiction;
    const data = await getJSON(`${BASE}/scan`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return {
      action,
      risk_level: data.risk_level,
      total_matches: data.total_matches,
      summary: data.summary,
      matches: (data.matches || []).map((m) => ({ node_id: m.node_id, title: m.title, pillar: m.pillar, score: m.score, bluf: m.bluf, url: m.site_url || siteUrl(m.node_id) })),
    };
  },
};

const server = new Server(
  { name: "bidda-compliance", version: "1.6.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  const handler = handlers[name];
  if (!handler) return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
  try {
    const result = await handler(args);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return { isError: true, content: [{ type: "text", text: `Error calling ${name}: ${err.message}` }] };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio transport: do not write anything else to stdout; logs go to stderr.
  console.error("bidda-compliance MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
