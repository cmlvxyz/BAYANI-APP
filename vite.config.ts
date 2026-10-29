import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      fs: {
        allow: ['..'],
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // Bind every interface so a phone on the same LAN can open the app by IP.
      host: true,
      allowedHosts: true as const,
      // Same-origin bridge: the app calls `/bridge/*`, and Vite forwards it to
      // the backend on port 8000. This lets ONE tunnel (over https) reach both
      // the app and the backend — no CORS, works from any network.
      proxy: {
        '/bridge': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          ws: false,
          rewrite: (p) => p.replace(/^\/bridge/, ''),
          configure: (proxy) => {
            // The tunnel origin is not in the backend's CORS allow-list; strip
            // Origin/Referer so the backend treats these as server-to-server.
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.removeHeader('origin');
              proxyReq.removeHeader('referer');
            });
          },
        },
      },
    },
    preview: {
      host: true,
      allowedHosts: true as const,
    },
  };
});