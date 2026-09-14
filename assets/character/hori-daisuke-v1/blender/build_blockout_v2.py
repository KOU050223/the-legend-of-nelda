import bpy
import math
import json
from pathlib import Path
from mathutils import Vector

# Run in the already inspected reference file. Stages are intentionally separate:
# setup_face(), inspect three gray views, then build_body_hair(), save_delivery().
ROOT = Path('/Users/uozumikouhei/orca/workspaces/the-legend-of-nelda/hori-daisuke-3d-model/assets/character/hori-daisuke-v1')
OUT = ROOT / 'blender/hori-daisuke-blockout-v2.blend'
PREVIEW = ROOT / 'blender/previews-v2'

def collection(name, parent=None):
    c = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(c)
    return c

def material(name, color):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bs = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bs is None:
        bs = m.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
        output = m.node_tree.nodes.new('ShaderNodeOutputMaterial')
        m.node_tree.links.new(bs.outputs['BSDF'], output.inputs['Surface'])
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Roughness'].default_value = .65
    return m

def mesh(name, verts, faces, col, mat):
    d = bpy.data.meshes.new(name + '_Mesh')
    d.from_pydata(verts, [], faces)
    d.update()
    o = bpy.data.objects.new(name, d)
    col.objects.link(o)
    d.materials.append(mat)
    for p in d.polygons:
        p.use_smooth = True
    return o

def ball(name, pos, scale, col, mat, segments=24, rings=12):
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=pos)
    o = bpy.context.object
    o.name = name
    for c in list(o.users_collection):
        c.objects.unlink(o)
    col.objects.link(o)
    for v in o.data.vertices:
        v.co.x *= scale[0]
        v.co.y *= scale[1]
        v.co.z *= scale[2]
    o.data.materials.append(mat)
    for p in o.data.polygons:
        p.use_smooth = True
    return o

def line(name, coords, radius, col, mat, cyclic=False, radii=None):
    d = bpy.data.curves.new(name + '_Curve', 'CURVE')
    d.dimensions = '3D'
    d.resolution_u = 8
    d.bevel_depth = radius
    d.bevel_resolution = 2
    s = d.splines.new('BEZIER')
    s.bezier_points.add(len(coords)-1)
    for i, (p, co) in enumerate(zip(s.bezier_points, coords)):
        p.co = co
        p.handle_left_type = 'AUTO'
        p.handle_right_type = 'AUTO'
        p.radius = radii[i] if radii else 1
    s.use_cyclic_u = cyclic
    o = bpy.data.objects.new(name, d)
    col.objects.link(o)
    d.materials.append(mat)
    return o

def interpolate(z, rows, index):
    for a, b in zip(rows, rows[1:]):
        if z <= b[0]:
            t = max(0, (z-a[0])/(b[0]-a[0]))
            return a[index]*(1-t)+b[index]*t
    return rows[-1][index]

# z, half width, anterior depth, posterior depth. Hand estimated, not a scan.
HEAD = [(.858,.010,.029,.004),(.862,.020,.041,.012),
        (.870,.028,.044,.025),(.882,.035,.043,.037),
        (.897,.041,.043,.045),(.911,.044,.044,.050),
        (.928,.043,.041,.052),(.943,.043,.043,.052),
        (.958,.043,.043,.048),(.970,.039,.038,.042),
        (.980,.030,.030,.033),(.987,.016,.017,.020),
        (.990,.003,.004,.006)]

def face_y(x, z):
    w = interpolate(z, HEAD, 1)
    front = interpolate(z, HEAD, 2)
    q = min(.999999, abs(x)/w)
    y = -front * (1-q**2.8)**(1/2.8)
    # Recessed orbital beds and raised cheek / eyebrow planes.
    for side in [-1, 1]:
        y += .0042*math.exp(-((x-side*.020)/.012)**2-((z-.928)/.008)**2)
        y -= .0025*math.exp(-((x-side*.022)/.017)**2-((z-.940)/.0045)**2)
        y -= .0030*math.exp(-((x-side*.026)/.014)**2-((z-.909)/.009)**2)
    # Straight bridge into a rounded, non-pointed tip and alar base.
    y -= .0090*math.exp(-(x/.0063)**2-((z-.921)/.019)**2)
    y -= .0100*math.exp(-(x/.0080)**2-((z-.907)/.0080)**2)
    y -= .0040*math.exp(-(x/.0105)**4-((z-.903)/.0040)**2)
    y -= .0035*math.exp(-(x/.017)**4-((z-.886)/.010)**2)
    y -= .0020*math.exp(-(x/.013)**2-((z-.868)/.005)**2)
    return y

def camera(name, direction, target, scale, col):
    d = bpy.data.cameras.new(name)
    d.type = 'ORTHO'
    d.ortho_scale = scale
    d.clip_start = .001
    d.clip_end = 100
    o = bpy.data.objects.new(name, d)
    col.objects.link(o)
    o.location = Vector(target)+Vector(direction)*2
    o.rotation_euler = (Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
    return o

def setup_face():
    assert 'MODEL_HORI_V2' not in bpy.data.collections, 'Do not rerun over a built scene'
    assert not OUT.exists(), 'Output already exists; choose a new version'
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    scene = bpy.context.scene
    scene.name = 'HORI_V2_BLOCKOUT'
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.length_unit = 'METERS'
    scene.unit_settings.scale_length = 1
    scene['character_height'] = 1.0
    scene['coordinate_system'] = 'Z-up; front=-Y; character-left=+X; normalized full height=1.0 m'
    scene['stage'] = 'Primary blockout / shape review; upper body only'
    scene['reference_original_snapshot'] = json.dumps([{'name':o.name,'matrix':[list(r) for r in o.matrix_world],'image':o.data.filepath} for o in bpy.data.collections['REF_9VIEWS'].objects])
    # Preserve startup objects too; hide the legacy collection rather than delete it.
    scene.view_layers[0].layer_collection.children['Collection'].exclude = True
    ref = bpy.data.collections['REF_9VIEWS']
    for deg, filename in [(45,'left-front-45.png'),(135,'left-back-135.png'),(225,'right-back-225.png'),(315,'right-front-315.png')]:
        a = math.radians(deg)
        o = bpy.data.objects.new('REF_IMG_DIAGONAL_'+str(deg), None)
        o.empty_display_type = 'IMAGE'
        o.data = bpy.data.images.load(str(ROOT/'turntable'/filename), check_existing=True)
        o.empty_display_size = 1.0
        o.location = (.22*math.sin(a),-.22*math.cos(a),.5)
        o.rotation_euler = (math.pi/2,0,a)
        o.color[3] = .72
        o['reference_note'] = 'Uncalibrated design completion; 135 image appears to show right rear'
        ref.objects.link(o)
    scene.view_layers[0].layer_collection.children[ref.name].exclude = True
    model = collection('MODEL_HORI_V2')
    face = collection('GEO_FACE', model)
    collection('GEO_BODY', model)
    collection('WARDROBE_TSHIRT', model)
    collection('HAIR_MAIN', model)
    studio = collection('REVIEW_CAMERAS')
    gray = material('MAT_Clay',(.44,.46,.48))
    skin = material('MAT_Skin_Blockout',(.56,.35,.23))
    dark = material('MAT_Feature_Dark',(.055,.042,.038))
    material('MAT_Hair_Black',(.017,.020,.024))
    material('MAT_Sport_Black',(.025,.030,.037))
    eye = material('MAT_Eye_Gray',(.60,.60,.58))
    # Low-density quad cage; no subdivision is used to conceal the shape.
    n, nr = 64, 45
    verts, faces = [], []
    for j in range(nr):
        z = .858+(.990-.858)*j/(nr-1)
        w = interpolate(z,HEAD,1)
        for i in range(n):
            a=2*math.pi*i/n
            x=w*math.sin(a)
            y=face_y(x,z) if math.cos(a)>=0 else -math.cos(a)*interpolate(z,HEAD,3)
            verts.append((x,y,z))
    for j in range(nr-1):
        for i in range(n):
            k=j*n+i; q=j*n+(i+1)%n
            faces.append((k,q,q+n,k+n))
    faces.extend([tuple(reversed(range(n))),tuple((nr-1)*n+i for i in range(n))])
    head=mesh('HD_Head_Cage',verts,faces,face,skin)
    sub=head.modifiers.new('Optional_Subdivision_OFF','SUBSURF')
    sub.levels=1; sub.render_levels=1; sub.show_viewport=False; sub.show_render=False
    head['method']='Hand-estimated sectional quad cage with orbital/nasal planes; no scan fitting'
    for side, suffix in [(1,'L'),(-1,'R')]:
        cx=side*.020
        # Almond ocular surface, with edges attached to the same head function.
        ev, ef=[],[]
        for j in range(7):
            t=j/6
            for i in range(17):
                u=-1+2*i/16
                x=cx+u*.009
                z=.928+side*u*.0007+math.sin(math.pi*t)*0 + (2*t-1)*.0032*math.sqrt(max(0,1-u*u))
                y=face_y(x,z)-.0005-.0018*(1-u*u)*math.sin(math.pi*t)
                ev.append((x,y,z))
        for j in range(6):
            for i in range(16):
                k=j*17+i; ef.append((k,k+1,k+18,k+17))
        mesh('HD_Eye_Surface_'+suffix,ev,ef,face,eye)
        ball('HD_Iris_'+suffix,(cx,face_y(cx,.928)-.0026,.928),(.0026,.0007,.0027),face,dark)
        for upper in [True,False]:
            coords=[]
            for i in range(9):
                u=-1+2*i/8; x=cx+u*.009
                z=.928+side*u*.0007+(1 if upper else -1)*.0032*math.sqrt(max(0,1-u*u))
                coords.append((x,face_y(x,z)-.0007,z))
            line('HD_Lid_'+('Upper_' if upper else 'Lower_')+suffix,coords,.00085,face,skin,radii=[.25,.8,1,1,1,1,1,.8,.25])
        coords=[]
        for u,z in [(-1,.938),(-.5,.941),(0,.942),(.5,.9415),(1,.9395)]:
            x=side*(.021+u*.011)
            coords.append((x,face_y(x,z)-.0009,z))
        line('HD_Brow_'+suffix,coords,.0009,face,dark,radii=[.65,1,1,.7,.1])
        # Ear bowl and helix have depth; hidden anatomy remains an estimate.
        ev=[]; ef=[]
        for j in range(5):
            r=.20+j*.20
            for i in range(24):
                a=2*math.pi*i/24
                ev.append((side*(.043+.005*r+.0015*r*math.sin(a)),.002+.007*r*math.cos(a)-.002*(1-r),.916+.012*r*math.sin(a)))
        for j in range(4):
            for i in range(24):
                k=j*24+i; q=j*24+(i+1)%24; ef.append((k,q,q+24,k+24))
        ear=mesh('HD_Ear_Bowl_'+suffix,ev,ef,face,skin)
        sol=ear.modifiers.new('Editable_Ear_Thickness','SOLIDIFY'); sol.thickness=.0015
        line('HD_Ear_Helix_'+suffix,ev[-24:],.0018,face,skin,cyclic=True)
        ball('HD_Earlobe_'+suffix,(side*.046,.002,.905),(.0027,.004,.0035),face,skin)
    # A restrained static smile, without a mouth cavity or expression rig.
    mouth=[]
    for i in range(13):
        u=-1+2*i/12; x=.019*u; z=.883+.004*u*u
        mouth.append((x,face_y(x,z)-.0010,z))
    line('HD_Mouth_Smile_Seam',mouth,.0006,face,dark,radii=[.2,.65,.8,1,1,1,1,1,1,1,.8,.65,.2])
    for upper in [True,False]:
        vv=[]; ff=[]
        for j in range(5):
            t=j/4
            for i in range(25):
                u=-1+2*i/24; x=.019*u
                edge=.883+.004*u*u
                thick=(.0023 if upper else -.0028)*(1-u*u)
                z=edge+thick*t
                y=face_y(x,z)-.0004-.0012*math.sin(math.pi*t)*(1-u*u)
                vv.append((x,y,z))
        for j in range(4):
            for i in range(24):
                k=j*25+i; ff.append((k,k+1,k+26,k+25))
        mesh('HD_Lip_'+('Upper' if upper else 'Lower'),vv,ff,face,skin)
    for side,suffix in [(1,'L'),(-1,'R')]:
        x=side*.0068; z=.9025
        ball('HD_Nostril_Plane_'+suffix,(x,face_y(x,z)-.0003,z),(.0021,.00065,.0008),face,dark)
    directions={'Front':(0,-1,0),'Left':(1,0,0),'Right':(-1,0,0),'Back':(0,1,0),'LeftFront45':(1,-1,0),'Top':(0,0,1)}
    for name,direction in directions.items():
        camera('CAM_Face_'+name,direction,(0,0,.926),.171,studio)
        camera('CAM_Bust_'+name,direction,(0,0,.748),.56,studio)
    scene.render.engine='BLENDER_WORKBENCH'
    scene.render.resolution_x=850; scene.render.resolution_y=850; scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.display.shading.light='STUDIO'
    scene.display.shading.studiolight_rotate_z=.35
    scene.display.shading.color_type='MATERIAL'
    scene.display.shading.show_shadows=True
    scene.display.shading.show_cavity=True
    scene.display.shading.cavity_type='BOTH'
    scene.display.shading.curvature_ridge_factor=1.2
    scene.display.shading.curvature_valley_factor=1.0
    scene.display.shading.background_type='WORLD'
    scene.world.color=(.14,.14,.14)
    scene.view_settings.view_transform='Standard'
    PREVIEW.mkdir(parents=True,exist_ok=True)
    scene.camera=bpy.data.objects['CAM_Face_LeftFront45']
    return {'stage':'face cage built','head_vertices':len(head.data.vertices),'refs':len(ref.objects)}

def render_views(prefix, names, gray=False, face=False):
    scene=bpy.context.scene
    scene.display.shading.color_type='SINGLE' if gray else 'MATERIAL'
    scene.display.shading.single_color=(.50,.50,.50)
    hair=bpy.data.collections['HAIR_MAIN']
    old=hair.hide_render
    hair.hide_render=gray
    paths=[]
    for name in names:
        scene.camera=bpy.data.objects['CAM_'+('Face_' if face else 'Bust_')+name]
        scene.render.filepath=str(PREVIEW/(prefix+'-'+name+'.png'))
        bpy.ops.render.render(write_still=True)
        paths.append(scene.render.filepath)
    hair.hide_render=old
    scene.display.shading.color_type='MATERIAL'
    return {'renders':paths}

def refine_face():
    """Apply the one documented shape correction to the initial face stage."""
    head=bpy.data.objects['HD_Head_Cage']
    for j in range(45):
        z=.858+(.990-.858)*j/44
        w=interpolate(z,HEAD,1)
        for i in range(64):
            a=2*math.pi*i/64; x=w*math.sin(a)
            y=face_y(x,z) if math.cos(a)>=0 else -math.cos(a)*interpolate(z,HEAD,3)
            head.data.vertices[j*64+i].co=(x,y,z)
    head.data.update()
    # Reposition feature surfaces to the revised head (same x/z, changed depth).
    for side,suffix in [(1,'L'),(-1,'R')]:
        o=bpy.data.objects['HD_Nostril_Plane_'+suffix]
        o.location.y=face_y(o.location.x,o.location.z)-.0003
        brow=bpy.data.objects['HD_Brow_'+suffix]
        brow.data.bevel_depth=.0009
        ear=bpy.data.objects['HD_Ear_Bowl_'+suffix]
        ev=[]
        for j in range(5):
            r=.20+j*.20
            for i in range(24):
                a=2*math.pi*i/24
                co=(side*(.043+.005*r+.0015*r*math.sin(a)),.002+.007*r*math.cos(a)-.002*(1-r),.916+.012*r*math.sin(a))
                ev.append(co); ear.data.vertices[j*24+i].co=co
        ear.data.update()
        for p,co in zip(bpy.data.objects['HD_Ear_Helix_'+suffix].data.splines[0].bezier_points,ev[-24:]):
            p.co=co
        lobe=bpy.data.objects['HD_Earlobe_'+suffix]
        lobe.location=(side*.046,.002,.905)
        lobe.scale=(.675,.8,.7777778)
    return {'refinement':'reduced pointed nose projection and ear flare'}

def loft(name, sections, col, mat, n=32, cap=True):
    # sections: center x/y/z, transverse radius, depth radius; horizontal rings.
    vv=[]; ff=[]
    for x,y,z,rx,ry in sections:
        for i in range(n):
            a=2*math.pi*i/n
            vv.append((x+rx*math.sin(a),y-ry*math.cos(a),z))
    for j in range(len(sections)-1):
        for i in range(n):
            k=j*n+i; q=j*n+(i+1)%n
            ff.append((k,q,q+n,k+n))
    if cap:
        ff += [tuple(reversed(range(n))),tuple((len(sections)-1)*n+i for i in range(n))]
    return mesh(name,vv,ff,col,mat)

def build_body_hair():
    assert 'HD_Neck' not in bpy.data.objects, 'Do not repeat body stage'
    body=bpy.data.collections['GEO_BODY']; cloth=bpy.data.collections['WARDROBE_TSHIRT']; hair=bpy.data.collections['HAIR_MAIN']
    skin=bpy.data.materials['MAT_Skin_Blockout']; black=bpy.data.materials['MAT_Sport_Black']; hm=bpy.data.materials['MAT_Hair_Black']
    loft('HD_Neck',[(0,.006,.799,.046,.037),(0,.007,.825,.036,.032),(0,.010,.853,.029,.028),(0,.013,.879,.029,.027)],body,skin)
    sections=[(0,0,.530,.087,.047),(0,0,.550,.088,.047),(0,.001,.590,.082,.045),(0,.003,.640,.087,.050),(0,.005,.691,.100,.060),(0,.005,.742,.112,.063),(0,.006,.785,.106,.054),(0,.007,.807,.089,.043),(0,.007,.825,.045,.033)]
    loft('HD_Thorax_Waist',sections,body,skin)
    for side,suffix in [(1,'L'),(-1,'R')]:
        ball('HD_Deltoid_'+suffix,(side*.114,.004,.787),(.035,.040,.043),body,skin)
        # Entire arm is one contiguous low-density cage through the elbow.
        arm=[(side*.186,-.015,.505,.014,.017),(side*.182,-.012,.527,.015,.018),(side*.177,-.006,.562,.020,.023),(side*.169,.001,.595,.024,.027),(side*.161,.006,.625,.023,.025),(side*.157,.008,.643,.022,.023),(side*.151,.008,.663,.025,.028),(side*.143,.008,.699,.031,.033),(side*.132,.008,.739,.033,.034),(side*.119,.007,.775,.029,.032),(side*.111,.006,.796,.023,.027)]
        o=loft('HD_Arm_'+suffix,arm,body,skin,n=24)
        o['anatomy']='deltoid / upper arm / elbow / forearm mass; wrist ends, no hands'
    # Torso garment is a separate open shell, collar narrows onto neck.
    shirt=[(x,y,z,rx+.003,ry+.003) for x,y,z,rx,ry in sections]
    shirt[-1]=(0,.007,.830,.036,.030)
    shirt.insert(-1,(0,.007,.818,.064,.038))
    shirt_obj=loft('HD_TShirt_Torso',shirt,cloth,black,n=48,cap=False)
    sol=shirt_obj.modifiers.new('Fabric_Thickness','SOLIDIFY'); sol.thickness=.0012; sol.offset=1
    # Editable sleeve shells intentionally overlap torso at blockout stage.
    for side,suffix in [(1,'L'),(-1,'R')]:
        sleeve=[(side*.142,.006,.718,.033,.036),(side*.139,.006,.728,.035,.038),(side*.130,.006,.754,.039,.042),(side*.117,.006,.782,.039,.044),(side*.114,.006,.806,.034,.039),(side*.114,.006,.817,.027,.031),(side*.114,.006,.827,.017,.020),(side*.114,.006,.834,.003,.004)]
        o=loft('HD_TShirt_Sleeve_'+suffix,sleeve,cloth,black,n=32,cap=False)
        sol=o.modifiers.new('Fabric_Thickness','SOLIDIFY'); sol.thickness=.0012; sol.offset=1
        coords=[(side*.142+.0334*math.sin(2*math.pi*i/32),.006-.0364*math.cos(2*math.pi*i/32),.721) for i in range(32)]
        line('HD_TShirt_Cuff_'+suffix,coords,.0012,cloth,black,cyclic=True)
    line('HD_TShirt_Collar',[(.037*math.sin(2*math.pi*i/48),.007-.031*math.cos(2*math.pi*i/48),.830) for i in range(48)],.0018,cloth,black,cyclic=True)
    line('HD_TShirt_Hem',[(.0905*math.sin(2*math.pi*i/48),-.0505*math.cos(2*math.pi*i/48),.534) for i in range(48)],.0013,cloth,black,cyclic=True)
    # Short hair cap: front hairline high, sides above ears, occiput low.
    vv=[(0,.006,.999)]; ff=[]; n=64; nr=12
    for j in range(1,nr+1):
        t=j/nr
        for i in range(n):
            a=2*math.pi*i/n
            bottom=.942+.020*max(0,math.cos(a))-.036*max(0,-math.cos(a))
            bottom+=.0012*math.sin(7*a)+.0008*math.sin(11*a)
            theta=t*math.acos(max(-1,min(1,(bottom-.945)/.054)))
            x=.0465*math.sin(theta)*math.sin(a)
            y=.006-.054*math.sin(theta)*math.cos(a)
            z=.945+.054*math.cos(theta)
            vv.append((x,y,z))
    for i in range(n): ff.append((0,1+i,1+(i+1)%n))
    for j in range(nr-1):
        for i in range(n):
            k=1+j*n+i; q=1+j*n+(i+1)%n; ff.append((k,q,q+n,k+n))
    cap=mesh('HD_Hair_ScalpMass',vv,ff,hair,hm)
    sol=cap.modifiers.new('Scalp_Thickness','SOLIDIFY'); sol.thickness=.001; sol.offset=-1
    # Few distinct, tapered major locks. Volume study, not individual strands.
    for i,(x,zend,lean) in enumerate([(-.039,.945,-.002),(-.031,.950,.003),(-.023,.947,.004),(-.014,.952,.004),(-.005,.951,.003),(.005,.956,.005),(.014,.949,.005),(.023,.956,.005),(.032,.950,.003),(.040,.944,0)]):
        y=-.043+(.010 if abs(x)>.03 else 0)
        line('HD_Hair_Fringe_%02d'%i,[(x-lean,.000,.988),(x-lean,-.023,.981),(x,y-.002,.965),(x+lean,y-.002,zend)],.0058,hair,hm,radii=[.7,1,.72,.04])
    for side,suffix in [(1,'L'),(-1,'R')]:
        for i in range(5):
            y=-.023+i*.013
            line('HD_Hair_Temple_'+suffix+'_%02d'%i,[(side*.031,y+.008,.974),(side*.045,y,.959),(side*.045,y-.004,.935-i*.003)],.0043,hair,hm,radii=[.8,1,.04])
    for i in range(9):
        a=2*math.pi*i/9
        line('HD_Hair_Crown_%02d'%i,[(.012*math.sin(a),.010+.014*math.cos(a),.991),(.027*math.sin(a+.3),.007+.032*math.cos(a+.3),.991-(.004 if i%2 else 0)),(.037*math.sin(a+.5),.006+.043*math.cos(a+.5),.973)],.0045,hair,hm,radii=[.7,1,.06])
    for i in range(7):
        a=math.pi/2+(i+.5)*math.pi/7
        line('HD_Hair_Occipital_%02d'%i,[(.036*math.sin(a),.006-.047*math.cos(a),.964),(.042*math.sin(a),.006-.054*math.cos(a),.943),(.040*math.sin(a),.006-.048*math.cos(a),.916)],.0045,hair,hm,radii=[.8,1,.04])
    bpy.context.view_layer.update()
    return {'stage':'body shirt hair built','collections':{c.name:len(c.objects) for c in [body,cloth,hair]}}

def refine_shoulder_hair():
    cloth=bpy.data.collections['WARDROBE_TSHIRT']; black=bpy.data.materials['MAT_Sport_Black']
    for side,suffix in [(1,'L'),(-1,'R')]:
        o=bpy.data.objects['HD_TShirt_Sleeve_'+suffix]
        sections=[(side*.142,.006,.718,.033,.036),(side*.139,.006,.728,.035,.038),(side*.130,.006,.754,.039,.042),(side*.117,.006,.782,.039,.044),(side*.114,.006,.806,.034,.039),(side*.114,.006,.817,.027,.031),(side*.114,.006,.827,.017,.020),(side*.114,.006,.834,.003,.004)]
        vv=[]; ff=[]; n=32
        for x,y,z,rx,ry in sections:
            for i in range(n):
                a=2*math.pi*i/n; vv.append((x+rx*math.sin(a),y-ry*math.cos(a),z))
        for j in range(len(sections)-1):
            for i in range(n):
                k=j*n+i; q=j*n+(i+1)%n; ff.append((k,q,q+n,k+n))
        ff.append(tuple((len(sections)-1)*n+i for i in range(n)))
        o.data.clear_geometry(); o.data.from_pydata(vv,[],ff); o.data.update()
        for p in o.data.polygons: p.use_smooth=True
    # Flatten round lock cross sections into editable ribbon-like solid clumps.
    hair=bpy.data.collections['HAIR_MAIN']
    for o in list(hair.objects):
        if o.type!='CURVE': continue
        name=o.name
        spline=o.data.splines[0]
        points=[p.co.copy() for p in spline.bezier_points]
        radii=[p.radius*o.data.bevel_depth for p in spline.bezier_points]
        vv=[]; ff=[]; steps=13; sides=8
        from mathutils.geometry import interpolate_bezier
        centers=[]; widths=[]
        bp=spline.bezier_points
        for j in range(len(bp)-1):
            samples=interpolate_bezier(bp[j].co,bp[j].handle_right,bp[j+1].handle_left,bp[j+1].co,steps)
            for k,co in enumerate(samples[:-1] if j<len(bp)-2 else samples):
                t=k/(steps-1)
                centers.append(co); widths.append(radii[j]*(1-t)+radii[j+1]*t)
        for j,co in enumerate(centers):
            tangent=(centers[min(j+1,len(centers)-1)]-centers[max(0,j-1)]).normalized()
            normal=Vector((co.x/0.046,(co.y-.006)/.054,(co.z-.945)/.054)).normalized()
            transverse=tangent.cross(normal).normalized()
            normal=transverse.cross(tangent).normalized()
            for k in range(sides):
                a=2*math.pi*k/sides
                v=co+transverse*(math.cos(a)*widths[j])+normal*(math.sin(a)*widths[j]*.40)
                vv.append(tuple(v))
        for j in range(len(centers)-1):
            for i in range(sides):
                k=j*sides+i; q=j*sides+(i+1)%sides; ff.append((k,q,q+sides,k+sides))
        ff.extend([tuple(reversed(range(sides))),tuple((len(centers)-1)*sides+i for i in range(sides))])
        # Keep the editable curve generator in a disabled archive collection.
        archive=bpy.data.collections.get('HAIR_CURVE_GUIDES')
        if archive is None:
            archive=collection('HAIR_CURVE_GUIDES'); archive.hide_render=True; archive.hide_viewport=True
        hair.objects.unlink(o); archive.objects.link(o); o.name=name+'_Guide'
        mesh(name,vv,ff,hair,bpy.data.materials['MAT_Hair_Black'])
    # Exact normalized crown datum; full lower body remains unbuilt.
    maxz=max(v.co.z for o in hair.objects if o.type=='MESH' for v in o.data.vertices)
    for o in hair.objects:
        if o.type=='MESH':
            for v in o.data.vertices:
                v.co.z=.940+(v.co.z-.940)*(.060/(maxz-.940))
            o.data.update()
    bpy.context.scene['hair_crown_z']=1.0
    return {'correction':'shoulder coverage; flattened principal hair locks','hair_crown_z':1.0}

def save_delivery():
    scene=bpy.context.scene
    assert not OUT.exists(), 'Never overwrite a previous delivery'
    # Keep a dedicated gray scene with linked editable geometry and its own display state.
    gray=bpy.data.scenes.get('HORI_V2_FACE_GRAY') or bpy.data.scenes.new('HORI_V2_FACE_GRAY')
    for name in ['MODEL_HORI_V2','REVIEW_CAMERAS']:
        if name not in gray.collection.children:
            gray.collection.children.link(bpy.data.collections[name])
    gray.unit_settings.system='METRIC'; gray.unit_settings.length_unit='METERS'; gray.unit_settings.scale_length=1
    gray['character_height']=1.0; gray['coordinate_system']=scene['coordinate_system']
    gray.render.engine='BLENDER_WORKBENCH'
    gray.render.resolution_x=850; gray.render.resolution_y=850; gray.render.resolution_percentage=100
    gray.display.shading.light='STUDIO'; gray.display.shading.color_type='SINGLE'; gray.display.shading.single_color=(.5,.5,.5)
    gray.display.shading.show_cavity=True; gray.display.shading.cavity_type='BOTH'
    gray.world=scene.world.copy()
    gray.view_settings.view_transform='Standard'
    bpy.context.window.scene=gray
    bpy.context.view_layer.update()
    gray.view_layers[0].layer_collection.children['MODEL_HORI_V2'].children['HAIR_MAIN'].exclude=True
    gray.camera=bpy.data.objects['CAM_Face_LeftFront45']
    gray['usage']='Hair excluded; linked editable geometry; neutral Workbench material state'
    bpy.context.window.scene=scene
    bpy.context.view_layer.update()
    scene.camera=bpy.data.objects['CAM_Bust_LeftFront45']
    scene.display.shading.color_type='MATERIAL'
    scene['not_verified']='UV, rig, animation, complete non-intersection, engine export, final likeness'
    scene['proportion_note']='Full height datum 1.0; upper body only. Head width ~0.088 replaces provisional README 0.155 to retain natural adult proportions.'
    # Correct any procedural face winding while retaining topology and unapplied modifiers.
    import bmesh
    for c in bpy.data.collections['MODEL_HORI_V2'].children:
        for o in c.objects:
            if o.type=='MESH':
                bm=bmesh.new(); bm.from_mesh(o.data)
                bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
                bm.to_mesh(o.data); bm.free()
    bpy.context.view_layer.update()
    for im in bpy.data.images:
        if im.source=='FILE' and not im.packed_file:
            im.pack()
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                space=area.spaces.active
                space.overlay.show_overlays=False
                space.clip_start=.001
                space.shading.type='SOLID'; space.shading.color_type='MATERIAL'
                space.region_3d.view_distance=.72
                space.region_3d.view_location=(0,0,.75)
                space.region_3d.view_rotation=scene.camera.rotation_euler.to_quaternion()
                space.region_3d.view_perspective='ORTHO'
    bpy.ops.object.select_all(action='DESELECT')
    head=bpy.data.objects['HD_Head_Cage']; head.select_set(True); bpy.context.view_layer.objects.active=head
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT))
    return {'saved':str(OUT),'scenes':[s.name for s in bpy.data.scenes],'reference_count':len(bpy.data.collections['REF_9VIEWS'].objects)}

def refine_shoulder_slope():
    # Lower deltoid apex beneath neckline; retain sleeve and body editing cages.
    mapping=[(.718,.718),(.728,.728),(.754,.750),(.782,.771),(.806,.790),(.817,.801),(.827,.811),(.834,.816)]
    for suffix in ['L','R']:
        bpy.data.objects['HD_Deltoid_'+suffix].location.z-=.017
        o=bpy.data.objects['HD_TShirt_Sleeve_'+suffix]
        for v in o.data.vertices:
            v.co.z=interpolate(v.co.z,mapping,1)
        o.data.update()
    for name in ['HD_Thorax_Waist','HD_TShirt_Torso']:
        o=bpy.data.objects[name]
        for v in o.data.vertices:
            if abs(v.co.z-.807)<1e-6:
                v.co.x*=1.16
        o.data.update()
    return {'refinement':'natural sloping shoulders below collar; no isolated shoulder peaks'}

def refine_chest_coverage():
    o=bpy.data.objects['HD_TShirt_Torso']
    for j in range(len(o.data.vertices)//48):
        ring=list(o.data.vertices[j*48:(j+1)*48])
        z=ring[0].co.z
        if .690 < z < .809:
            cy=sum(v.co.y for v in ring)/48
            radius=max(abs(v.co.y-cy) for v in ring)+.002
            for i,v in enumerate(ring):
                c=math.cos(2*math.pi*i/48)
                v.co.y=cy-radius*math.copysign(abs(c)**.5,c)
    o.data.update()
    for suffix in ['L','R']:
        bpy.data.objects['HD_Deltoid_'+suffix].scale.y=.8
    return {'refinement':'broader pectoral garment cross section and covered inner deltoid'}
