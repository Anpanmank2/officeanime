const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * Copy assets folder to dist/assets
 */
function copyAssets() {
  const srcDir = path.join(__dirname, 'webview-ui', 'public', 'assets');
  const dstDir = path.join(__dirname, 'dist', 'assets');

  if (fs.existsSync(srcDir)) {
    // Remove existing dist/assets if present
    if (fs.existsSync(dstDir)) {
      fs.rmSync(dstDir, { recursive: true });
    }

    // Copy recursively
    fs.cpSync(srcDir, dstDir, { recursive: true });
    console.log('✓ Copied assets/ → dist/assets/');
  } else {
    console.log('ℹ️  assets/ folder not found (optional)');
  }
}

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',

  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(`    ${location.file}:${location.line}:${location.column}:`);
      });
      console.log('[watch] build finished');
    });
  },
};

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode', 'bufferutil', 'utf-8-validate'],
    logLevel: 'silent',
    plugins: [
      /* add to the end of plugins array */
      esbuildProblemMatcherPlugin,
    ],
  });

  // Standalone launcher (no VS Code dependency)
  const standaloneCtx = await esbuild.context({
    entryPoints: ['src/jc/standalone-launcher.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/standalone.js',
    external: ['bufferutil', 'utf-8-validate'],
    banner: { js: '#!/usr/bin/env node' },
    logLevel: 'silent',
    plugins: [esbuildProblemMatcherPlugin],
  });

  if (watch) {
    await ctx.watch();
    await standaloneCtx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    await standaloneCtx.rebuild();
    await standaloneCtx.dispose();
    // Copy assets after build
    copyAssets();
    // Copy PWA files to dist/webview
    copyPwaFiles();
  }
}

/**
 * Copy PWA files (manifest.json, sw.js) to dist/webview
 */
function copyPwaFiles() {
  const publicDir = path.join(__dirname, 'webview-ui', 'public');
  const dstDir = path.join(__dirname, 'dist', 'webview');
  for (const file of ['manifest.json', 'sw.js']) {
    const src = path.join(publicDir, file);
    if (fs.existsSync(src)) {
      fs.cpSync(src, path.join(dstDir, file));
    }
  }
  console.log('✓ Copied PWA files → dist/webview/');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
