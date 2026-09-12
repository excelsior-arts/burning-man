import {defineConfig} from 'vite';
export default defineConfig({
  build: {
    outDir: 'dist-runtime',
    lib: {
      entry: {index: 'src/character/index.ts', sand: 'src/sand/index.ts'},
      formats: ['es'],
      fileName: (_format, entry) => `${entry}.js`,
    },
    rolldownOptions: {external: (id) => id === 'three' || id.startsWith('three/')},
  },
});
