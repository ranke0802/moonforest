import {SceneInstrumentation} from '@babylonjs/core/Instrumentation/sceneInstrumentation.js';

// All observers are installed only while the diagnostic HUD is enabled.
// These are CPU submission times, never presented as GPU execution time.
export class SceneDiagnostics {
  constructor(){this.scene=null;this.instrumentation=null;this.result={};}
  setEnabled(enabled,scene){
    if(this.instrumentation&&(!enabled||scene!==this.scene)){this.instrumentation.dispose();this.instrumentation=null;this.scene=null;}
    if(enabled&&scene&&!this.instrumentation){this.scene=scene;const i=this.instrumentation=new SceneInstrumentation(scene);i.captureFrameTime=true;i.captureAnimationsTime=true;}
  }
  sample(){const i=this.instrumentation;if(!i)return {};
    this.result.drawCalls=i.drawCallsCounter.current;this.result.sceneMs=i.frameTimeCounter.current;this.result.animationMs=i.animationsTimeCounter.current;return this.result;}
  dispose(){this.setEnabled(false);}
}
