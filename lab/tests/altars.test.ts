import {expect, it} from 'vitest';
import {Box3, PerspectiveCamera, Vector3} from 'three/webgpu';
import {ElementalAltars} from '../../src/world/altars';
import {EARTH_ALIGNMENT_EYE, earthTriangles} from '../../src/world/earth-alignment';
import {MAP} from '../../src/sand/layout';

it('lines up all three Earth peaks with the rendered Black Rock summits from a fixed viewing point', () => {
  const camera = new PerspectiveCamera(49, 1.6, 0.08, 2400);
  camera.position.copy(EARTH_ALIGNMENT_EYE);
  camera.lookAt(121, 2.5, 0);
  camera.updateMatrixWorld();
  const triangles = earthTriangles();
  expect(triangles).toHaveLength(3);
  for (const triangle of triangles)
    for (let i = 0; i < 3; i++) {
      const near = triangle.frame[i]!.clone().project(camera);
      const far = triangle.horizon[i]!.clone().project(camera);
      expect(near.x).toBeCloseTo(far.x, 6);
      expect(near.y).toBeCloseTo(far.y, 6);
      expect(triangle.frame[i]!.x).toBe(MAP.altars.earth[0]);
    }
  camera.position.z += 2;
  camera.updateMatrixWorld();
  const near = triangles[1]!.frame[1]!.clone().project(camera);
  const far = triangles[1]!.horizon[1].clone().project(camera);
  expect(Math.abs(near.x - far.x)).toBeGreaterThan(0.05);
});

it('keeps the two-metre Air ring fixed while its dreamcatcher and pendants respond to wind', () => {
  const altars = new ElementalAltars();
  const air = altars.object.getObjectByName('air altar')!;
  const catcher = air.getObjectByName('Wind-suspended dreamcatcher')!;
  const ring = air.children[0]!;
  const size = new Box3().setFromObject(ring).getSize(new Vector3());
  expect(size.y).toBeCloseTo(2, 4);
  const fixed = air.quaternion.clone();
  altars.update(1, {x: 2.4, z: 0});
  const first = catcher.quaternion.clone();
  altars.update(1.4, {x: 2.4, z: 0});
  expect(catcher.quaternion.angleTo(first)).toBeGreaterThan(0.01);
  expect(air.quaternion.angleTo(fixed)).toBeCloseTo(0);
  altars.update(1, {x: 2.4, z: 0});
  expect(catcher.quaternion.angleTo(first)).toBeCloseTo(0);
  altars.update(3, {x: 0, z: 0});
  expect(catcher.rotation.toArray().slice(0, 3)).toEqual([0, 0, -0]);
  altars.dispose();
});
