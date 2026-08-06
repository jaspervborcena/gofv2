const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.PORT || 8080);
const host = '0.0.0.0';

const possibleRoots = [
  path.join(__dirname, 'dist', 'gofv2', 'browser'),
  path.join(__dirname, 'dist', 'gofv2'),
  path.join(__dirname, 'dist', 'browser')
];

const staticRoot = possibleRoots.find((candidate) => fs.existsSync(candidate));

if (!staticRoot) {
  console.error('Static build output not found. Run npm run build first.');
  process.exit(1);
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

function resolvePath(requestPath) {
  const decodedPath = decodeURIComponent(requestPath);
  const safePath = decodedPath === '/' ? '/index.html' : decodedPath;
  const absolutePath = path.normalize(path.join(staticRoot, safePath.replace(/^\//, '')));

  if (!absolutePath.startsWith(staticRoot)) {
    return path.join(staticRoot, 'index.html');
  }

  return absolutePath;
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }

      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Server error');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' || req.method === 'HEAD') {
    const requestPath = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;

    if (requestPath === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('ok');
      return;
    }

    const targetPath = resolvePath(requestPath);
    const filePath = fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()
      ? targetPath
      : path.join(staticRoot, 'index.html');

    if (req.method === 'HEAD') {
      res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'text/html; charset=utf-8' });
      res.end();
      return;
    }

    sendFile(res, filePath);
    return;
  }

  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Method not allowed');
});

server.listen(port, host, () => {
  console.log(`Server listening on http://${host}:${port}`);
});
