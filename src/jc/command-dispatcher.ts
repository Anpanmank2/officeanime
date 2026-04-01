// ── Command Dispatcher — routes browser/webview commands to Extension APIs ──

export interface CommandContext {
  /** Send text directly to an agent's terminal (immediate instruction) */
  sendToTerminal?: (agentId: number, text: string) => void;
  /** Write a persistent directive to .jc/directives.md */
  writeDirective?: (text: string) => Promise<void>;
  /** Focus an agent's terminal */
  focusTerminal?: (agentId: number) => void;
  /** Close an agent */
  closeAgent?: (agentId: number) => void;
  /** Open a new Claude terminal */
  openClaude?: (options?: { folderPath?: string; bypassPermissions?: boolean }) => void;
  /** Get all active agent IDs */
  getAgentIds?: () => number[];
  /** Forward a message to the VS Code webview handler (fallback for standard messages) */
  forwardToWebviewHandler?: (data: unknown) => void;
  /** Cancel a task */
  cancelTask?: (taskId: string) => void;
  /** Update task properties */
  updateTask?: (taskId: string, updates: { status?: string; priority?: number }) => void;
  /** Reassign task to different member */
  reassignTask?: (taskId: string, newAssignee: string) => void;
}

export interface CommandDispatcher {
  dispatch: (command: unknown, respond?: (data: unknown) => void) => void;
  setContext: (ctx: Partial<CommandContext>) => void;
}

export function createCommandDispatcher(): CommandDispatcher {
  let context: CommandContext = {};

  const dispatch = (command: unknown, respond?: (data: unknown) => void): void => {
    const cmd = command as { type?: string; [key: string]: unknown };
    if (!cmd.type) return;

    console.log(`[JC-CMD] Dispatching: ${cmd.type}`);

    switch (cmd.type) {
      // ── JC-specific commands ──
      case 'agent:instruct': {
        const { agentId, text } = cmd as { type: string; agentId: number; text: string };
        if (agentId !== null && agentId !== undefined && text && context.sendToTerminal) {
          context.sendToTerminal(agentId, text);
          respond?.({ type: 'command:ack', commandType: cmd.type, success: true });
        } else {
          respond?.({
            type: 'command:ack',
            commandType: cmd.type,
            success: false,
            error: 'Missing agentId/text or terminal unavailable',
          });
        }
        break;
      }
      case 'agent:directive': {
        const { text } = cmd as { type: string; text: string };
        if (text && context.writeDirective) {
          void context.writeDirective(text).then(() => {
            respond?.({ type: 'command:ack', commandType: cmd.type, success: true });
          });
        }
        break;
      }
      case 'agent:focus': {
        const { agentId } = cmd as { type: string; agentId: number };
        if (agentId !== null && agentId !== undefined && context.focusTerminal) {
          context.focusTerminal(agentId);
        }
        break;
      }
      case 'broadcast:send': {
        const { text, mode } = cmd as {
          type: string;
          text: string;
          mode?: 'instant' | 'directive';
        };
        if (!text) break;
        const agentIds = context.getAgentIds?.() ?? [];
        if (mode === 'directive' && context.writeDirective) {
          void context.writeDirective(text);
        } else if (context.sendToTerminal) {
          for (const id of agentIds) {
            context.sendToTerminal(id, text);
          }
        }
        respond?.({
          type: 'command:ack',
          commandType: cmd.type,
          success: true,
          agentCount: agentIds.length,
        });
        break;
      }
      case 'task:cancel': {
        const { taskId } = cmd as { type: string; taskId: string };
        if (taskId && context.cancelTask) {
          context.cancelTask(taskId);
          respond?.({ type: 'command:ack', commandType: cmd.type, success: true });
        }
        break;
      }
      case 'task:prioritize': {
        const { taskId, newStatus, newPriority } = cmd as {
          type: string;
          taskId: string;
          newStatus?: string;
          newPriority?: number;
        };
        if (taskId && context.updateTask) {
          context.updateTask(taskId, { status: newStatus, priority: newPriority });
          respond?.({ type: 'command:ack', commandType: cmd.type, success: true });
        }
        break;
      }
      case 'task:reassign': {
        const { taskId, newAssignee } = cmd as {
          type: string;
          taskId: string;
          newAssignee: string;
        };
        if (taskId && newAssignee && context.reassignTask) {
          context.reassignTask(taskId, newAssignee);
          respond?.({ type: 'command:ack', commandType: cmd.type, success: true });
        }
        break;
      }
      default: {
        // Forward unrecognized commands to the standard webview handler
        if (context.forwardToWebviewHandler) {
          context.forwardToWebviewHandler(command);
        } else {
          console.log(`[JC-CMD] Unhandled command: ${cmd.type}`);
        }
        break;
      }
    }
  };

  const setContext = (ctx: Partial<CommandContext>): void => {
    context = { ...context, ...ctx };
  };

  return { dispatch, setContext };
}
