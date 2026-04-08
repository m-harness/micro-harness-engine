<p align="center">
  <h1 align="center">microHarnessEngine</h1>
  <p align="center">Policy-Driven Secure AI Assistant Engine</p>
</p>

---

**microHarnessEngine** は、セキュリティを中心に0から設計されたAIアシスタントエンジンです。

WordPressの上にオリジナルのブログを構築するように、microHarnessEngineの上にオリジナルのAIアシスタントを構築し、自身のプロジェクトで安全に運用できます。

> デフォルト状態でも通常のAIアシスタントとしてすぐに使用可能です。

---

## Why microHarnessEngine?

既存のAIアシスタント・AIエージェントは、初期状態で**できることが多すぎます**。

ファイルの読み書き、コマンド実行、外部通信 — これらが最初から許可されている環境で、prompt injectionやモデルの暴走に対してどう守るのか？

**microHarnessEngineは根本的に異なるアプローチを取ります。**

```
他のAIアシスタント:  すべて許可 → 危険なものを後から制限
microHarnessEngine:   すべて拒否 → 必要なものだけ明示的に許可
```

### 3層防壁

LLMのプロンプト遵守に依存しない、コードレベルで強制される3つの防壁で情報を守ります。

```
  Layer 1:  LLMに存在を教えない
  Layer 2:  LLMから要求されても実行しない
  Layer 3:  実行結果をLLMに渡さない
```

---

## 主な特徴

- **Default Deny** — 新規ユーザーには何の権限も与えない。ポリシーで明示的に許可する
- **Tool Policy** — ユーザーごとに使用可能なツールをホワイトリストで制御
- **File Policy** — ユーザーごとにアクセス可能なパスを制御
- **Protection Engine** — パスベース＋コンテンツベースの機密情報保護
- **Approval Workflow** — 破壊的操作は人間の承認を待機
- **Multi-Provider** — Claude / OpenAI / Gemini を `.env` で切り替え
- **Multi-Channel** — Web UI / Slack / Discord / REST API
- **MCP連携** — 外部MCPサーバーのツールをポリシー管理下で統合
- **Plugin Architecture** — ツールをプラグインとして追加可能
- **Web管理画面** — すべてのセキュリティ設定をGUIで操作

---

## ドキュメント

| ドキュメント | 内容 |
|---|---|
| **[Getting Started](./getting-started.md)** | インストール・初期設定・最初のチャットまで |
| **[Architecture](./architecture.md)** | システム全体の構成・コンポーネント・処理フロー |
| **[Security Model](./security.md)** | 3層防壁・Protection Engine・機密情報検出 |
| **[Policy Guide](./policy-guide.md)** | Tool Policy / File Policyの仕組みと設定方法 |
| **[Agent Loop](./agent-loop.md)** | エージェントループ・承認ワークフロー・自動リカバリ |
| **[Tools](./tools.md)** | ビルトインツール一覧・プラグイン開発ガイド |
| **[MCP Integration](./mcp-guide.md)** | MCPサーバー接続・設定・管理 |
| **[Channels](./channels.md)** | Web UI / Slack / Discord の接続と設定 |
| **[Admin Guide](./admin-guide.md)** | 管理画面の全機能解説 |
| **[Configuration](./configuration.md)** | 全環境変数・設定リファレンス |
| **[API Reference](./api-reference.md)** | REST API全エンドポイント |
| **[Data Model](./data-model.md)** | データベーススキーマ・ER図 |

---

## クイックスタート

```bash
git clone https://github.com/your-org/microHarnessEngine.git
cd microHarnessEngine
npm install
```

`.env` を作成:

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ADMIN_RUNTIME_PASSWORD=your-admin-password
```

```bash
npm start
```

- チャットUI: `http://localhost:4310/`
- 管理画面: `http://localhost:4310/admin`

開発時はバックエンドとWeb UIを同時に起動:

```bash
npm run dev:full
# → http://localhost:4173 でアクセス（HMR + APIプロキシ有効）
```

詳しくは [Getting Started](./getting-started.md) を参照。

---

## プロジェクト構成

```
microHarnessEngine/
├── src/
│   ├── index.js                  # エントリポイント
│   ├── http/server.js            # HTTP API サーバー
│   ├── core/                     # コアロジック
│   ├── protection/               # Protection Engine
│   ├── providers/                # LLMプロバイダ
│   ├── mcp/                      # MCP クライアント
│   └── admin-web/                # 管理画面 (React + Vite)
├── tools/                        # ツールプラグイン
│   ├── filesystem/               # ファイル操作
│   ├── git/                      # Git操作
│   ├── search/                   # 検索
│   ├── web/                      # Web取得・検索
│   └── automation/               # 定期実行
├── skills/                       # カスタムスキル (.md)
├── mcp/mcp.json                  # MCP サーバー設定
└── .env                          # 環境設定（Git管理外）
```

---

## ライセンス

[MIT License](../LICENSE)

## Contributing

<!-- TODO: コントリビューションガイドラインを追加 -->
