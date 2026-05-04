// ── Command Center — Bottom panel (toggle) ─────────────────────
// Left: TaskQueue, Right: NewTaskInput

import { useEffect, useState } from 'react';

import { jcGetAllTasks, subscribeTasks } from './jc-state.js';
import type { TaskDefinition } from './jc-types.js';
import { NewTaskInput } from './NewTaskInput.js';
import { TaskQueue } from './TaskQueue.js';

export function CommandCenter({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [tasks, setTasks] = useState<TaskDefinition[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    const update = () => setTasks(jcGetAllTasks());
    update();
    return subscribeTasks(update);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 260,
        background: 'rgba(8, 10, 25, 0.95)',
        borderTop: '2px solid rgba(255, 61, 61, 0.4)',
        zIndex: 50,
        display: 'flex',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 32,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 12px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <span style={{ fontSize: '16px', color: '#ff3d3d', fontWeight: 'bold' }}>
          COMMAND CENTER
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--pixel-close-text)',
            fontSize: '18px',
            cursor: 'pointer',
          }}
        >
          X
        </button>
      </div>

      {/* Content area */}
      <div style={{ display: 'flex', flex: 1, marginTop: 32 }}>
        {/* Left: Task Queue */}
        <div
          style={{
            flex: 1,
            borderRight: '1px solid rgba(255,255,255,0.1)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '6px 12px',
              fontSize: '14px',
              color: 'var(--pixel-text-dim)',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            TASK QUEUE (
            {tasks.filter((t) => t.status === 'pending' || t.status === 'running').length})
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <TaskQueue tasks={tasks} />
          </div>
        </div>

        {/* Right: New Task Input */}
        <div style={{ width: 320, display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              padding: '6px 12px',
              fontSize: '14px',
              color: 'var(--pixel-text-dim)',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            NEW TASK
          </div>
          <div style={{ flex: 1, padding: '8px 12px' }}>
            <NewTaskInput />
          </div>
        </div>
      </div>
    </div>
  );
}
