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
        app: resolve(import.meta.dirname, 'app/index.html'),
        default: resolve(import.meta.dirname, 'index.html'),
        en: resolve(import.meta.dirname, 'en/index.html'),
        'en-how-to-play': resolve(
          import.meta.dirname,
          'en/how-to-play/index.html'
        ),
        fr: resolve(import.meta.dirname, 'fr/index.html'),
        'fr-how-to-play': resolve(
          import.meta.dirname,
          'fr/how-to-play/index.html'
        ),
        'zh-tw': resolve(import.meta.dirname, 'zh-tw/index.html'),
        'zh-tw-how-to-play': resolve(
          import.meta.dirname,
          'zh-tw/how-to-play/index.html'
        )
      }
    }
  }
})
