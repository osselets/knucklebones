import { resolve } from 'path'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
// Problème sur MacOS et Node 20 quand on utilise `@vitejs/plugin-react`
// (qui utilise lui-même `@babel/core`)
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        // https://vitejs.dev/guide/build.html#multi-page-app
        default: resolve(import.meta.dirname, 'index.html'),
        en: resolve(import.meta.dirname, 'en/index.html'),
        fr: resolve(import.meta.dirname, 'fr/index.html'),
        'zh-tw': resolve(import.meta.dirname, 'zh-tw/index.html')
      }
    }
  }
})
