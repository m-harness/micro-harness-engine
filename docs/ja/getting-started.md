[English](../en/getting-started.md) | 日本語

# Getting Started

microHarnessEngineのインストールから最初のチャットまでのガイドです。

---

## 必要要件

- **Node.js** 18 以上
- **npm**
- いずれか1つの LLM API キー:
  - Anthropic API Key (`sk-ant-...`)
  - OpenAI API Key (`sk-...`)
  - Google Gemini API Key

---

## インストール

```bash
git clone https://github.com/m-harness/micro-harness-engine.git
cd micro-harness-engine
npm install
```

管理画面のビルド（初回のみ）:

```bash
npm run build:web
```

---

## 環境設定

プロジェクトルートに `.env` ファイルを作成します。

### 最小構成

```env
# LLMプロバイダ（必須）
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx

# 管理画面パスワード（必須）
ADMIN_RUNTIME_PASSWORD=your-secure-password-here
```

### OpenAI を使用する場合

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-xxxxx
```

### Gemini を使用する場合

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=xxxxx
```

すべての設定項目は [Configuration](./configuration.md) を参照してください。

---

## 起動

### 本番モード

```bash
npm run build:web   # 管理画面をビルド（初回のみ）
npm start
```

起動すると以下が利用可能になります:

| URL | 用途 |
|---|---|
| `http://localhost:4310/` | チャットUI |
| `http://localhost:4310/admin` | 管理画面 |
| `http://localhost:4310/api/health` | ヘルスチェック |

ポートは `API_PORT` 環境変数で変更できます（デフォルト: `4310`）。

### 開発モード

バックエンドAPIとVite開発サーバーを1コマンドで同時起動できます:

```bash
npm run dev:full
```

| URL | 用途 |
|---|---|
| `http://localhost:4173/` | Web UI（Vite HMR有効、APIは自動プロキシ） |
| `http://localhost:4310/` | バックエンドAPI（ファイル変更で自動リロード） |

- バックエンド: `src/` 配下のファイル変更で自動リロード
- フロントエンド: Vite HMR でホットリロード
- API通信はViteのプロキシ経由で `localhost:4310` に転送されます

---

## 初期セットアップ

### 1. 管理画面にログイン

`http://localhost:4310/admin` にアクセスし、以下でログイン:

- **Login Name**: `root`
- **Password**: `.env` に設定した `ADMIN_RUNTIME_PASSWORD`

`root` はシステムが自動作成する特殊な管理者アカウントです。削除・無効化はできません。

### 2. ユーザーを作成

**Users** セクションから新しいユーザーを作成します。

- **Login Name**: 英数字・ハイフン・アンダースコア（2〜32文字）
- **Display Name**: 表示名
- **Password**: 12文字以上
- **Role**: `user` または `admin`

### 3. Tool Policy を作成

**Tool Policies** セクションで、許可するツールを選択したポリシーを作成します。

例: 「読み取り専用」ポリシー
- `list_files` — ファイル一覧
- `read_file` — ファイル読み取り
- `glob` — パターン検索
- `grep` — 内容検索

例: 「開発者」ポリシー
- 上記 + `write_file`, `edit_file`, `multi_edit_file`, `make_dir`, `move_file`

> システムには「Default (deny all)」と「System All Tools」の2つのシステムポリシーが初期から存在します。
> - **Default**: ツール使用をすべて拒否（新規ユーザーのデフォルト）
> - **System All Tools**: 登録されたすべてのツールを許可（rootユーザーに割り当て済み）

### 4. File Policy を作成（任意）

プロジェクトディレクトリ外のパスへのアクセスが必要な場合のみ作成します。

デフォルトの File Policy は **ワークスペース（プロジェクトルート配下）のみ** アクセス可能です。

外部パスを追加する場合:
- **Scope**: `absolute`
- **Root Path**: `/var/log/myapp`（アクセスを許可するパス）
- **Path Type**: `dir` または `file`

### 5. ポリシーをユーザーに割り当て

**Users** セクションで各ユーザーに:
- Tool Policy を1つ割り当て
- File Policy を1つ割り当て

### 6. チャットを開始

`http://localhost:4310/` にアクセスし、作成したユーザーでログインします。

新しい会話を作成し、メッセージを送信すると、AIアシスタントが応答します。ユーザーに許可されたツールのみが使用されます。

---

## 動作確認

### ヘルスチェック

```bash
curl http://localhost:4310/api/health
```

```json
{
  "status": "ok",
  "provider": "anthropic",
  "projectRoot": "/path/to/your/project"
}
```

### CLI からユーザー作成

管理画面を使わずにCLIからも操作できます:

```bash
npm run root:cli -- create-user --username testuser --password "securepassword123"
npm run root:cli -- list-users
```

---

## 次のステップ

- [Architecture](./architecture.md) — システム全体の構成を理解する
- [Security Model](./security.md) — セキュリティ設計を理解する
- [Policy Guide](./policy-guide.md) — ポリシー設定を詳しく知る
- [Channels](./channels.md) — Slack / Discord を接続する
- [Configuration](./configuration.md) — 全設定項目を確認する
