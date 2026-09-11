# バックグラウンド送信の検証記録

検証日: 2026-09-12 JST。初回対象: Desktop 26.903.71938、同梱CLI 0.153.4、CLI用Node 25.1.0、修正後のラッパー用同梱Node 24.20.0、ws 8.21.3。

## 到達状況

| チェックポイント | 状態 | 根拠・残作業 |
|---|---|---|
| CP1: 共有接続 | PASS | 実同梱CLIでDesktop相当のstdioクライアントと別のWebSocketクライアントが同じ実行中ターンを参照・操作。古いターンIDは拒否 |
| CP2: 中継 | PASS（自動） | 分割UTF-8、複数行、大きなメッセージ、順序、背圧、ID、切断、設定引数保持、ロックの競合、内部ツールのstdio起動を検証。実機MCPはCP4で確認 |
| CP3: 送信 | PASS（自動） | 宛先不一致、状態不一致、同時送信、応答消失、再送禁止、dry-run、UI専用オプションを検証 |
| CP4: Desktop統合 | PASS（自動承認設定） | 内蔵MCP32ツールとread_thread、未ロード再開・同一ターンへのsteer、送信CLI終了後の自動承認コマンドと質問回答の往復を実機で確認。手動の承認ボタン操作は未検証 |
| CP5: サイドチャット・画面 | PARTIAL | 別タスク表示・計算機を前面にした配送と、外部ターミナルからの本文バブル表示を確認。サイドチャット・下書きと表示先・フォーカスの最終確認は未実施 |
| CP6: 復旧と標準化 | PARTIAL | ユーザーの明示指示でapp-serverを標準化。通常起動への復旧と専用起動の再検証は未実施 |

外部ターミナルからの配送とバブル表示を確認した後、ユーザーが`--backend app-server`の省略を明示的に依頼したため、既定方式を`app-server`に変更した。以前の標準化待ちの方針をこの指示で更新し、CP5・CP6の未検証項目はそのまま残す。接続できなければ未送信で終了し、サーバーの自動起動・UIへの自動切り替えは行わない。`doctor`の`rollout_status:enabled`は既定方式の有効化を示し、全チェック完了を意味しない。

変更後の64件の自動テストと隔離結合テストがPASS。`--backend`を省略した実CLIのURL短縮形が共有サーバーへ届くこと、未接続では`not_sent`で終わること、明示したUI方式が維持されることを確認した。インストール済みCLIの実機`doctor`も`ready:true`・`default_send_backend:app-server`・`rollout_status:enabled`を返した。今回の変更でDesktopは再起動していない。

`npm run check`と自動テスト64件がPASS。`npm run test:protocol`は`result: PASS`、`real_desktop_validated: false`。プローブは同梱Nodeで模擬Desktop用の起動分岐を呼び、別途ラッパー実行ファイルから内部ツール相当のstdioサーバーを起動する。両者の同時接続と終了時に共有ランタイムが変わらないことを確認する。隔離環境の結果を実機E2Eと扱わないこと。

修正後の実CLI結合テストの照合用ID: task `01a09166-3d16-7783-9abd-ed2c8ebca98d`、初回turn `01a09166-3d23-7693-b037-1c17b24bb74a`。いずれも隔離環境で作成・削除した検証用IDであり、実際のDesktopへの送信先には使用しない。

## 初回実機起動の結果

ユーザーが作業終了後に`desktop start`で起動。読み取り専用の確認で、Desktop PID 93201 → ラッパー PID 93231 → 同梱App Server PID 93245の関係、`desktop_connected:true`、CLI 0.153.4を確認した。起動済みDesktopへの初回`desktop start`は予定通り再起動案内のみを返した。

現在のtask `01a090ed-2d6e-78f0-afd7-928179259c6a`と実行中turn `01a0913f-532a-7692-9172-25ffd529c228`を共有サーバーから参照できた。実タスクへの検証メッセージ送信、画面操作、承認・質問の実機確認は行っていない。

Desktopの起動ログ（UTC 2026-09-11 16:13:16、JST 2026-09-12 01:13:16）には、`dynamic_app_tools_peer_rejected reason=missing-code-signing-identity`に続き、同じtaskの`codex_app`が`Codex app tools pipe closed`で失敗した記録がある。公開APIのMCP一覧でも`codex_app`のツール数は0。直前の通常起動では同じtaskの`codex_app`がreadyだった。

ラッパーは`/usr/bin/env node`によりHomebrewのNodeで起動しており、このNodeはad-hoc署名でTeamIdentifierがない。MCP自体にはDesktop同梱の署名付きNodeが指定されていた。Desktopの接続元認証には親・祖父プロセスの署名確認が含まれるため、ラッパーの実行経路を原因と推定した。アプリや認証機構は変更せず、ラッパーの実行NodeをDesktop同梱版へ固定し、再起動後に内蔵MCPの復旧を確認した。

旧ラッパーには実行Nodeの記録がないため、新しい`doctor`は接続・初期化が成功しても`checks.bundled_wrapper_node:false`、`ready:false`と再起動案内を返す。これは新たな接続断ではなく、起動条件の診断を追加した結果。再起動後は`running_wrapper_node_version:24.20.0`と`checks.bundled_wrapper_node:true`に加え、内蔵MCPの復旧を確認する。

## 同梱Nodeへ修正後の実機確認

ユーザーが再起動し、Desktop PID 95803 → 同梱Nodeのラッパー PID 95854 → App Server PID 95866を確認。`doctor`は`ready:true`、`bundled_wrapper_node:true`、`running_wrapper_node_version:24.20.0`。DesktopログではJST 2026-09-12 01:28:20に現在のtaskの`codex_app`がreadyとなり、確認時点で署名による接続拒否は0件だった。公開APIで32ツールを確認し、実際の内蔵`read_thread`で現在のtaskとturn `01a0914d-2b43-7431-87c1-b03d9758e902`を取得できた。

再開前の既存turnと実機テストの各turnで、モデル`gpt-5.6-luna`、作業ディレクトリ、`on-request`・`auto_review`・`workspace-write`が一致した。旧ラッパー PID 93231・旧サーバー PID 93245が終了済みであることも確認した。

ユーザーがtask `01a04373-3770-71e0-a2e3-a3c196f5f5b1`を実機テスト先として許可した。送信前の状態は`notLoaded`。`--new-turn --backend app-server`でturn `01a0914f-a342-7540-984b-ae52e1ee8303`がacceptedとなり、続く通常のsteerも同じturnでaccepted。どちらの送信CLIも終了した後、検証先で内蔵`read_thread`の完了と`waitingOnUserInput`状態への遷移を確認した。

そのturnのユーザーメッセージを公開APIで照合し、再開用とsteer用のテスト識別子が各1件、操作元taskには各0件だった。完了後の停止中taskに通常のsteerを試すと`NOT_SENT`・`sent:false`となり、自動再開は起きなかった。

承認テストのturn `01a09154-4dab-7932-8d9f-74254cefb657`では、送信CLI終了後に`require_escalated`付きの文字列表示コマンドが完了し、終了コード0を確認した。承認設定は`on-request`・`auto_review`。ユーザーも結果がDesktopに表示されたと回答した。これは自動承認経路の確認であり、手動の許可・拒否操作は未検証。

最初の質問は90秒後に`answers:{}`で終了。Desktop同梱コードには、非blockingの`item/tool/requestUserInput`を前面の操作状況に応じて空回答で自動解決する処理がある。ユーザーに検証先を表示してもらった再試行のturn `01a09158-4cb8-7b01-91fe-e6249232879a`では、ユーザーが選択肢を表示・回答できたと報告し、質問ID `cp4_roundtrip_02`に対する非空の回答と最終応答を公開API・検証タスクの保存履歴で照合した。質問要求はUTC 16:41:21.569、回答は16:42:50.377。送信CLIが終了した後も回答がモデルへ戻ったことを確認できた。

## 内部ツールによる画面条件の準備

ユーザーの要望により、短いカウントダウン付きの手動準備依頼をやめ、内部ツールで準備できる条件を確認した。この過程でComputer Useの初期化が`codex app-server exited before returning initialize`で失敗した。ラッパーがツール内部のApp Serverにも共有ランタイムを取得させていたため、親プロセスがDesktop本体の場合だけ共有起動へ変換するよう修正した。内部ツール用の起動は、同梱CLIへそのまま転送し、終了シグナルも子へ転送する。修正後はDesktopの再起動なしにComputer Useのアプリ・ブラウザ一覧取得が復旧した。現行Desktop PIDを使う親判定もtrueだった。次回の専用起動はCP6で再確認する。

Computer UseによるCodex自身の操作は、`Computer Use is not allowed to use the app 'com.openai.codex' for safety reasons.`と拒否された。別のUI操作経路でこの制限を回避していない。Codex内蔵ツールには、サイドチャットを開く・下書きを設定する操作が公開されていないため、その2条件は未検証。

利用可能な`navigate_to_codex_page`で操作元taskを表示した後、Computer Useで検証用の計算機を開いて前面にした。そこから`codex://threads/...`形式とstdinを使って検証先へ送信し、turn `01a09168-8d78-77f0-9fa4-37f767f0a5c8`でaccepted・完了。検証先のテストメッセージは1件、操作元taskは0件。送信後の計算機のAXツリーと表示に変化はなかった。Codex内部の表示先・下書きとOS全体のフォーカスを直接確認できた証拠としては扱わず、CP5全体はPARTIALとする。検証用に開いた計算機は終了し、`isRunning:false`を確認済み。

手動で残りの画面確認を行う場合は時間を指定せず、ユーザーの準備完了連絡を待つ。送信時刻を先に決めて準備を急がせない。

## 外部steerのユーザーメッセージ表示

現在のtaskで、ユーザーが別ターミナルから送った入力をモデルは受信したが、Desktopに本文バブルが表示されないとの報告を受けた。該当turn `01a09171-2271-7f83-8185-af0a1b3dc4f7`のitem `01a09171-9718-7ca2-9294-677b532832c3`は、公開`thread/read`で`type:userMessage`・`clientId:null`として1件保存されていた。

Desktop 26.903.71938の同梱コードでは、通常送信に`clientUserMessageId`を付け、外部のuserMessage表示も`clientId`を使って判定する。一方、IDのない追加メッセージは本文バブルを省略してsteered表示のみになる経路がある。同梱CLI 0.153.4の生成スキーマで`turn/steer`・`turn/start`の両方がこのフィールドを受け付けることを確認し、各送信にUUIDを付け、JSON結果へ`client_message_id`を追加した。再送用の冪等キーとは扱わない。

隔離テストでは、送信CLI終了後のDesktop向け`item/completed`通知と保存履歴に同一の`clientId`があること、本文がそのままで1件のみ保存されることを確認。実機ではturn `01a09173-1f06-79f0-a2aa-8faaa1e70ffb`への試験送信がacceptedとなり、`client_message_id:d3360331-ac33-4765-825e-3faa3061d25f`・item `01a09177-6d1f-7080-bf70-8ed2f0002f8a`を1件確認した。ユーザーはこの試験のバブル表示を確認したが、続く別ターミナルからの送信にはバブルが出ないと報告した。その追加入力はitem `01a09178-1583-7dd3-8714-0f832855ffa7`・`clientId:843f306e-eb7d-4b88-91d9-ddda703502de`で保存されている。外部ターミナル送信の実機表示は未解決であり、ID追加だけで対応完了とは扱わない。過去の入力の変更・再送は行っていない。

最初の制限環境でのテストはHomebrew Node 25.1.0が内部assertで異常終了した。ローカルソケットが使える環境では同じNodeの`npm test`と同梱Node 24.20.0の両方で64件がPASSした。

別ターミナルのコマンドはURL短縮形・`--backend app-server`で、実行ファイルもこのリポジトリへのシンボリックリンクだった。同じ形式をこちらのコマンド実行ツールで試した`client_message_id:50ebe8a9-b340-49b1-8fb0-68c06aec0834`の入力は、ユーザーがバブル表示を確認した。さらにComputer Useで計算機を前面にして送信した`client_message_id:5479810f-7e0b-41f2-a55b-03294bfa00ae`・item `01a0917f-9114-7a11-a292-03db5cb9f42e`も、計算機を閉じた後にバブル表示を確認した。この入力の実機公開通知`item/started`・`item/completed`の両方に同一の`clientId`が含まれていた。計算機は終了済み。追加の購読接続は通知確認後に閉じた。

Computer UseによるTerminal操作は`Computer Use is not allowed to use the app 'com.apple.Terminal' for safety reasons.`で拒否された。Codex自身へのComputer Useアクセスも拒否されているため、実ターミナルのUI操作とCodex画面のスクリーンショットは行っていない。別の経路で制限を回避していない。

隔離結合テストには、異なるcwdから実CLIのURL短縮形で送るケースと、同じ本文を2回送っても別の`clientId`で各1件保存される確認、サーバー再起動後もIDが残る確認を追加し、PASSした。

最後にユーザーが別ターミナルから新しい確認文をURL短縮形・`--backend app-server --json`で送信し、「バブルでた」と確認した。JSON受付結果の`client_message_id:9c3c4e90-bc54-4d6b-9158-796b9e5df042`が公開履歴のitem `01a09181-3b4e-7f41-acc4-c0eb40096d35`と一致し、対象turnは同じ`01a09173-1f06-79f0-a2aa-8faaa1e70ffb`、受信は1件だった。修正後の外部ターミナル送信によるバブル表示はこの再試験で確認できた。先のID付き1件が表示されなかった理由は特定できておらず、一般的な表示保証とはしない。過去入力の改変・再送、Desktopの再起動は行っていない。

## 調査中に必要になった補足

Desktop 26.903.71938の初期化処理は`initialize`の成功応答で完了し、公式サンプルの`initialized`通知を送らない。ラッパーの準備完了判定も成功応答に合わせ、模擬Desktopを使った結合テストでも通知を省略している。外部送信CLIは公式サンプル通り通知を送る。

外部CLIのみがタスクを購読してから切断すると、Desktopに承認要求が届かないことを実同梱CLIで再現した。これを解消するため、起動ラッパー所有の購読補助ソケットを追加した。公開APIの`thread/resume`をDesktop自身のWebSocket接続で実行し、応答だけを補助処理が回収する。通知と承認要求はDesktopへ転送し続ける。DesktopのMCPパイプには接続しない。

`turn/start`のスキーマには、原子的に停止状態を要求するパラメータがない。CLI同士はタスク単位で直列化するが、Desktopの同時操作との競合は完全には排除できない。`accepted`は指定タスクへの入力受付であり、新規ターン開始の保証とは区別する。

## 実機確認手順

実際のDesktop画面操作はこの実装セッションのツールで制限されているため、再起動と画面状態の確認はユーザーが行う。現在のタスクを含め、実行中の作業がある間はDesktopを終了しない。

1. ユーザーが検証専用のタスクを用意し、実行中用・停止中用のIDを明示する。別タスクとサイドチャットの下書きも確認対象にする。実タスクへ推測したIDで送らない。
2. 作業を終えたらDesktopを終了し、ターミナルから`codex-steer desktop start`、続いて`codex-steer doctor --json`を実行する。`ready:true`とバージョンを記録する。
3. Desktopで既存のMCPツールを1つ読み取り専用で実行できることを確認する。モデル・作業ディレクトリ・承認設定が保持されていることも確認する。
4. 実行中タスクへ`codex-steer send <ID> "検証用メッセージ" --backend app-server --json`を実行する。停止中タスクには`--new-turn`を付ける。本文はユーザーと決め、毎回異なる識別文字列を含める。
5. サイドチャット表示中、別タスク表示中、下書きあり、別アプリが前面の各状態で、対象タスクにのみ1通届くこと、表示先・フォーカス・下書きが変わらないことを目視確認する。受付のターンIDと実際の履歴を照合する。
6. 停止中タスクをDesktop再起動直後にも送信対象にし、送信CLI終了後も進行、承認、質問がDesktopで扱えることを確認する。
7. 作業終了後にDesktopを終了してDockから通常起動する。既存タスクとMCPが使えることを確認する。その後もう一度終了し、`desktop start`で起動して背景送信を再確認する。
8. 残りの実機確認の証拠をこの記録に追記する。既定方式はユーザーの指示で`app-server`に変更済み。省略時の配送・未接続時のエラー・UIへの自動切り替え禁止を検証し、README・ヘルプ・skillと動作を一致させる。

実機確認に失敗した場合は内容を記録し、必要に応じて作業終了後に通常起動へ戻す。起動設定はプロセス限定なので、アプリ本体の復元・設定削除・launchd解除は不要。通常起動後にUI方式を使う場合も`--backend ui`を明示する。

## 記録する項目

日時、Desktop・同梱CLIのバージョン、各条件のPASS/FAIL、送信先ID・ターンID、受付件数、画面状態、MCP・承認・質問・復旧結果。認証情報や実際のメッセージ本文を診断ログへ保存しない。
