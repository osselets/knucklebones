import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        test: {
          name: 'common',
          environment: 'node',
          include: ['packages/common/src/**/*.test.ts']
        }
      },
      {
        test: {
          name: 'front',
          environment: 'jsdom',
          environmentOptions: {
            jsdom: { url: 'http://localhost/' }
          },
          include: ['apps/front/src/**/*.test.{ts,tsx}'],
          setupFiles: ['apps/front/src/test/setup.ts']
        }
      }
    ]
  }
})
