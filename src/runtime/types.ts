/** Runtime boundary: metres, seconds, Y-up. No DOM, renderer, or game dependency. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface MotionState {
  position: Vec3;
  velocity: Vec3;
  facing: number;
  speed: number;
  distance: number;
}
