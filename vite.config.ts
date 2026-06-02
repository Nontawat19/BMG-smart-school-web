import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path'; // ✅ ต้อง import path
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { VitePWA } from 'vite-plugin-pwa';
import http from 'http';

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
        skipWaiting: true,
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024 // 15MB
      }
    }),
    {
      name: 'camera-proxy-middleware',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url && req.url.startsWith('/camera-proxy/')) {
            try {
              const rawUrl = req.url;
              const proxyUrl = new URL(rawUrl, 'http://localhost');
              const target = proxyUrl.pathname.replace(/^\/camera-proxy\//, '');
              const slashIndex = target.indexOf('/');
              const hostPort = slashIndex >= 0 ? target.slice(0, slashIndex) : target;
              const pathName = slashIndex >= 0 ? target.slice(slashIndex) : '/';
              const targetUrl = new URL(`http://${hostPort}`);
              const port = targetUrl.port ? Number(targetUrl.port) : 80;

              if (!targetUrl.hostname || !Number.isInteger(port) || port < 1 || port > 65535) {
                res.statusCode = 400;
                res.end('Invalid camera proxy URL');
                return;
              }

              // Parse auth query param
              const auth = proxyUrl.searchParams.get('auth');
              
              // Rebuild target path without auth query param
              const queryParams = new URLSearchParams(proxyUrl.search);
              queryParams.delete('auth');
              const targetPath = pathName + (queryParams.toString() ? `?${queryParams.toString()}` : '');
              
              const headers: Record<string, string> = {};
              if (auth) {
                const base64Auth = Buffer.from(auth).toString('base64');
                headers['Authorization'] = `Basic ${base64Auth}`;
              }
              
              if (req.headers['accept']) headers['accept'] = req.headers['accept'];
              if (req.headers['cache-control']) headers['cache-control'] = req.headers['cache-control'];
              
              const proxyReq = http.request({
                host: targetUrl.hostname,
                port,
                path: targetPath,
                method: req.method,
                headers: headers,
                timeout: 5000
              }, (proxyRes) => {
                res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
                proxyRes.pipe(res);
              });
              
              proxyReq.on('error', (err) => {
                console.error(`Camera proxy error (${targetUrl.host}):`, err.message);
                res.statusCode = 500;
                res.end(`Camera proxy error: ${err.message}`);
              });
              
              req.pipe(proxyReq);
            } catch (err: any) {
              console.error('Camera proxy exception:', err);
              res.statusCode = 500;
              res.end(`Camera proxy exception: ${err.message}`);
            }
          } else {
            next();
          }
        });
      }
    }
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'), // ✅ เพิ่ม alias
    },
  },
  server: {
    proxy: {
      '/findface-api': {
        target: 'http://118.172.43.186:8356',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/findface-api/, ''),
      }
    }
  },
  optimizeDeps: {
    exclude: ['vite-plugin-node-polyfills'],
  },
});
