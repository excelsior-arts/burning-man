import {buildAtlasRows} from './atlas-build';

export type SurveyJob = {
  id: number;
  min: number;
  step: number;
  size: number;
  range: number;
  from: number;
  to: number;
};

// One band of one survey per message. The whole survey is split across as many
// workers as the machine will give, so the ridges are evaluated while the body
// downloads rather than on the thread that has to draw the first frame.
self.onmessage = (event: MessageEvent<SurveyJob>) => {
  const {id, min, step, size, range, from, to} = event.data;
  const rows = buildAtlasRows(min, step, size, range, from, to);
  (self as unknown as {postMessage: (d: unknown, t: Transferable[]) => void}).postMessage(
    {id, from, rows: rows.buffer},
    [rows.buffer],
  );
};
