# codex-steer

`codex-steer` は、別ターミナルからローカルのCodexデスクトップタスクを開き、実行中ターンへステアリングメッセージを送るmacOS専用CLIです。

```bash
codex-steer 01a04373-3770-71e0-a2e3-a3c196f5f5b1 \
  "失敗しているテストを先に確認してください"
```

`codex://threads/...` のフルURLも受け付けます。メッセージ送信時にはCodexデスクトップが一時的に前面へ移動します。

## 仕組みと制約

OpenAIの公開App Server APIには、実行中ターンへ追加入力する [`turn/steer`](https://learn.chatgpt.com/docs/app-server#steer-an-active-turn) があります。しかし現在のCodexデスクトップはApp Serverを標準入出力で保持しており、外部プロセスが既存の実行中ターンへ接続する公開ソケットはありません。

このCLIは公開された [`codex://threads/<thread-id>`](https://learn.chatgpt.com/docs/reference/commands#chats) で対象タスクを開き、Codex本体のdeep linkフォーカス機能とmacOS Accessibilityでメッセージコンポーザーへ貼り付けます。送信中だけChromiumのAccessibilityツリーを有効化し、終了時に以前の状態へ戻します。`~/.codex/config.toml` の追加入力モードも読み取り、通常送信がキューになる設定では、その1通だけをステアリングにするCodex標準ショートカットを自動で使います。ユーザー設定は変更しません。Codex内部の認証済みMCPパイプには接続しません。

制約:

- macOSと `/Applications/ChatGPT.app` が必要です。
- 実行元のTerminal、iTerm2などにAccessibility許可が必要です。
- 送信中はCodexデスクトップが前面へ移動します。
- UI変更の影響を受ける実験的ツールです。まず `--dry-run` と `doctor` を利用してください。

## インストール

Node.js 20以降が必要です。外部npm依存はありません。

```bash
make install-local
```

`~/.local/bin` がPATHに含まれていない場合:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

初回送信時、macOSの「システム設定 > プライバシーとセキュリティ > アクセシビリティ」で、実行元ターミナルを許可してください。CLIはこの権限を自動変更しません。

## コマンド

環境診断:

```bash
codex-steer doctor
codex-steer --json doctor
```

入力欄のフォーカス状態を診断:

```bash
codex-steer debug-ui <thread-id> --wait-ms 3000
```

最近のローカルタスクを列挙:

```bash
codex-steer threads list --desktop-only --limit 20
codex-steer --json threads list --desktop-only
```

IDを正規化:

```bash
codex-steer thread resolve codex://threads/01a04373-3770-71e0-a2e3-a3c196f5f5b1
```

送信内容をプレビュー:

```bash
codex-steer send 01a04373-3770-71e0-a2e3-a3c196f5f5b1 \
  "テストを先に確認して" --dry-run
```

送信:

```bash
codex-steer send 01a04373-3770-71e0-a2e3-a3c196f5f5b1 \
  "テストを先に確認して"
```

複数行メッセージを標準入力から送信:

```bash
printf '%s\n' '1. テストを確認' '2. 原因を要約' | \
  codex-steer send 01a04373-3770-71e0-a2e3-a3c196f5f5b1 -
```

画面の読み込みが遅い場合:

```bash
codex-steer send <thread-id> "message" --wait-ms 3000
```

## JSON契約

`--json` の成功時は標準出力へ次を返します。

```json
{"ok":true,"command":"send","data":{"thread_id":"...","backend":"desktop-ui","sent":true}}
```

エラー時:

```json
{"ok":false,"error":{"message":"..."}}
```

メッセージ本文、クリップボード内容、内部ソケットパスはJSON結果へ出力しません。

## 開発

```bash
npm run check
npm test
```
