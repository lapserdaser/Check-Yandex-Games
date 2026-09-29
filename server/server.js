/**
 * CheckYG Local Server
 * Provides web interface, ZIP upload & decompression, static code analysis,
 * and a sandboxed preview environment with Mock Yandex SDK v2.0.
 */
const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { analyzeProject } = require('./checker/static-engine');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure workspace directories exist
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const SESSIONS_DIR = path.join(__dirname, 'sessions');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// Multer storage for ZIP files
const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 300 * 1024 * 1024 }, // 300 MB limit
  // FIX #2: принимаем ТОЛЬКО .zip файлы
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype === 'application/zip' ||
      file.mimetype === 'application/x-zip-compressed' ||
      file.mimetype === 'application/octet-stream' ||
      file.originalname.toLowerCase().endsWith('.zip')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Принимаются только ZIP-архивы (.zip)'));
    }
  }
});

// FIX #3: Zip Slip / ZIP Bomb — безопасная распаковка с проверкой каждого entry
const MAX_UNZIPPED_BYTES = 1 * 1024 * 1024 * 1024; // 1 ГБ — жёсткий лимит распакованного содержимого
function safeExtractZip(zipPath, sessionDir) {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();

  let totalUnzipped = 0;
  for (const entry of entries) {
    // Zip Slip: проверяем, что путь entry не выходит за sessionDir
    const entryDest = path.resolve(sessionDir, entry.entryName);
    if (!entryDest.startsWith(path.resolve(sessionDir) + path.sep) && !entry.isDirectory) {
      throw new Error(`Zip Slip обнаружен: "${entry.entryName}" — подозрительный путь в архиве!`);
    }
    // ZIP Bomb: суммируем размер распакованных данных
    totalUnzipped += entry.header.size;
    if (totalUnzipped > MAX_UNZIPPED_BYTES) {
      throw new Error(`Размер распакованного архива превышает лимит ${MAX_UNZIPPED_BYTES / 1024 / 1024 / 1024} ГБ (ZIP Bomb защита).`);
    }
  }

  zip.extractAllTo(sessionDir, true);
}

// In-memory sessions store
const sessions = new Map();

// FIX #7: TTL очистка сессий — удаляем старые директории при старте и раз в час
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 часа

function cleanupOldSessions() {
  const now = Date.now();
  // Очистить in-memory сессии с истёкшим TTL
  for (const [id, session] of sessions.entries()) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(id);
      try { fs.rmSync(session.dir, { recursive: true, force: true }); } catch (e) {}
      console.log(`[CheckYG] Сессия ${id} удалена (истёк TTL 24ч)`);
    }
  }
  // Очистить осиротевшие папки на диске (от предыдущих запусков)
  try {
    const dirs = fs.readdirSync(SESSIONS_DIR);
    dirs.forEach(dir => {
      const fullPath = path.join(SESSIONS_DIR, dir);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory() && (now - stat.mtimeMs) > SESSION_TTL_MS && !sessions.has(dir)) {
          fs.rmSync(fullPath, { recursive: true, force: true });
          console.log(`[CheckYG] Осиротевшая папка сессии ${dir} удалена`);
        }
      } catch (e) {}
    });
  } catch (e) {}
}

// Запускаем очистку при старте и далее раз в час
cleanupOldSessions();
setInterval(cleanupOldSessions, 60 * 60 * 1000);

// Helper to scan directory recursively
function scanDir(dir, baseDir = dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(scanDir(fullPath, baseDir));
    } else {
      results.push({
        path: relPath,
        fullPath: fullPath,
        size: stat.size
      });
    }
  });
  return results;
}

// Process unpacked game directory
function processGameSession(sessionId, sessionDir, archiveSizeBytes) {
  const fileList = scanDir(sessionDir);

  // Read all text files (html, js, css, json) into a single corpus for static engine
  let allSource = '';
  const textExtensions = new Set(['.html', '.htm', '.js', '.mjs', '.css', '.json']);

  fileList.forEach(file => {
    const ext = path.extname(file.path).toLowerCase();
    if (textExtensions.has(ext) && file.size < 5 * 1024 * 1024) { // skip huge minified bundles >5MB from full read
      try {
        const content = fs.readFileSync(file.fullPath, 'utf8');
        allSource += `\n/* === FILE: ${file.path} === */\n` + content;
      } catch (e) {
        console.warn('Could not read file for analysis:', file.path, e.message);
      }
    }
  });

  const report = analyzeProject({
    fileList,
    allSource,
    archiveSizeBytes
  });

  sessions.set(sessionId, {
    id: sessionId,
    dir: sessionDir,
    report,
    fileList,
    createdAt: Date.now()
  });

  return report;
}

// Global route for /sdk.js so games requesting official SDK get our Mock SDK
app.get('/sdk.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'checker', 'mock-sdk.js'));
});

// Explicit endpoint for mock SDK
app.get('/mock-sdk.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'checker', 'mock-sdk.js'));
});

// ── Upload ZIP archive ──────────────────────────────────────────
app.post('/api/upload', upload.single('archive'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Пожалуйста, загрузите ZIP-архив игры' });
  }

  const zipPath = req.file.path;
  const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const sessionDir = path.join(SESSIONS_DIR, sessionId);

  try {
    fs.mkdirSync(sessionDir, { recursive: true });
    // FIX #3: используем безопасную распаковку
    safeExtractZip(zipPath, sessionDir);

    const report = processGameSession(sessionId, sessionDir, req.file.size);

    // Clean up temporary upload zip
    try { fs.unlinkSync(zipPath); } catch (e) {}

    res.json({
      success: true,
      sessionId,
      report
    });
  } catch (err) {
    console.error('ZIP extraction error:', err);
    // Чистим сессию при ошибке
    try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (e) {}
    try { fs.unlinkSync(zipPath); } catch (e) {}
    res.status(500).json({
      error: 'Ошибка распаковки архива: ' + err.message
    });
  }
});

// ── Get report for existing session ────────────────────────────
app.get('/api/session/:id/report', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Сессия не найдена' });
  }
  res.json({
    sessionId: session.id,
    report: session.report
  });
});

// ── Demo presets (Orc Castle before / after) ────────────────────
app.get('/api/demo/:variant', (req, res) => {
  const variant = req.params.variant === 'after' ? 'after' : 'before';
  const demoSrcDir = path.join(__dirname, 'temp-repo', 'yandex-games-debug-checker-main', 'examples', 'orc-castle', variant);

  if (!fs.existsSync(demoSrcDir)) {
    return res.status(404).json({ error: 'Демо-пример не найден' });
  }

  const sessionId = 'demo_' + variant + '_' + Date.now();
  const sessionDir = path.join(SESSIONS_DIR, sessionId);

  try {
    fs.mkdirSync(sessionDir, { recursive: true });

    // Copy demo files to session
    const copyRecursive = (src, dest) => {
      const entries = fs.readdirSync(src, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          fs.mkdirSync(destPath, { recursive: true });
          copyRecursive(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    };

    copyRecursive(demoSrcDir, sessionDir);

    // Calculate approx size
    let approxSize = 0;
    const files = scanDir(sessionDir);
    files.forEach(f => approxSize += f.size);

    const report = processGameSession(sessionId, sessionDir, approxSize);

    res.json({
      success: true,
      sessionId,
      report,
      isDemo: true,
      variant
    });
  } catch (err) {
    console.error('Demo load error:', err);
    res.status(500).json({ error: 'Ошибка загрузки демо: ' + err.message });
  }
});

// ── Sandboxed Game Preview Route ───────────────────────────────
// Serves game files with correct MIME types and auto-injected Mock SDK
app.get('/preview/:sessionId/*', (req, res) => {
  const sessionId = req.params.sessionId;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).send('<h2>Сессия не найдена. Пожалуйста, загрузите архив заново.</h2>');
  }

  // Determine requested relative path inside the session
  let subPath = req.params[0] || 'index.html';
  if (!subPath || subPath === '/') subPath = 'index.html';

  let filePath = path.join(session.dir, subPath);

  // FIX #1: Path Traversal — убеждаемся, что путь строго внутри директории сессии
  const resolvedFilePath = path.resolve(filePath);
  const resolvedSessionDir = path.resolve(session.dir);
  if (!resolvedFilePath.startsWith(resolvedSessionDir + path.sep) && resolvedFilePath !== resolvedSessionDir) {
    return res.status(403).send('<h2>403 Forbidden: доступ за пределы сессии запрещён.</h2>');
  }

  // If directly index.html requested, but it was in a subfolder, locate it
  if (!fs.existsSync(filePath)) {
    const rootIndex = session.fileList.find(f => f.path.toLowerCase() === 'index.html' || f.path.toLowerCase().endsWith('/index.html'));
    if (rootIndex) {
      filePath = rootIndex.fullPath;
      // Дополнительная проверка для найденного файла
      const resolvedRoot = path.resolve(rootIndex.fullPath);
      if (!resolvedRoot.startsWith(resolvedSessionDir + path.sep)) {
        return res.status(403).send('<h2>403 Forbidden.</h2>');
      }
    } else {
      return res.status(404).send(`Файл "${subPath}" не найден в сборке игры.`);
    }
  }

  // If HTML file, inject the Mock SDK and parent postMessage bridge
  if (filePath.endsWith('.html') || filePath.endsWith('.htm')) {
    try {
      let html = fs.readFileSync(filePath, 'utf8');

      // Injection script that hooks /sdk.js and bridges events
      const injection = `
<!-- CheckYG Sandbox Injection -->
<script src="/mock-sdk.js"></script>
<script>
  window.addEventListener('error', function(e) {
    try {
      window.parent.postMessage({
        type: 'YG_RUNTIME_ERROR',
        message: e.message || 'Error',
        filename: e.filename || '',
        lineno: e.lineno || 0
      }, '*');
    } catch(err) {}
  });
  console.log('[CheckYG] Sandbox loaded with Mock Yandex SDK 2.0');
</script>
<!-- End CheckYG Sandbox Injection -->
`;

      if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/<head[^>]*>/i, match => match + '\n' + injection);
      } else {
        html = injection + '\n' + html;
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    } catch (e) {
      console.error('HTML serving error:', e);
      // FIX #16: обязательно отвечаем клиенту при ошибке (иначе запрос зависает)
      if (!res.headersSent) {
        return res.status(500).send('<h2>Ошибка формирования HTML страницы игры.</h2>');
      }
    }
  }

  // MIME types for games (especially WebGL, audio, and textures)
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.wasm': 'application/wasm',
    '.data': 'application/octet-stream',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav'
  };

  if (mimeTypes[ext]) {
    res.setHeader('Content-Type', mimeTypes[ext]);
  }

  res.sendFile(filePath);
});

// Fallback index
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  🚀 CheckYG Server running on http://localhost:${PORT}`);
  console.log(`  🔍 Yandex Games Debug Inspector & Interactive Sandbox`);
  console.log(`=======================================================`);
});
