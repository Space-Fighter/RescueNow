import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 5501;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = __dirname;
const PROFILE_PATH = path.join(ROOT, 'medical-profile.json');
const CONTACTS_PATH = path.join(ROOT, 'contacts.json');
const USER_FILES_DIR = path.join(ROOT, 'user_files');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf'
};

const MIME_TO_EXT = {
  'image/jpeg': '.jpeg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
  'text/plain': '.txt'
};

function ensureUserFilesDir() {
  fs.mkdirSync(USER_FILES_DIR, { recursive: true });
}

function toSafeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'record';
}

function parseJsonBody(req, res, maxBytes, onSuccess) {
  let body = '';
  req.on('data', chunk => {
    body += chunk;
    if (body.length > maxBytes) {
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
    onSuccess(parsed);
  });
}

function makeHistoryRecordFromRequest(input) {
  const title = String(input.title || '').trim();
  const notes = String(input.notes || '').trim();
  const tags = Array.isArray(input.tags)
    ? input.tags.map(tag => String(tag || '').trim().toLowerCase()).filter(Boolean)
    : String(input.tags || '').split(',').map(tag => tag.trim().toLowerCase()).filter(Boolean);
  const uploadedAt = new Date().toISOString();
  const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  if (!input.dataUrl) {
    if (!notes) return { error: 'Choose a file or add notes to save as text.' };

    const base = toSafeName(title || 'note');
    const fileName = `${base}-${Date.now()}.txt`;
    const absolutePath = path.join(USER_FILES_DIR, fileName);
    fs.writeFileSync(absolutePath, notes, 'utf8');

    return {
      record: {
        id,
        title: title || fileName,
        fileName,
        fileType: '.txt',
        mimeType: 'text/plain',
        size: Buffer.byteLength(notes, 'utf8'),
        uploadedAt,
        tags,
        notes,
        filePath: `user_files/${fileName}`
      }
    };
  }

  const dataUrl = String(input.dataUrl);
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return { error: 'Invalid file payload.' };

  const mimeType = String(input.mimeType || match[1] || 'application/octet-stream').toLowerCase();
  const extFromName = path.extname(String(input.fileName || '')).toLowerCase();
  const ext = extFromName || MIME_TO_EXT[mimeType] || '.bin';
  const base = toSafeName(title || path.basename(String(input.fileName || 'record'), ext));
  const fileName = `${base}-${Date.now()}${ext}`;
  const absolutePath = path.join(USER_FILES_DIR, fileName);

  const fileBuffer = Buffer.from(match[2], 'base64');
  fs.writeFileSync(absolutePath, fileBuffer);

  return {
    record: {
      id,
      title: title || fileName,
      fileName,
      fileType: ext,
      mimeType,
      size: fileBuffer.length,
      uploadedAt,
      tags,
      notes,
      filePath: `user_files/${fileName}`
    }
  };
}

function sendJson(res, code, payload) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS',
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
      'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS',
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
          medications: [],
          historyRecords: []
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
    parseJsonBody(req, res, 20_000_000, (parsed) => {
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

  if (pathname === '/api/history-records' && req.method === 'POST') {
    parseJsonBody(req, res, 20_000_000, (parsed) => {
      try {
        ensureUserFilesDir();
        const { record, error } = makeHistoryRecordFromRequest(parsed);
        if (error) {
          sendJson(res, 400, { error });
          return;
        }
        sendJson(res, 200, record);
      } catch {
        sendJson(res, 500, { error: 'Failed to save history record file.' });
      }
    });
    return;
  }

  if (pathname === '/api/history-file' && req.method === 'DELETE') {
    parseJsonBody(req, res, 2_000_000, (parsed) => {
      const filePath = String(parsed.filePath || '').trim();
      if (!filePath) {
        sendJson(res, 400, { error: 'filePath is required.' });
        return;
      }

      const absolutePath = path.join(ROOT, filePath);
      if (!absolutePath.startsWith(ROOT)) {
        sendJson(res, 403, { error: 'Forbidden path.' });
        return;
      }

      fs.unlink(absolutePath, () => {
        sendJson(res, 200, { ok: true });
      });
    });
    return;
  }

  if (pathname === '/api/contacts' && req.method === 'GET') {
    fs.readFile(CONTACTS_PATH, 'utf8', (err, text) => {
      if (err) {
        sendJson(res, 200, []);
        return;
      }

      try {
        sendJson(res, 200, JSON.parse(text));
      } catch {
        sendJson(res, 500, { error: 'Invalid JSON in contacts.json' });
      }
    });
    return;
  }

  if (pathname === '/api/contacts' && req.method === 'PUT') {
    parseJsonBody(req, res, 2_000_000, (parsed) => {
      fs.writeFile(CONTACTS_PATH, JSON.stringify(parsed, null, 2), 'utf8', err => {
        if (err) {
          sendJson(res, 500, { error: 'Failed to write contacts.json' });
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
