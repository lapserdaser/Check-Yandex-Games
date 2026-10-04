/**
 * CheckYG Static Analysis Engine
 * Based on yandex-games-debug-checker v1.1.0 by 3/9 Games:
 * Copyright (c) 2026 3/9 Games (MIT License)
 * Copyright (c) 2026 CheckYG Contributors
 */
const path = require('path');

const HARD_FAIL_CHECKS = new Set([
  'SDK script tag',
  'YaGames.init()',
  'LoadingAPI.ready()',
  'No URL-based gating (п.1.18)',
  'No YouTube/external video player (п.3.9)',
  'No external ad networks',
  'No Yandex S3 URLs',
  // FIX #12-14: исправлены имена — теперь совпадают с реальными ch.name:
  'environment.i18n.lang',            // было 'SDK language read before Game Ready'
  'Overflow hidden on body/html',     // было 'No body scroll'
  'Context menu disabled',            // было 'contextmenu actually blocked' (дубль)
  'overscroll-behavior',              // было 'Document not scrollable'
  'SDK script tag',                   // было 'SDK loaded' (дубль)
  'YaGames.init()',                   // было 'SDK initialized' (дубль)
  'Root index.html present',
  'No Cyrillic or spaces in filenames'
]);

function pat(s, r) {
  return r.test(s);
}

function extractBlock(s, startRegex) {
  const m = s.match(startRegex);
  if (!m) return null;
  // FIX #10: увеличен лимит с 800 до 2000 символов — коллбэки в минифицированном коде могут быть длиннее
  return s.slice(m.index, m.index + 2000);
}

function findSnippet(source, regex, maxLen = 160) {
  const m = source.match(regex);
  if (!m) return null;
  const start = Math.max(0, m.index - 40);
  const end = Math.min(source.length, m.index + m[0].length + 40);
  let snippet = source.slice(start, end).replace(/[\r\n]+/g, ' ').trim();
  if (snippet.length > maxLen) {
    snippet = snippet.slice(0, maxLen) + '...';
  }
  return snippet;
}

function checkMeta(ch) {
  const text = [ch.name, ch.desc, ch.warnText, ch.failText].filter(Boolean).join(' ');
  const m = text.match(/(?:REQ-|п\.?\s*|пункт\s+)(\d+(?:\.\d+)+)/i);
  const req = m ? m[1] : '';
  const isRec = /реком|recommend/i.test(text) || (req && req.indexOf('6.') === 0);
  return {
    kind: isRec ? 'recommendation' : (req ? 'requirement' : 'heuristic'),
    requirement: req
  };
}

function metaBadge(meta) {
  if (meta.kind === 'recommendation') return { label: 'REC' + (meta.requirement ? ' ' + meta.requirement : ''), cls: 'badge-rec' };
  if (meta.kind === 'requirement') return { label: 'REQ ' + meta.requirement, cls: 'badge-req' };
  return { label: 'HEURISTIC', cls: 'badge-heu' };
}

// ── Check Definitions from debugcheck.js ──────────────────────
const CHECK_CATEGORIES = [
  {
    id: 'archive_meta',
    title: 'Архив и структура файлов',
    icon: '📦',
    checks: [
      {
        name: 'Root index.html present',
        desc: 'п.1.1 — index.html должен находиться в корне архива игры',
        test: function(ctx) {
          const hasRoot = ctx.fileList.some(f => f.path.toLowerCase() === 'index.html');
          if (hasRoot) return { pass: true, details: 'Файл index.html найден в корне архива' };
          const subIndex = ctx.fileList.find(f => f.path.toLowerCase().endsWith('/index.html') || f.path.toLowerCase().endsWith('\\index.html'));
          if (subIndex) {
            return {
              pass: false,
              details: `index.html найден во вложенной папке: "${subIndex.path}". Распакуйте и запакуйте содержимое папки напрямую, а не саму папку!`
            };
          }
          return { pass: false, details: 'index.html не найден в архиве!' };
        },
        failText: 'Файл index.html отсутствует в корне архива'
      },
      {
        name: 'No Cyrillic or spaces in filenames',
        desc: 'Требование платформы — имена файлов и папок не должны содержать русские буквы и спецсимволы',
        test: function(ctx) {
          const invalidFiles = [];
          const cyrillicOrInvalid = /[а-яёА-ЯЁ\s!@#$%^&*()+=~`[\]{}|\\:;"'<>?]/;
          ctx.fileList.forEach(f => {
            // Check only file/folder name parts, normalize slashes
            const parts = f.path.split(/[/\\]/);
            for (const p of parts) {
              if (cyrillicOrInvalid.test(p)) {
                invalidFiles.push(f.path);
                break;
              }
            }
          });
          if (invalidFiles.length === 0) {
            return { pass: true, details: 'Все имена файлов соответствуют стандарту (только латиница, цифры, дефис, точка)' };
          }
          return {
            pass: false,
            details: `Обнаружено ${invalidFiles.length} файлов с пробелами или кириллицей в именах (например: ${invalidFiles.slice(0, 3).join(', ')}). Консоль Яндекс Игр отклонит загрузку такого архива!`
          };
        },
        failText: 'Имена файлов содержат кириллицу или недопустимые символы'
      },
      {
        name: 'No OS/editor junk files',
        desc: 'реком. — отсутствие мусорных файлов (.DS_Store, Thumbs.db, .git)',
        test: function(ctx) {
          const junkPatterns = [/\.ds_store$/i, /thumbs\.db$/i, /desktop\.ini$/i, /^\.git/i, /^\.vscode/i, /^\.idea/i];
          const junk = ctx.fileList.filter(f => junkPatterns.some(rx => rx.test(f.path)));
          if (junk.length === 0) {
            return { pass: true, details: 'В архиве нет системных мусорных файлов' };
          }
          return {
            pass: 'warn',
            details: `Найдено ${junk.length} служебных файлов (${junk.slice(0, 3).map(j => j.path).join(', ')}). Удалите их перед публикацией для чистоты сборки.`
          };
        },
        warnText: 'В архиве обнаружены системные файлы ОС или IDE'
      },
      {
        name: 'Archive size within platform limits',
        desc: 'п.1.1 — размер архива игры до 100 МБ',
        test: function(ctx) {
          const mb = (ctx.archiveSizeBytes / (1024 * 1024)).toFixed(1);
          if (ctx.archiveSizeBytes > 100 * 1024 * 1024) {
            return { pass: false, details: `Размер ZIP составляет ${mb} МБ, что превышает стандартный лимит модерации в 100 МБ!` };
          }
          if (ctx.archiveSizeBytes > 60 * 1024 * 1024) {
            return { pass: 'warn', details: `Размер ZIP составляет ${mb} МБ. Игра будет дольше загружаться у игроков на мобильных сетях.` };
          }
          return { pass: true, details: `Размер архива: ${mb} МБ (в пределах нормы)` };
        },
        failText: 'Размер архива превышает 100 МБ'
      }
    ]
  },
  {
    id: 'sdk',
    title: 'Интеграция SDK',
    icon: '🔌', // FIX #20: была 📦 как у архива — теперь уникальная иконка
    checks: [
      {
        name: 'SDK script tag',
        desc: 'п.1.1 — /sdk.js в head',
        test: function(ctx) {
          const m = pat(ctx.allSource, /<script[^>]*src=["']\/sdk\.js["'][^>]*>/i);
          if (m) {
            const snip = findSnippet(ctx.allSource, /<script[^>]*src=["']\/sdk\.js["'][^>]*>/i);
            return { pass: true, details: snip || 'Найден тег <script src="/sdk.js">' };
          }
          return false;
        },
        failText: 'Тег <script src="/sdk.js"> не найден в HTML файлах игры!'
      },
      {
        name: 'YaGames.init()',
        desc: 'п.1.19.1 — SDK initialization',
        test: function(ctx) {
          if (pat(ctx.allSource, /YaGames\.init\s*\(/)) {
            const snip = findSnippet(ctx.allSource, /YaGames\.init\s*\([^)]*\)/);
            return { pass: true, details: snip || 'Вызов YaGames.init() найден' };
          }
          return false;
        },
        failText: 'Вызов YaGames.init() не найден в коде игры!'
      }
    ]
  },
  {
    id: 'lifecycle',
    title: 'Lifecycle API',
    icon: '🔄',
    checks: [
      {
        name: 'LoadingAPI.ready()',
        desc: 'п.1.19.2 — called when the game becomes interactive',
        test: function(ctx) {
          if (pat(ctx.allSource, /LoadingAPI[\s\S]{0,4}ready\s*\(/)) {
            const snip = findSnippet(ctx.allSource, /LoadingAPI[\s\S]{0,4}ready\s*\([^)]*\)/);
            return { pass: true, details: snip || 'Вызов LoadingAPI.ready() найден' };
          }
          return false;
        },
        failText: 'LoadingAPI.ready() не вызывается! Игра не сможет уведомить Яндекс о завершении загрузки.'
      }
    ]
  },
  {
    id: 'sound',
    title: 'Управление звуком',
    optional: true,
    icon: '🔊',
    checks: [
      {
        name: 'visibilitychange',
        desc: 'п.1.3 — Mute when tab hidden',
        test: function(ctx) {
          if (pat(ctx.allSource, /visibilitychange/)) {
            const snip = findSnippet(ctx.allSource, /addEventListener\s*\(\s*['"]visibilitychange['"][^)]*\)/);
            return { pass: true, details: snip || 'Обработчик visibilitychange найден' };
          }
          return 'warn';
        },
        warnText: 'Не найден обработчик visibilitychange для отключения звука при сворачивании вкладки'
      },
      {
        name: 'AudioContext suspend/resume',
        desc: 'AC.suspend() + AC.resume()',
        test: function(ctx) {
          const hasSuspend = pat(ctx.allSource, /\.suspend\s*\(|suspendAudio/);
          const hasResume = pat(ctx.allSource, /\.resume\s*\(|resumeAudio/);
          if (hasSuspend && hasResume) {
            return { pass: true, details: 'Присутствуют методы управления AudioContext: suspend() и resume()' };
          }
          return 'warn';
        },
        warnText: 'Рекомендуется использовать AudioContext suspend() и resume() для надежного управления аудио'
      }
    ]
  },
  {
    id: 'ads_inter',
    title: 'Реклама — Interstitial',
    optional: true,
    icon: '📺',
    checks: [
      {
        name: 'showFullscreenAdv',
        desc: 'Interstitial present',
        test: function(ctx) {
          return pat(ctx.allSource, /showFullscreenAdv\s*\(/);
        },
        warnText: 'Полноэкранная реклама showFullscreenAdv не обнаружена'
      },
      {
        name: 'onOpen callback',
        desc: 'Pause+mute on ad',
        test: function(ctx) {
          const m = extractBlock(ctx.allSource, /showFullscreenAdv\s*\(/);
          return m && /onOpen/.test(m);
        },
        warnText: 'В showFullscreenAdv отсутствует коллбэк onOpen для паузы игры и звука'
      },
      {
        name: 'onClose callback',
        desc: 'Resume after ad',
        test: function(ctx) {
          const m = extractBlock(ctx.allSource, /showFullscreenAdv\s*\(/);
          return m && /onClose/.test(m);
        },
        warnText: 'В showFullscreenAdv отсутствует коллбэк onClose для возобновления игры'
      },
      {
        name: 'onError callback',
        desc: 'Error handling',
        test: function(ctx) {
          const m = extractBlock(ctx.allSource, /showFullscreenAdv\s*\(/);
          return m && /onError/.test(m);
        },
        warnText: 'В showFullscreenAdv отсутствует коллбэк onError для безопасного продолжения игры при ошибке'
      }
    ]
  },
  {
    id: 'ads_rw',
    title: 'Реклама — За вознаграждение (Rewarded)',
    optional: true,
    icon: '🎬',
    checks: [
      {
        name: 'showRewardedVideo',
        desc: 'Rewarded present',
        test: function(ctx) {
          return pat(ctx.allSource, /showRewardedVideo\s*\(/);
        },
        warnText: 'Реклама за вознаграждение не обнаружена'
      },
      {
        name: 'onRewarded callback',
        desc: 'Grant reward',
        test: function(ctx) {
          const m = extractBlock(ctx.allSource, /showRewardedVideo\s*\(/);
          return m && /onRewarded/.test(m);
        },
        warnText: 'В showRewardedVideo не найден коллбэк onRewarded'
      },
      {
        name: 'onOpen callback',
        desc: 'Pause+mute',
        test: function(ctx) {
          const m = extractBlock(ctx.allSource, /showRewardedVideo\s*\(/);
          return m && /onOpen/.test(m);
        },
        warnText: 'В showRewardedVideo не найден коллбэк onOpen'
      },
      {
        name: 'onClose callback',
        desc: 'Resume',
        test: function(ctx) {
          const m = extractBlock(ctx.allSource, /showRewardedVideo\s*\(/);
          return m && /onClose/.test(m);
        },
        warnText: 'В showRewardedVideo не найден коллбэк onClose'
      }
    ]
  },
  {
    id: 'save',
    title: 'Облачные сохранения',
    optional: true,
    icon: '💾',
    checks: [
      {
        name: 'player.setData()',
        desc: 'п.1.9 — Сохранение прогресса в облако',
        test: function(ctx) {
          return pat(ctx.allSource, /\.setData\s*\(/);
        },
        warnText: 'Метод player.setData() не найден в коде'
      },
      {
        name: 'player.getData()',
        desc: 'п.1.9 — Загрузка сохраненного прогресса',
        test: function(ctx) {
          return pat(ctx.allSource, /\.getData\s*\(/);
        },
        warnText: 'Метод player.getData() не найден в коде'
      }
    ]
  },
  {
    id: 'payments',
    title: 'Внутриигровые покупки (IAP)',
    optional: true,
    icon: '💰',
    checks: [
      {
        name: 'getPayments()',
        desc: 'Инициализация покупок',
        test: function(ctx) {
          return pat(ctx.allSource, /getPayments\s*\(/);
        }
      },
      {
        name: 'consumePurchase()',
        desc: 'Потребление покупки после выдачи товара',
        test: function(ctx) {
          return pat(ctx.allSource, /consumePurchase\s*\(/);
        }
      },
      {
        name: 'getPurchases()',
        desc: 'Проверка незавершенных покупок при старте',
        test: function(ctx) {
          return pat(ctx.allSource, /getPurchases\s*\(/);
        }
      },
      {
        name: 'getCatalog() called (REQ-1.13.2)',
        desc: 'Каталог цен и валют через getCatalog()',
        guard: true,
        test: function(ctx) {
          const hasPayments = pat(ctx.allSource, /getPayments\s*\(/);
          if (!hasPayments) return { pass: true, details: 'Покупки не используются — n/a' };
          return pat(ctx.allSource, /getCatalog\s*\(/)
            ? true
            : { pass: false, details: 'getPayments() присутствует, но getCatalog() не вызывается для получения валюты цен (REQ-1.13.2)' };
        }
      },
      {
        name: 'No hardcoded ₽/$/€ near numbers (REQ-1.13.2)',
        desc: 'Запрет жестко закодированных символов валют около цен',
        guard: true,
        test: function(ctx) {
          const hasPayments = pat(ctx.allSource, /getPayments\s*\(/);
          if (!hasPayments) return { pass: true, details: 'Покупки не используются — проверка n/a' };
          const re = /(?:^|[^A-Za-z0-9])([+\-]?\d[\d.,]*\s?[₽€¥¢])|([₽€¥¢]\s?\d[\d.,]*)|([+\-]?\d[\d.,]*\s?\$)(?!\{)|(\$\s?\d{2,}(?:[.,]\d+)?)|(\$\s?\d[.,]\d+)/;
          const lines = ctx.allSource.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (/getCurrency|getPriceCurrency|priceCurrencyCode/.test(lines[i])) continue;
            if (re.test(lines[i])) {
              const m = lines[i].match(re);
              const val = (m[1] || m[2] || m[3] || m[4] || m[5]).trim();
              return { pass: false, details: `Захардкоженная валюта около цифры: "${val}" (строка ${i + 1}). Используйте getPriceCurrencyCode() / getPriceCurrencyImage()` };
            }
          }
          return true;
        }
      }
    ]
  },
  {
    id: 'i18n',
    title: 'Локализация (I18N)',
    icon: '🌐',
    checks: [
      {
        name: 'environment.i18n.lang',
        desc: 'п.2.14 — Автоопределение языка через SDK',
        test: function(ctx) {
          if (pat(ctx.allSource, /environment\s*\.\s*i18n\s*\.\s*lang|i18n\??\.lang/)) {
            const snip = findSnippet(ctx.allSource, /environment\s*\.\s*i18n\s*\.\s*lang|i18n\??\.lang/);
            return { pass: true, details: snip || 'Чтение языка из SDK environment.i18n.lang найдено' };
          }
          return {
            pass: 'warn',
            details: 'Не обнаружено явное чтение ysdk.environment.i18n.lang. Убедитесь, что игра поддерживает автоопределение языка (п.2.14)'
          };
        },
        failText: 'Игра не использует ysdk.environment.i18n.lang для автоопределения языка'
      },
      {
        name: 'Yandex lang fallback',
        desc: 'be/kk/uk/uz → ru (документация Яндекс Игр)',
        test: function(ctx) {
          const langs = ['be', 'kk', 'uk', 'uz'];
          let proven = [];
          langs.forEach(l => {
            const keyMap = new RegExp(`(?:['"]?${l}['"]?\\s*:\\s*['"]ru['"]|case\\s*['"]${l}['"]\\s*:[\\s\\S]{0,100}?return\\s*['"]ru['"])`, 'i');
            if (keyMap.test(ctx.allSource)) proven.push(l);
          });
          if (proven.length === langs.length) {
            return { pass: true, details: 'Найдено явное сопоставление языков be/kk/uk/uz → ru' };
          }
          // Check grouped Set or Array
          const hasGroup = pat(ctx.allSource, /(?:RU_LIKE|RU_FALLBACK|['"](?:be|kk|uk|uz)['"][\s\S]{0,80}['"]ru['"])/i);
          if (hasGroup) {
            return { pass: true, details: 'Обнаружена группа языков с фоллбеком на русский язык' };
          }
          return {
            pass: 'not_verified',
            details: 'Фоллбек с языков СНГ (be/kk/uk/uz) на русский не найден явно. Модерация рекомендует для них отдавать русский интерфейс.'
          };
        }
      }
    ]
  },
  {
    id: 'ux',
    title: 'UX и мобильная адаптация',
    icon: '📱',
    checks: [
      {
        name: 'Context menu disabled',
        desc: 'п.1.6.2.7 — блокировка правого клика (contextmenu preventDefault)',
        test: function(ctx) {
          // FIX #9: проверяем, что contextmenu и preventDefault находятся близко (в одном обработчике)
          const re = /contextmenu[\s\S]{0,500}preventDefault|addEventListener\s*\(\s*['"]contextmenu['"]\s*,[^)]*\)/;
          return re.test(ctx.allSource);
        },
        failText: 'Контекстное меню браузера не отключено! Добавьте: document.addEventListener("contextmenu", e => e.preventDefault())'
      },
      {
        name: 'Text selection disabled',
        desc: 'п.1.6.2.7 — отключение выделения текста (user-select: none)',
        test: function(ctx) {
          return pat(ctx.allSource, /user-select\s*:\s*none/) || pat(ctx.allSource, /selectstart/);
        },
        failText: 'Выделение текста не отключено в CSS/JS. Добавьте в CSS: * { user-select: none; }'
      },
      {
        name: 'touch-action configured',
        desc: 'touch-action: none/manipulation на игровой зоне',
        test: function(ctx) {
          return pat(ctx.allSource, /touch-action\s*:\s*(none|manipulation)/);
        },
        warnText: 'Рекомендуется настроить touch-action: none в CSS для блокировки паразитных жестов на смартфонах'
      },
      {
        name: 'Viewport meta tag',
        desc: 'Мобильный viewport с user-scalable=no',
        test: function(ctx) {
          return pat(ctx.allSource, /<meta[^>]*viewport[^>]*>/i);
        },
        failText: 'Отсутствует мета-тег viewport в HTML'
      },
      {
        name: 'Overflow hidden on body/html',
        desc: 'п.1.10.2 — предотвращение скролла страницы',
        test: function(ctx) {
          return pat(ctx.allSource, /overflow\s*:\s*hidden/);
        },
        failText: 'п.1.10.2: Не задан overflow: hidden на body/html. Страница может прокручиваться во время игры.'
      },
      {
        name: 'overscroll-behavior',
        desc: 'п.1.10.2 — защита от pull-to-refresh на iOS/Android',
        test: function(ctx) {
          return pat(ctx.allSource, /overscroll-behavior\s*:\s*(none|contain)/);
        },
        warnText: 'Добавьте в CSS: html, body { overscroll-behavior: none; } для предотвращения случайной перезагрузки свайпом'
      },
      {
        name: '-webkit-touch-callout: none',
        desc: 'Отключение всплывающего системного меню iOS при долгом тапе',
        test: function(ctx) {
          return pat(ctx.allSource, /touch-callout\s*:\s*none/);
        },
        warnText: 'Рекомендуется добавить -webkit-touch-callout: none для предотвращения контекстного меню на iOS'
      }
    ]
  },
  {
    id: 'danger',
    title: 'Опасные конструкции',
    icon: '⚠️',
    checks: [
      {
        name: 'No alert()',
        desc: 'п.1.14 — alert() строго запрещен в Яндекс Играх',
        test: function(ctx) {
          const clean = ctx.allSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
          const m = clean.match(/(?<![.\w])alert\s*\(/g);
          return !m || m.length === 0;
        },
        failText: 'В коде обнаружен вызов alert()! Системные модальные окна блокируют страницу и приводят к отказу в модерации.'
      },
      {
        name: 'No confirm()',
        desc: 'п.1.14 — confirm() строго запрещен',
        test: function(ctx) {
          const clean = ctx.allSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
          const m = clean.match(/(?<![.\w])confirm\s*\(/g);
          return !m || m.length === 0;
        },
        failText: 'В коде обнаружен вызов confirm()! Замените на внутриигровой UI.'
      },
      {
        name: 'No prompt()',
        desc: 'п.1.14 — prompt() строго запрещен',
        test: function(ctx) {
          const clean = ctx.allSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
          const m = clean.match(/(?<![.\w])prompt\s*\(/g);
          return !m || m.length === 0;
        },
        failText: 'В коде обнаружен вызов prompt()!'
      },
      {
        name: 'No document.write()',
        desc: 'document.write запрещен',
        test: function(ctx) {
          return !pat(ctx.allSource, /document\.write\s*\(/);
        },
        failText: 'Обнаружен устаревший и небезопасный document.write()'
      },
      {
        name: 'No eval()',
        desc: 'eval() не рекомендуется и опасен',
        test: function(ctx) {
          const clean = ctx.allSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
          const m = clean.match(/(?<![.\w])eval\s*\(/g);
          return !m || m.length === 0;
        },
        warnText: 'В коде найден eval() — это создает уязвимости и замедляет JIT-оптимизацию'
      },
      {
        name: 'No Yandex S3 URLs',
        desc: 'п.1.7 — все ресурсы должны быть локальными, без абсолютных ссылок на s3.yandex.net',
        test: function(ctx) {
          return !pat(ctx.allSource, /https?:\/\/[^"']*yandex.*\.s3/);
        },
        failText: 'п.1.7: Обнаружены абсолютные ссылки на Yandex S3 хранилище. Все пути к ассетам должны быть относительными!'
      }
    ]
  },
  {
    id: 'quality',
    title: 'Качество и тонкости модерации',
    icon: '⭐',
    checks: [
      {
        name: 'No WebGL notice (п.1.6.1.7)',
        desc: 'Запрещено показывать пользователю сообщения "Включите WebGL / WebGL not supported"',
        test: function(ctx) {
          return !pat(ctx.allSource, /WebGL[^<]{0,40}(not |unavailable|enable|unsupported|включите|не поддерж)/i);
        },
        warnText: 'Обнаружен текст с просьбой включить WebGL (п.1.6.1.7). Платформа требует скрывать такие сообщения.'
      },
      {
        name: 'Music via Web Audio, not <audio>/new Audio (п.1.6.1.6/1.6.2.5)',
        desc: 'Фоновая музыка через <audio> или new Audio() всплывает в системном плеере ОС и шторке уведомлений',
        test: function(ctx) {
          const hasNewAudio = pat(ctx.allSource, /new\s+Audio\s*\(/);
          const bgAudioTag = pat(ctx.allSource, /<audio\b[^>]*\b(autoplay|loop)\b/i);
          if (hasNewAudio || bgAudioTag || pat(ctx.allSource, /navigator\.mediaSession/)) {
            return 'warn';
          }
          return true;
        },
        warnText: 'Музыка через new Audio() или <audio loop> отображается в системном плеере Windows/Android (п.1.6.2.5 / 1.6.1.6). Рекомендуется использовать Web Audio API (AudioContext).'
      },
      {
        name: 'Keyboard via e.code, not e.key (ru-раскладка)',
        desc: 'Управление движением: e.code==="KeyW", а не e.key==="w", иначе ломается русская раскладка (там "ц")',
        test: function(ctx) {
          if (!pat(ctx.allSource, /keydown|keyup/i)) return true;
          const badKey = pat(ctx.allSource, /\.key\s*(===?|==)\s*['"][wasd]['"]/i) || pat(ctx.allSource, /case\s*['"][wasd]['"]\s*:/i);
          if (!badKey) return true;
          const hasCode = pat(ctx.allSource, /\.code\s*(===?|==)\s*['"]Key[WASD]['"]/);
          return hasCode ? true : 'warn';
        },
        warnText: 'Найдена проверка клавиш WASD через e.key вместо e.code. При русской раскладке управление не сработает!'
      },
      {
        name: 'No URL-based gating (п.1.18)',
        desc: 'Игра не должна ограничивать запуск проверкой location.host / iframe origin',
        test: function(ctx) {
          return !pat(ctx.allSource, /location\.(host|hostname|href)\s*[!=]==?\s*("|')|referrer\s*[!=]==?|top\.location\s*[!=]/);
        },
        failText: 'п.1.18: Обнаружена проверка домена игры (location.host). Игра должна запускаться в любом iframe контейнере Яндекса!'
      },
      {
        name: 'Sound toggle present (реком. 6.2)',
        desc: 'Рекомендация: наличие кнопки включения/выключения звука',
        test: function(ctx) {
          if (!pat(ctx.allSource, /new Audio|AudioContext|<audio|Howl|Tone\./i)) return true;
          return pat(ctx.allSource, /(mute|sound|звук|audio)[^>]{0,40}(toggle|btn|button|onclick|checkbox)/i) ||
            pat(ctx.allSource, /(toggle|btn|button)[^>]{0,40}(mute|sound|звук)/i) ||
            pat(ctx.allSource, /soundToggle|toggleSound|muteBtn|btnSound|soundOn\s*=/i)
            ? true
            : 'warn';
        },
        warnText: 'В игре есть звук, но не обнаружен тумблер выключения звука в UI (рекомендация 6.2)'
      },
      {
        name: 'Pause available (реком. 6.3)',
        desc: 'Рекомендация: наличие паузы в игре с активным геймплеем',
        test: function(ctx) {
          if (!pat(ctx.allSource, /requestAnimationFrame|setInterval\s*\(\s*game|gameLoop|update\s*\(dt/i)) return true;
          return pat(ctx.allSource, /pauseGame|isPaused|paused\s*=|btnPause|pauseBtn|пауза/i) ? true : 'warn';
        },
        warnText: 'Обнаружен игровой цикл реального времени, но нет явной кнопки паузы (рекомендация 6.3)'
      },
      {
        name: 'Title without the word "игра/game" (реком. 6.5)',
        desc: 'В теге <title> не должно быть слова "игра" или "game"',
        test: function(ctx) {
          const m = ctx.allSource.match(/<title>([^<]{1,80})<\/title>/i);
          if (!m) return true;
          return /\b(game|games)\b|игра|игры/i.test(m[1]) ? 'warn' : true;
        },
        warnText: 'В <title> присутствует слово "игра/game". Рекомендация 6.5 советует указывать чистое название игры.'
      },
      {
        name: 'No useless exit button (реком. 6.7)',
        desc: 'В веб-игре не должно быть неработающей кнопки "Выход из игры"',
        test: function(ctx) {
          return pat(ctx.allSource, /(btn|button)[^>]{0,60}>(\s|&nbsp;)*(выход|выйти\s*из\s*игры|exit\s*game|quit\s*game)/i) ||
            pat(ctx.allSource, /(выход из игры|exit game|quit game)[^<]{0,20}<\/button/i)
            ? 'warn'
            : true;
        },
        warnText: 'Обнаружена кнопка "Выход из игры", которая в веб-среде не имеет смысла (рекомендация 6.7)'
      },
      {
        name: 'No YouTube/external video player (п.3.9)',
        desc: 'Запрещены внешние видеоплееры (YouTube iframe)',
        test: function(ctx) {
          return !pat(ctx.allSource, /youtube\.com\/embed|youtube-nocookie\.com|<iframe[^>]+youtu\.?be|player\.vimeo\.com/i);
        },
        failText: 'п.3.9: Обнаружен YouTube/Vimeo плеер. Внешние плееры запрещены модерацией!'
      },
      {
        name: 'No external ad networks',
        desc: 'п.4.1 — только рекламная сеть Яндекса (AdSense/Google Ads запрещены)',
        test: function(ctx) {
          return !pat(ctx.allSource, /googletag|doubleclick\.net|adsbygoogle|google_ad_client/);
        },
        failText: 'п.4.1: Обнаружены сторонние рекламные сети (AdSense/Google). Разрешена только реклама Яндекс Игр!'
      }
    ]
  },
  {
    id: 'leaderboards',
    title: 'Таблицы рекордов (Leaderboards)',
    optional: true,
    icon: '🏆',
    checks: [
      {
        name: 'Leaderboard API (current)',
        desc: 'Использование ysdk.leaderboards',
        test: function(ctx) {
          if (pat(ctx.allSource, /ysdk\.leaderboards\b|\.leaderboards\./)) return true;
          if (pat(ctx.allSource, /getLeaderboards\s*\(/)) return 'warn';
          return false;
        },
        warnText: 'Используется устаревший метод getLeaderboards(). Рекомендуется прямой доступ ysdk.leaderboards'
      },
      {
        name: 'setScore() call',
        desc: 'Отправка очков через setScore',
        test: function(ctx) {
          if (pat(ctx.allSource, /\.setScore\s*\(/)) return true;
          if (pat(ctx.allSource, /setLeaderboardScore\s*\(/)) return 'warn';
          return false;
        },
        warnText: 'Используется deprecated метод setLeaderboardScore вместо setScore'
      },
      {
        name: 'Leaderboard name [a-zA-Z0-9]',
        desc: 'Имя лидерборда должно содержать только английские буквы и цифры (без дефисов и подчеркиваний)',
        test: function(ctx) {
          const names = [];
          const re = /(?:\.setScore|submitScore)\s*\(\s*['"]([^'"]+)['"]/g;
          let m;
          while ((m = re.exec(ctx.allSource)) !== null) {
            names.push(m[1]);
          }
          if (names.length > 0) {
            const allValid = names.every(n => /^[a-zA-Z0-9]+$/.test(n));
            return allValid ? true : 'warn';
          }
          return true;
        },
        warnText: 'Имя таблицы рекордов содержит недопустимые знаки (разрешены только [a-zA-Z0-9], без тире и подчеркиваний)'
      }
    ]
  }
];

// ── Main Analysis Function ────────────────────────────────────
function analyzeProject({ fileList, allSource, archiveSizeBytes }) {
  const ctx = {
    fileList,
    allSource,
    archiveSizeBytes
  };

  let totalPass = 0;
  let totalFail = 0;
  let totalWarn = 0;
  let totalNotVerified = 0;
  let totalNA = 0;

  const results = [];

  CHECK_CATEGORIES.forEach(cat => {
    // Optional category check
    if (cat.optional) {
      let anyPresent = false;
      cat.checks.forEach(ch => {
        if (ch.guard) return;
        try {
          const r = ch.test(ctx);
          if (r === true || (typeof r === 'object' && r.pass === true)) {
            anyPresent = true;
          }
        } catch (e) {}
      });

      if (!anyPresent) {
        totalNA += cat.checks.length;
        results.push({
          category: cat.title,
          id: cat.id,
          icon: cat.icon,
          isNA: true,
          checks: cat.checks.map(ch => ({
            name: ch.name,
            desc: ch.desc,
            status: 'na',
            details: 'Функционал не используется в игре'
          }))
        });
        return;
      }
    }

    const catChecks = [];

    cat.checks.forEach(ch => {
      const meta = checkMeta(ch);
      const badge = metaBadge(meta);
      let r;
      try {
        r = ch.test(ctx);
      } catch (err) {
        r = false;
      }

      let status = 'fail';
      let details = null;

      if (r && typeof r === 'object' && 'pass' in r) {
        status = r.pass === true ? 'pass' : (r.pass === 'warn' ? 'warn' : (r.pass === 'not_verified' ? 'not_verified' : 'fail'));
        details = r.details || null;
      } else if (r === true) {
        status = 'pass';
      } else if (r === 'warn') {
        status = 'warn';
      } else if (r === 'not_verified') {
        status = 'not_verified';
      } else {
        status = 'fail';
      }

      // Convert soft fail to warn if not in HARD_FAIL_CHECKS
      if (status === 'fail' && !HARD_FAIL_CHECKS.has(ch.name)) {
        status = 'warn';
      }

      if (status === 'pass') {
        totalPass++;
        details = details || 'Проверка успешно пройдена';
      } else if (status === 'warn') {
        totalWarn++;
        details = details || ch.warnText || 'Обнаружен потенциальный риск при модерации';
      } else if (status === 'not_verified') {
        totalNotVerified++;
        details = details || 'Не удалось автоматически доказать корректность по исходному коду';
      } else {
        totalFail++;
        details = details || ch.failText || 'Критическое нарушение требований платформы!';
      }

      catChecks.push({
        name: ch.name,
        desc: ch.desc,
        status: status,
        details: details,
        badge: badge,
        meta: meta
      });
    });

    results.push({
      category: cat.title,
      id: cat.id,
      icon: cat.icon,
      isNA: false,
      checks: catChecks
    });
  });

  const scoredTotal = totalPass + totalFail + totalWarn;
  const allTotal = scoredTotal + totalNotVerified;
  // FIX #11: score = pass / (pass + fail + warn) — warns снижают балл, NA не завышают
  const score = scoredTotal > 0 ? Math.round((totalPass / scoredTotal) * 100) : 0;
  const coverage = allTotal > 0 ? Math.round((scoredTotal / allTotal) * 100) : 0;

  return {
    summary: {
      score,
      coverage,
      pass: totalPass,
      fail: totalFail,
      warn: totalWarn,
      notVerified: totalNotVerified,
      na: totalNA,
      isReady: totalFail === 0
    },
    categories: results,
    files: {
      count: fileList.length,
      archiveSize: archiveSizeBytes,
      largestFiles: [...fileList].sort((a, b) => b.size - a.size).slice(0, 10),
      // FIX #5: передаём полный список файлов для корректного дерева архива в UI
      allFiles: [...fileList].sort((a, b) => a.path.localeCompare(b.path))
    }
  };
}

module.exports = {
  analyzeProject,
  CHECK_CATEGORIES,
  HARD_FAIL_CHECKS
};
