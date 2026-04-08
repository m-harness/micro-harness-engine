English | [日本語](../ja/security.md)

# Security Model

An overview of the security design of microHarnessEngine.

---

## Design Principles

### Code > Prompt

Security enforcement is done in code. Prompts serve as UX aids, not as the primary defense mechanism.

```
Prompt: "Please do not read protected files"     → LLM may ignore this
Code:    Path protection check + denial before tool execution → Enforced at code level
```

### Default Deny

New users are granted no permissions by default. Features become available only when an administrator explicitly grants access through policies.

### Fail Closed

Evaluation errors, DB failures, parse errors — all anomalies result in **denial**.

---

## 3-Layer Defense

Three independent defense layers that do not depend on LLM prompt compliance.

```
┌───────────────────────────────────────────────────────────┐
│                 Layer 1: Hide Existence                   │
│                                                           │
│  Automatically exclude protected items from list_files    │
│  results. The LLM cannot know the files even exist.      │
│                                                           │
│  Implementation: filterDiscoverableEntries()              │
│  Target: discover action                                  │
│  Result: { entries: [...], hiddenCount: 3 }               │
│         → LLM only knows "3 items are hidden"            │
├───────────────────────────────────────────────────────────┤
│                 Layer 2: Deny Execution                   │
│                                                           │
│  Tool Policy: Tools not permitted for the user cannot     │
│               be executed                                 │
│  File Policy: Paths outside the allowed scope are denied  │
│  Protection Engine: Operations on protected paths are     │
│                     denied                                │
│                                                           │
│  Implementation: PolicyService.assertToolAllowed()        │
│                  PolicyService.resolveFileAccess()        │
│                  assertPathActionAllowed()                │
├───────────────────────────────────────────────────────────┤
│              Layer 3: Prevent Information Leakage         │
│                                                           │
│  Content Classifier: Detects API key and token patterns   │
│  Model Send Guard: Redaction before sending to the LLM   │
│  DB/Log Guard: Redaction of sensitive data before storage │
│                                                           │
│  Implementation: sanitizeMessagesForModel()               │
│                  sanitizeToolResultForModel()             │
│                  redactForPersistence()                   │
└───────────────────────────────────────────────────────────┘
```

---

## Protection Engine

Provides two protection mechanisms: path-based and content-based.

### Path Protection

Applies protection rules to file paths.

```mermaid
graph TD
    REQ[Tool Execution Request<br/>action: read, path: .env] --> NORM[Path Normalization<br/>Backslash Conversion<br/>Traversal Prevention]
    NORM --> LOAD[Load Active Rules]
    LOAD --> MATCH[Path Matching<br/>exact / dirname / glob]
    MATCH -->|Match Found| PRIO[Select Highest Priority Rule]
    MATCH -->|No Match| ALLOW[allow]
    PRIO --> EFFECT{effect}
    EFFECT -->|deny| DENY[Deny + Audit Log]
    EFFECT -->|ask| ASK[Prompt User for Confirmation]
    EFFECT -->|allow| ALLOW
```

### Matching Patterns

| Pattern Type | Description | Example |
|---|---|---|
| `exact` | Exact match (case-insensitive) | `.env` |
| `dirname` | Directory and all its descendants | `security` → `security/`, `security/keys/id_rsa` |
| `glob` | Wildcard | `**/*.key`, `.env.*`, `**/credentials.json` |

Glob conversion rules:
- `**` → `.*` (matches across directory separators)
- `*` → `[^/]*` (matches within a single directory)
- Case-insensitive

### Priority

When multiple rules match:
1. Lower `priority` value takes precedence
2. For the same priority, lower `id` (older rule) takes precedence

### Default Protection Rules

Rules built into the system by default:

| Pattern | Type | Priority | Reason |
|---|---|---|---|
| `.env` | exact | 10 | Main environment variable file |
| `.env.*` | glob | 10 | `.env.local`, `.env.production`, etc. |
| `security` | dirname | 10 | Entire security/ directory |
| `secrets` | dirname | 10 | Entire secrets/ directory |
| `**/credentials.json` | glob | 15 | credentials.json at any depth |
| `mcp/mcp.json` | exact | 10 | MCP configuration (may contain API keys) |

All have `effect: deny` and `scope: system`. They can be disabled from the admin panel but cannot be deleted.

### Action Types

Protection rules apply to the following actions:

| Action | Description | Applicable Tools |
|---|---|---|
| `discover` | Listing existence | `list_files` |
| `read` | Reading contents | `read_file`, `grep` |
| `write` | Creating / overwriting | `write_file`, `edit_file`, `multi_edit_file`, `make_dir` |
| `move` | Moving / renaming | `move_file` (checks both source and destination) |
| `delete` | Deleting | `delete_file` |

---

## Content Classifier (Sensitive Data Detection)

Detects sensitive data patterns in file contents and messages, and automatically replaces them with `[REDACTED]`.

### Detection Patterns

| Label | Pattern | Example |
|---|---|---|
| `anthropic_key` | `sk-ant-` + 10 or more characters | `sk-ant-api03-xxxx...` |
| `openai_key` | `sk-` (+ `proj-`) + 10 or more characters | `sk-proj-xxxx...` |
| `github_token` | `ghp_/gho_/ghu_/ghs_/ghr_` + 20 or more characters | `ghp_xxxxxxxxxxxx...` |
| `bearer_token` | `Bearer ` + 12 or more characters | `Bearer eyJhbGci...` |
| `pem_private_key` | Entire PEM-format private key block | `-----BEGIN RSA PRIVATE KEY-----` |
| `assignment_secret` | `api_key=`, `password:`, `secret=`, etc. + value of 6 or more characters | `api_key=abc123def456` |

### Where Redaction Is Applied

```
                      ┌──────────────────┐
                      │  Content         │
                      │  Classifier      │
                      └──────┬───────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
    ┌─────────────┐  ┌────────────┐  ┌──────────┐
    │ Before LLM  │  │ Before DB  │  │ Tool     │
    │ Send:       │  │ Save:      │  │ Result   │
    │ sanitize    │  │ redact     │  │ redact   │
    │ ForModel()  │  │ ForPersist │  │          │
    └─────────────┘  └────────────┘  └──────────┘
```

- **Before LLM Send**: Redacts sensitive data in conversation history and tool execution results
- **Before DB Save**: Redacts messages and tool logs before persistence
- **Recursive Processing**: Objects and arrays are traversed recursively

---

## Approval Workflow

Destructive operations require human approval before execution.

```mermaid
sequenceDiagram
    participant LLM as LLM
    participant APP as App Engine
    participant USER as User
    participant ADMIN as Admin

    LLM->>APP: Calls delete_file
    APP->>APP: approvalGranted = false
    APP->>APP: Returns approvalRequired response
    APP->>APP: Changes Agent Run to waiting_approval
    APP->>USER: "Approval required" notification

    alt User approves
        USER->>APP: approve
        APP->>APP: Actually executes delete_file
        APP->>APP: Resumes Agent Loop
    else User denies
        USER->>APP: deny
        APP->>LLM: "Human approval was denied."
        APP->>APP: Resumes Agent Loop (continues with denial result)
    else Admin approves/denies
        ADMIN->>APP: approve / deny
        Note over ADMIN: Can manage all approvals from admin panel
    end
```

Tools currently requiring approval:
- `delete_file` — Deletion of files and directories

Approvals can be managed from the chat UI, Slack, Discord, or the admin panel.

---

## Authentication Security

### Passwords

- **Hashing**: `scrypt` (16-byte salt, 64-byte derived key)
- **Minimum length**: 12 characters
- **Timing-safe comparison**: `crypto.timingSafeEqual`

### Sessions

- **Token**: `crypto.randomBytes(32).toString('base64url')`
- **CSRF**: Individual CSRF token per session
- **Cookie**: `HttpOnly`, `SameSite=Lax`, `Secure` in production
- **Expiration**: User 14 days / Admin 12 hours (configurable)
- **User sessions**: Rolling expiry (extended on each access)
- **Admin sessions**: Fixed expiry (no extension, cleared on restart)

### Personal Access Token (PAT)

- Only the SHA-256 hash is stored in the DB
- The raw token is displayed only once at issuance
- CSRF check is skipped when using PAT (intended for API clients)

### External Channel Signature Verification

- **Slack**: HMAC-SHA256 signature verification + timestamp freshness check (within 5 minutes)
- **Discord**: Ed25519 signature verification

### CORS

- When `ALLOWED_ORIGINS` is not set: only `localhost` / `127.0.0.1` are allowed
- When set: only the explicitly specified origins are allowed

---

## Threat Model

### Threats Addressed

| Threat | Countermeasure |
|---|---|
| LLM explores sensitive files via prompt injection | Layer 1: Hide Existence |
| LLM reads protected files and includes them in responses | Layer 2: Read Denial + Layer 3: Redaction |
| User pastes API keys into chat | Content Classifier detects and redacts |
| Unauthorized tool execution | Denied by Tool Policy |
| File access outside of project | Denied by File Policy |
| Runaway destructive operations | Human judgment via Approval Workflow |
| Unauthorized access to admin panel | Separate authentication + CSRF + volatile sessions |
| Slack/Discord webhook spoofing | Cryptographic signature verification |

### What This Design Cannot Fully Prevent

- Cases where the OS itself is compromised
- Developers writing code that bypasses the Protection Engine
- External libraries independently sending data

This is an application-level data leakage mitigation design.
