[English](../en/channels.md) | 日本語

# Channels

Web UI / Slack / Discord / API クライアントの接続と設定方法です。

---

## チャネルアーキテクチャ

```mermaid
graph TB
    subgraph "チャネル"
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
    WEB <-.->|SSE ストリーム| HTTP
    API -->|Bearer Token| HTTP
    SLACK -->|Webhook + 署名検証| HTTP
    DISCORD -->|Webhook + 署名検証| HTTP

    HTTP --> WA --> APP
    HTTP --> SA --> APP
    HTTP --> DA --> APP

    APP -.->|SSE イベント配信| WA
    APP -->|chat.postMessage| SA
    APP -->|channels/messages| DA
```

すべてのチャネルで:
- 同一のポリシー制御が適用される
- 同一の承認ワークフローが動作する
- 会話はチャネルごとに独立（統合しない）

---

## Web UI

デフォルトで提供されるチャットインターフェースです。

### アクセス

```
http://localhost:4310/
```

### 認証

- ログイン: `loginName` + `password`
- セッション: Cookie ベース（`microharnessengine_session`）
- CSRF: セッションごとにトークン発行
- 有効期限: デフォルト14日（Rolling expiry）

### 機能

- 会話の作成・切り替え
- メッセージの送受信
- SSE ストリーミング（LLM応答のリアルタイム表示）
- Run キャンセル（実行中エージェントの中断）
- 承認リクエストの処理（Approve / Deny）
- Automationの確認
- Personal Access Token の発行・失効

### リアルタイム通信

Web UI は SSE (Server-Sent Events) を使用してエージェントの実行状況をリアルタイムに受信します。

**SSE 接続仕様**:
- エンドポイント: `GET /api/conversations/:conversationId/stream`
- Cookie 認証（`credentials: 'include'`）
- `fetch()` + `ReadableStream` による独自クライアント実装（`EventSource` 非使用）
- ハートビート: 30秒間隔

**受信イベント**:
- `delta` — LLMのストリーミングテキスト → チャット画面にリアルタイム表示
- `run.completed` / `run.cancelled` / `run.failed` — Run 終了 → 画面更新
- `approval.requested` — 承認UI表示

**フォールバック仕様**:
- SSE 接続エラー時は 4秒間隔のポーリング（`loadWorkspace()`）に自動切替
- SSE の自動再接続は行わない（コンポーネント再マウントまで）

### WAN公開

Cloudflare Tunnel 等で外部公開する場合:

```env
ALLOWED_ORIGINS=https://app.example.com
```

推奨構成:
```
app.example.com   → Web UI + User API
admin.example.com → Admin Console + Admin API
```

---

## Slack

### 前提

- Slack App を作成済み
- Event Subscriptions を有効化
- Interactivity を有効化

### 環境変数

```env
SLACK_BOT_TOKEN=xoxb-xxxx-xxxx-xxxx
SLACK_SIGNING_SECRET=xxxx
```

### Webhook URL の設定

Slack App の設定画面で以下を登録:

| 設定 | URL |
|---|---|
| Event Subscriptions - Request URL | `https://your-domain/api/integrations/slack/events` |
| Interactivity - Request URL | `https://your-domain/api/integrations/slack/actions` |

### 購読するイベント

Bot Events:
- `message.im` — DMメッセージの受信

### 動作の仕組み

```
1. ユーザーが Slack DM でメッセージ送信
2. Slack → /api/integrations/slack/events (署名検証付き)
3. microHarnessEngine がユーザーを自動作成/解決
   - identity_key: slack:{teamId}:{userId}:{channelId}
4. 会話を作成/取得してエージェントループを開始
5. 応答を Slack chat.postMessage API で送信
```

### 承認

承認が必要な場合、Slack Block Kit のボタン付きメッセージが送信されます:

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

ボタンのクリックは `/api/integrations/slack/actions` で処理されます。

### スレッド

- Slack のスレッドは `thread:{timestamp}` として会話の `externalRef` にマッピング
- スレッドがない場合は `channel:{channelId}` を使用
- 同一スレッド内のメッセージは同じ会話として扱われる

---

## Discord

### 前提

- Discord Application を作成済み
- Bot を追加済み
- Interactions Endpoint URL を設定済み

### 環境変数

```env
DISCORD_BOT_TOKEN=xxxx
DISCORD_PUBLIC_KEY=xxxx
DISCORD_APPLICATION_ID=xxxx
```

### Interactions Endpoint

Discord Developer Portal で:

| 設定 | URL |
|---|---|
| Interactions Endpoint URL | `https://your-domain/api/integrations/discord/interactions` |

### スラッシュコマンド

以下のスラッシュコマンドを登録します:

| コマンド | オプション | 説明 |
|---|---|---|
| `/chat` | `message` (必須), `session` (任意) | メッセージを送信 |
| `/new-session` | `name` (任意) | 新しいセッション（会話）を開始 |

### 動作の仕組み

```
1. ユーザーが /chat message:"ファイル一覧を見せて" を実行
2. Discord → /api/integrations/discord/interactions (Ed25519 署名検証)
3. microHarnessEngine がユーザーを自動作成/解決
   - identity_key: discord:{userId}:{channelId}
4. 会話を作成/取得してエージェントループを開始
5. Ephemeral message で「受信しました」を応答
6. 結果を Discord channels/messages API で送信
```

### セッション管理

- デフォルト: `channel:{channelId}` ごとに1会話
- `/new-session` でセッション名を指定すると新しい会話を作成
- `/chat session:my-task` でセッションを指定してメッセージ送信

### 承認

Discord Component のボタン付きメッセージが送信されます:

```
Approval Required
Tool: delete_file
Reason: Deletion requires approval

[Approve (緑)] [Deny (赤)]
```

`custom_id` 形式: `approval:approve:{approvalId}` / `approval:deny:{approvalId}`

---

## API クライアント（PAT認証）

### Personal Access Token の取得

1. Web UIにログイン
2. トークン名を指定して発行
3. **表示されるトークンを保存**（1回しか表示されない）

### API呼び出し

```bash
curl -H "Authorization: Bearer pat_xxxxxxxxxxxx" \
  http://localhost:4310/api/conversations
```

### 特徴

- CSRFチェックなし（Bearer Token 使用時）
- セッション管理不要
- CI/CD やスクリプトからの利用に適している
- トークンのDB保存はSHA-256ハッシュのみ

### 主要エンドポイント

```bash
# 会話一覧
GET /api/conversations

# 会話作成
POST /api/conversations
  {"title": "My Task"}

# メッセージ送信
POST /api/conversations/:id/messages
  {"text": "ファイル一覧を見せて"}

# 会話詳細（メッセージ一覧含む）
GET /api/conversations/:id
```

詳細は [API Reference](./api-reference.md) を参照。

---

## 外部ユーザーの自動作成

Slack / Discord からのメッセージは、ユーザーの自動作成を伴います:

```
1. identityKey でチャネルアイデンティティを検索
2. 見つからない場合:
   a. 新しいユーザーを作成 (authSource: 外部チャネル名)
   b. チャネルアイデンティティを作成
   c. デフォルトポリシーを割り当て
3. 見つかった場合:
   既存のユーザーとして処理
```

自動作成されたユーザーには **Default (deny all)** の Tool Policy が割り当てられます。管理者がTool Policyを割り当てるまで、ツールは一切使えません。
