import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { inflateSync } from "node:zlib";

const directory = fileURLToPath(new URL("../assets/original/world-kit/", import.meta.url));
const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
const partLimits = { CoastalPine: 8, CoastalRock: 3, SupplyCrate: 4, ScrapPile: 3 };
const componentCounts = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
for (const [name, expected] of Object.entries(manifest.models)) {
  const data = await readFile(path.join(directory, `${name}.glb`));
  assert.equal(data.readUInt32LE(0), 0x46546c67, `${name}: GLB magic`);
  assert.equal(data.readUInt32LE(4), 2, `${name}: GLB version`);
  assert.equal(data.readUInt32LE(8), data.length, `${name}: total length`);
  assert.equal(data.readUInt32LE(16), 0x4e4f534a, `${name}: JSON chunk`);
  const jsonLength = data.readUInt32LE(12);
  assert.equal(jsonLength % 4, 0, `${name}: JSON alignment`);
  const gltf = JSON.parse(data.subarray(20, 20 + jsonLength).toString("utf8"));
  const binaryHeader = 20 + jsonLength;
  assert.equal(data.readUInt32LE(binaryHeader + 4), 0x004e4942, `${name}: BIN chunk`);
  const binary = data.subarray(binaryHeader + 8);
  assert.equal(binary.length, data.readUInt32LE(binaryHeader), `${name}: BIN length`);
  assert.equal(binary.length, gltf.buffers[0].byteLength, `${name}: declared buffer length`);
  assert.equal(gltf.asset.version, "2.0");
  assert.equal(gltf.meshes.length, expected.materialParts);
  assert(gltf.meshes.length <= partLimits[name], `${name}: mesh part budget`);
  assert.equal(gltf.nodes[0].children.length, gltf.meshes.length);
  assert.equal(gltf.materials.length, gltf.meshes.length);
  for (const view of gltf.bufferViews) {
    assert.equal(view.buffer, 0);
    assert.equal(view.byteOffset % 4, 0, `${name}: view alignment`);
    assert(view.byteOffset + view.byteLength <= binary.length, `${name}: buffer view bounds`);
  }
  function accessor(index) {
    const descriptor = gltf.accessors[index];
    const view = gltf.bufferViews[descriptor.bufferView];
    const components = componentCounts[descriptor.type];
    assert(components, `${name}: supported accessor shape`);
    assert([5123, 5126].includes(descriptor.componentType), `${name}: supported scalar type`);
    const bytes = descriptor.componentType === 5123 ? 2 : 4;
    const offset = view.byteOffset + (descriptor.byteOffset ?? 0);
    assert.equal(offset % bytes, 0, `${name}: accessor alignment`);
    assert.equal(descriptor.count * components * bytes, view.byteLength, `${name}: accessor size`);
    return Array.from({ length: descriptor.count }, (_, element) =>
      Array.from({ length: components }, (_, component) => {
        const index = offset + (element * components + component) * bytes;
        const value = bytes === 2 ? binary.readUInt16LE(index) : binary.readFloatLE(index);
        assert(Number.isFinite(value), `${name}: finite accessor value`);
        return value;
      }),
    );
  }
  let triangles = 0;
  const positions = [];
  for (const mesh of gltf.meshes) {
    assert.equal(mesh.primitives.length, 1);
    const primitive = mesh.primitives[0];
    assert.equal(primitive.mode, 4);
    const vertices = accessor(primitive.attributes.POSITION);
    const normals = accessor(primitive.attributes.NORMAL);
    const uvs = accessor(primitive.attributes.TEXCOORD_0);
    const indices = accessor(primitive.indices).flat();
    assert.equal(vertices.length, normals.length);
    assert.equal(vertices.length, uvs.length);
    assert.equal(indices.length % 3, 0);
    assert(indices.every((index) => index < vertices.length));
    assert(uvs.every((uv) => uv.every((value) => value >= 0 && value <= 1)));
    assert(normals.every((normal) => Math.abs(Math.hypot(...normal) - 1) < 0.00001));
    const declared = gltf.accessors[primitive.attributes.POSITION];
    for (let axis = 0; axis < 3; axis++) {
      assert(Math.abs(Math.min(...vertices.map((v) => v[axis])) - declared.min[axis]) < 0.00001);
      assert(Math.abs(Math.max(...vertices.map((v) => v[axis])) - declared.max[axis]) < 0.00001);
    }
    for (let index = 0; index < indices.length; index += 3) {
      const [a, b, c] = indices.slice(index, index + 3).map((i) => vertices[i]);
      const ab = b.map((n, i) => n - a[i]);
      const ac = c.map((n, i) => n - a[i]);
      const rawNormal = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ];
      const length = Math.hypot(...rawNormal);
      assert(length > 0.0000001, `${name}: nondegenerate triangles`);
      const normal = normals[indices[index]];
      const alignment = rawNormal.reduce((sum, n, i) => sum + (n / length) * normal[i], 0);
      assert(alignment > 0.99999, `${name}: normals match face winding`);
    }
    const material = gltf.materials[primitive.material];
    assert.equal(material.pbrMetallicRoughness.baseColorTexture.index, 0);
    assert.deepEqual(material.pbrMetallicRoughness.baseColorFactor, [1, 1, 1, 1]);
    assert.equal(material.alphaMode, "OPAQUE");
    positions.push(...vertices);
    triangles += indices.length / 3;
  }
  assert.equal(triangles, expected.triangles);
  const dimensions = [0, 1, 2].map(
    (axis) =>
      Math.max(...positions.map((v) => v[axis])) - Math.min(...positions.map((v) => v[axis])),
  );
  dimensions.forEach((dimension, axis) =>
    assert(Math.abs(dimension - expected.dimensionsStuds[axis]) < 0.0001),
  );

  const image = gltf.images[0];
  assert.equal(image.mimeType, "image/png");
  const imageView = gltf.bufferViews[image.bufferView];
  const png = binary.subarray(imageView.byteOffset, imageView.byteOffset + imageView.byteLength);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 16);
  assert.equal(png.readUInt32BE(20), 1);
  let pngOffset = 8;
  const compressed = [];
  while (pngOffset < png.length) {
    const length = png.readUInt32BE(pngOffset);
    const type = png.subarray(pngOffset + 4, pngOffset + 8).toString("ascii");
    if (type === "IDAT") compressed.push(png.subarray(pngOffset + 8, pngOffset + 8 + length));
    pngOffset += 12 + length;
  }
  const pixels = inflateSync(Buffer.concat(compressed));
  assert.equal(pixels.length, 49);
  assert.equal(pixels[0], 0);
  for (const mesh of gltf.meshes) {
    const primitive = mesh.primitives[0];
    const uv = accessor(primitive.attributes.TEXCOORD_0)[0];
    const pixel = Math.floor(uv[0] * 16);
    const authored = gltf.materials[primitive.material].extras.authoredSrgb;
    authored.forEach((channel, axis) =>
      assert.equal(pixels[1 + pixel * 3 + axis], Math.round(channel * 255)),
    );
  }
  const alternate = JSON.parse(await readFile(path.join(directory, `${name}.gltf`), "utf8"));
  const embedded = Buffer.from(alternate.buffers[0].uri.split(",")[1], "base64");
  assert.deepEqual(embedded, binary, `${name}: glTF/GLB binary parity`);
  assert.deepEqual(alternate.meshes, gltf.meshes);
  console.log(
    `${name}: ${triangles} triangles, ${gltf.meshes.length} material parts, bounds ${dimensions.map((n) => n.toFixed(3)).join(" × ")} studs; buffer/accessor/normal/palette checks passed.`,
  );
}

async function readGlb(filename) {
  const bytes = await readFile(path.join(directory, filename));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(jsonLength % 4, 0);
  const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
  const binaryHeader = 20 + jsonLength;
  assert.equal(bytes.readUInt32LE(binaryHeader + 4), 0x004e4942);
  const binary = bytes.subarray(binaryHeader + 8);
  assert.equal(binary.length, bytes.readUInt32LE(binaryHeader));
  assert.equal(binary.length, document.buffers[0].byteLength);
  for (const view of document.bufferViews) {
    assert.equal(view.buffer, 0);
    assert.equal(view.byteOffset % 4, 0);
    assert(view.byteOffset + view.byteLength <= binary.length);
  }
  return { document, binary };
}

function accessorBytes(model, index) {
  const accessor = model.document.accessors[index];
  const view = model.document.bufferViews[accessor.bufferView];
  const offset = view.byteOffset + (accessor.byteOffset ?? 0);
  const components = componentCounts[accessor.type];
  assert(components);
  assert([5123, 5126].includes(accessor.componentType));
  const length = accessor.count * components * (accessor.componentType === 5123 ? 2 : 4);
  assert.equal(length, view.byteLength);
  return model.binary.subarray(offset, offset + length);
}

const library = await readGlb("WorldArtLibrary.glb");
const document = library.document;
assert.equal(document.nodes[0].name, "WorldArtLibrary");
assert.deepEqual(document.scenes[document.scene].nodes, [0]);
assert.equal(document.nodes[0].children.length, 4);
assert.equal(document.meshes.length, manifest.library.materialParts);
assert.equal(document.images.length, 1);
assert.equal(document.textures.length, 1);
let libraryTriangles = 0;
const names = [];
for (const modelIndex of document.nodes[0].children) {
  const model = document.nodes[modelIndex];
  names.push(model.name);
  assert(manifest.models[model.name]);
  assert.equal(model.children.length, manifest.models[model.name].materialParts);
  assert.equal(model.translation.length, 3);
  assert(model.translation.every(Number.isFinite));
  const standalone = await readGlb(`${model.name}.glb`);
  for (const [index, childIndex] of model.children.entries()) {
    const child = document.nodes[childIndex];
    const sourceChild = standalone.document.nodes[standalone.document.nodes[0].children[index]];
    assert.equal(child.name, sourceChild.name);
    const primitive = document.meshes[child.mesh].primitives[0];
    const sourcePrimitive = standalone.document.meshes[sourceChild.mesh].primitives[0];
    assert.equal(primitive.mode, sourcePrimitive.mode);
    for (const attribute of ["POSITION", "NORMAL", "TEXCOORD_0"]) {
      const accessor = document.accessors[primitive.attributes[attribute]];
      const sourceAccessor = standalone.document.accessors[sourcePrimitive.attributes[attribute]];
      for (const property of ["count", "type", "componentType", "min", "max"]) {
        assert.deepEqual(accessor[property], sourceAccessor[property]);
      }
      assert.deepEqual(
        accessorBytes(library, primitive.attributes[attribute]),
        accessorBytes(standalone, sourcePrimitive.attributes[attribute]),
        `${model.name}: merged ${attribute} remains unchanged`,
      );
    }
    assert.deepEqual(
      accessorBytes(library, primitive.indices),
      accessorBytes(standalone, sourcePrimitive.indices),
      `${model.name}: merged triangle indices remain unchanged`,
    );
    assert.deepEqual(
      document.materials[primitive.material],
      standalone.document.materials[sourcePrimitive.material],
    );
    libraryTriangles += document.accessors[primitive.indices].count / 3;
  }
  const libraryPalette = document.bufferViews[document.images[0].bufferView];
  const sourcePalette = standalone.document.bufferViews[standalone.document.images[0].bufferView];
  assert.deepEqual(
    library.binary.subarray(
      libraryPalette.byteOffset,
      libraryPalette.byteOffset + libraryPalette.byteLength,
    ),
    standalone.binary.subarray(
      sourcePalette.byteOffset,
      sourcePalette.byteOffset + sourcePalette.byteLength,
    ),
    `${model.name}: shared palette remains unchanged`,
  );
}
assert.deepEqual(names, manifest.library.childModels);
assert.equal(libraryTriangles, manifest.library.triangles);
const alternateLibrary = JSON.parse(
  await readFile(path.join(directory, "WorldArtLibrary.gltf"), "utf8"),
);
assert.deepEqual(
  Buffer.from(alternateLibrary.buffers[0].uri.split(",")[1], "base64"),
  library.binary,
);
assert.deepEqual(alternateLibrary.nodes, document.nodes);
assert.deepEqual(alternateLibrary.meshes, document.meshes);
console.log(
  `WorldArtLibrary: ${names.length} named child models, ${libraryTriangles} triangles, ${document.meshes.length} material parts; merged geometry/normals/indices/materials are byte-identical to validated standalone models, sharing one palette image.`,
);
