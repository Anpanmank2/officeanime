#!/usr/bin/env node
/** Built extension activate -> actual webview callback -> shared runtime -> child
 * process -> persisted answers/results. VS Code API is a headless mock; claude
 * and home are isolated fixtures. No native GUI, external AI, or real user data. */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import WebSocket from 'ws';
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'test-results/phase2');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phase2-extension-'));
const home = path.join(tmp, 'home');
const workspace = path.join(tmp, 'workspace');
const bin = path.join(tmp, 'bin');
const storage = path.join(tmp, 'extension-storage');
for (const dir of [home, workspace, bin, storage]) fs.mkdirSync(dir, { recursive: true });
const trace = path.join(tmp, 'executions.jsonl');
fs.writeFileSync(
  path.join(bin, 'claude'),
  `#!${process.execPath}
const fs = require('node:fs');
const prompt = process.argv[process.argv.indexOf('-p') + 1] || '';
const confirm = prompt.includes('【出力形式');
fs.appendFileSync(${JSON.stringify(trace)}, JSON.stringify({confirm, prompt, args: process.argv.slice(2), cwd: process.cwd()})+'\\n');
if(confirm) {
  if(prompt.includes('confirm-fail')) process.exit(3);
  setTimeout(() => console.log(JSON.stringify([{understanding:'stored understanding', question:'Proceed?', options:['yes'], field_ref:'purpose'}])), 50);
} else {
  console.log('working');
  setTimeout(() => { console.log('fixture result'); process.exit(prompt.includes('execute-fail') ? 2 : 0); }, prompt.includes('long-run') ? 20000 : 120);
}
`,
);
fs.chmodSync(path.join(bin, 'claude'), 0o755);
const oldPath = process.env.PATH;
process.env.PATH = `${bin}:${oldPath}`;
const osModule = require('node:os');
const originalHome = osModule.homedir;
osModule.homedir = () => home;
const uri = (fsPath) => ({ fsPath, toString: () => fsPath });
const disposable = () => ({ dispose() {} });
let provider;
const vscode = {
  Uri: {
    file: uri,
    parse: uri,
    joinPath: (base, ...parts) => uri(path.join(base.fsPath, ...parts)),
  },
  workspace: { workspaceFolders: [{ name: 'isolated', uri: uri(workspace) }], isTrusted: true },
  window: {
    terminals: [],
    registerWebviewViewProvider: (_id, value) => {
      provider = value;
      return disposable();
    },
    onDidChangeActiveTerminal: disposable,
    onDidCloseTerminal: disposable,
    showInformationMessage: () => {},
    showWarningMessage: () => {},
    showErrorMessage: () => {},
    createTerminal: () => {
      throw new Error('Unexpected terminal launch');
    },
  },
  commands: { registerCommand: disposable },
};
vscode.env = { openExternal: async () => true };
// Allocate an ephemeral test port without changing the production default.
const http = require('node:http');
const originalListen = http.Server.prototype.listen;
http.Server.prototype.listen = function (port, ...args) {
  return originalListen.call(this, port === 8432 ? 0 : port, ...args);
};
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (id, ...args) {
  return id === 'vscode' ? vscode : originalLoad.call(this, id, ...args);
};
const extension = require(path.join(root, 'dist/extension.js'));
const store = () => ({ get: (_key, fallback) => fallback, update: async () => {} });
const context = {
  extensionPath: root,
  extensionUri: uri(root),
  storageUri: uri(storage),
  globalState: store(),
  workspaceState: store(),
  subscriptions: [],
  extension: { packageJSON: { version: 'fixture' } },
};
let messages = [];
let receive;
async function start() {
  messages = [];
  extension.activate(context);
  provider.resolveWebviewView({
    webview: {
      options: {},
      html: '',
      asWebviewUri: (v) => v,
      postMessage: (m) => {
        messages.push(structuredClone(m));
        return Promise.resolve(true);
      },
      onDidReceiveMessage: (fn) => {
        receive = fn;
        return disposable();
      },
    },
  });
  await receive({ type: 'webviewReady' });
}
const entries = () =>
  fs.existsSync(trace)
    ? fs.readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
    : [];
const journalFile = () =>
  path.join(storage, 'requests', fs.readdirSync(path.join(storage, 'requests'))[0]);
const rows = () => JSON.parse(fs.readFileSync(journalFile(), 'utf8'));
const row = (id) => rows().find((r) => r.id === id);
async function until(fn, description) {
  for (let i = 0; i < 250; i++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.fail(`Timed out: ${description}`);
}
async function submit(id, kind = 'research', purpose = id) {
  await receive({
    type: 'jcRequestSubmit',
    requestId: id,
    memberId: 'res-01',
    kind,
    purpose,
    wants: 'fixture criteria',
    overview: 'fixture scope',
  });
}
async function confirm(id, override) {
  await receive({
    type: 'jcRequestConfirmed',
    requestId: id,
    answers:
      override ??
      row(id).questions.map((q) => ({
        fieldRef: q.field_ref,
        answer: q.options[0],
        understanding: 'forged client text',
      })),
  });
}
const passed = [];
try {
  await start();
  assert.ok(messages.some((m) => m.type === 'jcWorkSnapshot' && m.requests.length === 0));
  await submit('normal');
  await until(() => row('normal').status === 'waiting', 'confirmation');
  assert.equal(entries().filter((e) => !e.confirm).length, 0);
  extension.deactivate();
  await start();
  assert.equal(messages.find((m) => m.type === 'jcWorkSnapshot').requests[0].status, 'waiting');
  await submit('normal');
  await confirm('normal', []);
  assert.ok(messages.some((m) => m.type === 'jcWorkError'));
  await confirm('normal');
  await confirm('normal');
  await until(() => row('normal').status === 'done', 'normal completion');
  assert.equal(entries().filter((e) => !e.confirm).length, 1);
  assert.equal(row('normal').answers[0].understanding, 'stored understanding');
  assert.equal(
    messages.filter(
      (m) => m.type === 'jcWorkUpdate' && m.request.id === 'normal' && m.request.status === 'done',
    ).length,
    1,
  );
  const events = JSON.parse(fs.readFileSync(path.join(workspace, 'jc-events.json'), 'utf8')).events;
  assert.ok(events.some((e) => e.event === 'delegate' && e.workflow_id === 'normal'));
  passed.push(
    'built extension webviewReady, submit, persisted waiting reload, canonical answers, duplicate replay, observed start, completion',
  );

  await submit('draft', 'doc');
  await until(() => row('draft').status === 'waiting', 'draft questions');
  const answers = row('draft').questions.map((q) => ({
    fieldRef: q.field_ref,
    answer: q.options[0],
  }));
  await confirm(
    'draft',
    answers.map((a) => (a.fieldRef === 'plan' ? { ...a, answer: 'いいえ', isOther: true } : a)),
  );
  assert.equal(row('draft').status, 'waiting');
  await confirm('draft');
  await until(() => row('draft').status === 'done', 'draft completion');
  const draft = entries().find((e) => !e.confirm && e.args.includes('--settings'));
  assert.equal(fs.realpathSync(draft.cwd), fs.realpathSync(row('draft').stagingDir));
  assert.ok(
    JSON.parse(draft.args[draft.args.indexOf('--settings') + 1]).permissions.deny.includes('Bash'),
  );
  passed.push('write plan negative/freeform rejection and approved scoped staging execution');

  await submit('confirm-fail');
  await until(() => row('confirm-fail').status === 'error', 'confirmation failure');
  await submit('execute-fail');
  await until(() => row('execute-fail').status === 'waiting', 'failure questions');
  await confirm('execute-fail');
  await until(() => row('execute-fail').status === 'error', 'execution failure');
  await submit('cancel-wait');
  await until(() => row('cancel-wait').status === 'waiting', 'cancel questions');
  await receive({ type: 'jcRequestCancel', requestId: 'cancel-wait' });
  assert.equal(row('cancel-wait').status, 'cancelled');
  await submit('long-run-cancel');
  await until(() => row('long-run-cancel').status === 'waiting', 'running cancel questions');
  await confirm('long-run-cancel');
  await until(() => row('long-run-cancel').status === 'running', 'running');
  await receive({ type: 'jcRequestCancel', requestId: 'long-run-cancel' });
  await until(() => row('long-run-cancel').status === 'cancelled', 'cancelled');
  passed.push(
    'confirmation failure, nonzero execution, waiting cancellation, active child cancellation',
  );

  await submit('expires');
  await until(() => row('expires').status === 'waiting', 'expiry questions');
  extension.deactivate();
  const saved = rows();
  saved.find((r) => r.id === 'expires').expires = new Date(0).toISOString();
  // A recorded in-flight status is the durable fixture for abrupt host termination.
  saved.push({ ...saved[0], id: 'abrupt-host-stop', status: 'running', revision: 2 });
  fs.writeFileSync(journalFile(), JSON.stringify(saved));
  const beforeReload = entries().length;
  await start();
  assert.equal(row('expires').status, 'expired');
  assert.equal(row('abrupt-host-stop').status, 'interrupted');
  assert.equal(entries().length, beforeReload);
  const historyDir = path.join(home, '.pixel-agents/task-history');
  const history = fs
    .readdirSync(historyDir)
    .flatMap((f) =>
      fs
        .readFileSync(path.join(historyDir, f), 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(JSON.parse),
    );
  assert.equal(history.filter((r) => r.taskId === 'normal').length, 1);
  assert.equal(history.find((r) => r.taskId === 'normal').summary, 'working\nfixture result');
  passed.push(
    'expired decision, interrupted recovery without execution, exact result in shared bookshelf history',
  );

  await provider.startBrowserViewing();
  assert.ok(provider.browserServer, 'extension browser server starts without native GUI');
  const socket = new WebSocket(`ws://127.0.0.1:${provider.browserServer.port}`);
  const browserMessages = [];
  socket.on('message', (raw) => browserMessages.push(JSON.parse(raw.toString())));
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  try {
    socket.send(JSON.stringify({ type: 'webviewReady' }));
    await until(
      () => browserMessages.some((m) => m.type === 'jcWorkSnapshot'),
      'extension browser snapshot',
    );
    socket.send(
      JSON.stringify({
        type: 'jcRequestSubmit',
        requestId: 'browser-bridge',
        memberId: 'res-01',
        kind: 'research',
        purpose: 'bridge',
        wants: 'fixture',
        overview: 'fixture',
      }),
    );
    await until(
      () => rows().some((r) => r.id === 'browser-bridge' && r.status === 'waiting'),
      'bridge waiting',
    );
    socket.send(
      JSON.stringify({
        type: 'jcRequestConfirmed',
        requestId: 'browser-bridge',
        answers: row('browser-bridge').questions.map((q) => ({
          fieldRef: q.field_ref,
          answer: q.options[0],
        })),
      }),
    );
    await until(
      () =>
        browserMessages.some(
          (m) =>
            m.type === 'jcWorkUpdate' &&
            m.request.id === 'browser-bridge' &&
            m.request.status === 'done',
        ),
      'bridge completed',
    );
    assert.equal(
      browserMessages.filter(
        (m) =>
          m.type === 'jcWorkUpdate' &&
          m.request.id === 'browser-bridge' &&
          m.request.status === 'done',
      ).length,
      1,
    );
    assert.equal(
      messages.filter(
        (m) =>
          m.type === 'jcWorkUpdate' &&
          m.request.id === 'browser-bridge' &&
          m.request.status === 'done',
      ).length,
      1,
    );
  } finally {
    await new Promise((resolve) => {
      socket.once('close', resolve);
      socket.close();
    });
  }
  passed.push(
    'extension browser bridge shares host dispatch, snapshot and single broadcast with native webview',
  );
  const beforeUnavailable = entries().length;
  const otherWorkspace = path.join(tmp, 'other-workspace');
  fs.mkdirSync(otherWorkspace);
  vscode.workspace.workspaceFolders = [{ name: 'other', uri: uri(otherWorkspace) }];
  await submit('wrong-workspace', 'doc');
  assert.match(messages.at(-2).reason, /再読み込み/);
  assert.ok(!rows().some((r) => r.id === 'wrong-workspace'));
  assert.equal(entries().length, beforeUnavailable);
  assert.equal(fs.readdirSync(otherWorkspace).length, 0);
  vscode.workspace.workspaceFolders = [{ name: 'isolated', uri: uri(workspace) }];
  passed.push('workspace switch rejects before old workspace execution and requires reload');
  vscode.workspace.isTrusted = false;
  await receive({ type: 'jcWorkSync' });
  assert.match(messages.at(-2).reason, /制限モード/);
  await submit('untrusted');
  assert.equal(entries().length, beforeUnavailable);
  assert.ok(!rows().some((r) => r.id === 'untrusted'));
  vscode.workspace.isTrusted = true;
  vscode.workspace.workspaceFolders = [];
  await receive({ type: 'jcWorkSync' });
  assert.match(messages.at(-2).reason, /作業フォルダー/);
  passed.push(
    'restricted or missing workspace receives explicit unavailable/error instead of indefinite waiting',
  );
  fs.writeFileSync(
    path.join(output, 'extension-summary.json'),
    JSON.stringify(
      {
        passed: true,
        tests: passed,
        builderBase: '90f2d56f02d93524544ae2bbbeefe1108e400956',
        boundary:
          'built extension; VS Code API mock; fixture claude via PATH; isolated home/storage/workspace; no native GUI',
      },
      null,
      2,
    ),
  );
  console.log(`PASS extension workflow: ${passed.length} groups`, passed);
} finally {
  extension.deactivate();
  await new Promise((r) => setTimeout(r, 150));
  http.Server.prototype.listen = originalListen;
  Module._load = originalLoad;
  osModule.homedir = originalHome;
  process.env.PATH = oldPath;
  fs.rmSync(tmp, { recursive: true, force: true });
}
