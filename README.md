## Calculator MCP (classroom fork)

A Model Context Protocol (MCP) server that provides basic calculator capabilities.
This fork of [`wrtnlabs/calculator-mcp`](https://github.com/wrtnlabs/calculator-mcp) is used as a sample MCP server in training/classroom exercises at [`skillrepos/calculator-mcp`](https://github.com/skillrepos/calculator-mcp). It is **not published to npm** — it is intended to be run directly from this GitHub fork via `npx`.

It supports two transports:

- **stdio** (default) — for local MCP clients that spawn the server as a subprocess.
- **Streamable HTTP** — the current standard HTTP transport for MCP (replaces the deprecated SSE transport).

### Use Cases

- Classroom/training exercises for MCP clients and servers.
- Toy projects and smoke-tests.

### Running over stdio (default)

Run the server as a subprocess of your MCP client:

```bash
npx -y github:skillrepos/calculator-mcp
```

The first run clones the repo and builds it; subsequent runs are cached by npx.

Example client config:

<!-- eslint-skip -->

```js
{
  "mcpServers": {
    "calculator": {
      "command": "npx",
      "args": [
        "-y",
        "github:skillrepos/calculator-mcp"
      ]
    }
  }
}
```

#### Installation in VS Code

```bash
# For VS Code
code --add-mcp '{"name":"calculator","command":"npx","args":["-y","github:skillrepos/calculator-mcp"]}'
```

```bash
# For VS Code Insiders
code-insiders --add-mcp '{"name":"calculator","command":"npx","args":["-y","github:skillrepos/calculator-mcp"]}'
```

After installation the Calculator MCP server will be available for use with your GitHub Copilot agent in VS Code.

### Running over Streamable HTTP

Pass `--port <port>` to start an HTTP server that speaks the MCP **Streamable HTTP** transport. The endpoint is `POST/GET/DELETE /mcp` and sessions are tracked via the `mcp-session-id` header (per the MCP spec).

```bash
npx -y github:skillrepos/calculator-mcp --port 8931
```

On start-up you will see:

```
Listening on http://localhost:8931/mcp (Streamable HTTP)
Put this in your client config:
{
  "mcpServers": {
    "calculator": {
      "url": "http://localhost:8931/mcp"
    }
  }
}
```

Use the printed URL in an MCP client that supports the Streamable HTTP transport:

<!-- eslint-skip -->

```js
{
  "mcpServers": {
    "calculator": {
      "url": "http://localhost:8931/mcp"
    }
  }
}
```

> Note: the legacy `/sse` (Server-Sent Events) transport has been removed. If your client only supports SSE, upgrade it to a version that supports Streamable HTTP, or use the stdio transport.

#### Quick smoke test with `curl`

```bash
# Initialize — capture the mcp-session-id response header
curl -i -X POST http://localhost:8931/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'

# Send the initialized notification (replace <SID>)
curl -X POST http://localhost:8931/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: <SID>" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}'

# Call a tool
curl -X POST http://localhost:8931/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: <SID>" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"add","arguments":{"a":7,"b":5}}}'
```

### Running from a local clone

```bash
git clone https://github.com/skillrepos/calculator-mcp
cd calculator-mcp
pnpm install        # or: npm install
pnpm build          # or: npm run build
node bin/index.js --port 8931
```

### CLI Options

- `--port <port>`: Port to listen on for Streamable HTTP transport. When omitted, the server runs on stdio.

### Programmatic usage with custom transports

```js
import { createServer } from "@wrtnlabs/calculator-mcp";
// ... other import statement

const client = new Client({
  name: "test client",
  version: "0.1.0",
});

const server = await createServer({
  name: "calculator",
  version: "1.0.0"
});

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

await Promise.all([
  client.connect(clientTransport),
  server.connect(serverTransport),
]);
```

### Tools

- **add**
- **sub**
- **mul**
- **div**
- **mod**
- **sqrt**
