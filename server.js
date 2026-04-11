import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 5501;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = __dirname;
const PROFILE_PATH = path.join(ROOT, 'medical-profile.json');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendJson(res, code, payload) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload));
}

function serveStatic(req, res) {
  const reqPath = req.url.split('?')[0] || '/';
  const filePath = reqPath === '/'
    ? path.join(ROOT, 'E1.html')
    : path.join(ROOT, decodeURIComponent(reqPath.replace(/^\//, '')));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0];

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  if (pathname === '/api/medical-profile' && req.method === 'GET') {
    fs.readFile(PROFILE_PATH, 'utf8', (err, text) => {
      if (err) {
        sendJson(res, 200, {
          schemaVersion: 2,
          source: 'rescuenow-medical-id',
          updatedAt: '',
          patient: { bloodGroup: '', allergies: [], conditions: [] },
          emergencyDoctor: { raw: '' },
          medications: []
        });
        return;
      }

      try {
        sendJson(res, 200, JSON.parse(text));
      } catch {
        sendJson(res, 500, { error: 'Invalid JSON in medical-profile.json' });
      }
    });
    return;
  }

  if (pathname === '/api/medical-profile' && req.method === 'PUT') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 2_000_000) {
        req.destroy();
      }
    });

    req.on('end', () => {
      let parsed;
      try {
        parsed = JSON.parse(body || '{}');
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }

      fs.writeFile(PROFILE_PATH, JSON.stringify(parsed, null, 2), 'utf8', err => {
        if (err) {
          sendJson(res, 500, { error: 'Failed to write medical-profile.json' });
          return;
        }
        sendJson(res, 200, { ok: true });
      });
    });
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`RescueNow local server running at http://localhost:${PORT}`);
});
