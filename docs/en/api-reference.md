English | [日本語](../ja/api-reference.md)

# API Reference

All REST API endpoints for microHarnessEngine.

---

## Common Specifications

### Base URL

```
http://localhost:4310/api
```

### Authentication Methods

| Method | Header/Cookie | Usage |
|---|---|---|
| Cookie Session | `microharnessengine_session` | Web UI |
| Bearer Token (PAT) | `Authorization: Bearer {token}` | API clients |
| Admin Cookie | `microharnessengine_admin_session` | Admin panel |

### CSRF

When using session authentication, the `x-csrf-token` header is required (POST/PATCH/DELETE).
It is not required when using Bearer Token authentication.

### Response Format

REST endpoints respond with `application/json`.
SSE endpoints respond with `text/event-stream` (see below).

### Error Response

```json
{
  "error": "Error message"
}
```

| Status | Meaning |
|---|---|
| `400` | Bad request |
| `401` | Authentication required |
| `403` | Insufficient permissions / Invalid CSRF |
| `404` | Resource not found |
| `409` | Conflict (duplicate / state inconsistency) |
| `503` | Service unavailable |

---

## Health Check

### `GET /api/health`

No authentication required.

```json
{
  "status": "ok",
  "provider": "anthropic",
  "projectRoot": "/path/to/project"
}
```

---

## User Authentication

### `POST /api/auth/login`

```json
// Request
{ "loginName": "myuser", "password": "mypassword" }

// Response 200
{
  "user": { "id": "...", "loginName": "myuser", "displayName": "...", "role": "user" },
  "csrfToken": "...",
  "expiresAt": "2026-04-21T..."
}
```

A session cookie is set automatically.

### `POST /api/auth/logout`

```json
// Response 200
{ "loggedOut": true }
```

### `GET /api/auth/me`

Returns the current user information. Returns null values when unauthenticated (not an error).

```json
{
  "user": { ... } | null,
  "csrfToken": "..." | null,
  "bootstrapRequired": false,
  "webBootstrapEnabled": false
}
```

---

## User API (Authentication Required)

### `GET /api/bootstrap`

Fetches all initial data at once after login.

```json
{
  "user": { ... },
  "csrfToken": "...",
  "conversations": [ ... ],
  "apiTokens": [ ... ]
}
```

### `GET /api/conversations`

List conversations.

### `POST /api/conversations`

**CSRF required**

```json
// Request
{ "title": "My Task" }

// Response 201
{ "id": "...", "title": "My Task", "status": "active", ... }
```

### `GET /api/conversations/:conversationId`

Conversation details. Includes messages, approval requests, automations, and active runs.

```json
{
  "conversation": { ... },
  "messages": [ ... ],
  "approvals": [ ... ],
  "automations": [ ... ],
  "activeRun": { ... } | null,
  "lastFailedRun": { ... } | null
}
```

### `POST /api/conversations/:conversationId/messages`

**CSRF required**

```json
// Request
{ "text": "Show me the file list" }

// Response 202
{ "message": { ... }, "run": { ... } }
```

The agent loop is started asynchronously.

### `GET /api/conversations/:conversationId/stream`

SSE (Server-Sent Events) streaming endpoint. Receives real-time agent events associated with a conversation.

**Response Headers**:

| Header | Value |
|---|---|
| `Content-Type` | `text/event-stream` |
| `Cache-Control` | `no-cache` |
| `Connection` | `keep-alive` |
| `X-Accel-Buffering` | `no` |

**Initial Connection**: Sends a `: connected\n\n` comment

**Heartbeat**: Sends a `: heartbeat\n\n` comment every 30 seconds

**Event Format**:

```
event: <event type>
data: <JSON payload>

```

**Event Types**:

| Event | Data | Description |
|---|---|---|
| `run.started` | `{ runId, status, phase }` | Run started |
| `delta` | `{ runId, type: 'text_delta', text }` | LLM streaming text |
| `tool_call` | `{ runId, name, input }` | Tool call started |
| `tool_result` | `{ runId, name, output }` | Tool execution result |
| `approval.requested` | `{ runId, approvalId, toolName }` | Approval request |
| `run.completed` | `{ runId, status, finalText }` | Run completed normally |
| `run.cancelled` | `{ runId }` | Run cancelled |
| `run.failed` | `{ runId, error }` | Run failed |

**Connection Termination**: Listeners are automatically cleaned up on client disconnect.

### `POST /api/runs/:runId/cancel`

**CSRF required** --- Cancels an in-progress Run.

```json
// Response 200
{ "ok": true, "data": { "ok": true } }
```

**Cancellable Statuses**: `queued`, `running`, `recovering`

**Error Conditions**:
- Run does not exist: `404`
- Non-cancellable status: `409`
- Authentication required: `401`

### `POST /api/approvals/:approvalId/decision`

**CSRF required**

```json
// Request
{ "decision": "approve" }  // or "deny"

// Response 200
{ "id": "...", "status": "approved", ... }
```

### `POST /api/conversations/:conversationId/automations`

**CSRF required**

```json
// Request
{
  "name": "daily-report",
  "instruction": "Please create a daily report",
  "intervalMinutes": 1440
}

// Response 201
{ "id": "...", "name": "daily-report", "status": "active", ... }
```

### `PATCH /api/automations/:automationId`

**CSRF required**

```json
// Request
{ "status": "paused" }  // or "active"
```

### `DELETE /api/automations/:automationId`

**CSRF required**

```json
// Response 200
{ "deleted": true }
```

### `POST /api/automations/:automationId/run-now`

**CSRF required** --- Immediately executes the automation.

### `POST /api/me/tokens`

**CSRF required**

```json
// Request
{ "name": "ci-token" }

// Response 201 --- The token is displayed only once
{ "id": "...", "name": "ci-token", "token": "pat_xxxx..." }
```

### `DELETE /api/me/tokens/:tokenId`

**CSRF required**

```json
// Response 200
{ "revoked": true }
```

---

## Admin API (Admin Authentication Required)

### Authentication

### `POST /api/admin/auth/login`

```json
{ "loginName": "root", "password": "admin-password" }
```

### `POST /api/admin/auth/logout`

### `GET /api/admin/auth/me`

### `GET /api/admin/bootstrap`

Fetches all dashboard data at once.

```json
{
  "overview": { "userCount": 5, "pendingApprovalCount": 2, ... },
  "users": [ ... ],
  "toolPolicies": [ ... ],
  "filePolicies": [ ... ],
  "protectionRules": [ ... ],
  "approvals": [ ... ],
  "automations": [ ... ],
  "tools": [ ... ],
  "mcpServers": [ ... ],
  "skills": [ ... ],
  "csrfToken": "..."
}
```

---

### Users

| Method | Path | CSRF | Description |
|---|---|---|---|
| `POST` | `/api/admin/users` | Required | Create user |
| `PATCH` | `/api/admin/users/:userId` | Required | Update user |
| `DELETE` | `/api/admin/users/:userId` | Required | Delete user |
| `POST` | `/api/admin/users/:userId/password` | Required | Change password |
| `PATCH` | `/api/admin/users/:userId/policies` | Required | Assign policies |

### Tool Policies

| Method | Path | CSRF | Description |
|---|---|---|---|
| `POST` | `/api/admin/tool-policies` | Required | Create |
| `PATCH` | `/api/admin/tool-policies/:policyId` | Required | Update |
| `DELETE` | `/api/admin/tool-policies/:policyId` | Required | Delete (can specify `replacementPolicyId` in body) |

### File Policies

| Method | Path | CSRF | Description |
|---|---|---|---|
| `POST` | `/api/admin/file-policies` | Required | Create |
| `PATCH` | `/api/admin/file-policies/:policyId` | Required | Update |
| `DELETE` | `/api/admin/file-policies/:policyId` | Required | Delete (can specify `replacementPolicyId` in body) |
| `POST` | `/api/admin/file-policies/:policyId/roots` | Required | Add root |
| `DELETE` | `/api/admin/file-policies/:policyId/roots/:rootId` | Required | Delete root |

### Filesystem

| Method | Path | CSRF | Description |
|---|---|---|---|
| `GET` | `/api/admin/fs/probe?path=...` | Not required | Check path status |
| `GET` | `/api/admin/fs/browse?path=...` | Not required | Browse directory contents |

### Approvals

| Method | Path | CSRF | Description |
|---|---|---|---|
| `POST` | `/api/admin/approvals/:approvalId/decision` | Required | Approve/Deny |

### Automations

| Method | Path | CSRF | Description |
|---|---|---|---|
| `PATCH` | `/api/admin/automations/:automationId` | Required | Pause (`{"status":"paused"}` only) |
| `DELETE` | `/api/admin/automations/:automationId` | Required | Delete |

### Skills

| Method | Path | CSRF | Description |
|---|---|---|---|
| `GET` | `/api/admin/skills` | Not required | List |
| `GET` | `/api/admin/skills/:skillName` | Not required | Details |
| `POST` | `/api/admin/skills` | Required | Create |
| `PATCH` | `/api/admin/skills/:skillName` | Required | Update |
| `DELETE` | `/api/admin/skills/:skillName` | Required | Delete |

### MCP Servers

| Method | Path | CSRF | Description |
|---|---|---|---|
| `GET` | `/api/admin/mcp-servers` | Not required | List |
| `POST` | `/api/admin/mcp-servers` | Required | Add |
| `PATCH` | `/api/admin/mcp-servers/:serverName` | Required | Update settings |
| `DELETE` | `/api/admin/mcp-servers/:serverName` | Required | Delete |
| `POST` | `/api/admin/mcp-servers/:serverName/reconnect` | Required | Reconnect |

### Protection Rules

| Method | Path | CSRF | Description |
|---|---|---|---|
| `GET` | `/api/admin/protection-rules` | Not required | List |
| `POST` | `/api/admin/protection-rules` | Required | Create |
| `PATCH` | `/api/admin/protection-rules/:ruleId` | Required | Enable/Disable toggle |
| `DELETE` | `/api/admin/protection-rules/:ruleId` | Required | Delete |
| `POST` | `/api/admin/protection-rules/inspect` | Required | Inspect protection status of a path |

---

## External Channel Webhooks

### Slack

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/integrations/slack/events` | Slack signature | Event reception + URL verification |
| `POST` | `/api/integrations/slack/actions` | Slack signature | Block Kit interactions |

### SSE & Cancel

| Method | Path | CSRF | Description |
|---|---|---|---|
| `GET` | `/api/conversations/:conversationId/stream` | No | SSE streaming (text/event-stream) |
| `POST` | `/api/runs/:runId/cancel` | Yes | Cancel Run |

### Discord

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/integrations/discord/interactions` | Ed25519 signature | Interaction reception |
