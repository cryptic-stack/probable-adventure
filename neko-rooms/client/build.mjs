import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';

const root = resolve('.');
const src = join(root, 'public');
const dst = join(root, 'dist');

function build() {
  if (!existsSync(src)) {
    throw new Error('missing public directory');
  }
  rmSync(dst, { recursive: true, force: true });
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
  console.log('built static admin UI into dist/');
}

function serve() {
  const server = createServer((req, res) => {
    const path = req.url && req.url !== '/' ? req.url : '/index.html';
    const file = join(dst, path.replace(/^\/+/, ''));
    if (!existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200);
    res.end(readFileSync(file));
  });
  server.listen(8081, () => {
    console.log('preview: http://127.0.0.1:8081');
  });
}

build();
if (process.argv.includes('--serve')) {
  serve();
}
