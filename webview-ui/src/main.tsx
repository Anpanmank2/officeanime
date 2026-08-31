import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.tsx';
import { jcLoadPet } from './jc/pet-state.js';
import { isBrowserRuntime } from './runtime';

async function main() {
  if (isBrowserRuntime) {
    // Always load assets via HTTP fetch in browser mode.
    // WS provides live agent data; browserMock provides static assets (sprites, layout).
    const { initBrowserMock } = await import('./browserMock.js');
    await initBrowserMock();
    // Optional companion (agent-pet) — no-op when the user has none.
    await jcLoadPet(import.meta.env.BASE_URL);
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

main().catch(console.error);
