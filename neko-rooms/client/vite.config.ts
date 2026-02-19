import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: process.env.API_PROXY ? {
      '/api': {
        target: process.env.API_PROXY,
        timeout: 0,
      },
    } : undefined,
  },
})
