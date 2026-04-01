import { useCallback, useEffect, useRef, useState } from 'react';

import { vscode } from '../vscodeApi.js';
import type { TaskDefinition, TaskStatus } from './jc-types.js';

interface KanbanPanelProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: TaskDefinition[];
  memberNames: Map<string, string>;
}

const COLUMNS: Array<{ status: TaskStatus; label: string; color: string }> = [
  { status: 'pending', label: 'Pending', color: '#f0ad4e' },
  { status: 'running', label: 'Running', color: '#3fb950' },
  { status: 'done', label: 'Done', color: '#58a6ff' },
  { status: 'error', label: 'Error', color: '#ff4444' },
];

const PRIORITY_COLORS: Record<number, string> = {
  1: '#ff4444',
  2: '#f0ad4e',
  3: '#58a6ff',
};

const PRIORITY_LABELS: Record<number, string> = {
  1: 'P1',
  2: 'P2',
  3: 'P3',
};

export function KanbanPanel({ isOpen, onClose, tasks, memberNames }: KanbanPanelProps) {
  const [draggedTask, setDraggedTask] = useState<TaskDefinition | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const handleDragStart = useCallback((e: React.DragEvent, task: TaskDefinition) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, columnStatus: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(columnStatus);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetStatus: string) => {
      e.preventDefault();
      setDropTarget(null);
      if (!draggedTask) return;

      if (draggedTask.status !== targetStatus) {
        // Change task status
        if (targetStatus === 'pending' || targetStatus === 'running') {
          vscode.postMessage({
            type: 'task:prioritize',
            taskId: draggedTask.id,
            newStatus: targetStatus,
          });
        } else if (targetStatus === 'done') {
          vscode.postMessage({
            type: 'task:cancel',
            taskId: draggedTask.id,
          });
        }
      }
      setDraggedTask(null);
    },
    [draggedTask],
  );

  const handleReassign = useCallback((taskId: string, newAssignee: string) => {
    vscode.postMessage({
      type: 'task:reassign',
      taskId,
      newAssignee,
    });
  }, []);

  if (!isOpen) return null;

  const tasksByStatus = new Map<string, TaskDefinition[]>();
  for (const col of COLUMNS) {
    tasksByStatus.set(col.status, []);
  }
  for (const task of tasks) {
    const list = tasksByStatus.get(task.status);
    if (list) {
      list.push(task);
    }
  }

  return (
    <div
      ref={panelRef}
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 360,
        background: 'var(--pixel-bg, #0d1117)',
        borderLeft: '2px solid var(--pixel-border, #30363d)',
        boxShadow: '-4px 0 8px rgba(0, 0, 0, 0.4)',
        zIndex: 80,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        pointerEvents: 'auto',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 10px',
          borderBottom: '2px solid var(--pixel-border, #30363d)',
          background: 'rgba(255, 255, 255, 0.03)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff', letterSpacing: '1px' }}>
          TASK BOARD
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--pixel-text-dim, #8b949e)',
            cursor: 'pointer',
            fontSize: '20px',
            padding: '0 4px',
          }}
        >
          X
        </button>
      </div>

      {/* Columns (vertical stack for side panel) */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '6px',
        }}
      >
        {COLUMNS.map((col) => {
          const colTasks = tasksByStatus.get(col.status) ?? [];
          const isDropping = dropTarget === col.status;
          return (
            <div
              key={col.status}
              onDragOver={(e) => handleDragOver(e, col.status)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.status)}
              style={{
                marginBottom: 8,
                border: `1px solid ${isDropping ? col.color : 'var(--pixel-border, #30363d)'}`,
                background: isDropping ? `${col.color}11` : 'rgba(255, 255, 255, 0.02)',
                transition: 'border-color 150ms, background 150ms',
              }}
            >
              {/* Column header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 8px',
                  borderBottom: `1px solid ${col.color}44`,
                  background: `${col.color}15`,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: col.color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: '16px', color: col.color, fontWeight: 'bold' }}>
                  {col.label}
                </span>
                <span
                  style={{
                    fontSize: '14px',
                    color: 'var(--pixel-text-dim)',
                    marginLeft: 'auto',
                  }}
                >
                  {colTasks.length}
                </span>
              </div>

              {/* Task cards */}
              <div style={{ padding: 4, minHeight: 24 }}>
                {colTasks.length === 0 && (
                  <div
                    style={{
                      fontSize: '14px',
                      color: 'var(--pixel-text-dim)',
                      padding: '4px 4px',
                      textAlign: 'center',
                    }}
                  >
                    No tasks
                  </div>
                )}
                {colTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    memberName={memberNames.get(task.assignee) ?? task.assignee}
                    isDragging={draggedTask?.id === task.id}
                    onDragStart={handleDragStart}
                    onReassign={handleReassign}
                    allMembers={memberNames}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface TaskCardProps {
  task: TaskDefinition;
  memberName: string;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, task: TaskDefinition) => void;
  onReassign: (taskId: string, newAssignee: string) => void;
  allMembers: Map<string, string>;
}

function TaskCard({
  task,
  memberName,
  isDragging,
  onDragStart,
  onReassign,
  allMembers,
}: TaskCardProps) {
  const [showReassign, setShowReassign] = useState(false);
  const priorityColor = PRIORITY_COLORS[task.priority] ?? '#8b949e';
  const priorityLabel = PRIORITY_LABELS[task.priority] ?? `P${task.priority}`;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      style={{
        padding: '4px 6px',
        marginBottom: 3,
        background: isDragging ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        cursor: 'grab',
        opacity: isDragging ? 0.5 : 1,
        fontSize: '15px',
      }}
    >
      {/* Top row: priority + prompt */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
        <span
          style={{
            fontSize: '12px',
            color: priorityColor,
            background: `${priorityColor}22`,
            border: `1px solid ${priorityColor}44`,
            padding: '0 3px',
            flexShrink: 0,
            lineHeight: '16px',
          }}
        >
          {priorityLabel}
        </span>
        <span
          style={{
            color: '#c9d1d9',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {task.prompt.length > 40 ? task.prompt.slice(0, 40) + '...' : task.prompt}
        </span>
      </div>
      {/* Bottom row: assignee + reassign */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 2,
        }}
      >
        <span style={{ fontSize: '13px', color: 'var(--pixel-text-dim)' }}>{memberName}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowReassign(!showReassign);
          }}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--pixel-text-dim)',
            cursor: 'pointer',
            fontSize: '12px',
            padding: '0 2px',
          }}
        >
          R
        </button>
      </div>
      {/* Reassign dropdown */}
      {showReassign && (
        <div
          style={{
            marginTop: 3,
            borderTop: '1px solid rgba(255,255,255,0.08)',
            paddingTop: 3,
          }}
        >
          {[...allMembers.entries()]
            .filter(([id]) => id !== task.assignee)
            .slice(0, 8)
            .map(([id, name]) => (
              <button
                key={id}
                onClick={() => {
                  onReassign(task.id, id);
                  setShowReassign(false);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '2px 4px',
                  fontSize: '13px',
                  color: 'var(--pixel-text)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: 0,
                }}
              >
                {name}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
