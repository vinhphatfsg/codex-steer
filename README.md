# codex-steer

ローカルのCodex Desktopタスクへ、タスクIDを指定してメッセージを送るmacOS用CLIです。`codex-steer`コマンド、UUID・`codex://threads/...`入力、短縮形、標準入力は継続して利用できます。

## 現在の検証段階

**送信の標準はバックグラウンド方式の`app-server`です。`--backend app-server`は省略できます。** 従来のUI方式は`--backend ui`で明示的に選択します。サイドチャット・下書きの維持と通常起動への復旧には未確認項目があります。検証状況と残りの手順は[チェックポイント](docs/checkpoints.md)を参照してください。

初回の実機起動では内蔵`codex_app` MCPがコード署名の確認で失敗しました。ラッパーもDesktop同梱の署名付きNodeで起動するよう修正し、再起動後に内蔵MCPの復旧を確認しています。実タスクの未ロード再開・steer・自動承認・質問回答の往復を確認済みです。サイドチャット・下書きの維持と通常起動への復旧確認が残っています。

```bash
codex-steer send <thread-id> "方針を変更してください"
codex-steer <thread-id> "方針を変更してください"
```

`app-server`方式は入力欄・キー入力・クリップボード・画面遷移を使いません。接続失敗時にもUI方式へ自動切り替えしません。

## インストールと起動

macOS、`/Applications/ChatGPT.app`、Node.js 20以降が必要です。通常のCLIはPATHのNodeを使用し、Desktopのラッパーは`/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node`を使用します。WebSocket用の`ws`をロックファイルに固定しています。

```bash
make install-local
```

`~/.local/bin`をPATHに含めてください。すでにこのリポジトリへのシンボリックリンクでインストール済みの場合、チェックアウトの変更がそのまま反映されます。

他の作業を終えてDesktopを終了してから、ターミナルで実行します。

```bash
codex-steer desktop start
codex-steer doctor --json
```

`desktop start`はDesktopの起動時に一度実行します。すでに起動しているDesktopは強制終了しません。通常起動したDesktopに、後から共有ソケットを追加することはできません。`send`はサーバーを起動・再起動しません。

`doctor`の`checks.bundled_wrapper_node`が`false`の場合、古いラッパーまたは別のNodeで起動中です。作業終了後にDesktopを終了し、`desktop start`で起動し直してください。`ready:true`は接続と起動条件の確認であり、MCP・承認・画面状態までの実機検証完了を意味しません。

起動だけをプレビューする場合:

```bash
codex-steer desktop start --dry-run --json
```

## 仕組み

Desktopには、その起動に限定して`CODEX_CLI_PATH`でラッパーを指定します。ラッパーは親プロセスを確認し、Desktop本体からの通常のApp Server起動だけをUnixソケット上のWebSocketへ変換して、JSONL通信を中継します。MCPやComputer Useが内部で起動するApp Server、バージョン確認などは同梱CLIへ引数・環境変数を保持して転送します。内部ツールのサーバーは共有ランタイムの所有権を取得しません。

送信CLIは同じApp Serverへ接続し、`thread/read`で対象と状態を確認してから`turn/steer`へ`threadId`と`expectedTurnId`を渡します。既存ターンが終わった場合やIDが一致しない場合は送信を止めます。

各送信には一意の`clientUserMessageId`を付けます。Desktop 26.903.71938には、IDのない外部steerの本文バブルを省略する表示処理があります。通常のDesktop送信と同じ識別方法を使い、同じ本文を別々に送った場合も区別します。修正後は外部ターミナルからのsteerと、別アプリが前面にある場合の送信で本文バブルの表示を実機確認しました。過去にIDなしで受け付けたメッセージは変更・再送しません。

`--new-turn`は、専用の購読補助ソケットを通じてDesktop自身の接続で`thread/resume`を実行してから送信します。外部CLIだけで再開すると、その終了後に承認を受け取る接続がなくなるためです。この補助経路は購読のみを扱い、汎用RPCや承認回答には使いません。承認や質問への回答はDesktopが扱います。Desktopの内部認証済みMCPパイプには接続しません。

起動情報とソケットは`/private/tmp/codex-steer-<uid>/<CODEX_HOMEのハッシュ>/`に配置し、ディレクトリを0700、ソケットと起動情報を0600に制限します。通常終了時は自分が起動したサーバーを停止して起動情報を削除します。異常終了した送信のロックは、配送結果を確認してDesktopを再起動するまで再利用しません。

公開APIの根拠は[App Serverの仕様](https://learn.chatgpt.com/docs/app-server#protocol)と[`turn/steer`](https://learn.chatgpt.com/docs/app-server#steer-an-active-turn)です。WebSocketは実験的なインターフェースです。Desktopの`CODEX_CLI_PATH`による統合も公開互換性が保証された仕組みではありません。アプリ更新後は再検証してください。

## コマンド

`codex-steer help` は用途別の入口です。`codex-steer read --help` のように各コマンドから使い所・確認できること・例を読めます。`help read --json` は同じ説明を構造化JSONで返します。

別AIからレビューするときは、まず現状を読み、返されたcursorを次回へ引き継ぎます。

```bash
codex-steer status <thread-id> --json
codex-steer read <thread-id> --json
codex-steer read <thread-id> --since <cursor> --include-output --json
codex-steer watch <thread-id> --until idle --timeout-ms 60000 --json
```

`read`は初回に直近50項目、`--since`指定時は新規・更新項目を返します。実行中コマンドが完了した場合も更新として届きます。`has_more:true`なら返されたcursorで続きを読みます。出力本文は`--include-output`指定時のみ、内部推論は常に除外します。`watch`は既定1秒間隔の読み取りで変化を待ち、条件成立または時間切れで一度返します。購読・再開・承認回答は行いません。`notLoaded`は未ロードで、観測してもそのままです。

機能別の方針と検証条件は[補助機能の設計](docs/assistance-design.md)を参照してください。

```bash
# 環境診断。背景方式にはAccessibilityは不要です。
codex-steer doctor --json

# 最近のローカルタスク。CODEX_HOMEに従います。
codex-steer threads list --desktop-only --limit 20 --json
codex-steer thread resolve codex://threads/<thread-id>

# 送信前のプレビュー。接続・再開・画面操作を行いません。
codex-steer send <thread-id> "メッセージ" --dry-run --json

# 実行中ターンへの追加入力。
codex-steer send <thread-id> "メッセージ" --json

# 停止中、またはまだロードしていないタスクの再開。
codex-steer send <thread-id> "続きをお願いします" --new-turn --json

# 複数行を標準入力から送信。
printf '%s\n' '1. 原因を調査' '2. 結果を説明' | codex-steer send <thread-id> -

# メッセージ中にオプション名を含める場合。
codex-steer send <thread-id> -- '--new-turn の処理を確認してください'
```

同一タスクへの同時送信は拒否します。`--new-turn`は実行中なら拒否し、再開後にも状態を確認します。ただしApp Serverの`turn/start`には「停止中の場合だけ開始する」原子的な条件指定がなく、確認直後にDesktop側が同時送信した場合、同じタスクの実行中ターンへの追加入力として扱われる可能性があります。受付結果は入力の受付を表し、新規ターンの排他的確保や処理完了を保証しません。

## 従来のUI方式

明示的に選択した場合のみ使用します。

```bash
codex-steer doctor --backend ui
codex-steer send <thread-id> "メッセージ" --backend ui
codex-steer send <thread-id> "メッセージ" --backend ui --keep-focus --wait-ms 3000
```

UI方式には実行元ターミナルのAccessibility許可が必要です。送信時にDesktopを前面にし、通常は元のアプリへ戻します。`--keep-focus`と`--wait-ms`はUI方式専用です。

この方式は画面フォーカスに依存します。サイドチャットが開いている場合の宛先保証はなく、キー入力の完了だけでは対象タスクへの配送を検証できません。結果は`submitted_unverified`として扱います。

既存の`open <ID>`と`debug-ui <ID> [--wait-ms N]`も残しています。これらは明示的に画面を操作するコマンドです。

## JSON契約

複数AIで同じ画面・Unity・Gitを利用する場合、名前付きリースを共有できます。

```bash
codex-steer resource acquire screen --owner claude-code --ttl-ms 120000 --condition '今回の画面利用はユーザー許可済み' --json
codex-steer resource status screen --json
codex-steer resource release screen --token <token> --json
codex-steer resource run unity-project-a --owner codex --ttl-ms 600000 -- npm test
```

同じCODEX_HOMEとリソース名を使う参加者間の協調用です。取得成功はOSの排他や新しい画面利用許可を意味しません。手動取得は期限付きで、古いtokenから別所有者の予約を更新・解放できません。`run`は実行中に自動更新し、終了時に解放します。更新ができなくなった場合は自分が起動したコマンド群を終了します。

検証と入力を結び付けるにはチェックポイントを使います。

```bash
codex-steer checkpoint capture <thread-id> tests --path src --path test --path package.json --path package-lock.json --json
codex-steer checkpoint run <thread-id> <checkpoint-id> -- npm test
codex-steer checkpoint attach <thread-id> <checkpoint-id> --artifact results.xml --json
codex-steer checkpoint verify <thread-id> <checkpoint-id> --json
codex-steer send <thread-id> '検証結果に基づき次へ進んでください' --checkpoint <checkpoint-id> --json
```

入力ファイル集合をハッシュで記録し、実行前後の照合と実行中のファイル監視で変更を検出します。追加・削除も対象で、変更や監視エラーがあれば終了コード0でも`valid:false`です。成果物は成功後に明示的に関連付け、その後の変更も検出します。`.git`以外の除外は`--exclude`で指定し、出力先・キャッシュを入力に含めないでください。ディレクトリのシンボリックリンクは実体を明示します。`valid`は選択した入力と実行の整合性で、テストの十分性や配布許可ではありません。厳密に入力を固定する場合は隔離チェックアウトを使います。

有効な指示の確認と、訂正・撤回もCLIから扱えます。

```bash
codex-steer instructions list <thread-id> --json
codex-steer send <thread-id> '診断を訂正します。原因は復帰処理です' --supersedes <message-id> --source claude-code --kind review --json
codex-steer instructions retract <thread-id> <message-id> --reason '再計測で仮説が否定された' --json
```

置換・撤回は相手へ明示的に送信し、元履歴は残します。受付不明の場合は旧指示を有効なまま保留を表示し、`history check`で照合するまで次の置換を拒否します。`instructions list --all`で履歴を確認できます。`--expires-at`は時差付きISO日時で、期限後は有効一覧から除外します。既に進行中の作業を自動停止する機能ではありません。

指示をレビューや仮説として区別し、見た根拠と結び付けられます。

```bash
codex-steer send <thread-id> '競合の可能性を確認してください' --source claude --kind hypothesis --evidence results.xml --based-on <cursor> --json
```

`--kind`は`decision`（ユーザー決定の伝達）、`review`、`hypothesis`、`suggestion`です。メタデータ指定時だけ、ID・送信者・種類・根拠の短い説明を本文の前に付けます。`decision`という自己申告はユーザーの新しい承認ではありません。`--based-on`は`read/status`のcursorで、新しいユーザー入力やターン変更があれば送信を止めます。根拠ファイルの変更・消失も送信直前に検出します。URLは取得せず参照として保存します。確認と送信は別操作のため、直後の変更まで原子的に防ぐものではありません。

app-server送信は、送信前にIDと本文を`$CODEX_HOME/codex-steer/messages/`（未指定時は`~/.codex`配下）へ記録します。ファイルは0600です。以前の送信やUI方式は取り込みません。

```bash
codex-steer history list <thread-id> --pending --json
codex-steer history check <thread-id> <message-id> --json
codex-steer history show <thread-id> <message-id> --include-text --json
codex-steer history mark <thread-id> <message-id> --status applied --note '回帰テストが成功' --evidence results.xml --by reviewer --json
```

`check`は同じ`client_message_id`と本文ハッシュを受信履歴で照合します。`stored`は保存確認、`not_observed`は未確認、`conflict`はID/本文の不一致です。後続の発言があるだけで対応完了とはしません。`mark`は記録者による申告を履歴として残し、`applied`には根拠が必要です。未知の配送を自動再送する処理はありません。受付後にローカル記録更新だけが失敗した場合も、受付結果を保持して`journal_update_required:true`を返します。

既存の`ok`・`command`・`data`形式を維持します。バックグラウンド方式の受付成功:

```json
{"ok":true,"command":"send","data":{"thread_id":"...","turn_id":"...","client_message_id":"...","backend":"app-server","sent":true,"delivery_status":"accepted"}}
```

送信後に接続が切れ、受付結果を確認できなかった場合:

```json
{"ok":false,"error":{"message":"Delivery is unknown ...","code":"CONNECTION_FAILED","thread_id":"...","sent":null,"delivery_status":"unknown"}}
```

`unknown`では自動再送しません。対象タスクで受付済みか確認してから判断してください。送信前の失敗は`not_sent`、dry-runは`sent:false`です。UI方式は`sent:null`・`delivery_status:"submitted_unverified"`に変更しています。本文や認証情報を結果に含めません。失敗時の終了コードは1です。

`client_message_id`は保存されたユーザーメッセージの`clientId`と照合できます。表示・照合用の識別子であり、再試行時の重複防止を保証するキーではありません。`accepted`はサーバーの受付確認であり、バブル描画の完了を示すものではありません。

## 通常起動への復旧

作業を終えてDesktopを終了し、Dockなどから通常起動します。起動時だけの環境変数指定なので、設定ファイルの書き換えや常駐サービスの解除は不要です。通常起動後にUI方式を使う場合は`--backend ui`を指定してください。

## 開発と検証

```bash
npm ci --ignore-scripts
npm run check
npm test
npm run test:protocol
```

`npm test`はテスト専用Unixソケットを使用します。`test:protocol`は同梱CLI・一時CODEX_HOME・localhostの模擬モデル・Desktopを模した標準入出力クライアントを使います。実際のDesktopを再起動せず、アカウント認証や有料モデル呼び出しも使いません。サンドボックス環境ではローカル待受けと子プロセス実行の許可が必要な場合があります。
