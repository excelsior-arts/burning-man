/** Framing helpers for stills. Author builds only; compiled out of the release.
 *
 * The piece aims the camera straight at him, so he is always dead centre. For a
 * poster that is the one composition you cannot use. This offsets the point the
 * camera aims at, in the camera's own left/right and up, so a nudge moves him
 * across the frame the same way whichever direction the shot is taken from.
 */
export interface Framing {
  /** Metres, camera-relative: x across the frame, y up. */
  readonly offset: {x: number; y: number};
  readonly plate: boolean;
}

const STEP = 0.35;
const FINE = 0.06;

export function mountFraming(
  report: () => {distance: number; around: number; above: number},
  moved: () => void = () => {},
): Framing {
  const state = {offset: {x: 0, y: 0}, plate: false};

  const style = document.createElement('style');
  style.textContent = `
    body.plate > *:not(#world) { display: none !important; }
    .framing-guides { position: fixed; inset: 0; z-index: 90; pointer-events: none; }
    .framing-guides i { position: absolute; background: #ffffff38; }
    .framing-guides i.v { top: 0; bottom: 0; width: 1px; }
    .framing-guides i.h { left: 0; right: 0; height: 1px; }
    .framing-guides b { position: absolute; inset: 10% 10%; border: 1px dashed #ffffff30; }
    .framing-read { position: fixed; right: 8px; bottom: 8px; z-index: 91; margin: 0;
      padding: 6px 9px; border-radius: 6px; background: #000000a8; color: #f2eade;
      font: 11px/1.45 ui-monospace, Menlo, monospace; white-space: pre; pointer-events: none; }
  `;
  document.head.append(style);

  // Pressed again and again, G walks through these. The panels one cuts the
  // frame into four uprights for a carousel, with a line across to hang the
  // horizon or his eye on.
  const GRIDS = [
    {name: 'none', down: [], across: [], safe: false},
    {name: 'thirds', down: [1 / 3, 2 / 3], across: [1 / 3, 2 / 3], safe: true},
    {name: 'four panels', down: [0.25, 0.5, 0.75], across: [0.5], safe: false},
  ] as const;
  let grid = 0;

  const overlay = document.createElement('div');
  overlay.className = 'framing-guides';
  overlay.hidden = true;
  const drawGrid = () => {
    const g = GRIDS[grid]!;
    overlay.replaceChildren();
    for (const at of g.down) {
      const line = document.createElement('i');
      line.className = 'v';
      line.style.left = `${at * 100}%`;
      overlay.append(line);
    }
    for (const at of g.across) {
      const line = document.createElement('i');
      line.className = 'h';
      line.style.top = `${at * 100}%`;
      overlay.append(line);
    }
    if (g.safe) overlay.append(document.createElement('b'));
    overlay.hidden = grid === 0;
  };
  const read = document.createElement('pre');
  read.className = 'framing-read';
  read.hidden = true;
  document.body.append(overlay, read);

  const show = () => {
    const s = report();
    read.textContent = [
      `distance ${s.distance.toFixed(2)} m`,
      `around   ${s.around.toFixed(1)}°`,
      `above    ${s.above.toFixed(1)}°`,
      `frame    ${state.offset.x >= 0 ? '+' : ''}${state.offset.x.toFixed(2)}  ${state.offset.y >= 0 ? '+' : ''}${state.offset.y.toFixed(2)}`,
      `grid     ${GRIDS[grid]!.name}`,
    ].join('\n');
    read.hidden = grid === 0 && !state.offset.x && !state.offset.y;
  };

  addEventListener(
    'keydown',
    (e) => {
      if (!e.metaKey || e.ctrlKey || e.altKey) return;
      const step = e.shiftKey ? FINE : STEP;
      const move = (x: number, y: number) => {
        state.offset.x += x;
        state.offset.y += y;
      };
      switch (e.code) {
        case 'ArrowLeft': move(-step, 0); break;
        case 'ArrowRight': move(step, 0); break;
        case 'ArrowUp': move(0, step); break;
        case 'ArrowDown': move(0, -step); break;
        case 'Digit0': state.offset.x = state.offset.y = 0; break;
        case 'KeyG':
          grid = (grid + 1) % GRIDS.length;
          drawGrid();
          break;
        case 'KeyH':
          state.plate = !state.plate;
          document.body.classList.toggle('plate', state.plate);
          break;
        case 'KeyJ': {
          const s = report();
          void navigator.clipboard?.writeText(
            `distance ${s.distance.toFixed(2)} around ${s.around.toFixed(1)} above ${s.above.toFixed(1)} frame ${state.offset.x.toFixed(2)} ${state.offset.y.toFixed(2)}`,
          );
          break;
        }
        default: return;
      }
      e.preventDefault();
      moved();
      show();
    },
    {capture: true},
  );

  setInterval(show, 120);
  return state;
}
