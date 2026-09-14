import bpy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TURN = ROOT / "turntable"

def clear_collection(name):
    col = bpy.data.collections.get(name)
    if col:
        for obj in list(col.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(col)

def ensure_collection(name):
    col = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if col.name not in bpy.context.scene.collection.children:
        try:
            bpy.context.scene.collection.children.link(col)
        except RuntimeError:
            pass
    return col

def add_image_plane(path, name, location, rotation, size=1.0):
    image = bpy.data.images.load(str(path), check_existing=True)
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = 'IMAGE'
    empty.data = image
    empty.empty_display_size = size
    empty.color[3] = 0.72
    empty.location = location
    empty.rotation_euler = rotation
    ref_col.objects.link(empty)
    return empty

clear_collection('REF_9VIEWS')
ref_col = ensure_collection('REF_9VIEWS')

# Front/back/side reference boards. The empties are intentionally non-rendering.
views = [
    ('front-0.png', 'REF_IMG_FRONT_0', (0, -0.22, 0.5), (1.5707963, 0, 0)),
    ('left-side-90.png', 'REF_IMG_LEFT_90', (0.22, 0, 0.5), (1.5707963, 0, 1.5707963)),
    ('back-180.png', 'REF_IMG_BACK_180', (0, 0.22, 0.5), (1.5707963, 0, 3.1415926)),
    ('right-side-270.png', 'REF_IMG_RIGHT_270', (-0.22, 0, 0.5), (1.5707963, 0, -1.5707963)),
    ('top-90.png', 'REF_IMG_TOP', (0, 0, 1.02), (0, 0, 0)),
]
for filename, name, loc, rot in views:
    add_image_plane(TURN / filename, name, loc, rot, 1.0)

scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.length_unit = 'METERS'
scene['character_reference'] = 'hori-daisuke-v1'
scene['reference_note'] = 'Generated orthographic-intent views; not calibrated scan data.'

out = ROOT / 'blender' / 'hori-daisuke-reference.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(out))
print(f'SAVED {out}')
