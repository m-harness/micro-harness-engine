# Security Model

microHarnessEngineのセキュリティ設計の全体像です。

---

## 設計原則

### Code > Prompt

セキュリティの強制はコードで行います。プロンプトはUXの補助であり、防御の本体ではありません。

```
Prompt: 「保護ファイルは読まないでください」     → LLMが無視する可能性あり
Code:    tool実行前にパス保護チェック + 拒否      → コードレベルで強制
```

### Default Deny

新規ユーザーにはデフォルトで何の権限も与えません。管理者がポリシーで明示的に許可して初めて機能が使えます。

### Fail Closed

判定エラー、DB障害、パース失敗 — あらゆる異常時は**拒否**に倒します。

---

## 3層防壁

LLMのプロンプト遵守に依存しない、3つの独立した防壁です。

```
┌───────────────────────────────────────────────────────────┐
│                     Layer 1: 存在を隠す                    │
│                                                           │
│  list_files の結果から保護対象を自動除外                    │
│  LLMはファイルの存在自体を知ることができない                │
│                                                           │
│  実装: filterDiscoverableEntries()                        │
│  対象: discover アクション                                 │
│  結果: { entries: [...], hiddenCount: 3 }                 │
│         → LLM は「3件が非表示」とだけ知る                  │
├───────────────────────────────────────────────────────────┤
│                     Layer 2: 実行を拒否                    │
│                                                           │
│  Tool Policy: ユーザーに許可されていないツールは実行不可    │
│  File Policy: アクセス範囲外のパスは拒否                   │
│  Protection Engine: 保護対象パスへの操作を拒否              │
│                                                           │
│  実装: PolicyService.assertToolAllowed()                  │
│        PolicyService.resolveFileAccess()                  │
│        assertPathActionAllowed()                          │
├───────────────────────────────────────────────────────────┤
│                     Layer 3: 情報の流出を防ぐ              │
│                                                           │
│  Content Classifier: APIキー・トークンパターンを検出       │
│  Model Send Guard: LLMに送信する前にRedaction              │
│  DB/Log Guard: 保存前にも機密情報をRedaction               │
│                                                           │
│  実装: sanitizeMessagesForModel()                         │
│        sanitizeToolResultForModel()                       │
│        redactForPersistence()                             │
└───────────────────────────────────────────────────────────┘
```

---

## Protection Engine

パスベースとコンテンツベースの2つの保護メカニズムを持ちます。

### パス保護

ファイルパスに対して保護ルールを適用します。

```mermaid
graph TD
    REQ[ツール実行リクエスト<br/>action: read, path: .env] --> NORM[パス正規化<br/>バックスラッシュ変換<br/>トラバーサル防止]
    NORM --> LOAD[有効なルールを読み込み]
    LOAD --> MATCH[パスマッチング<br/>exact / dirname / glob]
    MATCH -->|マッチあり| PRIO[優先度で最優先ルール選択]
    MATCH -->|マッチなし| ALLOW[allow]
    PRIO --> EFFECT{effect}
    EFFECT -->|deny| DENY[拒否 + 監査ログ]
    EFFECT -->|ask| ASK[ユーザー確認へ]
    EFFECT -->|allow| ALLOW
```

### マッチングパターン

| パターン種別 | 説明 | 例 |
|---|---|---|
| `exact` | 完全一致（大文字小文字無視） | `.env` |
| `dirname` | ディレクトリとその配下すべて | `security` → `security/`, `security/keys/id_rsa` |
| `glob` | ワイルドカード | `**/*.key`, `.env.*`, `**/credentials.json` |

glob の変換ルール:
- `**` → `.*`（ディレクトリ区切りを越えてマッチ）
- `*` → `[^/]*`（単一ディレクトリ内でマッチ）
- 大文字小文字を無視

### 優先度

ルールが複数マッチした場合:
1. `priority` の数値が小さいほど優先
2. 同じ priority なら `id` が小さい（古い）ルールが優先

### デフォルト保護ルール

システムに初期状態で組み込まれているルールです:

| パターン | 種別 | 優先度 | 理由 |
|---|---|---|---|
| `.env` | exact | 10 | メイン環境変数ファイル |
| `.env.*` | glob | 10 | `.env.local`, `.env.production` 等 |
| `security` | dirname | 10 | security/ ディレクトリ全体 |
| `secrets` | dirname | 10 | secrets/ ディレクトリ全体 |
| `**/credentials.json` | glob | 15 | どの階層のcredentials.jsonも |
| `mcp/mcp.json` | exact | 10 | MCP設定（APIキーを含む可能性） |

すべて `effect: deny`、`scope: system` です。管理画面から無効化は可能ですが、削除はできません。

### アクション種別

保護ルールは以下のアクションに適用されます:

| アクション | 説明 | 適用ツール |
|---|---|---|
| `discover` | 存在の列挙 | `list_files` |
| `read` | 内容の読み取り | `read_file`, `grep` |
| `write` | 作成・上書き | `write_file`, `edit_file`, `multi_edit_file`, `make_dir` |
| `move` | 移動・リネーム | `move_file` (source と destination の両方をチェック) |
| `delete` | 削除 | `delete_file` |

---

## Content Classifier（機密情報検出）

ファイル内容やメッセージに含まれる機密情報パターンを検出し、自動的に `[REDACTED]` に置換します。

### 検出パターン

| ラベル | パターン | 例 |
|---|---|---|
| `anthropic_key` | `sk-ant-` + 10文字以上 | `sk-ant-api03-xxxx...` |
| `openai_key` | `sk-` (+ `proj-`) + 10文字以上 | `sk-proj-xxxx...` |
| `github_token` | `ghp_/gho_/ghu_/ghs_/ghr_` + 20文字以上 | `ghp_xxxxxxxxxxxx...` |
| `bearer_token` | `Bearer ` + 12文字以上 | `Bearer eyJhbGci...` |
| `pem_private_key` | PEM形式の秘密鍵ブロック全体 | `-----BEGIN RSA PRIVATE KEY-----` |
| `assignment_secret` | `api_key=`, `password:`, `secret=` 等 + 6文字以上の値 | `api_key=abc123def456` |

### Redaction の適用箇所

```
                      ┌──────────────────┐
                      │  Content         │
                      │  Classifier      │
                      └──────┬───────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
    ┌─────────────┐  ┌────────────┐  ┌──────────┐
    │ LLM送信前   │  │ DB保存前   │  │ ツール    │
    │ sanitize    │  │ redact     │  │ 結果     │
    │ ForModel()  │  │ ForPersist │  │ redact   │
    └─────────────┘  └────────────┘  └──────────┘
```

- **LLM送信前**: 会話履歴とツール実行結果に含まれる機密情報をRedact
- **DB保存前**: メッセージとツールログの保存前にRedact
- **再帰的処理**: オブジェクト・配列も再帰的に走査

---

## 承認ワークフロー（Approval）

破壊的な操作は実行前に人間の承認を要求します。

```mermaid
sequenceDiagram
    participant LLM as LLM
    participant APP as App Engine
    participant USER as ユーザー
    participant ADMIN as 管理者

    LLM->>APP: delete_file を呼び出し
    APP->>APP: approvalGranted = false
    APP->>APP: approvalRequired レスポンスを返す
    APP->>APP: Agent Run を waiting_approval に変更
    APP->>USER: 「承認が必要です」通知

    alt ユーザーが承認
        USER->>APP: approve
        APP->>APP: delete_file を実際に実行
        APP->>APP: Agent Loop を再開
    else ユーザーが拒否
        USER->>APP: deny
        APP->>LLM: "Human approval was denied."
        APP->>APP: Agent Loop を再開（拒否結果で継続）
    else 管理者が承認/拒否
        ADMIN->>APP: approve / deny
        Note over ADMIN: 管理画面から全承認を操作可能
    end
```

現在、承認が必要なツール:
- `delete_file` — ファイル・ディレクトリの削除

承認はチャットUI・Slack・Discord・管理画面のいずれからでも操作できます。

---

## 認証セキュリティ

### パスワード

- **ハッシュ**: `scrypt` (salt 16バイト、derived key 64バイト)
- **最低文字数**: 12文字
- **timing-safe比較**: `crypto.timingSafeEqual`

### セッション

- **トークン**: `crypto.randomBytes(32).toString('base64url')`
- **CSRF**: セッションごとに個別のCSRFトークン
- **Cookie**: `HttpOnly`, `SameSite=Lax`, 本番環境では `Secure`
- **有効期限**: ユーザー14日 / 管理者12時間（設定変更可能）
- **ユーザーセッション**: Rolling expiry（アクセスごとに延長）
- **管理者セッション**: 固定 expiry（延長なし、再起動で消失）

### Personal Access Token (PAT)

- DBに保存されるのはSHA-256ハッシュのみ
- 生のトークンは発行時に1回だけ表示
- PAT使用時はCSRFチェックをスキップ（APIクライアント向け）

### 外部チャネル署名検証

- **Slack**: HMAC-SHA256 署名検証 + タイムスタンプ鮮度チェック（5分以内）
- **Discord**: Ed25519 署名検証

### CORS

- `ALLOWED_ORIGINS` 未設定時: `localhost` / `127.0.0.1` のみ許可
- 設定時: 明示されたオリジンのみ許可

---

## 脅威モデル

### 対策している脅威

| 脅威 | 対策 |
|---|---|
| Prompt injectionでLLMが機密ファイルを探索 | Layer 1: 存在を隠す |
| LLMが保護ファイルを読んで応答に含める | Layer 2: 読み取り拒否 + Layer 3: Redaction |
| ユーザーがAPIキーをチャットに貼る | Content Classifier が検出・Redact |
| 権限のないツール実行 | Tool Policy で拒否 |
| プロジェクト外のファイルアクセス | File Policy で拒否 |
| 破壊的操作の暴走 | Approval Workflow で人間が判断 |
| 管理画面への不正アクセス | 分離認証 + CSRF + 揮発性セッション |
| Slack/Discord webhook偽装 | 暗号署名検証 |

### この設計では完全に防げないもの

- OS自体が侵害されている場合
- 開発者がProtection Engineを迂回するコードを書く場合
- 外部ライブラリが独自に情報を送信する場合

これはアプリケーションレベルの流出抑止設計です。
