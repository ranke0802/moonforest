// A static, shared triangle BVH. Built once per tree geometry (including LODs),
// so the 10 Hz view check visits small leaves instead of scanning every polygon.
const LEAF_SIZE = 32;

export class TreeViewSurface {
  constructor(mesh) {
    this.positions = mesh.getVerticesData('position');
    this.indices = mesh.getIndices();
    const triangles = this.indices.length / 3;
    this.order = Uint32Array.from({length:triangles}, (_,i) => i);
    const capacity = 2 * 2 ** Math.ceil(Math.log2(Math.max(1, Math.ceil(triangles / LEAF_SIZE)))) - 1;
    this.bounds = new Float32Array(capacity * 6);
    this.children = new Int32Array(capacity * 2);
    this.ranges = new Uint32Array(capacity * 2);
    this.stack = [];
    const triangleBounds = new Float32Array(triangles * 6), centers = new Float32Array(triangles * 3);
    for (let t=0;t<triangles;t++) for (let axis=0;axis<3;axis++) {
      const a=this.positions[this.indices[t*3]*3+axis], b=this.positions[this.indices[t*3+1]*3+axis], c=this.positions[this.indices[t*3+2]*3+axis];
      triangleBounds[t*6+axis]=Math.min(a,b,c); triangleBounds[t*6+axis+3]=Math.max(a,b,c);
      centers[t*3+axis]=(a+b+c)/3;
    }
    const partition = (start,end,middle,axis) => {
      let left=start, right=end-1;
      while (left<right) {
        const pivot=centers[this.order[(left+right)>>1]*3+axis];
        let i=left,j=right;
        while (i<=j) {
          while (centers[this.order[i]*3+axis]<pivot) i++;
          while (centers[this.order[j]*3+axis]>pivot) j--;
          if (i<=j) {const swap=this.order[i];this.order[i++]=this.order[j];this.order[j--]=swap;}
        }
        if (middle<=j) right=j; else if (middle>=i) left=i; else break;
      }
    };
    let next=0;
    const build = (start,end) => {
      const node=next++, offset=node*6;
      this.bounds.set([Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity],offset);
      for (let i=start;i<end;i++) for (let axis=0;axis<3;axis++) {
        const t=this.order[i]*6;
        this.bounds[offset+axis]=Math.min(this.bounds[offset+axis],triangleBounds[t+axis]);
        this.bounds[offset+axis+3]=Math.max(this.bounds[offset+axis+3],triangleBounds[t+axis+3]);
      }
      if (end-start<=LEAF_SIZE) {this.ranges[node*2]=start;this.ranges[node*2+1]=end-start;return node;}
      let axis=0;
      for (let a=1;a<3;a++) if (this.bounds[offset+a+3]-this.bounds[offset+a]>this.bounds[offset+axis+3]-this.bounds[offset+axis]) axis=a;
      const middle=(start+end)>>1;partition(start,end,middle,axis);
      this.children[node*2]=build(start,middle);this.children[node*2+1]=build(middle,end);
      return node;
    };
    this.empty=triangles===0;
    if (!this.empty) build(0,triangles);
  }

  intersects(origin,target) {
    this.lastTriangleTests=0;
    if (this.empty) return false;
    const start=[origin.x,origin.y,origin.z], delta=[target.x-origin.x,target.y-origin.y,target.z-origin.z];
    const stack=this.stack;stack.length=0;stack.push(0);
    const p=this.positions, indices=this.indices;
    while (stack.length) {
      const node=stack.pop(), offset=node*6;
      let enter=.002,leave=.995;
      for (let axis=0;axis<3;axis++) {
        if (Math.abs(delta[axis])<1e-10) {
          if (start[axis]<this.bounds[offset+axis] || start[axis]>this.bounds[offset+axis+3]) {enter=2;break;}
        } else {
          const a=(this.bounds[offset+axis]-start[axis])/delta[axis], b=(this.bounds[offset+axis+3]-start[axis])/delta[axis];
          enter=Math.max(enter,Math.min(a,b));leave=Math.min(leave,Math.max(a,b));
          if (enter>leave) break;
        }
      }
      if (enter>leave) continue;
      const count=this.ranges[node*2+1];
      if (!count) {stack.push(this.children[node*2],this.children[node*2+1]);continue;}
      const first=this.ranges[node*2];
      for (let i=first;i<first+count;i++) {
        this.lastTriangleTests++;
        const triangle=this.order[i]*3, a=indices[triangle]*3,b=indices[triangle+1]*3,c=indices[triangle+2]*3;
        const ex=p[b]-p[a],ey=p[b+1]-p[a+1],ez=p[b+2]-p[a+2],fx=p[c]-p[a],fy=p[c+1]-p[a+1],fz=p[c+2]-p[a+2];
        const hx=delta[1]*fz-delta[2]*fy,hy=delta[2]*fx-delta[0]*fz,hz=delta[0]*fy-delta[1]*fx;
        const determinant=ex*hx+ey*hy+ez*hz;
        if (Math.abs(determinant)<1e-12) continue;
        const inverse=1/determinant,sx=start[0]-p[a],sy=start[1]-p[a+1],sz=start[2]-p[a+2];
        const u=(sx*hx+sy*hy+sz*hz)*inverse;
        if (u<0 || u>1) continue;
        const qx=sy*ez-sz*ey,qy=sz*ex-sx*ez,qz=sx*ey-sy*ex;
        const v=(delta[0]*qx+delta[1]*qy+delta[2]*qz)*inverse;
        if (v<0 || u+v>1) continue;
        const time=(fx*qx+fy*qy+fz*qz)*inverse;
        if (time>.002 && time<.995) return true;
      }
    }
    return false;
  }
}
