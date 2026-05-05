"""
Exports the armature from a Mixamo GLB as a new GLB with no mesh, no material,
and no animations — just the skeleton in bind pose.

Usage:
  blender --background --python scripts/extractRig.py -- input.glb output-rig.glb
"""
import bpy, sys

argv = sys.argv
sep = argv.index('--') + 1
input_glb, output_glb = argv[sep], argv[sep + 1]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=input_glb)

# Remove all mesh objects and strip animations, keeping only armatures.
for obj in list(bpy.data.objects):
    if obj.type == 'MESH':
        bpy.data.objects.remove(obj, do_unlink=True)
    elif obj.type == 'ARMATURE':
        obj.animation_data_clear()

# Purge orphaned data (meshes, materials, images, actions).
bpy.ops.outliner.orphans_purge(do_recursive=True)

bpy.ops.export_scene.gltf(
    filepath=output_glb,
    export_format='GLB',
    export_animations=False,
    export_skins=True,
    export_materials='NONE',
    export_apply=False,
)
print(f'Exported rig: {output_glb}')
