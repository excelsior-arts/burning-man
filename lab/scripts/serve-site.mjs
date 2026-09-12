// Serve docs/ under a project path, the way GitHub Pages serves a repo.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const PREFIX = '/burning-man';
const types = {'.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.glb': 'model/gltf-binary', '.png': 'image/png', '.bin': 'application/octet-stream', '.m4a': 'audio/mp4'};
createServer(async (req, res) => {
  let url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (!url.startsWith(PREFIX)) return (res.statusCode = 404), res.end('outside the project path');
  url = url.slice(PREFIX.length) || '/';
  if (url.endsWith('/')) url += 'index.html';
  try {
    const file = path.join(process.cwd(), 'docs', url);
    const body = await readFile(file);
    res.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end('not found');
  }
}).listen(5191, '127.0.0.1', () => console.log('serving docs/ at http://127.0.0.1:5191' + PREFIX + '/'));
