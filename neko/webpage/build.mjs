import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';

const root = resolve('.');
const src = join(root, 'static-lite');
const dst = join(root, 'build');

function ensureSource() {
  if (existsSync(src)) return;
  mkdirSync(src, { recursive: true });
  writeFileSync(
    join(src, 'index.html'),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>n.eko documentation</title>
    <style>
      body { font-family: Segoe UI, sans-serif; margin: 0; background:#0b1220; color:#eaf2ff; }
      main { max-width: 920px; margin: 0 auto; padding: 2rem; }
      a { color:#7ec8ff; }
      .card { background:#121b2d; border:1px solid #24344f; border-radius:10px; padding:1rem; margin-top:1rem; }
    </style>
  </head>
  <body>
    <main>
      <h1>n.eko documentation</h1>
      <div class="card">
        <p>Documentation is maintained in-repo under <code>neko/webpage/docs</code>.</p>
        <p>Project: <a href="https://github.com/m1k1o/neko">https://github.com/m1k1o/neko</a></p>
      </div>
    </main>
  </body>
</html>`,
    'utf8'
  );
}

function build() {
  ensureSource();
  rmSync(dst, { recursive: true, force: true });
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
  console.log('built minimal static webpage into build/');
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
  server.listen(3000, () => {
    console.log('preview: http://127.0.0.1:3000');
  });
}

build();
if (process.argv.includes('--serve')) {
  serve();
}
