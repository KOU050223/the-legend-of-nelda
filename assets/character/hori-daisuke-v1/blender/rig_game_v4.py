import bpy
import math
import json
from pathlib import Path
from mathutils import Vector, Quaternion

ROOT=Path(__file__).resolve().parent
DEG=math.pi/180

def smooth(a,b,x):
    t=max(0,min(1,(x-a)/(b-a)))
    return t*t*(3-2*t)

def arm_space(p,side):
    pivot=Vector((side*.114,.006,.79))
    return pivot+Quaternion((0,1,0),-side*35*DEG)@(Vector(p)-pivot)

def build():
    assert 'Hori_Rig' not in bpy.data.objects
    if bpy.context.object and bpy.context.object.mode!='OBJECT': bpy.ops.object.mode_set(mode='OBJECT')
    col=bpy.data.collections['GAME_HORI_V4']
    defs=[('root',(0,0,0),(0,0,.08),None),('hips',(0,.006,.49),(0,.005,.59),'root'),('spine',(0,.005,.59),(0,.005,.70),'hips'),('chest',(0,.005,.70),(0,.006,.81),'spine'),('neck',(0,.006,.81),(0,.007,.875),'chest'),('head',(0,.007,.875),(0,.007,.987),'neck')]
    for side,s in [(1,'L'),(-1,'R')]:
        sh=Vector((side*.114,.006,.79)); el=arm_space((side*.157,.008,.643),side); wr=arm_space((side*.186,-.015,.505),side); palm=arm_space((side*.192,-.018,.451),side)
        defs.extend([(f'clavicle.{s}',(side*.025,.006,.808),sh,'chest'),(f'upper_arm.{s}',sh,el,f'clavicle.{s}'),(f'forearm.{s}',el,wr,f'upper_arm.{s}'),(f'hand.{s}',wr,palm,f'forearm.{s}')])
        for j,length in enumerate([.034,.042,.040,.032]):
            x=side*(.178+j*.009); zs=[.453,.438,.445-length]
            for k in range(2):
                defs.append((f'finger{j+1}_{k+1}.{s}',arm_space((x,-.019-k*.003,zs[k]),side),arm_space((x,-.022-k*.003,zs[k+1]),side),f'hand.{s}' if k==0 else f'finger{j+1}_1.{s}'))
        defs.extend([(f'thumb1.{s}',arm_space((side*.181,-.016,.489),side),arm_space((side*.167,-.025,.468),side),f'hand.{s}'),(f'thumb2.{s}',arm_space((side*.167,-.025,.468),side),arm_space((side*.163,-.029,.451),side),f'thumb1.{s}')])
        defs.extend([(f'thigh.{s}',(side*.047,.01,.475),(side*.056,-.004,.280),'hips'),(f'shin.{s}',(side*.056,-.004,.280),(side*.061,.008,.057),f'thigh.{s}'),(f'foot.{s}',(side*.061,.008,.057),(side*.061,-.058,.020),f'shin.{s}'),(f'toe.{s}',(side*.061,-.058,.020),(side*.061,-.084,.019),f'foot.{s}'),(f'CTRL_Foot.{s}',(side*.061,.008,.057),(side*.061,-.058,.020),'root'),(f'CTRL_Knee.{s}',(side*.056,-.25,.28),(side*.056,-.25,.32),'root')])
    d=bpy.data.armatures.new('Hori_Humanoid'); rig=bpy.data.objects.new('Hori_Rig',d); col.objects.link(rig)
    bpy.ops.object.select_all(action='DESELECT'); rig.select_set(True); bpy.context.view_layer.objects.active=rig
    bpy.ops.object.mode_set(mode='EDIT')
    for name,h,t,parent in defs:
        b=d.edit_bones.new(name); b.head=h; b.tail=t
        if parent: b.parent=d.edit_bones[parent]
        b.use_deform=not name.startswith('CTRL_') and name!='root'
    bpy.ops.object.mode_set(mode='OBJECT'); rig.show_in_front=True; d.display_type='OCTAHEDRAL'
    def assign(o,v,weights):
        weights={k:w for k,w in weights.items() if w>1e-6}; total=sum(weights.values())
        for name,w in weights.items():
            g=o.vertex_groups.get(name) or o.vertex_groups.new(name=name)
            g.add([v.index],w/total,'REPLACE')
    for o in list(col.objects):
        if o.type!='MESH': continue
        for v in o.data.vertices:
            x,y,z=v.co; side=1 if x>=0 else -1; s='L' if side==1 else 'R'
            if o.name in ['Hori_Hair','Hori_FaceDetails']:
                weights={'head':1}
            elif o.name=='Hori_SkinHead':
                h=smooth(.85,.895,z); ch=1-smooth(.80,.84,z)
                weights={'head':h,'neck':(1-h)*(1-ch),'chest':(1-h)*ch}
            elif o.name.startswith('Hori_ArmHand'):
                if z<.459:
                    # Fingers are classified in original rest coordinates before A-pose rotation.
                    if abs(x)<.174 and z>.443:
                        t=smooth(.455,.475,z); weights={f'thumb1.{s}':t,f'thumb2.{s}':1-t}
                    else:
                        j=max(0,min(3,round((abs(x)-.178)/.009)))+1
                        hand=smooth(.446,.461,z); joint=smooth(.428,.444,z)
                        weights={f'hand.{s}':hand,f'finger{j}_1.{s}':(1-hand)*joint,f'finger{j}_2.{s}':(1-hand)*(1-joint)}
                elif z<.522:
                    if abs(x)<.175 and z<.490:
                        hand=smooth(.469,.492,z); weights={f'hand.{s}':hand,f'thumb1.{s}':1-hand}
                    else:
                        hand=1-smooth(.495,.522,z); weights={f'hand.{s}':hand,f'forearm.{s}':1-hand}
                else:
                    upper=smooth(.620,.677,z); weights={f'upper_arm.{s}':upper,f'forearm.{s}':1-upper}
                v.co=arm_space(v.co,side)
            elif o.name=='Hori_Shirt':
                arm=smooth(.085,.138,abs(x))*(1-smooth(.792,.825,z))
                spine=1-smooth(.60,.70,z)
                weights={f'upper_arm.{s}':arm,'chest':(1-arm)*(1-spine),'spine':(1-arm)*spine}
                v.co=v.co.lerp(arm_space(v.co,side),arm)
            elif o.name=='Hori_Pants':
                hip=smooth(.412,.493,z); thigh=smooth(.257,.311,z); ankle=1-smooth(.056,.09,z)
                weights={'hips':hip,f'thigh.{s}':(1-hip)*thigh,f'shin.{s}':(1-hip)*(1-thigh)*(1-ankle),f'foot.{s}':(1-hip)*(1-thigh)*ankle}
            elif o.name.startswith('Hori_Shoe'):
                weights={f'foot.{s}':1}  # Flat sole follows foot rigidly; no shin influence at contact.
            else: raise RuntimeError(o.name)
            assign(o,v,weights)
        o.data.update()
        m=o.modifiers.new('Hori_Skinning','ARMATURE'); m.object=rig; m.use_deform_preserve_volume=False
        o.parent=rig
    # Foot IK is authoring-only; exported actions will be baked onto deform bones.
    for s in ['L','R']:
        c=rig.pose.bones[f'shin.{s}'].constraints.new('IK'); c.name='Leg_IK'; c.target=rig; c.subtarget=f'CTRL_Foot.{s}'; c.chain_count=2; c.use_stretch=False
        c.pole_target=rig; c.pole_subtarget=f'CTRL_Knee.{s}'
        best=None
        for angle in [0,math.pi/2,-math.pi/2,math.pi]:
            c.pole_angle=angle; bpy.context.view_layer.update()
            knee=rig.pose.bones[f'shin.{s}'].head
            targetx=.056 if s=='L' else -.056
            score=abs(knee.x-targetx)+abs(knee.y+.02)
            if best is None or score<best[0]: best=(score,angle)
        c.pole_angle=best[1]
        c=rig.pose.bones[f'foot.{s}'].constraints.new('COPY_ROTATION'); c.target=rig; c.subtarget=f'CTRL_Foot.{s}'; c.target_space='WORLD'; c.owner_space='WORLD'
    rig['rest_pose']='A-pose; arms 35 degrees out from relaxed source'; rig['forward']='-Y Blender; +Z glTF after axis conversion'
    rig['scale']='normalized height=1.0; ground Z=0; engine height controlled by parent scale'
    bpy.context.view_layer.update()
    return {'bones':len(d.bones),'deform_bones':sum(b.use_deform for b in d.bones),'meshes':len([o for o in col.objects if o.type=='MESH']),'rest_pose':'A'}

def world_rotation(bone,axis,angle):
    rest=bone.bone.matrix_local.to_quaternion()
    bone.rotation_mode='QUATERNION'; bone.rotation_quaternion=rest.inverted()@Quaternion(axis,angle)@rest

def animate():
    rig=bpy.data.objects['Hori_Rig']; s=bpy.context.scene; s.render.fps=30
    rig.animation_data_create()
    reports={}
    for action_name,frames in [('Idle',61),('Walk',31),('Guard',31),('Jab',25),('HitReact',25),('RigCheck',61)]:
        action=bpy.data.actions.new(action_name); rig.animation_data.action=action
        contact=[]
        for f in range(1,frames+1):
            t=(f-1)/(frames-1); phase=2*math.pi*t; s.frame_set(f)
            for pb in rig.pose.bones:
                pb.location=(0,0,0); pb.rotation_mode='QUATERNION'; pb.rotation_quaternion=(1,0,0,0); pb.scale=(1,1,1)
            rig.pose.bones['hips'].location.z=.0015*math.sin(phase)
            for side,suffix in [(1,'L'),(-1,'R')]:
                upper=rig.pose.bones[f'upper_arm.{suffix}']; lower=rig.pose.bones[f'forearm.{suffix}']
                world_rotation(upper,(0,1,0),side*29*DEG)
                world_rotation(lower,(1,0,0),-5*DEG)
                if action_name=='Walk':
                    ph=(t+(0 if side==1 else .5))%1
                    foot=rig.pose.bones[f'CTRL_Foot.{suffix}']
                    # World-space translation expressed in the control's rest basis.
                    if ph<.6:
                        y=-.043+.086*ph/.6; lift=0
                    else:
                        u=(ph-.6)/.4; y=.043-.086*smooth(0,1,u); lift=.027*math.sin(math.pi*u)**1.2
                    delta=Vector((0,y,lift))
                    foot.location=foot.bone.matrix_local.to_3x3().inverted()@delta
                    world_rotation(upper,(1,0,0),side*.20*math.sin(phase))
                    # Combine arm-down and sagittal swing rather than reverting to A pose.
                    q=upper.rotation_quaternion.copy(); world_rotation(upper,(0,1,0),side*29*DEG); upper.rotation_quaternion=q@upper.rotation_quaternion
                    rig.pose.bones['hips'].location.z=-.006+.0015*math.cos(2*phase)
                elif action_name in ['Guard','Jab','HitReact']:
                    pulse=math.sin(math.pi*t)**2
                    if action_name=='Guard': pulse=smooth(0,.25,t)*(1-smooth(.75,1,t))
                    world_rotation(upper,(1,0,0),-35*DEG*pulse)
                    q=upper.rotation_quaternion.copy(); world_rotation(upper,(0,1,0),side*(29-8*pulse)*DEG); upper.rotation_quaternion=q@upper.rotation_quaternion
                    world_rotation(lower,(1,0,0),-(5+85*pulse)*DEG)
                    if action_name=='Jab' and suffix=='L':
                        world_rotation(upper,(1,0,0),-75*DEG*pulse)
                        world_rotation(lower,(1,0,0),-(5+15*pulse)*DEG)
                    if action_name=='HitReact':
                        world_rotation(rig.pose.bones['chest'],(1,0,0),15*DEG*pulse)
                elif action_name=='RigCheck':
                    pulse=math.sin(math.pi*t)
                    world_rotation(upper,(1,0,0),-55*DEG*pulse)
                    world_rotation(lower,(1,0,0),-100*DEG*pulse)
                    world_rotation(rig.pose.bones[f'hand.{suffix}'],(0,0,1),side*20*DEG*pulse)
                    world_rotation(rig.pose.bones['head'],(0,0,1),25*DEG*math.sin(phase))
                    rig.pose.bones['hips'].location.z=-.045*pulse
                # Relax/flex finger joints; strongest closed-hand poses in guard/jab.
                for pb in rig.pose.bones:
                    if (pb.name.startswith('finger') or pb.name.startswith('thumb')) and pb.name.endswith('.'+suffix):
                        flex=(12 if '_1.' in pb.name else 20)*DEG
                        if action_name in ['Guard','Jab']: flex+=40*DEG*math.sin(math.pi*t)**2
                        world_rotation(pb,(1,0,0),-flex)
            bpy.context.view_layer.update()
            # Per-frame contact correction uses evaluated soles, not assumed bone heights.
            for suffix in ['L','R']:
                shoe=bpy.data.objects[f'Hori_Shoe_{suffix}']; deps=bpy.context.evaluated_depsgraph_get(); ev=shoe.evaluated_get(deps)
                me=ev.to_mesh(); minz=min((ev.matrix_world@v.co).z for v in me.vertices); ev.to_mesh_clear()
                target=0
                if action_name=='Walk':
                    ph=(t+(0 if suffix=='L' else .5))%1
                    target=0 if ph<.6 else .027*math.sin(math.pi*(ph-.6)/.4)**1.2
                foot=rig.pose.bones[f'CTRL_Foot.{suffix}']
                foot.location+=foot.bone.matrix_local.to_3x3().inverted()@Vector((0,0,target-minz))
            bpy.context.view_layer.update()
            for pb in rig.pose.bones:
                pb.keyframe_insert('location',frame=f,group=pb.name)
                pb.keyframe_insert('rotation_quaternion',frame=f,group=pb.name)
            contact.append({'frame':f})
        action.use_fake_user=True
        reports[action_name]={'frames':frames,'duration':(frames-1)/30}
    rig.animation_data.action=bpy.data.actions['Idle']; s.frame_start=1; s.frame_end=61; s.frame_set(1)
    return {'actions':reports}

def validate():
    rig=bpy.data.objects['Hori_Rig']; scene=bpy.context.scene
    weights={}
    for o in bpy.data.collections['GAME_HORI_V4'].objects:
        if o.type!='MESH': continue
        sums=[sum(g.weight for g in v.groups) for v in o.data.vertices]
        weights[o.name]={'vertices':len(sums),'unweighted':sum(x<1e-6 for x in sums),'max_weight_sum_error':max(abs(x-1) for x in sums),'max_influences':max(len(v.groups) for v in o.data.vertices)}
    actions={}
    for name in ['Idle','Walk','Guard','Jab','HitReact','RigCheck']:
        rig.animation_data.action=bpy.data.actions[name]
        minimum=1e9; maximum_contact_error=0; finite=True
        for f in range(1,int(rig.animation_data.action.frame_range[1])+1):
            scene.frame_set(f); bpy.context.view_layer.update(); deps=bpy.context.evaluated_depsgraph_get()
            for suffix in ['L','R']:
                o=bpy.data.objects['Hori_Shoe_'+suffix]; ev=o.evaluated_get(deps); me=ev.to_mesh()
                z=min((ev.matrix_world@v.co).z for v in me.vertices); ev.to_mesh_clear(); minimum=min(minimum,z)
                if name!='Walk': maximum_contact_error=max(maximum_contact_error,abs(z))
            for pb in rig.pose.bones: finite=finite and all(math.isfinite(x) for row in pb.matrix for x in row)
        actions[name]={'minimum_sole_z':minimum,'max_contact_error_nonwalk':maximum_contact_error,'finite_bone_matrices':finite}
    rig.animation_data.action=bpy.data.actions['Idle']; scene.frame_set(1)
    report={'weights':weights,'actions':actions,'bones':len(rig.data.bones),'deform_bones':sum(b.use_deform for b in rig.data.bones)}
    return report

def bake_export_actions():
    rig=bpy.data.objects['Hori_Rig']; scene=bpy.context.scene
    bpy.ops.object.select_all(action='DESELECT'); rig.select_set(True); bpy.context.view_layer.objects.active=rig
    names=['Idle','Walk','Guard','Jab','HitReact','RigCheck']
    # Visual bake each action while IK constraints still exist. No constraints in GLB needed.
    for name in names:
        source=bpy.data.actions[name]; rig.animation_data.action=source
        end=int(source.frame_range[1])
        bpy.ops.nla.bake(frame_start=1,frame_end=end,step=1,only_selected=False,visual_keying=True,clear_constraints=False,use_current_action=False,bake_types={'POSE'})
        baked=rig.animation_data.action; source.name=name+'_AUTHORING_IK'; baked.name=name; baked.use_fake_user=True
    # Archive the control rig in the blend; export only a copy with baked actions and no constraints.
    rig.animation_data.action=bpy.data.actions['Idle']; scene.frame_set(1)
    return {'baked':names}
