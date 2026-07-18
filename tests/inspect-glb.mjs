// Dependency-free GLB inspector: parses the JSON chunk of a .glb and reports
// meshes, materials, animations, node transforms, and POSITION accessor bounds.
import { readFileSync } from 'node:fs';

const path = process.argv[2] ?? 'public/models/poro.glb';
const buf = readFileSync(path);

const magic = buf.readUInt32LE(0);
if (magic !== 0x46546c67) throw new Error('Not a GLB file');
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));

console.log('== asset ==', JSON.stringify(json.asset));
console.log('== scenes ==', json.scenes?.length, 'default:', json.scene);
console.log('== nodes ==');
for (const [i, n] of (json.nodes ?? []).entries()) {
  console.log(
    ` [${i}]`,
    n.name ?? '(unnamed)',
    n.mesh !== undefined ? `mesh=${n.mesh}` : '',
    n.translation ? `T=${n.translation.map((v) => v.toFixed(3))}` : '',
    n.rotation ? `R=${n.rotation.map((v) => v.toFixed(3))}` : '',
    n.scale ? `S=${n.scale.map((v) => v.toFixed(3))}` : '',
    n.children ? `children=[${n.children}]` : ''
  );
}
console.log('== meshes ==');
for (const [i, m] of (json.meshes ?? []).entries()) {
  console.log(` [${i}]`, m.name ?? '(unnamed)', `primitives=${m.primitives.length}`);
  for (const p of m.primitives) {
    const pos = json.accessors[p.attributes.POSITION];
    console.log(
      `   POSITION count=${pos.count} min=${pos.min?.map((v) => v.toFixed(3))} max=${pos.max?.map((v) => v.toFixed(3))} material=${p.material}`
    );
  }
}
console.log('== materials ==');
for (const [i, m] of (json.materials ?? []).entries()) {
  console.log(` [${i}]`, m.name ?? '(unnamed)', JSON.stringify(m.pbrMetallicRoughness ?? {}).slice(0, 160));
}
console.log('== textures/images ==', json.textures?.length ?? 0, '/', json.images?.length ?? 0);
for (const img of json.images ?? []) console.log('  image:', img.name ?? '', img.mimeType ?? '');
console.log('== animations ==', json.animations?.length ?? 0);
for (const a of json.animations ?? []) {
  console.log('  anim:', a.name ?? '(unnamed)', `channels=${a.channels.length}`);
}
console.log('== skins ==', json.skins?.length ?? 0);
console.log('== extensions ==', json.extensionsUsed ?? []);
