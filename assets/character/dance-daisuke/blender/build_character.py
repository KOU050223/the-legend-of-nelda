"""Low-poly dance character; execute with rfingadam-blender and __file__ set."""
import bpy
import bmesh
import math
import json
from pathlib import Path
from mathutils import Vector, Quaternion

ROOT = Path(__file__).resolve().parents[1]
SCENE = 'DanceDaisuke_Asset'
if bpy.data.scenes.get(SCENE):
    raise RuntimeError('Dance scene already exists. Inspect before rebuilding.')
for folder in ('blender', 'export', 'previews'):
    (ROOT / folder).mkdir(parents=True, exist_ok=True)
scene = bpy.data.scenes.new(SCENE)
bpy.context.window.scene = scene
parts = []

def mat(name, rgb, roughness=.8):
    m = bpy.data.materials.new('Dance_' + name)
    m.diffuse_color = (*rgb, 1); m.use_nodes = True
    bs = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bs.inputs['Base Color'].default_value = (*rgb, 1)
    bs.inputs['Roughness'].default_value = roughness
    return m

skin = mat('Skin', (.56,.36,.245))
hair = mat('Hair', (.012,.015,.022), .58)
shirt = mat('Shirt', (.018,.024,.034), .73)
pants = mat('Pants', (.013,.018,.028))
detail = mat('ClothDetails', (.034,.043,.059))
shoes = mat('Shoes', (.012,.014,.02), .42)
white = mat('Eyes', (.76,.76,.68))
dark = mat('EyesAndBrows', (.012,.011,.013))
lip = mat('Lips', (.28,.12,.09))
metal = mat('Metal', (.23,.25,.27), .4)

def mesh(name, verts, faces, material, weights, smooth=True):
    data=bpy.data.meshes.new('Dance_'+name)
    data.from_pydata(verts, [], faces); data.update()
    o=bpy.data.objects.new('Dance_'+name, data); scene.collection.objects.link(o)
    data.materials.append(material)
    for p in data.polygons: p.use_smooth=smooth
    if isinstance(weights,str): weights=[{weights:1} for _ in verts]
    if weights:
        for i,entry in enumerate(weights):
            for bone,w in entry.items():
                group=o.vertex_groups.get(bone) or o.vertex_groups.new(name=bone)
                if w>0: group.add([i],w,'REPLACE')
        parts.append(o)
    return o

def ell(name,p,r,material,bone,seg=12,rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,location=p)
    o=bpy.context.object; o.name='Dance_'+name; o.scale=r
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(material)
    for f in o.data.polygons: f.use_smooth=True
    if bone:
        o.vertex_groups.new(name=bone).add(list(range(len(o.data.vertices))),1,'REPLACE')
        parts.append(o)
    return o

def box(name,p,size,material,bone,bevel=.0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=p)
    o=bpy.context.object; o.name='Dance_'+name; o.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(material)
    if bone:
        o.vertex_groups.new(name=bone).add(list(range(len(o.data.vertices))),1,'REPLACE'); parts.append(o)
    if bevel:
        mod=o.modifiers.new('Corner','BEVEL'); mod.width=bevel; mod.segments=1
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def sweep(name, centers, radii, material, weights, sides=10, depth=1):
    verts=[]; faces=[]; ws=[]
    for i,p in enumerate(centers):
        tangent=Vector(centers[min(i+1,len(centers)-1)])-Vector(centers[max(i-1,0)])
        tangent.normalize(); u=tangent.cross(Vector((0,1,0)))
        if u.length<.01: u=tangent.cross(Vector((1,0,0)))
        u.normalize(); v=tangent.cross(u).normalized()
        for j in range(sides):
            a=2*math.pi*j/sides
            verts.append(Vector(p)+radii[i]*(math.cos(a)*u+depth*math.sin(a)*v))
            ws.append({weights:1} if isinstance(weights,str) else weights[i])
    for i in range(len(centers)-1):
        for j in range(sides):
            a=i*sides+j; b=i*sides+(j+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.extend([tuple(reversed(range(sides))),tuple((len(centers)-1)*sides+j for j in range(sides))])
    return mesh(name,verts,faces,material,ws)

def ringbody(name, levels, material, weights, sides=16, smooth=True):
    verts=[]; faces=[]; ws=[]
    for i,(z,xr,yr,cy) in enumerate(levels):
        for j in range(sides):
            a=math.tau*j/sides
            verts.append((xr*math.cos(a),cy+yr*math.sin(a),z))
            ws.append({weights:1} if isinstance(weights,str) else weights[i])
    for i in range(len(levels)-1):
        for j in range(sides):
            a=i*sides+j; b=i*sides+(j+1)%sides; faces.append((a,b,b+sides,a+sides))
    faces += [tuple(reversed(range(sides))),tuple((len(levels)-1)*sides+j for j in range(sides))]
    return mesh(name,verts,faces,material,ws,smooth)

# Slender adult proportions, relaxed expression and asymmetric swept fringe.
ringbody('Torso',[(.86,.155,.095,0),(.94,.165,.098,0),(1.04,.148,.09,0),(1.16,.175,.105,0),(1.28,.208,.097,0),(1.335,.151,.071,0)],shirt,
         [{'Hips':.65,'Spine':.35},{'Spine':1},{'Spine':1},{'Spine':.45,'Chest':.55},{'Chest':1},{'Chest':1}])
ell('Neck',(0,0,1.384),(.061,.06,.089),skin,'Neck')
ringbody('Head',[(1.421,.046,.055,-.005),(1.446,.071,.08,-.008),(1.488,.101,.089,0),(1.56,.12,.099,0),(1.64,.121,.10,0),(1.71,.101,.083,.008),(1.738,.068,.06,.014)],skin,'Head',16)
for s in (-1,1):
    ell('Ear'+str(s),(s*.12,.008,1.578),(.023,.025,.041),skin,'Head',10,6)
    ell('EarInset'+str(s),(s*.131,-.013,1.578),(.009,.004,.02),lip,'Head',8,6)
    ell('Eye'+str(s),(s*.05,-.092,1.617),(.028,.011,.0135),white,'Head')
    ell('Iris'+str(s),(s*.049,-.102,1.616),(.010,.005,.011),dark,'Head',10,6)
    ell('EyeGlint'+str(s),(s*.049-.003,-.107,1.62),(.0023,.002,.0023),white,'Head',8,4)
    sweep('UpperLid'+str(s),[(s*.024,-.102,1.624),(s*.05,-.105,1.63),(s*.078,-.088,1.624)],[.0025]*3,skin,'Head',6)
    sweep('Brow'+str(s),[(s*.024,-.097,1.647),(s*.048,-.10,1.654),(s*.08,-.086,1.651)],[.005,.006,.003],dark,'Head',6)
ell('NoseBridge',(0,-.099,1.592),(.016,.021,.038),skin,'Head')
ell('NoseTip',(0,-.12,1.572),(.023,.022,.017),skin,'Head',10,6)
sweep('Mouth',[(-.033,-.086,1.514),(0,-.096,1.51),(.033,-.086,1.516)],[.003,.004,.0025],lip,'Head',6)
ell('LowerLip',(0,-.091,1.503),(.023,.006,.006),skin,'Head',10,6)

def add_sunglasses():
    frame = mat('SunglassesFrame', (.008,.009,.012), .34)
    lens = mat('SunglassesLens', (.008,.013,.024), .22)
    for side in (-1,1):
        outline = [(side*x,y,z) for x,y,z in [
            (.015,-.133,1.632),(.031,-.132,1.64),(.091,-.113,1.638),
            (.107,-.105,1.629),(.102,-.109,1.600),(.089,-.117,1.590),
            (.032,-.137,1.590),(.017,-.139,1.600)]]
        verts = outline + [(x,y+.006,z) for x,y,z in outline]
        faces = [tuple(range(8)),tuple(reversed(range(8,16)))]
        faces += [(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
        mesh('SunglassesLens'+str(side),verts,faces,lens,'Head',False)
        sweep('SunglassesRim'+str(side),outline+[outline[0]],[.0038]*9,frame,'Head',6)
        sweep('SunglassesTemple'+str(side),[(side*.105,-.108,1.628),(side*.13,-.052,1.628),(side*.134,.016,1.613)],
              [.0045,.004,.0038],frame,'Head',6)
    sweep('SunglassesBridge',[(-.017,-.137,1.627),(0,-.144,1.632),(.017,-.137,1.627)],
          [.0038]*3,frame,'Head',6)

add_sunglasses()

# Hair shell wraps the skull; broad tapered locks merge into the cap.
verts=[]; faces=[]; n=18
for k in range(6):
    t=k/5
    for j in range(n):
        a=math.tau*j/n
        front=max(0,-math.sin(a))
        bottom=1.592+front*.104
        z=bottom+(1.809-bottom)*math.sin(t*math.pi/2)
        radius=math.cos(t*math.pi/2)*(.99+.08*math.sin(t*math.pi))
        verts.append((.132*math.cos(a)*radius-.018*t,.012+.112*math.sin(a)*radius,z))
for k in range(5):
    for j in range(n):
        a=k*n+j; b=k*n+(j+1)%n; faces.append((a,b,b+n,a+n))
mesh('HairShell',verts,faces,hair,'Head')
for i in range(5):
    x=.058-i*.029
    sweep('SweptFringe'+str(i),[(x+.026,-.021,1.768),(x+.005,-.081,1.768-i*.006),(x-.035,-.108,1.716-i*.012),(x-.047,-.102,1.664-i*.006)],
          [.032,.034,.025,.0035],hair,'Head',8,depth=.49)
for s in (-1,1):
    sweep('SideHair'+str(s),[(s*.11,.01,1.704),(s*.124,-.011,1.633),(s*.116,-.016,1.593)],[.031,.018,.008],hair,'Head',8,.8)

# Open standing collar, center placket, dark buttons and rolled short sleeves.
for s in (-1,1):
    collar=box('Collar'+str(s),(s*.064,-.034,1.352),(.040,.095,.072),shirt,'Chest',.008)
    collar.rotation_euler[1]=s*.26
    sweep('CollarEdge'+str(s),[(s*.034,-.080,1.377),(s*.064,-.09,1.323)],[.003,.003],detail,'Chest',4)
sweep('Placket',[(0,-.097,.903),(0,-.101,.985),(0,-.10,1.11),(0,-.109,1.23),(0,-.072,1.326)],[.004]*5,detail,
      [{'Spine':1},{'Spine':1},{'Spine':.7,'Chest':.3},{'Chest':1},{'Chest':1}],4)
for i,z in enumerate((.954,1.035,1.117,1.20,1.275)):
    ell('Button'+str(i),(0,-(.112 if z>1.10 else .104),z),(.004,.003,.004),metal,'Chest' if z>1.12 else 'Spine',8,4)
ringbody('Pelvis',[(.78,.15,.087,0),(.856,.164,.095,0),(.913,.161,.096,0)],pants,'Hips')
ringbody('Belt',[(.895,.164,.099,0),(.923,.164,.099,0)],shoes,'Hips')
box('Buckle',(0,-.104,.909),(.030,.008,.021),metal,'Hips',.003)

bones=[('Root',(0,0,0),(0,0,.15),None),('Hips',(0,0,.85),(0,0,1.0),'Root'),
       ('Spine',(0,0,1.0),(0,0,1.17),'Hips'),('Chest',(0,0,1.17),(0,0,1.335),'Spine'),
       ('Neck',(0,0,1.335),(0,0,1.43),'Chest'),('Head',(0,0,1.43),(0,0,1.74),'Neck')]
for s,side in [(-1,'R'),(1,'L')]:
    upper='UpperArm.'+side; fore='Forearm.'+side; hand='Hand.'+side
    thigh='Thigh.'+side; shin='Shin.'+side; foot='Foot.'+side
    shoulder=Vector((s*.195,0,1.292)); elbow=Vector((s*.31,0,1.073)); wrist=Vector((s*.404,-.012,.875))
    hip=Vector((s*.087,0,.836)); knee=Vector((s*.132,0,.465)); ankle=Vector((s*.174,0,.105))
    bones.extend([(upper,shoulder,elbow,'Chest'),(fore,elbow,wrist,upper),(hand,wrist,(s*.434,-.019,.774),fore),
                  (thigh,hip,knee,'Hips'),(shin,knee,ankle,thigh),(foot,ankle,(s*.174,-.13,.051),shin)])
    centers=[shoulder.lerp(elbow,t) for t in (-.09,.1,.45,.78,.9)]
    sweep('Sleeve'+side,centers,[.055,.065,.059,.052,.05],shirt,upper,12)
    ell('Shoulder'+side,shoulder,(.059,.06,.06),shirt,upper,12,8)
    sweep('SleeveRoll'+side,[shoulder.lerp(elbow,t) for t in (.78,.85,.93)],[.055,.055,.050],detail,upper,12)
    centers=[shoulder.lerp(elbow,.85),elbow.lerp(wrist,-.03),elbow.lerp(wrist,.10),elbow.lerp(wrist,.3),elbow.lerp(wrist,.68),wrist]
    sweep('Arm'+side,centers,[.041,.045,.045,.044,.036,.026],skin,
          [{upper:1},{upper:.6,fore:.4},{upper:.2,fore:.8},{fore:1},{fore:1},{fore:.6,hand:.4}],12)
    ell('Wrist'+side,wrist,(.026,.025,.026),skin,hand,10,6)
    palm=ell('Palm'+side,(s*.422,-.012,.828),(.034,.025,.049),skin,hand,12,8)
    palm.rotation_euler[1]=-s*.20
    for i in range(4):
        x=s*(.402+i*.014)
        length=[.044,.054,.051,.039][i]
        sweep('Finger'+side+str(i),[(x,-.011,.800),(x+s*.008,-.016,.778),(x+s*.012,-.021,.800-length)],
              [.0085,.008,.005],skin,hand,8)
    sweep('Thumb'+side,[(s*.398,-.007,.84),(s*.38,-.02,.824),(s*.378,-.032,.805)],[.012,.01,.007],skin,hand,8)
    centers=[hip.lerp(knee,t) for t in (-.12,.08,.5,.9)]+[knee,knee.lerp(ankle,.10),knee.lerp(ankle,.5),ankle]
    radii=[.074,.078,.073,.060,.059,.057,.05,.043]
    sweep('Leg'+side,centers,radii,pants,[{thigh:1},{thigh:1},{thigh:1},{thigh:.85,shin:.15},{thigh:.5,shin:.5},{thigh:.15,shin:.85},{shin:1},{shin:1}],12,1.04)
    box('Sole'+side,(s*.174,-.043,.022),(.13,.237,.044),shoes,foot,.015)
    ell('Shoe'+side,(s*.174,-.048,.066),(.064,.117,.05),shoes,foot,12,8)
    sweep('ShoeSeam'+side,[(s*.174-.044,-.067,.089),(s*.174,-.076,.109),(s*.174+.044,-.067,.089)],[.002]*3,detail,foot,6)

bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active=parts[0]; bpy.ops.object.join()
model=bpy.context.object; model.name='DanceDaisuke_Mesh'
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
bm=bmesh.new(); bm.from_mesh(model.data)
bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces)); bm.to_mesh(model.data); bm.free()
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(island_margin=.02); bpy.ops.object.mode_set(mode='OBJECT')
data=bpy.data.armatures.new('DanceDaisuke_Skeleton'); rig=bpy.data.objects.new('DanceDaisuke_Rig',data)
scene.collection.objects.link(rig); model.select_set(False); rig.select_set(True); bpy.context.view_layer.objects.active=rig
bpy.ops.object.mode_set(mode='EDIT')
for name,a,b,parent in bones:
    bone=data.edit_bones.new(name); bone.head=a; bone.tail=b
    if parent: bone.parent=data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
model.parent=rig; mod=model.modifiers.new('Skin','ARMATURE'); mod.object=rig; rig.show_in_front=True

def orient(name,direction):
    pb=rig.pose.bones[name]; rest=pb.bone.matrix_local.to_quaternion()
    current_axis=rest @ Vector((0,1,0))
    desired=current_axis.rotation_difference(Vector(direction).normalized()) @ rest
    inherited=Quaternion()
    if pb.parent:
        inherited=pb.parent.matrix.to_quaternion() @ pb.parent.bone.matrix_local.to_quaternion().inverted()
    pb.rotation_mode='QUATERNION'; pb.rotation_quaternion=rest.inverted() @ inherited.inverted() @ desired
    bpy.context.view_layer.update()

scene.render.fps=24; scene.frame_start=1; scene.frame_end=97
# Stylized original 4-second arm dance inspired by the supplied silhouettes.
poses=[
    (1,(-.55,0,-1),(-.35,0,-1),(.55,0,-1),(.35,0,-1),0),
    (13,(-.6,-.1,-.8),(.4,-.7,.3),(1,0,.02),(1,0,.04),-.025),
    (25,(-.7,0,-.8),(.5,-.8,.4),(1,0,.07),(1,0,.10),-.045),
    (37,(-.85,0,.52),(.75,-.18,.85),(.92,-.10,.12),(-.94,-.45,.20),.015),
    (49,(-.9,0,.35),(.8,-.1,.9),(.84,-.25,.14),(-1,-.35,.25),.025),
    (61,(-1,0,.08),(-1,0,.08),(.6,0,-.8),(-.5,-.8,.4),.04),
    (73,(-1,0,.03),(-1,0,.03),(.6,0,-.8),(-.5,-.8,.4),.025),
    (85,(-.6,-.35,-.7),(.3,-.5,-.7),(.6,-.35,-.7),(-.3,-.5,-.7),0),
    (97,(-.55,0,-1),(-.35,0,-1),(.55,0,-1),(.35,0,-1),0)]
for frame,ur,fr,ul,fl,lean in poses:
    for pb in rig.pose.bones:
        pb.rotation_mode='QUATERNION'; pb.rotation_quaternion=Quaternion(); pb.location=(0,0,0)
    bpy.context.view_layer.update()
    orient('Spine',(lean,0,1)); orient('Chest',(lean,.015,1)); orient('Head',(-lean,0,1))
    for side,u,f in [('R',ur,fr),('L',ul,fl)]:
        orient('UpperArm.'+side,u); orient('Forearm.'+side,f); orient('Hand.'+side,f)
    for pb in rig.pose.bones:
        pb.keyframe_insert(data_path='rotation_quaternion',frame=frame,group=pb.name)
rig.animation_data.action.name='DanceDaisuke_Loop'
scene.frame_set(1)

world=bpy.data.worlds.new('DanceDaisuke_World'); world.use_nodes=True; scene.world=world
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
bg.inputs[0].default_value=(.075,.083,.11,1); bg.inputs[1].default_value=.6
floor=box('PreviewFloor',(0,0,-.043),(200,200,.04),mat('Backdrop',(.041,.043,.06)),None)
def aim(o,p): o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
for name,p,energy,size in [('Key',(-3,-4,5),520,4),('Fill',(3,-3,2.5),270,3),('Rim',(1,3,4),550,3)]:
    ld=bpy.data.lights.new('Dance_'+name,'AREA'); ld.energy=energy; ld.shape='DISK'; ld.size=size
    lo=bpy.data.objects.new('Dance_'+name,ld); scene.collection.objects.link(lo); lo.location=p; aim(lo,(0,0,1))
cd=bpy.data.cameras.new('DanceDaisuke_Camera'); camera=bpy.data.objects.new('DanceDaisuke_Camera',cd); scene.collection.objects.link(camera)
cd.type='ORTHO'; cd.ortho_scale=2.16; scene.camera=camera
scene.render.engine='CYCLES'; scene.cycles.samples=24
scene.render.resolution_x=800; scene.render.resolution_y=900; scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'; scene.render.image_settings.file_format='PNG'
def render(name,position,frame=1):
    scene.frame_set(frame); camera.location=position; aim(camera,(0,0,.925))
    scene.render.filepath=str(ROOT/'previews'/name); bpy.ops.render.render(write_still=True)
render('front.png',(0,-4,1.3))
render('three-quarter.png',(.95,-4,1.65))
render('back.png',(.7,4,1.6))
render('dance-extend.png',(0,-4,1.3),25)
render('dance-cross.png',(0,-4,1.3),49)
scene.frame_set(1); camera.location=(.95,-4,1.65); aim(camera,(0,0,.925))
bpy.ops.object.select_all(action='DESELECT'); model.select_set(True); rig.select_set(True); bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(ROOT/'export/dance-daisuke.glb'),export_format='GLB',use_selection=True,use_active_scene=True,
                          export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name='Dance_Loop',export_anim_slide_to_zero=True,export_yup=True)
bpy.data.libraries.write(str(ROOT/'blender/dance-daisuke.blend'),{scene},fake_user=True,compress=True)
model.data.calc_loop_triangles()
result={'vertices':len(model.data.vertices),'triangles':len(model.data.loop_triangles),'bones':len(data.bones),'materials':len(model.data.materials),
        'height':model.dimensions.z,'unweighted':sum(not v.groups for v in model.data.vertices),'glb':str(ROOT/'export/dance-daisuke.glb')}
print(json.dumps(result))
