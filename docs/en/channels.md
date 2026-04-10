English | [日本語](../ja/channels.md)

# Channels

How to connect and configure Web UI / Slack / Discord / API clients.

---

## Channel Architecture

```mermaid
graph TB
    subgraph "Channels"
        WEB["Web UI"]
        SLACK["Slack"]
        DISCORD["Discord"]
        API["API Client"]
    end

    subgraph "microHarnessEngine"
        HTTP["HTTP Server"]
        subgraph "Channel Adapters"
            WA["Web Adapter"]
            SA["Slack Adapter"]
            DA["Discord Adapter"]
        end
        APP["App Engine"]
    end

    WEB -->|Cookie Session| HTTP
    WEB <-.->|SSE Stream| HTTP
    API -->|Bearer Token| HTTP
    SLACK -->|Webhook + Signature Verification| HTTP
    DISCORD -->|Webhook + Signature Verification| HTTP

    HTTP --> WA --> APP
    HTTP --> SA --> APP
    HTTP --> DA --> APP

    APP -.->|SSE Event Delivery| WA
    APP -->|chat.postMessage| SA
    APP -->|channels/messages| DA
```

Across all channels:
- The same policy controls are applied
- The same approval workflows operate
- Conversations are independent per channel (not unified)

---

## Web UI

The chat interface provided by default.

### Access

```
http://localhost:4310/
```

### Authentication

- Login: `loginName` + `password`
- Session: Cookie-based (`microharnessengine_session`)
- CSRF: Token issued per session
- Expiration: 14 days by default (Rolling expiry)

### Features

- Create and switch conversations
- Send and receive messages
- SSE streaming (real-time display of LLM responses)
- Run cancellation (interrupt an in-progress agent)
- Process approval requests (Approve / Deny)
- View Automations
- Issue and revoke Personal Access Tokens

### Real-Time Communication

The Web UI uses SSE (Server-Sent Events) to receive agent execution status in real time.

**SSE Connection Specification**:
- Endpoint: `GET /api/conversations/:conversationId/stream`
- Cookie authentication (`credentials: 'include'`)
- Custom client implementation using `fetch()` + `ReadableStream` (not `EventSource`)
- Heartbeat: every 30 seconds

**Received Events**:
- `delta` --- LLM streaming text -> displayed in real time in the chat screen
- `run.completed` / `run.cancelled` / `run.failed` --- Run ended -> screen refresh
- `approval.requested` --- Display approval UI

**Fallback Specification**:
- On SSE connection error, automatically switches to 4-second interval polling (`loadWorkspace()`)
- SSE auto-reconnection is not performed (until component remount)

### WAN Exposure

When exposing externally via Cloudflare Tunnel, etc.:

```env
ALLOWED_ORIGINS=https://app.example.com
```

Recommended configuration:
```
app.example.com   → Web UI + User API
admin.example.com → Admin Console + Admin API
```

---

## Slack

### Prerequisites

- A Slack App has been created
- Event Subscriptions are enabled
- Interactivity is enabled

### Environment Variables

```env
SLACK_BOT_TOKEN=xoxb-xxxx-xxxx-xxxx
SLACK_SIGNING_SECRET=xxxx
```

### Webhook URL Configuration

Register the following in the Slack App settings:

| Setting | URL |
|---|---|
| Event Subscriptions - Request URL | `https://your-domain/api/integrations/slack/events` |
| Interactivity - Request URL | `https://your-domain/api/integrations/slack/actions` |

### Subscribed Events

Bot Events:
- `message.im` — Receive DM messages

### How It Works

```
1. User sends a message via Slack DM
2. Slack → /api/integrations/slack/events (with signature verification)
3. microHarnessEngine auto-creates/resolves the user
   - identity_key: slack:{teamId}:{userId}:{channelId}
4. Creates/retrieves a conversation and starts the agent loop
5. Sends a response via the Slack chat.postMessage API
```

### Approvals

When approval is required, a message with Slack Block Kit buttons is sent:

```
┌────────────────────────────────────────┐
│ Approval Required                      │
│                                        │
│ Tool: delete_file                      │
│ Reason: Deletion requires approval     │
│                                        │
│ [Approve]  [Deny]                      │
└────────────────────────────────────────┘
```

Button clicks are handled at `/api/integrations/slack/actions`.

### Threads

- Slack threads are mapped to the conversation's `externalRef` as `thread:{timestamp}`
- If there is no thread, `channel:{channelId}` is used
- Messages within the same thread are treated as the same conversation

---

## Discord

### Prerequisites

- A Discord Application has been created
- A Bot has been added
- The Interactions Endpoint URL has been configured

### Environment Variables

```env
DISCORD_BOT_TOKEN=xxxx
DISCORD_PUBLIC_KEY=xxxx
DISCORD_APPLICATION_ID=xxxx
```

### Interactions Endpoint

In the Discord Developer Portal:

| Setting | URL |
|---|---|
| Interactions Endpoint URL | `https://your-domain/api/integrations/discord/interactions` |

### Slash Commands

Register the following slash commands:

| Command | Options | Description |
|---|---|---|
| `/chat` | `message` (required), `session` (optional) | Send a message |
| `/new-session` | `name` (optional) | Start a new session (conversation) |

### How It Works

```
1. User executes /chat message:"Show me the file list"
2. Discord → /api/integrations/discord/interactions (Ed25519 signature verification)
3. microHarnessEngine auto-creates/resolves the user
   - identity_key: discord:{userId}:{channelId}
4. Creates/retrieves a conversation and starts the agent loop
5. Responds with an ephemeral message saying "Received"
6. Sends the result via the Discord channels/messages API
```

### Session Management

- Default: One conversation per `channel:{channelId}`
- Specifying a session name with `/new-session` creates a new conversation
- Use `/chat session:my-task` to send a message to a specific session

### Approvals

A message with Discord Component buttons is sent:

```
Approval Required
Tool: delete_file
Reason: Deletion requires approval

[Approve (green)] [Deny (red)]
```

`custom_id` format: `approval:approve:{approvalId}` / `approval:deny:{approvalId}`

---

## API Client (PAT Authentication)

### Obtaining a Personal Access Token

1. Log in to the Web UI
2. Specify a token name and issue it
3. **Save the displayed token** (it is only shown once)

### API Calls

```bash
curl -H "Authorization: Bearer pat_xxxxxxxxxxxx" \
  http://localhost:4310/api/conversations
```

### Characteristics

- No CSRF check (when using Bearer Token)
- No session management required
- Suitable for use from CI/CD and scripts
- Only the SHA-256 hash of the token is stored in the DB

### Key Endpoints

```bash
# List conversations
GET /api/conversations

# Create a conversation
POST /api/conversations
  {"title": "My Task"}

# Send a message
POST /api/conversations/:id/messages
  {"text": "Show me the file list"}

# Conversation details (including message list)
GET /api/conversations/:id
```

See [API Reference](./api-reference.md) for details.

---

## Automatic External User Creation

Messages from Slack / Discord involve automatic user creation:

```
1. Search for a channel identity by identityKey
2. If not found:
   a. Create a new user (authSource: external channel name)
   b. Create a channel identity
   c. Assign the default policy
3. If found:
   Process as an existing user
```

Automatically created users are assigned the **Default (deny all)** Tool Policy. No tools can be used until an administrator assigns a Tool Policy.
