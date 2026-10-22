// Keep full-resolution frames, but do no scene work while the view is suspended.
export class FrameLoop {
  constructor(engine, draw, now = () => performance.now()) {
    this.engine=engine;this.draw=draw;this.now=now;this.running=false;this.last=null;this.frames=0;
    this.frame=()=>{const time=this.now(),dt=this.last===null?0:Math.min(.1,Math.max(0,(time-this.last)/1000));this.last=time;this.frames++;this.draw(dt);};
    this.once=()=>{this.engine.stopRenderLoop(this.once);this.frames++;this.draw(0);};
  }
  setPaused(paused) {
    if(paused){this.engine.stopRenderLoop(this.frame);this.engine.stopRenderLoop(this.once);this.running=false;this.last=null;}
    else if(!this.running){this.engine.stopRenderLoop(this.once);this.last=null;this.running=true;this.engine.runRenderLoop(this.frame);}
  }
  invalidate(){if(!this.running)this.engine.runRenderLoop(this.once);}
}
