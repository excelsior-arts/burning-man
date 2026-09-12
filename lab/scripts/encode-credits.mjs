// The credits travel as ciphertext so a scraper that does not run scripts finds
// nothing to take, an address least of all. The plain text is not kept in this
// repository either: it lives in an ignored file and is recovered from the
// shipped ciphertext when it is needed.
//
//   node lab/scripts/encode-credits.mjs --decode   # ciphertext -> tmp/credits.json
//   node lab/scripts/encode-credits.mjs            # tmp/credits.json -> ciphertext
//
// Paste what the second prints into CREDITS in src/experience/main.ts.
import {readFileSync, writeFileSync} from 'node:fs';
const KEY = 'burning-man-2026';
const SOURCE = process.env.CREDITS_FILE ?? 'tmp/credits.json';
const MAIN = 'src/experience/main.ts';
const key = new TextEncoder().encode(KEY);
const turn = (bytes) => bytes.map((b, i) => b ^ key[i % key.length]);

if (process.argv.includes('--decode')) {
  const found = readFileSync(MAIN, 'utf8').match(/const CREDITS = '([A-Za-z0-9+/=]+)'/);
  if (!found) throw new Error(`no CREDITS line in ${MAIN}`);
  const plain = new TextDecoder().decode(turn(Buffer.from(found[1], 'base64')));
  writeFileSync(SOURCE, `${JSON.stringify(JSON.parse(plain), null, 2)}\n`);
  console.log(`wrote ${SOURCE}`);
} else {
  const lines = JSON.parse(readFileSync(SOURCE, 'utf8'));
  console.log(Buffer.from(turn(new TextEncoder().encode(JSON.stringify(lines)))).toString('base64'));
}
