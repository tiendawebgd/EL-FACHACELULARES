import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'hmr-resilience-guard',
        apply: 'serve',
        transformIndexHtml: {
          order: 'pre',
          handler() {
            return [
              {
                tag: 'script',
                injectTo: 'head-prepend',
                children: `(function(){var m=function(v){var s=typeof v==='string'?v:(v&&v.message?String(v.message):String(v||''));return s.indexOf('WebSocket closed without opened')!==-1||s.indexOf('failed to connect to websocket')!==-1;};window.addEventListener('unhandledrejection',function(e){if(m(e.reason)){e.preventDefault();e.stopImmediatePropagation();}},true);window.addEventListener('error',function(e){if(m(e.error||e.message)){e.preventDefault();e.stopImmediatePropagation();}},true);var oe=console.error;console.error=function(){for(var i=0;i<arguments.length;i++){if(m(arguments[i])){console.warn('[vite] HMR WebSocket unavailable in managed environment; continuing without live reload.');return;}}return oe.apply(console,arguments);};})();`,
              },
            ];
          },
        },
      },
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
