import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const codespaceName = process.env.CODESPACE_NAME
const codespacesDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
const codespacesHost =
  codespaceName && codespacesDomain ? `${codespaceName}-5173.${codespacesDomain}` : undefined

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: ['localhost', '127.0.0.1', '.github.dev', '.app.github.dev'],
    hmr: codespacesHost
      ? {
          protocol: 'wss',
          host: codespacesHost,
          clientPort: 443,
        }
      : undefined,
  },
})
