# Bidda MCP - stdio<->remote bridge for Glama introspection.
#
# The Bidda MCP server is a hosted, remote Streamable-HTTP endpoint at
# https://bidda.com/mcp (implemented in the main Bidda platform, not in this
# repo, which is a listing/manifest package). Glama's automated checks launch a
# container and speak MCP JSON-RPC over stdin/stdout. This image runs mcp-remote,
# a pure-JS transport shim that forwards those stdio frames to the remote HTTP
# endpoint, so Glama's `initialize` + `tools/list` introspection completes and
# records the tool schemas - without shipping any server code here.
#
# The discovery tier needs no authentication, so no secrets are required for the
# introspection handshake to succeed.

FROM node:22-alpine

# mcp-remote is pure JavaScript (no native addons), so alpine + node is enough.
# Pin the bridge version for reproducible introspection builds.
ENV MCP_REMOTE_VERSION=0.1.38

# Run as the built-in non-root node user; /home/node is writable for the npx
# cache and mcp-remote's auth-token dir.
USER node
WORKDIR /home/node
ENV HOME=/home/node
ENV npm_config_cache=/home/node/.npm

# Warm the npx cache at build time so the introspection run only needs network
# egress to bidda.com, not to the npm registry.
RUN npx -y mcp-remote@${MCP_REMOTE_VERSION} --help > /dev/null 2>&1 || true

# Default stdio transport: mcp-remote bridges stdin/stdout to the remote
# Streamable-HTTP endpoint. Glama writes initialize/tools-list to stdin and
# reads the JSON-RPC responses from stdout.
ENTRYPOINT ["npx", "-y", "mcp-remote@0.1.38", "https://bidda.com/mcp"]
