import * as vscode from 'vscode';

import { COMMAND_EXPORT_DEFAULT_LAYOUT, COMMAND_SHOW_PANEL, VIEW_ID } from './constants.js';
import { disposeJC, initJC, setLaunchFunction } from './jc/index.js';
import { PixelAgentsViewProvider } from './PixelAgentsViewProvider.js';

let providerInstance: PixelAgentsViewProvider | undefined;

export function activate(context: vscode.ExtensionContext) {
  const provider = new PixelAgentsViewProvider(context);

  // Initialize Just Curious Virtual Office (no-op if jc-config.json not present)
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
  initJC(workspaceRoot, provider.agents);
  providerInstance = provider;

  // Set up the launch function for the task orchestrator
  setLaunchFunction(async (memberId: string, prompt: string, workingDir?: string) => {
    await provider.launchForTask(memberId, prompt, workingDir);
  });

  context.subscriptions.push(vscode.window.registerWebviewViewProvider(VIEW_ID, provider));

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_SHOW_PANEL, () => {
      vscode.commands.executeCommand(`${VIEW_ID}.focus`);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_EXPORT_DEFAULT_LAYOUT, () => {
      provider.exportDefaultLayout();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('pixel-agents.openInBrowser', () => {
      provider.startBrowserViewing();
    }),
  );
}

export function deactivate() {
  disposeJC();
  providerInstance?.dispose();
}
