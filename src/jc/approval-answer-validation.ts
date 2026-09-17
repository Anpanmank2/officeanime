import * as fs from 'fs';

import { ApprovalState, parseApprovalEvent } from './approval-state.js';
import type { ApprovalResolvedEvent } from './types.js';

/** The persisted pending request is authoritative, including option and expiry. */
export function validateApprovalAnswer(
  file: string,
  id: string,
  answer: string,
  company: string,
): ApprovalResolvedEvent | undefined {
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { events: unknown[] };
  const state = new ApprovalState();
  let originalCompany: string | undefined;
  let resolution: ApprovalResolvedEvent | undefined;
  for (const raw of data.events) {
    const event = parseApprovalEvent(raw);
    if (event) {
      state.apply(event);
      if (event.event === 'approval_request' && event.id === id) originalCompany = event.company_id;
      if (event.event === 'approval_resolved' && event.request_id === id) resolution = event;
    }
  }
  if (resolution && resolution.answer === answer && originalCompany === company) return resolution;
  const request = state.getPending().find((row) => row.id === id);
  if (!request || Date.parse(request.expires) <= Date.now())
    throw new Error('回答済み・取消・期限切れのため回答できません。');
  if (request.company_id !== company || !request.options.some((option) => option.key === answer))
    throw new Error('回答内容が依頼と一致しません。');
}
