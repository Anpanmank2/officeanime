// ── Just Curious Virtual Office — Dashboard Member Card ──────────
// Individual agent card for the Agent Dashboard panel.
// React.memo to prevent re-renders when sibling cards update.

import { memo } from 'react';

import type { DashboardMember } from './jc-state.js';
import { formatElapsed } from './useDashboardTimer.js';

interface DashboardMemberCardProps {
  member: DashboardMember;
  now: number;
}

function DashboardMemberCardInner({ member, now }: DashboardMemberCardProps) {
  const elapsed = formatElapsed(now - member.stateSince);
  const hasChildren = member.childMemberIds.length > 0;
  const isSubAgent = member.parentMemberId !== null;

  return (
    <div
      style={{
        padding: '5px 7px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        opacity: member.isPresent ? 1 : 0.4,
        background: isSubAgent ? 'rgba(0,180,255,0.04)' : 'transparent',
      }}
    >
      {/* Header row: state dot + name + sub-agent indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {/* State dot */}
        <div
          style={{
            width: 7,
            height: 7,
            background: member.stateColor,
            flexShrink: 0,
            boxShadow: `0 0 4px ${member.stateColor}`,
          }}
        />
        {/* Sub-agent indent indicator */}
        {isSubAgent && (
          <div
            style={{
              fontSize: '14px',
              color: 'rgba(0,180,255,0.6)',
              flexShrink: 0,
            }}
          >
            {'└'}
          </div>
        )}
        {/* Name */}
        <div
          style={{
            fontSize: '20px',
            color: 'var(--pixel-text)',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {member.nameEn}
        </div>
        {/* Sub-agent children count */}
        {hasChildren && (
          <div
            style={{
              fontSize: '14px',
              color: 'rgba(0,180,255,0.7)',
              flexShrink: 0,
            }}
            title={`${member.childMemberIds.length} sub-agent(s) active`}
          >
            {/* [PHASE-B] show child count badge */}
            {`+${member.childMemberIds.length}`}
          </div>
        )}
      </div>

      {/* State + elapsed time row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          marginTop: 2,
          paddingLeft: 12,
        }}
      >
        <span
          style={{
            fontSize: '16px',
            color: member.stateColor,
            opacity: 0.9,
          }}
        >
          {member.state}
        </span>
        <span style={{ fontSize: '14px', color: 'rgba(200,210,240,0.4)' }}>{elapsed}</span>
      </div>

      {/* Task summary row */}
      {member.currentTask && (
        <div
          style={{
            marginTop: 2,
            paddingLeft: 12,
            fontSize: '16px',
            color: 'rgba(200,210,240,0.55)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={member.currentTask}
        >
          {`"${member.currentTask}"`}
        </div>
      )}
    </div>
  );
}

export const DashboardMemberCard = memo(DashboardMemberCardInner);
