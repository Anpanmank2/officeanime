// ── Just Curious Virtual Office — Agent Dashboard Panel ──────────
// Right-side slide-in panel (280px) showing all member states.
// Groups by department, present-only filter by default.
// [PHASE-B] Add statistics tab switching here.

import { useMemo, useState } from 'react';

import { DashboardMemberCard } from './DashboardMemberCard.js';
import { DEPT_COLORS, DEPT_LABELS } from './jc-constants.js';
import { jcGetDashboardMembers } from './jc-state.js';
import { useDashboardTimer } from './useDashboardTimer.js';

interface AgentDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEPT_ORDER = ['engineering', 'marketing', 'research', 'exec'];

export function AgentDashboard({ isOpen, onClose }: AgentDashboardProps) {
  const [presentOnly, setPresentOnly] = useState(true);
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set());

  const now = useDashboardTimer(isOpen);

  const allMembers = useMemo(() => jcGetDashboardMembers(), [now]);

  const filteredMembers = useMemo(
    () => (presentOnly ? allMembers.filter((m) => m.isPresent) : allMembers),
    [allMembers, presentOnly],
  );

  const onlineCount = useMemo(() => allMembers.filter((m) => m.isPresent).length, [allMembers]);

  // Group by department in DEPT_ORDER
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filteredMembers>();
    for (const dept of DEPT_ORDER) {
      map.set(dept, []);
    }
    for (const member of filteredMembers) {
      const list = map.get(member.department);
      if (list) list.push(member);
      else {
        // Unknown department — add dynamically
        if (!map.has(member.department)) map.set(member.department, []);
        map.get(member.department)!.push(member);
      }
    }
    return map;
  }, [filteredMembers]);

  const toggleDept = (dept: string) => {
    setCollapsedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: 280,
        height: '100%',
        background: 'var(--pixel-bg)',
        border: '2px solid var(--pixel-border)',
        borderRight: 'none',
        borderRadius: 0,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 'var(--pixel-controls-z)',
        boxShadow: '-4px 0 16px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 8px',
          borderBottom: '2px solid var(--pixel-border)',
          background: 'rgba(0,180,255,0.06)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: '20px',
            color: '#00f0ff',
            letterSpacing: '1px',
          }}
        >
          AGENT DASHBOARD
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--pixel-text-dim)',
            cursor: 'pointer',
            fontSize: '20px',
            padding: '2px 4px',
          }}
          title="Close dashboard"
        >
          ×
        </button>
      </div>

      {/* Summary bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 8px',
          borderBottom: '1px solid var(--pixel-border)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: '18px', color: 'rgba(200,210,240,0.7)' }}>
          {`${onlineCount} / ${allMembers.length} Online`}
        </span>
        <button
          onClick={() => setPresentOnly((v) => !v)}
          style={{
            background: presentOnly ? 'rgba(0,180,255,0.2)' : 'transparent',
            border: `1px solid ${presentOnly ? 'rgba(0,240,255,0.5)' : 'rgba(100,140,255,0.2)'}`,
            borderRadius: 0,
            color: presentOnly ? '#00f0ff' : 'var(--pixel-text-dim)',
            cursor: 'pointer',
            fontSize: '16px',
            padding: '2px 6px',
          }}
          title={presentOnly ? 'Show all members' : 'Show present only'}
        >
          {presentOnly ? 'Present' : 'All'}
        </button>
      </div>

      {/* Scrollable member list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {DEPT_ORDER.map((dept) => {
          const members = grouped.get(dept) ?? [];
          if (members.length === 0) return null;

          const deptColor = DEPT_COLORS[dept] ?? '#888888';
          const deptLabel = DEPT_LABELS[dept] ?? dept.toUpperCase();
          const isCollapsed = collapsedDepts.has(dept);
          const presentInDept = members.filter((m) => m.isPresent).length;

          return (
            <div key={dept}>
              {/* Department header */}
              <button
                onClick={() => toggleDept(dept)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  width: '100%',
                  padding: '4px 8px',
                  background: 'rgba(255,255,255,0.03)',
                  border: 'none',
                  borderBottom: `1px solid rgba(255,255,255,0.05)`,
                  borderLeft: `2px solid ${deptColor}`,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: '14px', color: 'rgba(200,210,240,0.5)' }}>
                  {isCollapsed ? '▶' : '▼'}
                </span>
                <span
                  style={{
                    fontSize: '18px',
                    color: deptColor,
                    letterSpacing: '0.5px',
                    flex: 1,
                  }}
                >
                  {deptLabel}
                </span>
                <span style={{ fontSize: '16px', color: 'rgba(200,210,240,0.4)' }}>
                  {presentOnly ? members.length : `${presentInDept}/${members.length}`}
                </span>
              </button>

              {/* Member cards */}
              {!isCollapsed &&
                members.map((member) => (
                  <DashboardMemberCard key={member.memberId} member={member} now={now} />
                ))}
            </div>
          );
        })}

        {/* Empty state */}
        {filteredMembers.length === 0 && (
          <div
            style={{
              padding: '20px 8px',
              textAlign: 'center',
              fontSize: '18px',
              color: 'var(--pixel-text-dim)',
            }}
          >
            {presentOnly ? 'No members online' : 'No members found'}
          </div>
        )}
      </div>

      {/* [PHASE-B] Statistics tab footer */}
    </div>
  );
}
