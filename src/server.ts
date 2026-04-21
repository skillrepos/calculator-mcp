import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import http from "node:http";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, isInitializeRequest, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { add, div, mod, mul, sqrt, sub } from "./tools";

const tools = [add, div, mod, mul, sqrt, sub];
export async function createServer(options: { name: string; version: string }) {
  const server = new Server({
    name: options.name,
    version: options.version,
  }, {
    capabilities: { tools: {} },
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: tools.map(tool => tool.schema) };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = tools.find(tool => tool.schema.name === request.params.name);
    if (tool == null) {
      return {
        content: [{ type: "text", text: `Tool "${request.params.name}" not found` }],
        isError: true,
      };
    }

    try {
      const result = await tool.handle(request.params.arguments ?? {});
      return result;
    }
    catch (error) {
      return {
        content: [{ type: "text", text: String(error) }],
        isError: true,
      };
    }
  });

  const oldClose = server.close.bind(server);

  server.close = async () => {
    await oldClose();
  };

  return server;
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.length === 0) {
    return undefined;
  }
  return JSON.parse(raw);
}

export async function startHttpServer(options: { port: number; name: string; version: string }) {
  const transports = new Map<string, StreamableHTTPServerTransport>();

  // eslint-disable-next-line ts/no-misused-promises
  const httpServer = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const pathname = url.pathname.replace(/\/+$/, "") || "/";
      if (pathname !== "/mcp") {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }

      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      if (req.method === "POST") {
        const body = await readJsonBody(req);

        let transport: StreamableHTTPServerTransport | undefined;
        if (sessionId !== undefined && transports.has(sessionId)) {
          transport = transports.get(sessionId);
        }
        else if (sessionId === undefined && isInitializeRequest(body)) {
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sid) => {
              if (transport !== undefined) {
                transports.set(sid, transport);
              }
            },
          });
          transport.onclose = () => {
            if (transport?.sessionId !== undefined) {
              transports.delete(transport.sessionId);
            }
          };
          const server = await createServer(options);
          await server.connect(transport);
        }
        else {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Bad Request: no valid session ID provided" },
            id: null,
          }));
          return;
        }

        await transport!.handleRequest(req, res, body);
        return;
      }

      if (req.method === "GET" || req.method === "DELETE") {
        if (sessionId === undefined || !transports.has(sessionId)) {
          res.statusCode = 400;
          res.end("Invalid or missing session ID");
          return;
        }
        const transport = transports.get(sessionId)!;
        await transport.handleRequest(req, res);
        return;
      }

      res.statusCode = 405;
      res.end("Method not allowed");
    }
    catch (error) {
      console.error(error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end("Internal server error");
      }
    }
  });

  httpServer.listen(options.port, () => {
    const address = httpServer.address();
    if (address === null) {
      throw new Error("Could not bind server socket");
    }

    const url = (() => {
      if (typeof address === "string") {
        return address;
      }

      const resolvedPort = address.port;
      const resolvedHost = (() => {
        const host = address.family === "IPv4" ? address.address : `[${address.address}]`;
        if (host === "0.0.0.0" || host === "[::]") {
          return "localhost";
        }
        return host;
      })();

      return `http://${resolvedHost}:${resolvedPort}`;
    })();

    console.log(`Listening on ${url}/mcp (Streamable HTTP)`);
    console.log("Put this in your client config:");
    console.log(JSON.stringify({
      mcpServers: {
        calculator: {
          url: `${url}/mcp`,
        },
      },
    }, undefined, 2));
  });
}
