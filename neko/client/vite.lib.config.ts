import path from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue2'

export default defineConfig({
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
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/lib.ts'),
      name: 'neko-lib',
      formats: ['es', 'umd'],
      fileName: (format) => `neko-lib.${format}.js`,
    },
    rollupOptions: {
      external: ['vue'],
      output: {
        globals: {
          vue: 'Vue',
        },
      },
    },
  },
})
