# Companion integration QA

Build first with `npm run build`. Supply an absolute `OFFICE_PET_SOURCE` pointing
to an isolated, reviewed agent-pet checkout with daily first-voice persistence.
The suite executes its `pet-day-start.mjs --hook-json` against synthetic pets in
temporary homes; it does not install or change live hooks.

The default run uses a headless browser, the built standalone server and a
separate loopback port (21432, override with `OFFICE_PET_TEST_PORT`; 8432 is refused):

```sh
OFFICE_PET_SOURCE=/absolute/path/to/isolated/agent-pet \
  npx playwright test --config e2e/pet.config.ts
```

It checks six recorded growth stages, actual canvas clicks and card rendering,
saved-voice/HTTP/DOM equality, no-store, reload and ID deduplication, stale/missing/
corrupt/oversized display records, storage refusal, literal HTML and unchanged
pet records. A 612px renderer case checks the greeting above OFFICE LOG and below
the status card. This narrow headless case does not replace native extension QA.

Native VS Code QA is separate and requires `OFFICE_PET_VSCODE_QA=1`. It opens
IDE windows and can cause focus changes or macOS credential prompts. Run it only
in an explicitly selected environment where this will not interrupt the user.
The launcher does not call `security` or alter the default keychain. A basic
password-store request does not guarantee macOS will never prompt.

```sh
OFFICE_PET_VSCODE_QA=1 OFFICE_PET_SOURCE=/absolute/path/to/isolated/agent-pet \
  OFFICE_VSCODE_EXECUTABLE=/absolute/path/to/test/VSCode/executable \
  npx playwright test --config e2e/pet.config.ts
```

Without an executable override, global setup downloads VS Code (override the
version with `OFFICE_VSCODE_VERSION`). It uses isolated user data, extensions,
home and workspace, and disables login-shell environment resolution. The native
cases cover stage 2/5, real host polling and WebView reload. Record the tested
VS Code version and the source/build hashes. Native failures or interrupted runs
must remain unverified even when the headless suite passes.

Logs, screenshots and synthetic payloads go to `test-results/pet`; the JSON
report is `test-results/pet-results.json`. Copy evidence before a subsequent run,
because Playwright clears its output directory. Never place private liaison
messages, actual pet records or user credentials in this public repository.
