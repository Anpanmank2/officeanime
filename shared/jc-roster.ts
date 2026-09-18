// ── Just Curious Virtual Office — Roster identity constants ─────
// 常駐メンバーと秘書席の判定は「役職の文字列」ではなく ID で行う。
// 肩書（jc-config.json の role）は表示専用で、いつ変わってもよい。
// 拡張側 (src/) と webview 側 (webview-ui/src/) の両方から参照される。

// 秘書席のメンバー ID（吹き出し・ビーム色の起点）
export const SECRETARY_MEMBER_ID = 'exec-sec';

// PM 席のメンバー ID
export const PM_MEMBER_ID = 'eng-04';

// 常駐メンバー: 自動出社し、アイドルタイムアウトでも退出しない
export const PERMANENT_MEMBER_IDS: readonly string[] = [SECRETARY_MEMBER_ID, PM_MEMBER_ID];

// 常駐判定用の集合（PERMANENT_MEMBER_IDS と同じ中身）
export const PERMANENT_MEMBER_ID_SET: ReadonlySet<string> = new Set(PERMANENT_MEMBER_IDS);
