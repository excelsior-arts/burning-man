import {describe, it, expect} from 'vitest';
import {SandField, SAND_CELL} from '../../src/sand/field';
import {Walker} from '../../src/experience/walker';
import * as _unused from '../../src/experience/score';
import {SandContacts} from '../../src/sand/contacts';
import {REFERENCE} from './reference-score';

describe('living sand', () => {
  it('presses a footprint and deposits the excavated volume, including negative tile coordinates', () => {
    const field = new SandField();
    field.wind = {x: 0, z: 0};
    const x = -8,
      z = -8,
      before = field.height(x, z);
    field.contact({x, z, facing: 0});
    expect(field.height(x, z)).toBeLessThan(before - 0.035);
    expect(field.surface(x, z).compact).toBeGreaterThan(0.8);
    expect(Math.abs(field.inspect().netVolume)).toBeLessThan(1e-6);
    const edited = field.height(x, z);
    field.height(1000, -1000);
    expect(field.height(x, z)).toBe(edited);
    expect(field.inspect().tiles).toBeLessThanOrEqual(4);
  });
  it('collapses an overloaded crest and redistributes material without losing volume', () => {
    const field = new SandField();
    field.wind = {x: 0, z: 0};
    const crest = field.crestNear(0, 0);
    const before = field.height(crest.x, crest.z);
    field.contact({x: crest.x, z: crest.z, facing: 0, force: 1.5});
    expect(field.inspect().collapses).toBe(1);
    expect(field.height(crest.x, crest.z)).toBeLessThan(before - 0.08);
    const moved = field.inspect().movedVolume;
    for (let i = 0; i < 90; i++) field.update(1 / 30);
    expect(field.inspect().movedVolume).toBeGreaterThan(moved);
    expect(Math.abs(field.inspect().netVolume)).toBeLessThan(1e-5);
    expect(field.inspect().activeCells).toBeLessThanOrEqual(6000);
  });
  it('keeps physical heights continuous across tile boundaries', () => {
    const field = new SandField();
    field.contact({x: 8, z: -8, facing: 1});
    expect(Math.abs(field.height(8 - 1e-6, -8) - field.height(8 + 1e-6, -8))).toBeLessThan(1e-4);
    expect(field.cell).toBe(SAND_CELL);
  });
  it('pauses exactly and lets wind restore the fine surface over time', () => {
    const field = new SandField();
    field.contact({x: -8, z: -8, facing: 0});
    const before = field.inspect();
    field.update(0);
    expect(field.inspect()).toEqual(before);
    const compact = field.surface(-8, -8).compact;
    field.wind = {x: 10, z: 0};
    for (let i = 0; i < 120; i++) field.update(1 / 30);
    expect(field.surface(-8, -8).compact).toBeLessThan(compact);
    field.reset();
    expect(field.inspect().footfalls).toBe(0);
    expect(field.inspect().tiles).toBe(0);
  });
  it('couples alternating contacts and slope-aware locomotion to the same surface', () => {
    const field = new SandField(),
      contacts = new SandContacts(field);
    const motion = new Walker(field.height);
    motion.reset(-8, -8);
    for (let i = 0; i < 360; i++) {
      motion.step(1, 0, 1 / 120, 1, REFERENCE);
      contacts.update(motion.state);
      field.update(1 / 120);
    }
    expect(field.footfalls).toBeGreaterThan(2);
    // Vertical easing can lag a changing grade by a few centimetres in motion.
    // After stopping it must settle onto the same deformed sand surface.
    expect(
      Math.abs(
        motion.state.position.y - field.height(motion.state.position.x, motion.state.position.z),
      ),
    ).toBeLessThan(0.05);
    for (let i = 0; i < 60; i++) {
      motion.step(0, 0, 1 / 120, 1, REFERENCE);
      field.update(1 / 120);
    }
    expect(
      Math.abs(
        motion.state.position.y - field.height(motion.state.position.x, motion.state.position.z),
      ),
    ).toBeLessThan(0.01);
  });
});
