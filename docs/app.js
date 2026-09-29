/**
 * CheckYG — Browser Edition Frontend
 * Handles ZIP extraction via JSZip, runs analysis engine, renders UI.
 * All processing is done client-side — no data leaves the browser.
 */

import { analyzeProject } from './engine.js';

document.addEventListener('DOMContentLoaded', () => {
  const TEXT_EXTENSIONS = new Set(['.html', '.htm', '.js', '.mjs', '.cjs', '.css', '.json', '.ts']);
  const MAX_FILE_READ_SIZE = 5 * 1024 * 1024; // 5MB per file

  const state = {
    report: null,
    activeFilter: 'all',
    searchQuery: '',
    checkedItems: new Set(),
    checklist: [
      { id: 1, title: 'Проверка на чистом черновике с официальной панелью', desc: 'Откройте черновик в консоли разработчика Яндекс Игр и повторите запуск после ручного закрытия платформенного лоадера.' },
      { id: 2, title: 'Тайминг LoadingAPI.ready()', desc: 'Убедитесь, что ready() вызывается именно в момент полной готовности меню или игрового поля, а не сразу в YaGames.init().' },
      { id: 3, title: 'Тестирование всех языков черновика', desc: 'Переключите каждый язык из карточки игры (через мок языка в панели Яндекса) и визуально проверьте Canvas/WebGL текст.' },
      { id: 4, title: 'Сохранение прогресса при перезагрузке', desc: 'Сыграйте один раунд, перезагрузите страницу и убедитесь, что счет, инвентарь и позиция восстановились.' },
      { id: 5, title: 'Внутриигровые покупки (если есть)', desc: 'Проверьте отображение цен из каталога getCatalog(), значок валюты getPriceCurrencyImage(), списание покупки consumePurchase().' },
      { id: 6, title: 'Реклама за вознаграждение (Rewarded)', desc: 'Проверьте, что реклама вызывается строго по желанию игрока (клик по кнопке), и награда начисляется ровно один раз.' },
      { id: 7, title: 'Полноэкранная реклама (Interstitial)', desc: 'Реклама по клику должна стартовать в пределах 0.33с; в длинных уровнях таймерная реклама обязана показывать предупреждение за 2 секунды.' },
      { id: 8, title: 'Заглушение звука и пауза геймплея во время рекламы', desc: 'Проверьте, что звук игры полностью замолкает во время рекламы и при сворачивании вкладки браузера.' },
      { id: 9, title: 'Ориентация экрана на мобильных устройствах', desc: 'Поверните смартфон в портрет и альбом — игра не должна сплющиваться или вылезать за пределы вьюпорта.' },
      { id: 10, title: 'Файл index.html в корне архива', desc: 'Убедитесь, что архив упакован без внешней папки (index.html прямо в корне ZIP-файла).' },
      { id: 11, title: 'Чистая консоль без ошибок', desc: 'Откройте F12 DevTools: при старте, геймплее, показе рекламы и сохранении не должно сыпаться ошибок (красных строк).' },
      { id: 12, title: 'Проверка метаданных и скриншотов', desc: 'Название без слова "игра", иконка 512x512, понятные скриншоты, корректный возрастной рейтинг и описание управления.' }
    ]
  };

  // ── DOM References ─────────────────────────────────────────────
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const uploadLoader = document.getElementById('upload-loader');
  const dropzoneContent = document.querySelector('.dropzone-content');
  const uploadSection = document.getElementById('upload-section');
  const dashboardSection = document.getElementById('dashboard-section');
  const btnReset = document.getElementById('btn-reset');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const filterSearch = document.getElementById('filter-search');
  const pillBtns = document.querySelectorAll('.pill-btn');

  // ── Drag and Drop ──────────────────────────────────────────────
  ['dragenter', 'dragover'].forEach(ev => {
    dropzone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dropzone.classList.add('dragover'); });
  });
  ['dragleave', 'drop'].forEach(ev => {
    dropzone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dropzone.classList.remove('dragover'); });
  });
  dropzone.addEventListener('drop', e => {
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) handleFileUpload(files[0]);
  });
  fileInput.addEventListener('change', e => {
    if (e.target.files.length > 0) handleFileUpload(e.target.files[0]);
  });
  btnReset.addEventListener('click', resetView);

  // ── ZIP Processing (all client-side via JSZip) ─────────────────
  async function handleFileUpload(file) {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      alert('Пожалуйста, выберите файл в формате .ZIP');
      return;
    }

    showLoader('Распаковка архива в браузере...', `Обработка "${file.name}" (${(file.size / (1024 * 1024)).toFixed(1)} МБ)`);

    try {
      const zip = await JSZip.loadAsync(file);

      // Build file list and source corpus
      const fileList = [];
      let allSource = '';

      // Safety check: total unzipped size (ZIP Bomb protection)
      const MAX_UNZIPPED = 1 * 1024 * 1024 * 1024; // 1GB
      let totalUnzipped = 0;

      const entries = Object.values(zip.files).filter(f => !f.dir);
      for (const entry of entries) {
        // Normalize path separators
        const filePath = entry.name.replace(/\\/g, '/');
        const compressedSize = entry._data?.compressedSize || 0;
        const uncompressedSize = entry._data?.uncompressedSize || 0;

        totalUnzipped += uncompressedSize;
        if (totalUnzipped > MAX_UNZIPPED) {
          throw new Error('Суммарный распакованный размер превышает 1 ГБ (ZIP Bomb защита)');
        }

        fileList.push({ path: filePath, size: uncompressedSize });

        // Read text files for analysis
        const ext = filePath.includes('.') ? '.' + filePath.split('.').pop().toLowerCase() : '';
        if (TEXT_EXTENSIONS.has(ext) && uncompressedSize < MAX_FILE_READ_SIZE) {
          try {
            const content = await entry.async('string');
            allSource += `\n/* === FILE: ${filePath} === */\n` + content;
          } catch (e) {
            // Skip unreadable files
          }
        }
      }

      const report = analyzeProject({ fileList, allSource, archiveSizeBytes: file.size });
      handleAnalysisSuccess(report, file.name);

    } catch (err) {
      console.error('ZIP processing error:', err);
      alert('Ошибка обработки архива: ' + err.message);
      hideLoader();
    }
  }

  function showLoader(title, desc) {
    dropzoneContent.style.display = 'none';
    uploadLoader.style.display = 'flex';
    document.getElementById('loader-title').textContent = title;
    document.getElementById('loader-desc').textContent = desc;
  }

  function hideLoader() {
    uploadLoader.style.display = 'none';
    dropzoneContent.style.display = 'block';
  }

  function resetView() {
    state.report = null;
    state.checkedItems = new Set();
    dashboardSection.style.display = 'none';
    uploadSection.style.display = 'flex';
    btnReset.style.display = 'none';
    fileInput.value = '';
    hideLoader();
  }

  // ── Analysis Result Handling ────────────────────────────────────
  function handleAnalysisSuccess(report, filename) {
    state.report = report;
    uploadSection.style.display = 'none';
    dashboardSection.style.display = 'block';
    btnReset.style.display = 'inline-flex';

    renderVerdictBanner(report.summary, filename);
    renderMetrics(report.summary);
    renderCategories(report.categories);
    renderArchiveTab(report);
    renderChecklist();
    renderExportReport(report, filename);

    // Scroll to results
    dashboardSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Verdict Banner ──────────────────────────────────────────────
  function renderVerdictBanner(summary, filename) {
    const banner = document.getElementById('verdict-banner');
    const title = document.getElementById('verdict-title');
    const desc = document.getElementById('verdict-desc');
    const icon = document.getElementById('verdict-icon');
    const scoreVal = document.getElementById('score-val');
    const circleFill = document.getElementById('circle-fill');

    banner.className = 'verdict-banner ' + (summary.isReady ? 'banner-pass' : 'banner-fail');

    if (summary.isReady) {
      icon.textContent = '🛡️';
      title.textContent = 'ГОТОВА К МОДЕРАЦИИ (0 Hard Fails)';
      title.style.color = 'var(--color-pass)';
      desc.textContent = `Все обязательные проверки пройдены. Найдено ${summary.warn} предупреждений/советов.`;
      circleFill.style.stroke = 'var(--color-pass)';
    } else {
      icon.textContent = '⛔';
      title.textContent = `ОТКАЗ МОДЕРАТОРА: ${summary.fail} блокирующих ошибок`;
      title.style.color = 'var(--color-fail)';
      desc.textContent = 'Игра не будет допущена к каталогу. Исправьте ошибки в коде или структуре архива ниже.';
      circleFill.style.stroke = 'var(--color-fail)';
    }

    scoreVal.textContent = summary.score + '%';
    circleFill.setAttribute('stroke-dasharray', `${summary.score}, 100`);
  }

  // ── Metrics Ribbon ──────────────────────────────────────────────
  function renderMetrics(summary) {
    document.getElementById('metric-fail-num').textContent = summary.fail;
    document.getElementById('metric-warn-num').textContent = summary.warn;
    document.getElementById('metric-nv-num').textContent = summary.notVerified;
    document.getElementById('metric-pass-num').textContent = summary.pass;
    document.getElementById('metric-cov-num').textContent = summary.coverage + '%';
    document.getElementById('tab-checks-count').textContent = summary.pass + summary.fail + summary.warn + summary.notVerified;
  }

  // ── Categories & Check Rows ────────────────────────────────────
  function renderCategories(categories) {
    const container = document.getElementById('categories-list');
    container.innerHTML = '';

    categories.forEach(cat => {
      let catPass = 0, catFail = 0, catWarn = 0, catNV = 0;
      cat.checks.forEach(c => {
        if (c.status === 'pass') catPass++;
        else if (c.status === 'fail') catFail++;
        else if (c.status === 'warn') catWarn++;
        else if (c.status === 'not_verified') catNV++;
      });

      const catCard = document.createElement('div');
      catCard.className = 'category-card' + (catFail > 0 || catWarn > 0 ? ' open' : '');
      catCard.dataset.categoryId = cat.id;

      let badgeHtml = '';
      if (cat.isNA) badgeHtml = `<span class="badge" style="background:#21262d;color:#8b949e">N/A</span>`;
      else if (catFail > 0) badgeHtml = `<span class="badge badge-fail">${catFail} FAIL</span>`;
      else if (catWarn > 0) badgeHtml = `<span class="badge badge-warn">${catWarn} WARN</span>`;
      else if (catNV > 0) badgeHtml = `<span class="badge badge-nv">${catNV} N/V</span>`;
      else badgeHtml = `<span class="badge badge-pass">OK</span>`;

      catCard.innerHTML = `
        <div class="category-header">
          <div class="cat-title-group">
            <span class="cat-arrow">▶</span>
            <span class="cat-icon">${cat.icon}</span>
            <span class="cat-title">${cat.category}</span>
          </div>
          <div class="cat-badges">
            ${badgeHtml}
            <span class="cat-count">${catPass}/${cat.checks.length}</span>
          </div>
        </div>
        <div class="category-body">
          ${cat.checks.map(ch => renderCheckRow(ch)).join('')}
        </div>
      `;

      catCard.querySelector('.category-header').addEventListener('click', () => {
        catCard.classList.toggle('open');
      });

      container.appendChild(catCard);
    });

    applyFilters();
  }

  function renderCheckRow(ch) {
    let icon = '✔', iconCls = 'status-icon-pass', detailCls = 'details-pass';
    if (ch.status === 'fail') { icon = '✖'; iconCls = 'status-icon-fail'; detailCls = 'details-fail'; }
    else if (ch.status === 'warn') { icon = '▲'; iconCls = 'status-icon-warn'; detailCls = 'details-warn'; }
    else if (ch.status === 'not_verified') { icon = '?'; iconCls = 'status-icon-nv'; detailCls = 'details-nv'; }
    else if (ch.status === 'na') { icon = '—'; iconCls = 'status-icon-na'; detailCls = 'details-na'; }

    const badgeHtml = ch.badge ? `<span class="badge ${ch.badge.cls}">${ch.badge.label}</span>` : '';

    return `
      <div class="check-row" data-status="${ch.status}" data-kind="${ch.meta?.kind || ''}">
        <div class="check-status-icon ${iconCls}">${icon}</div>
        <div class="check-content">
          <div class="check-title-row">
            <span class="check-name">${escapeHtml(ch.name)}</span>
            ${badgeHtml}
          </div>
          <div class="check-desc">${escapeHtml(ch.desc)}</div>
          <div class="check-details-box ${detailCls}">${escapeHtml(ch.details || '')}</div>
        </div>
      </div>
    `;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Filters & Search ────────────────────────────────────────────
  filterSearch.addEventListener('input', e => {
    state.searchQuery = e.target.value.toLowerCase().trim();
    applyFilters();
  });

  pillBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      pillBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeFilter = btn.dataset.filter;
      applyFilters();
    });
  });

  function applyFilters() {
    document.querySelectorAll('.category-card').forEach(card => {
      let visible = 0;
      card.querySelectorAll('.check-row').forEach(row => {
        const status = row.dataset.status;
        const kind = row.dataset.kind;
        const text = row.textContent.toLowerCase();
        const matchSearch = !state.searchQuery || text.includes(state.searchQuery);
        let matchPill = true;
        if (state.activeFilter === 'fail') matchPill = status === 'fail';
        else if (state.activeFilter === 'warn') matchPill = status === 'warn';
        else if (state.activeFilter === 'req') matchPill = kind === 'requirement';
        else if (state.activeFilter === 'rec') matchPill = kind === 'recommendation';

        row.style.display = (matchSearch && matchPill) ? 'flex' : 'none';
        if (matchSearch && matchPill) visible++;
      });
      card.style.display = visible > 0 ? 'block' : 'none';
      if (visible > 0 && (state.activeFilter !== 'all' || state.searchQuery)) card.classList.add('open');
    });
  }

  // ── Tabs ────────────────────────────────────────────────────────
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(tabId).classList.add('active');
    });
  });

  // ── Archive Tab ─────────────────────────────────────────────────
  function renderArchiveTab(report) {
    const files = report.files;
    document.getElementById('arch-file-count').textContent = files.count;
    document.getElementById('arch-zip-size').textContent = (files.archiveSize / (1024 * 1024)).toFixed(2) + ' МБ';

    const rootCheck = report.categories[0]?.checks.find(c => c.name === 'Root index.html present');
    const rootStatus = document.getElementById('arch-root-status');
    if (rootCheck && rootCheck.status === 'pass') {
      rootStatus.className = 'badge badge-pass';
      rootStatus.textContent = 'Корректный корень';
    } else {
      rootStatus.className = 'badge badge-fail';
      rootStatus.textContent = 'Ошибка размещения';
    }

    document.getElementById('largest-files-list').innerHTML = files.largestFiles.map(f => {
      const sz = f.size > 1024 * 1024 ? (f.size / (1024 * 1024)).toFixed(1) + ' МБ' : Math.round(f.size / 1024) + ' КБ';
      return `<div class="file-size-item"><span>${escapeHtml(f.path)}</span><strong>${sz}</strong></div>`;
    }).join('');

    const cyrillicOrInvalid = /[а-яёА-ЯЁ\s!@#$%^&*()+=~`[\]{}|\\:;"'<>?]/;
    document.getElementById('file-tree-container').innerHTML = (files.allFiles || files.largestFiles).slice(0, 300).map(f => {
      const parts = f.path.split(/[/\\]/);
      const isBad = parts.some(p => cyrillicOrInvalid.test(p));
      const ext = f.path.split('.').pop().toLowerCase();
      const icon = ext === 'html' ? '📄' : (ext === 'js' || ext === 'mjs' ? '📜' : (['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext) ? '🖼️' : '📁'));
      return `
        <div class="tree-file ${isBad ? 'has-error' : ''}">
          <span>${icon}</span>
          <span>${escapeHtml(f.path)}</span>
          ${isBad ? '<span class="badge badge-fail">Кириллица/Пробел!</span>' : ''}
        </div>`;
    }).join('');
  }

  // ── Manual Checklist Tab ────────────────────────────────────────
  function renderChecklist() {
    const container = document.getElementById('checklist-items');
    container.innerHTML = state.checklist.map(item => `
      <div class="checklist-card ${state.checkedItems.has(item.id) ? 'checked' : ''}" data-id="${item.id}">
        <div class="check-box">${state.checkedItems.has(item.id) ? '✔' : ''}</div>
        <div class="checklist-content">
          <h4>${item.title}</h4>
          <p>${item.desc}</p>
        </div>
      </div>`).join('');

    container.querySelectorAll('.checklist-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = parseInt(card.dataset.id, 10);
        if (state.checkedItems.has(id)) {
          state.checkedItems.delete(id);
          card.classList.remove('checked');
          card.querySelector('.check-box').textContent = '';
        } else {
          state.checkedItems.add(id);
          card.classList.add('checked');
          card.querySelector('.check-box').textContent = '✔';
        }
        updateChecklistProgress();
      });
    });

    updateChecklistProgress();
  }

  function updateChecklistProgress() {
    const count = state.checkedItems.size;
    const total = state.checklist.length;
    const pct = Math.round((count / total) * 100);
    document.getElementById('checklist-counter').textContent = `${count} / ${total} пройдено (${pct}%)`;
    document.getElementById('checklist-bar-fill').style.width = pct + '%';
  }

  // ── Export Report Tab ───────────────────────────────────────────
  function renderExportReport(report, filename) {
    let md = `# Отчет о готовности к Яндекс Играм (CheckYG)\n\n`;
    md += `**Файл:** ${filename || 'неизвестно'}\n`;
    md += `**Дата:** ${new Date().toLocaleString()}\n`;
    md += `**Статус:** ${report.summary.isReady ? '✅ ГОТОВА К МОДЕРАЦИИ' : '❌ ТРЕБУЕТСЯ ИСПРАВЛЕНИЕ ОШИБОК'}\n`;
    md += `**Readiness Score:** ${report.summary.score}%\n`;
    md += `**Авто-покрытие проверок:** ${report.summary.coverage}%\n`;
    md += `**Итого:** ${report.summary.pass} Pass | ${report.summary.fail} Fail | ${report.summary.warn} Warn | ${report.summary.notVerified} Not Verified\n\n`;
    md += `---\n\n`;

    report.categories.forEach(cat => {
      if (cat.isNA) { md += `### ${cat.icon} ${cat.category} (N/A)\n\n`; return; }
      md += `### ${cat.icon} ${cat.category}\n\n`;
      cat.checks.forEach(ch => {
        const mark = ch.status === 'pass' ? '[PASS]' : (ch.status === 'fail' ? '[FAIL]' : (ch.status === 'warn' ? '[WARN]' : '[N/V]'));
        md += `* **${mark} ${ch.name}**: ${ch.details || ch.desc}\n`;
      });
      md += '\n';
    });

    md += `\n---\n*Сгенерировано CheckYG Browser Edition · https://github.com/YOUR_USERNAME/checkyg*\n`;

    document.getElementById('export-preview').textContent = md;

    document.getElementById('btn-copy-report').onclick = () => {
      navigator.clipboard.writeText(md).then(() => alert('Отчет скопирован в буфер обмена!'));
    };
    document.getElementById('btn-download-report').onclick = () => {
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `yandex-games-audit-${Date.now()}.md`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    };
    document.getElementById('btn-print-report').onclick = () => window.print();
  }
});
