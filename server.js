#!/usr/bin/env node
// Bidda Compliance MCP Server (local edition).
//
// A stdio Model Context Protocol server that exposes Bidda's full tool surface
// (25 tools). The MCP protocol is served LOCALLY by this process; only the
// underlying compliance DATA is fetched from Bidda's public REST API
// (https://bidda.com/api/v1). This is a real local server, not an MCP proxy.
//
// Two tiers of tools are declared here:
//   1. Free discovery and intelligence tools (11) run fully with no API key.
//      They read Bidda's public, no-auth datasets and return real results.
//   2. Subscriber and governance tools (14) - attestations, the run ledger,
//      change alerts, drift checks and OSCAL export - are stateful, key-bound
//      operations that execute on Bidda's hosted service. This edition declares
//      them with their full schemas and returns a clear, key-aware pointer to
//      run them on the hosted endpoint at https://bidda.com/mcp.
//
// The hosted server (all 25 tools live, including the paid vault tools) is a
// remote Streamable-HTTP endpoint at https://bidda.com/mcp.

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

// The jurisdiction facet index, cached after first use.
let _jur = null;
async function loadJurisdictionIndex() {
  if (_jur) return _jur;
  _jur = await getJSON(`${API}/jurisdiction-index.json`);
  return _jur;
}

const siteUrl = (id) => `${BASE}/intelligence/${id}`;

// Map friendly jurisdiction names/codes to the codes used in the facet index.
const JURISDICTION_ALIASES = {
  eu: "EU", europe: "EU", "european-union": "EU",
  us: "US", usa: "US", "united-states": "US", "us-ca": "US-CA", california: "US-CA",
  uk: "UK", gb: "UK", "united-kingdom": "UK", britain: "UK",
  au: "AU", australia: "AU",
  ca: "CA", canada: "CA",
  sg: "SG", singapore: "SG",
  za: "ZA", "south-africa": "ZA", "south africa": "ZA",
  in: "IN", india: "IN",
  de: "DE", germany: "DE",
  fr: "FR", france: "FR",
  jp: "JP", japan: "JP",
  cn: "CN", china: "CN",
  br: "BR", brazil: "BR",
  kr: "KR", "south-korea": "KR",
  ch: "CH", switzerland: "CH",
  mx: "MX", mexico: "MX",
  nz: "NZ", "new-zealand": "NZ",
  global: "Global", international: "International",
};
function normalizeJurisdiction(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const key = raw.toLowerCase();
  if (JURISDICTION_ALIASES[key]) return JURISDICTION_ALIASES[key];
  // Already a code such as "EU", "US-CA", "ZA".
  return raw.toUpperCase() === raw ? raw : raw.toUpperCase();
}

const TOOLS = [
  // ---- Free discovery + intelligence tools (run locally, no key) ----
  {
    name: "list_pillars",
    description:
      "List every sovereign compliance pillar (regulated domain) in the Bidda registry with its live node count. Bidda holds 10,000+ source-verified nodes across 39 pillars, including a MITRE layer spanning 6 frameworks (ATT&CK Enterprise, Mobile and ICS, D3FEND, CAPEC, ATLAS). Call this first to map the regulatory landscape.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "search_nodes",
    description:
      "Keyword search across the Bidda registry of source-verified compliance obligations. Returns matching nodes with their id, title, pillar, and a plain-language summary (BLUF). Every node traces to a primary legal source. Use to find the rule that governs a topic, law, standard, or MITRE technique. Examples: 'GDPR breach notification 72 hours', 'Basel III capital', 'SOC 2 Type II'.",
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
      "Walk the prerequisite tree for a compliance node. Returns the prior obligations a node depends on, up to max_depth levels deep, so an agent can see the full chain of rules it must already satisfy. Unlocking one node usually requires understanding several upstream nodes.",
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
    name: "get_crosswalk",
    description:
      "Return the cross-framework mapping dimensions for a node: which other regulations, standards, or jurisdictions the rule maps to (for example an EU right-to-erasure rule mapping to a US deletion right and a South African equivalent). The discovery view lists the available crosswalk dimensions; the full mapping values are part of the paid vault node.",
    inputSchema: {
      type: "object",
      properties: { node_id: { type: "string", description: "The node id to inspect crosswalks for." } },
      required: ["node_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_mitre_mapping",
    description:
      "MITRE technique lookup. Given a technique id from ATT&CK Enterprise (e.g. T1566, T1486), ATT&CK Mobile (T1474), ATT&CK ICS (T0883), D3FEND (D3-MFA), CAPEC (CAPEC-66), or ATLAS (AML.T0020), return the matching Bidda node and its discovery summary. The full control-family mappings (NIST 800-53, ISO 27001 Annex A, PCI DSS, NIS2, DORA, IEC 62443) are part of the vault node.",
    inputSchema: {
      type: "object",
      properties: { technique_id: { type: "string", description: "A MITRE technique id, e.g. 'T1566', 'T0883', 'D3-MFA', 'CAPEC-66', or 'AML.T0020'." } },
      required: ["technique_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_jurisdiction_bundle",
    description:
      "List the compliance nodes that apply in a specific jurisdiction (for example EU, US, UK, Australia, Singapore, India, Canada, China, South Africa, Japan, Brazil). Use when an agent enters a new market and needs the regulatory surface for that geography.",
    inputSchema: {
      type: "object",
      properties: {
        jurisdiction: { type: "string", description: "Jurisdiction code or name: eu, us, uk, au, sg, za, india, canada, china, japan, brazil, and others." },
        limit: { type: "integer", description: "Max nodes to return (default 25, max 100).", minimum: 1, maximum: 100 },
      },
      required: ["jurisdiction"],
      additionalProperties: false,
    },
  },
  {
    name: "browse_topics",
    description:
      "Browse the registry by cross-cutting topic (for example 'data breach notification', 'AI transparency', 'AML and KYC', 'logging and monitoring') across every pillar and jurisdiction. Returns each topic with its node, pillar, and jurisdiction counts. Topics sit on top of the 39 pillars without replacing them.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Optional substring to filter topic labels." } }, additionalProperties: false },
  },
  {
    name: "get_latest_changes",
    description:
      "Regulatory change feed: primary sources whose documents changed within the tracking window, with counts by status. Use to see what recently moved before relying on a cached rule.",
    inputSchema: { type: "object", properties: { limit: { type: "integer", description: "Max change entries to return (default 25, max 100).", minimum: 1, maximum: 100 } }, additionalProperties: false },
  },
  {
    name: "check_action_compliance",
    description:
      "Pre-flight compliance check: describe an intended action in natural language (for example 'process EU resident biometric data' or 'deploy an autonomous trading model in Singapore') and get a ranked list of regulations that may apply plus a risk indicator (LOW, MODERATE, or HIGH). The headline runtime gate for autonomous agents.",
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
  {
    name: "compare_jurisdictions",
    description:
      "Compare how different jurisdictions address a compliance topic side by side, including where their numeric thresholds differ (for example a breach-notification deadline of 72 hours versus 30 days). It surfaces the real rules and numbers; it does not rank which jurisdiction is stricter. Uses your Bidda subscription key when provided (a free trial counts).",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Topic to compare, for example 'data breach notification'." },
        api_key: { type: "string", description: "Optional Bidda subscription key (sent as x-bidda-api-key). A free trial counts." },
      },
      required: ["topic"],
      additionalProperties: false,
    },
  },

  // ---- Subscriber + governance tools (run on the hosted service with a key) ----
  {
    name: "drift_check",
    description:
      "Check whether compliance rules an agent has cached in its own memory are still current. Submit each node_id with the integrity hash you stored when you last grounded on it; get back, per rule, whether it is fresh, has drifted (content changed), or was withdrawn (instrument repealed), so the agent re-grounds before acting on stale rules. Requires a Bidda subscription key (a free trial counts).",
    inputSchema: {
      type: "object",
      properties: {
        anchors: {
          type: "array",
          description: "The cached rules to check.",
          items: {
            type: "object",
            properties: {
              node_id: { type: "string", description: "The rule (node_id)." },
              hash: { type: "string", description: "The sha256:... integrity hash you cached for it (omit to just fetch the current fingerprint)." },
            },
            required: ["node_id"],
          },
        },
        api_key: { type: "string", description: "Your Bidda subscription API key. A free trial counts." },
      },
      required: ["anchors", "api_key"],
      additionalProperties: false,
    },
  },
  {
    name: "obligation_deltas",
    description:
      "The obligation-level change feed: primary sources whose content changed (or whose node was withdrawn), mapped to the Bidda obligation nodes they affect, filterable by time, pillar, or specific nodes. Answers 'what obligations changed since I last reviewed?'. Requires a Bidda subscription key (a free trial counts).",
    inputSchema: {
      type: "object",
      properties: {
        since: { type: "string", description: "Optional ISO timestamp; only deltas newer than this are returned." },
        pillar: { type: "string", description: "Optional: restrict to one pillar." },
        nodes: { type: "array", items: { type: "string" }, description: "Optional: restrict to deltas affecting these node_ids." },
        limit: { type: "integer", description: "Optional: max deltas to return (default 100, max 500).", minimum: 1, maximum: 500 },
        api_key: { type: "string", description: "Your Bidda subscription API key. A free trial counts." },
      },
      required: ["api_key"],
      additionalProperties: false,
    },
  },
  {
    name: "watch_changes",
    description:
      "Subscribe to regulatory change alerts: watch specific rules and/or whole pillars and get notified by email or webhook when their primary source changes. Requires a Bidda subscription key (a free trial counts).",
    inputSchema: {
      type: "object",
      properties: {
        nodes: { type: "array", items: { type: "string" }, description: "node_ids to watch." },
        pillars: { type: "array", items: { type: "string" }, description: "Pillar names to watch." },
        channels: { type: "object", description: "Delivery channels, for example { \"email\": true, \"webhook\": false }. Defaults to email." },
        webhook_url: { type: "string", description: "Required if the webhook channel is enabled." },
        label: { type: "string", description: "Optional name for the alert." },
        api_key: { type: "string", description: "Your Bidda subscription API key. A free trial counts." },
      },
      required: ["api_key"],
      additionalProperties: false,
    },
  },
  {
    name: "point_in_time",
    description:
      "Get a signed record of which committed version of a rule was authoritative at a specific past date, anchored to the public history chain. Useful when an agent must show what a rule said at the moment it acted. Requires a Bidda subscription key (a free trial counts).",
    inputSchema: {
      type: "object",
      properties: {
        node_id: { type: "string", description: "The rule (node_id)." },
        as_of: { type: "string", description: "ISO date or time, or epoch milliseconds. Defaults to now." },
        api_key: { type: "string", description: "Your Bidda subscription API key. A free trial counts." },
      },
      required: ["node_id", "api_key"],
      additionalProperties: false,
    },
  },
  {
    name: "gap_check",
    description:
      "Given the compliance rules a team says it covers, return the prerequisite rules Bidda's dependency graph links to them that were not listed (the missed-prerequisite gaps), plus any covered rule the registry marks withdrawn. A coverage aid for a qualified reviewer; it does not determine compliance. Requires a Bidda subscription key (a free trial counts).",
    inputSchema: {
      type: "object",
      properties: {
        nodes: { type: "array", items: { type: "string" }, description: "The node_ids you cover (max 200)." },
        depth: { type: "integer", description: "Optional: how many dependency hops to walk (1-3, default 1).", minimum: 1, maximum: 3 },
        api_key: { type: "string", description: "Your Bidda subscription API key. A free trial counts." },
      },
      required: ["nodes", "api_key"],
      additionalProperties: false,
    },
  },
  {
    name: "create_attestation",
    description:
      "Create a signed, time-stamped record of which Bidda rules a person or AI agent relied on for a decision. Returns a record id and a public verify URL so anyone can later confirm the record has not been changed. Useful for agents that must keep an audit trail of what they checked. Requires a Bidda subscription key (a free trial counts).",
    inputSchema: {
      type: "object",
      properties: {
        agent: { type: "string", description: "The system or AI agent that made the decision." },
        nodes: { type: "array", items: { type: "string" }, description: "node_ids that were checked (max 50)." },
        action: { type: "string", description: "Optional: what the agent did." },
        workflow_steps_followed: { type: "array", items: { type: "string" }, description: "Optional: steps the agent followed." },
        api_key: { type: "string", description: "Your Bidda subscription API key. A free trial counts." },
      },
      required: ["agent", "nodes", "api_key"],
      additionalProperties: false,
    },
  },
  {
    name: "create_control_attestation",
    description:
      "Sign a tamper-evident record of one of your own controls or policies and the Bidda obligation nodes it maps to. Each obligation is pinned to its current version and integrity hash at signing time, so the record shows what the control was mapped against on that date. This is the design-side evidence; run receipts are the operating-side evidence. Requires a Bidda subscription key (a free trial counts).",
    inputSchema: {
      type: "object",
      properties: {
        control: { type: "string", description: "The name of your control or policy." },
        statement: { type: "string", description: "What the control does or asserts (plain text)." },
        nodes: { type: "array", items: { type: "string" }, description: "Obligation node_ids the control maps to (max 50)." },
        framework: { type: "string", description: "Optional: the framework you are mapping to (e.g. 'EU AI Act')." },
        control_owner: { type: "string", description: "Optional: the role or team that owns the control." },
        control_status: { type: "string", description: "Optional: implemented, planned, or in-progress." },
        effective_date: { type: "string", description: "Optional: YYYY-MM-DD the control took effect." },
        evidence_ref: { type: "string", description: "Optional: a reference, URL, or hash to your own evidence (kept by you)." },
        api_key: { type: "string", description: "Your Bidda subscription API key. A free trial counts." },
      },
      required: ["control", "statement", "nodes", "api_key"],
      additionalProperties: false,
    },
  },
  {
    name: "open_run",
    description:
      "Open a run ledger: a signed, tamper-evident log of what an agent does across a whole task or conversation (for example a support-bot chat). Returns a run_id. Record one entry per turn with record_run_entry, then seal_run to get a single signed Run Receipt. Requires a Bidda subscription key (a free trial counts).",
    inputSchema: {
      type: "object",
      properties: {
        agent: { type: "string", description: "The system or agent running the task or conversation." },
        label: { type: "string", description: "Optional human label, for example the chat or ticket id." },
        api_key: { type: "string", description: "Your Bidda subscription API key. A free trial counts." },
      },
      required: ["agent", "api_key"],
      additionalProperties: false,
    },
  },
  {
    name: "record_run_entry",
    description:
      "Append one entry to an open run: which Bidda rules the agent consulted, what it decided, and the end user's input (as text via note, or privately as input_hash). Each entry is hash-chained to the previous one. Requires a Bidda subscription key (a free trial counts).",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string", description: "The run_id returned by open_run." },
        entry_type: { type: "string", description: "Optional: node_consulted, action_checked, decision, or note. Defaults to note." },
        nodes: { type: "array", items: { type: "string" }, description: "Optional node_ids the agent consulted (max 50)." },
        action: { type: "string", description: "Optional: an action the agent took or checked." },
        decision: { type: "string", description: "Optional: what the agent decided or did this turn." },
        note: { type: "string", description: "Optional: the end user's message as text." },
        model: { type: "string", description: "Optional: the model id/version that produced this decision." },
        input_hash: { type: "string", description: "Optional: a sha256:... hash of the user's message instead of the text." },
        output_hash: { type: "string", description: "Optional: a sha256:... hash of the agent's output." },
        subject_hash: { type: "string", description: "Optional: a sha256:... hash of an end-user identifier. Hash only, never plaintext." },
        verify_nodes: { type: "boolean", description: "Optional: pin each node to its current version and integrity hash (proof, not just a claim)." },
        api_key: { type: "string", description: "Your Bidda subscription API key. A free trial counts." },
      },
      required: ["run_id", "api_key"],
      additionalProperties: false,
    },
  },
  {
    name: "consult_node",
    description:
      "The one-call governed turn: fetch the full vault node (this consumes one call on your key, exactly like unlocking a node) and record a verified node_consulted entry for it on an open run, in a single step. The entry pins the node to its current version and integrity hash, so the run receipt proves what the agent actually consulted. Use this instead of get_node when you are inside a run. Requires a Bidda subscription key (a free trial counts).",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string", description: "The open run to record into (from open_run)." },
        node_id: { type: "string", description: "The rule to fetch and record." },
        action: { type: "string", description: "Optional: an action the agent took or checked." },
        decision: { type: "string", description: "Optional: what the agent decided using this node." },
        user_input: { type: "string", description: "Optional: the end user's message as text." },
        input_hash: { type: "string", description: "Optional: a sha256:... hash of the user's message instead of the text." },
        subject_hash: { type: "string", description: "Optional: a sha256:... hash of an end-user identifier. Hash only." },
        model: { type: "string", description: "Optional: the model id/version making the decision." },
        api_key: { type: "string", description: "Your Bidda subscription API key. A free trial counts." },
      },
      required: ["run_id", "node_id", "api_key"],
      additionalProperties: false,
    },
  },
  {
    name: "seal_run",
    description:
      "Seal an open run into one signed Run Receipt covering every entry, with a public verify URL. Idempotent: sealing an already-sealed run returns the same receipt. Requires a Bidda subscription key (a free trial counts).",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string", description: "The run_id to seal." },
        api_key: { type: "string", description: "Your Bidda subscription API key. A free trial counts." },
      },
      required: ["run_id", "api_key"],
      additionalProperties: false,
    },
  },
  {
    name: "get_run",
    description:
      "Fetch a run and its entries. The owner can read an open or sealed run (pass api_key); a sealed run is also publicly readable by id and reports whether its signature is valid.",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string", description: "The run_id to fetch." },
        api_key: { type: "string", description: "Optional: your Bidda key, required to read your own still-open run." },
      },
      required: ["run_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_audit_pack",
    description:
      "Export a run as a governance evidence pack: the signed receipt, every entry, a roll-up of the nodes consulted (with pinned versions and hashes), an independent hash-chain and Merkle integrity self-check, and a coversheet mapping the receipt to the record-keeping obligations it supports (EU AI Act Art. 12 and 26, ISO/IEC 42001, NIST AI RMF). A sealed run is readable by id; a still-open run's draft pack needs your api_key.",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string", description: "The run to export." },
        api_key: { type: "string", description: "Optional: your Bidda key, required for a still-open (unsealed) run." },
      },
      required: ["run_id"],
      additionalProperties: false,
    },
  },
  {
    name: "oscal_assessment_results",
    description:
      "Export a governed run's evidence as a NIST OSCAL assessment-results document (the machine-readable format GRC and audit tooling consumes): reviewed-controls (the obligation nodes consulted), observations (each pinned to its version and integrity hash), and props recording the independent integrity self-check. A sealed run is readable by id; a still-open run needs your api_key.",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string", description: "The run to export as OSCAL assessment-results." },
        api_key: { type: "string", description: "Optional: your Bidda key, required for a still-open (unsealed) run." },
      },
      required: ["run_id"],
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

// A clear, honest pointer for the subscriber/governance tools: they run on the
// hosted service, which holds the run ledger, signing keys and subscription
// state. This local edition declares them with full schemas and routes
// execution to the hosted endpoint.
function hostedTool(tool, summary, extra = {}) {
  return {
    tool,
    tier: "subscriber",
    summary,
    requires: "an active Bidda subscription API key (a free trial counts)",
    run_it: {
      hosted_mcp_server: `${BASE}/mcp`,
      rest_api: `${API}`,
      developers: `${BASE}/developers`,
      pricing: `${BASE}/pricing`,
    },
    note: "This governed tool executes on Bidda's hosted service. Call it on the hosted Bidda MCP server (URL above) with your api_key, or use the matching REST endpoint.",
    ...extra,
  };
}

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

  async get_crosswalk({ node_id }) {
    if (!node_id) throw new Error("node_id is required");
    const n = await getJSON(`${API}/nodes/${encodeURIComponent(node_id)}.json`);
    const dims = (n.crosswalks && n.crosswalks._available_keys) || [];
    return {
      node_id: n.node_id,
      title: n.title,
      pillar: n.domain,
      crosswalk_dimensions: dims,
      note: "Discovery lists the available crosswalk dimensions. The full mapping values are part of the paid vault node.",
      vault_url: `${API}/vault/nodes/${n.node_id}.json`,
      url: siteUrl(n.node_id),
    };
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

  async get_mitre_mapping({ technique_id }) {
    if (!technique_id) throw new Error("technique_id is required");
    const idx = await loadIndex();
    const raw = String(technique_id).toLowerCase().trim();
    const dashed = raw.replace(/\./g, "-");
    // Word-boundary-ish match so "t1566" does not match "t15660".
    const re = new RegExp(`(^|[^a-z0-9])(${raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|${dashed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})([^a-z0-9]|$)`);
    const hits = idx.filter((n) => re.test(`${n.node_id} ${n.title}`.toLowerCase()));
    if (!hits.length) {
      return { technique_id, match_count: 0, results: [], note: "No Bidda node found for that technique id. Try list_pillars for the MITRE pillars, or search_nodes." };
    }
    return {
      technique_id,
      match_count: hits.length,
      results: hits.slice(0, 10).map(discovery),
      note: "The full control-family mappings (NIST 800-53, ISO 27001 Annex A, PCI DSS, NIS2, DORA, IEC 62443) are part of the vault node.",
    };
  },

  async get_jurisdiction_bundle({ jurisdiction, limit = 25 }) {
    if (!jurisdiction) throw new Error("jurisdiction is required");
    const jur = await loadJurisdictionIndex();
    const code = normalizeJurisdiction(jurisdiction);
    const lim = Math.min(Math.max(limit | 0 || 25, 1), 100);
    const all = Array.isArray(jur.nodes) ? jur.nodes : [];
    const matches = all.filter((n) => String(n.j || "").toUpperCase() === code.toUpperCase());
    const available = Object.keys(jur.by_jurisdiction || {}).sort();
    return {
      jurisdiction: code,
      total_in_jurisdiction: (jur.by_jurisdiction && jur.by_jurisdiction[code]) || matches.length,
      returned: Math.min(matches.length, lim),
      available_jurisdictions: available,
      results: matches.slice(0, lim).map((n) => ({
        node_id: n.id,
        title: n.t,
        pillar: n.d,
        jurisdiction: n.j,
        instrument_type: n.it,
        last_updated: n.u,
        url: siteUrl(n.id),
      })),
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

  async compare_jurisdictions({ topic, api_key }) {
    if (!topic) throw new Error("topic is required");
    try {
      const headers = api_key ? { "x-bidda-api-key": api_key } : {};
      return await getJSON(`${API}/compare?topic=${encodeURIComponent(topic)}`, { headers });
    } catch (err) {
      return hostedTool("compare_jurisdictions", "Compare a topic across jurisdictions, including where the numbers differ.", { error: err.message });
    }
  },

  // ---- Subscriber + governance tools: run on the hosted service ----
  async drift_check() { return hostedTool("drift_check", "Check cached rules for freshness, drift, or withdrawal against their integrity hashes."); },
  async obligation_deltas() { return hostedTool("obligation_deltas", "Obligation-level change feed mapped to the nodes each source change affects."); },
  async watch_changes() { return hostedTool("watch_changes", "Subscribe to email or webhook alerts when a watched rule or pillar changes."); },
  async point_in_time() { return hostedTool("point_in_time", "Signed record of which version of a rule was authoritative at a past date."); },
  async gap_check() { return hostedTool("gap_check", "Return the prerequisite obligations a coverage list missed, plus any withdrawn rules."); },
  async create_attestation() { return hostedTool("create_attestation", "Sign a time-stamped record of the rules an agent relied on, with a public verify URL."); },
  async create_control_attestation() { return hostedTool("create_control_attestation", "Sign a tamper-evident record of your control and the obligation nodes it maps to."); },
  async open_run() { return hostedTool("open_run", "Open a signed, hash-chained run ledger and return a run_id."); },
  async record_run_entry() { return hostedTool("record_run_entry", "Append one hash-chained entry to an open run."); },
  async consult_node() { return hostedTool("consult_node", "One-call governed turn: fetch the vault node and record a verified consulted-node entry."); },
  async seal_run() { return hostedTool("seal_run", "Seal an open run into a single signed Run Receipt with a public verify URL."); },
  async get_run() { return hostedTool("get_run", "Fetch a run and its entries. A sealed run is publicly readable by id on the hosted service.", { public_read: "A sealed run is readable by id at the hosted endpoint, no key required." }); },
  async get_audit_pack() { return hostedTool("get_audit_pack", "Export a run as a governance evidence pack with an integrity self-check.", { public_read: "A sealed run's pack is readable by id at the hosted endpoint, no key required." }); },
  async oscal_assessment_results() { return hostedTool("oscal_assessment_results", "Export a governed run as a NIST OSCAL assessment-results document.", { public_read: "A sealed run's OSCAL export is readable by id at the hosted endpoint, no key required." }); },
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
  console.error("bidda-compliance MCP server running on stdio (25 tools)");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
