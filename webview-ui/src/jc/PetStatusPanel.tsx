// ── 相棒カルテ (agent-pet ステータス画面) ─────────────────────────
// 卵 (将来は成長後の姿) クリックで開く。設計正本:
//   .company/secretary/owner-ventures/agent-tamagotchi/status-panel-ux-v1.md
//
// 3系統の計器盤:
//   ①愛着系 = 名前 / 段階 / いっしょの日数 / 誕生日
//   ②実用系 = 得意分野の内訳 / おぼえた作法 / きのうの付箋 (原文)
//   ③期待系 = つぎの成長まであと◯ (距離は見せる・中身は「？」で伏せる)
//
// この画面は「飼い主だけが見るローカル画面」。付箋の原文・仕事の具体名を
// 出してよいのはここだけで、見せ合い用のキャラカードには出さない (骨子§6)。

import {
  PET_NEXT_REWARD_GLYPH,
  PET_STAGE_GLYPHS,
  PET_STAGE_LABELS,
  PET_TRAIT_LABELS,
  PET_TRAIT_ORDER,
} from './jc-constants.js';
import type { JCPet } from './pet-state.js';
import { jcGetPetDayCount, jcGetPetNextStage } from './pet-state.js';

const PANEL_W = 340;
/** 卵の横に置く隙間 (相棒を隠さずに読めるようにする)。 */
const PANEL_GAP = 18;
/** 上端の下げ幅 (卵の少し上から始める)。 */
const PANEL_RISE = 80;
/** 上端の最大位置 (画面高に対する比)。 */
const PANEL_TOP_MAX_RATIO = 0.26;

const PANEL_BG = 'rgba(38, 43, 47, 0.96)';
/** 相棒 = 卵の殻色の枠 (カルテ=青緑 / 本棚=アンバー と区別)。 */
const PANEL_BORDER = 'rgba(245, 231, 200, 0.5)';
const ACCENT_TEXT = '#F5E7C8';
const BODY_TEXT = '#D8D2C4';
const MUTED_TEXT = '#8A97A0';
const BAR_BG = 'rgba(255, 255, 255, 0.08)';
const BAR_FILL = '#8FD3C7';
const NEXT_FILL = '#E4C36E';
const CARD_LINE = 'rgba(245, 231, 200, 0.18)';

function stageLabel(stage: number): string {
  return PET_STAGE_LABELS[stage] ?? PET_STAGE_LABELS[0];
}

/** 段階の見出し絵文字。姿 (卵→ひな→…) と同じ順で切り替わる。 */
function stageGlyph(stage: number): string {
  return PET_STAGE_GLYPHS[stage] ?? PET_STAGE_GLYPHS[0];
}

function birthdayLabel(bornAt: string | null): string {
  if (!bornAt) return '誕生日 記録なし';
  const [, m, d] = bornAt.split('-');
  return `${Number(m)}月${Number(d)}日生まれ`;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: `1px solid ${CARD_LINE}`, padding: '9px 14px' }}>
      <div
        style={{
          fontSize: '10px',
          color: MUTED_TEXT,
          letterSpacing: '0.08em',
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Bar({ ratio, color }: { ratio: number; color: string }) {
  return (
    <div style={{ height: 6, background: BAR_BG, flex: 1, minWidth: 0 }}>
      <div
        style={{
          height: '100%',
          width: `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`,
          background: color,
        }}
      />
    </div>
  );
}

export interface PetStatusPanelProps {
  pet: JCPet;
  position: { x: number; y: number };
  onClose: () => void;
}

export function PetStatusPanel({ pet, position, onClose }: PetStatusPanelProps) {
  const next = jcGetPetNextStage(pet);
  const dayCount = jcGetPetDayCount(pet);
  const traitMax = Math.max(1, ...PET_TRAIT_ORDER.map((k) => pet.traits[k] ?? 0));
  const traitTotal = PET_TRAIT_ORDER.reduce((sum, k) => sum + (pet.traits[k] ?? 0), 0);

  // 相棒の「横」に開く。中央に被せると読んでいる間ずっと相棒が隠れてしまい、
  // 「この子のカルテ」でなく単なるダイアログになる。右に入らなければ左へ。
  const rightSide = position.x + PANEL_GAP;
  const left =
    rightSide + PANEL_W > window.innerWidth - 8
      ? Math.max(8, position.x - PANEL_W - PANEL_GAP)
      : rightSide;
  const top = Math.max(
    8,
    Math.min(position.y - PANEL_RISE, window.innerHeight * PANEL_TOP_MAX_RATIO),
  );

  return (
    <div
      data-pet-status-panel
      style={{
        position: 'absolute',
        left,
        top,
        width: PANEL_W,
        maxHeight: '72vh',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 62,
        background: PANEL_BG,
        border: `2px solid ${PANEL_BORDER}`,
        borderRadius: 0,
        boxShadow: '2px 2px 0px #0a0a14',
        color: BODY_TEXT,
        fontSize: '13px',
        boxSizing: 'border-box',
      }}
    >
      {/* ── ヘッダー: 名前 + 段階 (愛着系) ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 14px 8px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: '16px' }}>{stageGlyph(pet.stage)}</span>
          <span
            style={{
              fontSize: '15px',
              fontWeight: 'bold',
              color: ACCENT_TEXT,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {pet.name}
          </span>
          <span style={{ fontSize: '11px', color: MUTED_TEXT, flexShrink: 0 }}>
            {stageLabel(pet.stage)}
          </span>
        </div>
        <button
          onClick={onClose}
          title="閉じる"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--pixel-close-text)',
            cursor: 'pointer',
            fontSize: '14px',
            padding: '0 2px',
            flexShrink: 0,
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ overflowY: 'auto', minHeight: 0 }}>
        {/* ── ①いま (愛着系) ── */}
        <Card title="いま">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ color: MUTED_TEXT, fontSize: '11px' }}>いっしょに</span>
            <span style={{ fontSize: '24px', fontWeight: 900, color: ACCENT_TEXT, lineHeight: 1 }}>
              {pet.bond}
            </span>
            <span style={{ color: MUTED_TEXT, fontSize: '11px' }}>日</span>
          </div>
          <div style={{ color: MUTED_TEXT, fontSize: '11px', marginTop: 4 }}>
            {birthdayLabel(pet.bornAt)}
            {dayCount !== null && ` ／ きょうで ${dayCount}日目`}
          </div>
        </Card>

        {/* ── ②つぎの成長 (期待系・この画面の主役) ── */}
        <Card title="つぎの成長">
          {next === null ? (
            <div style={{ color: BODY_TEXT }}>いちばん上まで育ちました</div>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <span style={{ color: ACCENT_TEXT, fontWeight: 'bold' }}>
                  {stageLabel(next.stage)} まで
                </span>
                <span style={{ color: NEXT_FILL, fontWeight: 900, fontSize: '15px' }}>
                  {next.met ? '条件クリア ✓' : `あと ${next.target - next.current}${next.unit}`}
                </span>
              </div>
              <Bar ratio={next.ratio} color={NEXT_FILL} />
              {next.met && (
                <div style={{ color: NEXT_FILL, fontSize: '11px', marginTop: 5 }}>
                  つぎの朝、あいさつと一緒に あがります
                </div>
              )}
              <div style={{ color: MUTED_TEXT, fontSize: '11px', marginTop: 5 }}>
                条件: {next.label} {next.target}
                {next.unit}（いま {next.current}
                {next.unit}）
              </div>
              <div style={{ color: MUTED_TEXT, fontSize: '11px', marginTop: 3 }}>
                そのとき もらえるもの: {PET_NEXT_REWARD_GLYPH}
              </div>
            </>
          )}
        </Card>

        {/* ── ③とくいなこと (実用系) ── */}
        <Card title="とくいなこと">
          {traitTotal === 0 ? (
            <div style={{ color: MUTED_TEXT, fontSize: '12px' }}>
              まだ どれも 0。仕事を頼むと ここが伸びます
            </div>
          ) : (
            PET_TRAIT_ORDER.map((key) => {
              const v = pet.traits[key] ?? 0;
              return (
                <div
                  key={key}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}
                >
                  <span
                    style={{
                      width: 76,
                      flexShrink: 0,
                      fontSize: '11px',
                      color: v > 0 ? BODY_TEXT : MUTED_TEXT,
                    }}
                  >
                    {PET_TRAIT_LABELS[key] ?? key}
                  </span>
                  <Bar ratio={v / traitMax} color={BAR_FILL} />
                  <span
                    style={{
                      width: 22,
                      flexShrink: 0,
                      textAlign: 'right',
                      fontSize: '11px',
                      color: v > 0 ? ACCENT_TEXT : MUTED_TEXT,
                    }}
                  >
                    {v}
                  </span>
                </div>
              );
            })
          )}
        </Card>

        {/* ── ④おぼえた作法 (実用系) ── */}
        <Card title="おぼえた作法">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: '18px', fontWeight: 900, color: ACCENT_TEXT, lineHeight: 1 }}>
              {pet.learnedCount}
            </span>
            <span style={{ color: MUTED_TEXT, fontSize: '11px' }}>件</span>
          </div>
          {pet.learnedCount === 0 ? (
            <div style={{ color: MUTED_TEXT, fontSize: '11px', marginTop: 4 }}>
              「次はこうして」と伝えると 1件ずつ増えます
            </div>
          ) : (
            <div style={{ marginTop: 5 }}>
              {pet.learnedRecent.map((title) => (
                <div
                  key={title}
                  title={title}
                  style={{
                    fontSize: '11px',
                    color: BODY_TEXT,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ・{title}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ── ⑤さいごの付箋 (実用系×愛着系の接点 = 「覚えてくれてる」の物証) ──
            当日ぶんが最新のこともあるため見出しは「きのう」と断定しない。 */}
        <Card title="さいごの付箋">
          {pet.lastNote === null ? (
            <div style={{ color: MUTED_TEXT, fontSize: '12px' }}>付箋は まだ 1枚もありません</div>
          ) : (
            <>
              <div style={{ color: '#EDE8DC', fontSize: '12px', lineHeight: 1.5 }}>
                「{pet.lastNote.text}」
              </div>
              <div style={{ color: MUTED_TEXT, fontSize: '10px', marginTop: 4 }}>
                {pet.lastNote.date} {pet.lastNote.time} ／ 付箋 {pet.memoryDays}日ぶん
              </div>
            </>
          )}
          <div style={{ color: MUTED_TEXT, fontSize: '11px', marginTop: 6 }}>
            きょうの付箋:{' '}
            {pet.hasNoteToday ? 'もう書いてあります' : 'まだ（1日の終わりに書きます）'}
          </div>
        </Card>
      </div>

      {/* ── フッター: ローカル専用であることの常時明示 (骨子§6の線引き) ── */}
      <div
        style={{
          padding: '6px 14px 8px',
          borderTop: `1px solid ${CARD_LINE}`,
          color: MUTED_TEXT,
          fontSize: '10px',
          flexShrink: 0,
        }}
      >
        ※ この画面の内容は この端末の中だけ。見せ合い用のカードには 付箋と仕事の名前は出しません
      </div>
    </div>
  );
}
