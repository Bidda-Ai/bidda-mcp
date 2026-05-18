# Bidda Sovereign Intelligence MCP Server

> 5,835 cryptographically-verified regulatory compliance nodes across 34 pillars + 203 MITRE nodes across 6 frameworks - zero hallucination by design.

[![Glama score](https://glama.ai/mcp/servers/bidda-compliance/badges/score.svg)](https://glama.ai/mcp/servers/bidda-compliance)

## What is Bidda?

Bidda is a sovereign compliance intelligence registry. Every node traces to a primary legal source (avg 7 citations per node) and contains machine-executable deterministic logic - not summaries, not PDFs, not paraphrased commentary.

**Pillars covered:** EU AI Act, GDPR, NIST AI 600-1, Basel III, HIPAA, DORA, FATF, SOC 2, ISO 27001, CCPA, PIPEDA, APRA CPS 234, MiCA, and 150+ others across 34 compliance domains plus 6 MITRE frameworks (ATT&CK Enterprise, ATT&CK Mobile, ATT&CK ICS, D3FEND, ATLAS, CAPEC).

## MCP Endpoint

```
POST https://bidda.com/mcp
GET  https://bidda.com/mcp   (server info)
```

Transport: Streamable HTTP (MCP 2025-03-26)
No API key required for discovery tier.

## Tools

| Tool | Description |
|------|-------------|
| `list_pillars` | List all 34 compliance pillars with node counts. Use this first to discover available domains. |
| `search_nodes` | Search by keyword across 5,835 nodes - returns title, ID, pillar, and BLUF (plain-language obligation). |
| `get_node` | Fetch a specific node by ID - returns full summary + link to machine-executable workflow. |
| `get_dependency_chain` | Walk the prerequisite chain for a node. Returns the full dependency tree (depth 2 default, max 4). |
| `get_crosswalk` | Return cross-framework mapping dimensions for a node (e.g. GDPR Art 17 -> CCPA -> POPIA Section 24). |
| `get_latest_changes` | List the most recently updated nodes - the regulatory change feed. Filter by pillar. |
| `get_jurisdiction_bundle` | Return all nodes that apply in a specific jurisdiction (EU, US, UK, AU, SG, IN, CA, ZA, JP, BR and more). |
| `get_mitre_mapping` | Given a MITRE technique ID, return the Bidda node plus mapped compliance obligations (NIST 800-53, ISO 27001, PCI DSS, NIS2, HIPAA, DORA). |
| `check_action_compliance` | Pre-flight regulatory check. Describe an intended action and receive ranked applicable regulations with a risk indicator (LOW/MODERATE/HIGH). |

## Quick Start - Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bidda-compliance": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-fetch", "https://bidda.com/mcp"]
    }
  }
}
```

Or add the URL directly if your MCP client supports HTTP transport:

```
https://bidda.com/mcp
```

## Example Queries

```
search_nodes("GDPR data breach notification 72 hours")
search_nodes("Basel III capital requirements", pillar="Banking & Global Finance")
search_nodes("FATF travel rule crypto")
get_node("eu-ai-act-article-13-transparency")
get_node("us-hipaa-privacy-rule")
list_pillars()
get_jurisdiction_bundle("EU")
get_mitre_mapping("T1190")
check_action_compliance("process EU resident biometric data for fraud detection")
get_dependency_chain("eu-gdpr-article-35-dpia")
```

## Coverage

| Pillar | Nodes |
|--------|-------|
| Cybersecurity | 620+ |
| AI Governance & Law | 324+ |
| Banking & Global Finance | 351+ |
| Legal & IP Sovereignty | 275+ |
| Sustainability & ESG | 147+ |
| Workplace | 159+ |
| Medical & Healthcare | 114+ |
| + 27 more pillars | -- |
| MITRE ATT&CK Enterprise | 50 techniques / 14 tactics |
| MITRE D3FEND | 27 techniques / 7 tactics |
| MITRE ATLAS | 111 techniques / 16 tactics |
| CAPEC | 30 nodes |

Full coverage: [bidda.com/intelligence](https://bidda.com/intelligence)

## Why Zero Hallucination?

Every node has:
- **Primary legal citations** - real instruments, real URLs, real section numbers (avg 7 per node)
- **Deterministic workflow** - machine-executable steps, not prose summaries
- **Integrity hash** - cryptographic fingerprint of the node content
- **Source watcher** - weekly TLS + content fingerprint check against live source URLs

No inference without a regulatory anchor. No blog posts. No secondary commentary.

## Discovery Manifest

```
https://bidda.com/.well-known/mcp.json
```

## Links

- Website: [bidda.com](https://bidda.com)
- Developer docs: [bidda.com/developers](https://bidda.com/developers)
- Full node registry: [bidda.com/intelligence](https://bidda.com/intelligence)
- Contact: info@bidda.com
