import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // LAN 접속 (폰/태블릿) 허용
    allowedHosts: true, // ngrok 등 외부 도메인 허용
    proxy: {
      // 프론트엔드에서 /api 로 보내는 요청을 백엔드(3000번)로 프록시 우회
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})
