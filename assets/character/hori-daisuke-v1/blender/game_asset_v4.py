import bpy
import bmesh
import math
import json
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parent
ASSET=ROOT.parent
PREVIEW=ROOT/'previews-v4'
EXPORT=ASSET/'export/v4'

def combine(name,objects,col,close=False):
    deps=bpy.context.evaluated_depsgraph_get()
    vertices=[]; faces=[]; slots=[]; mids=[]
    for obj in objects:
        ev=obj.evaluated_get(deps); me=ev.to_mesh()
        offset=len(vertices)
        vertices.extend(tuple(obj.matrix_world@v.co) for v in me.vertices)
        local=[]
        for m in me.materials:
            if m not in slots: slots.append(m)
            local.append(slots.index(m))
        for p in me.polygons:
            faces.append(tuple(offset+i for i in p.vertices))
            mids.append(local[min(p.material_index,len(local)-1)] if local else 0)
        ev.to_mesh_clear()
    me=bpy.data.meshes.new(name+'_Mesh'); me.from_pydata(vertices,[],faces); me.update()
    for m in slots: me.materials.append(m)
    for p,mi in zip(me.polygons,mids): p.material_index=mi; p.use_smooth=True
    bm=bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7)
    if close:
        bmesh.ops.holes_fill(bm,edges=[e for e in bm.edges if e.is_boundary],sides=0)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(me); bm.free()
    ob=bpy.data.objects.new(name,me); col.objects.link(ob)
    return ob

def prepare():
    assert 'GAME_HORI_V4' not in bpy.data.collections
    if bpy.context.object and bpy.context.object.mode!='OBJECT': bpy.ops.object.mode_set(mode='OBJECT')
    s=bpy.context.scene; s.name='HORI_V4_GAME'
    col=bpy.data.collections.new('GAME_HORI_V4'); s.collection.children.link(col)
    def objects(names): return [bpy.data.objects[n] for n in names]
    face=bpy.data.collections['GEO_FACE']
    skull=['HD_Head_Cage','HD_Neck']+[o.name for o in face.objects if 'Ear' in o.name]
    combine('Hori_SkinHead',objects(skull),col,True)
    features=[o for o in face.objects if o.name not in skull]
    combine('Hori_FaceDetails',features,col)
    for suffix in ['L','R']:
        parts=[bpy.data.objects['HD_Arm_'+suffix]]+[o for o in bpy.data.collections['V3_HANDS'].objects if o.name.endswith(suffix) or ('_'+suffix in o.name)]
        combine('Hori_ArmHand_'+suffix,parts,col,True)
    combine('Hori_Shirt',list(bpy.data.collections['WARDROBE_TSHIRT'].objects),col,True)
    combine('Hori_Pants',[bpy.data.objects['V3_Pants_Unified']],col,True)
    hair=combine('Hori_Hair',list(bpy.data.collections['HAIR_MAIN'].objects),col)
    # Reduce regimented hair shape with low-frequency asymmetry, preserving roots.
    for v in hair.data.vertices:
        x,y,z=v.co; a=math.atan2(x,-(y-.006))
        if z>.949:
            t=max(0,min(1,(z-.949)/.045))
            lift=.0016*math.sin(9*a+24*z)+.0012*math.sin(17*a-50*z)
            v.co.z+=lift*t; v.co.x+=.0015*t*math.sin(5*a+22*z)
    hair.data.update()
    for suffix in ['L','R']:
        combine('Hori_Shoe_'+suffix,[o for o in bpy.data.collections['V3_LOWER_BODY'].objects if ('Sneaker_'+suffix in o.name or 'Sole_'+suffix in o.name or 'Lace_'+suffix in o.name)],col,True)
    s.view_layers[0].layer_collection.children['MODEL_HORI_V2'].exclude=True
    PREVIEW.mkdir(exist_ok=True); EXPORT.mkdir(parents=True,exist_ok=True)
    return {'game_meshes':[(o.name,len(o.data.vertices),len(o.data.polygons)) for o in col.objects]}

def finish_geometry():
    col=bpy.data.collections['GAME_HORI_V4']
    for o in col.objects:
        if o.type!='MESH': continue
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active=o
        for m in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
        for p in o.data.polygons: p.use_smooth=True
    # Reproject facial parts onto the revised head without flattening their relief.
    head=bpy.data.objects['Hori_SkinHead']; bm=bmesh.new(); bm.from_mesh(head.data)
    tree=BVHTree.FromBMesh(bm)
    detail=bpy.data.objects['Hori_FaceDetails']
    for v in detail.data.vertices:
        x,y,z=v.co
        hit,normal,idx,dist=tree.ray_cast(Vector((x,-.2,z)),Vector((0,1,0)),.3)
        if hit is not None and y<0:
            # Keep shallow features outside the final surface; lips remain thin.
            v.co.y=min(y,hit.y-.00045)
    bm.free(); detail.data.update()
    # Use matte, exportable Principled materials and avoid reliance on Workbench shine.
    for o in col.objects:
        for mat in o.data.materials:
            if mat is None: continue
            mat.use_nodes=True
            bs=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
            if bs:
                bs.inputs['Metallic'].default_value=0
                bs.inputs['Roughness'].default_value=.72 if 'Sport' in mat.name or 'Pants' in mat.name else .53
                bs.inputs['Specular IOR Level'].default_value=.25
    bpy.context.view_layer.update()
    return {'triangles':{o.name:sum(len(p.vertices)-2 for p in o.data.polygons) for o in col.objects}}

def studio():
    s=bpy.context.scene
    s.render.engine='BLENDER_EEVEE'
    s.render.resolution_x=850; s.render.resolution_y=1000; s.render.resolution_percentage=100
    s.render.image_settings.file_format='PNG'
    s.world=bpy.data.worlds.new('V4_Studio_World'); s.world.use_nodes=True
    bg=next(n for n in s.world.node_tree.nodes if n.type=='BACKGROUND')
    bg.inputs[0].default_value=(.075,.085,.105,1); bg.inputs[1].default_value=.5
    s.view_settings.view_transform='AgX'
    col=bpy.data.collections.new('V4_STUDIO'); s.collection.children.link(col)
    for name,pos,energy,size in [('Key',(-.9,-1.1,1.7),75,1.2),('Fill',(.9,-.6,1.0),40,1.0),('Rim',(.3,.8,1.4),90,.9)]:
        d=bpy.data.lights.new('V4_'+name,'AREA'); d.energy=energy; d.shape='DISK'; d.size=size
        o=bpy.data.objects.new(d.name,d); col.objects.link(o); o.location=pos
        o.rotation_euler=(Vector((0,0,.65))-o.location).to_track_quat('-Z','Y').to_euler()
    s.camera=bpy.data.objects['CAM_Full_LeftFront45']
    return {'studio':'EEVEE matte materials with three broad area lights'}

def render(name,kind='Full',gray=False,frame=1):
    s=bpy.context.scene; s.frame_set(frame)
    s.camera=bpy.data.objects['CAM_'+kind+'_'+name]
    s.render.resolution_x=900; s.render.resolution_y=1100 if kind=='Full' else 900
    original_engine=s.render.engine
    hair=bpy.data.objects['Hori_Hair']; old=hair.hide_render
    if gray:
        s.render.engine='BLENDER_WORKBENCH'; s.display.shading.color_type='SINGLE'; s.display.shading.single_color=(.5,.5,.5); hair.hide_render=True
    s.render.filepath=str(PREVIEW/('v4-'+kind+('-gray' if gray else '')+'-'+name+'-f'+str(frame)+'.png'))
    bpy.ops.render.render(write_still=True)
    s.render.engine=original_engine; hair.hide_render=old
    return {'render':s.render.filepath}

def optimize():
    """Fallback for a disconnected interactive addon; modifies only GAME meshes."""
    settings={'Hori_SkinHead':(.0010,4,.43),'Hori_ArmHand_L':(.0012,4,.48),'Hori_ArmHand_R':(.0012,4,.48),'Hori_Shirt':(.0020,7,.35),'Hori_Pants':(None,18,.11),'Hori_Hair':(None,0,.28),'Hori_FaceDetails':(None,0,.40),'Hori_Shoe_L':(None,2,.65),'Hori_Shoe_R':(None,2,.65)}
    for name,(voxel,smooth,ratio) in settings.items():
        o=bpy.data.objects[name]
        if name=='Hori_SkinHead':
            for v in o.data.vertices:
                x,y,z=v.co
                if y<-.046:
                    v.co.y+=.003*math.exp(-(x/.01)**2-((z-.907)/.013)**2)
            o.data.update()
        if voxel:
            m=o.modifiers.new('Game_Union','REMESH'); m.mode='VOXEL'; m.voxel_size=voxel; m.use_smooth_shade=True
        if smooth:
            m=o.modifiers.new('Shape_Continuity','SMOOTH'); m.factor=.6; m.iterations=smooth
        m=o.modifiers.new('Game_Polygon_Budget','DECIMATE'); m.ratio=ratio
    result=finish_geometry()
    # Capsule-style laces buried in source footwear become visible with raised detail.
    for o in [bpy.data.objects['Hori_Shoe_L'],bpy.data.objects['Hori_Shoe_R']]:
        o['part']='footwear; rigid foot weights below ankle'
    return result

def auto_uv():
    report={}
    for o in bpy.data.collections['GAME_HORI_V4'].objects:
        if o.type!='MESH': continue
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active=o
        if not o.data.uv_layers: o.data.uv_layers.new(name='UVMap')
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.015,area_weight=.3,correct_aspect=True,scale_to_bounds=True)
        bpy.ops.object.mode_set(mode='OBJECT')
        report[o.name]=len(o.data.uv_layers.active.data)
    return {'uv_loops':report,'method':'Smart projection; editable color-block PBR materials, no photo textures'}

def save_work():
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'hori-daisuke-v4-work.blend'))
