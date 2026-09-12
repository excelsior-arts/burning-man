# What this stands on

The [licence](LICENSE) covers what was made here and nothing else. Everything
below belongs to whoever wrote it and is used under its own terms, none of
which this project can change and none of which changes this one.

## In the build

| | | |
| --- | --- | --- |
| [three.js](https://threejs.org) | the renderer, WebGPU with a WebGL2 fallback | [MIT](https://github.com/mrdoob/three.js/blob/dev/LICENSE) |
| [threejs-water-pro](https://threejsroadmap.com/assets/threejs-water-pro) | the ocean | commercial, see below |
| [meshoptimizer](https://github.com/zeux/meshoptimizer) | unpacking the compressed figure | [MIT](https://github.com/zeux/meshoptimizer/blob/master/LICENSE.md) |
| [Adobe Mixamo](https://www.mixamo.com) | the figure's skeleton and the way it moves | Mixamo's terms, see below |

**three.js** is installed from npm and bundled into the published JavaScript.
Its licence asks that the notice travel with any copy, and the minifier strips
every comment out of the bundle, so the notice is carried beside it as a file:
`licenses/three.js.txt` in the built site.

**meshoptimizer** arrives inside three.js as the decoder for the compressed
figure, and the page cannot draw the body without it. It is MIT under its own
copyright rather than three.js's, so its notice travels the same way:
`licenses/meshoptimizer.txt`.

**[threejs-water-pro](https://threejsroadmap.com/assets/threejs-water-pro)** is
a commercial library from DRG Software Solutions LLC, licensed per developer.
Its licence allows its compiled code to be deployed inside a finished work and
forbids publishing its source, so this repository holds neither the library nor
any part of it in source form: it is installed from a copy kept outside this
checkout, and only the compiled ocean reaches the site under `docs/`. Building
from a clone of this repository therefore needs your own licensed copy of that
package.

**Mixamo** supplies the skeleton the figure is built on and the motions it
performs: walking, giving way, rising and kneeling. Mixamo's terms allow that
inside a finished work and do not allow the characters or motions to be passed
on as assets for someone else to use. So they are here only as this piece:
retargeted, packed into the single file the page loads, and offered to nobody as
a download. The original captures are not in this repository.

The body those motions move is not theirs. It was modelled here, in Blender, and
it belongs to this project along with everything else made for the piece.

## Not in the build

The music is fetched when the page opens rather than built into the site, so no
recording is held in this repository or served from it.


The tooling is installed from npm and runs on the machine that builds the site
rather than in anyone's browser: Vite, TypeScript, Vitest and Playwright, each
under its own licence, none of it shipped.
