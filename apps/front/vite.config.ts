import { resolve } from 'path'
import { defineConfig } from 'vite'
// Problème sur MacOS et Node 20 quand on utilise `@vitejs/plugin-react`
// (qui utilise lui-même `@babel/core`)
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        // https://vitejs.dev/guide/build.html#multi-page-app
        default: resolve(__dirname, 'index.html'),
        en: resolve(__dirname, 'en/index.html'),
        fr: resolve(__dirname, 'fr/index.html'),
        'zh-tw': resolve(__dirname, 'zh-tw/index.html')
      }
    }
  }
})
