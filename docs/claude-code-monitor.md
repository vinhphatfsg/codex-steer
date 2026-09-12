# Claude CodeのMonitorからcodex-steerを使う

Monitorが変化を受け取り、Claudeが内容を判断し、codex-steerで観測・検証・指示を行います。今回の機能はこの運用に合わせています。Monitorはバックグラウンドコマンドの出力を1行ずつClaudeへ渡せます（[Claude Code公式仕様](https://code.claude.com/docs/en/tools-reference#monitor-tool)、2026-09-12確認）。

## 既存のログ監視を続ける

現在のMonitorがログ更新を通知したら、Claudeに次を実行させます。`THREAD`は対象IDまたはタスクURL、`CURSOR`は前回取得した`data.cursor`です。

```bash
codex-steer read "$THREAD" --since "$CURSOR" --json
```

初回は`--since`を外します。初回の既定は直近50件なので、既存タスクの全履歴を取得した扱いにはしません。`data.has_more:true`なら、`changed:false`でも返されたcursorで続きを読みます。読み終えたcursorを次回用に保持します。`has_more:false`かつ`changed:false`なら新しい判断は不要です。

0.10.0から、この差分readは過去の完了ターンの全文を毎回取得しません。初回は実行中ターンを調べ、表示範囲より前の実行中コマンドも追跡します。以降は新着と追跡項目を取得します。既存のMonitorから同じコマンドを呼ぶ運用でも高速化が適用されます。

読み取れるのは履歴APIに現れた項目です。同梱Codex 0.153.4の隔離検証では、開始通知が先に届き、コマンド履歴は完了時に初めて現れました。その場合は完了が`added`、実行中として既に観測できた場合は`updated`になります。`running_commands`が空でも、開始通知や未保存の実行が存在しない証明にはなりません。

旧v1 cursorを保持している場合は、`read --full-history --since <V1-CURSOR>`で未読差分を確認できます。高速方式に切り替えるときは`--since`なしのreadで現状をレビューし、新しいcursorを保存してください。`--full-history`は過去全文のハッシュ照合用で、通常の監視より時間がかかります。高速方式の確認範囲は`history_scope:"tail-and-tracked-items"`です。過去全文の書き換えまで確認した証明としては扱いません。

この方法では、既存のMonitorを変更せずに送信履歴・チェックポイント・指示の訂正などを利用できます。ログが今回のread/watchにも反応する場合、更新通知だけで送信を繰り返さず`changed`を確認してください。

## codex-steerの出力を直接Monitorへ渡す

Claudeに次のコマンドをMonitorで実行するよう依頼します。シェルで`claude monitor`という別コマンドを呼ぶ手順ではありません。

```bash
codex-steer watch "$THREAD" --stream --poll-ms 1000 --json
```

初回は現在の状態を基準にし、変化するまで出力しません。開始時点もレビューしたい場合は先に`read`し、その`data.cursor`を次のように渡します。読み取りから監視開始までの新着も取得できます。

```bash
codex-steer watch "$THREAD" --stream --since "$CURSOR" --json
```

`--stream`は`--json`を省略してもJSON Linesです。本文の改行はJSON内にエスケープされ、1通知が複数行に分かれません。発言、実行中項目の更新、タスク状態・承認待ちの変化を出力します。同じ状態が続く間の定期通知はありません。

`--limit`は1通知の項目数（既定50）、`--max-chars`は各テキストの文字数（既定2000）です。超過する差分はcursorで順に出力します。コマンド出力・差分本文が必要なら`--include-output`を付けます。どのモードでも内部推論は出力しません。

監視は停止されるまで続きます。ClaudeにMonitorのキャンセルを依頼するか、直接起動した場合はCtrl-Cで止めます。`--until`と`--timeout-ms`は通常の1回待機用で、`--stream`とは併用しません。接続切断や古いcursorはエラーを1行出力して終了します。再接続・cursorの取り直し・送信の再試行は、原因を確認してから判断します。

## 通知を受けた後の使い分け

| 見つかったこと | Claudeが行うこと | CLI |
| --- | --- | --- |
| 新しいユーザー方針 | 方針を読み直し、以前の判断を見直す | `read`、`instructions list` |
| テスト失敗や根拠の不足 | ソースと結果を調べ、レビューか仮説として伝える | `send --kind review` / `--kind hypothesis --evidence` |
| 古いソースのテスト結果らしい | 対象ファイルを照合し、必要なら再検証する | `checkpoint verify`、新しい`capture` / `run` |
| 自分の診断が誤っていた | 元のIDを明記して訂正・撤回する | `send --supersedes` / `instructions retract` |
| 自分が送った文章が履歴に現れた | 配送を照合し、追加指摘がなければ送信しない | `history check` |
| 相手が対応したと述べた | 変更とテストの根拠を確認し、確認者を記録する | `history mark --status applied --evidence ... --by claude-code` |
| Unity・画面・Gitの利用が競合しそう | 同じ名前の予約を確認し、取得後に操作する | `resource status` / `acquire` / `run` |
| 承認・ユーザー回答が必要 | 既存のユーザー応答の流れに戻す | `status`の`attention` |

`--based-on <cursor>`を送信に付けると、観測位置以降の新しいユーザー入力やターン変更を送信直前に検知できます。`has_more:true`のcursorでは送れないので、差分を読み終えてから判断してください。`--evidence`はローカルファイルのハッシュも照合します。検証済み入力に基づく指示には`--checkpoint <id>`を付けます。これらの確認と送信は別操作なので、直後の変化まで原子的に防ぐものではありません。

## Claudeに渡せる運用指示の例

下記の宛先と担当範囲を、今回依頼したいものへ置き換えて渡します。

```text
対象は <THREAD>。担当範囲は <例: 実装レビューとテスト結果の確認>。
まず codex-steer help monitor と help send を読み、read --json で現状を確認する。
既存のログ監視がある場合は通知後に read --since で新しい差分を読む。
直接監視する場合は、そのcursorを指定した watch --stream をMonitorで起動する。

通知だけを理由に指示を送らず、新しい問題や判断変更があるときに限り送る。
送信前にhistoryと有効なinstructionsを確認し、同じ指摘を繰り返さない。
送信には --source claude-code と適切な --kind を付け、必要に応じて根拠を示す。
見た状態に依存する指示は --based-on を付ける。古くなっていたら読み直して再判断する。
自分の過去の診断を訂正するときは、そのmessage_idを --supersedes に指定する。
検証結果を根拠にする場合はcheckpointで入力と最新実行を照合する。
acceptedは受付、storedは履歴への保存、appliedは根拠付きの確認者の申告として扱う。
unknownの送信を自動再送しない。自分の送信通知だけに反応して返信しない。
状態が変わらないときは静かに待つ。
```

`resource`は同じCODEX_HOMEと同じ名前を使う参加者間の予約です。Codex側も同じ予約を使う必要があります。取得したこと自体はOSの排他や画面利用の許可ではありません。必要なユーザー許可・担当範囲は元の依頼に従います。

監視と各CLIの接続・差分・中断は隔離したテストで検証します。Claudeの判断の適切さや、各環境のMonitor起動権限はCLIの成功だけでは確認できません。
