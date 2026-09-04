import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ApprovalAnswer {
  request_id: string;
  answer: string;
  at: string;
  via: 'office' | 'chat';
  company_id: string;
}

/** Atomically append an approval response while preserving existing answer rows. */
export function appendAnswer(workspaceRoot: string, answer: ApprovalAnswer): void {
  const answersPath = path.join(workspaceRoot, 'jc-answers.json');
  let answers: unknown[] = [];
  try {
    const existing = JSON.parse(fs.readFileSync(answersPath, 'utf8'));
    if (Array.isArray(existing)) answers = existing;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const tmpPath = `${answersPath}.tmp`;
  answers.push(answer);
  fs.writeFileSync(tmpPath, JSON.stringify(answers, null, 2), 'utf8');
  fs.renameSync(tmpPath, answersPath);
}
