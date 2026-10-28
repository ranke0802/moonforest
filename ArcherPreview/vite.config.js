import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1800,
    // UI/game changes must not invalidate the much larger engine download.
    rolldownOptions: { output: { codeSplitting: { groups: [
      {name:'babylon',test:/node_modules[\\/]@babylonjs[\\/]/,entriesAware:true},
    ] } } },
  },
  server: { port: 4173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
