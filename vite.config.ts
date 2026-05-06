import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: {
        core: 'src/core.ts',
        app: 'src/app.ts'
      },
      cssFileName: 'styles',
      formats: ['es']
    },
    rollupOptions: {
      external: ['asn1js', 'pkijs', 'pkistudiojs']
    }
  }
});