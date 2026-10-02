# Locomotion

`public/animations/locomotion.bin` contains seven Mixamo captures retargeted to
the existing `man.glb` rig. The unattended look-around uses the same quarter-turn
footwork and weight-shifting holds, sampled directly from its existing score
slots; the rest of the story keeps its animations and timing. WASD and arrows
remain camera-relative; mouse dragging orbits the camera. Large input changes
play a planted turn before travelling. Small
changes steer the walk with bounded head anticipation and chest lean.

## Sources and rebuild

Downloaded through the signed-in Mixamo catalog on 2026-09-28, using CH36_NONPBR,
FBX Binary, Without Skin, 30 FPS, no keyframe reduction. Original FBXs are kept
only in ignored `tmp/animation-sources/locomotion/`:

| Local source | Mixamo selection | Packed clip | Trim (30 FPS) |
| --- | --- | --- | --- |
| TurnLeft90.fbx | Left Turn 90 | turnleft90 | full |
| TurnRight90.fbx | Right Turn 90 | turnright90 | full |
| TurnLeft180.fbx | Left Turn / Standing 180 Left Turn | turnleft180 | full |
| TurnRight180.fbx | Right Turn / Standing 180 Right Turn | turnright180 | full |
| StartWalking.fbx | Start Walking / Walking From Standing | startwalk | 0–50 inclusive |
| StopWalking.fbx | Stop Walking / Walking To Standing Idle | stopwalk | 40–90 inclusive |
| WeightShift.fbx | Idle / Weight Shift Idle | idleweight | full |

Run `node lab/scripts/prepare-locomotion.mjs` from the repository root. It writes
the packed motion and `src/character/locomotion-data.json` together. The turn
curves and forward travel removed from the hip are applied by `ManualGait`,
keeping body motion and playback on the same capture clock. Slightly different
turn angles are adapted to the requested heading. Lateral hip balance and
vertical motion stay in the rig. Skin, geometry, and the original story pack
are unchanged.

Captured pivots/start/stop stamp sand and trigger footsteps from settled sole
positions, including toe pivots. The original looping walk retains its
distance-calibrated footprint cadence. Grounding still uses the existing
whole-body support; it does not solve individual legs on steep slopes.

## Checks

Run the focused checks:

```sh
npx vitest run lab/tests/manual-gait.test.ts lab/tests/locomotion-assets.test.mjs lab/tests/walking-controls.test.ts lab/tests/walk-gait.test.mjs
npx vitest run lab/tests/scripted-locomotion.test.ts
```

They cover control transitions, pause/immobility, update rates, real rig bindings, actual leg
articulation, pivot scuffs, the original walking footprint calibration, and the
scripted turn/hold timing in live playback and seeks.

`npm run build:author` builds a local preview without writing the published
`docs/` site. `npm run build:runtime` checks the reusable character package.
