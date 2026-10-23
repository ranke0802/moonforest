import { Matrix, Vector3 } from '@babylonjs/core';

// One size read on resize, one camera snapshot per frame, shared by all HUDs.
export class ScreenProjection {
  constructor(scene) {
    this.scene = scene;
    this.identity = Matrix.Identity();
    this.point = new Vector3();
    this.result = {};
  }
  resize(width, height) { this.cssWidth = width; this.cssHeight = height; }
  beginFrame() {
    const engine = this.scene.getEngine();
    this.width = engine.getRenderWidth(); this.height = engine.getRenderHeight();
    this.scaleX = this.cssWidth / this.width; this.scaleY = this.cssHeight / this.height;
    this.viewport = this.scene.activeCamera.viewport.toGlobal(this.width, this.height);
    this.transform = this.scene.getTransformMatrix();
    return this;
  }
  project(position) {
    Vector3.ProjectToRef(position, this.identity, this.transform, this.viewport, this.point);
    const p = this.point, result = this.result;
    result.x = p.x * this.scaleX; result.y = p.y * this.scaleY;
    result.visible = p.z >= 0 && p.z <= 1 && p.x >= 0 && p.x <= this.width && p.y >= 0 && p.y <= this.height;
    return result;
  }
}
