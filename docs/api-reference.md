# API Reference

microHarnessEngineの全REST APIエンドポイントです。

---

## 共通仕様

### ベースURL

```
http://localhost:4310/api
```

### 認証方式

| 方式 | ヘッダ/Cookie | 用途 |
|---|---|---|
| Cookie Session | `microharnessengine_session` | Web UI |
| Bearer Token (PAT) | `Authorization: Bearer {token}` | APIクライアント |
| Admin Cookie | `microharnessengine_admin_session` | 管理画面 |

### CSRF

セッション認証時は `x-csrf-token` ヘッダが必要です（POST/PATCH/DELETE）。
Bearer Token 認証時は不要です。

### レスポンス形式

すべて `application/json` です。

### エラーレスポンス

```json
{
  "error": "Error message"
}
```

| ステータス | 意味 |
|---|---|
| `400` | リクエスト不正 |
| `401` | 認証が必要 |
| `403` | 権限不足 / CSRF不正 |
| `404` | リソースが見つからない |
| `409` | 競合（重複・状態不整合） |
| `503` | サービス利用不可 |

---

## ヘルスチェック

### `GET /api/health`

認証不要。

```json
{
  "status": "ok",
  "provider": "anthropic",
  "projectRoot": "/path/to/project"
}
```

---

## ユーザー認証

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

セッションCookieが自動設定されます。

### `POST /api/auth/logout`

```json
// Response 200
{ "loggedOut": true }
```

### `GET /api/auth/me`

現在のユーザー情報。未認証時はnull値を返します（エラーではない）。

```json
{
  "user": { ... } | null,
  "csrfToken": "..." | null,
  "bootstrapRequired": false,
  "webBootstrapEnabled": false
}
```

---

## ユーザー API（要認証）

### `GET /api/bootstrap`

ログイン後の初期データを一括取得。

```json
{
  "user": { ... },
  "csrfToken": "...",
  "conversations": [ ... ],
  "apiTokens": [ ... ]
}
```

### `GET /api/conversations`

会話一覧。

### `POST /api/conversations`

**CSRF必要**

```json
// Request
{ "title": "My Task" }

// Response 201
{ "id": "...", "title": "My Task", "status": "active", ... }
```

### `GET /api/conversations/:conversationId`

会話詳細。メッセージ、承認リクエスト、Automation、実行中Runを含む。

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

**CSRF必要**

```json
// Request
{ "text": "ファイル一覧を見せて" }

// Response 202
{ "message": { ... }, "run": { ... } }
```

エージェントループは非同期で開始されます。

### `POST /api/approvals/:approvalId/decision`

**CSRF必要**

```json
// Request
{ "decision": "approve" }  // or "deny"

// Response 200
{ "id": "...", "status": "approved", ... }
```

### `POST /api/conversations/:conversationId/automations`

**CSRF必要**

```json
// Request
{
  "name": "daily-report",
  "instruction": "日次レポートを作成してください",
  "intervalMinutes": 1440
}

// Response 201
{ "id": "...", "name": "daily-report", "status": "active", ... }
```

### `PATCH /api/automations/:automationId`

**CSRF必要**

```json
// Request
{ "status": "paused" }  // or "active"
```

### `DELETE /api/automations/:automationId`

**CSRF必要**

```json
// Response 200
{ "deleted": true }
```

### `POST /api/automations/:automationId/run-now`

**CSRF必要** — Automationを即時実行。

### `POST /api/me/tokens`

**CSRF必要**

```json
// Request
{ "name": "ci-token" }

// Response 201 — トークンは1回のみ表示
{ "id": "...", "name": "ci-token", "token": "pat_xxxx..." }
```

### `DELETE /api/me/tokens/:tokenId`

**CSRF必要**

```json
// Response 200
{ "revoked": true }
```

---

## 管理者 API（要admin認証）

### 認証

### `POST /api/admin/auth/login`

```json
{ "loginName": "root", "password": "admin-password" }
```

### `POST /api/admin/auth/logout`

### `GET /api/admin/auth/me`

### `GET /api/admin/bootstrap`

ダッシュボードの全データを一括取得。

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

| メソッド | パス | CSRF | 説明 |
|---|---|---|---|
| `POST` | `/api/admin/users` | 要 | ユーザー作成 |
| `PATCH` | `/api/admin/users/:userId` | 要 | ユーザー更新 |
| `DELETE` | `/api/admin/users/:userId` | 要 | ユーザー削除 |
| `POST` | `/api/admin/users/:userId/password` | 要 | パスワード変更 |
| `PATCH` | `/api/admin/users/:userId/policies` | 要 | ポリシー割り当て |

### Tool Policies

| メソッド | パス | CSRF | 説明 |
|---|---|---|---|
| `POST` | `/api/admin/tool-policies` | 要 | 作成 |
| `PATCH` | `/api/admin/tool-policies/:policyId` | 要 | 更新 |
| `DELETE` | `/api/admin/tool-policies/:policyId` | 要 | 削除（`replacementPolicyId` をbodyに指定可） |

### File Policies

| メソッド | パス | CSRF | 説明 |
|---|---|---|---|
| `POST` | `/api/admin/file-policies` | 要 | 作成 |
| `PATCH` | `/api/admin/file-policies/:policyId` | 要 | 更新 |
| `DELETE` | `/api/admin/file-policies/:policyId` | 要 | 削除（`replacementPolicyId` をbodyに指定可） |
| `POST` | `/api/admin/file-policies/:policyId/roots` | 要 | ルート追加 |
| `DELETE` | `/api/admin/file-policies/:policyId/roots/:rootId` | 要 | ルート削除 |

### Filesystem

| メソッド | パス | CSRF | 説明 |
|---|---|---|---|
| `GET` | `/api/admin/fs/probe?path=...` | 不要 | パスの状態確認 |
| `GET` | `/api/admin/fs/browse?path=...` | 不要 | ディレクトリ内容の閲覧 |

### Approvals

| メソッド | パス | CSRF | 説明 |
|---|---|---|---|
| `POST` | `/api/admin/approvals/:approvalId/decision` | 要 | 承認/拒否 |

### Automations

| メソッド | パス | CSRF | 説明 |
|---|---|---|---|
| `PATCH` | `/api/admin/automations/:automationId` | 要 | 一時停止（`{"status":"paused"}`のみ） |
| `DELETE` | `/api/admin/automations/:automationId` | 要 | 削除 |

### Skills

| メソッド | パス | CSRF | 説明 |
|---|---|---|---|
| `GET` | `/api/admin/skills` | 不要 | 一覧 |
| `GET` | `/api/admin/skills/:skillName` | 不要 | 詳細 |
| `POST` | `/api/admin/skills` | 要 | 作成 |
| `PATCH` | `/api/admin/skills/:skillName` | 要 | 更新 |
| `DELETE` | `/api/admin/skills/:skillName` | 要 | 削除 |

### MCP Servers

| メソッド | パス | CSRF | 説明 |
|---|---|---|---|
| `GET` | `/api/admin/mcp-servers` | 不要 | 一覧 |
| `POST` | `/api/admin/mcp-servers` | 要 | 追加 |
| `PATCH` | `/api/admin/mcp-servers/:serverName` | 要 | 設定変更 |
| `DELETE` | `/api/admin/mcp-servers/:serverName` | 要 | 削除 |
| `POST` | `/api/admin/mcp-servers/:serverName/reconnect` | 要 | 再接続 |

### Protection Rules

| メソッド | パス | CSRF | 説明 |
|---|---|---|---|
| `GET` | `/api/admin/protection-rules` | 不要 | 一覧 |
| `POST` | `/api/admin/protection-rules` | 要 | 作成 |
| `PATCH` | `/api/admin/protection-rules/:ruleId` | 要 | 有効/無効切り替え |
| `DELETE` | `/api/admin/protection-rules/:ruleId` | 要 | 削除 |
| `POST` | `/api/admin/protection-rules/inspect` | 要 | パスの保護状態検査 |

---

## 外部チャネル Webhook

### Slack

| メソッド | パス | 認証 | 説明 |
|---|---|---|---|
| `POST` | `/api/integrations/slack/events` | Slack署名 | イベント受信 + URL検証 |
| `POST` | `/api/integrations/slack/actions` | Slack署名 | Block Kitインタラクション |

### Discord

| メソッド | パス | 認証 | 説明 |
|---|---|---|---|
| `POST` | `/api/integrations/discord/interactions` | Ed25519署名 | Interaction受信 |
