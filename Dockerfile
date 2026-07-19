# Bidda Compliance MCP Server - local stdio server.
#
# This builds and runs the MCP server IN the container. The MCP protocol is
# served locally by server.js; only the underlying compliance DATA is fetched
# from Bidda's public REST API (https://bidda.com/api/v1), which needs no
# authentication for the discovery tier. It is not an MCP proxy.
#
# An MCP client (Claude Desktop, Cursor, or Glama's introspector) launches the
# container and speaks JSON-RPC over stdin/stdout.

FROM node:22-alpine

WORKDIR /app

# Install production deps first for better layer caching.
COPY package.json ./
RUN npm install --omit=dev

# Copy the server.
COPY server.js ./

# Run as the built-in non-root user.
USER node

# stdio transport: the MCP client writes JSON-RPC to stdin and reads from stdout.
CMD ["node", "server.js"]
