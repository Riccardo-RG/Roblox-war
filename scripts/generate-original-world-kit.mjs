import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { format, resolveConfig } from "prettier";

// Original geometry authored for WAR WORLD. No downloaded assets, textures or executable models.
const destination = fileURLToPath(new URL("../assets/original/world-kit/", import.meta.url));
await mkdir(destination, { recursive: true });
const formatting = (await resolveConfig(fileURLToPath(import.meta.url))) ?? {};
const writeJson = async (filename, value) =>
  writeFile(
    path.join(destination, filename),
    await format(JSON.stringify(value), { ...formatting, parser: "json" }),
  );
const palette = {
  bark: [0.32, 0.25, 0.18],
  barkLight: [0.43, 0.34, 0.24],
  leaves: [0.25, 0.39, 0.24],
  leavesLight: [0.34, 0.48, 0.28],
  leavesDark: [0.19, 0.31, 0.2],
  rock: [0.48, 0.51, 0.48],
  rockLight: [0.59, 0.6, 0.55],
  wood: [0.5, 0.39, 0.27],
  metal: [0.31, 0.36, 0.37],
  paint: [0.61, 0.39, 0.23],
  accent: [0.55, 0.67, 0.62],
};
let seed = 19873;
const random = () => {
  seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const add = (a, b) => a.map((n, i) => n + b[i]);
const mul = (v, f) => v.map((n) => n * f);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (v) => mul(v, 1 / Math.hypot(...v));

function crc32(data) {
  let crc = 0xffffffff;
  for (const value of data) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function palettePng() {
  const colors = Object.values(palette);
  const width = 16;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 2; // 8-bit RGB, one scanline. Base-colour textures are sRGB in glTF.
  const scanline = Buffer.alloc(1 + width * 3);
  for (let index = 0; index < width; index++) {
    const color = colors[index] ?? colors[colors.length - 1];
    color.forEach((channel, component) => {
      scanline[1 + index * 3 + component] = Math.round(channel * 255);
    });
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanline)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function packGlb(gltf, binary) {
  const jsonBytes = Buffer.from(JSON.stringify(gltf));
  const json = Buffer.concat([jsonBytes, Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.length + 8 + binary.length, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(json.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binary.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, json, binHeader, binary]);
}

function encodeGltf(name, mesh) {
  const chunks = [];
  let byteLength = 0;
  const gltf = {
    asset: {
      version: "2.0",
      generator: "WAR WORLD original mesh generator",
      copyright: "Original WAR WORLD geometry, 2026",
    },
    scene: 0,
    scenes: [{ name, nodes: [0] }],
    nodes: [{ name, children: [] }],
    meshes: [],
    materials: [],
    buffers: [],
    bufferViews: [],
    accessors: [],
    images: [],
    samplers: [{ magFilter: 9728, minFilter: 9728, wrapS: 33071, wrapT: 33071 }],
    textures: [{ sampler: 0, source: 0 }],
    extras: {
      authoredUnits: "stud",
      importScale: 1,
      note: "Positions use the same numeric stud dimensions as the OBJ source. Inspect Studio import scale before accepting.",
    },
  };
  function addView(data, target) {
    const padding = (4 - (byteLength % 4)) % 4;
    if (padding) {
      chunks.push(Buffer.alloc(padding));
      byteLength += padding;
    }
    const view = { buffer: 0, byteOffset: byteLength, byteLength: data.length };
    if (target !== undefined) view.target = target;
    const index = gltf.bufferViews.length;
    gltf.bufferViews.push(view);
    chunks.push(data);
    byteLength += data.length;
    return index;
  }
  function addAccessor(values, type, components, target, withBounds = false) {
    const integer = type === 5123;
    const data = Buffer.alloc(values.length * (integer ? 2 : 4));
    values.forEach((value, index) =>
      integer ? data.writeUInt16LE(value, index * 2) : data.writeFloatLE(value, index * 4),
    );
    const accessor = {
      bufferView: addView(data, target),
      componentType: type,
      count: values.length / components,
      type: components === 1 ? "SCALAR" : `VEC${components}`,
    };
    if (withBounds) {
      accessor.min = Array.from({ length: components }, (_, component) =>
        Math.min(...values.filter((_, index) => index % components === component)),
      );
      accessor.max = Array.from({ length: components }, (_, component) =>
        Math.max(...values.filter((_, index) => index % components === component)),
      );
    }
    const index = gltf.accessors.length;
    gltf.accessors.push(accessor);
    return index;
  }
  const materialNames = [...new Set(mesh.faces.map((face) => face.material))];
  for (const materialName of materialNames) {
    const faces = mesh.faces.filter((face) => face.material === materialName);
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    const paletteIndex = Object.keys(palette).indexOf(materialName);
    for (const face of faces) {
      const points = face.indices.map((index) => mesh.vertices[index - 1]);
      const normal = unit(
        cross(
          points[1].map((n, i) => n - points[0][i]),
          points[2].map((n, i) => n - points[0][i]),
        ),
      );
      if (!normal.every(Number.isFinite)) throw new Error(`${name}: degenerate triangle`);
      for (const point of points) {
        indices.push(indices.length);
        positions.push(...point);
        normals.push(...normal);
        uvs.push((paletteIndex + 0.5) / 16, 0.5);
      }
    }
    const materialIndex = gltf.materials.length;
    gltf.materials.push({
      name: `WW_${materialName}`,
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
        baseColorTexture: { index: 0 },
        metallicFactor: materialName === "metal" ? 0.2 : 0,
        roughnessFactor: materialName === "metal" ? 0.72 : 0.92,
      },
      alphaMode: "OPAQUE",
      doubleSided: false,
      extras: { authoredSrgb: palette[materialName] },
    });
    const meshIndex = gltf.meshes.length;
    gltf.meshes.push({
      name: `${name}_${materialName}`,
      primitives: [
        {
          attributes: {
            POSITION: addAccessor(positions, 5126, 3, 34962, true),
            NORMAL: addAccessor(normals, 5126, 3, 34962),
            TEXCOORD_0: addAccessor(uvs, 5126, 2, 34962),
          },
          indices: addAccessor(indices, 5123, 1, 34963),
          material: materialIndex,
          mode: 4,
        },
      ],
    });
    gltf.nodes[0].children.push(gltf.nodes.length);
    gltf.nodes.push({ name: `${name}_${materialName}`, mesh: meshIndex });
  }
  const imageView = addView(palettePng());
  gltf.images.push({ name: "WAR WORLD palette", bufferView: imageView, mimeType: "image/png" });
  const binaryPadding = (4 - (byteLength % 4)) % 4;
  if (binaryPadding) {
    chunks.push(Buffer.alloc(binaryPadding));
    byteLength += binaryPadding;
  }
  const binary = Buffer.concat(chunks);
  gltf.buffers.push({ byteLength: binary.length });
  const boundsMin = [0, 1, 2].map((axis) => Math.min(...mesh.vertices.map((v) => v[axis])));
  const boundsMax = [0, 1, 2].map((axis) => Math.max(...mesh.vertices.map((v) => v[axis])));
  return {
    glb: packGlb(gltf, binary),
    document: gltf,
    binary,
    embeddedGltf: {
      ...gltf,
      buffers: [
        {
          byteLength: binary.length,
          uri: `data:application/octet-stream;base64,${binary.toString("base64")}`,
        },
      ],
    },
    partCount: materialNames.length,
    dimensions: boundsMax.map((value, axis) => Number((value - boundsMin[axis]).toFixed(4))),
  };
}

function combineLibrary(models) {
  const gltf = {
    asset: {
      version: "2.0",
      generator: "WAR WORLD original mesh generator",
      copyright: "Original WAR WORLD geometry, 2026",
    },
    scene: 0,
    scenes: [{ name: "WorldArtLibrary", nodes: [0] }],
    nodes: [{ name: "WorldArtLibrary", children: [] }],
    meshes: [],
    materials: [],
    buffers: [],
    bufferViews: [],
    accessors: [],
    images: [],
    samplers: [{ magFilter: 9728, minFilter: 9728, wrapS: 33071, wrapT: 33071 }],
    textures: [{ sampler: 0, source: 0 }],
    extras: {
      authoredUnits: "stud",
      note: "Four original templates, one shared embedded palette. Root child translations separate the import preview; template geometry is unchanged.",
    },
  };
  const previewPositions = {
    CoastalPine: [-12, 0, 0],
    CoastalRock: [7, 0, -5],
    SupplyCrate: [9, 0, 6],
    ScrapPile: [0, 0, 10],
  };
  const chunks = [];
  let byteLength = 0;
  for (const [name, encoded] of Object.entries(models)) {
    const source = encoded.document;
    const viewOffset = gltf.bufferViews.length;
    const accessorOffset = gltf.accessors.length;
    const materialOffset = gltf.materials.length;
    const meshOffset = gltf.meshes.length;
    const nodeOffset = gltf.nodes.length;
    const imageViewIndex = source.images[0].bufferView;
    if (imageViewIndex !== source.bufferViews.length - 1)
      throw new Error("Palette must be last buffer view");
    const geometryLength = source.bufferViews[imageViewIndex].byteOffset;
    chunks.push(encoded.binary.subarray(0, geometryLength));
    for (const view of source.bufferViews.slice(0, imageViewIndex)) {
      gltf.bufferViews.push({ ...view, byteOffset: byteLength + view.byteOffset });
    }
    for (const accessor of source.accessors) {
      gltf.accessors.push({ ...accessor, bufferView: viewOffset + accessor.bufferView });
    }
    gltf.materials.push(...source.materials);
    for (const mesh of source.meshes) {
      gltf.meshes.push({
        ...mesh,
        primitives: mesh.primitives.map((primitive) => ({
          ...primitive,
          attributes: Object.fromEntries(
            Object.entries(primitive.attributes).map(([attribute, index]) => [
              attribute,
              index + accessorOffset,
            ]),
          ),
          indices: primitive.indices + accessorOffset,
          material: primitive.material + materialOffset,
        })),
      });
    }
    for (const [index, node] of source.nodes.entries()) {
      const next = { ...node };
      if (node.children) next.children = node.children.map((child) => child + nodeOffset);
      if (node.mesh !== undefined) next.mesh = node.mesh + meshOffset;
      if (index === 0) next.translation = previewPositions[name];
      gltf.nodes.push(next);
    }
    gltf.nodes[0].children.push(nodeOffset);
    byteLength += geometryLength;
  }
  const png = palettePng();
  gltf.images.push({
    name: "WAR WORLD palette",
    bufferView: gltf.bufferViews.length,
    mimeType: "image/png",
  });
  gltf.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: png.length });
  chunks.push(png);
  byteLength += png.length;
  const padding = (4 - (byteLength % 4)) % 4;
  if (padding) chunks.push(Buffer.alloc(padding));
  const binary = Buffer.concat(chunks);
  gltf.buffers.push({ byteLength: binary.length });
  return {
    glb: packGlb(gltf, binary),
    embeddedGltf: {
      ...gltf,
      buffers: [
        {
          byteLength: binary.length,
          uri: `data:application/octet-stream;base64,${binary.toString("base64")}`,
        },
      ],
    },
  };
}

class Mesh {
  vertices = [];
  faces = [];
  vertex(point) {
    this.vertices.push(point);
    return this.vertices.length;
  }
  face(indices, material) {
    this.faces.push({ indices, material });
  }
  box(center, size, material, yaw = 0, roll = 0) {
    const vertices = [];
    for (const [x, y, z] of [
      [-1, -1, -1],
      [1, -1, -1],
      [1, 1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1],
    ]) {
      const local = [(x * size[0]) / 2, (y * size[1]) / 2, (z * size[2]) / 2];
      const rotated = [
        local[0] * Math.cos(roll) - local[1] * Math.sin(roll),
        local[0] * Math.sin(roll) + local[1] * Math.cos(roll),
        local[2],
      ];
      vertices.push(
        this.vertex(
          add(center, [
            rotated[0] * Math.cos(yaw) + rotated[2] * Math.sin(yaw),
            rotated[1],
            -rotated[0] * Math.sin(yaw) + rotated[2] * Math.cos(yaw),
          ]),
        ),
      );
    }
    for (const quad of [
      [0, 3, 2, 1],
      [4, 5, 6, 7],
      [0, 4, 7, 3],
      [1, 2, 6, 5],
      [0, 1, 5, 4],
      [3, 7, 6, 2],
    ]) {
      this.face([vertices[quad[0]], vertices[quad[1]], vertices[quad[2]]], material);
      this.face([vertices[quad[0]], vertices[quad[2]], vertices[quad[3]]], material);
    }
  }
  branch(start, finish, startRadius, endRadius, material, sides = 7) {
    const direction = unit(finish.map((n, i) => n - start[i]));
    const tangent = unit(cross(direction, Math.abs(direction[1]) > 0.85 ? [1, 0, 0] : [0, 1, 0]));
    const bitangent = cross(direction, tangent);
    const rings = [start, finish].map((point, ring) =>
      Array.from({ length: sides }, (_, index) => {
        const angle = (index / sides) * Math.PI * 2;
        return this.vertex(
          add(
            point,
            add(
              mul(tangent, Math.cos(angle) * (ring === 0 ? startRadius : endRadius)),
              mul(bitangent, Math.sin(angle) * (ring === 0 ? startRadius : endRadius)),
            ),
          ),
        );
      }),
    );
    for (let index = 0; index < sides; index++) {
      const next = (index + 1) % sides;
      this.face([rings[0][index], rings[0][next], rings[1][next]], material);
      this.face([rings[0][index], rings[1][next], rings[1][index]], material);
    }
    for (let index = 1; index < sides - 1; index++) {
      this.face([rings[0][0], rings[0][index + 1], rings[0][index]], material);
      this.face([rings[1][0], rings[1][index], rings[1][index + 1]], material);
    }
  }
  irregularMass(center, radii, material, sectors = 10, layers = 5, irregularity = 0.2) {
    const firstFace = this.faces.length;
    const rings = [];
    const bottom = this.vertex(add(center, [0, -radii[1], 0]));
    for (let layer = 1; layer < layers; layer++) {
      const latitude = -Math.PI / 2 + (layer / layers) * Math.PI;
      rings.push(
        Array.from({ length: sectors }, (_, index) => {
          const angle = ((index + (layer % 2) * 0.27) / sectors) * Math.PI * 2;
          const scale = 1 - irregularity / 2 + random() * irregularity;
          return this.vertex(
            add(center, [
              Math.cos(angle) * Math.cos(latitude) * radii[0] * scale,
              Math.sin(latitude) * radii[1] * (0.9 + random() * 0.2),
              Math.sin(angle) * Math.cos(latitude) * radii[2] * scale,
            ]),
          );
        }),
      );
    }
    const top = this.vertex(add(center, [0.15 * radii[0], radii[1], -0.12 * radii[2]]));
    for (let index = 0; index < sectors; index++) {
      const next = (index + 1) % sectors;
      this.face([bottom, rings[0][next], rings[0][index]], material);
      for (let ring = 0; ring < rings.length - 1; ring++) {
        this.face([rings[ring][index], rings[ring][next], rings[ring + 1][next]], material);
        this.face([rings[ring][index], rings[ring + 1][next], rings[ring + 1][index]], material);
      }
      this.face([rings.at(-1)[index], rings.at(-1)[next], top], material);
    }
    for (let index = firstFace; index < this.faces.length; index++) {
      this.faces[index].indices.reverse();
    }
  }
}

const pine = new Mesh();
pine.branch([0, 0, 0], [0.4, 9, 0.2], 1.0, 0.58, "bark");
pine.branch([0.4, 9, 0.2], [-0.3, 19.5, 0.5], 0.58, 0.16, "barkLight");
for (let branch = 0; branch < 7; branch++) {
  const angle = branch * 2.39996;
  const height = 7 + branch * 1.35;
  const reach = 4.1 - branch * 0.22;
  const end = [Math.cos(angle) * reach, height + 2.5, Math.sin(angle) * reach];
  pine.branch([0.25, height, 0.2], end, 0.3 - branch * 0.02, 0.1, "bark");
  pine.irregularMass(
    add(end, [0, 1.1, 0]),
    [4.4 - branch * 0.21, 3.4, 3.4 - branch * 0.1],
    ["leaves", "leavesLight", "leavesDark"][branch % 3],
    9,
    5,
    0.36,
  );
}
pine.irregularMass([-0.3, 19, 0.5], [3.0, 4.8, 2.7], "leavesLight", 9, 5, 0.3);

const rock = new Mesh();
rock.irregularMass([0, 2.1, 0], [5.1, 2.7, 3.7], "rock", 9, 4, 0.46);
rock.irregularMass([-3.7, 0.9, 1.5], [2.0, 1.4, 2.0], "rockLight", 7, 3, 0.38);

const crate = new Mesh();
crate.box([0, 1.6, 0], [4.3, 3.2, 3.3], "wood");
for (const x of [-1.75, 1.75]) {
  crate.box([x, 1.6, -1.72], [0.38, 3.45, 0.23], "metal");
  crate.box([x, 1.6, 1.72], [0.38, 3.45, 0.23], "metal");
  crate.box([x, 3.28, 0], [0.38, 0.23, 3.55], "metal");
}
for (const y of [0.3, 2.9]) crate.box([0, y, -1.84], [4.6, 0.34, 0.24], "wood");
crate.box([0, 1.65, -1.84], [1.1, 1.0, 0.13], "accent");

const scrap = new Mesh();
for (let index = 0; index < 5; index++) {
  scrap.box(
    [(random() - 0.5) * 3.4, 0.55 + index * 0.2, (random() - 0.5) * 2.4],
    [2.0 + random() * 2.2, 0.2, 1.2 + random()],
    index % 2 === 0 ? "metal" : "paint",
    random() * Math.PI,
    (random() - 0.5) * 0.6,
  );
}
scrap.branch([-2, 0.65, -0.5], [2.1, 1.7, 0.9], 0.44, 0.44, "metal", 8);
scrap.branch([1, 0.4, -1.5], [1, 2.4, -1.5], 0.35, 0.35, "paint", 8);

const meshes = { CoastalPine: pine, CoastalRock: rock, SupplyCrate: crate, ScrapPile: scrap };
const mtl = Object.entries(palette)
  .map(
    ([name, color]) =>
      `newmtl ${name}\nKd ${color.join(" ")}\nKa 0 0 0\nKs 0.06 0.06 0.06\nNs 8\nd 1\nillum 2\n`,
  )
  .join("\n");
await writeFile(path.join(destination, "world-kit.mtl"), mtl);
const manifest = {
  provenance: "Original procedural artwork authored for WAR WORLD, 2026. No third-party assets.",
  integrationStatus:
    "Original geometry and GLB materials passed offline checks and Studio's GLB preview displayed the colours correctly. Asset upload failed with HTTP 401 User is not authenticated. No successful import, Roblox asset IDs, exported Roblox library or integrated mesh library is available; procedural fallback art remains active.",
  studioImport: {
    preview: "GLB colours verified",
    upload: "Blocked: HTTP 401 User is not authenticated",
    assetIds: [],
    libraryIntegrated: false,
  },
  units:
    "OBJ and GLB positions use numeric Roblox stud dimensions. Inspect importer unit conversion: CoastalPine must be approximately 23.8 studs high.",
  import:
    "After restoring Studio authentication, prefer WorldArtLibrary.glb (or its self-contained glTF) for one import of all four named templates. Original mesh/image uploads are user-authorized, but the attempted import failed with HTTP 401. A coloured preview is not a successful import. Only after a successful import, save ServerStorage.WorldArtLibrary as a local Roblox model and connect it to Rojo.",
  models: {},
};
const encodedModels = {};
for (const [name, mesh] of Object.entries(meshes)) {
  let material;
  const faces = mesh.faces
    .map((face) => {
      const prefix = material === face.material ? "" : `usemtl ${face.material}\n`;
      material = face.material;
      return `${prefix}f ${face.indices.join(" ")}`;
    })
    .join("\n");
  const text = `# Original WAR WORLD mesh, no external dependencies\nmtllib world-kit.mtl\no ${name}\ns off\n${mesh.vertices.map((v) => `v ${v.map((n) => n.toFixed(5)).join(" ")}`).join("\n")}\n${faces}\n`;
  await writeFile(path.join(destination, `${name}.obj`), text);
  const gltf = encodeGltf(name, mesh);
  encodedModels[name] = gltf;
  await writeFile(path.join(destination, `${name}.glb`), gltf.glb);
  await writeJson(`${name}.gltf`, gltf.embeddedGltf);
  manifest.models[name] = {
    vertices: mesh.vertices.length,
    triangles: mesh.faces.length,
    materialParts: gltf.partCount,
    dimensionsStuds: gltf.dimensions,
    glbBytes: gltf.glb.length,
  };
}
const library = combineLibrary(encodedModels);
await writeFile(path.join(destination, "WorldArtLibrary.glb"), library.glb);
await writeJson("WorldArtLibrary.gltf", library.embeddedGltf);
manifest.library = {
  filename: "WorldArtLibrary.glb",
  childModels: Object.keys(meshes),
  triangles: Object.values(meshes).reduce((sum, mesh) => sum + mesh.faces.length, 0),
  materialParts: Object.values(encodedModels).reduce((sum, model) => sum + model.partCount, 0),
  glbBytes: library.glb.length,
  sharedPaletteImages: 1,
};
await writeJson("manifest.json", manifest);
console.log(JSON.stringify(manifest, null, 2));
