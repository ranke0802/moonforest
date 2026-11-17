import { defineConfig } from 'vite';

// Resource bundles are opaque `.mfp.gz` payloads that the game verifies by
// byte count and unpacks itself. The dev/preview static server labels `.gz`
// files with `Content-Encoding: gzip`, so a browser would inflate them in
// transit and every cold-cache download would fail the size check. Serve
// them as plain bytes, exactly like the published static host does.
const bundlePath=/\/assets\/bundles\/[^?#]+\.mfp\.gz(?:[?#]|$)/;
function rawResourceBundles(){
  const middleware=(req,res,next)=>{
    if(bundlePath.test(req.url??'')){
      const setHeader=res.setHeader.bind(res),writeHead=res.writeHead.bind(res);
      res.setHeader=(name,value)=>String(name).toLowerCase()==='content-encoding'?res:setHeader(name,value);
      res.writeHead=(status,...rest)=>{
        for(const headers of rest)if(headers&&typeof headers==='object'&&!Array.isArray(headers))for(const key of Object.keys(headers))if(key.toLowerCase()==='content-encoding')delete headers[key];
        return writeHead(status,...rest);
      };
    }
    next();
  };
  return {name:'moonforest-raw-resource-bundles',configureServer(server){server.middlewares.use(middleware);},configurePreviewServer(server){server.middlewares.use(middleware);}};
}

export default defineConfig({
  base: './',
  plugins: [rawResourceBundles()],
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
