"""Render a read-only source rig review with authored actions in Blender 4.5."""
import bpy, json, math, sys
from pathlib import Path
from mathutils import Vector

OUT=Path(__file__).resolve().parents[1]/'reports/elena-two-phase'
SOURCE=Path(r'C:/Users/ryank/Documents/ChatGPT/MM Project/output/elina-three-model-review/2026-10-30-v1/rigging/tripo-1-move/exports/tripo1_move_rig.blend')
def main():
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE),load_ui=False)
    scene=bpy.context.scene
    scene.render.engine='BLENDER_EEVEE_NEXT'
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.render.film_transparent=False
    scene.render.threads_mode='FIXED';scene.render.threads=4
    if scene.world is None:scene.world=bpy.data.worlds.new('AssetReviewWorld')
    scene.world.color=(.08,.08,.08)
    scene.view_settings.view_transform='Standard';scene.view_settings.look='Medium High Contrast';scene.view_settings.exposure=0;scene.view_settings.gamma=1
    camera_data=bpy.data.cameras.new('AssetReviewCamera');camera=bpy.data.objects.new('AssetReviewCamera',camera_data);scene.collection.objects.link(camera);scene.camera=camera
    camera_data.type='ORTHO';camera_data.ortho_scale=1.42;camera_data.lens=45
    def aim(position,target=(0,0,.46)):
        camera.location=position;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.004));floor=bpy.context.object;floor.name='AssetReviewGround'
    mat=bpy.data.materials.new('AssetReviewGround');mat.diffuse_color=(.13,.16,.18,1);floor.data.materials.append(mat)
    for name,location,power,size in [('AssetKey',(-1,-2,3),300,3),('AssetFill',(2,-.5,2),100,3),('AssetRim',(0,2,2),180,2)]:
        d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=location;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
    rig=bpy.data.objects['RIG_Elina_Tripo1_Move'];body=bpy.data.objects['Elina_Chimera_Skin'];keys=body.data.shape_keys
    for t in rig.animation_data.nla_tracks:t.mute=True
    samples=[]
    def sample(clip,seconds,label,size=640,view='quarter'):
        a=bpy.data.actions[clip];rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0]
        frame=1+seconds*30;scene.frame_set(int(frame),subframe=frame%1);bpy.context.view_layer.update()
        scene.render.resolution_x=size;scene.render.resolution_y=size
        pos={'front':(0,-2.7,1.65),'side':(2.7,0,1.65),'back':(0,2.7,1.65),'quarter':(1.7,-2.3,1.65)}[view];aim(pos)
        path=OUT/('asset-'+label+'.png');scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
        deps=bpy.context.evaluated_depsgraph_get();ro=rig.evaluated_get(deps)
        bones={n:list(ro.matrix_world@ro.pose.bones[n].head)for n in ['DEF_Prayer_Hand.L','DEF_Prayer_Hand.R','DEF_FrontHand.L_Palm','DEF_Chest','DEF_Head']}
        samples.append({'label':label,'clip':clip,'seconds':seconds,'frame':frame,'view':view,'resolution':size,'path':str(path),'morphs':{k.name:k.value for k in keys.key_blocks},'bones':bones})
    walk='Chimera_Organic_Walk_2p4s';cast='Chimera_Arcane_Cast_3s'
    motion_only='--motion-only' in sys.argv
    if motion_only:
        for i in range(78):
            t=i/10
            clip,ct=(walk,t)if t<2.4 else ((cast,t-2.4)if t<5.4 else (walk,t-5.4))
            sample(clip,ct,f'motion-frame-{i:03d}',320)
    else:
        for view in ['front','side','back']:sample(walk,0,'source-'+view,960,view)
        sample(walk,0,'source-front-low',384,'front')
        seq=[(walk,.3),(walk,.9),(cast,0),(cast,.6),(cast,1.2),(cast,1.8),(cast,2.4),(cast,3),(walk,0),(walk,.6)]
        for i,(clip,t)in enumerate(seq):sample(clip,t,f'source-sequence-{i:02d}',512)
    report=OUT/('asset-blender-motion-report.json'if motion_only else 'asset-blender-render-report.json')
    report.write_text(json.dumps({'blender':bpy.app.version_string,'sourceBlend':str(SOURCE),'sourceModified':False,'sequence':'authored walk -> cast -> walk action samples, no re-rigging; direct clip transitions without runtime blending','camera':'orthographic elevated game-like front/side/back and quarter','samples':samples},indent=2)+'\n',encoding='utf-8')
    print('RESULT '+json.dumps({'rendered':len(samples),'report':str(report)}))
main()
