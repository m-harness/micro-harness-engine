English | [日本語](../ja/index.md)

<p align="center">
  <h1 align="center">microHarnessEngine</h1>
  <p align="center">Policy-Driven Secure AI Assistant Engine</p>
</p>

---

**microHarnessEngine** is an AI assistant engine designed from scratch with security at its core.

Just as you build your own blog on top of WordPress, you can build your own AI assistant on top of microHarnessEngine and operate it safely in your projects.

> It is ready to use as a standard AI assistant even in its default state.

---

## Why microHarnessEngine?

Existing AI assistants and AI agents **can do far too much** out of the box.

File read/write, command execution, external communication — in an environment where all of these are permitted from the start, how do you defend against prompt injection or a runaway model?

**microHarnessEngine takes a fundamentally different approach.**

```
Other AI assistants:   Allow everything → Restrict dangerous things later
microHarnessEngine:    Deny everything  → Explicitly allow only what is needed
```

### 3-Layer Defense

Information is protected by three layers of defense enforced at the code level, without relying on LLM prompt compliance.

```
  Layer 1:  Don't tell the LLM it exists
  Layer 2:  Don't execute even if the LLM requests it
  Layer 3:  Don't pass the execution results to the LLM
```

---

## Key Features

- **Default Deny** — No permissions are granted to new users. Explicitly allow via policy
- **Tool Policy** — Whitelist-based control of available tools per user
- **File Policy** — Control accessible paths per user
- **Protection Engine** — Path-based + content-based sensitive information protection
- **Approval Workflow** — Destructive operations wait for human approval
- **Multi-Provider** — Switch between Claude / OpenAI / Gemini via `.env`
- **Multi-Channel** — Web UI / Slack / Discord / REST API
- **MCP Integration** — Integrate external MCP server tools under policy management
- **Plugin Architecture** — Add tools as plugins
- **Web Admin Panel** — Manage all security settings through a GUI

---

## Documentation

| Document | Description |
|---|---|
| **[Getting Started](./getting-started.md)** | Installation, initial setup, and your first chat |
| **[Architecture](./architecture.md)** | Overall system design, components, and processing flow |
| **[Security Model](./security.md)** | 3-Layer Defense, Protection Engine, sensitive information detection |
| **[Policy Guide](./policy-guide.md)** | How Tool Policy / File Policy work and how to configure them |
| **[Agent Loop](./agent-loop.md)** | Agent loop, approval workflow, and automatic recovery |
| **[Tools](./tools.md)** | Built-in tool list and plugin development guide |
| **[MCP Integration](./mcp-guide.md)** | MCP server connection, configuration, and management |
| **[Channels](./channels.md)** | Web UI / Slack / Discord connection and configuration |
| **[Admin Guide](./admin-guide.md)** | Complete guide to all admin panel features |
| **[Configuration](./configuration.md)** | All environment variables and configuration reference |
| **[API Reference](./api-reference.md)** | All REST API endpoints |
| **[Data Model](./data-model.md)** | Database schema and ER diagrams |

---

## Quick Start

```bash
git clone https://github.com/m-harness/micro-harness-engine.git
cd micro-harness-engine
npm install
```

Create `.env`:

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ADMIN_RUNTIME_PASSWORD=your-admin-password
```

```bash
npm start
```

- Chat UI: `http://localhost:4310/`
- Admin Panel: `http://localhost:4310/admin`

During development, start the backend and Web UI simultaneously:

```bash
npm run dev:full
# → Access at http://localhost:4173 (HMR + API proxy enabled)
```

See [Getting Started](./getting-started.md) for details.

---

## Project Structure

```
microHarnessEngine/
├── src/
│   ├── index.js                  # Entry point
│   ├── http/server.js            # HTTP API server
│   ├── core/                     # Core logic
│   ├── protection/               # Protection Engine
│   ├── providers/                # LLM providers
│   ├── mcp/                      # MCP client
│   └── admin-web/                # Admin panel (React + Vite)
├── tools/                        # Tool plugins
│   ├── filesystem/               # File operations
│   ├── git/                      # Git operations
│   ├── search/                   # Search
│   ├── web/                      # Web fetching & search
│   └── automation/               # Scheduled execution
├── skills/                       # Custom skills (.md)
├── mcp/mcp.json                  # MCP server configuration
└── .env                          # Environment configuration (not tracked by Git)
```

---

## License

[MIT License](../../LICENSE)

## Contributing

<!-- TODO: Add contribution guidelines -->
