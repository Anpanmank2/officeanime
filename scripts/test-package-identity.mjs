import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(packageJson.name, 'officeanime');
assert.equal(packageJson.publisher, 'Anpanmank2');
assert.equal(packageJson.repository?.url, 'https://github.com/Anpanmank2/officeanime');

console.log('package identity: PASS');
