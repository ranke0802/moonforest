import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1800,
    // UI/game changes must not invalidate the much larger engine download.
    rolldownOptions: { output: { codeSplitting: { groups: [
      {name:'babylon-tools',test:/node_modules[\\/]@babylonjs[\\/]core[\\/]Gizmos[\\/]/,priority:20,entriesAware:true},
      // Keep the game's initial engine dependency closure together. Additional
      // lazy tools must not partition it into hundreds of tiny shared requests.
      {name:'babylon-game',test:/node_modules[\\/]@babylonjs[\\/]/,tags:['$initial'],priority:10,entriesAware:false},
      {name:'babylon-lazy',test:/node_modules[\\/]@babylonjs[\\/]/,entriesAware:true,entriesAwareMergeThreshold:16384},
    ] } } },
  },
  server: { port: 4173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
