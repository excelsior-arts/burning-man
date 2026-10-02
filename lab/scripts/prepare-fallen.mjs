// Bake the existing charcoal figure into a fallen pose and model the gold robot
// helmet from the reference photographs in tmp/helmet-refs. No skeleton or animation
// runs for this monument. Rebuild: node lab/scripts/prepare-fallen.mjs
import fs from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {Document, NodeIO} from '@gltf-transform/core';
import {EXTMeshoptCompression, KHRMeshQuantization} from '@gltf-transform/extensions';
import {quantize} from '@gltf-transform/functions';
import {MeshoptEncoder} from 'meshoptimizer';

const bytes = await fs.readFile('public/character/man.glb');
const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '',
);
const rig = asset.scene, mixer = new T.AnimationMixer(rig);
const idle = mixer.clipAction(asset.animations.find(c => c.name === 'Idle')).play();
idle.time = 1.2; mixer.update(0);
const bone = n => rig.getObjectByName(`mixamorig1${n}`);
// Asymmetry is deliberate: one knee drawn in, an open arm, the other hand near
// the hip, and the helmet rolled away. The body is spent, not laid out formally.
bone('LeftArm').rotateZ(-0.23);
bone('LeftForeArm').rotateZ(-0.15);
bone('RightArm').rotateZ(0.38);
bone('RightForeArm').rotateX(-0.25);
bone('LeftUpLeg').rotateX(-0.25); bone('LeftUpLeg').rotateZ(0.12);
bone('LeftLeg').rotateX(0.40);
bone('RightUpLeg').rotateZ(-0.10);
bone('RightFoot').rotateY(-0.23);
bone('Head').rotateY(-0.38); bone('Head').rotateZ(0.13);
rig.updateMatrixWorld(true);
const mesh = rig.getObjectByName('Burning_Man_body'); mesh.skeleton.update();
const lay = new T.Matrix4().makeRotationX(-Math.PI / 2)
  .multiply(new T.Matrix4().makeRotationZ(-0.10));
lay.setPosition(0, 0.115, 0.91);
const parts = new Map();
function add(geo, material, transform = new T.Matrix4()) {
  geo.applyMatrix4(transform);
  if (!parts.has(material)) parts.set(material, []);
  parts.get(material).push(geo);
}
const source = mesh.geometry, count = source.attributes.position.count;
const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3);
const p = new T.Vector3(), n = new T.Vector3(), skin = new T.Matrix4(), b = new T.Matrix4();
const combined = new T.Matrix4(), nm = new T.Matrix3();
const skinIndex = source.attributes.skinIndex, weights = source.attributes.skinWeight;
const headJoints = new Set(mesh.skeleton.bones.map((b,i) => /Head/.test(b.name) ? i : -1));
const headWeight = new Float32Array(count);
for (let i = 0; i < count; i++) {
  mesh.getVertexPosition(i, p).applyMatrix4(mesh.matrixWorld).applyMatrix4(lay).toArray(positions, i * 3);
  skin.elements.fill(0);
  for (let j = 0; j < 4; j++) {
    const joint = skinIndex.getComponent(i,j), weight = weights.getComponent(i,j);
    if (headJoints.has(joint)) headWeight[i] += weight;
    b.fromArray(mesh.skeleton.boneMatrices, joint * 16);
    for (let k = 0; k < 16; k++) skin.elements[k] += b.elements[k] * weight;
  }
  combined.copy(lay).multiply(mesh.matrixWorld).multiply(mesh.bindMatrixInverse).multiply(skin).multiply(mesh.bindMatrix);
  n.fromBufferAttribute(source.attributes.normal, i).applyNormalMatrix(nm.getNormalMatrix(combined)).toArray(normals, i * 3);
}
const detailBytes = await fs.readFile('public/character/body-detail.bin');
const details = new Uint32Array(detailBytes.buffer.slice(detailBytes.byteOffset, detailBytes.byteOffset + detailBytes.byteLength));
const indices = details.subarray(4, 4 + details[2]);
const kept = [];
for (let i = 0; i < indices.length; i += 3) {
  const ids = [...indices.subarray(i, i + 3)];
  if (ids.every(v => headWeight[v] < 0.28)) kept.push(...ids);
}
const body = new T.BufferGeometry();
body.setAttribute('position', new T.BufferAttribute(positions, 3));
body.setAttribute('normal', new T.BufferAttribute(normals, 3));
body.setAttribute('uv', source.attributes.uv.clone());body.setIndex(kept);
add(body, 'Charcoal remains');

// Head coordinates are in metres. The wide dark dome comes down to a continuous
// gold jaw band, framed by cheek panels with the circular ear mechanisms.
const hp = new T.Vector3(), hq = new T.Quaternion(), hs = new T.Vector3();
bone('Head').matrixWorld.decompose(hp, hq, hs);
hp.add(new T.Vector3(0, 0.103, 0.012).applyQuaternion(hq));
const helmet = lay.clone().multiply(new T.Matrix4().compose(hp, hq, new T.Vector3(1,1,1)));
const profile = new T.CatmullRomCurve3([
  new T.Vector3(.109,-.141,.108), new T.Vector3(.125,-.108,.126),
  new T.Vector3(.138,-.035,.137), new T.Vector3(.137,.040,.134),
  new T.Vector3(.116,.111,.109), new T.Vector3(.062,.154,.062),
  new T.Vector3(.001,.168,.001),
]);
function shellPoint(theta, t, lift = 0) {
  const q = profile.getPoint(t), c = Math.cos(theta), s = Math.sin(theta);
  const dent = 1 + Math.sin(theta*11 + t*5)*Math.sin(t*12)*.003;
  return new T.Vector3((q.x+lift)*s*dent, q.y,
    (q.z+lift)*c*(c < 0 ? .91 : 1) - .006 * t);
}
const shellPositions = [], shellUvs = [], shellIndices = [], gold = [], visor = [];
const rings = 48, sides = 96;
for (let j=0;j<=rings;j++) for(let i=0;i<=sides;i++) {
  shellPoint(-Math.PI + i/sides*Math.PI*2,j/rings).toArray(shellPositions, shellPositions.length);
  shellUvs.push(i/sides,j/rings);
}
for(let j=0;j<rings;j++) for(let i=0;i<sides;i++) {
  const a=j*(sides+1)+i, d=a+sides+1, tris=[a,a+1,d,a+1,d+1,d];
  shellIndices.push(...tris);
  const theta=-Math.PI+(i+.5)/sides*Math.PI*2;
  ((Math.abs(theta)<1.19 && j/rings>.095) ? visor : gold).push(...tris);
}
const shell = new T.BufferGeometry();shell.setAttribute('position',new T.Float32BufferAttribute(shellPositions,3));
shell.setAttribute('uv',new T.Float32BufferAttribute(shellUvs,2));shell.setIndex(shellIndices);shell.computeVertexNormals();
for(const [name,ids] of [['Weathered gold',gold],['Dead visor',visor]]) {const g=shell.clone();g.setIndex(ids);add(g,name,helmet);}
const local = (geo, at, rotation = new T.Euler(), name='Weathered gold') => add(geo,name,
  helmet.clone().multiply(new T.Matrix4().compose(new T.Vector3(...at),new T.Quaternion().setFromEuler(rotation),new T.Vector3(1,1,1))));
const tube = (points,radius,material='Weathered gold') => add(new T.TubeGeometry(new T.CatmullRomCurve3(points),Math.max(16,points.length*2),radius,6,false),material,helmet);
// The scorched neck enters the open helmet rather than leaving a hollow gap.
local(new T.CylinderGeometry(.045,.051,.085,24),[0,-.176,0],new T.Euler(),'Soot seams');
local(new T.RingGeometry(.044,.109,48),[0,-.140,-.004],new T.Euler(Math.PI/2,0,0),'Soot seams');
for(const side of [-1,1]) {
  const theta=side*1.19;
  tube(Array.from({length:32},(_,i)=>shellPoint(theta,.095+i/31*.79,.0018)),.0038);
  // Concentric brass ear assembly with a dark, recessed annulus and central cap.
  local(new T.CylinderGeometry(.049,.051,.020,48),[side*.137,-.032,-.027],new T.Euler(0,0,Math.PI/2));
  local(new T.CylinderGeometry(.037,.037,.022,40),[side*.140,-.032,-.027],new T.Euler(0,0,Math.PI/2),'Soot seams');
  local(new T.TorusGeometry(.039,.005,8,48),[side*.153,-.032,-.027],new T.Euler(0,Math.PI/2,0));
  local(new T.CylinderGeometry(.028,.029,.008,40),[side*.154,-.032,-.027],new T.Euler(0,0,Math.PI/2));
  // The narrow circuit plates beneath the ears are engraved rather than lit.
  local(new T.BoxGeometry(.007,.042,.068),[side*.127,-.099,-.035]);
  for(let j=0;j<4;j++) {
    local(new T.BoxGeometry(.008,.0015,.033-j*.004),[side*.131,-.084-j*.007,-.03+j*.003],new T.Euler(),'Soot seams');
    local(new T.SphereGeometry(.002,6,4),[side*.132,-.084-j*.007,.004],new T.Euler(),'Soot seams');
  }
  tube(Array.from({length:22},(_,i)=>shellPoint(side*(1.28+i/21*1.85),.72,.0018)),.0024);
}
// Rolled lower visor lip and rear cooling seams.
tube(Array.from({length:44},(_,i)=>shellPoint(-1.19+i/43*2.38,.10,.002)),.0035);
for(let j=0;j<3;j++) tube(Array.from({length:30},(_,i)=>shellPoint(1.75+i/29*2.78,.14+j*.045,.001)),.0015,'Soot seams');
// A restrained, branching fracture in the dark glass, not a glowing LED face.
tube([shellPoint(-.38,.50,.001),shellPoint(-.30,.43,.001),shellPoint(-.33,.35,.001),shellPoint(-.23,.27,.001)],.00055,'Soot seams');
tube([shellPoint(-.30,.43,.001),shellPoint(-.08,.40,.001),shellPoint(.02,.33,.001)],.0004,'Soot seams');

const doc = new Document(), buffer = doc.createBuffer(), scene = doc.createScene('The fallen one');
for(const [name,geometries] of parts) {
  const position=[],normal=[],uv=[],index=[];
  for(const g of geometries) {
    const ids=g.index?.array ?? Uint32Array.from({length:g.attributes.position.count},(_,i)=>i);
    const remap = new Map();
    for(const id of ids) {
      if(!remap.has(id)) {
        remap.set(id,position.length/3);
        position.push(g.attributes.position.getX(id),g.attributes.position.getY(id),g.attributes.position.getZ(id));
        normal.push(g.attributes.normal.getX(id),g.attributes.normal.getY(id),g.attributes.normal.getZ(id));
        uv.push(g.attributes.uv?.getX(id)??0,g.attributes.uv?.getY(id)??0);
      }
      index.push(remap.get(id));
    }
  }
  const attr=(type,array)=>doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const mat=doc.createMaterial(name).setBaseColorFactor(name==='Weathered gold'?[.45,.29,.07,1]:[.035,.028,.020,1]).setRoughnessFactor(.8);
  const prim=doc.createPrimitive().setAttribute('POSITION',attr('VEC3',new Float32Array(position)))
    .setAttribute('NORMAL',attr('VEC3',new Float32Array(normal))).setAttribute('TEXCOORD_0',attr('VEC2',new Float32Array(uv)))
    .setIndices(attr('SCALAR',new Uint32Array(index))).setMaterial(mat);
  scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)));
  console.log(`${name}: ${position.length/3} vertices, ${index.length/3} triangles`);
}
await MeshoptEncoder.ready;
await doc.transform(quantize({quantizePosition:16,quantizeNormal:12,quantizeTexcoord:14}));
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
const io=new NodeIO().registerExtensions([EXTMeshoptCompression,KHRMeshQuantization]).registerDependencies({'meshopt.encoder':MeshoptEncoder});
await fs.writeFile('public/character/fallen.glb',await io.writeBinary(doc));
console.log('Saved public/character/fallen.glb');
