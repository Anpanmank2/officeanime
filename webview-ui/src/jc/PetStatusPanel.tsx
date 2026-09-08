// ── 相棒カルテ (agent-pet ステータス画面) ─────────────────────────
// 卵 (将来は成長後の姿) クリックで開く。設計正本:
//   .company/secretary/owner-ventures/agent-tamagotchi/status-panel-ux-v1.md
//
// 成長条件・なつき・ストレスは数値やメーターにしない。

import {
  PET_STAGE_GLYPHS,
  PET_STAGE_LABELS,
  PET_TRAIT_LABELS,
  PET_TRAIT_ORDER,
} from './jc-constants.js';
import type { JCPet } from './pet-state.js';
import { jcGetPetDayCount, jcGetPetNextStage } from './pet-state.js';
import { currentPetVoice } from './pet-voice-state.js';

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

export interface PetStatusPanelProps {
  pet: JCPet;
  position: { x: number; y: number };
  onClose: () => void;
}

export function PetStatusPanel({ pet, position, onClose }: PetStatusPanelProps) {
  const next = jcGetPetNextStage(pet);
  const dayCount = jcGetPetDayCount(pet);
  const firstVoice = currentPetVoice(pet.firstVoice);
  const interests = PET_TRAIT_ORDER.filter((key) => (pet.traits[key] ?? 0) > 0);

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
          <div style={{ color: ACCENT_TEXT }}>{birthdayLabel(pet.bornAt)}</div>
          {pet.bornAt && (
            <div style={{ color: MUTED_TEXT, fontSize: '12px', marginTop: 4 }}>
              生まれて {dayCount}日
            </div>
          )}
        </Card>

        <Card title="成長のようす">
          <div style={{ lineHeight: 1.6 }}>
            {next === null
              ? 'これからも、いっしょに。'
              : next.met
                ? 'つぎの朝のあいさつを、楽しみに。'
                : '日々を重ねて、少しずつ育っています。'}
          </div>
        </Card>

        <Card title="とくいなこと">
          <div style={{ color: BODY_TEXT, fontSize: '12px', lineHeight: 1.6 }}>
            {interests.length
              ? interests.map((key) => PET_TRAIT_LABELS[key]).join('・')
              : 'いっしょに、好きなことを見つけていこう。'}
          </div>
        </Card>

        {firstVoice && (
          <Card title="きょうの第一声">
            <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.6 }}>
              {firstVoice.text}
            </div>
          </Card>
        )}

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
