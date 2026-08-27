// ── Just Curious Virtual Office — Shared Constants ──────────────
// Single source of truth for colors, labels, and magic values
// used across jc-state, jc-overlay, and React components.

import type { JCState } from './jc-types.js';

// ── State → Neon Color Mapping ──────────────────────────────────
// Used for state dots, desk glows, and HUD indicators.
export const STATE_COLORS: Record<JCState | string, string> = {
  coding: '#39ff14',
  thinking: '#ffbf00',
  reading: '#00b4ff',
  reviewing: '#00f0ff',
  error: '#ff3d3d',
  idle: '#666688',
  break: '#ff6b9d',
  meeting: '#b388ff',
  arriving: '#39ff14',
  leaving: '#888888',
  presenting: '#bf5fff',
  handoff: '#b388ff',
  absent: '#333344',
};

// ── State → Display Label ───────────────────────────────────────
export const STATE_LABELS: Record<JCState | string, string> = {
  coding: 'Coding',
  thinking: 'Thinking',
  reading: 'Reading',
  reviewing: 'Reviewing',
  error: 'Error',
  idle: 'Idle',
  break: 'On Break',
  meeting: 'In Meeting',
  arriving: 'Arriving',
  leaving: 'Leaving',
  presenting: 'Presenting',
  handoff: 'Handoff',
  absent: 'Absent',
};

// ── Department Primary Colors ───────────────────────────────────
// Canonical department colors (2026-07-03 藤井 §5: アース+クールトーン).
// DEPT_NEON.primary と同一値に保つ (単一トーン、ネオン混在を防ぐ)。
export const DEPT_COLORS: Record<string, string> = {
  engineering: '#8FA6B3',
  marketing: '#A6CFBE',
  research: '#A9C6D6',
  exec: '#E4C36E',
};

// ── Department Abbreviations ────────────────────────────────────
export const DEPT_LABELS: Record<string, string> = {
  engineering: 'ENG',
  marketing: 'MKT',
  research: 'RES',
  exec: 'EXEC',
};

// ── Department Popup Colors ─────────────────────────────────────
// Softer / higher-contrast shades for dark-background popup UIs
// (AbsentStatusPopup etc.) where neon primaries are too harsh.
export const DEPT_POPUP_COLORS: Record<string, string> = {
  engineering: '#5a8cff',
  marketing: '#ff6b8a',
  research: '#8cdd6a',
  exec: '#f0ad4e',
};

// ── Department Neon Palette (canvas rendering) ──────────────────
// Extended set: primary, glow (translucent), fill (dark bg), text (readable).
// Keyed by zone name (dev = engineering zone).
// 2026-07-03 藤井 §5 差分表: アース+クールトーン。glow は各 primary の rgba 0.4。
export const DEPT_NEON: Record<
  string,
  { primary: string; glow: string; fill: string; text: string }
> = {
  dev: {
    primary: '#8FA6B3', // スレート明
    glow: 'rgba(143, 166, 179, 0.4)',
    fill: '#1B2226',
    text: '#C2D2DB',
  },
  marketing: {
    primary: '#A6CFBE', // セージ
    glow: 'rgba(166, 207, 190, 0.4)',
    fill: '#1E2A26',
    text: '#C9E4D8',
  },
  research: {
    primary: '#A9C6D6', // くすみブルー
    glow: 'rgba(169, 198, 214, 0.4)',
    fill: '#1C262C',
    text: '#CBDFE9',
  },
  ops: {
    primary: '#B08A5E', // ウッド (ラウンジ)
    glow: 'rgba(176, 138, 94, 0.4)',
    fill: '#262019',
    text: '#D9C1A3',
  },
  exec: {
    primary: '#E4C36E', // アンバー
    glow: 'rgba(228, 195, 110, 0.4)',
    fill: '#2A2418',
    text: '#F0DCA8',
  },
  // §1 転用: 検証室 (ティール #2E9E90) / 殿堂 (アンバー #E4C36E)。fill/text は同系派生。
  verify: {
    primary: '#2E9E90',
    glow: 'rgba(46, 158, 144, 0.4)',
    fill: '#16211F',
    text: '#A8DAD3',
  },
  hall: {
    primary: '#E4C36E',
    glow: 'rgba(228, 195, 110, 0.4)',
    fill: '#2A2418',
    text: '#F0DCA8',
  },
};

// ── Bubble Emojis ───────────────────────────────────────────────
// Status emoji icons rendered above characters on the canvas.
export const BUBBLE_EMOJIS: Record<string, string> = {
  coding: '⚙️',
  thinking: '💭',
  reading: '🔍',
  reviewing: '👀',
  error: '❌',
  presenting: '📊',
  meeting: '🤝',
  coffee: '☕',
  idle: '⏳',
  sofa: '💤',
  arcade: '🎮',
  bookshelf: '📚',
  // ── Emotion triggers ──
  task_completed: '🎉',
  focus: '🔥',
  error_frustration: '😤',
  wave: '👋',
  subagent_thinking: '🧠',
  sleeping: '💤',
};

// ── Per-Member Idle Emojis ──────────────────────────────────────
// Unique idle-habit emoji for each member, derived from persona idle癖.
// Displayed when a member has been idle for IDLE_EMOJI_TRIGGER_MS.
export const MEMBER_IDLE_EMOJIS: Record<string, string> = {
  // ── Exec ──
  'exec-sec': '🖊️', // TODOリスト整理 + ペン回し

  // ── Engineering ──
  'eng-01': '👀', // コードレビューを黙々と進める
  'eng-02': '🖥️', // ターミナルのログを黙々と眺める
  'eng-03': '🎨', // Figmaとコードエディタを交互に見比べる
  'eng-04': '📝', // チームメンバーの様子を見回しながらメモ
  'eng-05': '🎭', // Pinterestで参考画像を集めてムードボード更新
  'eng-06': '🎲', // ゲームを遊びながらメカニクス研究

  // ── Marketing ──
  'mkt-01': '💹', // P/Lダッシュボードを眺めながら考え込む
  'mkt-04': '✍️', // 過去のA/Bテスト結果ファイルを見返す
  'mkt-07': '🔢', // SQLを書きながらデータパターンを探す
  'mkt-09': '📱', // SNSフィードをスクロールしてトレンドチェック
  'mkt-10': '🗺️', // 会場のフロア図面に動線を書き込む
  'mkt-11': '📉', // 広告ダッシュボードのCACをリアルタイム監視
  'mkt-12': '📄', // テンプレートライブラリを整理

  // ── Research ──
  'res-01': '📊', // ダッシュボード数値を眺めながら仮説メモ
  'res-02': '📱', // TweetDeckの複数カラムを高速スクロール — NOTE: same emoji as mkt-09 but different member
  'res-03': '🎨', // ムードボードを整理しながら色彩パレット吟味 — NOTE: same emoji as eng-03
  'res-04': '📲', // スマホでTikTokをスワイプしながらフック構造メモ
  'res-05': '📖', // 学術論文を読みながらノートに要点
  'res-06': '📈', // ダッシュボードのレイアウトを微調整
  'res-07': '🃏', // Bloomberg端末風画面 + ポーカーチップを回す
  'res-08': '🔎', // Search Consoleのクエリレポートをスクロール
  'res-09': '🗂️', // 複数レポートを並べて構造マップ
};

// ── Idle Emoji Timing ───────────────────────────────────────────
export const IDLE_EMOJI_TRIGGER_MS = 10_000; // 10s idle before showing member emoji
export const IDLE_EMOJI_ON_MS = 5_000; // 5s display
export const IDLE_EMOJI_OFF_MS = 3_000; // 3s hidden (blink cycle)

// ── Task Status Colors (canvas overlay) ─────────────────────────
export const TASK_STATUS_COLORS: Record<string, string> = {
  pending: '#ffbf00',
  running: '#39ff14',
  done: '#00b4ff',
  error: '#ff3d3d',
};

// ── Permanent Resident Roles ────────────────────────────────────
// Members with these roles never auto-depart on idle timeout.
export const PERMANENT_ROLES = new Set(['Secretary', 'PM / Director']);

// ── Timing ──────────────────────────────────────────────────────
export const IDLE_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes (v1 spec)

// ── Speech Bubble Department Colors ─────────────────────────────
export const SPEECH_BUBBLE_COLORS: Record<string, string> = {
  engineering: '#4A90D9',
  marketing: '#50C878',
  research: '#9B59B6',
  exec: '#FFD700',
};

// ── Delegation Beam Presets (v1.2) ─────────────────────────────
// Color and duration for delegation chain liaison beams.
export const DELEGATION_BEAM: Record<string, { color: string; duration: number }> = {
  secretary_to_lead: { color: '#39ff14', duration: 2000 },
  lead_to_agent: { color: '#00b4ff', duration: 1500 },
  cross_dept_request: { color: '#bf5fff', duration: 2000 },
  cross_dept_return: { color: '#bf5fff', duration: 2000 },
  agent_to_lead: { color: '#00b4ff', duration: 1500 },
  progress_check: { color: '#666688', duration: 1000 },
};

// ── Secretary Monitoring Interval ──────────────────────────────
export const SECRETARY_MONITOR_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

// ── Priority Colors (P0-P4) ────────────────────────────────────
export const PRIORITY_COLORS: Record<number, string> = {
  0: '#ff0000', // P0 Critical
  1: '#ff4444', // P1 High
  2: '#f0ad4e', // P2 Medium
  3: '#58a6ff', // P3 Normal
  4: '#8b949e', // P4 Low
};

export const PRIORITY_LABELS: Record<number, string> = {
  0: 'P0',
  1: 'P1',
  2: 'P2',
  3: 'P3',
  4: 'P4',
};

// ── Task Label Colors ──────────────────────────────────────────
export const TASK_LABEL_COLORS: Record<string, string> = {
  implementation: '#39ff14',
  research: '#00e676',
  review: '#00b4ff',
  bugfix: '#ff3d3d',
  design: '#ff6b9d',
  ops: '#b388ff',
  incident: '#ff0000',
  other: '#8b949e',
};

// ── Office Log Department Filters ──────────────────────────────
export const LOG_DEPT_FILTERS = ['All', 'Eng', 'Mkt', 'Research', 'Secretary'] as const;

// ── Log Dept Filter → department mapping ───────────────────────
export const LOG_DEPT_FILTER_MAP: Record<string, string> = {
  Eng: 'engineering',
  Mkt: 'marketing',
  Research: 'research',
  Secretary: 'exec',
};

// ── UI Text (2026-07-03 藤井 UI spec — centralized for easy swap) ──
// P3 適用時に差し替えやすいよう新設文言は全てここに集約する。
// トーン: ラベルは体言止め / 誘い文言は「〜してみましょう」 / 絵文字は1要素1個まで。
export const UI_TEXT = {
  // 会社ボード (旧 COMMAND BOARD)
  companyBoardTitle: '🏛 会社ボード',
  companyBoardScoreLabel: '会社スコア',
  companyBoardTodayLabel: '本日完了（件）',
  companyBoardZeroLine1: '今日のしごとは これから！',
  // 制御改行 (\n + whiteSpace:pre-line 表示): 自然折返しだと「う」1字が孤立する。
  // トーンガイド「1文言 全角20字目安」に沿い 2行に分割 (10字 / 17字)。
  companyBoardZeroLine2: '下の依頼ドックから、\n最初のおしごとを頼んでみましょう 📋',
  // 左下ボタン群
  ownerArrive: '出社する',
  ownerLeave: '退社する',
  ownerButtonTitle: 'オーナーとしてオフィスに入る/出る',
  tasksButton: 'しごと帳',
  tasksButtonTitle: 'これまでの依頼と結果',
  settingsButton: '設定',
  settingsButtonTitle: '表示と動作の設定',
} as const;

// ── Zone Labels (2026-07-03 藤井 UI spec: 日本語化・最長5字) ──────
// key = zone name used by jc-overlay ZONE_LABELS.
export const ZONE_LABEL_TEXT: Record<string, string> = {
  exec: '社長室',
  marketing: 'マーケ部',
  research: 'リサーチ部',
  dev: '開発部',
  ops: 'ラウンジ',
  verify: '検証室',
  hall: '殿堂',
};

// ── 稼働ダッシュボード (2026-07-03 藤井 layout+dashboard spec §2) ──
// 「働いている」の定義: 在席かつ以下の非稼働状態でない。
// idle/break = 出社アイドル (彩度落ち)、arriving/leaving = 移動中 (フルカラー維持)、
// absent = 不在。それ以外 (coding/thinking/reading/reviewing/presenting/meeting/
// handoff/error) を稼働として数える。
export const NON_WORKING_STATES: ReadonlySet<string> = new Set([
  'idle',
  'break',
  'arriving',
  'leaving',
  'absent',
]);

/** 出社アイドル (彩度落ちスプライト) にする状態 — §2(a) */
export const IDLE_TINT_STATES: ReadonlySet<string> = new Set(['idle', 'break']);

// ── R1 稼働の正本定義 (2026-07-03 Owner確定・差戻しv2) ─────────────
// 稼働中 = 未完了のしごとを持つ間（受領/開始〜完了）。jc-events 履歴から導出し、
// チップ/照明/カルテ/キャラ状態表示のすべてがこの同一定義を使う (karte-state)。
/** 未完了のまま この時間を超えたしごとは「長時間停滞」(詰まり・要対応) に分類。
 *  停滞分は稼働チップの分子から外す — 死んだ agent の残骸で稼働率が
 *  永久に張り付くのを防ぐ (稼働が正しく反映されない、の再発防止)。 */
export const WORK_STALL_MS = 2 * 60 * 60 * 1000; // 2時間

// ── R1 放置しごとの自動掃除 (2026-07-04 Owner確定・eng-03) ───────────────────
// 「オフィスは会社全体 (全セッション) を映す + 古い放置は自動掃除」(Owner確定)。
// 複数セッションが 1 つの jc-events.json を共有するのは是 (会社全体の稼働を映す = 北極星)。
// ただし完了イベントを出さず消えたセッションの残骸が停滞欄に永遠に居座るのを防ぐため、
// 未完了のまま この時間を超えたしごとは「放置 (abandoned)」= 盤面から自動除外する。
// abandoned は active/stalled どちらにも数えず、稼働チップ/照明/5状態/カルテ/オフィス
// 営業状態 の全てから silent に消える (完了ではないので本棚アーカイブにも載せない —
// ただ盤面から消えるだけ)。掃除は computeOpenWork という単一元栓で 1 段足すだけで全反映。
//
// ⚠ 未完了しごとの経過には「3 つの別の時計」がある — 1 定数に共有しない:
//   ① WORK_STALL_MS (2h)          = タスク単位の詰まり判定。2h〜abandon の間は
//                                    stalled (要対応) として **表示し続ける** (掃除しない)。
//   ② WORK_ABANDON_MS (12h・本定数) = タスク単位の放置判定。これを超えたら盤面から
//                                    **除外する** (stalled より一段深い掃除の段)。
//   ③ OFFICE_CLOSE_IDLE_MS (2h)   = 会社全体の無活動判定 (店じまい)。個別タスクでなく
//                                    最終「活動」からの経過を測る。意味が全く別。
//   偶然 ① と ③ が同値 (2h) だが別物。② は別値 (12h)。将来どれか一方だけ調整する時に
//   混同で事故らないよう、3 つを独立 export に保つ (② を ① の倍数等で導出もしない)。
/** 未完了のまま この時間を超えたしごとは「放置」= 盤面から自動除外 (silent drop)。 */
export const WORK_ABANDON_MS = 12 * 60 * 60 * 1000; // 12時間 (放置の掃除しきい値)

// ── R1 オフィス営業状態マシン (2026-07-04 Owner確定・soft close) ───────────
// 「最終活動から2時間 全エージェント停止でオフィスが店じまい、新しい活動で即再開」。
// ⚠ WORK_STALL_MS (= 個別タスク 2h 停滞 = カルテの詰まり判定) とは **別の時計**。
//   偶然どちらも 2h だが意味が違う (片方=タスク単位の停滞、こちら=会社全体の無活動)。
//   両者を 1 定数に共有しない — 将来どちらか一方だけ調整する時に混同で事故る。
/** 全エージェント非稼働 + 最終「活動」から この時間で店じまい (CLOSING→CLOSED)。 */
export const OFFICE_CLOSE_IDLE_MS = 2 * 60 * 60 * 1000; // 2時間 (会社全体の無活動しきい値)

// ── R2 営業状態の見た目 (2026-07-04 藤井 visual spec §1-§5) ────────────────
// 状態の視覚遷移: open → closing → closed → reopening → open。
// close 用の新規 jc-event は作らない (既存 activity イベントから導出・冪等)。
/** 店じまい全面 dim レイヤの最大 α (0.55 = 55%暗転・輪郭残す"眠り"。0.7+ は死んで見えるので不可 / §2)。 */
export const OFFICE_DIM_MAX_ALPHA = 0.55;
/** 全面 dim の色 (既存 不在デスク暗転 …0.35 と同系・α のみ濃く / §5)。α は動的付与。 */
export const OFFICE_DIM_RGB = '10, 12, 18';
/** dim フェードイン (open→closed) 時間 (§2: 1.2s ease-out)。 */
export const OFFICE_DIM_FADE_IN_MS = 1200;
/** dim フェードアウト (closed→open, 明かり先行) 時間 (§3: 1.0s ease-in)。 */
export const OFFICE_DIM_FADE_OUT_MS = 1000;
/** CLOSED 文言のフェード (§2: 遅延0.4s → 0.8s で fade in)。 */
export const OFFICE_TEXT_FADE_DELAY_MS = 400;
export const OFFICE_TEXT_FADE_MS = 800;
/** REOPENING で文言をフェードアウトする時間 (§3: 0.5s)。 */
export const OFFICE_TEXT_FADE_OUT_MS = 500;
/** CLOSED 文言の最大 α (§2: 主文 0.75)。 */
export const OFFICE_TEXT_MAX_ALPHA = 0.75;
/** CLOSED 主文 / 副文 (§2・静か・非エラー・点滅なし)。 */
export const OFFICE_CLOSED_TITLE = '本日は終了しました';
export const OFFICE_CLOSED_SUBTITLE = '新しいご依頼で再開します';
/** 文言の縦位置 (canvas 高さに対する割合・§2: やや下 62%)。 */
export const OFFICE_CLOSED_TEXT_Y_RATIO = 0.62;
/** 営業インジケータ pill (§1)。営業中=ティール明・呼吸pulse / 本日終了=スレート・消灯。 */
export const OFFICE_PILL_OPEN_COLOR = '#5FC2B4'; // ティール明 (灯り)
export const OFFICE_PILL_CLOSED_COLOR = '#5E6B73'; // スレート (眠り)
export const OFFICE_PILL_TEXT_COLOR = '#D8D2C4'; // オート (営業中の文字)
export const OFFICE_PILL_BG = 'rgba(38, 43, 47, 0.6)'; // チャコール
export const OFFICE_PILL_PULSE_MS = 2400; // 呼吸 pulse 周期 (alpha 0.6↔1.0)
export const OFFICE_HEARTBEAT_LABEL_COLOR = '#8FA6B3'; // スレート明 (最終確認 HH:MM・副文)
export const OFFICE_CLOSED_TITLE_COLOR = '#D8D2C4'; // オート (主文)
/** 秘書巡回リング (§4: office_heartbeat 受信時のワンショット・アンバー・0.9s・歩行なし)。 */
export const OFFICE_HEARTBEAT_RING_MS = 900;
export const OFFICE_HEARTBEAT_RING_COLOR = '228, 195, 110'; // アンバー #E4C36E の RGB (exec identity)
/** 秘書 (exec-sec) の席座標 — 巡回リングの中心 (jc-state DESK_POSITIONS と一致: 8,4)。 */
export const OFFICE_SECRETARY_SEAT = { col: 8, row: 4 } as const;

// ── R2 状態表示 v2 (Owner設計 5種・顔に被せない) ───────────────────
/** 頭上ステータスアイコンの統一オフセット (world px 換算前・キャラ中心から上へ)。
 *  キャラ頭頂 (約 -14px) より十分上に置き、顔に被らない。 */
export const STATUS_ICON_OFFSET_PX = 26;
/** タスク集中 (未完了の生きたしごと 2件以上) アイコン */
export const STATUS_FOCUS_EMOJI = '🔥';
/** 集中判定のしごと数しきい値 */
export const FOCUS_WORK_COUNT = 2;
/** 承認待ち (Owner の回答待ち) アイコン */
export const STATUS_APPROVAL_EMOJI = '‼️';
/** 待機 (未完了0件・出社中) が5分続いたら zzz 表記 */
export const IDLE_ZZZ_AFTER_MS = 5 * 60 * 1000;
/** 待機中のぼやき (persona-lines とは別系統の汎用文言 — R2 Owner 指定)。
 *  ⚠ persona-lines.ts は触るな契約 — ぼやきは必ずここから引く。 */
export const IDLE_MURMUR_LINES: readonly string[] = [
  '仕事がないなー…',
  '次のしごと、まだかな…',
  'ひまだなあ…',
  '何か手伝えることないかな',
  'コーヒーでも いれようかな…',
  'そろそろ出番のはず…',
];
/** ぼやきの表示サイクル: MURMUR_CYCLE_MS ごとに MURMUR_ON_MS だけ表示 */
export const IDLE_MURMUR_CYCLE_MS = 18_000;
export const IDLE_MURMUR_ON_MS = 6_000;

// ── R5 ✉️メール演出 (依頼発行=委任の実イベント駆動) ─────────────────
export const MAIL_FLIGHT_MS = 1_400; // 封筒の飛翔時間
export const MAIL_FLIGHT_ARC_TILES = 2.2; // 弧の高さ (タイル数)

// §2(b) 稼働チップの数字色: ≥50% ティール / 1-49% アンバー / 0% スレート
export const OCCUPANCY_CHIP_COLORS = {
  high: '#5FC2B4',
  mid: '#E4C36E',
  zero: '#5E6B73',
} as const;

// §2(c) ゾーン照明 3段階 (稼働率メタファー: アンバー灯 ⇔ 消灯)
export const ZONE_LIGHT_TINTS = {
  high: 'rgba(228, 195, 110, 0.10)', // ≥50%
  mid: 'rgba(228, 195, 110, 0.05)', // 1-49%
  off: 'rgba(12, 14, 20, 0.30)', // 0%
} as const;

// §2(a) 不在デスクの暗転オーバーレイ / ネームプレートのスレート
export const ABSENT_DESK_OVERLAY = 'rgba(10, 12, 18, 0.35)';
export const ABSENT_SLATE = '#5E6B73';

// ── Speech Bubble Duration (藤井 spec: 4秒 + 10字ごと+1秒, 上限8秒) ──
export const SPEECH_BUBBLE_BASE_MS = 4000;
export const SPEECH_BUBBLE_PER_10_CHARS_MS = 1000;
export const SPEECH_BUBBLE_MAX_MS = 8000;

// ── Ticker (会社ボード上部の出来事ティッカー) ───────────────────
export const TICKER_MAX_ENTRIES = 5; // 最新5件 (藤井 spec §3)
export const TICKER_MAX_CHARS = 40; // 40字超のみ「…」+ title で全文

// ── 社員カルテ v2 ステータスバー (2026-07-04 藤井 spec §3・eng-03 実装) ──────
// プロフィールタブの RPG ステ 5 本を「0-100 の同一物差し」に正規化する定数群。
// 正規化は全て絶対固定 cap (相対 max-member 禁止・spec must_fix#3) — 1 名だけ稼働で
// 全員が 100% に張り付く/潰れるのを防ぐ。マジックナンバーは全てここに集約する
// (source へのインライン禁止・repo 規約)。
/** 経験バー: layer → 素質 0-100 (不変・固定)。L1 ほど熟練。 */
export const LAYER_EXPERIENCE: Record<string, number> = { L1: 100, L2: 80, L3: 60, L4: 40 };
/** layer 不明時の経験フロア (空バー回避・0 にしない)。 */
export const EXPERIENCE_FLOOR = 20;
/** 作業量バー: 通算完了件数の線形 cap (現最大 ≈21 の少し上)。 */
export const THROUGHPUT_BAR_CAP = 25;
/** 会話量バー: log1p 正規化の cap (秘書外れ値を飽和で吸収)。 */
export const CONVERSATION_BAR_CAP = 60;
/** 勢いバー: 半減期 (直近1日で活発なら飽和)。唯一 時間で減衰するバー。 */
export const MOMENTUM_HALFLIFE_MS = 24 * 60 * 60 * 1000;
/** 勢いバー: 半減期加重和の cap。 */
export const MOMENTUM_BAR_CAP = 8;
/** ステータスバーの段数 (filled = round(pct/10))。5 本共通。 */
export const STAT_BAR_SEGMENTS = 10;

// ── Confidence Badge Colors (eng-05 spec) ───────────────────────
export const CONFIDENCE_COLORS: Record<string, string> = {
  confirmed: '#5ac88c',
  likely: '#f59e0b',
  unverified: '#8888aa',
};

// ── Confidence Badge Styles ─────────────────────────────────────
export const CONFIDENCE_BADGE_STYLES: Record<
  string,
  { background: string; color: string; border: string }
> = {
  confirmed: {
    background: '#1a3a2a',
    color: '#5ac88c',
    border: '1px solid #5ac88c',
  },
  likely: {
    background: '#3a2e10',
    color: '#f59e0b',
    border: '1px solid #f59e0b',
  },
  unverified: {
    background: '#2a2a3a',
    color: '#8888aa',
    border: '1px solid #4a4a6a',
  },
};
