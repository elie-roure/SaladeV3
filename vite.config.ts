import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => ({
  plugins: [vue()],
  define: mode === 'local-only' ? { 'import.meta.env.VITE_LOCAL_ONLY': '"true"' } : {},
  server: {
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
}))
