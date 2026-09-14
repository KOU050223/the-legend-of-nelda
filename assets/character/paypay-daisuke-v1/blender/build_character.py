"""Run through rfingadam-blender. Creates an isolated scene; preserves other scenes."""
import bpy
import bmesh
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
for folder in ('blender', 'export', 'previews'):
    (ROOT / folder).mkdir(parents=True, exist_ok=True)
if bpy.data.scenes.get('Daisuke_GameAsset'):
    raise RuntimeError('Scene already exists; inspect before rebuilding')
scene = bpy.data.scenes.new('Daisuke_GameAsset')
bpy.context.window.scene = scene
parts = []

def material(name, color, roughness=.8):
    m = bpy.data.materials.new('DG_' + name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bs = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Roughness'].default_value = roughness
    return m

skin = material('Skin', (.58,.32,.18))
hair = material('Hair', (.014,.012,.016))
blue = material('Shirt', (.018,.13,.47))
navy = material('Trousers', (.022,.026,.047))
red = material('Red', (.48,.013,.022), .38)
ivory = material('Ivory', (.82,.84,.79))
black = material('Black', (.012,.015,.023))
gold = material('Gold', (.7,.37,.075))
mouth = material('Mouth', (.095,.018,.021))
pink = material('Tongue', (.51,.13,.13))
check = material('TrouserCheck', (.055,.064,.095))

def finish(o, name, mat, bone):
    o.name = 'DG_' + name
    o.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bone:
        o.vertex_groups.new(name=bone).add(list(range(len(o.data.vertices))), 1, 'REPLACE')
        parts.append(o)
    return o

def ell(name, p, s, mat, bone, seg=12, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, location=p)
    o=bpy.context.object
    o.scale=s
    finish(o,name,mat,bone)
    for f in o.data.polygons: f.use_smooth=True
    return o

def box(name,p,s,mat,bone, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=p)
    o=bpy.context.object
    o.scale=s
    finish(o,name,mat,bone)
    if bevel:
        mod=o.modifiers.new('Soft corners','BEVEL'); mod.width=bevel; mod.segments=1
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def tube(name, points, radius, mat, bone, sides=6):
    verts=[]; faces=[]
    for i,p in enumerate(points):
        tangent=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(i-1,0)])
        tangent.normalize()
        u=tangent.cross(Vector((0,1,0)))
        if u.length < .01: u=tangent.cross(Vector((1,0,0)))
        u.normalize(); v=tangent.cross(u).normalized()
        for j in range(sides):
            a=2*math.pi*j/sides
            verts.append(Vector(p)+radius*(math.cos(a)*u+math.sin(a)*v))
    for i in range(len(points)-1):
        for j in range(sides):
            a=i*sides+j; b=i*sides+(j+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces += [tuple(reversed(range(sides))), tuple((len(points)-1)*sides+j for j in range(sides))]
    me=bpy.data.meshes.new(name); me.from_pydata(verts,[],faces); me.update()
    o=bpy.data.objects.new(name,me); scene.collection.objects.link(o)
    finish(o,name,mat,bone)
    for f in me.polygons: f.use_smooth=True
    return o

def lathe(name, levels, mat, bone, sides=12):
    verts=[]; faces=[]
    for z,rx,ry,cy in levels:
        for j in range(sides):
            a=2*math.pi*j/sides
            verts.append((rx*math.cos(a),cy+ry*math.sin(a),z))
    for i in range(len(levels)-1):
        for j in range(sides):
            a=i*sides+j; b=i*sides+(j+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces += [tuple(reversed(range(sides))),tuple((len(levels)-1)*sides+j for j in range(sides))]
    me=bpy.data.meshes.new(name); me.from_pydata(verts,[],faces); me.update()
    o=bpy.data.objects.new(name,me); scene.collection.objects.link(o)
    return finish(o,name,mat,bone)

lathe('Shirt',[(.85,.17,.10,0),(.94,.195,.115,0),(1.12,.185,.12,0),(1.30,.22,.10,0),(1.36,.14,.085,0)],blue,'Spine')
ell('Neck',(0,0,1.405),(.068,.065,.105),skin,'Head')
lathe('Face',[(1.43,.055,.065,-.018),(1.47,.095,.09,-.012),(1.55,.133,.105,0),(1.65,.137,.107,0),(1.74,.113,.095,.005),(1.77,.075,.07,.01)],skin,'Head',16)
for s in (-1,1):
    ell('Ear'+str(s),(s*.135,0,1.607),(.028,.027,.049),skin,'Head')
    ell('Cheek'+str(s),(s*.079,-.078,1.551),(.044,.019,.038),skin,'Head')
    ell('EyeWhite'+str(s),(s*.063,-.101,1.645),(.037,.016,.021),ivory,'Head')
    ell('Pupil'+str(s),(s*.06,-.116,1.646),(.012,.007,.014),black,'Head',10,6)
    ell('EyeGlint'+str(s),(s*.06-.004,-.122,1.652),(.0035,.002,.0035),ivory,'Head',8,4)
    tube('Brow'+str(s),[(s*.028,-.105,1.686),(s*.06,-.113,1.698),(s*.095,-.093,1.691)],.009,hair,'Head')
    cx=s*.065
    pts=[(cx+dx,-.13,1.642+dz) for dx,dz in [(-.046,.028),(-.026,.037),(.036,.034),(.047,.022),(.040,-.03),(.026,-.038),(-.024,-.038),(-.041,-.024),(-.046,.028)]]
    tube('GlassesRim'+str(s),pts,.008,red,'Head')
    tube('GlassesTemple'+str(s),[(s*.113,-.127,1.658),(s*.144,-.05,1.664),(s*.14,.017,1.644)],.007,red,'Head')
tube('GlassesBridge',[(-.018,-.135,1.655),(0,-.143,1.662),(.018,-.135,1.655)],.007,red,'Head')
ell('Nose',(0,-.12,1.601),(.027,.042,.035),skin,'Head')
smile=ell('Smile',(0,-.103,1.521),(.066,.021,.044),mouth,'Head')
for v in smile.data.vertices: v.co.z += .017*(abs(v.co.x)/.066)**2
box('UpperTeeth',(0,-.124,1.542),(.102,.008,.021),ivory,'Head',.005)
ell('Tongue',(0,-.123,1.494),(.028,.005,.010),pink,'Head')
ell('HairCap',(0,.014,1.777),(.139,.113,.125),hair,'Head',14,8)
for i in range(7):
    x=(i-3)*.035
    o=ell('Quiff'+str(i),(x,-.007,1.817+(.017 if i<3 else 0)),(.034,.103,.069),hair,'Head',8,6)
    o.rotation_euler[1]=-.20
for s in (-1,1):
    ell('Sideburn'+str(s),(s*.125,.005,1.691),(.014,.067,.061),hair,'Head',8,6)
    o=box('Collar'+str(s),(s*.046,-.092,1.331),(.073,.022,.080),ivory,'Spine',.005)
    o.rotation_euler[1]=s*.35
    ell('Bow'+str(s),(s*.045,-.12,1.303),(.044,.022,.030),red,'Spine',8,6)
    tube('BowStripe'+str(s),[(s*.052,-.142,1.327),(s*.036,-.143,1.28)],.004,gold,'Spine',4)
ell('BowKnot',(0,-.144,1.303),(.018,.014,.022),gold,'Spine',8,6)
for z in (.97,1.055,1.14,1.22):
    ell('Button'+str(z),(0,-.12,z),(.006,.005,.006),ivory,'Spine',8,4)
for s in (-1,1):
    x=s*.128
    path=[(x,-.099,.905),(x,-.111,1.04),(x,-.114,1.19),(x,-.08,1.335),(x,0,1.355),(x,.083,1.32),(x,.107,1.14),(s*.075,.106,.92)]
    tube('Suspender'+str(s),path,.016,red,'Spine',4)
    tube('SuspenderStripe'+str(s),[(a,b-.013,c) for a,b,c in path[:4]],.0035,gold,'Spine',4)
    for j in range(10):
        z=.94+j*.038
        box('SuspenderCheck'+str((s,j)),(x,-.13 if z<1.23 else -.104,z),(.030,.004,.008),black,'Spine')
    box('Buckle'+str(s),(x,-.122,.956),(.033,.012,.032),gold,'Spine',.003)
lathe('Hips',[(.78,.162,.094,0),(.9,.18,.108,0),(.94,.18,.108,0)],navy,'Hips')
lathe('Waistband',[(.915,.182,.111,0),(.944,.182,.111,0)],black,'Hips')
box('BeltBuckle',(0,-.113,.931),(.032,.009,.025),gold,'Hips',.003)

bones=[('Root',(0,0,0),(0,0,.18),None),('Hips',(0,0,.84),(0,0,1.0),'Root'),('Spine',(0,0,1.0),(0,0,1.34),'Hips'),('Head',(0,0,1.34),(0,0,1.78),'Spine')]
for s,side in [(-1,'R'),(1,'L')]:
    shoulder=(s*.205,0,1.29); elbow=(s*.31,0,1.08); wrist=(s*.39,-.012,.885)
    hip=(s*.093,0,.83); knee=(s*.104,0,.46); ankle=(s*.108,0,.115)
    bones += [('UpperArm.'+side,shoulder,elbow,'Spine'),('Forearm.'+side,elbow,wrist,'UpperArm.'+side),('Hand.'+side,wrist,(s*.41,-.018,.79),'Forearm.'+side),('Thigh.'+side,hip,knee,'Hips'),('Shin.'+side,knee,ankle,'Thigh.'+side),('Foot.'+side,ankle,(s*.108,-.13,.05),'Shin.'+side)]
    # Separate low-density sleeve sections overlap at elbows for the simple game rig.
    for label,a,b,r,bone in [('UpperSleeve',shoulder,elbow,.069,'UpperArm.'+side),('LowerSleeve',elbow,wrist,.054,'Forearm.'+side)]:
        tube(label+side,[a,b],r,blue,bone,10)
        ell(label+'Joint'+side,a,(r,r,r),blue,bone,10,6)
    ell('Cuff'+side,wrist,(.054,.052,.035),ivory,'Forearm.'+side,10,6)
    ell('Palm'+side,(s*.404,-.012,.827),(.042,.03,.061),skin,'Hand.'+side,10,6)
    ell('Thumb'+side,(s*.367,-.037,.833),(.017,.019,.033),skin,'Hand.'+side,8,6)
    for k in range(3):
        tube('FingerCrease'+side+str(k),[(s*(.389+.01*k),-.040,.797),(s*(.389+.01*k),-.041,.812)],.0018,mouth,'Hand.'+side,4)
    for label,a,b,r,bone in [('TrouserThigh',hip,knee,.091,'Thigh.'+side),('TrouserShin',knee,ankle,.073,'Shin.'+side)]:
        tube(label+side,[a,b],r,navy,bone,10)
        ell(label+'Joint'+side,a,(r,r,r),navy,bone,10,6)
        for z in ([.53,.62,.71,.79] if label=='TrouserThigh' else [.18,.26,.34,.42]):
            cx=s*(.10 if label=='TrouserThigh' else .107)
            tube('CheckLine'+side+str(z),[(cx-r*.8,-r*.60,z),(cx,-r-.001,z),(cx+r*.8,-r*.60,z)],.0012,check,bone,4)
        tube('CheckVertical'+side+label,[(a[0],-r-.002,a[2]),(b[0],-r-.002,b[2])],.0012,check,bone,4)
    box('Sole'+side,(s*.108,-.043,.025),(.153,.262,.05),black,'Foot.'+side,.017)
    ell('Shoe'+side,(s*.108,-.046,.064),(.076,.131,.056),black,'Foot.'+side,12,6)
    ell('ShoePanel'+side,(s*.108,-.04,.099),(.052,.072,.019),ivory,'Foot.'+side,10,6)
    for j in range(3):
        tube('Lace'+side+str(j),[(s*.108-.025,-.06+j*.016,.119),(s*.108+.025,-.05+j*.016,.119)],.003,red,'Foot.'+side,4)

# One skinned mesh, material palette, basic humanoid skeleton.
bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active=parts[0]
bpy.ops.object.join()
model=bpy.context.object; model.name='Daisuke_Character'
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
# Recalculate closed component normals and generate UVs for later editing.
bm=bmesh.new(); bm.from_mesh(model.data)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces)); bm.to_mesh(model.data); bm.free()
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(island_margin=.02)
bpy.ops.object.mode_set(mode='OBJECT')
armdata=bpy.data.armatures.new('Daisuke_Skeleton')
rig=bpy.data.objects.new('Daisuke_Rig',armdata); scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active=rig; model.select_set(False); rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name,head,tail,parent in bones:
    b=armdata.edit_bones.new(name); b.head=head; b.tail=tail
    if parent: b.parent=armdata.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
mod=model.modifiers.new('Game Rig','ARMATURE'); mod.object=rig
model.parent=rig
rig.show_in_front=True
scene.render.fps=24; scene.frame_start=1; scene.frame_end=49
for frame,v in [(1,0),(13,1),(25,0),(37,-1),(49,0)]:
    for name in ('Spine','Head','UpperArm.L','UpperArm.R'):
        pb=rig.pose.bones[name]; pb.rotation_mode='XYZ'
        pb.rotation_euler=(0,v*.012 if name=='Head' else 0,v*.014 if name=='Spine' else v*.009)
        pb.keyframe_insert(data_path='rotation_euler',frame=frame,group=name)
rig.animation_data.action.name='Idle'
scene.frame_set(1)

world=bpy.data.worlds.new('Daisuke_PreviewWorld'); world.use_nodes=True
background=next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
background.inputs[0].default_value=(.055,.052,.075,1)
background.inputs[1].default_value=.55; scene.world=world
floor=box('PreviewFloor',(0,0,-.035),(200,200,.03),material('Backdrop',(.033,.03,.05)),None)
def aim(o,p): o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
for name,loc,energy,size in [('Key',(-3,-4,5),450,4),('Fill',(3,-2,3),230,3),('Rim',(1,3,4),400,3)]:
    data=bpy.data.lights.new('DG_'+name,'AREA'); data.energy=energy; data.shape='DISK'; data.size=size
    o=bpy.data.objects.new('DG_'+name,data); scene.collection.objects.link(o); o.location=loc; aim(o,(0,0,1))
camdata=bpy.data.cameras.new('Daisuke_PreviewCamera'); cam=bpy.data.objects.new('Daisuke_PreviewCamera',camdata)
scene.collection.objects.link(cam); camdata.type='ORTHO'; camdata.ortho_scale=2.23; scene.camera=cam
scene.render.engine='CYCLES'; scene.cycles.samples=32
scene.render.resolution_x=800; scene.render.resolution_y=900; scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene.render.image_settings.file_format='PNG'
cam.location=(.65,-4,2.0); aim(cam,(0,0,.96))
scene.render.filepath=str(ROOT/'previews/three-quarter.png')
bpy.ops.render.render(write_still=True)
cam.location=(.7,4,1.8); aim(cam,(0,0,.96))
scene.render.filepath=str(ROOT/'previews/back.png')
bpy.ops.render.render(write_still=True)
cam.location=(0,-4,1.3); aim(cam,(0,0,.96))
scene.render.filepath=str(ROOT/'previews/front.png')
bpy.ops.render.render(write_still=True)
# Export only the character and rig, with no preview floor/lights/camera.
bpy.ops.object.select_all(action='DESELECT'); model.select_set(True); rig.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(ROOT/'export/paypay-daisuke.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_yup=True)
bpy.data.libraries.write(str(ROOT/'blender/paypay-daisuke.blend'),{scene},fake_user=True,compress=True)
model.data.calc_loop_triangles()
result={'vertices':len(model.data.vertices),'triangles':len(model.data.loop_triangles),'bones':len(armdata.bones),'materials':len(model.data.materials),'glb':str(ROOT/'export/paypay-daisuke.glb')}
print(result)
