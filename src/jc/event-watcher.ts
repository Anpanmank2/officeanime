// ── Just Curious Virtual Office — Event Queue Watcher ────────────
// Watches a JSON event file for office events from Claude Code.
// Events drive character arrivals, departures, state changes, and speech bubbles.

import * as fs from 'fs';
import * as path from 'path';
import type * as vscode from 'vscode';

import { getDeskByMemberId } from './desk-registry.js';
import type {
  CrossDeptMessageEvent,
  JCConfig,
  OfficeEvent,
  OfficeEventsFile,
  ReviewCompletedEvent,
  ReviewRequestedEvent,
  SpeechBubble,
  TaskAssignedEvent,
  TaskCompletedEvent,
  TaskReceivedEvent,
  WorkStartedEvent,
} from './types.js';

const EVENT_FILE_NAME = 'jc-events.json';
const POLL_INTERVAL_MS = 2000;

export class EventWatcher {
  private config: JCConfig;
  private workspaceRoot: string;
  private webview: vscode.Webview | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastProcessedIndex = 0;
  private fsWatcher: fs.FSWatcher | null = null;

  constructor(config: JCConfig, workspaceRoot: string) {
    this.config = config;
    this.workspaceRoot = workspaceRoot;
  }

  /** Start watching for events */
  start(webview: vscode.Webview): void {
    this.webview = webview;
    const eventFilePath = this.getEventFilePath();

    // Try fs.watch first
    try {
      if (fs.existsSync(eventFilePath)) {
        this.fsWatcher = fs.watch(eventFilePath, () => this.processEvents());
      }
    } catch {
      // fs.watch may not work on all platforms
    }

    // Polling backup
    this.pollTimer = setInterval(() => this.processEvents(), POLL_INTERVAL_MS);

    // Initial read
    this.processEvents();
    console.log(`[JC-Events] Watching ${eventFilePath}`);
  }

  /** Stop watching */
  dispose(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.fsWatcher) {
      this.fsWatcher.close();
      this.fsWatcher = null;
    }
    this.webview = null;
  }

  /** Write an event to the event file (for programmatic event emission) */
  emitEvent(event: OfficeEvent): void {
    const eventFilePath = this.getEventFilePath();
    let file: OfficeEventsFile;

    try {
      if (fs.existsSync(eventFilePath)) {
        const raw = fs.readFileSync(eventFilePath, 'utf-8');
        file = JSON.parse(raw) as OfficeEventsFile;
      } else {
        file = { version: 1, events: [] };
      }
    } catch {
      file = { version: 1, events: [] };
    }

    file.events.push(event);

    try {
      const tmpPath = eventFilePath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(file, null, 2), 'utf-8');
      fs.renameSync(tmpPath, eventFilePath);
    } catch (err) {
      console.error('[JC-Events] Failed to write event:', err);
    }
  }

  private getEventFilePath(): string {
    return path.join(this.workspaceRoot, EVENT_FILE_NAME);
  }

  private processEvents(): void {
    if (!this.webview) return;

    const eventFilePath = this.getEventFilePath();
    if (!fs.existsSync(eventFilePath)) return;

    let file: OfficeEventsFile;
    try {
      const raw = fs.readFileSync(eventFilePath, 'utf-8');
      file = JSON.parse(raw) as OfficeEventsFile;
    } catch {
      return; // File might be mid-write
    }

    if (!file.events || file.events.length <= this.lastProcessedIndex) return;

    // Process new events
    const newEvents = file.events.slice(this.lastProcessedIndex);
    this.lastProcessedIndex = file.events.length;

    for (const event of newEvents) {
      this.handleEvent(event);
    }
  }

  private handleEvent(event: OfficeEvent): void {
    if (!this.webview) return;

    switch (event.event) {
      case 'task_received':
        this.handleTaskReceived(event as TaskReceivedEvent);
        break;
      case 'task_assigned':
        this.handleTaskAssigned(event as TaskAssignedEvent);
        break;
      case 'cross_dept_message':
        this.handleCrossDeptMessage(event as CrossDeptMessageEvent);
        break;
      case 'work_started':
        this.handleWorkStarted(event as WorkStartedEvent);
        break;
      case 'review_requested':
        this.handleReviewRequested(event as ReviewRequestedEvent);
        break;
      case 'review_completed':
        this.handleReviewCompleted(event as ReviewCompletedEvent);
        break;
      case 'task_completed':
        this.handleTaskCompleted(event as TaskCompletedEvent);
        break;
      case 'agent_leave':
        this.handleAgentLeave(event);
        break;
      default:
        // Forward raw event to webview
        this.webview.postMessage({ type: 'jcOfficeEvent', event });
    }
  }

  private handleTaskReceived(event: TaskReceivedEvent): void {
    // CEO receives task — show speech bubble on CEO
    const ceo = this.config.members.find((m) => m.role === 'CEO');
    if (ceo) {
      const bubble: SpeechBubble = {
        id: `task-recv-${Date.now()}`,
        memberId: ceo.id,
        text: `受領: ${event.task.slice(0, 20)}`,
        department: 'exec',
        timestamp: Date.now(),
        duration: 3000,
      };
      this.webview!.postMessage({ type: 'jcSpeechBubble', bubble });
    }
  }

  private handleTaskAssigned(event: TaskAssignedEvent): void {
    // Arrive assigned members and show speech bubbles
    for (const memberId of event.to) {
      const member = this.config.members.find((m) => m.id === memberId);
      const desk = getDeskByMemberId(memberId);
      if (member && desk) {
        // Trigger arrival
        this.webview!.postMessage({
          type: 'jcMemberArriving',
          agentId: -200 - Math.floor(Math.random() * 1000),
          memberId,
          deskId: desk.deskId,
          seatUid: desk.deskId,
          hueShift: member.hueShift,
          palette: member.palette ?? 0,
        });

        // Speech bubble on assignee
        const bubble: SpeechBubble = {
          id: `assign-${memberId}-${Date.now()}`,
          memberId,
          text: '了解しました！',
          department: member.department,
          timestamp: Date.now() + 1500, // delayed to show after arrival
          duration: 3000,
        };
        this.webview!.postMessage({ type: 'jcSpeechBubble', bubble });
      }
    }

    // Speech bubble on assigner
    const from = this.config.members.find((m) => m.id === event.from);
    if (from) {
      const bubble: SpeechBubble = {
        id: `assign-from-${Date.now()}`,
        memberId: event.from,
        text: `${event.task.slice(0, 15)}をお願い`,
        department: from.department,
        timestamp: Date.now(),
        duration: 3000,
      };
      this.webview!.postMessage({ type: 'jcSpeechBubble', bubble });
    }
  }

  private handleCrossDeptMessage(event: CrossDeptMessageEvent): void {
    // Speech bubble on sender
    const from = this.config.members.find((m) => m.id === event.from);
    if (from) {
      const bubble: SpeechBubble = {
        id: `msg-from-${Date.now()}`,
        memberId: event.from,
        text: event.message.slice(0, 25),
        department: event.from_dept,
        timestamp: Date.now(),
        duration: 3000,
      };
      this.webview!.postMessage({ type: 'jcSpeechBubble', bubble });
    }

    // Trigger liaison beam
    this.webview!.postMessage({
      type: 'jcLiaison',
      fromMemberId: event.from,
      toMemberId: event.to,
    });
  }

  private handleWorkStarted(event: WorkStartedEvent): void {
    const member = this.config.members.find((m) => m.id === event.agent);
    if (member) {
      this.webview!.postMessage({
        type: 'jcMemberStateChange',
        agentId: -200 - Math.floor(Math.random() * 1000),
        memberId: event.agent,
        jcState: 'coding',
      });
      const bubble: SpeechBubble = {
        id: `work-${event.agent}-${Date.now()}`,
        memberId: event.agent,
        text: event.task.slice(0, 20) + '...',
        department: member.department,
        timestamp: Date.now(),
        duration: 3000,
      };
      this.webview!.postMessage({ type: 'jcSpeechBubble', bubble });
    }
  }

  private handleReviewRequested(event: ReviewRequestedEvent): void {
    this.webview!.postMessage({
      type: 'jcMemberStateChange',
      agentId: -200 - Math.floor(Math.random() * 1000),
      memberId: event.to,
      jcState: 'reviewing',
    });
    const from = this.config.members.find((m) => m.id === event.from);
    if (from) {
      const bubble: SpeechBubble = {
        id: `review-req-${Date.now()}`,
        memberId: event.from,
        text: 'レビューお願いします',
        department: from.department,
        timestamp: Date.now(),
        duration: 3000,
      };
      this.webview!.postMessage({ type: 'jcSpeechBubble', bubble });
    }
    this.webview!.postMessage({
      type: 'jcLiaison',
      fromMemberId: event.from,
      toMemberId: event.to,
    });
  }

  private handleReviewCompleted(event: ReviewCompletedEvent): void {
    this.webview!.postMessage({
      type: 'jcMemberStateChange',
      agentId: -200 - Math.floor(Math.random() * 1000),
      memberId: event.to,
      jcState: 'coding',
    });
    const reviewer = this.config.members.find((m) => m.id === event.from);
    if (reviewer) {
      const bubble: SpeechBubble = {
        id: `review-done-${Date.now()}`,
        memberId: event.from,
        text: event.approved ? 'LGTM! 👍' : '修正お願いします 📝',
        department: reviewer.department,
        timestamp: Date.now(),
        duration: 3000,
      };
      this.webview!.postMessage({ type: 'jcSpeechBubble', bubble });
    }
  }

  private handleTaskCompleted(event: TaskCompletedEvent): void {
    const member = this.config.members.find((m) => m.id === event.agent);
    if (member) {
      // Show completion bubble
      const bubble: SpeechBubble = {
        id: `done-${event.agent}-${Date.now()}`,
        memberId: event.agent,
        text: '完了しました！✅',
        department: member.department,
        timestamp: Date.now(),
        duration: 3000,
      };
      this.webview!.postMessage({ type: 'jcSpeechBubble', bubble });

      // Set state to idle (will trigger break mode)
      this.webview!.postMessage({
        type: 'jcMemberStateChange',
        agentId: -200 - Math.floor(Math.random() * 1000),
        memberId: event.agent,
        jcState: 'idle',
      });
    }
  }

  private handleAgentLeave(event: OfficeEvent): void {
    const agentEvent = event as { agent: string; event: string };
    const memberId = agentEvent.agent;
    this.webview!.postMessage({
      type: 'jcMemberLeaving',
      agentId: -200 - Math.floor(Math.random() * 1000),
      memberId,
    });
  }
}
