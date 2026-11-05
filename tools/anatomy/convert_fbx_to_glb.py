"""Blender headless script: FBX -> GLB for the anatomy lab pipeline.

Run with Blender itself (not a plain python interpreter — this uses the
`bpy` module, which only exists inside Blender):

    blender --background --python tools/anatomy/convert_fbx_to_glb.py -- INPUT.fbx OUTPUT.glb

Applies Draco mesh compression (if the exporter build supports it) since
these anatomy models can be tens of MB raw — see docs/01-architecture.md
§8 ("evitar cargar modelos enormes innecesariamente").
"""
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
if len(argv) != 2:
    raise SystemExit("Uso: blender --background --python convert_fbx_to_glb.py -- INPUT.fbx OUTPUT.glb")

input_path, output_path = argv

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=input_path)

export_kwargs = dict(
    filepath=output_path,
    export_format="GLB",
    export_apply=True,
)
try:
    bpy.ops.export_scene.gltf(export_draco_mesh_compression_enable=True, **export_kwargs)
except TypeError:
    # Draco option not available in this Blender build — export uncompressed.
    bpy.ops.export_scene.gltf(**export_kwargs)

print(f"OK: {input_path} -> {output_path}")
