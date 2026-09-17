// Department totals count active roster members, not retained vacant desks.
// Run: npx tsx scripts/test-dept-denominator.mts

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeDeptOccupancy } from '../webview-ui/src/jc/karte-state.js';
import { jcLoadConfig } from '../webview-ui/src/jc/jc-state.js';
import type { JCConfigData } from '../webview-ui/src/jc/jc-types.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'jc-config.json'), 'utf8')) as JCConfigData;
jcLoadConfig(config);

const occupancy = computeDeptOccupancy();
const activeCount = (department: string) =>
  config.members.filter((member) => member.department === department && !member.vacant).length;

assert.equal(occupancy.marketing?.total, activeCount('marketing'), 'marketing denominator excludes vacancies');
assert.equal(occupancy.research?.total, activeCount('research'), 'research denominator excludes vacancies');
assert.equal(occupancy.marketing?.total, 6, 'marketing active roster is 6');
assert.equal(occupancy.research?.total, 4, 'research active roster is 4');

console.log('PASS: department denominators match non-vacant roster (marketing=6, research=4)');
