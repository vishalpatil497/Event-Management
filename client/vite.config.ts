import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import type { PluginOption } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_URL ?? 'http://127.0.0.1:4000'
  const apiOrigin = apiTarget.replace(/\/api$/, '')
  const plugins: PluginOption[] = [react()]
  return {
    plugins,
    server: {
      host: true,
      port: 5173,
      strictPort: false,
      cors: { origin: true, credentials: true },
      proxy: {
        '/api': {
          target: apiOrigin,
          changeOrigin: true,
          secure: false,
          ws: false,
          cookieDomainRewrite: { '*': '' },
          configure: (proxy) => {
            proxy.on('error', (err, req) => {
              console.warn(`[vite] /api proxy error → ${req.url}: ${err.message}`)
            })
          },
        },
      },
    },
    preview: {
      port: 4173,
      cors: { origin: true, credentials: true },
    },
    build: {
      sourcemap: mode !== 'production',
      target: 'es2020',
    },
  }
})
