# What costs what

Measured on one Apple Silicon Mac against Three.js r185.1 and the installed water
package, through 2026-09-10. Numbers here are orders of magnitude for deciding
where to look, not a promise about any other machine. Where this note and the
code disagree, the code is right.

## Measuring it at all

`npm run test:performance` counts submitted triangles, draw calls, queue submits
and presented frames per budget. Those are workload, not time, and a frame can
grow in all four while running cooler. What runs hot is CPU time and GPU busy
time, so measure those:

- **CPU**: `ps` cputime deltas for Chromium's GPU helper and renderer helper over
  a fixed window, as a percentage of one core.
- **GPU busy**: the latency of `GPUQueue.onSubmittedWorkDone()` sampled twice a
  frame at fixed points, once as the canvas pass begins and once after the last
  submit. A proxy, not a timestamp query. A Metal timestamp probe was tried and
  exhausted its query resources, and its numbers were discarded.
- **Attribution**: no-op the draws of one class of pass at a time and re-measure.
  Attribute passes through their nesting or the counts land on the wrong pass.

Repeated baselines in one session agree to about 0.15 ms; across sessions the
spread is nearer 8%, so smaller differences are not differences. GPU-busy numbers
only compare between runs at the same cadence, because at a lower frame rate the
CPU runs further ahead and more work is outstanding at both sample points without
the GPU doing more. Keep the viewport, device scale, warmup, route and other GPU
applications fixed, and check long-frame cadence and shader rebuilds, not only
the average frame rate.

## What a frame is made of

At the middle budget, about 44 render passes, 2 compute passes, 33 queue submits,
245 draws and 2 M triangles. Three facts decide everything else:

- **The desert is drawn twice.** Once into the scene pass, and again at full
  resolution with depth into the purchased water's refraction capture, whether or
  not any water is on screen. It was about a quarter of GPU time and 40% of the
  draws.
- **Shadows are nearly free in the shipped score**, because the sun is below the
  horizon and `shadowStrength` holds it at zero, so its 4096 map never renders.
  Only the moon carries a shadow. The moon map, the bloom passes, the FFT passes
  and multisampling each measured at no attributable GPU time.
- **The CPU cost is not the drawing.** Removing every draw in every pass still
  left most of a core busy. It is per-frame fixed overhead, roughly 1,500
  `writeBuffer` calls and 2 MB of uploads a frame, which scales with frames and
  passes rather than with geometry.

So cadence is the lever and resolution is not. Cutting pixels by a third cut GPU
time by about a tenth; halving the frame rate cut CPU by nearly 40%. That is why
the middle budget is a cadence step rather than a picture step, and why the
finished piece drops to 24 fps while its fire and ocean carry on.

## Things that are easy to break

- **Idle must stay idle.** The static opening, pause, a hidden tab and a frozen
  scrub all submit zero GPU work once settled. `npm run test:idle` guards it.
- **Resizing a shadow map** left bindings pointing at a destroyed depth texture
  in r185 and could blank a paused scene. Resolution changes replace the light
  and its shadow resources together, preserving target, colour, intensity and
  camera. Do not reintroduce a bare `mapSize` change.
- **Shadow intensity is a uniform.** Toggling `castShadow` instead would recompile
  every receiver at sunset or on a Studio seek.
- **Sand grains receive shadows.** Dropping that brings back bright dust on shaded
  dune faces.
- **Water height readbacks are asynchronous**, with one query in flight, so a slow
  GPU-to-CPU result cannot stall the character, fire, camera or ocean. Quality
  changes drain the pending query before the package swaps buffers.
- **The water preset must not be reapplied wholesale.** Screen-space reflections,
  spray and the boat wake are deliberately off and a vendor preset turns them on.
- **Multisampling belongs on the scene pass**, not the renderer, or the canvas
  gets a second full-resolution four-sample colour and depth attachment whose only
  draw is the composite.

## Tried, and not worth repeating

- **Skipping the water capture** when no water is on screen. The sight line was
  built and unit tested, and then the ocean plane turned out to fill every outward
  view past the 2 km of fixed ground, so no honest bound of that shape exists.
  Scaling the capture with the on-screen water footprint needs package support.
  Excluding geometry from it needs an API the package does not expose.
- **Smaller shadow maps at the middle budget.** It buys nothing in a score whose
  sun never casts, and it risks clipping long low-sun dune shadows.
- **Disabling the nearby rings' shadow casting.** Dunes would stop shadowing other
  dunes. The distant static tiles already neither cast nor receive.
- **Ring culling by bounding sphere.** A large ring's sphere contains its empty
  centre and usually intersects the view; useful rejection needs sector meshes and
  pays in draw calls.
- **Shadow-only body detail.** A hidden mesh casts nothing, and the refraction
  capture needs the body's appearance rather than its silhouette.
- **Coarsening the horizon.** The Earth altar's alignment derives its peaks from
  the rendered mountain vertices, so broad simplification breaks that match.
