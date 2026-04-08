[English](../en/configuration.md) | 日本語

# Configuration

すべての環境変数と設定項目のリファレンスです。

---

## 環境変数一覧

`.env` ファイルまたはシステム環境変数で設定します。

### LLM プロバイダ

| 変数 | デフォルト | 説明 |
|---|---|---|
| `LLM_PROVIDER` | `anthropic` | 使用するLLMプロバイダ (`anthropic`, `claude`, `openai`, `gemini`, `google`) |
| `LLM_MAX_TOKENS` | `1400` | LLM応答の最大トークン数 |

### Anthropic (Claude)

| 変数 | デフォルト | 説明 |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Anthropic APIキー（必須） |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | 使用するモデル |
| `CLAUDE_MODEL` | — | `ANTHROPIC_MODEL` の別名 |

### OpenAI

| 変数 | デフォルト | 説明 |
|---|---|---|
| `OPENAI_API_KEY` | — | OpenAI APIキー（必須） |
| `OPENAI_MODEL` | `gpt-4.1-mini` | 使用するモデル |
| `OPENAI_API_URL` | `https://api.openai.com/v1/chat/completions` | APIエンドポイント |

### Gemini (Google)

| 変数 | デフォルト | 説明 |
|---|---|---|
| `GEMINI_API_KEY` | — | Gemini APIキー（必須） |
| `GEMINI_MODEL` | `gemini-2.5-flash` | 使用するモデル |
| `GEMINI_API_URL` | `https://generativelanguage.googleapis.com/v1beta` | APIエンドポイント |

### サーバー

| 変数 | デフォルト | 説明 |
|---|---|---|
| `API_PORT` | `4310` | APIサーバーのポート番号 |
| `PROJECT_ROOT_DIR` | `process.cwd()` | プロジェクトルートのパス |
| `APP_DB_PATH` | `app-v2.db` | SQLiteデータベースファイルのパス |

### 認証

| 変数 | デフォルト | 説明 |
|---|---|---|
| `ADMIN_RUNTIME_PASSWORD` | — | 管理画面のパスワード（必須） |
| `ROOT_BOOTSTRAP_SECRET` | — | 初期セットアップ用シークレット |
| `AUTH_SESSION_TTL_HOURS` | `336` (14日) | ユーザーセッションの有効期限（時間） |
| `ADMIN_SESSION_TTL_HOURS` | `12` | 管理者セッションの有効期限（時間） |
| `AUTH_COOKIE_NAME` | `microharnessengine_session` | ユーザーセッションのCookie名 |
| `ADMIN_AUTH_COOKIE_NAME` | `microharnessengine_admin_session` | 管理者セッションのCookie名 |

### CORS

| 変数 | デフォルト | 説明 |
|---|---|---|
| `ALLOWED_ORIGINS` | — | 許可するオリジン（カンマ区切り） |

未設定時は `localhost` / `127.0.0.1` のみ許可。

```env
# 単一オリジン
ALLOWED_ORIGINS=https://app.example.com

# 複数オリジン
ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
```

### Slack

| 変数 | デフォルト | 説明 |
|---|---|---|
| `SLACK_BOT_TOKEN` | — | Slack Bot Token (`xoxb-...`) |
| `SLACK_SIGNING_SECRET` | — | Slack Signing Secret |

### Discord

| 変数 | デフォルト | 説明 |
|---|---|---|
| `DISCORD_BOT_TOKEN` | — | Discord Bot Token |
| `DISCORD_PUBLIC_KEY` | — | Discord Public Key (Ed25519) |
| `DISCORD_APPLICATION_ID` | — | Discord Application ID |

### Automation

| 変数 | デフォルト | 説明 |
|---|---|---|
| `AUTOMATION_TICK_MS` | `30000` (30秒) | Automationのポーリング間隔（ミリ秒） |

### Web検索

| 変数 | デフォルト | 説明 |
|---|---|---|
| `BRAVE_SEARCH_API_KEY` | — | Brave Search API キー（`web_search` ツールに必要） |

---

## 設定例

### ローカル開発

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
ADMIN_RUNTIME_PASSWORD=dev-password
API_PORT=4310
```

### 本番（Claude + Slack）

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

### OpenAI互換 API（ローカルLLM）

`OPENAI_API_URL` を変更すれば、OpenAI互換のローカルLLMも使用できます:

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=dummy
OPENAI_MODEL=local-model
OPENAI_API_URL=http://localhost:8080/v1/chat/completions
```

---

## MCP設定

MCPサーバーの設定は環境変数ではなく `mcp/mcp.json` で管理します。

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

管理画面からも追加・編集・削除できます。詳細は [MCP Guide](./mcp-guide.md) を参照。

---

## スキル設定

スキルは `skills/` ディレクトリ内のMarkdownファイルとして管理します。

```markdown
---
name: code_review
description: コードレビューを行うスキル
---
以下のコードをレビューしてください。
バグ、セキュリティ問題、改善点を指摘してください。
```

管理画面からも作成・編集・削除できます。

---

## データベース

| 項目 | 値 |
|---|---|
| エンジン | SQLite (better-sqlite3) |
| ジャーナルモード | WAL (Write-Ahead Logging) |
| 外部キー制約 | 有効 |
| ファイルパス | `APP_DB_PATH`（デフォルト: `app-v2.db`） |

スキーマのマイグレーションはサーバー起動時に自動実行されます。
