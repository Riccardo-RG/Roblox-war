import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const source = fileURLToPath(new URL("../assets/original/world-kit/", import.meta.url));
const output = fileURLToPath(new URL("../build/", import.meta.url));
await mkdir(output, { recursive: true });
const dot = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], 0);
const sub = (a, b) => a.map((n, i) => n - b[i]);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (v) => v.map((n) => n / Math.hypot(...v));
const camera = unit([0.8, 0.52, 1.0]);
const right = unit(cross([0, 1, 0], camera));
const up = cross(camera, right);
const sun = unit([-0.5, 0.9, 0.7]);
const colors = {};
let material;
for (const line of (await readFile(path.join(source, "world-kit.mtl"), "utf8")).split("\n")) {
  if (line.startsWith("newmtl ")) material = line.slice(7);
  if (line.startsWith("Kd ")) colors[material] = line.slice(3).split(" ").map(Number);
}

const models = ["CoastalPine", "CoastalRock", "SupplyCrate", "ScrapPile"];
const panels = [];
for (const [modelIndex, name] of models.entries()) {
  const vertices = [];
  const faces = [];
  for (const line of (await readFile(path.join(source, `${name}.obj`), "utf8")).split("\n")) {
    if (line.startsWith("v ")) vertices.push(line.slice(2).trim().split(/\s+/).map(Number));
    if (line.startsWith("usemtl ")) material = line.slice(7);
    if (line.startsWith("f "))
      faces.push({
        indices: line
          .slice(2)
          .trim()
          .split(/\s+/)
          .map((v) => Number(v) - 1),
        material,
      });
  }
  const projected = vertices.map((point) => [
    dot(point, right),
    -dot(point, up),
    dot(point, camera),
  ]);
  const minX = Math.min(...projected.map((p) => p[0]));
  const maxX = Math.max(...projected.map((p) => p[0]));
  const minY = Math.min(...projected.map((p) => p[1]));
  const maxY = Math.max(...projected.map((p) => p[1]));
  const scale = Math.min(270 / (maxX - minX), 380 / (maxY - minY));
  const xOffset = 20 + modelIndex * 350;
  const centerX = xOffset + 165;
  const baseline = 518;
  const x = (p) => centerX + (p[0] - (minX + maxX) / 2) * scale;
  const y = (p) => baseline + (p[1] - maxY) * scale;
  const renderFaces = faces
    .map((face) => {
      const [a, b, c] = face.indices.map((index) => vertices[index]);
      const normal = unit(cross(sub(b, a), sub(c, a)));
      const depth = face.indices.reduce((sum, index) => sum + projected[index][2], 0) / 3;
      return { ...face, normal, depth };
    })
    .filter((face) => dot(face.normal, camera) > 0)
    .sort((a, b) => a.depth - b.depth);
  const polygons = renderFaces
    .map((face) => {
      const lighting = 0.58 + 0.42 * Math.max(0, dot(face.normal, sun));
      const color = colors[face.material].map((n) => Math.round(Math.min(255, n * 255 * lighting)));
      const fill = `rgb(${color.join(",")})`;
      const points = face.indices
        .map((index) => `${x(projected[index]).toFixed(2)},${y(projected[index]).toFixed(2)}`)
        .join(" ");
      return `<polygon points="${points}" fill="${fill}" stroke="${fill}" stroke-width="0.35"/>`;
    })
    .join("");
  panels.push(`<rect x="${xOffset}" y="116" width="330" height="504" rx="14" fill="#e6e9e3"/>
    <ellipse cx="${centerX}" cy="${baseline + 1}" rx="108" ry="13" fill="#cbd1c6"/>
    ${polygons}
    <text x="${xOffset + 22}" y="567" fill="#29362f" font-size="23" font-weight="600">${name}</text>
    <text x="${xOffset + 22}" y="596" fill="#526358" font-size="16">${faces.length} triangles · ${vertices.length} vertices</text>`);
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="690" viewBox="0 0 1440 690">
  <rect width="1440" height="690" fill="#f6f5ef"/>
  <g font-family="Arial, sans-serif">
  <text x="28" y="54" fill="#263b31" font-size="32" font-weight="700">WAR WORLD · Original world kit</text>
  <text x="28" y="84" fill="#5c6d60" font-size="18">Geometry preview · original low-poly meshes · materials only · no downloaded assets</text>
  ${panels.join("\n")}
  <text x="28" y="659" fill="#5c6d60" font-size="17">Orthographic inspection, not a Roblox screenshot. Preview scale is fitted per model; actual units are studs.</text>
  </g></svg>`;
await writeFile(path.join(output, "original-world-kit-preview.svg"), svg);
console.log(path.join(output, "original-world-kit-preview.svg"));
