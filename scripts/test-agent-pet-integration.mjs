// Run against an isolated agent-pet checkout, never a live hook checkout.
// node scripts/test-agent-pet-integration.mjs --pet-source=/path/to/isolated/agent-pet
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildSync } from 'esbuild';

const sourceArg = process.argv.find((arg) => arg.startsWith('--pet-source='));
assert.ok(sourceArg, 'An explicit isolated --pet-source checkout is required');
const source = path.resolve(sourceArg.slice('--pet-source='.length));
const { makePet } = await import(pathToFileURL(path.join(source, 'tests/helpers.mjs')).href);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'office-pet-integration-'));
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const today = '2026-09-08';
const now = new Date(2026, 8, 8, 12);
function snapshot(dir) {
  return fs
    .readdirSync(dir, { recursive: true })
    .sort()
    .flatMap((name) => {
      const file = path.join(dir, name);
      return fs.statSync(file).isFile() ? [[name, fs.readFileSync(file, 'utf8')]] : [];
    });
}
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
  const days = JSON.parse(
    fs.readFileSync(path.join(source, 'config/stage-days.json'), 'utf8'),
  ).days;
  for (const [stage, age] of days.entries()) {
    const home = path.join(temp, `age-${age}`);
    const petRoot = path.join(home, '.agent-pet');
    const petDir = makePet(petRoot, 'fixture');
    const growthFile = path.join(petDir, 'growth.json');
    const growth = JSON.parse(fs.readFileSync(growthFile, 'utf8'));
    growth.born_at = new Date(Date.parse(today) - age * 86400000).toISOString().slice(0, 10);
    fs.writeFileSync(growthFile, JSON.stringify(growth));
    const output = execFileSync(
      process.execPath,
      [
        path.join(source, 'scripts/pet-day-start.mjs'),
        '--home',
        petRoot,
        '--name',
        'fixture',
        '--date',
        today,
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, HOME: home, AGENT_PET_HOME: petRoot },
      },
    ).trimEnd();
    const before = snapshot(petRoot);
    const payload = host.readAgentPet(home, now);
    assert.equal(payload.stage, stage);
    assert.deepEqual(payload.stageDays, days, 'office defaults match the producer revision');
    assert.equal(
      payload.firstVoice.text,
      output,
      'producer stdout exactly matches read-only transfer',
    );
    view.jcSetPet(payload, now);
    assert.equal(view.jcGetPet().firstVoice.text, output);
    assert.equal(view.jcGetPetDayCount(view.jcGetPet(), now), age);
    assert.equal(view.jcGetPet().stage, stage);
    assert.deepEqual(snapshot(petRoot), before, 'viewing does not write pet records');
    console.log(
      `PASS: age ${age}, recorded stage ${stage}, generated ${payload.firstVoice.kind} voice -> saved record -> host -> WebView state, no pet writes`,
    );
  }
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
