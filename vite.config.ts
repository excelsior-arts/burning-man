import {defineConfig} from 'vite';
import {cp, mkdir, writeFile} from 'node:fs/promises';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
/** Only runtime assets are copied. The working shelf and vendor source never ship. */
/** The public build is the site: it is committed under docs/, which is what
 * GitHub Pages serves from a branch, and every URL in it is relative so the
 * same files work at a domain root or under a project path. */
const SITE = 'docs';
const lanCert = () =>
  existsSync('tmp/certs/key.pem') && existsSync('tmp/certs/cert.pem')
    ? {key: readFileSync('tmp/certs/key.pem'), cert: readFileSync('tmp/certs/cert.pem')}
    : undefined;
export default defineConfig(({command, mode}) => ({
  base: './',
  define: {__AUTHOR__: JSON.stringify(command === 'serve' || mode === 'author')},
  publicDir: false,
  resolve: {dedupe: ['three']},
  optimizeDeps: {include: ['three', 'three/webgpu', 'three/tsl']},
  // Listen on the wifi as well as the loopback, so a phone on the same network
  // can open it. Vite refuses a Host header it does not know, and `.local`
  // admits whatever this machine calls itself on the wifi. It is served over
  // TLS when a certificate is present, because WebGPU is only handed to a
  // secure context: over plain http a phone silently falls back to WebGL and
  // the budget pins itself to Low. Make one with:
  //   node lab/scripts/make-cert.mjs
  server: {host: true, allowedHosts: ['.local'], https: lanCert(), fs: {allow: ['.', '../threejs-water-pro']}},
  preview: {host: true, allowedHosts: ['.local'], https: lanCert()},
  build: {sourcemap: false, outDir: mode === 'author' ? 'dist-author' : SITE},
  plugins: [
    {
      name: 'runtime-assets-only',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = (req.url ?? '').split('?')[0]!;
          // Studio's "Write score.json" button: the dev server saves the authored
          // score straight into the source file, so a tuned take needs no export.
          if (url === '/__score' && req.method === 'PUT') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) chunks.push(chunk as Buffer);
            try {
              const score = JSON.parse(Buffer.concat(chunks).toString('utf8'));
              if (!score || typeof score !== 'object' || Array.isArray(score)) throw new Error('not a score');
              const {writeFile} = await import('node:fs/promises');
              await writeFile(
                path.join(process.cwd(), 'src/experience/score.json'),
                JSON.stringify(score, null, 2) + '\n',
              );
              res.statusCode = 204;
              res.end();
            } catch (error) {
              res.statusCode = 400;
              res.end(String(error));
            }
            return;
          }
          if (!/^\/(character|animations|audio)\/|^\/share\.jpg$/.test(url)) return next();
          try {
            const decoded = decodeURIComponent(url);
            if (decoded.includes('..')) return next();
            const {readFile} = await import('node:fs/promises');
            const data = await readFile(path.join(process.cwd(), 'public', decoded));
            res.setHeader(
              'Content-Type',
              url.endsWith('.json')
                ? 'application/json'
                : url.endsWith('.png')
                  ? 'image/png'
                  : url.endsWith('.jpg')
                    ? 'image/jpeg'
                  : url.endsWith('.glb')
                    ? 'model/gltf-binary'
                    : 'application/octet-stream',
            );
            res.end(data);
          } catch {
            next();
          }
        });
      },
      async closeBundle() {
        const dir = mode === 'author' ? 'dist-author' : SITE;
        await mkdir(dir, {recursive: true});
        // Pages runs Jekyll over a branch unless told not to, and Jekyll drops
        // every directory whose name begins with an underscore.
        if (dir === SITE) await writeFile(`${dir}/.nojekyll`, '');
        // The minifier strips every comment, so the notices that MIT requires to
        // travel with a copy are carried as files beside the bundle instead.
        await mkdir(`${dir}/licenses`, {recursive: true});
        await cp('node_modules/three/LICENSE', `${dir}/licenses/three.js.txt`);
        await cp('licenses/meshoptimizer.txt', `${dir}/licenses/meshoptimizer.txt`);
        // The card a link preview shows, since no scraper will run the piece,
        // and what a phone keeps on its home screen, where the piece has the
        // whole display because Safari itself will not give a page one.
        for (const file of [
          'share.jpg',
          'manifest.webmanifest',
          'icon-180.png',
          'icon-192.png',
          'icon-512.png',
        ])
          try {
            await cp(`public/${file}`, `${dir}/${file}`);
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
          }
        for (const folder of ['character', 'animations', 'audio']) {
          try {
            await cp(`public/${folder}`, `${dir}/${folder}`, {recursive: true});
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
          }
        }
      },
    },
  ],
}));
