# Original WAR WORLD environment kit

These four low-poly models are original geometry authored for this project. No downloaded model,
texture, marketplace package or embedded script is used. They are generated deterministically by
`scripts/generate-original-world-kit.mjs`; `manifest.json` records vertex and triangle counts.
They can be modified and redistributed with this game. Units are Roblox studs.

Prefer **WorldArtLibrary.glb** for one Studio import. Its four named child models are
`CoastalPine`, `CoastalRock`, `SupplyCrate` and `ScrapPile`: 1,110 triangles and 12 material meshes
in total, sharing one palette image. Child translations separate the import preview only; geometry
matches the standalone models exactly. Individual GLB files remain available.

Each GLB contains separate named material meshes, explicit normals,
UV coordinates, matte PBR materials and a tiny original 16×1 palette PNG embedded in the same file.
The `.gltf` version is also self-contained, with a data-URI buffer, if a file picker does not accept
GLB. OBJ/MTL remains available as an editable source alternative; Studio's initial OBJ preview did
not preserve its material colours, so it should not be the primary importer format.

## Verified import and saved library

On 2026-09-27, the owner opened `build/WarWorldArt.rbxlx` in the existing Studio session under
`Xriccard0xxxfire`. The combined **WorldArtLibrary.glb** import completed with **Upload to Roblox**
enabled and creator **Me**: the upload queue showed success and all four colored models were
visible in the editor, not only in the import preview. Import settings were ScaleUnit **Stud**,
scale factor **1**, combined dimensions **30.66 × 24.40 × 21.79** studs and **1,110** polygons.
This supersedes the earlier individual CoastalPine upload's HTTP 401; no login refresh or repeat
upload is currently required.

The saved authoring place contains 12 MeshParts with distinct Roblox mesh asset IDs and shared
TextureID `rbxassetid://96332452588684`. Four templates were cloned as direct children of
`ServerStorage.WorldArtLibrary`: `CoastalPine` (5 parts), `CoastalRock` (2), `SupplyCrate` (3)
and `ScrapPile` (2). All were configured anchored, with Automatic RenderFidelity and Hull
CollisionFidelity. The exported `WorldArtLibrary.rbxmx` now exists here, and `default.project.json`
maps it to `ServerStorage.WorldArtLibrary`.

The palette briefly reported that its asset representation was being generated before the editor
showed the colors. Upload and editor inspection do not guarantee fresh-client asset delivery.
In-game appearance, collision, gathering/respawn, round resets, multiplayer replication,
private-staging delivery and real-device performance still need acceptance tests.

## Reuse or refresh the saved library

Normal game builds use the exported `.rbxmx` and its existing asset IDs; **do not re-upload the
models to rebuild**. To capture deliberate changes made to the authoring library:

1. In the existing Studio session, stop Play and save `build/WarWorldArt.rbxlx`, preserving the
   four direct-child templates and their names in `ServerStorage.WorldArtLibrary`.
2. From the repository root, export the saved library with the Python standard-library helper:

   ```sh
   /usr/bin/python3 scripts/export-studio-art.py
   ```

3. Rebuild the game with `npm run check`, then open the exact `build/WarWorld.rbxlx` in Studio.
   Inspect the library and test it in Play; the authoring place contains no gameplay scripts.

The helper reads `build/WarWorldArt.rbxlx` and writes
`assets/original/world-kit/WorldArtLibrary.rbxmx` without modifying the source place. It validates
the hierarchy, 5/2/3/2 part counts, anchoring, Automatic rendering, 12 distinct mesh IDs, one shared
texture ID and absence of scripts/external instance references. It preserves and round-trip checks
the serialized library and referenced SharedStrings. Current Studio stores physics configuration
in opaque payloads; the helper preserves them but does not independently prove the Hull setting.

Preserve the saved authoring `.rbxlx` and source GLB, glTF and OBJ/MTL files. `art.project.json`
creates an **empty** authoring library with a neutral floor; rebuilding it over the saved authoring
place would replace the Studio import. Build a new authoring place only deliberately, after saving
needed work elsewhere. Use `Workspace.ArtPreview` to inspect new or modified geometry.

For a deliberate new geometry import, select the combined GLB (or self-contained glTF), verify
Stud units and scale factor 1, then inspect the upload result and actual editor objects. Keep
the material meshes separate and restore the exact template hierarchy before saving/exporting.
The runtime permits at most eight parts for the tree, three for rock/scrap and four for the crate;
oversized templates fall back to generated art. New asset uploads and publication are separate
operations; do not interpret a local preview as either one.

The optional loader in `src/server/world/original-art-library.ts` clones each template, anchors it,
normalises its placement to the bottom of its bounding box, and
uses the supplied scale. Decorative tree meshes do not collide; a simple invisible trunk collider
does. Resource art sits under the resource hitbox and hides/respawns with it.

Local import is not the same as publishing. Test the saved local file, then check mesh availability
in a private published staging experience before public release. No upload is performed by the
generator or the game scripts. The runtime does not depend on EditableMesh account permissions.

## Terrain and authored map contract

- `Workspace.World.GeneratedWorld` is disposable match/gameplay content.
- `Workspace.World.Environment` is the generated map. If it already exists, bootstrap preserves its
  geometry and Terrain so a refined local map can replace the procedural starting point.
- `Workspace.World.AuthoredEnvironment` is always preserved. Set its Boolean attribute
  `UseAuthoredTerrain` to `true` to skip procedural Terrain writing on initial setup.
- Generated terrain only writes the island region, from `(-328, -24, -328)` to `(328, 32, 328)`.
  It never calls `Terrain.Clear()`.
- Six team camps, three monument pads and travel lanes share `world-layout.ts`. Camp and monument
  surfaces remain at Y = 0; monument platforms are two studs above the ground.

The declared budgets are 28 scenery trees, 22 rock clusters, 36 grass tufts, nine loose industrial
props, 500 scenery BaseParts and 850 environmental BaseParts. These are static content budgets,
not an FPS guarantee. Profile on actual target devices and with completed player bases.

## Offline geometry preview

`node scripts/preview-original-world-kit.mjs` reads the exported OBJ and MTL and writes a shaded
orthographic inspection sheet at `build/original-world-kit-preview.svg`. If `rsvg-convert` is
available, render it with
`rsvg-convert -o build/original-world-kit-preview.png build/original-world-kit-preview.svg`.
This checks silhouettes, material colours and visible face orientation without uploading anything.
It is not a screenshot or performance test of Roblox.

Run `node scripts/validate-original-world-kit.mjs` to check GLB headers and buffer alignment,
accessor ranges, triangle indices, finite unit normals, face orientation, model dimensions,
material-part budgets, embedded palette colours, and parity with the self-contained glTF version.
The combined library is checked against all validated standalone models, including byte-identical
positions, normals, UVs and triangle indices, unchanged material definitions and the shared palette.
Passing those checks does not replace inspection in Studio.

Geometry, PNG and GLB encoding use Node standard-library APIs only. The generator uses the project's
existing Prettier development dependency to format generated JSON/glTF text reproducibly; regenerating
assets therefore preserves the repository's formatting checks. Run it after installing project dependencies.
