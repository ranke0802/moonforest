// Large compressed textures reach the GPU a strip at a time instead of in one call.
//
// Why (phone recording 2026-11-20): Babylon uploads a KTX2 texture in one synchronous loop
// over its mip levels. For a 4096 px texture that took 22-60 ms on the main thread.
//
// How: the texture gets immutable storage (WebGL2 texStorage2D) and its levels follow in
// horizontal strips aligned to the 4x4 block grid, within a byte budget per frame. The
// texture is reported loaded only when every level is up (splitTextureUploadDone), so
// nothing is ever drawn half-filled: a streamed texture keeps showing the one it replaces
// until then, exactly as before. The picture is the same; only the work is spread out.
//
// It is a rule on size, not a list of assets: any KTX2 texture whose top level is at least
// `minBytes` takes this path, so new maps need no registration. Everything else, and any
// format the device rejects (probed once on a scratch texture), keeps Babylon's own upload.
//
// The render loop is paused during map travel and behind modal screens. A timer keeps the
// queue moving then, with a larger budget since there is no frame to protect.
const states=new WeakMap();
const UNCOMPRESSED=new Set([0x8058,0x8229,0x822b]);
export const SPLIT_UPLOAD_DEFAULTS=Object.freeze({minBytes:1<<20,syncLevelBytes:1<<18,bandBytes:1<<20,bytesPerFrame:1<<20,idleBytes:16<<20,idleAfterMs:100,timerMs:50,idleTimerMs:4});
const blocks=(width,height)=>Math.ceil(width/4)*Math.ceil(height/4);
const bytesOf=data=>data instanceof Uint8Array?data:ArrayBuffer.isView(data)?new Uint8Array(data.buffer,data.byteOffset,data.byteLength):new Uint8Array(data);
const alive=internal=>!!internal?._hardwareTexture?.underlyingResource;

// Under review it is opt-in, apart from the existing upload: ?splitupload=1 turns it on for
// this tab and stays on across the game's page reloads (map travel); ?splitupload=0 turns it off.
const SWITCH_KEY='moonforest:splitupload';
export function splitUploadRequested(search,storage){
  let value=null;
  try{value=new URLSearchParams(search??'').get('splitupload');}catch{}
  try{
    storage??=globalThis.sessionStorage;
    if(value==='1')storage?.setItem(SWITCH_KEY,'1');else if(value==='0')storage?.removeItem(SWITCH_KEY);
    return value==='1'||(value!=='0'&&storage?.getItem(SWITCH_KEY)==='1');
  }catch{return value==='1';}
}

export function enableSplitTextureUpload(engine,options={}){
  if(!engine)return null;
  if(states.has(engine))return states.get(engine);
  const gl=engine._gl;
  if(!gl||!(engine.webGLVersion>=2)||typeof gl.texStorage2D!=='function'||typeof gl.compressedTexSubImage2D!=='function')return null;
  const state={engine,gl,options:{...SPLIT_UPLOAD_DEFAULTS,...options},jobs:[],waiting:new WeakMap(),formats:new Map(),support:new Map(),
    now:options.now??(()=>performance.now()),setTimer:options.setTimer??((fn,ms)=>setTimeout(fn,ms)),clearTimer:options.clearTimer??(id=>clearTimeout(id)),
    timer:null,lastFrameAt:-Infinity,tick:null,
    stats:{textures:0,bands:0,bytes:0,dropped:0,unsupported:0,maxFrameBytes:0,maxPumpMs:0,idlePumps:0,maxIdlePumpMs:0},begin:null,lost:null};
  state.tick=()=>{
    state.timer=null;if(!state.jobs.length)return;
    if(state.now()-state.lastFrameAt>state.options.idleAfterMs){state.stats.idlePumps++;pump(state,state.options.idleBytes,true);}
    arm(state);
  };
  state.begin=engine.onBeginFrameObservable?.add(()=>{state.lastFrameAt=state.now();if(state.jobs.length)pump(state,frameBudget(state));})??null;
  // A lost context takes every GL texture with it; Babylon rebuilds them through its normal path.
  state.lost=engine.onContextLostObservable?.add(()=>{for(const job of state.jobs)job.settle(true);state.jobs.length=0;state.support.clear();})??null;
  states.set(engine,state);return state;
}
export function disableSplitTextureUpload(engine){
  const state=states.get(engine);if(!state)return false;
  if(state.jobs.length)pump(state,Infinity,true);
  if(state.begin)engine.onBeginFrameObservable?.remove(state.begin);
  if(state.lost)engine.onContextLostObservable?.remove(state.lost);
  if(state.timer!==null){state.clearTimer(state.timer);state.timer=null;}
  states.delete(engine);return true;
}
export function splitTextureUploadStats(engine){const state=states.get(engine);return state?{...state.stats,pending:state.jobs.length}:null;}
// Null when this texture is not waiting; otherwise resolves true once every level is up,
// false if the texture was disposed first.
export function splitTextureUploadDone(engine,internal){return states.get(engine)?.waiting.get(internal)??null;}

const frameBudget=state=>{const budget=state.options.bytesPerFrame;return typeof budget==='function'?budget():budget;};
function arm(state){
  if(state.timer!==null||!state.jobs.length)return;
  const idle=state.now()-state.lastFrameAt>state.options.idleAfterMs;
  state.timer=state.setTimer(state.tick,idle?state.options.idleTimerMs:state.options.timerMs);
}

// The GL format Babylon would use for this texture (its sRGB choice included), read from
// Babylon's own upload call without letting that call reach the GPU. Babylon 9.31 takes
// texStorage2D + compressedTexSubImage2D when the texture has mipmaps and
// compressedTexImage2D otherwise, and remembers the allocation on the hardware texture:
// all three are intercepted and that flag is put back.
const SPIED=[['texStorage2D',2],['compressedTexSubImage2D',6],['compressedTexImage2D',2]];
function glFormat(state,transcoded,internal,smallest){
  const key=transcoded+':'+(internal._useSRGBBuffer?1:0),known=state.formats.get(key);
  if(known){if(known.srgbOff)internal._useSRGBBuffer=false;return known.format;}
  const gl=state.gl,srgb=!!internal._useSRGBBuffer,hardware=internal._hardwareTexture,allocated=hardware?.memoryAllocated;
  const saved=SPIED.map(([name])=>[name,Object.prototype.hasOwnProperty.call(gl,name),gl[name]]);
  let format=null;
  for(const [name,index] of SPIED)gl[name]=function(){format??=arguments[index];};
  try{state.engine._uploadCompressedDataToTextureDirectly(internal,transcoded,smallest.width,smallest.height,smallest.data,0,0);}
  catch{format=null;}
  finally{
    for(const [name,own,previous] of saved){if(own)gl[name]=previous;else delete gl[name];}
    if(hardware)hardware.memoryAllocated=allocated;
  }
  if(typeof format!=='number')format=null;
  state.formats.set(key,{format,srgbOff:srgb&&!internal._useSRGBBuffer});return format;
}
// Does this device accept strips of this format into immutable storage? Asked once per format.
function supported(state,format,blockBytes){
  const known=state.support.get(format);if(known!==undefined)return known;
  const gl=state.gl;let ok=false;
  try{
    for(let i=0;i<8&&gl.getError()!==gl.NO_ERROR;i++);
    const scratch=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,scratch);
    gl.texStorage2D(gl.TEXTURE_2D,2,format,16,16);
    gl.compressedTexSubImage2D(gl.TEXTURE_2D,1,0,0,8,8,format,new Uint8Array(4*blockBytes));
    gl.compressedTexSubImage2D(gl.TEXTURE_2D,0,0,0,16,8,format,new Uint8Array(8*blockBytes));
    gl.compressedTexSubImage2D(gl.TEXTURE_2D,0,0,8,16,8,format,new Uint8Array(8*blockBytes));
    ok=gl.getError()===gl.NO_ERROR;
    gl.bindTexture(gl.TEXTURE_2D,null);gl.deleteTexture(scratch);
  }catch{ok=false;}
  // Raw binds went past Babylon's cache of bound textures: make it bind again.
  state.engine._bindTextureDirectly(gl.TEXTURE_2D,null,false,true);
  state.support.set(format,ok);return ok;
}

// Called in place of KhronosTextureContainer2._createTexture. True: handled here.
export function splitTextureUpload(engine,data,internal,options){
  const state=states.get(engine);if(!state||!internal||internal.isCube)return false;
  const mips=data?.mipmaps,first=mips?.[0];
  if(!first?.data||data.errors||(data.layerCount??1)>1||UNCOMPRESSED.has(data.transcodedFormat))return false;
  if(first.data.byteLength<state.options.minBytes)return false;
  const blockBytes=first.data.byteLength/blocks(first.width,first.height);
  if(blockBytes!==8&&blockBytes!==16)return false;
  for(const mip of mips)if(!mip?.data||mip.data.byteLength!==blocks(mip.width,mip.height)*blockBytes)return false;
  const gl=state.gl,format=glFormat(state,data.transcodedFormat,internal,mips[mips.length-1]);
  if(format==null||!supported(state,format,blockBytes)){state.stats.unsupported++;return false;}
  engine._bindTextureDirectly(gl.TEXTURE_2D,internal);
  if(options){options.transcodedFormat=data.transcodedFormat;options.isInGammaSpace=data.isInGammaSpace;options.hasAlpha=data.hasAlpha;options.transcoderName=data.transcoderName;}
  internal.format=data.transcodedFormat;internal._gammaSpace=data.isInGammaSpace;internal.generateMipMaps=mips.length>1;internal.width=first.width;internal.height=first.height;
  internal._extension='.ktx2';
  gl.texStorage2D(gl.TEXTURE_2D,mips.length,format,first.width,first.height);
  if(internal._hardwareTexture)internal._hardwareTexture.memoryAllocated=true;   // Babylon's own flag: storage exists
  // The small levels cost nothing: send them now. The large ones wait their turn.
  const levels=[];
  for(let t=mips.length-1;t>=0;t--){
    const mip=mips[t];
    if(mip.data.byteLength<=state.options.syncLevelBytes)gl.compressedTexSubImage2D(gl.TEXTURE_2D,t,0,0,mip.width,mip.height,format,bytesOf(mip.data));
    else levels.push({t,width:mip.width,height:mip.height,data:bytesOf(mip.data),row:0});
  }
  engine._bindTextureDirectly(gl.TEXTURE_2D,null);
  state.stats.textures++;
  if(!levels.length){internal.isReady=true;return true;}
  let settle;const done=new Promise(resolve=>{settle=resolve;});
  state.jobs.push({internal,format,blockBytes,levels,settle});state.waiting.set(internal,done);arm(state);
  return true;
}

// idle: no frame is being rendered (timer or shutdown), so its cost is kept out of the per-frame figures.
function pump(state,budget,idle=false){
  const {gl,engine,jobs,stats,options}=state,started=state.now();let spent=0;
  while(jobs.length&&budget>0){
    const job=jobs[0];
    if(!alive(job.internal)){jobs.shift();stats.dropped++;job.settle(false);continue;}   // disposed with its map: let the data go
    engine._bindTextureDirectly(gl.TEXTURE_2D,job.internal);
    while(budget>0&&job.levels.length){
      const level=job.levels[0],rowBytes=Math.ceil(level.width/4)*job.blockBytes,totalRows=Math.ceil(level.height/4);
      const rows=Math.max(1,Math.min(totalRows-level.row,Math.floor(Math.min(budget,options.bandBytes)/rowBytes)));
      const y=level.row*4,height=Math.min(level.height-y,rows*4);
      gl.compressedTexSubImage2D(gl.TEXTURE_2D,level.t,0,y,level.width,height,job.format,level.data.subarray(level.row*rowBytes,(level.row+rows)*rowBytes));
      level.row+=rows;budget-=rows*rowBytes;spent+=rows*rowBytes;stats.bands++;
      if(level.row>=totalRows){level.data=null;job.levels.shift();}
    }
    engine._bindTextureDirectly(gl.TEXTURE_2D,null);
    if(!job.levels.length){jobs.shift();job.internal.isReady=true;job.settle(true);}
  }
  stats.bytes+=spent;const ms=state.now()-started;
  if(idle){if(ms>stats.maxIdlePumpMs)stats.maxIdlePumpMs=ms;}
  else{if(spent>stats.maxFrameBytes)stats.maxFrameBytes=spent;if(ms>stats.maxPumpMs)stats.maxPumpMs=ms;}
}
