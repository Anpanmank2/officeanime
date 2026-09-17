import type {
  ApprovalCancelEvent,
  ApprovalExpiredEvent,
  ApprovalRequestEvent,
  ApprovalResolvedEvent,
} from './types.js';

export type ApprovalEvent =
  | ApprovalRequestEvent
  | ApprovalCancelEvent
  | ApprovalExpiredEvent
  | ApprovalResolvedEvent;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoDate(value: unknown): value is string {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function hasBaseEvent(value: UnknownRecord): boolean {
  return isIsoDate(value.timestamp);
}

/** Parse only the approval event family; malformed queue rows return null. */
export function parseApprovalEvent(value: unknown): ApprovalEvent | null {
  if (!isRecord(value) || !hasBaseEvent(value)) return null;

  switch (value.event) {
    case 'approval_request': {
      if (
        !isNonEmptyString(value.id) ||
        !isNonEmptyString(value.company_id) ||
        !isNonEmptyString(value.from) ||
        !isNonEmptyString(value.title) ||
        typeof value.body_md !== 'string' ||
        typeof value.irreversible !== 'boolean' ||
        !isIsoDate(value.expires) ||
        !Array.isArray(value.options) ||
        value.options.length === 0 ||
        !value.options.every(
          (option) =>
            isRecord(option) &&
            isNonEmptyString(option.key) &&
            isNonEmptyString(option.label) &&
            typeof option.recommended === 'boolean',
        )
      ) {
        return null;
      }
      return value as unknown as ApprovalRequestEvent;
    }
    case 'approval_cancel':
      return isNonEmptyString(value.request_id) ? (value as unknown as ApprovalCancelEvent) : null;
    case 'approval_expired':
      return isNonEmptyString(value.request_id) && isIsoDate(value.at)
        ? (value as unknown as ApprovalExpiredEvent)
        : null;
    case 'approval_resolved':
      return isNonEmptyString(value.request_id) &&
        isNonEmptyString(value.answer) &&
        isIsoDate(value.at) &&
        (value.via === 'office' || value.via === 'chat')
        ? (value as unknown as ApprovalResolvedEvent)
        : null;
    default:
      return null;
  }
}

export function isApprovalEvent(value: unknown): value is ApprovalEvent {
  return parseApprovalEvent(value) !== null;
}

/** Pending approvals keyed by request id. Replayed requests replace, never duplicate. */
export class ApprovalState {
  private closed = new Set<string>();
  private pending = new Map<string, ApprovalRequestEvent>();

  apply(event: ApprovalEvent): void {
    if (event.event === 'approval_request') {
      if (this.closed.has(event.id)) return;
      this.pending.set(event.id, event);
    } else {
      this.closed.add(event.request_id);
      this.pending.delete(event.request_id);
    }
  }

  getPending(): ApprovalRequestEvent[] {
    return [...this.pending.values()];
  }

  expireDue(now: string = new Date().toISOString()): ApprovalExpiredEvent[] {
    const nowMs = Date.parse(now);
    if (Number.isNaN(nowMs)) return [];
    const expired: ApprovalExpiredEvent[] = [];
    for (const request of this.pending.values()) {
      if (Date.parse(request.expires) <= nowMs) {
        const event: ApprovalExpiredEvent = {
          event: 'approval_expired',
          timestamp: now,
          request_id: request.id,
          at: now,
        };
        this.closed.add(request.id);
        this.pending.delete(request.id);
        expired.push(event);
      }
    }
    return expired;
  }
}
