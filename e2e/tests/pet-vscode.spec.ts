import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { launchVSCode, waitForWorkbench } from '../helpers/launch';
import { getPixelAgentsFrame, openPixelAgentsPanel, runCommand } from '../helpers/webview';
import { observePetDrawing, openPetCard, preparePet, snapshotPet } from '../helpers/pet';

for (const age of [10, 70]) {
  test(`SessionStart reaches the actual VS Code companion at age ${age} and read-only card`, async ({}, info) => {
    let pet!: ReturnType<typeof preparePet>;
    const session = await launchVSCode(
      info.title,
      (home) => {
        pet = preparePet(home, age);
      },
      true,
    );
    try {
      const { window } = session;
      const before = snapshotPet(pet.petRoot);
      await observePetDrawing(session.app.context());
      await waitForWorkbench(window);
      await openPixelAgentsPanel(window);
      let frame = await getPixelAgentsFrame(window, '[data-pet-first-voice]');
      let bubble = frame.locator('[data-pet-first-voice]');
      await expect(bubble).toBeVisible({ timeout: 30_000 });
      await expect(frame.locator('[data-pet-first-voice-text]')).toHaveText(pet.voice.text);
      await window.screenshot({ path: info.outputPath('vscode-first-voice.png') });
      await frame.getByRole('button', { name: '第一声を閉じる' }).click();
      const click = await openPetCard(frame);
      const panel = frame.locator('[data-pet-status-panel]');
      await expect(panel).toContainText(`生まれて ${age}日`);
      await expect(panel).toContainText('きょうの第一声');
      await expect(panel).toContainText(pet.voice.text);
      await window.screenshot({ path: info.outputPath('vscode-grown-card.png') });
      expect(snapshotPet(pet.petRoot)).toEqual(before);

      console.log(
        `PASS VS Code age ${age}: native message, visible voice, close click, grown sprite click, card and unchanged pet`,
      );
      let reloadReplay: boolean | null = null;
      if (age === 70) {
        await panel.getByTitle('閉じる', { exact: true }).click();
        await runCommand(window, 'Developer: Reload Webviews');
        frame = await getPixelAgentsFrame(window, '[data-pet-first-voice]');
        await expect
          .poll(() => frame.evaluate(() => (window as any).__petMessage?.pet?.firstVoice?.id))
          .toBe(pet.voice.id);
        bubble = frame.locator('[data-pet-first-voice]');
        reloadReplay = await bubble.isVisible();
        if (reloadReplay) await frame.getByRole('button', { name: '第一声を閉じる' }).click();
        await openPetCard(frame);
        await expect(frame.locator('[data-pet-status-panel]')).toContainText(pet.voice.text);
        expect(snapshotPet(pet.petRoot)).toEqual(before);
        await window.screenshot({ path: info.outputPath('vscode-reloaded.png') });
      }
      if (age === 10) {
        // A real repeat of the producer keeps its first saved ID and body.
        pet.runProducer();
        expect(JSON.parse(fs.readFileSync(pet.voiceFile, 'utf8'))).toEqual(pet.voice);
        const afterProducer = snapshotPet(pet.petRoot);
        await panel.getByTitle('閉じる', { exact: true }).click();
        await window.waitForTimeout(30_100);
        await expect(bubble).toBeHidden();
        expect(snapshotPet(pet.petRoot)).toEqual(afterProducer);

        // Invalid display data traverses the real extension-host refresh route.
        for (const [name, content] of [
          ['stale', JSON.stringify({ ...pet.voice, date: '2000-01-01' })],
          ['corrupt', '{broken'],
          ['missing', null],
        ] as const) {
          if (content === null) fs.unlinkSync(pet.voiceFile);
          else fs.writeFileSync(pet.voiceFile, content);
          const untouched = snapshotPet(pet.petRoot);
          await window.waitForTimeout(30_100);
          await openPetCard(frame);
          await expect(panel).not.toContainText('きょうの第一声');
          await expect(bubble).toBeHidden();
          expect(snapshotPet(pet.petRoot)).toEqual(untouched);
          await window.screenshot({ path: info.outputPath(`vscode-${name}.png`) });
          await panel.getByTitle('閉じる', { exact: true }).click();
          console.log(`PASS VS Code ${name}: host polling cleared voice, pet files unchanged`);
        }
      }
      fs.writeFileSync(
        info.outputPath('vscode-evidence.json'),
        JSON.stringify(
          { click, reloadReplay, hook: pet.hook, voice: pet.voice, before, result: 'passed' },
          null,
          2,
        ),
      );
    } catch (error) {
      await session.window
        .screenshot({ path: info.outputPath('vscode-failure.png') })
        .catch(() => {});
      fs.writeFileSync(
        info.outputPath('vscode-frames.json'),
        JSON.stringify(
          await Promise.all(
            session.window.frames().map(async (f) => ({
              url: f.url(),
              petMessage: await f
                .evaluate(() => (window as any).__petMessage ?? null)
                .catch(() => null),
              text: await f
                .locator('body')
                .innerText()
                .catch(() => ''),
            })),
          ),
          null,
          2,
        ),
      );
      throw error;
    } finally {
      await session.cleanup();
    }
  });
}
