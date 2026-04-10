[English](../en/ui-functional-spec.md) | 日本語

# microHarnessEngine Web UI 機能仕様書

> **目的**: UI の見た目を完全に作り直す際に、機能が一切失われないようにするための仕様書。
> API・ロジックは変更しない前提。技術スタックは React + Tailwind CSS + Vite を継続。

---

## 1. アプリケーション構成

### 1.1 2つの独立した画面

| 画面 | パス | 認証 | 用途 |
|------|------|------|------|
| **ユーザーワークスペース** | `/`, `/c/:conversationId` | ユーザーセッション (`microharnessengine_session` cookie) | チャット・承認・オートメーション・APIトークン管理 |
| **管理コンソール** | `/admin/*` | 管理者セッション (`microharnessengine_admin_session` cookie) | ユーザー発行・ポリシー管理・運用監視 |

- ルーティングは `react-router-dom` v6 を使用（`BrowserRouter` + `lazy()` + `Suspense`）
- 全ページはコード分割（`lazy()` でインポート）

### 1.2 エントリーポイント

```
main.jsx → <BrowserRouter>
  └─ <JotaiProvider>
       └─ <Toaster richColors position="top-right" />  (sonner)
            └─ <App />  (ルート定義)
```

### 1.3 ルートテーブル

| パス | コンポーネント | 認証ガード | レイアウト |
|------|------|------|------|
| `/login` | `LoginPage` | なし | なし |
| `/admin/login` | `AdminLoginPage` | なし | なし |
| `/` (index) | `WorkspacePage` | `ProtectedRoute type="user"` | `WorkspaceLayout` |
| `/c/:conversationId` | `WorkspacePage` | `ProtectedRoute type="user"` | `WorkspaceLayout` |
| `/admin` (index) | `OverviewPage` | `ProtectedRoute type="admin"` | `AdminLayout` |
| `/admin/users` | `UsersPage` | `ProtectedRoute type="admin"` | `AdminLayout` |
| `/admin/tool-policies` | `ToolPoliciesPage` | `ProtectedRoute type="admin"` | `AdminLayout` |
| `/admin/file-policies` | `FilePoliciesPage` | `ProtectedRoute type="admin"` | `AdminLayout` |
| `/admin/protection-rules` | `ProtectionRulesPage` | `ProtectedRoute type="admin"` | `AdminLayout` |
| `/admin/approvals` | `ApprovalsPage` | `ProtectedRoute type="admin"` | `AdminLayout` |
| `/admin/automations` | `AutomationsPage` | `ProtectedRoute type="admin"` | `AdminLayout` |
| `/admin/tools` | `ToolsPage` | `ProtectedRoute type="admin"` | `AdminLayout` |
| `/admin/skills` | `SkillsPage` | `ProtectedRoute type="admin"` | `AdminLayout` |
| `/admin/mcp-servers` | `McpServersPage` | `ProtectedRoute type="admin"` | `AdminLayout` |
| `*` (catch-all) | `Navigate to="/"` | なし | なし |

`ProtectedRoute`: マウント時に `api.getAuthState()` (user) / `api.getAdminAuthState()` (admin) を呼び出し、未認証なら `/login` or `/admin/login` にリダイレクト。

### 1.4 非Reactコードからのナビゲーション

`navigateRef.js` で `useNavigate()` / `useLocation()` をモジュールレベル ref にキャプチャし、axios インターセプタ（401時のリダイレクト等）から呼び出せるようにしています。

---

## 2. 共通パターン

### 2.1 状態管理 (jotai)

グローバル状態は jotai atom で管理されます。全 atom は `atom()` プリミティブです。

#### workspace.js

| atom | デフォルト値 | 用途 |
|------|------|------|
| `workspaceAtom` | `{ conversations: [], apiTokens: [] }` | ブートストラップデータ |
| `selectedConversationIdAtom` | `null` | 選択中の会話ID |
| `conversationViewAtom` | `null` | 選択中の会話詳細 (messages, approvals, automations, activeRun, lastFailedRun) |
| `streamingMessageAtom` | `null` | SSEストリーミング中のテキスト蓄積 `{ text, runId }` |

#### ui.js

| atom | デフォルト値 | 用途 |
|------|------|------|
| `themeAtom` | `localStorage 'mhe-theme'` or `'light'` | ダーク/ライトテーマ |
| `workspaceBusyKeyAtom` | `''` | ワークスペースローディング状態 |
| `adminBusyKeyAtom` | `''` | 管理画面ローディング状態 |

#### auth.js

| atom | デフォルト値 | 用途 |
|------|------|------|
| `authStateAtom` | `{ user: null, csrfToken: '', bootstrapRequired: false, webBootstrapEnabled: false }` | ユーザー認証状態 |
| `adminAuthStateAtom` | `{ adminAuthenticated: false, csrfToken: '', adminEnabled: false, user: null }` | 管理者認証状態 |

#### admin.js

| atom | デフォルト値 | 用途 |
|------|------|------|
| `adminDataAtom` | `null` | 管理ブートストラップデータ |

### 2.2 API通信レイヤー

#### REST (lib/api.js + lib/axios.js)

- `axios` インスタンスに `withCredentials: true` 設定
- リクエストインターセプタ: 非GETリクエストに `x-csrf-token` ヘッダを付与（ユーザー/管理者で別トークン）
- レスポンスインターセプタ: `{ ok, data, error }` エンベロープをアンラップして `data` を返却。401エラー時は `navigateRef` 経由でログイン画面にリダイレクト
- エラー時は `throw new Error(payload.error)` → `runAction` でキャッチ

#### SSE (lib/sse.js)

`createSSEConnection(url, { onEvent, onError, onClose })` — `EventSource` ではなく `fetch()` + `ReadableStream` による独自実装:

- `credentials: 'include'` で Cookie 認証
- `Accept: 'text/event-stream'` ヘッダ
- レスポンスボディを `getReader()` でチャンク読み取り
- `\n\n` でイベント境界分割、`event:` / `data:` 行を解析
- `:` で始まるコメント行（ハートビート）は無視
- `data` は `JSON.parse()` を試行、失敗時は生文字列
- コールバック: `onEvent({ type, data })`, `onError(err)`, `onClose()`
- 戻り値: `{ close() }` — `AbortController.abort()` で切断
- `AbortError` は意図的なクローズとして無視

### 2.3 ローディング管理 (`workspaceBusyKeyAtom` + `runAction` パターン)

```javascript
const runAction = useCallback(async (key, callback) => {
    setBusyKey(key)        // workspaceBusyKeyAtom に設定
    try {
        await callback()
    } catch (error) {
        toast.error(error.message)   // sonner toast
    } finally {
        setBusyKey('')     // クリア
    }
}, [setBusyKey])
```

- 各ボタンは `disabled={busyKey === 'key-name'}` で二重送信防止
- ボタンのラベルを `busyKey` に応じて「Sending...」等に切替

**使用されるキー**: `'create-conversation'`, `'select-<id>'`, `'send-message'`, `'cancel-run'`, `'approval-<id>'`, `'create-automation'`, `'automation-<id>'`, `'run-<id>'`, `'delete-<id>'`, `'create-token'`, `'revoke-<id>'`

管理画面でも同じパターンを `adminBusyKeyAtom` で使用。

### 2.4 フラッシュメッセージ (sonner toast)

`sonner` ライブラリの `toast` を使用:

- `toast.error(message)` — エラー通知（`runAction` の catch、ログイン失敗等）
- `toast.success(message)` — 成功通知（ログイン成功時等）
- 設定: `<Toaster richColors position="top-right" />`

### 2.5 日付フォーマット

```javascript
new Intl.DateTimeFormat('ja-JP', {
  month: 'short', day: 'numeric',
  hour: '2-digit', minute: '2-digit'
}).format(new Date(value))
```

- 値がない場合は `'Not yet'` を表示

### 2.6 ステータスバッジ (`StatusBadge` コンポーネント)

ステータス文字列 → 色のマッピング:

| ステータス | 色系統 |
|------------|--------|
| `active`, `completed`, `approved` | emerald (緑) |
| `queued`, `running`, `waiting_approval`, `pending` | amber (黄) |
| `recovering` | orange |
| `paused` | slate (灰) |
| `cancelled` | slate (灰) |
| `denied`, `failed`, `disabled`, `deleted` | rose (赤) |
| その他 | slate (灰) デフォルト |

### 2.7 確認ダイアログ

- 削除系の操作は `window.confirm()` で確認（カスタムモーダルではない）
- ポリシー削除のみ `DeletePolicyDialog` (カスタムモーダル) を使用

### 2.8 アニメーション (framer-motion)

`lib/motion.js` に定義されたプリセット:
- `fadeInUp`, `fadeIn`, `scaleIn`, `stagger(index)`
- `prefers-reduced-motion` を尊重

### 2.9 i18n (国際化)

- `i18n/translations.js` に `en` / `ja` の翻訳辞書
- `i18n/context.jsx` に `I18nProvider` + `useI18n` hook
- ロケールは `localStorage` (`microharnessengine-admin-web.locale`) に保存
- ブラウザ言語を自動検出
- **注**: 現在のApp.jsx/AdminConsole.jsx では直接英語テキストを使用しており、i18n contextは未使用状態

---

## 3. ユーザーワークスペース

### 3.1 ワークスペース ライフサイクル

```
マウント
  └─ loadWorkspace(preferredConversationId?)
       ├─ api.getBootstrap() → workspaceAtom, authStateAtom 更新
       └─ loadConversation(id, conversations)
            └─ api.getConversation() → conversationViewAtom 更新

リアルタイム更新 (優先: SSE)
  ├─ SSE接続成功時:
  │    └─ createSSEConnection(/api/conversations/:id/stream)
  │         ├─ delta → streamingMessageAtom にテキスト蓄積
  │         ├─ run.completed / run.cancelled / run.failed
  │         │    → streamingMessageAtom クリア + loadWorkspace()
  │         └─ approval.requested → loadWorkspace()
  │
  └─ SSEエラー時 (フォールバック: ポーリング):
       └─ 4000ms ごとに loadWorkspace() を呼び出し
```

**SSE接続の管理**:
- `useSSE` は `useState(true)` のローカルステート
- SSE エラー発生時に `false` に設定、以降はポーリングにフォールバック
- SSE の再接続は自動的には行われない（コンポーネント再マウントまで）
- 会話切替時に SSE は再接続される（`selectedConversationId` が `useEffect` の依存配列に含まれるため）

### 3.2 画面遷移

```
[初期化中] → "Authenticating..." 表示 (ProtectedRoute)
[未認証]   → /login にリダイレクト
[認証済み] → WorkspaceLayout + WorkspacePage
```

### 3.3 ログイン画面 (`LoginPage`)

**構成**: 2カラムグリッド (lg以上)

| 左カラム | 右カラム |
|----------|----------|
| ブランドカード (暗い背景) | サインインフォーム + 管理情報カード |

**ブランドカード**:
- タイトル: "microHarnessEngine"
- サブタイトル: "Private one-to-one AI chat for Web, Slack, and Discord."
- 説明文あり

**サインインフォーム**:
- フィールド: `loginName` (text), `password` (password)
- ボタン: "Sign in" (ローディング中: "Signing in...")
- 送信: `api.login(loginForm)` → ワークスペースに遷移
- エラー: `toast.error(error.message)`

**管理情報カード**:
- タイトル: "Admin-managed accounts"
- コードブロック: admin plane のURLやCLIコマンドを表示

### 3.4 ワークスペース画面

**全体構成**: `WorkspaceLayout` (ヘッダー + サイドバー + メインコンテンツ)

#### 3.4.1 ヘッダー

- ブランドラベル: "microHarnessEngine Workspace"
- ユーザー表示名、@loginName、role
- ステータスBadge: activeRun のステータスまたは "ready"
- ボタン: "New conversation", "Log out"

#### 3.4.2 左カラム: 会話サイドバー (`ConversationSidebar`)

**会話が0件**: `EmptyState` コンポーネント

**会話リスト**: 各会話はカード要素
- 選択中: ハイライト表示
- 表示情報:
  - `title`
  - `source` (web/slack/discord)
  - 未承認件数バッジ (`pendingApprovalCount > 0` のとき)
  - 最終メッセージ日時 (`lastMessageAt` or `createdAt`)
  - アクティブ実行ステータス (`activeRunStatus`)

**動作**: クリックで `selectConversation(id)` → URL 遷移 (`/c/:id`) + 会話読み込み

#### 3.4.3 中央カラム: メッセージスレッド

##### メッセージ一覧 (`MessageList`)

- `streamingMessageAtom` を直接参照
- 自動スクロール: 新メッセージ・ストリーミングテキスト変更時に末尾へスクロール（`SCROLL_THRESHOLD = 50` でユーザーのスクロールアップを検知）
- 会話未選択: `EmptyState` "No session selected"
- メッセージ0件: `EmptyState` "This conversation is ready"
- ストリーミング中: `StreamingBubble` を末尾に表示

##### メッセージバブル (`MessageBubble`)

| role | 表示 |
|------|------|
| `user` | 右寄せ、primary色背景、白テキスト |
| `assistant` | 左寄せ、カード背景、`react-markdown` + `remark-gfm` でMarkdownレンダリング |
| `tool` | 中央表示、dashed border、折りたたみ可能 (`AnimatePresence`) |

- `framer-motion` で fade + slide-up のエントランスアニメーション

##### ストリーミングバブル (`StreamingBubble`)

- assistant バブルと同じ見た目
- パルスカーソル (`animate-pulse bg-foreground/60`) 付き
- ストリーミング中のMarkdownをリアルタイムレンダリング

##### ツールメッセージ (`ToolMessage`)

- 折りたたみパネル
- ツール名をregexで抽出 (`/^\[Tool\]\s+(\S+?)\(/`)
- `ChevronDown`/`ChevronUp` (lucide-react) アイコン
- framer-motion で展開/折りたたみアニメーション

##### チャット入力 (`ChatInput`)

- `useWorkspace()` から `sendMessage`, `cancelRun`, `busyKey` を使用
- フォーム送信 + `Ctrl/Cmd+Enter` ショートカット
- `Escape` キーでアクティブ Run をキャンセル
- アクティブ Run 表示: `StatusBadge` + フェーズ情報 + スピナー + 停止ボタン
- 失敗 Run のエラー表示: destructive 色のバナー
- 送信ボタン: `isSending` または空テキスト時は disabled

**送信動作**:
1. テキストが空なら何もしない
2. `selectedConversationId` がなければ新規会話作成
3. `sendMessage(text)` → テキストクリア

#### 3.4.4 右カラム: サイドバー (3つのカード)

##### (A) Approvals カード

**タイトル**: "Approvals"
**説明**: "Human decisions resume the paused run for this user only."

**承認0件**: テキスト "No pending approvals in this session."

**承認リスト**: 各承認アイテム
- ステータスBadge + ツール名 (uppercase)
- 理由テキスト (`reason`)
- ツール入力のJSONプレビュー (`JSON.stringify(toolInput, null, 2)`)
- ボタン: "Approve", "Deny"
- 動作: `handleApproval(id, decision)` → `loadWorkspace()`

##### (B) Automations カード

**タイトル**: "Automations"

**作成フォーム** (常に表示):
- `name` (Input, placeholder: "Automation name")
- `instruction` (Textarea, placeholder: "What should this automation do?")
- `intervalMinutes` (Input type=number, min=5, placeholder: "60")
- ボタン: "Create"
- 動作: `createAutomation()` → フォームクリア → `loadWorkspace()`
- 前提: 会話が選択されていない場合は `toast.error()`

**オートメーションリスト**: 各アイテム
- 名前 + インターバル表示 (`formatInterval`)
- ステータスBadge
- 指示文 (`instruction`, whitespace-pre-wrap)
- 次回実行日時
- ボタン群:
  - "Run now": `runAutomationNow()`
  - "Pause"/"Resume": `updateAutomationStatus()` (activeならpause、pausedならactive)
  - "Delete": `window.confirm()` → `deleteAutomation()`

**インターバル表示ルール**:
- なし → "Manual"
- 60未満 → "Every {n} min"
- 60で割り切れる → "Every {n} hr"
- その他 → "Every {n} min"

##### (C) API access カード

**タイトル**: "API access"

**トークン表示** (`revealedToken` が存在時):
- "Copy this token now" + teal背景のコードブロック

**作成フォーム**:
- `newTokenName` (Input, 初期値: "Primary integration token")
- ボタン: "Create"
- 動作: `createToken(name)` → トークン表示 → `loadWorkspace()`

**トークンリスト**: 各トークン
- 名前、作成日時、最終使用日時
- ボタン: "Revoke" (`window.confirm()` → `revokeToken()`)

**0件**: テキスト "No personal access tokens yet."

### 3.5 ログアウト動作

1. `api.logout()`
2. 状態リセット
3. `/login` にリダイレクト

---

## 4. 管理コンソール

### 4.1 ライフサイクル

```
マウント
  └─ ProtectedRoute → api.getAdminAuthState()
       ├─ 未認証 → /admin/login にリダイレクト
       └─ 認証済 → AdminLayout + ページコンポーネント
            └─ loadAdmin() → api.getAdminBootstrap() → adminDataAtom
```

- ポーリングなし（手動リフレッシュのみ）
- mutation実行後に毎回 `loadAdmin()` でデータ再取得

### 4.2 認証画面 (`AdminLoginPage`)

**構成**: 中央寄せのカード

**カード内容**:
- タイトル: "Admin Console"
- 説明: rootアカウントの説明
- admin未有効時の警告バナー (amber)
- フォーム:
  - `loginName` (初期値: "root")
  - `password`
  - ボタン: "Enter admin console" (`adminEnabled` が false なら disabled)
- 動作: `api.adminLogin()` → パスワードクリア → `/admin` にリダイレクト
- エラー: `toast.error(error.message)`

### 4.3 メイン画面 (`AdminLayout`)

**全体構成**: サイドバーナビゲーション + メインコンテンツ (各ページ)

#### サイドバー
- ラベル: "Admin Plane"
- ログインユーザー表示: "@{loginName}"
- ログアウトボタン
- ナビゲーションリンク (react-router-dom `NavLink`)

#### ページ一覧

```
/admin (overview) | /admin/users | /admin/tool-policies | /admin/file-policies |
/admin/protection-rules | /admin/approvals | /admin/automations |
/admin/tools | /admin/skills | /admin/mcp-servers
```

### 4.4 Overview タブ

**レイアウト**: グリッド

**統計カード** (7枚):
| ラベル | データソース |
|--------|-------------|
| Users | `overview.userCount` |
| Pending approvals | `overview.pendingApprovalCount` |
| Automations | `overview.automationCount` |
| Tool policies | `overview.toolPolicyCount` |
| File policies | `overview.filePolicyCount` |
| Protection rules | `overview.protectionRuleCount` |
| Registered tools | `overview.toolCatalogCount` |

各カードは値がない場合 `0` を表示。

### 4.5 Users タブ

**レイアウト**: 2カラムグリッド

#### 左: ユーザーリスト

**各ユーザーカード**:
- 表示名 + @loginName
- ステータスBadge群: status, role, authSource, (rootなら "protected root")
- ツールポリシー選択 (`<select>`): 変更即実行 → `api.adminAssignPolicies()`
- ファイルポリシー選択 (`<select>`): 変更即実行 → `api.adminAssignPolicies()`
- パスワード変更行: Input + "Set password" ボタン
  - rootユーザーは disabled (placeholder: "Managed by ADMIN_RUNTIME_PASSWORD")
- ステータス切替ボタン: "Disable"/"Enable"
  - rootユーザーは disabled
- 削除ボタン: "Delete"
  - rootまたはリモートアカウントは disabled
  - `window.confirm()` → `api.adminDeleteUser()`

#### 右: ユーザー作成フォーム

- `loginName`, `displayName`, `password`, `role` (select: "user" / "admin")
- ボタン: "Create user"
- 動作: `api.adminCreateUser()` → フォームクリア → `loadAdmin()`

### 4.6 Tool Policies タブ

**レイアウト**: 2カラムグリッド

#### 左: ポリシーリスト

**各ポリシーカード**:
- 名前 + 説明
- Badge: "system" or "custom"
- カスタムのみ: "Edit" ボタン, "Delete" ボタン
- ツール一覧: 各ツール名 + RiskBadge (inline)

**Edit**: ツールポリシー編集モーダルを開く
**Delete**: `DeletePolicyDialog` を開く (置換ポリシー選択付き)

#### 右: ポリシー作成フォーム

- MCP サーバーがある場合: 接続状態凡例
- `name`, `description`
- ツールチェックボックスリスト (スクロール):
  - 各ツール: checkbox + 名前 + MCP Badge + 説明 + RiskBadge
- ボタン: "Create tool policy"

### 4.7 File Policies タブ

**レイアウト**: 2カラムグリッド

#### 左: ポリシーリスト

**各ポリシーカード**:
- 名前 + 説明 + Badge: "system" / "custom"
- カスタムのみ: "Edit policy", "Delete policy" ボタン
- ルート一覧: `scope:pathType:rootPath` 形式で表示 + "Delete" ボタン
- ルート追加行 (カスタムのみ):
  - `rootPath` (Input), `pathType` (select: "dir" / "file")
  - "Choose path" ボタン (ファイルブラウザモーダル)
  - "Add root" ボタン (scope は固定 "absolute")

#### 右: Probe path カード

- パス入力 + "Probe" ボタン → `api.adminProbePath()`
- 結果: visible/not found, inside/outside workspace, pathType, 解決後パス

#### モーダル

- ファイルポリシー作成/編集: `name`, `description`
- ファイルブラウザ (`FileBrowser`): ディレクトリ展開、パス追加
- ファイルポリシー削除 (`DeletePolicyDialog`)

### 4.8 Protection Rules タブ

**レイアウト**: 2カラムグリッド

#### 左: ルールリスト

- 注意バナー: ワークスペース相対パスに適用
- 各ルール: パターン + note + Badge群 (patternType, scope, enabled状態)
- "Enable"/"Disable", "Delete" ボタン

#### 右上: ルール作成カード

- `kind` (select: path/dir/glob), `pattern`
- ボタン: "Create protection rule"

#### 右下: パス検査カード

- パス入力 + "Inspect" ボタン
- 結果: "Protected" / "Not protected" + マッチルール

### 4.9 Approvals タブ

- 承認リスト: Badge(status) + toolName + 日時 + 理由 + JSON入力
- "Approve", "Deny" ボタン → `api.adminDecideApproval()`
- 0件: "No pending approvals."

### 4.10 Automations タブ

- リスト: 名前 + オーナーID + 次回実行 + ステータスBadge + 指示文
- "Pause" → `api.adminPauseAutomation()`
- "Delete" → `api.adminDeleteAutomation()`
- 0件: "No active automations."

### 4.11 Tools タブ

- MCP接続状態凡例
- 各ツール: 名前 + McpBadge + McpStatusBadge + RiskBadge + 説明 + input_schema JSON

### 4.12 Skills タブ

**レイアウト**: 2カラムグリッド

#### 左: スキルリスト
- 各スキル: 名前 + 説明 + "Edit"/"Delete" ボタン
- インライン編集: `description`, `prompt` (Textarea)

#### 右: スキル作成カード
- `name`, `description`, `prompt`
- ボタン: "Create skill"

### 4.13 MCP Servers タブ

**レイアウト**: 2カラムグリッド

#### 左: サーバーリスト

- 各サーバー: 名前 + プロトコルBadge + 接続詳細 + 状態Badge + ツール数
- インライン編集 + "Reconnect" + "Delete" ボタン
- Reconnect後のポーリング: 2秒間隔、最大8回

#### 右: サーバー追加カード

- `name`, `mode` (stdio/http)
- stdio: `command`, `args`, `env` (KeyValueEditor)
- http: `url`, `headers` (KeyValueEditor)
- ボタン: "Add server"

---

## 5. 再利用コンポーネント仕様

### 5.1 Button

```
variants: default | secondary | outline | ghost | destructive
sizes: default | sm
```
- CVA (class-variance-authority) ベース

### 5.2 Card / CardHeader / CardTitle / CardDescription / CardContent

- CardHeader: 下ボーダーあり
- CardContent: パディングあり
- 全体: rounded + border + shadow + 背景色

### 5.3 Input

- テキスト入力
- フォーカス時: primary色のリング
- rounded corners + border

### 5.4 Textarea

- 複数行入力
- Input と同じフォーカススタイル

### 5.5 Label

- フォームラベル

### 5.6 Badge

```
tones: default | success | warn | danger
```

### 5.7 Table / THead / TBody / TR / TH / TD

- テーブルコンポーネント

### 5.8 DeletePolicyDialog

**Props**:
- `open`: 表示フラグ
- `title`, `description`: ダイアログの説明
- `policies`: 置換候補ポリシー配列
- `value`: 選択された置換ポリシーID
- `replacementRequired`: ユーザーが割り当てられているか
- `replacementLabel`: 追加説明テキスト
- `onChange(policyId)`, `onCancel()`, `onConfirm()`

### 5.9 FileBrowser

**Props**:
- `data`: `{ currentPath, nodes[] }`
- `onBrowse(targetPath)`: ディレクトリ展開時のコールバック
- `onAddRoot(absolutePath, pathType)`: パス追加時のコールバック

### 5.10 EmptyState

**Props**: `title`, `description`, `action` (JSX)

空状態の中央表示コンポーネント。

---

## 6. APIエンドポイント全一覧

### 6.1 認証系

| メソッド | パス | CSRF | 用途 |
|----------|------|------|------|
| GET | `/api/auth/me` | 不要 | 認証状態取得 |
| POST | `/api/auth/login` | 不要 | ユーザーログイン |
| POST | `/api/auth/logout` | 不要 | ログアウト |
| GET | `/api/admin/auth/me` | 不要 | 管理者認証状態 |
| POST | `/api/admin/auth/login` | 不要 | 管理者ログイン |
| POST | `/api/admin/auth/logout` | 不要 | 管理者ログアウト |

### 6.2 ブートストラップ

| メソッド | パス | CSRF | 用途 |
|----------|------|------|------|
| GET | `/api/bootstrap` | 不要 | ワークスペースデータ取得 |
| GET | `/api/admin/bootstrap` | 不要 | 管理データ一括取得 |

### 6.3 会話系

| メソッド | パス | CSRF | 用途 |
|----------|------|------|------|
| POST | `/api/conversations` | 要 | 会話作成 |
| GET | `/api/conversations/:id` | 不要 | 会話詳細取得 |
| POST | `/api/conversations/:id/messages` | 要 | メッセージ送信 (202 async) |

### 6.4 SSE・キャンセル

| メソッド | パス | CSRF | 用途 |
|----------|------|------|------|
| GET | `/api/conversations/:id/stream` | 不要 | SSE ストリーミング (text/event-stream) |
| POST | `/api/runs/:runId/cancel` | 要 | Run キャンセル |

### 6.5 承認系

| メソッド | パス | CSRF | 用途 |
|----------|------|------|------|
| POST | `/api/approvals/:id/decision` | 要 | ユーザー承認/拒否 |
| POST | `/api/admin/approvals/:id/decision` | 要 | 管理者承認/拒否 |

### 6.6 オートメーション系

| メソッド | パス | CSRF | 用途 |
|----------|------|------|------|
| POST | `/api/conversations/:id/automations` | 要 | 作成 |
| PATCH | `/api/automations/:id` | 要 | ステータス変更 |
| DELETE | `/api/automations/:id` | 要 | 削除 |
| POST | `/api/automations/:id/run-now` | 要 | 即時実行 |
| PATCH | `/api/admin/automations/:id` | 要 | 管理者一時停止 |
| DELETE | `/api/admin/automations/:id` | 要 | 管理者削除 |

### 6.7 APIトークン系

| メソッド | パス | CSRF | 用途 |
|----------|------|------|------|
| POST | `/api/me/tokens` | 要 | トークン作成 |
| DELETE | `/api/me/tokens/:id` | 要 | トークン失効 |

### 6.8 ユーザー管理系

| メソッド | パス | CSRF | 用途 |
|----------|------|------|------|
| POST | `/api/admin/users` | 要 | ユーザー作成 |
| PATCH | `/api/admin/users/:id` | 要 | ユーザー更新 |
| DELETE | `/api/admin/users/:id` | 要 | ユーザー削除 |
| POST | `/api/admin/users/:id/password` | 要 | パスワード設定 |
| PATCH | `/api/admin/users/:id/policies` | 要 | ポリシー割当 |

### 6.9 ツールポリシー系

| メソッド | パス | CSRF | 用途 |
|----------|------|------|------|
| POST | `/api/admin/tool-policies` | 要 | 作成 |
| PATCH | `/api/admin/tool-policies/:id` | 要 | 更新 |
| DELETE | `/api/admin/tool-policies/:id` | 要 | 削除 (body: replacementPolicyId) |

### 6.10 ファイルポリシー系

| メソッド | パス | CSRF | 用途 |
|----------|------|------|------|
| POST | `/api/admin/file-policies` | 要 | 作成 |
| PATCH | `/api/admin/file-policies/:id` | 要 | 更新 |
| DELETE | `/api/admin/file-policies/:id` | 要 | 削除 (body: replacementPolicyId) |
| POST | `/api/admin/file-policies/:id/roots` | 要 | ルート追加 |
| DELETE | `/api/admin/file-policies/:id/roots/:rootId` | 要 | ルート削除 |

### 6.11 ファイルシステム系

| メソッド | パス | CSRF | 用途 |
|----------|------|------|------|
| GET | `/api/admin/fs/probe?path=` | 不要 | パス検査 |
| GET | `/api/admin/fs/browse?path=` | 不要 | ディレクトリ閲覧 |

### 6.12 保護ルール系

| メソッド | パス | CSRF | 用途 |
|----------|------|------|------|
| POST | `/api/admin/protection-rules` | 要 | 作成 |
| PATCH | `/api/admin/protection-rules/:id` | 要 | 有効/無効切替 |
| DELETE | `/api/admin/protection-rules/:id` | 要 | 削除 |
| POST | `/api/admin/protection-rules/inspect` | 要 | パス保護検査 |

### 6.13 スキル系

| メソッド | パス | CSRF | 用途 |
|----------|------|------|------|
| POST | `/api/admin/skills` | 要 | 作成 |
| PATCH | `/api/admin/skills/:name` | 要 | 更新 |
| DELETE | `/api/admin/skills/:name` | 要 | 削除 |

### 6.14 MCPサーバー系

| メソッド | パス | CSRF | 用途 |
|----------|------|------|------|
| POST | `/api/admin/mcp-servers` | 要 | 作成 |
| PATCH | `/api/admin/mcp-servers/:name` | 要 | 更新 |
| DELETE | `/api/admin/mcp-servers/:name` | 要 | 削除 |
| POST | `/api/admin/mcp-servers/:name/reconnect` | 要 | 再接続 |

---

## 7. データモデル (フロントエンドで扱う形)

### 7.1 authState (ユーザー)

```typescript
{
  user: { id, loginName, displayName, role, status } | null
  csrfToken: string
  bootstrapRequired: boolean
  webBootstrapEnabled: boolean
}
```

### 7.2 authState (管理者)

```typescript
{
  adminAuthenticated: boolean
  csrfToken: string
  adminEnabled: boolean
  user: { id, loginName, displayName, role } | null
}
```

### 7.3 workspace

```typescript
{
  conversations: [{
    id, title, status, source,
    lastMessageAt, createdAt,
    pendingApprovalCount, activeRunStatus
  }]
  apiTokens: [{ id, name, createdAt, lastUsedAt }]
}
```

### 7.4 conversationView

```typescript
{
  conversation: { id, title, source, createdAt }
  messages: [{ id, role, contentText, createdAt }]
  approvals: [{ id, status, toolName, toolInput, reason }]
  automations: [{ id, name, instruction, intervalMinutes, status, nextRunAt }]
  activeRun: { status, phase } | null
  lastFailedRun: { lastError } | null
}
```

### 7.5 streamingMessage

```typescript
{
  text: string    // SSE delta イベントで蓄積されたテキスト
  runId: string   // 関連する Run ID
} | null
```

### 7.6 admin bootstrap data

```typescript
{
  overview: { userCount, pendingApprovalCount, automationCount, toolPolicyCount, filePolicyCount, protectionRuleCount, toolCatalogCount }
  users: [{ id, loginName, displayName, role, status, authSource, systemUserType, toolPolicy: { id, name }, filePolicy: { id, name } }]
  toolPolicies: [{ id, name, description, isSystem, tools: string[], toolDetails: [{ name, riskLevel }] }]
  filePolicies: [{ id, name, description, isSystem, roots: [{ id, scope, rootPath, pathType }] }]
  protectionRules: [{ id, pattern, patternType, effect, enabled, scope, note }]
  approvals: [{ id, status, toolName, toolInput, reason, requestedAt }]
  automations: [{ id, name, instruction, intervalMinutes, status, ownerUserId, nextRunAt }]
  tools: [{ name, description, pluginName, source, mcpServerName, riskLevel, inputSchema }]
  mcpServers: [{ name, state, lastError }]
  mcpServerConfigs: [{ name, config, state, lastError, toolCount }]
  skills: [{ name, description, prompt }]
}
```

---

## 8. ビジネスルール・制約

### 8.1 rootユーザーの制約

- パスワード変更不可 (ADMIN_RUNTIME_PASSWORD で管理)
- ステータス変更不可 (常にactive)
- identity (loginName, displayName, role) 変更不可
- 削除不可
- ツール/ファイルポリシーの割当は可能

### 8.2 systemポリシーの制約

- `isSystem === true` のポリシーは編集・削除不可
- ルートの追加・削除も不可

### 8.3 ポリシー削除の制約

- ユーザーが割り当てられている場合は置換ポリシーの選択が必須
- 未割当の場合は即削除可能

### 8.4 リモートアカウントの制約

- `authSource !== 'local'` のアカウントは管理コンソールから削除不可
- パスワード変更は可能

### 8.5 オートメーションの制約

- `intervalMinutes` の最小値: 5
- 会話が選択されていない場合は作成不可

### 8.6 MCP接続ポーリング

- 作成/再接続/更新後にポーリング開始
- 2秒間隔、最大8回 (16秒)
- `ready` or `failed` で停止

---

## 9. 変更不可のファイル

UI作り直しの際に**変更してはいけない**ファイル:

- `src/admin-web/src/lib/api.js` — API通信レイヤー (そのまま使用)
- `src/admin-web/src/lib/axios.js` — axios インスタンス + インターセプタ
- `src/admin-web/src/lib/sse.js` — SSE クライアント (そのまま使用)
- `src/admin-web/src/lib/utils.js` — `cn()` ユーティリティ
- `src/admin-web/src/i18n/` — 翻訳ファイル (今後活用可能)
- バックエンドの全コード (`src/` 内の `admin-web/` 以外)

---

## 10. 改善余地のメモ (リビルド時の参考)

> これらは現在の実装の特性であり、リビルド時に改善してもよい点。

1. **i18n が未活用**: context/translations は存在するが各ページでは直接英語テキスト
2. **巨大なカスタムフック**: `useWorkspace.js` が多くの責務を持つ。SSE管理、API呼び出し、状態操作の分離が望ましい
3. **フォームバリデーション**: クライアント側のバリデーションなし (すべてサーバー依存)
4. **select要素**: ネイティブ `<select>` を使用。カスタムドロップダウンに置換可能
5. **SSE 再接続**: エラー時に自動再接続を行わず、ポーリングにフォールバック。指数バックオフ付き再接続の導入余地あり
