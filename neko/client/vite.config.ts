import path from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue2'

export default defineConfig({
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      vue$: 'vue/dist/vue.esm.js',
      '~': path.resolve(__dirname, 'src/'),
      '@': path.resolve(__dirname, 'src/'),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: '@import "@/assets/styles/_variables.scss";',
      },
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
})
