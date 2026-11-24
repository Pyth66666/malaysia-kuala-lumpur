// Minimal static server with correct MIME types, traversal protection, gzip, ETag caching
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT = __dirname;
// 127.0.0.1 by default; pass --lan (or PHONE=1) to allow phones on the same Wi-Fi
const BIND = (process.argv.includes('--lan') || process.env.PHONE) ? '0.0.0.0' : '127.0.0.1';
const PORT = 8787;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png',
  '.ico': 'image/x-icon', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream',
  '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.map': 'application/json',
  '.pbf': 'application/octet-stream',
};

http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('bad request');
    return;
  }
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.resolve(ROOT, '.' + urlPath);
  // reject anything escaping the app directory (path traversal)
  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('forbidden');
    return;
  }

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
    const mime = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const ext = path.extname(file).toLowerCase();
    // compressible types only (not .glb/.bin/.pbf which are already binary)
    const compressible = ['.html', '.js', '.mjs', '.json', '.css', '.svg', '.map'].includes(ext);
    const acceptEnc = req.headers['accept-encoding'] || '';
    const canGzip = compressible && acceptEnc.includes('gzip');
    const etag = '"' + crypto.createHash('sha1').update(st.mtime.getTime() + ':' + st.size + '').digest('hex').slice(0, 16) + '"';
    const headers = {
      'Content-Type': mime,
      'Cache-Control': 'no-cache',           // revalidate; ETag avoids re-download
      'ETag': etag,
      'Accept-Ranges': 'bytes',
    };
    if (canGzip) headers['Content-Encoding'] = 'gzip';

    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304); res.end();
      return;
    }

    const range = req.headers.range;
    if (range && !canGzip) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (m) {
        let start = m[1] === '' ? 0 : parseInt(m[1]);
        let end = m[2] === '' ? st.size - 1 : parseInt(m[2]);
        if (start <= end && start < st.size) {
          headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
          res.writeHead(206, headers);
          fs.createReadStream(file, { start, end }).pipe(res);
          return;
        }
      }
      res.writeHead(416); res.end();
      return;
    }

    res.writeHead(200, headers);
    if (canGzip) {
      const gz = zlib.createGzip();
      fs.createReadStream(file).pipe(gz).pipe(res);
    } else {
      fs.createReadStream(file).pipe(res);
    }
  });
}).listen(PORT, '127.0.0.1', () => console.log(`KL 3D server on http://127.0.0.1:${PORT}`));
