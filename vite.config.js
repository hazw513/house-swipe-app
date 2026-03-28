import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/house-swipe-app/',
  server: {
    host:true,
    proxy: {
      '/hm-api': {
        target: 'https://housemetric.co.uk',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/hm-api/, ''),
      },
      '/rm-api': {
        target: 'https://www.rightmove.co.uk',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rm-api/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      },
    },
  },
})
