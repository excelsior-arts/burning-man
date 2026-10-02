import {beforeAll, expect, it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {Box3, Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {FALLEN_ALTAR, tributeDrift} from '../../src/world/fallen-altar';
import {SandField} from '../../src/sand/field';
import {DUNE_RIDGES, MAP} from '../../src/sand/layout';
import {FALLEN_OBSTACLES} from '../../src/world/fallen-site';
import {obstacleDistance} from '../../src/experience/obstacles';

let asset;
beforeAll(async () => {
  const bytes = await readFile(new URL('../../public/character/fallen.glb', import.meta.url));
  asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '',
  );
});

it('ships a metre-scale fallen body and fitted helmet without another animated rig', () => {
  expect(asset.animations).toHaveLength(0);
  const materials = new Set();
  asset.scene.traverse(o => {
    expect(o.isSkinnedMesh).not.toBe(true);
    if (!o.isMesh) return;
    materials.add(o.material.name);
    expect([...o.geometry.attributes.position.array].every(Number.isFinite)).toBe(true);
    expect([...o.geometry.attributes.normal.array].every(Number.isFinite)).toBe(true);
  });
  expect([...materials].sort()).toEqual(['Charcoal remains', 'Dead visor', 'Soot seams', 'Weathered gold']);
  const box = new Box3().setFromObject(asset.scene), size = box.getSize(new Vector3());
  expect(size.z).toBeGreaterThan(1.7);
  expect(size.z).toBeLessThan(2);
  expect(size.x).toBeLessThan(1);
  expect(box.min.y).toBeGreaterThan(-0.06);
  expect(box.max.y).toBeLessThan(0.35);
  const body = new Box3().setFromObject(asset.scene.getObjectByName('Charcoal_remains'));
  const neck = new Box3().setFromObject(asset.scene.getObjectByName('Soot_seams'));
  expect(body.intersectsBox(neck)).toBe(true);
});

it('places the tribute at the sheltered foot of the left hump on the way to the sea', () => {
  const [x, z] = FALLEN_ALTAR.position;
  const hump = DUNE_RIDGES.find(r => r.name === 'Central south hump');
  expect(x).toBeLessThan(Math.min(...hump.points.map(p => p[0])));
  expect(x).toBeGreaterThan(MAP.coast);
  expect(z).toBeGreaterThan(0);
  const field = new SandField();
  for (const [px, pz] of [FALLEN_ALTAR.position, FALLEN_ALTAR.visitor])
    expect(field.height(px, pz) - MAP.floor).toBeLessThan(.04);
  expect(Math.hypot(x, z)).toBeLessThan(50);
});

it('encloses the baked helmet and every limb in the collision footprint', () => {
  asset.scene.updateMatrixWorld(true);
  const p = new Vector3(), cos = Math.cos(FALLEN_ALTAR.yaw), sin = Math.sin(FALLEN_ALTAR.yaw);
  let maximum = -Infinity;
  asset.scene.traverse(o => {
    if (!o.isMesh) return;
    const positions = o.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      p.fromBufferAttribute(positions, i).applyMatrix4(o.matrixWorld);
      const x = FALLEN_ALTAR.position[0] + p.x * cos + p.z * sin;
      const z = FALLEN_ALTAR.position[1] - p.x * sin + p.z * cos;
      maximum = Math.max(maximum, obstacleDistance(x, z, FALLEN_OBSTACLES[0]));
    }
  });
  expect(maximum).toBeLessThanOrEqual(.001);
});

it('keeps sand burial shallow and sinks the apron boundary below the existing bed', () => {
  let maximum = -Infinity;
  for (let x = -1.2; x <= 1.2; x += .02)
    for (let z = -1.6; z <= 1.6; z += .02) {
      const h = tributeDrift(x, z);
      expect(Number.isFinite(h)).toBe(true);
      maximum = Math.max(maximum, h);
    }
  expect(maximum).toBeGreaterThan(.04);
  expect(maximum).toBeLessThan(.08);
  for (let t = -1; t <= 1; t += .1) {
    for (const [x, z] of [[t*1.2, -1.6], [t*1.2, 1.6], [-1.2, t*1.6], [1.2, t*1.6]])
      expect(tributeDrift(x, z)).toBeLessThan(0);
  }
});
