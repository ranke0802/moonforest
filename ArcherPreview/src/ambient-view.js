import {Frustum} from '@babylonjs/core/Maths/math.frustum.js';
import {Matrix} from '@babylonjs/core/Maths/math.vector.js';

// The sphere includes a motion margin. Also keep the pose if the light could
// project its shadow into view. Unknown or multiple cameras use normal updates.
export class AmbientView {
  planes = Frustum.GetPlanes(Matrix.Identity());
  prepare(world, castsShadow = true) {
    const scene = world.scene, camera = scene?.activeCamera;
    this.valid = false;
    if (!camera?.getTransformationMatrix || scene.activeCameras?.length || camera.cameraRigMode) return;
    const lighting = world.lighting;
    this.sun = !castsShadow || scene.shadowsEnabled === false || lighting?.shadowsActive === false ? null : lighting?.key?.direction;
    if (this.sun === undefined) return;
    const view = camera.getViewMatrix(), projection = camera.getProjectionMatrix();
    if (this.camera !== camera || this.viewId !== view.updateFlag || this.projId !== projection.updateFlag) {
      Frustum.GetPlanesToRef(camera.getTransformationMatrix(), this.planes);
      this.camera = camera; this.viewId = view.updateFlag; this.projId = projection.updateFlag;
    }
    this.valid = true;
  }
  hidden(x, y, z, radius) {
    if (!this.valid) return false;
    for (const plane of this.planes) {
      const n = plane.normal;
      if (n.x*x + n.y*y + n.z*z + plane.d >= -radius) continue;
      const ray = this.sun;
      if (!ray || n.x*ray.x + n.y*ray.y + n.z*ray.z <= 0) return true;
    }
    return false;
  }
}
