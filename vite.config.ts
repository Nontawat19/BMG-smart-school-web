import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path'; // ✅ ต้อง import path
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(), 
    nodePolyfills(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['Epp5 online.png', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'BMG Smart School',
        short_name: 'BMG Smart School',
        description: 'ระบบบริหารจัดการโรงเรียนแบบครบวงจร โดย BMG Smart School',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024 // 15MB
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'), // ✅ เพิ่ม alias
    },
  },
  optimizeDeps: {
    exclude: ['vite-plugin-node-polyfills'],
  },
});
