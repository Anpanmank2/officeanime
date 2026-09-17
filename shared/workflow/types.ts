/** Host-observed request lifecycle, shared by the browser and standalone host. */
export type RequestKind = 'research' | 'market' | 'doc' | 'impl';
export type WorkStatus =
  | 'received'
  | 'preparing'
  | 'waiting'
  | 'running'
  | 'cancelling'
  | 'done'
  | 'error'
  | 'cancelled'
  | 'expired'
  | 'interrupted';
export interface WorkQuestion {
  understanding: string;
  question: string;
  options: string[];
  field_ref: string;
}
export interface WorkAnswer {
  question: string;
  understanding: string;
  fieldRef: string;
  answer: string;
  isOther: boolean;
}
export interface WorkRequest {
  id: string;
  memberId: string;
  department: string;
  kind: RequestKind;
  purpose: string;
  wants: string;
  overview: string;
  priority: number;
  stagingDir?: string;
  status: WorkStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
  expires: string;
  questions?: WorkQuestion[];
  answers?: WorkAnswer[];
  summary?: string;
  files?: string[];
}
