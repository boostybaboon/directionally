"""
Exports each animation from a Mixamo GLB/FBX as a separate animation-only GLB
(armature + one clip, no mesh, no material).

Usage:
  blender --background --python scripts/extractAnimations.py -- input.glb output_dir/ [label]

  label  Optional. When given, the first exported clip is renamed to this string
         (useful for single-clip Mixamo downloads: pass "walk", "run", etc.).
         When omitted the script derives a name from the Blender action name by
         stripping Mixamo's pipe-separated noise (e.g. "Walk|mixamo.com|Layer0" → "walk").

Produces: output_dir/anim-<name>.glb for each action in the file.
"""
import bpy, sys, os, re

argv = sys.argv
sep = argv.index('--') + 1
args = argv[sep:]
input_glb = args[0]
output_dir = args[1]
label_override = args[2] if len(args) > 2 else None

os.makedirs(output_dir, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)

# Support both GLB and FBX input.
if input_glb.lower().endswith('.fbx'):
    bpy.ops.import_scene.fbx(filepath=input_glb, use_anim=True,
                              automatic_bone_orientation=False, ignore_leaf_bones=False)
else:
    bpy.ops.import_scene.gltf(filepath=input_glb)

# Remove mesh objects; keep armatures.
for obj in list(bpy.data.objects):
    if obj.type == 'MESH':
        bpy.data.objects.remove(obj, do_unlink=True)

bpy.ops.outliner.orphans_purge(do_recursive=True)

# Find the armature.
armature = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
if armature is None:
    print('ERROR: no armature found')
    sys.exit(1)

# Filter to skeleton-level actions only — skip per-bone sub-tracks that contain
# a bone name in the action name (e.g. "Idle_mixamorig:LeftHandPinky3").
all_actions = list(bpy.data.actions)
actions = [a for a in all_actions if 'mixamorig' not in a.name]
print(f'Found {len(all_actions)} action(s), keeping {len(actions)} skeleton-level: {[a.name for a in actions]}')


def clean_name(raw: str) -> str:
    """Derive a clean clip name from a Blender action name."""
    name = raw
    # Strip leading 'Armature|' or 'Character|' (armature object prefix Blender adds)
    name = re.sub(r'^[A-Za-z0-9_]+\|', '', name)
    # Strip '|mixamo.com|...' suffix
    name = re.sub(r'\|mixamo\.com.*$', '', name, flags=re.IGNORECASE)
    name = re.sub(r'_Character$', '', name, flags=re.IGNORECASE)
    name = name.strip()
    return name.lower() if name else 'clip'


for i, action in enumerate(actions):
    if armature.animation_data is None:
        armature.animation_data_create()

    # Remove all NLA tracks so the exporter uses the action name directly
    # (without NLA, Blender GLTF exports as "ArmatureName|ActionName").
    for track in list(armature.animation_data.nla_tracks):
        armature.animation_data.nla_tracks.remove(track)

    # Determine the clean clip name and rename the action so it appears in the GLB.
    if label_override and len(actions) == 1:
        clip_name = label_override
    else:
        clip_name = clean_name(action.name)

    action.name = clip_name
    armature.animation_data.action = action

    safe_file = re.sub(r'[^A-Za-z0-9_\-]', '_', clip_name).strip('_')
    out_path = os.path.join(output_dir, f'anim-{safe_file}.glb')

    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format='GLB',
        export_animations=True,
        export_skins=True,
        export_materials='NONE',
        export_apply=False,
    )
    print(f'Exported: {out_path}  (clip: {clip_name!r})')

