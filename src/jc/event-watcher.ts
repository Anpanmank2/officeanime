// ── Just Curious Virtual Office — Event Queue Watcher ────────────
// Watches a JSON event file for office events from Claude Code.
// Events drive character arrivals, departures, state changes, and speech bubbles.

import * as fs from 'fs';
import * as path from 'path';
import type * as vscode from 'vscode';

import { type AffinityResult, computeFit } from './affinity.js';
import { scoreGain, TIER_GLYPH } from './affinity-constants.js';
import { getDeskByMemberId } from './desk-registry.js';
import { completionLine, reactionLine, thoughtLine } from './persona-lines.js';
import type {
  CrossDeptMessageEvent,
  DelegateEvent,
  DelegationCompleteEvent,
  JCConfig,
  OfficeEvent,
  OfficeEventsFile,
  ProgressCheckEvent,
  ReviewCompletedEvent,
  ReviewRequestedEvent,
  RoleEscalateEvent,
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

  // ── Slice1 game state (DEV-SPEC §5) ──
  /** Affinity per member, fixed at delegate time, held until task_completed. */
  private memberAffinity = new Map<string, AffinityResult & { priority: number }>();
  /** Company score accumulator (core layer — volatile, no persistent store). */
  private companyScore = 0;
  private dailyDate = '';
  private dailyCount = 0;

  // ── Living-loop: persona thought bubbles while working ──
  /** Members currently working → their tier/dept/tick, drives periodic thoughts. */
  private activeWork = new Map<
    string,
    { tier: AffinityResult['tier']; department: string; tick: number }
  >();
  private thoughtTimer: ReturnType<typeof setInterval> | null = null;
  /** Interval between persona working-thought bubbles (ms). */
  private static readonly THOUGHT_INTERVAL_MS = 12000;

  constructor(config: JCConfig, workspaceRoot: string) {
    this.config = config;
    this.workspaceRoot = workspaceRoot;
  }

  /** Start watching for events */
  start(webview: vscode.Webview): void {
    this.webview = webview;
    const eventFilePath = this.getEventFilePath();

    // Ensure the event file exists so /company skill can append to it
    if (!fs.existsSync(eventFilePath)) {
      try {
        fs.writeFileSync(
          eventFilePath,
          JSON.stringify({ version: 1, events: [] }, null, 2),
          'utf-8',
        );
        console.log(`[JC-Events] Created empty event file: ${eventFilePath}`);
      } catch (err) {
        console.warn(`[JC-Events] Could not create event file: ${err}`);
      }
    }

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

    // Living-loop: periodic persona thought bubbles for members at work.
    this.thoughtTimer = setInterval(
      () => this.emitWorkingThoughts(),
      EventWatcher.THOUGHT_INTERVAL_MS,
    );

    // 部署カルテ (2026-07-03 藤井 §3): webview (再)接続時に履歴を全量 sync。
    // lastProcessedIndex は再接続で戻らないため、jcHistoryEvent の逐次 push だけだと
    // reload した webview の集計が空になる。bulk は store 側で冪等 (dedupe)。
    try {
      const raw = fs.readFileSync(eventFilePath, 'utf-8');
      const file = JSON.parse(raw) as OfficeEventsFile;
      if (Array.isArray(file.events)) {
        this.webview.postMessage({ type: 'jcEventHistory', events: file.events });
      }
    } catch {
      // ファイル無し/mid-write — 逐次 push に任せる
    }

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
    if (this.thoughtTimer) {
      clearInterval(this.thoughtTimer);
      this.thoughtTimer = null;
    }
    if (this.fsWatcher) {
      this.fsWatcher.close();
      this.fsWatcher = null;
    }
    this.webview = null;
  }

  /**
   * Living-loop: every member currently at work surfaces a persona-flavored
   * thought ("このデータ面白いな" / "あと少し…"). Deterministic per (member,
   * tick) so replays are reproducible. Skipped when nobody is working.
   */
  private emitWorkingThoughts(): void {
    if (!this.webview || this.activeWork.size === 0) return;
    for (const [memberId, w] of this.activeWork) {
      w.tick += 1;
      const text = thoughtLine(memberId, w.department, w.tick);
      if (!text) continue;
      const bubble: SpeechBubble = {
        id: `think-${memberId}-${Date.now()}`,
        memberId,
        text,
        department: w.department,
        timestamp: Date.now(),
        duration: 3000,
      };
      this.webview.postMessage({ type: 'jcSpeechBubble', bubble });
    }
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
      // ── R6 防御 (2026-07-03 差戻しv2): jc-events.json は複数 writer がいる。
      // 1 つの malformed イベント (message 欠落等) がプロセスを殺さないよう
      // per-event で隔離する。壊れたイベントは skip して次へ進む。
      try {
        this.handleEvent(event);
      } catch (err) {
        console.error('[JC-Events] handleEvent error — event skipped:', err);
      }
    }
  }

  private handleEvent(event: OfficeEvent): void {
    if (!this.webview) return;

    // ── 部署カルテ (2026-07-03 藤井 §3): 生イベントを webview の karte store へ
    // 逐次 push する。演出メッセージと違い、集計用の履歴なので全種別を転送。
    // (接続後クライアント向け。接続前の全量は client-init の jcEventHistory が担う)
    this.webview.postMessage({ type: 'jcHistoryEvent', event });

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
      case 'role_escalate':
        this.handleRoleEscalate(event as RoleEscalateEvent);
        break;
      case 'delegate':
        this.handleDelegate(event as DelegateEvent);
        break;
      case 'delegation_complete':
        this.handleDelegationComplete(event as DelegationCompleteEvent);
        break;
      case 'progress_check':
        this.handleProgressCheck(event as ProgressCheckEvent);
        break;
      default:
        // Forward raw event to webview
        this.webview.postMessage({ type: 'jcOfficeEvent', event });
    }
  }

  private handleTaskReceived(event: TaskReceivedEvent): void {
    // Secretary receives task — show speech bubble on Secretary
    // R6 防御: task 欠落 (malformed writer) でも落とさない — 空文字 fallback。
    const taskText = event.task ?? '';
    const secretary = this.config.members.find((m) => m.role === 'Secretary');
    if (secretary) {
      const bubble: SpeechBubble = {
        id: `task-recv-${Date.now()}`,
        memberId: secretary.id,
        text: `受領: ${taskText.slice(0, 20)}`,
        fullText: `受領: ${taskText}`,
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
    // R6 防御: task 欠落 (malformed writer) でも落とさない — 空文字 fallback。
    const assignTaskText = event.task ?? '';
    const from = this.config.members.find((m) => m.id === event.from);
    if (from) {
      const bubble: SpeechBubble = {
        id: `assign-from-${Date.now()}`,
        memberId: event.from,
        text: `${assignTaskText.slice(0, 15)}をお願い`,
        fullText: `${assignTaskText}をお願い`,
        department: from.department,
        timestamp: Date.now(),
        duration: 3000,
      };
      this.webview!.postMessage({ type: 'jcSpeechBubble', bubble });
    }
  }

  private handleCrossDeptMessage(event: CrossDeptMessageEvent): void {
    // Speech bubble on sender
    // R6 防御: message 欠落 (malformed writer) でも落とさない — 空文字 fallback。
    const msgText = event.message ?? '';
    const from = this.config.members.find((m) => m.id === event.from);
    if (from && msgText) {
      const bubble: SpeechBubble = {
        id: `msg-from-${Date.now()}`,
        memberId: event.from,
        text: msgText.slice(0, 25),
        fullText: msgText,
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

  /** Parse a P0..P4 hint from delegate text; default P3. */
  private priorityFromEvent(event: DelegateEvent): number {
    const text = `${event.message ?? ''} ${event.task ?? ''}`;
    const m = text.match(/\bP([0-4])\b/);
    return m ? Number(m[1]) : 3;
  }

  private handleWorkStarted(event: WorkStartedEvent): void {
    // Producer (jc-emit.mjs) emits the actor in `from`; consumer historically
    // read `agent`. Accept either so emitter/consumer field names stay in sync.
    const actorId = event.agent ?? event.from;
    const member = this.config.members.find((m) => m.id === actorId);
    if (member && actorId) {
      this.webview!.postMessage({
        type: 'jcMemberStateChange',
        agentId: -200 - Math.floor(Math.random() * 1000),
        memberId: actorId,
        jcState: 'coding',
      });

      // ── Slice1: start quality gauge at the member's affinity speed ──
      // If no delegate preceded (actor emitted work_started directly), compute
      // affinity from the task text now so the gauge still reflects fit.
      let affinity = this.memberAffinity.get(actorId);
      if (!affinity) {
        const a = computeFit(
          { prompt: event.task ?? '', assignee: actorId },
          actorId,
          this.config,
          this.workspaceRoot,
        );
        affinity = { ...a, priority: 3 };
        this.memberAffinity.set(actorId, affinity);
        this.webview!.postMessage({
          type: 'jcFitBadge',
          memberId: actorId,
          tier: a.tier,
          fit: a.fit,
          label: a.label,
        });
      }

      // ── Living-loop: persona reaction the instant work starts (◎/△/✗). ──
      // ◎ →「よし、任せろ！」系 / ✗ →「うーん畑違いだけど…」系。Persona-fit,
      // pulled from the member's real voice (or dept×tier archetype).
      const react = reactionLine(actorId, member.department, affinity.tier, Date.now());
      const bubble: SpeechBubble = {
        id: `work-${actorId}-${Date.now()}`,
        memberId: actorId,
        text: react || (event.task ?? '').slice(0, 20) + '...',
        fullText: react || (event.task ?? ''),
        department: member.department,
        timestamp: Date.now(),
        duration: 3000,
      };
      this.webview!.postMessage({ type: 'jcSpeechBubble', bubble });

      // Register as "at work" so periodic persona thoughts fire while running.
      this.activeWork.set(actorId, {
        tier: affinity.tier,
        department: member.department,
        tick: 0,
      });

      this.webview!.postMessage({
        type: 'jcGaugeStart',
        memberId: actorId,
        tier: affinity.tier,
      });
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
    // Producer (jc-emit.mjs) emits the actor in `from`; consumer historically
    // read `agent`. Accept either so emitter/consumer field names stay in sync.
    const actorId = event.agent ?? event.from;
    const member = this.config.members.find((m) => m.id === actorId);
    if (member && actorId) {
      // No longer at work → stop periodic thoughts for this member.
      this.activeWork.delete(actorId);

      const affinity = this.memberAffinity.get(actorId);
      const tier = affinity?.tier ?? 'ok';
      const priority = affinity?.priority ?? 3;

      // ── Living-loop: CLEAR completion reaction ("できた！" + 成果の一言). ──
      // Persona-flavored, affinity-weighted so ◎ finishes proud / ✗ finishes
      // "本領は別で". Prefixed with できた！ so "終わったか" is never ambiguous.
      const result = completionLine(actorId, member.department, tier, Date.now());
      const bubble: SpeechBubble = {
        id: `done-${actorId}-${Date.now()}`,
        memberId: actorId,
        text: `できた！${result ? ' ' + result : ''}`,
        department: member.department,
        timestamp: Date.now(),
        duration: 3500,
      };
      this.webview!.postMessage({ type: 'jcSpeechBubble', bubble });

      // Set state to idle (will trigger break mode)
      this.webview!.postMessage({
        type: 'jcMemberStateChange',
        agentId: -200 - Math.floor(Math.random() * 1000),
        memberId: actorId,
        jcState: 'idle',
      });

      // ── Slice1: stop gauge + company score gain (affinity-weighted) ──
      this.webview!.postMessage({ type: 'jcGaugeStop', memberId: actorId });

      const delta = scoreGain(tier, priority);
      this.companyScore += delta;

      const today = new Date().toISOString().slice(0, 10);
      if (this.dailyDate !== today) {
        this.dailyDate = today;
        this.dailyCount = 0;
      }
      this.dailyCount += 1;

      this.webview!.postMessage({
        type: 'jcCompanyScore',
        total: this.companyScore,
        delta,
        todayCount: this.dailyCount,
        memberId: actorId,
        memberName: member.name,
        tier,
      });

      // Timeline (OFFICE LOG) 1-line imprint with affinity + score (AC-4).
      this.webview!.postMessage({
        type: 'jcSpeechBubble',
        bubble: {
          id: `score-${actorId}-${Date.now()}`,
          memberId: actorId,
          text: `${member.name}(相性${TIER_GLYPH[tier]}) 完了 [+${delta}]`,
          department: member.department,
          timestamp: Date.now(),
          duration: 1,
        } as SpeechBubble,
      });

      this.memberAffinity.delete(actorId);
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

  // ── v1.2: Delegation chain event handlers ──────────────────────

  /** Beam color presets for delegation types */
  private static readonly BEAM_COLORS: Record<string, { color: string; duration: number }> = {
    secretary_to_lead: { color: '#39ff14', duration: 2000 },
    lead_to_agent: { color: '#00b4ff', duration: 1500 },
    cross_dept: { color: '#bf5fff', duration: 2000 },
    report_up: { color: '#00b4ff', duration: 1500 },
    progress_check: { color: '#666688', duration: 1000 },
  };

  /** Determine beam type from member roles */
  private getBeamType(fromId: string, toId: string): { color: string; duration: number } {
    const from = this.config.members.find((m) => m.id === fromId);
    const to = this.config.members.find((m) => m.id === toId);
    if (!from || !to) return { color: '#ffffff', duration: 2000 };

    if (from.role === 'Secretary') return EventWatcher.BEAM_COLORS['secretary_to_lead'];
    if (from.department !== to.department) return EventWatcher.BEAM_COLORS['cross_dept'];
    // Lead → Agent or Agent → Lead based on layer
    if (from.layer < to.layer) return EventWatcher.BEAM_COLORS['lead_to_agent'];
    return EventWatcher.BEAM_COLORS['report_up'];
  }

  private handleRoleEscalate(event: RoleEscalateEvent): void {
    const beam = this.getBeamType(event.from, event.to);

    // Arrive the target member
    const toMember = this.config.members.find((m) => m.id === event.to);
    const toDesk = getDeskByMemberId(event.to);
    if (toMember && toDesk) {
      this.webview!.postMessage({
        type: 'jcMemberArriving',
        agentId: -200 - Math.floor(Math.random() * 1000),
        memberId: event.to,
        deskId: toDesk.deskId,
        seatUid: toDesk.deskId,
        hueShift: toMember.hueShift,
        palette: toMember.palette ?? 0,
      });
    }

    // Beam + speech bubble
    this.webview!.postMessage({
      type: 'jcLiaison',
      fromMemberId: event.from,
      toMemberId: event.to,
      color: beam.color,
      duration: beam.duration,
    });

    // R6 防御: message 欠落でも落とさない (task へ fallback → 空なら bubble skip)。
    const escText = event.message ?? '';
    const from = this.config.members.find((m) => m.id === event.from);
    if (from && escText) {
      const bubble: SpeechBubble = {
        id: `escalate-${Date.now()}`,
        memberId: event.from,
        text: escText.slice(0, 25),
        fullText: escText,
        department: from.department,
        timestamp: Date.now(),
        duration: 3000,
      };
      this.webview!.postMessage({ type: 'jcSpeechBubble', bubble });
    }
  }

  private handleDelegate(event: DelegateEvent): void {
    // Arrive all delegatees
    for (const memberId of event.to) {
      const member = this.config.members.find((m) => m.id === memberId);
      const desk = getDeskByMemberId(memberId);
      if (member && desk) {
        this.webview!.postMessage({
          type: 'jcMemberArriving',
          agentId: -200 - Math.floor(Math.random() * 1000),
          memberId,
          deskId: desk.deskId,
          seatUid: desk.deskId,
          hueShift: member.hueShift,
          palette: member.palette ?? 0,
        });
      }

      // ── Slice1: compute affinity ◎/△/✗ and fix it for this task ──
      if (member) {
        const priority = this.priorityFromEvent(event);
        const affinity = computeFit(
          { prompt: event.task ?? '', assignee: memberId },
          memberId,
          this.config,
          this.workspaceRoot,
        );
        this.memberAffinity.set(memberId, { ...affinity, priority });
        this.webview!.postMessage({
          type: 'jcFitBadge',
          memberId,
          tier: affinity.tier,
          fit: affinity.fit,
          label: affinity.label,
        });
      }

      // Beam from delegator to each delegatee
      const beam = this.getBeamType(event.from, memberId);
      this.webview!.postMessage({
        type: 'jcLiaison',
        fromMemberId: event.from,
        toMemberId: memberId,
        color: beam.color,
        duration: beam.duration,
      });

      // ── R5 ✉️メール演出 (2026-07-03 差戻しv2): 依頼発行(委任)の実イベントに
      // 1:1 で封筒フライトを発火する。ダミー発火なし — delegate イベント経由のみ。
      this.webview!.postMessage({
        type: 'jcMailFly',
        fromMemberId: event.from,
        toMemberId: memberId,
      });
    }

    // Speech bubble on delegator
    // R6 防御: message 欠落 (malformed writer) でも落とさない — task へ fallback。
    const delegateText = event.message ?? event.task ?? '';
    const from = this.config.members.find((m) => m.id === event.from);
    if (from && delegateText) {
      const bubble: SpeechBubble = {
        id: `delegate-${Date.now()}`,
        memberId: event.from,
        text: delegateText.slice(0, 25),
        fullText: delegateText,
        department: from.department,
        timestamp: Date.now(),
        duration: 3000,
      };
      this.webview!.postMessage({ type: 'jcSpeechBubble', bubble });
    }
  }

  private handleDelegationComplete(event: DelegationCompleteEvent): void {
    const beam = this.getBeamType(event.from, event.to);

    // Beam from completer to report-to
    this.webview!.postMessage({
      type: 'jcLiaison',
      fromMemberId: event.from,
      toMemberId: event.to,
      color: beam.color,
      duration: beam.duration,
    });

    // Speech bubble on completer
    // R6 防御: message 欠落でも落とさない — task へ fallback、空なら bubble skip。
    const completeText = event.message ?? event.task ?? '';
    const from = this.config.members.find((m) => m.id === event.from);
    if (from && completeText) {
      const bubble: SpeechBubble = {
        id: `complete-${Date.now()}`,
        memberId: event.from,
        text: completeText.slice(0, 25),
        fullText: completeText,
        department: from.department,
        timestamp: Date.now(),
        duration: 2000,
      };
      this.webview!.postMessage({ type: 'jcSpeechBubble', bubble });
    }

    // Set report-to member to reading (reviewing the output)
    this.webview!.postMessage({
      type: 'jcMemberStateChange',
      agentId: -200 - Math.floor(Math.random() * 1000),
      memberId: event.to,
      jcState: 'reading',
    });
  }

  private handleProgressCheck(event: ProgressCheckEvent): void {
    const beam = EventWatcher.BEAM_COLORS['progress_check'];

    // Beam from secretary to checked agent
    this.webview!.postMessage({
      type: 'jcLiaison',
      fromMemberId: event.from,
      toMemberId: event.to,
      color: beam.color,
      duration: beam.duration,
    });

    // Speech bubble on secretary
    // R6 防御: message 欠落でも落とさない — 空なら bubble skip。
    const progressText = event.message ?? '';
    const from = this.config.members.find((m) => m.id === event.from);
    if (from && progressText) {
      const bubble: SpeechBubble = {
        id: `progress-${Date.now()}`,
        memberId: event.from,
        text: progressText.slice(0, 25),
        fullText: progressText,
        department: from.department,
        timestamp: Date.now(),
        duration: 2000,
      };
      this.webview!.postMessage({ type: 'jcSpeechBubble', bubble });
    }

    // ── Slice1: poke un-stalls the checked member's quality gauge (DEV-SPEC §5.3) ──
    if (this.memberAffinity.has(event.to)) {
      this.webview!.postMessage({ type: 'jcGaugeStuck', memberId: event.to, stuck: false });
    }
  }

  /** Test/introspection helpers for the Slice1 game state. */
  getCompanyScore(): number {
    return this.companyScore;
  }
  getAffinityTier(memberId: string): string | undefined {
    return this.memberAffinity.get(memberId)?.tier;
  }
}
