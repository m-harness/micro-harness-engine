[English](../en/tools.md) | 日本語

# Tools

ビルトインツールの詳細と、カスタムツールプラグインの開発方法です。

---

## ビルトインツール一覧

### filesystem プラグイン

プロジェクトスコープのファイル操作ツール群です。

| ツール | リスク | 説明 |
|---|---|---|
| `list_files` | safe | ディレクトリ内のファイル・フォルダ一覧を返す。保護対象は自動的に除外され、`hiddenCount` として件数だけ通知される |
| `read_file` | safe | ファイルの内容を読み取る。`preview` (先頭400文字) も返す |
| `write_file` | safe | ファイルを作成・上書きする。親ディレクトリは自動作成。バイト数を返す |
| `edit_file` | safe | `old_string` を `new_string` に置換する差分編集。`old_string` が複数箇所にある場合、`replace_all` を指定しないとエラー（安全策） |
| `multi_edit_file` | safe | 複数の `old_string → new_string` ペアを一括適用 |
| `make_dir` | safe | ディレクトリを再帰的に作成 |
| `move_file` | safe | ファイル・ディレクトリの移動またはリネーム。source と destination の両方でProtectionチェック |
| `delete_file` | dangerous | ファイル・ディレクトリの削除。**承認必要** (`approvalRequired`)。`recursive: true` でディレクトリも削除可能 |

### git プラグイン

4段階のアクセスレベルを持つGit操作ツール群です。

| ツール | リスク | 説明 |
|---|---|---|
| `git_info` | safe | `git status`, `git log`, `git diff`, `git branch` 等の情報取得 |
| `git_commit` | safe | ステージング + コミット作成 |
| `git_push` | safe | リモートへのプッシュ |
| `git_dangerous` | dangerous | `reset --hard`, `force push` 等の破壊的コマンド。**承認必要** |

### search プラグイン

| ツール | リスク | 説明 |
|---|---|---|
| `glob` | safe | globパターンでファイルを検索 |
| `grep` | safe | 正規表現でファイル内容を検索 |

### web プラグイン

| ツール | リスク | 説明 |
|---|---|---|
| `web_fetch` | safe | 指定URLのコンテンツを取得 |
| `web_search` | safe | Brave Search API を使ったWeb検索（`BRAVE_SEARCH_API_KEY` が必要） |

### automation プラグイン

| ツール | リスク | 説明 |
|---|---|---|
| `create_automation` | safe | 定期実行タスクを作成（最小間隔: 5分） |
| `list_automations` | safe | 現在の会話のAutomation一覧 |
| `pause_automation` | safe | Automationを一時停止 |
| `resume_automation` | safe | Automationを再開 |
| `delete_automation` | safe | Automationを削除 |

---

## ツール実行時のセキュリティ

すべてのツールは以下の多層チェックを通過します:

```
ユーザーのリクエスト
  │
  ├── Tool Policy チェック ← ホワイトリストにあるか？
  │
  ├── File Policy チェック ← アクセス可能なパスか？
  │     (ファイル系ツールのみ)
  │
  ├── Protection Engine チェック ← 保護対象か？
  │     ├── discover: list_files の結果から除外
  │     ├── read: 読み取り拒否
  │     ├── write: 書き込み拒否
  │     ├── move: 移動拒否（source + dest 両方）
  │     └── delete: 削除拒否
  │
  ├── Approval チェック ← 承認が必要か？
  │     (riskLevel: dangerous のツール)
  │
  └── 実際のファイル操作
```

ProtectionErrorが発生した場合、ツールは以下の構造化結果を返します:

```json
{
  "ok": false,
  "code": "PROTECTED_PATH",
  "error": "This path is protected and cannot be accessed.",
  "userActionRequired": true,
  "message": "Ask the user to handle this manually."
}
```

LLMはこの結果を受け取り、ユーザーに手動操作を案内できます。

---

## プラグイン開発ガイド

### ディレクトリ構成

```
tools/
└── my-plugin/
    ├── index.js          # プラグインエントリポイント（必須）
    ├── myTool.js         # ツール実装
    └── helpers.js        # ヘルパー関数
```

### プラグイン定義 (`index.js`)

```js
import { myTool } from './myTool.js'

export const plugin = {
  name: 'my-plugin',              // プラグイン名（必須）
  description: 'My custom tools', // 説明
  tools: [myTool]                 // ツール配列（必須、1つ以上）
}
```

### ツール定義

```js
export const myTool = {
  name: 'my_tool',                // ツール名（グローバルでユニーク、必須）
  description: 'Does something',  // LLMに表示される説明
  riskLevel: 'safe',              // 'safe' | 'dangerous'
  input_schema: {                 // JSON Schema（LLMがパラメータを理解するため）
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Target file path'
      }
    },
    required: ['path']
  },

  async execute(input, context) {
    // input: LLMが渡したパラメータ
    // context: 実行コンテキスト（後述）

    return {
      ok: true,
      result: 'Done'
    }
  }
}
```

### execute の context

`execute(input, context)` の `context` には以下が含まれます:

```js
{
  // ユーザー情報
  userId: 'user-uuid',
  conversationId: 'conv-uuid',
  channelIdentityId: 'ci-uuid',

  // 承認状態
  approvalGranted: false,    // true = 承認済みの再実行

  // ポリシーサービス
  policyService: PolicyService,

  // ヘルパー関数
  helpers: {
    resolveProjectPath(path, options),   // パス解決 + ポリシーチェック
    getTextPreview(text, maxLength),     // テキストのプレビュー生成
    resolveThroughExistingAncestor(path),// シンボリックリンク解決
    createApprovalResponse(toolName, input, reason), // 承認レスポンス生成
    assertPathActionAllowed(path, action),           // 保護チェック
    filterDiscoverableEntries(basePath, entries)      // 保護対象フィルタ
  },

  // サービス
  services: {
    automationService: AutomationService
  }
}
```

### ファイル操作のパターン

ファイルを扱うツールは `resolveProjectPath` を使ってパス解決とポリシーチェックを行います:

```js
async execute(input, context) {
  const { resolveProjectPath } = context.helpers

  // パス解決 + File Policy + Protection Engine チェック
  const target = resolveProjectPath(input.path, {
    ...context,
    action: 'read'  // 'read' | 'write' | 'move' | 'delete' | 'discover'
  })

  // target.absolutePath: 絶対パス
  // target.displayPath: 表示用の相対パス

  const content = fs.readFileSync(target.absolutePath, 'utf8')

  return {
    ok: true,
    path: target.displayPath,
    content
  }
}
```

### 承認が必要なツール

```js
async execute(input, context) {
  // 承認前の初回呼び出し
  if (!context.approvalGranted) {
    return context.helpers.createApprovalResponse(
      'my_dangerous_tool',
      input,
      'This operation requires human approval.'
    )
  }

  // 承認後の再実行
  // ... 実際の処理
}
```

### エラーハンドリング

ツール内で throw されたエラーは Tool Registry がキャッチし、以下の形式で返します:

```js
// ProtectionError → 構造化された保護結果
{ ok: false, code: 'PROTECTED_PATH', ... }

// その他のエラー → 一般的なエラー
{ ok: false, error: 'Error message' }
```

### プラグイン読み込みの仕組み

```
サーバー起動時:
  1. tools/ ディレクトリの全サブディレクトリを走査
  2. 各ディレクトリの index.js を動的 import
  3. export const plugin または export default を取得
  4. プラグインのバリデーション:
     - name が string であること
     - tools が 1つ以上の配列であること
     - 各 tool に name と execute があること
  5. ツール名の重複チェック（全プラグイン横断）
  6. 失敗したプラグインはスキップ（他のプラグインに影響しない）
```

新しいプラグインを追加したら、サーバーを再起動してください。
