export const VERSION = "0.9.0";

export const topics = {
  history: {
    title: "送った指示の配送と対応状況を追う",
    when: "受付不明の送信を確認するとき、または未対応の指摘を洗い出すとき。",
    usage: ["history list <THREAD> [--pending] [--include-text]", "history show <THREAD> <MESSAGE-ID> [--include-text]", "history check <THREAD> [MESSAGE-ID] [--include-text]", "history mark <THREAD> <MESSAGE-ID> --status acknowledged|applied|dismissed --note TEXT [--evidence REF ...] [--by NAME]"],
    returns: "delivery_statusは受付、verification.status=storedは受信履歴との一致、responseは記録者が申告した対応状況です。これらを別々に返します。",
    examples: ["codex-steer history list <THREAD> --pending --json", "codex-steer history check <THREAD> <MESSAGE-ID> --json", "codex-steer history mark <THREAD> <MESSAGE-ID> --status applied --note '対象の回帰テストが通過' --evidence test-results.xml --by reviewer --json"],
    notes: ["この版以降のapp-server送信をCODEX_HOME/codex-steerに保存します。本文はローカルの0600ファイルに保存し、表示は --include-text 指定時のみ。", "IDは送信結果のmessage_id/client_message_idです。unknownでもIDを保存します。checkは照合だけで再送しません。", "not_observedは未配送の証明ではありません。storedもモデルの理解や反映を証明しません。", "appliedの申告には根拠参照が必須です。根拠の妥当性を自動認定する機能ではありません。UI方式は追跡対象外です。"],
  },
  overview: {
    title: "別のAIと、Codexタスクの進行を共有する",
    when: "タスクを探す → 現状を読む → 指示を送る → 変化を確認する、という順で使います。",
    usage: ["threads list [--desktop-only] [--limit N]", "status <THREAD>", "read <THREAD> [--since CURSOR] [--limit N]", "watch <THREAD> [--since CURSOR] [--until change|idle|attention]", "send <THREAD> <MESSAGE...> [--new-turn] [--dry-run]", "doctor [--backend app-server|ui]", "desktop start [--dry-run]", "thread resolve <THREAD>", "open <THREAD>", "debug-ui <THREAD> [--wait-ms N]", "help <COMMAND>"],
    returns: "各コマンドに --json を付けると、AIやスクリプトが扱えるJSONを返します。",
    examples: ["codex-steer threads list --desktop-only --json", "codex-steer read <THREAD> --json", "codex-steer help send"],
    notes: ["THREADにはUUIDまたはcodex://threads/...を指定します。", "コマンド別のhelpには、使い所・出力・例・制約を載せています。help自体も --json に対応します。"],
  },
  read: {
    title: "直近の発言・コマンド・変更ファイルを読む",
    when: "レビューや追加指示を送る前、または前回の観測から何が変わったかを確認するとき。",
    usage: ["read <THREAD> [--since CURSOR] [--limit N] [--max-chars N] [--include-output]"],
    returns: "events、状態、次回用cursor。初回は直近50件。--sinceは未取得の新規・更新項目を古い順に返します。has_moreなら返されたcursorで続けて読めます。",
    examples: ["codex-steer read <THREAD> --json", "codex-steer read <THREAD> --since <CURSOR> --include-output --json"],
    notes: ["--limitは1〜1000（既定50）、--max-charsは100〜20000（既定2000）。", "内部推論は出力しません。コマンド出力・差分本文は --include-output 時のみ表示します。", "観測でタスクを再開・送信・前面化しません。履歴の書き換えを検出したcursorは拒否するので、--sinceを外して読み直してください。"],
  },
  status: {
    title: "実行中・停止中・承認待ちを確認する",
    when: "今ステアできるか、新規ターンが必要か、ユーザーの応答が必要かを判断するとき。",
    usage: ["status <THREAD>"],
    returns: "status、active_turn_id、attention、実行中コマンド、cursor。状態が取得できない場合はunknownとします。",
    examples: ["codex-steer status <THREAD> --json"],
    notes: ["notLoadedは保存済みタスクが未ロードという意味です。statusはロードしません。", "承認や質問には回答しません。attentionはApp Serverが報告した状態で、本文から推測しません。"],
  },
  watch: {
    title: "変化・完了・ユーザー対応待ちまで待つ",
    when: "同じログを繰り返し読まず、次のレビューが必要なタイミングを待ちたいとき。",
    usage: ["watch <THREAD> [--since CURSOR] [--until change|idle|attention] [--timeout-ms N] [--poll-ms N] [--limit N] [--max-chars N] [--include-output]"],
    returns: "条件成立または時間切れで1回だけ返します。reason、timed_out、events、cursorを確認してください。",
    examples: ["codex-steer watch <THREAD> --since <CURSOR> --json", "codex-steer watch <THREAD> --until idle --timeout-ms 60000 --json"],
    notes: ["既定はchange、30秒待ち、1秒間隔。timeoutは0〜60000ms、pollは250〜10000ms。", "--sinceなしのchangeは現在を基準に次の変化を待ちます。idle/attentionは既に成立していればすぐ返します。", "読み取り専用のポーリングです。自動送信・再開・承認回答・常駐登録は行いません。"],
  },
  send: {
    title: "実行中タスクに方針やレビューを伝える",
    when: "宛先と送る内容が決まったとき。停止中のタスクを続けるときだけ --new-turn を使います。",
    usage: ["send <THREAD> <MESSAGE...> [--new-turn] [--dry-run] [--backend app-server|ui]", "<THREAD> <MESSAGE...> [sendと同じオプション]"],
    returns: "acceptedはサーバーの受付です。処理完了や画面への表示を保証するものではありません。",
    examples: ["codex-steer send <THREAD> '失敗したテストの原因を先に確認してください' --dry-run --json", "codex-steer send <THREAD> '続けてください' --new-turn --json", "printf '%s\\n' '理由' '変更方針' | codex-steer send <THREAD> -"],
    notes: ["MESSAGEに - を指定すると標準入力を読みます。本文中のオプション名は -- の後に置いてください。", "既定はapp-server。UI操作は --backend ui を明示した場合だけです。--keep-focusと--wait-msはUI専用です。", "unknownは受付未確認です。対象の履歴を確認し、自動再送しないでください。"],
  },
  doctor: { title: "接続と起動条件を診断する", when: "接続できないとき、または初回設定後。", usage: ["doctor [--backend app-server|ui]"], returns: "readyと各チェック結果。", examples: ["codex-steer doctor --json"], notes: ["Desktopの再起動や設定変更は行いません。readyは接続条件の確認です。"] },
  desktop: { title: "共有接続を有効にしてDesktopを起動する", when: "現在の作業を終え、Desktopを終了した後の起動時。", usage: ["desktop start [--dry-run]"], returns: "起動結果。", examples: ["codex-steer desktop start --dry-run --json", "codex-steer desktop start"], notes: ["起動中のDesktopは終了させません。通常起動への復旧は、終了後にDock等から開き直します。"] },
  threads: { title: "送信先のタスクを探す", when: "宛先の正確なIDを確認するとき。", usage: ["threads list [--desktop-only] [--limit N]"], returns: "ローカルタスクのID、作業場所、更新日時。", examples: ["codex-steer threads list --desktop-only --limit 20 --json"], notes: ["CODEX_HOMEに従います。本文は読みません。"] },
  thread: { title: "タスクURLをIDに変換する", when: "コピーしたURLをスクリプトで利用するとき。", usage: ["thread resolve <THREAD>"], returns: "正規化したthread_idとdeep_link。", examples: ["codex-steer thread resolve codex://threads/<UUID> --json"], notes: ["IDの書式を確認します。タスクの存在確認はstatusを使ってください。"] },
  open: { title: "タスクをDesktopで開く", when: "ユーザーが画面でタスクを見たいとき。", usage: ["open <THREAD>"], returns: "開いたタスクのURL。", examples: ["codex-steer open <THREAD>"], notes: ["画面を操作する明示的なコマンドです。"] },
  "debug-ui": { title: "UI送信のために画面構造を調べる", when: "明示的なUI方式を診断するとき。", usage: ["debug-ui <THREAD> [--wait-ms N]"], returns: "Accessibilityの診断情報。", examples: ["codex-steer debug-ui <THREAD> --wait-ms 1500"], notes: ["画面を操作します。通常のバックグラウンド送信には不要です。"] },
};

export function helpData(topic = "overview") {
  const data = topics[topic];
  if (!data) throw new Error(`Unknown help topic: ${topic}. Run codex-steer help.`);
  return { version: VERSION, topic, ...data, ...(topic === "overview" ? { usage: [...data.usage, "history list|show|check|mark <THREAD> ..."] } : {}) };
}

export function renderHelp(data) {
  return [`codex-steer ${data.version} — ${data.title}`, "", `使い所: ${data.when}`, "", "使い方:", ...data.usage.map(x => `  codex-steer ${x} [--json]`), "", `確認できること: ${data.returns}`, "", "例:", ...data.examples.map(x => `  ${x}`), "", ...data.notes.map(x => `• ${x}`)].join("\n");
}
