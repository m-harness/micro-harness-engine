English | [日本語](../ja/configuration.md)

# Configuration

Reference for all environment variables and configuration items.

---

## Environment Variables

Set via a `.env` file or system environment variables.

### LLM Provider

| Variable | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | `anthropic` | LLM provider to use (`anthropic`, `claude`, `openai`, `gemini`, `google`) |
| `LLM_MAX_TOKENS` | `1400` | Maximum number of tokens for LLM responses |

### Anthropic (Claude)

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Anthropic API key (required) |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | Model to use |
| `CLAUDE_MODEL` | — | Alias for `ANTHROPIC_MODEL` |

### OpenAI

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | — | OpenAI API key (required) |
| `OPENAI_MODEL` | `gpt-4.1-mini` | Model to use |
| `OPENAI_API_URL` | `https://api.openai.com/v1/chat/completions` | API endpoint |

### Gemini (Google)

| Variable | Default | Description |
|---|---|---|
| `GEMINI_API_KEY` | — | Gemini API key (required) |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Model to use |
| `GEMINI_API_URL` | `https://generativelanguage.googleapis.com/v1beta` | API endpoint |

### Server

| Variable | Default | Description |
|---|---|---|
| `API_PORT` | `4310` | API server port number |
| `PROJECT_ROOT_DIR` | `process.cwd()` | Project root path |
| `APP_DB_PATH` | `app-v2.db` | SQLite database file path |

### Authentication

| Variable | Default | Description |
|---|---|---|
| `ADMIN_RUNTIME_PASSWORD` | — | Admin dashboard password (required) |
| `ROOT_BOOTSTRAP_SECRET` | — | Secret for initial setup |
| `AUTH_SESSION_TTL_HOURS` | `336` (14 days) | User session expiration (hours) |
| `ADMIN_SESSION_TTL_HOURS` | `12` | Admin session expiration (hours) |
| `AUTH_COOKIE_NAME` | `microharnessengine_session` | User session cookie name |
| `ADMIN_AUTH_COOKIE_NAME` | `microharnessengine_admin_session` | Admin session cookie name |

### CORS

| Variable | Default | Description |
|---|---|---|
| `ALLOWED_ORIGINS` | — | Allowed origins (comma-separated) |

When not set, only `localhost` / `127.0.0.1` are allowed.

```env
# Single origin
ALLOWED_ORIGINS=https://app.example.com

# Multiple origins
ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
```

### Slack

| Variable | Default | Description |
|---|---|---|
| `SLACK_BOT_TOKEN` | — | Slack Bot Token (`xoxb-...`) |
| `SLACK_SIGNING_SECRET` | — | Slack Signing Secret |

### Discord

| Variable | Default | Description |
|---|---|---|
| `DISCORD_BOT_TOKEN` | — | Discord Bot Token |
| `DISCORD_PUBLIC_KEY` | — | Discord Public Key (Ed25519) |
| `DISCORD_APPLICATION_ID` | — | Discord Application ID |

### Automation

| Variable | Default | Description |
|---|---|---|
| `AUTOMATION_TICK_MS` | `30000` (30 seconds) | Automation polling interval (milliseconds) |

### Web Search

| Variable | Default | Description |
|---|---|---|
| `BRAVE_SEARCH_API_KEY` | — | Brave Search API key (required for the `web_search` tool) |

---

## Configuration Examples

### Local Development

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
ADMIN_RUNTIME_PASSWORD=dev-password
API_PORT=4310
```

### Production (Claude + Slack)

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
ANTHROPIC_MODEL=claude-sonnet-4-6
LLM_MAX_TOKENS=4096
ADMIN_RUNTIME_PASSWORD=strong-random-password

API_PORT=4310
ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com

AUTH_SESSION_TTL_HOURS=168
ADMIN_SESSION_TTL_HOURS=4

SLACK_BOT_TOKEN=xoxb-xxxx-xxxx-xxxx
SLACK_SIGNING_SECRET=xxxx

BRAVE_SEARCH_API_KEY=BSAxxxxx
```

### OpenAI-Compatible API (Local LLM)

You can use an OpenAI-compatible local LLM by changing `OPENAI_API_URL`:

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=dummy
OPENAI_MODEL=local-model
OPENAI_API_URL=http://localhost:8080/v1/chat/completions
```

---

## MCP Configuration

MCP server settings are managed in `mcp/mcp.json`, not via environment variables.

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "package-name"],
      "env": {
        "API_KEY": "xxxxx"
      }
    }
  }
}
```

You can also add, edit, and delete MCP servers from the admin dashboard. See [MCP Guide](./mcp-guide.md) for details.

---

## Skill Configuration

Skills are managed as Markdown files in the `skills/` directory.

```markdown
---
name: code_review
description: A skill for performing code reviews
---
Please review the following code.
Point out any bugs, security issues, and areas for improvement.
```

You can also create, edit, and delete skills from the admin dashboard.

---

## Database

| Item | Value |
|---|---|
| Engine | SQLite (better-sqlite3) |
| Journal Mode | WAL (Write-Ahead Logging) |
| Foreign Key Constraints | Enabled |
| File Path | `APP_DB_PATH` (default: `app-v2.db`) |

Schema migrations are automatically executed on server startup.
