import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const PORT = 5501;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = __dirname;
const PROFILE_PATH = path.join(ROOT, 'medical-profile.json');
const CONTACTS_PATH = path.join(ROOT, 'contacts.json');
const ROUTINES_PATH = path.join(ROOT, 'routines.json');
const USER_FILES_DIR = path.join(ROOT, 'user_files');
const ENV_PATH = path.join(ROOT, '.env');
const SUPPLEMENT_SCRIPT = path.join(ROOT, 'scripts', 'supplement_recommender.py');
const ROUTINE_SCRIPT = path.join(ROOT, 'scripts', 'routine_generator.py');

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

function loadDotEnv() {
  if (!fs.existsSync(ENV_PATH)) return;

  try {
    const lines = fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/);
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;

      const index = trimmed.indexOf('=');
      if (index <= 0) return;

      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    });
  } catch {
    // Keep defaults if env loading fails.
  }
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

function parseJsonBody(req, res, maxBytes, onSuccess) {
  let body = '';
  req.on('data', (chunk) => {
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

function readJsonFile(filePath, fallbackValue) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(text);
  } catch {
    return fallbackValue;
  }
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function createEmptyMedicalProfile() {
  return {
    schemaVersion: 2,
    source: 'heartify-medical-id',
    updatedAt: '',
    patient: { bloodGroup: '', allergies: [], conditions: [] },
    emergencyDoctor: { raw: '' },
    medications: [],
    historyRecords: []
  };
}

function normalizeRoutineType(value) {
  const type = String(value || 'Custom').trim().toLowerCase();
  if (type === 'exercise') return 'Exercise';
  if (type === 'supplement') return 'Supplement';
  if (type === 'study') return 'Study';
  return 'Custom';
}

function timeToMinutes(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return (Number(match[1]) * 60) + Number(match[2]);
}

function normalizeRoutineRecord(input, index = 0) {
  return {
    id: String(input?.id || `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`),
    name: String(input?.name || '').trim(),
    type: normalizeRoutineType(input?.type),
    startTime: String(input?.startTime || '').trim(),
    endTime: String(input?.endTime || '').trim(),
    description: String(input?.description || '').trim(),
    position: Number.isFinite(Number(input?.position)) ? Number(input.position) : index,
    source: String(input?.source || 'manual').trim() || 'manual'
  };
}

function sortRoutines(routines) {
  return [...routines].sort((a, b) => {
    const timeDelta = timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
    if (timeDelta !== 0) return timeDelta;

    return String(a.name || '').localeCompare(String(b.name || ''));
  }).map((routine, index) => ({
    ...routine,
    position: index
  }));
}

function ensureRoutinesFile() {
  if (!fs.existsSync(ROUTINES_PATH)) {
    writeJsonFile(ROUTINES_PATH, []);
  }
}

function readRoutines() {
  ensureRoutinesFile();
  const raw = readJsonFile(ROUTINES_PATH, []);
  const normalized = Array.isArray(raw) ? raw.map((item, index) => normalizeRoutineRecord(item, index)).filter((item) => item.name) : [];
  return sortRoutines(normalized);
}

function writeRoutines(routines) {
  const normalized = sortRoutines((Array.isArray(routines) ? routines : []).map((item, index) => normalizeRoutineRecord(item, index)).filter((item) => item.name));
  writeJsonFile(ROUTINES_PATH, normalized);
  return normalized;
}

function runPythonJson(scriptPath, args = [], inputPayload = null) {
  const pythonCmd = String(process.env.PYTHON_BIN || 'python').trim() || 'python';
  const preferUv = (process.env.PYTHON_USE_UV || '').trim() === '1' || pythonCmd === 'uv';
  const attempts = preferUv
    ? [
        { command: 'uv', args: ['run', 'python', scriptPath, ...args] },
        { command: pythonCmd === 'uv' ? 'python' : pythonCmd, args: [scriptPath, ...args] }
      ]
    : [
        { command: pythonCmd, args: [scriptPath, ...args] },
        { command: 'uv', args: ['run', 'python', scriptPath, ...args] }
      ];

  let lastFailure = 'Unknown error';

  for (const attempt of attempts) {
    const result = spawnSync(attempt.command, attempt.args, {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 30000,
      env: process.env,
      input: inputPayload ? JSON.stringify(inputPayload) : undefined
    });

    if (result.error) {
      lastFailure = result.error.message || `Failed to start ${attempt.command}`;
      continue;
    }

    if (result.status !== 0) {
      lastFailure = (result.stderr || result.stdout || '').trim() || `Command ${attempt.command} exited with status ${result.status}`;
      continue;
    }

    try {
      return { data: JSON.parse(result.stdout || '{}') };
    } catch {
      lastFailure = 'Python analyzer returned invalid JSON.';
    }
  }

  return {
    error: `Python analyzer failed: ${lastFailure}`
  };
}

function makeHistoryRecordFromRequest(input) {
  const title = String(input.title || '').trim();
  const notes = String(input.notes || '').trim();
  const tags = Array.isArray(input.tags)
    ? input.tags.map((tag) => String(tag || '').trim().toLowerCase()).filter(Boolean)
    : String(input.tags || '').split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean);
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
    const profile = readJsonFile(PROFILE_PATH, createEmptyMedicalProfile());
    sendJson(res, 200, profile);
    return;
  }

  if (pathname === '/api/medical-profile' && req.method === 'PUT') {
    parseJsonBody(req, res, 20_000_000, (parsed) => {
      try {
        writeJsonFile(PROFILE_PATH, parsed);
        sendJson(res, 200, { ok: true });
      } catch {
        sendJson(res, 500, { error: 'Failed to write medical-profile.json' });
      }
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

  if (pathname === '/api/recommended-supplements' && req.method === 'GET') {
    const { data, error } = runPythonJson(SUPPLEMENT_SCRIPT, [PROFILE_PATH, ROOT]);
    if (error) {
      sendJson(res, 500, { error });
      return;
    }
    sendJson(res, 200, data);
    return;
  }

  if (pathname === '/api/routines' && req.method === 'GET') {
    sendJson(res, 200, readRoutines());
    return;
  }

  if (pathname === '/api/routines' && req.method === 'PUT') {
    parseJsonBody(req, res, 5_000_000, (parsed) => {
      try {
        const saved = writeRoutines(parsed);
        sendJson(res, 200, saved);
      } catch {
        sendJson(res, 500, { error: 'Failed to write routines.json' });
      }
    });
    return;
  }

  if (pathname === '/api/generate-routines' && req.method === 'POST') {
    parseJsonBody(req, res, 2_000_000, (parsed) => {
      const { data, error } = runPythonJson(ROUTINE_SCRIPT, [PROFILE_PATH, ROOT], parsed || {});
      if (error) {
        sendJson(res, 500, { error });
        return;
      }

      try {
        const saved = writeRoutines(data?.routines || []);
        sendJson(res, 200, {
          routines: saved,
          analysis: data?.analysis || null
        });
      } catch {
        sendJson(res, 500, { error: 'Failed to save generated routines.' });
      }
    });
    return;
  }

  if (pathname === '/api/contacts' && req.method === 'GET') {
    sendJson(res, 200, readJsonFile(CONTACTS_PATH, []));
    return;
  }

  if (pathname === '/api/contacts' && req.method === 'PUT') {
    parseJsonBody(req, res, 2_000_000, (parsed) => {
      try {
        writeJsonFile(CONTACTS_PATH, parsed);
        sendJson(res, 200, { ok: true });
      } catch {
        sendJson(res, 500, { error: 'Failed to write contacts.json' });
      }
    });
    return;
  }

  serveStatic(req, res);
});

loadDotEnv();
ensureRoutinesFile();

server.listen(PORT, () => {
  console.log(`Heartify local server running at http://localhost:${PORT}`);
});
