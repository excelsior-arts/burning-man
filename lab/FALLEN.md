# The fallen one

A fallen figure in a helmet lies at `(-34.8, 21.5)`, against the sheltered west foot of the
central south hump — on the left when walking toward the ocean. The dune
screens it during the scripted look-around. The original charcoal figure is baked
into an asymmetric fallen pose, with a modeled gold helmet, dark visor, soot,
wind abrasion and a shallow covering of playa dust.

The figure sits 1.5 inches (3.81 cm) below the bed. Small wind deposits collect
in the armpits, beside the waist and between the legs. Both the gold shell and
the visor have a dull, sand-worn finish.

Studio → **The fallen one**, or **Shift+4**, pauses at a close view. Drag to
orbit; Resume restores the walking figure nearby in manual control.

A rounded collision boundary follows the body and helmet. The walker stops
at it or slides along its edge, with clearance for his feet. Live walking and
timeline reconstruction use the same boundary.

The helmet was modeled from the owner's visual references in `tmp/helmet-refs`.
Those photographs are not bundled. Rebuild the static, compressed asset with:

```sh
node lab/scripts/prepare-fallen.mjs
```

It reuses `public/character/man.glb`, the balanced body indices, and the body's
existing normal/cavity maps. The tribute has no rig, animation mixer or fire.
Sand shading shares the surrounding terrain's material nodes and textures.

```sh
npx vitest run lab/tests/fallen-altar.test.mjs
URL=http://127.0.0.1:5180 node lab/tests/fallen-browser.mjs
```

The browser check needs the author dev server. It saves dusk, reverse-angle
and daylight captures under ignored `artifacts/fallen/`.
