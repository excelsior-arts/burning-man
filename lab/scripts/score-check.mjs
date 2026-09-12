// Read the authored score, check it, and print its timeline from the terminal.
// Studio shows the same thing live on the timeline; this is for tuning by hand.
import {createServer} from 'vite';

const server = await createServer({
  server: {middlewareMode: true},
  appType: 'custom',
  logLevel: 'error',
});
const load = (path) => server.ssrLoadModule(path);
try {
  const score = await load('/src/experience/score.ts');
  const look = await load('/src/experience/look-around.ts');
  const raw = JSON.parse(
    await (await import('node:fs/promises')).readFile('src/experience/score.json', 'utf8'),
  );
  let s;
  try {
    s = score.validateScore(raw);
  } catch (error) {
    console.error(`score.json is not valid: ${error.message}`);
    process.exitCode = 1;
    throw error;
  }
  const span = look.lookSpan(s);
  const stop = look.lookStart(s);
  const recovery = score.FALL_SECONDS + s.stage_05_fall_hold + score.RISE_SECONDS;
  const clock = (t) =>
    `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`.padStart(5);
  const rows = [
    ['music and heartbeat start', 0],
    ['flame takes', s.stage_01_flame],
    ['flame at full strength', s.stage_01_flame + s.ignition],
    ['first step', s.stage_01_flame + s.walkAt],
    ...(span > 0
      ? [
          ['stops to look about', stop],
          ...[1, 2, 3, 4].map((q) => [`  turns to quarter ${q}`, stop + (q - 1) * (span / 4)]),
          ['back on his heading', stop + 3 * (span / 4) + look.LOOK_PIVOT],
        ]
      : [['no look about: the fall leaves no room for it', s.stage_05_fall]]),
    ['first fall', s.stage_05_fall],
    ['back on his feet', s.stage_05_fall + recovery],
    ['exhaustion slow-down begins', s.stage_06_fatigue],
    ['final knee fall', s.stage_08_kneel],
    ['settles onto his heels', s.stage_09_settle],
    ['head bows', s.stage_10_bow],
    ['end of the piece', s.duration],
  ];
  console.log(
    `score.json: ${clock(s.duration).trim()} long, walking ${s.walkSpeed} m/s at ${s.paceScale} = ` +
      `${(score.pace(s) * 1).toFixed(3)} m/s fresh, ${(s.walkSpeed * s.endSpeed).toFixed(3)} m/s spent.`,
  );
  console.log(`look about: ${span.toFixed(1)} s, ${(span / 4 - look.LOOK_PIVOT).toFixed(1)} s on each heading.\n`);
  for (const [name, at] of rows) console.log(`${clock(at)}  ${at.toFixed(2).padStart(7)}s  ${name}`);
  // The ground survey costs a second or two; the times above never wait for it.
  const {ScriptedWalk} = await load('/src/experience/rehearsal.ts');
  const {rehearse} = await load('/src/experience/walker.ts');
  const {coastX} = await load('/src/sand/geography.ts');
  const route = new ScriptedWalk(s);
  console.log('\nwhere he is, in metres from the water:');
  for (const [name, at] of rows) {
    if (name.startsWith('  ')) continue;
    const p = route.sample(Math.min(at, s.duration)).position;
    console.log(`${(p.x - coastX(p.z)).toFixed(1).padStart(7)} m   ${name}`);
  }
  const end = rehearse(s);
  console.log(
    `\nhe stops ${end.waterDistance.toFixed(1)} m from the water` +
      ` (the dry margin is ${s.beachMargin} m)` +
      (end.arrival === null ? ', never reaching the shore.' : `, arriving at ${clock(end.arrival).trim()}.`),
  );
} finally {
  await server.close();
}
