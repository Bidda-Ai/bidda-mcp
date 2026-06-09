# Bidda Sovereign Intelligence MCP Server

> 9,500 cryptographically-verified regulatory compliance nodes across 39 sovereign pillars — zero hallucination by design.

[![Glama score](https://glama.ai/mcp/servers/bidda-compliance/badges/score.svg)](https://glama.ai/mcp/servers/bidda-compliance)
[![CISA Secure by Design](https://img.shields.io/badge/CISA-Secure%20by%20Design%20Pledge-blue)](https://bidda.com/cisa/secure-by-design)

## What is Bidda?

Bidda is a sovereign compliance intelligence registry. Every node traces to a primary legal source (avg 7 citations per node) and contains machine-executable deterministic logic — not summaries, not PDFs, not paraphrased commentary.

**Pillars covered:** EU AI Act · GDPR · NIST AI 600-1 · Basel III · HIPAA · DORA · FATF · SOC 2 · ISO 27001 · CCPA · PIPEDA · APRA CPS 234 · MiCA · POPIA · plus a MITRE layer across ATT&CK Enterprise/Mobile/ICS, D3FEND, ATLAS and CAPEC — and 150+ others across 39 compliance domains.

## MCP Endpoint

```
POST https://bidda.com/mcp
GET  https://bidda.com/mcp   (server info — open this in a browser to inspect)
```

Transport: Streamable HTTP (MCP 2025-03-26)
No API key required for the discovery tier.

## Tools (9)

| Tool | Description |
|------|-------------|
| `list_pillars` | List all 39 compliance pillars with live node counts |
| `search_nodes` | Search by keyword across 9,500 nodes — returns title, ID, pillar, and BLUF (plain-language obligation) |
| `get_node` | Fetch a specific node by ID — returns summary + link to machine-executable workflow |
| `get_dependency_chain` | Walk the prerequisite chain for a node (1–4 hops). Plan a full compliance posture from one entry node. |
| `get_crosswalk` | Cross-framework mapping dimensions for a node (e.g. GDPR Art 17 → CCPA right-to-delete → POPIA Sec 24) |
| `get_latest_changes` | Regulatory change feed — most recently updated nodes, optional pillar filter |
| `get_jurisdiction_bundle` | All nodes that apply in a specific jurisdiction (EU, US, UK, AU, SG, IN, CA, CN, ZA, JP, BR and others) |
| `get_mitre_mapping` | MITRE technique ID → Bidda node + mapped NIST/ISO/PCI/HIPAA/NIS2/DORA controls. Across 6 frameworks. |
| `check_action_compliance` | Pre-flight runtime check. Describe an intended action in natural language; get ranked applicable regulations + LOW/MODERATE/HIGH risk indicator. |

The discovery responses for every tool are **free**. Full vault unlock (`deterministic_workflow`, `actionable_schema`, full `primary_citations`) costs $0.01 per node via Skyfire JWT or USDC on Base.

## Quick Start — Claude.ai / Claude Desktop / Cursor / any MCP HTTP client

Point your MCP client at:

```
https://bidda.com/mcp
```

That's it — no install, no API key, no config file. The discovery tier works immediately. The full server-info manifest is available at `GET https://bidda.com/mcp` (open in a browser to inspect available tools).

## Example Queries

```
list_pillars()
search_nodes("GDPR data breach notification 72 hours")
search_nodes("Basel III capital requirements", pillar="Banking & Global Finance")
search_nodes("FATF travel rule crypto")
get_node("eu-ai-act-article-13-transparency")
get_dependency_chain("nist-csf-2-0-govern", max_depth=3)
get_crosswalk("gdpr-article-17-right-to-erasure")
get_jurisdiction_bundle("singapore", limit=25)
get_mitre_mapping("T1566")            # ATT&CK Enterprise (phishing)
get_mitre_mapping("AML.T0020")        # ATLAS (AI-specific)
check_action_compliance("process EU resident biometric data", jurisdiction="eu")
```

## Coverage (live numbers via `list_pillars()`)

| Pillar | Approx. nodes |
|--------|-------|
| Cybersecurity | ~1,900 |
| Legal & IP Sovereignty | ~700 |
| Banking & Global Finance | ~580 |
| AI Governance & Law | ~570 |
| Medical & Healthcare | ~325 |
| Sustainability & ESG | ~285 |
| Workplace | ~280 |
| + 32 more pillars | — |

For exact live counts, call `list_pillars()` — the manifest at `GET https://bidda.com/mcp` returns the current totals dynamically.

Full coverage browser: [bidda.com/intelligence](https://bidda.com/intelligence)

## Why Zero Hallucination?

Every node has:
- **Primary legal citations** — real instruments, real URLs, real section numbers (avg 7 per node)
- **Deterministic workflow** — machine-executable steps, not prose summaries
- **Integrity hash** — cryptographic fingerprint of the node content
- **Source integrity watcher** — regular TLS + content fingerprint checks against live regulator URLs, results published at `/api/v1/registry-health.json`
- **Verbatim mandate on amendments** — every regulatory amendment is byte-for-byte quote-justified against the source text before it can change a node

No inference without a regulatory anchor. No blog posts. No secondary commentary. No Wikipedia.

## CISA Secure by Design

Bidda has publicly attested to the [CISA Secure by Design Pledge](https://bidda.com/cisa/secure-by-design) — the seven public goals U.S. Cybersecurity & Infrastructure Security Agency asks software manufacturers to commit to. Additional Bidda × CISA mappings:

- **CISA CPG crosswalk** — bidirectional mapping between Bidda compliance nodes and CISA's Cybersecurity Performance Goals: [bidda.com/cisa/cpg-crosswalk](https://bidda.com/cisa/cpg-crosswalk)
- **CISA Free Tools catalogue** — no-cost capabilities Bidda offers federal, SLTT and critical-infrastructure defenders: [bidda.com/cisa/free](https://bidda.com/cisa/free)

## Registry Health

```
GET https://bidda.com/api/v1/registry-health.json
```

Live integrity-check results: source URL liveness, verification coverage %, regulatory change detection categories, with a public timestamp on the last sweep.

## Links

- Website: [bidda.com](https://bidda.com)
- Developer docs: [bidda.com/developers](https://bidda.com/developers)
- Full node registry: [bidda.com/intelligence](https://bidda.com/intelligence)
- CISA programs: [bidda.com/cisa](https://bidda.com/cisa)
- Verify a node: [bidda.com/verify](https://bidda.com/verify)
- Methodology: [bidda.com/methodology](https://bidda.com/methodology)
- Contact: info@bidda.com
