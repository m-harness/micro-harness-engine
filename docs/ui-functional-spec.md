# microHarnessEngine Web UI 機能仕様書

> **目的**: UI の見た目を完全に作り直す際に、機能が一切失われないようにするための仕様書。
> API・ロジックは変更しない前提。技術スタックは React + Tailwind CSS + Vite を継続。

---

## 1. アプリケーション構成

### 1.1 2つの独立した画面

| 画面 | パス | 認証 | 用途 |
|------|------|------|------|
| **ユーザーワークスペース** | `/` | ユーザーセッション (`microharnessengine_session` cookie) | チャット・承認・オートメーション・APIトークン管理 |
| **管理コンソール** | `/admin` | 管理者セッション (`microharnessengine_admin_session` cookie) | ユーザー発行・ポリシー管理・運用監視 |

- ルーティングは `window.location.pathname` で判定（react-router-dom は未使用）
- `/admin` のときは `AdminConsole` コンポーネントを丸ごとレンダリング
- それ以外は `App` コンポーネント（ユーザーワークスペース）

### 1.2 エントリーポイント

```
main.jsx → <App />
  ├─ pathname が /admin → <AdminConsole />
  └─ それ以外 → ワークスペース UI
```

---

## 2. 共通パターン

### 2.1 状態管理

- **外部ライブラリなし**: 全て `useState` のみ
- **グローバルストアなし**: コンポーネント内にすべてのステートを保持
- フォーム値も `useState` で個別管理（フォームライブラリ不使用）

### 2.2 API通信レイヤー (`lib/api.js`)

```
request(path, { method, body, csrfToken, headers })
```

- `fetch` で `credentials: 'include'` (cookie自動送信)
- mutation (POST/PATCH/DELETE) では `x-csrf-token` ヘッダーを付与
- レスポンスは `{ ok: true, data: {...} }` 形式、`data` を返す
- エラー時は `throw new Error(payload.error)` → 呼び出し元の `runAction` でキャッチ

### 2.3 ローディング管理 (`busyKey` パターン)

```javascript
const [busyKey, setBusyKey] = useState('')

async function runAction(key, callback) {
  setBusyKey(key)
  try { await callback() }
  catch (error) { showFlash(error.message, 'error') }
  finally { setBusyKey('') }
}
```

- 各ボタンは `disabled={busyKey === 'key-name'}` で二重送信防止
- ボタンのラベルを `busyKey` に応じて「Sending...」等に切替

### 2.4 フラッシュメッセージ (トースト通知)

```javascript
const [flash, setFlash] = useState(null) // { message, kind }
```

- `kind`: `'info'`(teal系) / `'error'`(rose系)
- 4200ms 後に自動消去 (`useEffect` + `setTimeout`)
- 画面上部に表示

### 2.5 日付フォーマット

```javascript
new Intl.DateTimeFormat('ja-JP', {
  month: 'short', day: 'numeric',
  hour: '2-digit', minute: '2-digit'
}).format(new Date(value))
```

- 値がない場合は `'Not yet'` を表示

### 2.6 ステータスバッジ (`Pill` コンポーネント)

ステータス文字列 → 色のマッピング:

| ステータス | 色系統 |
|------------|--------|
| `active`, `completed`, `approved` | emerald (緑) |
| `queued`, `running`, `waiting_approval`, `pending` | amber (黄) |
| `recovering` | orange |
| `paused` | slate (灰) |
| `denied`, `failed`, `disabled`, `deleted` | rose (赤) |
| その他 | slate (灰) デフォルト |

### 2.7 確認ダイアログ

- 削除系の操作は `window.confirm()` で確認（カスタムモーダルではない）
- ポリシー削除のみ `DeletePolicyDialog` (カスタムモーダル) を使用

### 2.8 i18n (国際化)

- `i18n/translations.js` に `en` / `ja` の翻訳辞書
- `i18n/context.jsx` に `I18nProvider` + `useI18n` hook
- ロケールは `localStorage` (`microharnessengine-admin-web.locale`) に保存
- ブラウザ言語を自動検出
- **注**: 現在のApp.jsx/AdminConsole.jsx では直接英語テキストを使用しており、i18n contextは未使用状態

---

## 3. ユーザーワークスペース (`App.jsx`)

### 3.1 ライフサイクル

```
マウント
  └─ hydrate()
       ├─ api.getAuthState() → authState 更新
       ├─ user あり → loadWorkspace()
       │    ├─ api.getBootstrap() → conversations, apiTokens
       │    └─ loadConversation(id) → conversationView
       └─ user なし → ログイン画面表示

認証後は 4000ms ごとに loadWorkspace() をポーリング
```

### 3.2 画面遷移

```
[初期化中] → "Loading workspace..." 表示
[未認証]   → ログイン画面
[認証済み] → ワークスペース（3カラムレイアウト）
```

### 3.3 ログイン画面

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
- 送信: `api.login(loginForm)` → `hydrate()`

**管理情報カード**:
- タイトル: "Admin-managed accounts"
- コードブロック: admin plane のURLやCLIコマンドを表示

### 3.4 ワークスペース画面

**全体構成**: ヘッダー + 3カラムグリッド (`xl:grid-cols-[300px_minmax(0,1fr)_360px]`)

#### 3.4.1 ヘッダー

- ブランドラベル: "microHarnessEngine Workspace"
- ユーザー表示名、@loginName、role
- ステータスPill: activeRun のステータスまたは "ready"
- ボタン: "New conversation", "Log out"

#### 3.4.2 左カラム: セッション一覧

**カードタイトル**: "Sessions"

**会話が0件**: `EmptyState` コンポーネント
- タイトル: "No conversations yet"
- アクションボタン: "Start first chat"

**会話リスト**: 各会話はボタン要素
- 選択中: primary色背景 + 白テキスト + shadow
- 非選択: 白背景 + hover効果
- 表示情報:
  - `title`
  - `source` (web/slack/discord)
  - 未承認件数バッジ (`pendingApprovalCount > 0` のとき)
  - 最終メッセージ日時 (`lastMessageAt` or `createdAt`)
  - アクティブ実行ステータス (`activeRunStatus`)

**動作**: クリックで `handleSelectConversation(id)` → `loadConversation(id)`

#### 3.4.3 中央カラム: メッセージスレッド

**カードヘッダー**:
- タイトル: 選択中会話のtitle or "Conversation"
- 説明: source + 作成日 or 未選択時のガイド

**メッセージ表示エリア** (スクロール可能):
- 会話未選択: `EmptyState` "No session selected"
- メッセージ0件: `EmptyState` "This conversation is ready"
- メッセージ一覧:
  - `role === 'user'`: 右寄せ、primary色背景、白テキスト、右下の角のみ角丸小
  - `role === 'assistant'`: 左寄せ、白背景+ボーダー、左下の角のみ角丸小
  - `role === 'tool'`: 中央表示、dashed amber border、monoフォント
  - 各メッセージに: ラベル ("You"/"Agent"), contentText, createdAt

**入力エリア** (border-t で区切り):
- アクティブ実行の表示: status Pill + phase
- 失敗した実行のエラー: "Last run failed: {error}"
- テキストエリア: min-height 8rem
- 送信ボタン: "Send message" (ローディング中: "Sending...")
- 補足テキスト: "Approvals and automation replies return to the same linked chat surface."

**送信動作**:
1. `messageDraft.trim()` が空なら何もしない
2. `selectedConversationId` がなければ新規会話作成
3. `api.postConversationMessage()` → `setMessageDraft('')` → `loadWorkspace()`

#### 3.4.4 右カラム: サイドバー (3つのカード)

##### (A) Approvals カード

**タイトル**: "Approvals"
**説明**: "Human decisions resume the paused run for this user only."

**承認0件**: テキスト "No pending approvals in this session."

**承認リスト**: 各承認アイテム
- ステータスPill + ツール名 (uppercase)
- 理由テキスト (`reason`)
- ツール入力のJSONプレビュー (`JSON.stringify(toolInput, null, 2)`)
- ボタン: "Approve", "Deny"
- 動作: `api.decideApproval(id, { decision })` → `loadWorkspace()`

##### (B) Automations カード

**タイトル**: "Automations"

**作成フォーム** (常に表示):
- `name` (Input, placeholder: "Automation name")
- `instruction` (Textarea, min-height 7rem, placeholder: "What should this automation do?")
- `intervalMinutes` (Input type=number, min=5, placeholder: "60")
- ボタン: "Create"
- 動作: `api.createAutomation()` → フォームクリア → `loadWorkspace()`
- 前提: 会話が選択されていない場合はフラッシュエラー

**オートメーションリスト**: 各アイテム
- 名前 + インターバル表示 (`formatInterval`)
- ステータスPill
- 指示文 (`instruction`, whitespace-pre-wrap)
- 次回実行日時
- ボタン群:
  - "Run now": `api.runAutomationNow()`
  - "Pause"/"Resume": `api.updateAutomationStatus()` (activeならpause、pausedならactive)
  - "Delete": `window.confirm()` → `api.deleteAutomation()`

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
- 動作: `api.createToken()` → `setRevealedToken(token)` → `loadWorkspace()`

**トークンリスト**: 各トークン
- 名前、作成日時、最終使用日時
- ボタン: "Revoke" (`window.confirm()` → `api.revokeToken()`)

**0件**: テキスト "No personal access tokens yet."

### 3.5 ログアウト動作

1. `api.logout()`
2. `revealedToken` クリア
3. `messageDraft` クリア
4. `hydrate()` で状態リセット

---

## 4. 管理コンソール (`AdminConsole.jsx`)

### 4.1 ライフサイクル

```
マウント
  └─ loadAdmin()
       ├─ api.getAdminAuthState() → authState
       ├─ 未認証 → data = null
       └─ 認証済 → api.getAdminBootstrap() → data
```

- ユーザーワークスペースのようなポーリングなし（手動リフレッシュのみ）
- mutation実行後に毎回 `loadAdmin()` でデータ再取得

### 4.2 認証画面

**構成**: 中央寄せ (`max-w-3xl`) のカード

**カード内容**:
- タイトル: "Admin Console"
- 説明: rootアカウントの説明
- admin未有効時の警告バナー (amber)
- フォーム:
  - `loginName` (初期値: "root")
  - `password`
  - ボタン: "Enter admin console" (`adminEnabled` が false なら disabled)
- 動作: `api.adminLogin()` → パスワードクリア → `loadAdmin()`

### 4.3 メイン画面

**全体構成**: ヘッダー + タブコンテンツ

#### ヘッダー
- ラベル: "Admin Plane"
- タイトル: "Policy and Operations Console"
- 説明文
- ログインユーザー表示: "@{loginName}"
- ログアウトボタン
- タブナビゲーション (`SectionTabs`)

#### タブ一覧

```
overview | users | tool-policies | file-policies | protection-rules |
approvals | automations | tools | skills | mcp-servers
```

- 各タブはボタン要素、capitalize表示
- 選択中: 暗い背景 (`#17332f`) + 明るいテキスト
- 非選択: 白系背景 + hover効果

### 4.4 Overview タブ

**レイアウト**: グリッド (`md:grid-cols-2 xl:grid-cols-3`)

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

**レイアウト**: 2カラムグリッド (`xl:grid-cols-[1.1fr_0.9fr]`)

#### 左: ユーザーリスト

**タイトル**: "Users"

**各ユーザーカード**:
- 表示名 + @loginName
- ステータスPill群: status, role, authSource, (rootなら "protected root")
- ツールポリシー選択 (`<select>`): 変更即実行 → `api.adminAssignPolicies()`
- ファイルポリシー選択 (`<select>`): 変更即実行 → `api.adminAssignPolicies()`
- パスワード変更行: Input + "Set password" ボタン
  - rootユーザーは disabled (placeholder: "Managed by ADMIN_RUNTIME_PASSWORD")
- ステータス切替ボタン: "Disable"/"Enable"
  - rootユーザーは disabled
- 削除ボタン: "Delete"
  - rootまたはリモートアカウントは disabled
  - `window.confirm()` → `api.adminDeleteUser()`
- rootユーザー説明テキスト
- リモートアカウント説明テキスト

**ポリシー変更の即時反映**:
- select の `onChange` で直接 `api.adminAssignPolicies()` を呼ぶ
- もう一方のポリシーIDは現在の値を維持

#### 右: ユーザー作成フォーム

**タイトル**: "Create user"

- `loginName` (Input, placeholder: "login name")
- `displayName` (Input, placeholder: "display name")
- `password` (Input type=password, placeholder: "initial password")
- `role` (select: "user" / "admin")
- ボタン: "Create user"
- 動作: `api.adminCreateUser()` → フォームクリア → `loadAdmin()`

### 4.6 Tool Policies タブ

**レイアウト**: 2カラムグリッド (`xl:grid-cols-[1.05fr_0.95fr]`)

#### 左: ポリシーリスト

**タイトル**: "Tool policies"

**各ポリシーカード**:
- 名前 + 説明
- Pill: "system" or "custom"
- カスタムのみ: "Edit" ボタン, "Delete" ボタン
- ツール一覧: 各ツール名 + RiskPill (inline)

**Edit**: ツールポリシー編集モーダルを開く
**Delete**: `DeletePolicyDialog` を開く (置換ポリシー選択付き)

#### 右: ポリシー作成フォーム

**タイトル**: "Create tool policy"

- MCP サーバーがある場合: 接続状態凡例 (ready/connecting/failed/disconnected の色説明)
- `name` (Input)
- `description` (Input)
- ツールチェックボックスリスト (max-h 24rem スクロール):
  - 各ツール: checkbox + 名前 + MCP Badge (sourceがmcpの場合) + 説明 + RiskPill
- ボタン: "Create tool policy"

#### モーダル: ツールポリシー編集

- fixed overlay (`z-50`, 半透明黒背景)
- カード (max-w-2xl)
- `name`, `description` の Input
- ツールチェックボックスリスト (作成フォームと同じ)
- "Cancel", "Save changes" ボタン

#### モーダル: ツールポリシー削除 (`DeletePolicyDialog`)

- ユーザーが割り当てられている場合: 置換ポリシーの選択必須
- 割り当てなし: 即削除可能
- "Cancel", "Delete" ボタン

### 4.7 File Policies タブ

**レイアウト**: 2カラムグリッド (`xl:grid-cols-[1.05fr_0.95fr]`)

#### 左: ポリシーリスト

**ヘッダー**: "File policies" + "Create file policy" ボタン (モーダルを開く)

**各ポリシーカード**:
- 名前 + 説明
- Pill: "system" / "custom"
- カスタムのみ: "Edit policy", "Delete policy" ボタン
- ルート一覧: `scope:pathType:rootPath` 形式で表示 + "Delete" ボタン
- ルート追加行 (カスタムのみ):
  - `rootPath` (Input)
  - `pathType` (select: "dir" / "file")
  - "Choose path" ボタン (ファイルブラウザモーダルを開く)
  - "Add root" ボタン (scope は固定 "absolute")

#### 右: Probe path カード

**タイトル**: "Probe path"

- パス入力 (Input)
- "Probe" ボタン → `api.adminProbePath()`
- 結果表示:
  - Pill: "visible to server" / "not found"
  - Pill: "already inside workspace" / "outside workspace"
  - Pill: pathType
  - テキスト: 解決後パス、意味の説明、ワークスペースチェック結果

#### モーダル: ファイルポリシー作成

- `name`, `description` の Input
- "Cancel", "Create file policy" ボタン

#### モーダル: ファイルポリシー編集

- `name`, `description` の Input
- "Cancel", "Save changes" ボタン

#### モーダル: ファイルブラウザ (`FileBrowser`)

- max-w-5xl, max-h-[90vh]
- "Close" ボタン
- `FileBrowser` コンポーネント:
  - 現在のパス表示
  - ノードリスト: 各ノード
    - 名前 + kind Badge + workspace Badge
    - absolutePath 表示
    - ディレクトリ: "Open" (サブディレクトリ展開), "Add directory"
    - ファイル: "Add file"
  - "Add" で `handleAddRootFromBrowser()`:
    - workspace内なら scope='workspace' + 相対パス
    - workspace外なら scope='absolute' + 絶対パス

#### モーダル: ファイルポリシー削除 (`DeletePolicyDialog`)

- ツールポリシー削除と同じパターン

### 4.8 Protection Rules タブ

**レイアウト**: 2カラムグリッド (`xl:grid-cols-[1.1fr_0.9fr]`)

#### 左: ルールリスト

**タイトル**: "Protection rules"

**注意バナー** (amber):
- ワークスペース相対パスに適用。外部パスは `**` glob でカバー。

**各ルールカード**:
- パターン (monoフォント) + note
- Pill群: patternType, scope (systemのみ), enabled状態 ("deny"/"disabled")
- "Enable"/"Disable" ボタン → `api.adminToggleProtectionRule()`
- "Delete" ボタン (systemでないもののみ) → `window.confirm()` → `api.adminDeleteProtectionRule()`

#### 右上: ルール作成カード

**タイトル**: "Add protection rule"

- `kind` (select):
  - "File (exact match)" = `path`
  - "Folder (directory tree)" = `dir`
  - "Pattern (wildcard)" = `glob`
- `pattern` (Input, placeholderがkindに応じて変化)
- 説明テキスト
- ボタン: "Create protection rule"

#### 右下: パス検査カード

**タイトル**: "Inspect path"

- パス入力 (Input, placeholder: "e.g. .env or src/secrets.json")
- "Inspect" ボタン → `api.adminInspectProtectionPath()`
- 結果表示:
  - パス (monoフォント)
  - Pill: "Protected" (denied色) / "Not protected" (active色)
  - マッチしたルールのパターン (あれば)

### 4.9 Approvals タブ

**タイトル**: "Approvals"
**説明**: "Global queue for runs that are waiting on a human decision."

**承認リスト**: 各承認アイテム
- Pill(status) + toolName + 日時
- 理由テキスト
- ツール入力JSON (暗い背景のプレビュー)
- "Approve", "Deny" ボタン → `api.adminDecideApproval()`

**0件**: "No pending approvals."

### 4.10 Automations タブ

**タイトル**: "Automations"
**説明**: "Created by chat. Admin can inspect, pause, or delete in emergencies."

**リスト**: 各オートメーション
- 名前 + オーナーID + 次回実行日時
- ステータスPill
- 指示文 (whitespace-pre-wrap)
- "Pause" ボタン → `api.adminPauseAutomation()` (pauseのみ)
- "Delete" ボタン → `api.adminDeleteAutomation()`

**0件**: "No active automations."

### 4.11 Tools タブ

**タイトル**: "Tool catalog"
**説明**: "Reference list for building tool policies."

MCP接続状態凡例 (MCPサーバーがある場合)

**ツールリスト**: 各ツール
- 名前 + McpBadge (sourceがmcpの場合)
- McpStatusPill (MCPツールのみ: ready/connecting/failed/disconnected)
- RiskPill
- 説明
- input_schema の JSON プレビュー (暗い背景、整形済み)

### 4.12 Skills タブ

**レイアウト**: 2カラムグリッド (`xl:grid-cols-[1.1fr_0.9fr]`)

#### 左: スキルリスト

**タイトル**: "Skills"

**各スキルカード**:
- 名前 + 説明
- "Edit" ボタン → インライン編集展開
- "Delete" ボタン → `window.confirm()` → `api.adminDeleteSkill()`

**インライン編集** (編集中のスキルのカード内に展開):
- `description` (Input)
- `prompt` (Textarea, min-height 12rem)
- "Save" → `api.adminUpdateSkill()`, "Cancel"

#### 右: スキル作成カード

**タイトル**: "Create skill"
**説明**: "Name must be lowercase letters, numbers, and underscores only."

- `name` (Input, placeholder: "e.g. code_review")
- `description` (Input)
- `prompt` (Textarea, min-height 14rem)
- ボタン: "Create skill"

### 4.13 MCP Servers タブ

**レイアウト**: 2カラムグリッド (`xl:grid-cols-[1.1fr_0.9fr]`)

#### 左: サーバーリスト

**タイトル**: "MCP Servers"

**各サーバーカード**:
- 名前 + プロトコルPill (http=青, stdio=紫)
- 接続詳細: httpならURL、stdioならcommand + args
- 接続状態Pill + ツール数
- 失敗時のエラー表示 (rose背景)
- ボタン: "Edit"/"Cancel", "Reconnect", "Delete"

**インライン編集** (展開):
- `mode` (select: stdio/http)
- stdioモード: command, args (カンマ区切り), env (KeyValueEditor)
- httpモード: url, headers (KeyValueEditor)
- "Save changes" ボタン

**Reconnect動作**:
1. `api.adminReconnectMcpServer()`
2. `loadAdmin()` でデータ更新
3. `pollUntilMcpSettled()`: 2秒間隔、最大8回ポーリング
   - state が 'ready' または 'failed' になるまで

#### 右: サーバー追加カード

**タイトル**: "Add MCP server"

- `name` (Input)
- `mode` (select: "stdio (local process)" / "http (remote server)")
- stdio: `command`, `args` (カンマ区切り), `env` (KeyValueEditor, secret用)
- http: `url`, `headers` (KeyValueEditor, secret用)
- ボタン: "Add server" (ローディング中: "Connecting...")

**KeyValueEditor** コンポーネント:
- key-value ペアの配列を管理
- 各行: key Input + value Input + 削除ボタン (×)
- 追加ボタン: "+ Add"
- valuePlaceholder が "Value (secret)" の場合は type=password

**Config構築ロジック**:
```javascript
// stdio
config = { command }
if (args) config.args = args.split(',').map(s => s.trim()).filter(Boolean)
if (env) config.env = kvPairsToObject(envPairs)

// http
config = { url }
if (headers) config.headers = kvPairsToObject(headerPairs)
```

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
- min-height: 8rem
- Input と同じフォーカススタイル

### 5.5 Label

- フォームラベル

### 5.6 Badge

```
tones: default | success | warn | danger
```

### 5.7 Table / THead / TBody / TR / TH / TD

- テーブルコンポーネント (現在未使用だが存在)

### 5.8 DeletePolicyDialog

**Props**:
- `open`: 表示フラグ
- `title`, `description`: ダイアログの説明
- `policies`: 置換候補ポリシー配列
- `value`: 選択された置換ポリシーID
- `replacementRequired`: ユーザーが割り当てられているか
- `replacementLabel`: 追加説明テキスト
- `onChange(policyId)`, `onCancel()`, `onConfirm()`
- `t(key)`: 翻訳関数

### 5.9 FileBrowser

**Props**:
- `data`: `{ currentPath, nodes[] }`
- `onBrowse(targetPath)`: ディレクトリ展開時のコールバック
- `onAddRoot(absolutePath, pathType)`: パス追加時のコールバック
- `t(key)`: 翻訳関数

### 5.10 ToolCatalogExplorer

**Props**:
- `plugins`: プラグイン配列 `[{ name, description, tools[] }]`
- `selectedTools`: 選択済みツール名のSet (null可)
- `onToggleTool(toolName)`: ツール切替コールバック
- `t(key)`: 翻訳関数

**機能**: `<details>` 要素で折りたたみ、ツールの引数スキーマ表示

(注: 現在 AdminConsole ではインラインのチェックボックスリストを使用しており、ToolCatalogExplorer は直接使用されていない)

### 5.11 EmptyState

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

### 6.4 承認系

| メソッド | パス | CSRF | 用途 |
|----------|------|------|------|
| POST | `/api/approvals/:id/decision` | 要 | ユーザー承認/拒否 |
| POST | `/api/admin/approvals/:id/decision` | 要 | 管理者承認/拒否 |

### 6.5 オートメーション系

| メソッド | パス | CSRF | 用途 |
|----------|------|------|------|
| POST | `/api/conversations/:id/automations` | 要 | 作成 |
| PATCH | `/api/automations/:id` | 要 | ステータス変更 |
| DELETE | `/api/automations/:id` | 要 | 削除 |
| POST | `/api/automations/:id/run-now` | 要 | 即時実行 |
| PATCH | `/api/admin/automations/:id` | 要 | 管理者一時停止 |
| DELETE | `/api/admin/automations/:id` | 要 | 管理者削除 |

### 6.6 APIトークン系

| メソッド | パス | CSRF | 用途 |
|----------|------|------|------|
| POST | `/api/me/tokens` | 要 | トークン作成 |
| DELETE | `/api/me/tokens/:id` | 要 | トークン失効 |

### 6.7 ユーザー管理系

| メソッド | パス | CSRF | 用途 |
|----------|------|------|------|
| POST | `/api/admin/users` | 要 | ユーザー作成 |
| PATCH | `/api/admin/users/:id` | 要 | ユーザー更新 |
| DELETE | `/api/admin/users/:id` | 要 | ユーザー削除 |
| POST | `/api/admin/users/:id/password` | 要 | パスワード設定 |
| PATCH | `/api/admin/users/:id/policies` | 要 | ポリシー割当 |

### 6.8 ツールポリシー系

| メソッド | パス | CSRF | 用途 |
|----------|------|------|------|
| POST | `/api/admin/tool-policies` | 要 | 作成 |
| PATCH | `/api/admin/tool-policies/:id` | 要 | 更新 |
| DELETE | `/api/admin/tool-policies/:id` | 要 | 削除 (body: replacementPolicyId) |

### 6.9 ファイルポリシー系

| メソッド | パス | CSRF | 用途 |
|----------|------|------|------|
| POST | `/api/admin/file-policies` | 要 | 作成 |
| PATCH | `/api/admin/file-policies/:id` | 要 | 更新 |
| DELETE | `/api/admin/file-policies/:id` | 要 | 削除 (body: replacementPolicyId) |
| POST | `/api/admin/file-policies/:id/roots` | 要 | ルート追加 |
| DELETE | `/api/admin/file-policies/:id/roots/:rootId` | 要 | ルート削除 |

### 6.10 ファイルシステム系

| メソッド | パス | CSRF | 用途 |
|----------|------|------|------|
| GET | `/api/admin/fs/probe?path=` | 不要 | パス検査 |
| GET | `/api/admin/fs/browse?path=` | 不要 | ディレクトリ閲覧 |

### 6.11 保護ルール系

| メソッド | パス | CSRF | 用途 |
|----------|------|------|------|
| POST | `/api/admin/protection-rules` | 要 | 作成 |
| PATCH | `/api/admin/protection-rules/:id` | 要 | 有効/無効切替 |
| DELETE | `/api/admin/protection-rules/:id` | 要 | 削除 |
| POST | `/api/admin/protection-rules/inspect` | 要 | パス保護検査 |

### 6.12 スキル系

| メソッド | パス | CSRF | 用途 |
|----------|------|------|------|
| POST | `/api/admin/skills` | 要 | 作成 |
| PATCH | `/api/admin/skills/:name` | 要 | 更新 |
| DELETE | `/api/admin/skills/:name` | 要 | 削除 |

### 6.13 MCPサーバー系

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

### 7.5 admin bootstrap data

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
- `src/admin-web/src/lib/utils.js` — `cn()` ユーティリティ
- `src/admin-web/src/i18n/` — 翻訳ファイル (今後活用可能)
- バックエンドの全コード (`src/` 内の `admin-web/` 以外)

---

## 10. 改善余地のメモ (リビルド時の参考)

> これらは現在の実装の特性であり、リビルド時に改善してもよい点。

1. **react-router-dom が未使用**: インストール済みだが `window.location.pathname` で代用。ルーティング導入で管理タブのURL化が可能
2. **i18n が未活用**: context/translations は存在するが App.jsx/AdminConsole.jsx では直接英語テキスト
3. **ポーリングベース**: 4秒ごとのフルリフレッシュ。WebSocket/SSE で最適化可能
4. **巨大なモノリスコンポーネント**: AdminConsole.jsx が1559行。タブごとの分割が望ましい
5. **フォームバリデーション**: クライアント側のバリデーションなし (すべてサーバー依存)
6. **select要素**: ネイティブ `<select>` を使用。カスタムドロップダウンに置換可能
