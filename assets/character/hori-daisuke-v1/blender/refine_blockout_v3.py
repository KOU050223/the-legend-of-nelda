import bpy
import math
import random
import runpy
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parent
H=runpy.run_path(str(ROOT/'build_blockout_v2.py'))
mesh,loft,ball,line,camera,collection,material=[H[k] for k in ['mesh','loft','ball','line','camera','collection','material']]
face_y=H['face_y']
PREVIEW=ROOT/'previews-v3'

def refine():
    assert 'V3_Previous_Parts' not in bpy.data.collections
    old=collection('V3_Previous_Parts'); old.hide_render=True; old.hide_viewport=True
    def archive(o):
        for c in list(o.users_collection): c.objects.unlink(o)
        old.objects.link(o)
    neck=bpy.data.objects['HD_Neck']
    for v in neck.data.vertices:
        if v.co.z>.878:
            v.co.x*=.82; v.co.y=.006+(v.co.y-.013)*.82; v.co.z=.897
    neck.data.update()
    face=bpy.data.collections['GEO_FACE']; skin=bpy.data.materials['MAT_Skin_Blockout']
    for name in ['HD_Mouth_Smile_Seam','HD_Lip_Upper','HD_Lip_Lower']:
        archive(bpy.data.objects[name])
    dark=material('V3_Mouth_Interior',(.045,.014,.012))
    teeth=material('V3_Teeth',(.70,.68,.61))
    lip=material('V3_Lips',(.44,.24,.19))
    # Shallow static smiling mouth opening; retained as separate editable surfaces.
    for label,mat,t0,t1,depth in [('Opening',dark,0,1,.0012),('Teeth',teeth,.43,.88,.0016)]:
        vv=[]; ff=[]
        for j in range(5):
            t=t0+(t1-t0)*j/4
            for i in range(33):
                u=-1+2*i/32; x=.018*u
                low=.8805+.0075*u*u; high=.886+.002*u*u
                z=low*(1-t)+high*t
                vv.append((x,face_y(x,z)-depth,z))
        for j in range(4):
            for i in range(32):
                k=j*33+i; ff.append((k,k+1,k+34,k+33))
        mesh('V3_Smile_'+label,vv,ff,face,mat)
    for upper in [False,True]:
        coords=[]
        for i in range(17):
            u=-1+2*i/16; x=.018*u
            z=(.886+.002*u*u) if upper else (.8805+.0075*u*u)
            coords.append((x,face_y(x,z)-.0015,z))
        line('V3_Lip_'+str(upper),coords,.0008,face,lip,radii=[.15]+[.8]*15+[.15])
    for side in ['L','R']:
        iris=bpy.data.objects['HD_Iris_'+side]
        iris.scale.x=1.22; iris.scale.z=1.12
    hair=bpy.data.collections['HAIR_MAIN']
    for o in list(hair.objects):
        if o.name!='HD_Hair_ScalpMass': archive(o)
    hm=bpy.data.materials['MAT_Hair_Black']
    rng=random.Random(814)
    # Follow the scalp rather than suspended round tubes. Root is buried in cap.
    for i in range(82):
        a=2*math.pi*i/82
        start=rng.uniform(.15,.70)
        end=(1.15 if math.cos(a)>0.4 else 1.65 if math.cos(a)>-.2 else 2.12)+rng.uniform(-.10,.09)
        width=rng.uniform(.0040,.0065)
        vv=[]; ff=[]
        for j in range(15):
            t=j/14; theta=start+(end-start)*t
            az=a+.28*(1-t)+.10*math.sin(t*math.pi)
            for k in range(7):
                u=-1+2*k/6
                taper=(1-t)**.6 if t>.7 else .85+.15*math.sin(t*math.pi)
                aa=az+u*width*taper/max(.012,.047*math.sin(theta))
                bulge=-.001*(1-t)**5+.0022*math.sin(math.pi*t)**.8*math.cos(u*math.pi/2)
                vv.append(((.0468+bulge)*math.sin(theta)*math.sin(aa),.006-(.054+bulge)*math.sin(theta)*math.cos(aa),.944+(.054+bulge)*math.cos(theta)))
        for j in range(14):
            for k in range(6):
                n=j*7+k; ff.append((n,n+1,n+8,n+7))
        o=mesh('V3_Hair_Lock_%02d'%i,vv,ff,hair,hm)
        mod=o.modifiers.new('Lock_Thickness','SOLIDIFY'); mod.thickness=.0006; mod.offset=-1
    PREVIEW.mkdir(exist_ok=True)
    return {'refined':'neck top buried in skull, smiling lips/teeth, scalp-following short locks'}

def render(names,kind='Face',gray=False,prefix='review'):
    s=bpy.context.scene
    hair=bpy.data.collections['HAIR_MAIN']; old=hair.hide_render; hair.hide_render=gray
    s.display.shading.color_type='SINGLE' if gray else 'MATERIAL'
    s.display.shading.single_color=(.5,.5,.5)
    bpy.context.view_layer.update()
    paths=[]
    for n in names:
        s.camera=bpy.data.objects['CAM_'+kind+'_'+n]
        s.render.filepath=str(PREVIEW/(prefix+'-'+n+'.png'))
        bpy.ops.render.render(write_still=True); paths.append(s.render.filepath)
    hair.hide_render=old; s.display.shading.color_type='MATERIAL'
    return {'images':paths}

def fix_hair_edge():
    rng=random.Random(814)
    for i in range(82):
        a=2*math.pi*i/82
        start=rng.uniform(.15,.70)
        end=1.37+.80*(1-math.cos(a))/2+rng.uniform(-.10,.09)
        width=rng.uniform(.0040,.0065)
        o=bpy.data.objects['V3_Hair_Lock_%02d'%i]
        for j in range(15):
            t=j/14; theta=start+(end-start)*t
            az=a+.28*(1-t)+.10*math.sin(t*math.pi)
            for k in range(7):
                u=-1+2*k/6
                taper=(1-t)**.6 if t>.7 else .85+.15*math.sin(t*math.pi)
                aa=az+u*width*taper/max(.012,.047*math.sin(theta))
                bulge=-.001*(1-t)**5+.0022*math.sin(math.pi*t)**.8*math.cos(u*math.pi/2)
                o.data.vertices[j*7+k].co=((.0468+bulge)*math.sin(theta)*math.sin(aa),.006-(.054+bulge)*math.sin(theta)*math.cos(aa),.944+(.054+bulge)*math.cos(theta))
        o.data.update()
    return {'hair':'continuous front-to-temple length transition and longer fringe'}

def fullbody():
    assert 'V3_LOWER_BODY' not in bpy.data.collections
    parent=bpy.data.collections['MODEL_HORI_V2']
    lower=collection('V3_LOWER_BODY',parent); hands=collection('V3_HANDS',parent)
    pants=material('V3_Charcoal_Pants',(.045,.05,.06)); shoe=material('V3_Shoes',(.022,.026,.032))
    sole=material('V3_Soles',(.07,.075,.08)); skin=bpy.data.materials['MAT_Skin_Blockout']
    loft('V3_Pelvis_Pants',[(0,.008,.435,.080,.048),(0,.007,.465,.090,.052),(0,.004,.505,.091,.05),(0,0,.540,.086,.046)],lower,pants)
    for side,suffix in [(1,'L'),(-1,'R')]:
        sections=[(side*.061,.004,.047,.022,.025),(side*.061,.007,.080,.022,.025),(side*.06,.016,.140,.027,.031),(side*.058,.020,.195,.032,.035),(side*.056,.008,.252,.028,.030),(side*.054,-.004,.280,.030,.032),(side*.052,.002,.320,.038,.040),(side*.049,.008,.375,.044,.047),(side*.047,.011,.430,.047,.05),(side*.045,.010,.475,.045,.049)]
        loft('V3_Pants_Leg_'+suffix,sections,lower,pants)
        # Foot points toward -Y. Flat soles at Z=0 and shaped toe/instep upper.
        shoe_sections=[(side*.061,-.022,.005,.027,.064),(side*.061,-.022,.013,.029,.066),(side*.061,-.021,.022,.028,.064),(side*.061,-.011,.034,.026,.050),(side*.061,.006,.054,.022,.030),(side*.061,.008,.067,.021,.024)]
        loft('V3_Sneaker_'+suffix,shoe_sections,lower,shoe)
        loft('V3_Sole_'+suffix,[(side*.061,-.022,0,.027,.064),(side*.061,-.022,.008,.029,.066),(side*.061,-.022,.013,.029,.066)],lower,sole)
        for j in range(4):
            y=-.04+j*.01
            line('V3_Lace_'+suffix+str(j),[(side*.061-.016,y,.035+j*.004),(side*.061,y-.002,.038+j*.004),(side*.061+.016,y,.035+j*.004)],.001,lower,sole)
        # Relaxed palms and separated finger blockouts. No rig or deforming knuckles.
        loft('V3_Palm_'+suffix,[(side*.192,-.020,.445,.014,.010),(side*.192,-.017,.455,.019,.012),(side*.189,-.015,.482,.019,.013),(side*.186,-.015,.511,.014,.017)],hands,skin,n=24)
        for j in range(4):
            x=side*(.178+j*.009)
            length=[.034,.042,.040,.032][j]
            loft('V3_Finger_'+suffix+str(j),[(x,-.026,.445-length,.003,.0035),(x,-.024,.450-length,.004,.0045),(x,-.020,.432,.0045,.005),(x,-.018,.457,.0048,.006)],hands,skin,n=12)
        loft('V3_Thumb_'+suffix,[(side*.163,-.029,.451,.0035,.004),(side*.163,-.028,.460,.005,.006),(side*.174,-.020,.480,.007,.008),(side*.183,-.015,.492,.008,.008)],hands,skin,n=12)
    studio=bpy.data.collections['REVIEW_CAMERAS']
    for n,d in {'Front':(0,-1,0),'Left':(1,0,0),'Right':(-1,0,0),'Back':(0,1,0),'LeftFront45':(1,-1,0),'Top':(0,0,1)}.items():
        camera('CAM_Full_'+n,d,(0,0,.5),1.12,studio)
    return {'fullbody':'pelvis, pants, legs, sneakers, palms, 5 digits per hand'}

def save():
    out=ROOT/'hori-daisuke-blockout-v3.blend'; assert not out.exists()
    if bpy.context.object and bpy.context.object.mode!='OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    s=bpy.context.scene; s.name='HORI_V3_FULLBODY'
    gray=bpy.data.scenes.get('HORI_V2_FACE_GRAY') or bpy.data.scenes['HORI_V3_FACE_GRAY']
    gray.name='HORI_V3_FACE_GRAY'
    s['stage']='Refined head and full-body blockout; not rigged'
    s.camera=bpy.data.objects['CAM_Full_LeftFront45']
    import bmesh
    for o in bpy.data.collections['MODEL_HORI_V2'].all_objects:
        if o.type=='MESH':
            bm=bmesh.new(); bm.from_mesh(o.data)
            bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7)
            bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
            bm.to_mesh(o.data); bm.free()
    for screen in bpy.data.screens:
        for a in screen.areas:
            if a.type=='VIEW_3D':
                a.spaces.active.region_3d.view_location=(0,0,.5)
                a.spaces.active.region_3d.view_distance=1.45
                a.spaces.active.region_3d.view_rotation=s.camera.rotation_euler.to_quaternion()
    bpy.ops.wm.save_as_mainfile(filepath=str(out))
    return {'saved':str(out)}

def unify_pants():
    vv=[]; ff=[]
    old=bpy.data.collections['V3_Previous_Parts']
    for name in ['V3_Pelvis_Pants','V3_Pants_Leg_L','V3_Pants_Leg_R']:
        o=bpy.data.objects[name]; offset=len(vv)
        vv.extend(tuple(o.matrix_world@v.co) for v in o.data.vertices)
        ff.extend(tuple(offset+i for i in p.vertices) for p in o.data.polygons)
        for c in list(o.users_collection): c.objects.unlink(o)
        old.objects.link(o)
    o=mesh('V3_Pants_Unified',vv,ff,bpy.data.collections['V3_LOWER_BODY'],bpy.data.materials['V3_Charcoal_Pants'])
    mod=o.modifiers.new('Editable_Volume_Union','REMESH'); mod.mode='VOXEL'; mod.voxel_size=.0025; mod.use_smooth_shade=True
    mod=o.modifiers.new('Soften_Hip_Junction','SMOOTH'); mod.factor=.8; mod.iterations=5
    return {'pants':'unapplied volume union; original lofts archived'}
