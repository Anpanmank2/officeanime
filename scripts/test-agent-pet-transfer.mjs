// Exercise the real VS Code request branch and WebView receive handler without launching an IDE.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

import { buildSync } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'office-pet-transfer-'));
const require = createRequire(import.meta.url);
try {
  for (const [name, entry] of [
    ['host', 'src/jc/agent-pet.ts'],
    ['view', 'webview-ui/src/jc/pet-state.ts'],
  ]) {
    buildSync({
      entryPoints: [path.join(root, entry)],
      outfile: path.join(temp, `${name}.cjs`),
      bundle: true,
      platform: 'node',
      format: 'cjs',
      logLevel: 'silent',
    });
  }
  const host = require(path.join(temp, 'host.cjs'));
  const view = require(path.join(temp, 'view.cjs'));
  const home = path.join(temp, 'home');
  const petDir = path.join(home, '.agent-pet', 'fixture');
  fs.mkdirSync(petDir, { recursive: true });
  fs.writeFileSync(
    path.join(petDir, 'growth.json'),
    JSON.stringify({ stage: 2, born_at: '2026-08-31' }),
  );
  const voice = {
    schema: 'first-voice/1',
    id: 'transfer-test-000001',
    date: '2026-09-08',
    kind: 'normal',
    text: 'おはよう。\n—— fixture',
    additionalContext: 'DO NOT TRANSFER',
  };
  fs.writeFileSync(path.join(petDir, 'first-voice.json'), JSON.stringify(voice));
  const now = new Date(2026, 8, 8, 12);
  const replies = [];
  const provider = fs.readFileSync(path.join(root, 'src/PixelAgentsViewProvider.ts'), 'utf8');
  const branch = provider.match(
    /if \(message.type === 'jcRequestPet'\) \{([\s\S]*?)\n      \} else if/,
  )?.[1];
  assert.ok(branch, 'actual VS Code request branch exists');
  vm.runInNewContext(branch, {
    origPostMessage: (message) => replies.push(message),
    agentPetMessage: () => host.agentPetMessage(home, now),
  });
  assert.equal(replies.length, 1);
  assert.equal(replies[0].type, 'jcPetUpdated');
  assert.equal(JSON.stringify(replies).includes('DO NOT TRANSFER'), false);
  const hook = fs.readFileSync(
    path.join(root, 'webview-ui/src/hooks/useExtensionMessages.ts'),
    'utf8',
  );
  const handler = hook.slice(
    hook.indexOf('    const handler ='),
    hook.indexOf("    window.addEventListener('message', handler)"),
  );
  assert.ok(handler.includes('jcPetUpdated'));
  let notified = 0;
  const stop = view.jcSubscribePet(() => {
    notified += 1;
  });
  const context = vm.createContext({
    getOfficeState: () => ({}),
    jcSetPet: (data) => view.jcSetPet(data, now),
  });
  vm.runInContext(stripTypeScriptTypes(handler), context);
  context.message = replies[0];
  vm.runInContext('handler({data: message})', context);
  assert.equal(view.jcGetPet().firstVoice.text, voice.text);
  assert.equal(view.jcGetPet().stage, 2);
  assert.equal(notified, 1, 'mounted WebView subscribers receive asynchronous companion data');
  context.message = { type: 'jcPetUpdated', pet: null };
  vm.runInContext('handler({data: message})', context);
  assert.equal(view.jcGetPet(), null);
  stop();
  console.log(
    'PASS: real VS Code request -> allowlisted payload -> actual WebView handler -> subscriber; null clears state. IDE host rendering is a separate check.',
  );
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
