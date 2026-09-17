import { defineConfig } from '@playwright/test';
import path from 'node:path';

// Native IDE QA opens windows and may trigger OS credential prompts. Keep it an
// explicit opt-in; the default suite only launches a headless browser.
const nativeQA = process.env.OFFICE_PET_VSCODE_QA === '1';

export default defineConfig({
  testDir: path.join(__dirname, 'tests'),
  testMatch: nativeQA ? 'pet-*.spec.ts' : 'pet-standalone.spec.ts',
  timeout: 180_000,
  workers: 1,
  globalSetup: nativeQA ? path.join(__dirname, 'global-setup.ts') : undefined,
  outputDir: path.join(__dirname, '../test-results/pet'),
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(__dirname, '../test-results/pet-results.json') }],
  ],
});
