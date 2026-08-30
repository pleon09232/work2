(function () {
  const TERMINAL_RUN_STATUSES = new Set(['FAILED', 'TIMED-OUT', 'ABORTED']);
  const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  }

  function safeUrl(value) {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '#';
    } catch {
      return '#';
    }
  }

  async function readJson(response) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      window.location.href = `/login.html?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      throw new Error('Сессия истекла.');
    }
    if (!response.ok) throw new Error(data.error || `Ошибка сервера ${response.status}.`);
    return data;
  }

  const logoutForm = document.createElement('form');
  logoutForm.className = 'logout-chip';
  logoutForm.method = 'post';
  logoutForm.action = '/api/logout';
  logoutForm.innerHTML = '<button type="submit"><span aria-hidden="true">↪</span> Выйти</button>';
  document.body.appendChild(logoutForm);

  const menuButton = document.querySelector('.menu-toggle');
  const navigation = document.querySelector('.site-nav');
  if (menuButton && navigation) {
    menuButton.addEventListener('click', () => {
      const isOpen = navigation.classList.toggle('open');
      menuButton.setAttribute('aria-expanded', String(isOpen));
    });
  }

  document.querySelectorAll('[data-url-form]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = form.querySelector('input[name="url"]');
      if (input?.value.trim()) window.location.href = `/analyzer.html?url=${encodeURIComponent(input.value.trim())}`;
    });
  });

  let selectedDepth = 3;
  const depthButtons = document.querySelectorAll('[data-depth]');
  depthButtons.forEach((button) => {
    button.addEventListener('click', () => {
      depthButtons.forEach((item) => item.classList.remove('selected'));
      button.classList.add('selected');
      selectedDepth = Number(button.dataset.depth) || 3;
    });
  });

  const analysisForm = document.querySelector('#analysis-form');
  if (!analysisForm) return;

  const analysisInput = document.querySelector('#analysis-url');
  const progress = document.querySelector('#demo-progress');
  const progressBar = document.querySelector('#progress-bar');
  const progressPercent = document.querySelector('#progress-percent');
  const progressTitle = document.querySelector('#progress-title');
  const progressNote = document.querySelector('#progress-note');
  const resultSection = document.querySelector('#analysis-result');
  const errorSection = document.querySelector('#analysis-error');
  const errorText = document.querySelector('#analysis-error-text');
  const submitButton = analysisForm.querySelector('button[type="submit"]');

  const queryUrl = new URLSearchParams(window.location.search).get('url');
  if (queryUrl) analysisInput.value = queryUrl.replace(/^https?:\/\//i, '');

  function setProgress(percent, step, title, note) {
    progressBar.style.width = `${percent}%`;
    progressPercent.textContent = `${percent}%`;
    progressTitle.textContent = title;
    if (note) progressNote.textContent = note;
    progress.querySelectorAll('[data-step]').forEach((element) => element.classList.toggle('done', Number(element.dataset.step) <= step));
  }

  function showError(error) {
    progress.hidden = true;
    errorText.textContent = error.message || 'Произошла неизвестная ошибка.';
    errorSection.hidden = false;
    errorSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function scoreClass(score) {
    return score >= 75 ? 'score-good' : score >= 50 ? 'score-warn' : 'score-bad';
  }

  function renderRecommendations(items) {
    if (!items?.length) return '<p class="empty-note">Рекомендаций нет.</p>';
    return `<div class="recommendation-list">${items.map((item) => {
      const link = safeUrl(item.evidenceUrl);
      return `<article><span class="priority ${escapeHtml(item.priority)}">${item.priority === 'high' ? 'Высокий' : item.priority === 'medium' ? 'Средний' : 'Низкий'}</span><div><h5>${escapeHtml(item.title)}</h5><p>${escapeHtml(item.details)}</p>${link !== '#' ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">Страница-основание ↗</a>` : ''}</div></article>`;
    }).join('')}</div>`;
  }

  function renderAuditSection(section, includeTopics, sectionName) {
    const topics = includeTopics && section.topics?.length ? `<div class="topic-list">${section.topics.map((topic) => `<span>${escapeHtml(topic)}</span>`).join('')}</div>` : '';
    return `<div class="audit-hero"><div class="mini-score ${scoreClass(section.score)}"><strong>${section.score}</strong><span>/100</span></div><div><span class="aside-label">${escapeHtml(sectionName)}</span><h3>${escapeHtml(section.verdict)}</h3></div></div>${topics}<div class="audit-columns"><article><h4>Что уже хорошо</h4><ul class="check-list">${(section.strengths || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></article><article><h4>Что мешает</h4><ul class="issue-list">${(section.weaknesses || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></article></div><h4 class="recommendation-title">Рекомендации</h4>${renderRecommendations(section.recommendations)}`;
  }

  function renderActionPlan(analysis) {
    const sectionNames = { structure: 'Структура', content: 'Контент', seo: 'SEO' };
    const rank = { high: 0, medium: 1, low: 2 };
    const recommendations = Object.entries(sectionNames)
      .flatMap(([key, sectionName]) => (analysis[key]?.recommendations || []).map((item) => ({ ...item, sectionName })))
      .sort((a, b) => (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3))
      .slice(0, 8);

    document.querySelector('#plan-count').textContent = `${recommendations.length} шагов`;
    document.querySelector('#action-plan').innerHTML = recommendations.map((item, index) => {
      const link = safeUrl(item.evidenceUrl);
      return `<article><span class="action-number">${String(index + 1).padStart(2, '0')}</span><div><div class="action-meta"><span class="priority ${escapeHtml(item.priority)}">${item.priority === 'high' ? 'Сначала' : item.priority === 'medium' ? 'Затем' : 'После'}</span><span>${escapeHtml(item.sectionName)}</span></div><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.details)}</p>${link !== '#' ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">Открыть связанную страницу ↗</a>` : ''}</div></article>`;
    }).join('');
  }

  function renderTreeNode(node, isRoot = false) {
    if (!node) return '';
    const children = Array.isArray(node.children) ? node.children : [];
    const title = escapeHtml(node.title || node.path || node.url);
    const path = escapeHtml(node.path || '/');
    const url = escapeHtml(safeUrl(node.url));
    if (!children.length && !isRoot) return `<a class="tree-single" href="${url}" target="_blank" rel="noopener noreferrer"><i class="page-icon"></i><span><strong>${title}</strong><small>${path}</small></span></a>`;
    return `<details ${isRoot ? 'open' : ''}><summary><i class="folder-icon"></i><span><strong>${title}</strong><small>${path}</small></span><b>${children.length}</b></summary><div class="tree-children">${children.map((child) => renderTreeNode(child)).join('')}</div></details>`;
  }

  function renderResult(data) {
    const analysis = data.analysis;
    const identity = analysis.identity;
    document.querySelector('#result-title').textContent = identity.title || new URL(data.siteUrl).hostname;
    document.querySelector('#result-summary').textContent = identity.summary;
    const sourceLink = document.querySelector('#source-link');
    sourceLink.href = safeUrl(data.siteUrl);

    const stats = [[data.facts.pages, 'страниц'], [data.facts.maxDepth, 'уровней'], [data.facts.thinPages, 'коротких страниц'], [analysis.conclusion.overallScore, 'оценка из 100']];
    document.querySelector('#audit-stats').innerHTML = stats.map(([value, label]) => `<article><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></article>`).join('');

    document.querySelector('#identity-purpose').textContent = identity.purpose || identity.summary;
    document.querySelector('#identity-audience').textContent = identity.audience;
    document.querySelector('#identity-meta').innerHTML = `<div><dt>Тип</dt><dd>${escapeHtml(identity.businessType)}</dd></div><div><dt>Язык</dt><dd>${escapeHtml(identity.language)}</dd></div><div><dt>Объём</dt><dd>${data.facts.totalWords.toLocaleString('ru-RU')} слов</dd></div>`;

    const overallScore = document.querySelector('#overall-score');
    overallScore.className = `score-ring ${scoreClass(analysis.conclusion.overallScore)}`;
    overallScore.querySelector('strong').textContent = analysis.conclusion.overallScore;
    document.querySelector('#overall-verdict').textContent = analysis.conclusion.verdict;
    document.querySelector('#top-priorities').innerHTML = analysis.conclusion.topPriorities.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
    document.querySelector('#analysis-limitations').innerHTML = `<strong>Границы отчёта</strong><ul>${analysis.conclusion.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;

    document.querySelector('#tree-caption').textContent = `${data.facts.pages} страниц · глубина ${data.facts.maxDepth}`;
    document.querySelector('#site-tree').innerHTML = renderTreeNode(data.tree, true);
    document.querySelector('#structure-audit').innerHTML = renderAuditSection(analysis.structure, false, 'Структура');
    document.querySelector('#content-audit').innerHTML = renderAuditSection(analysis.content, true, 'Контент');
    document.querySelector('#seo-audit').innerHTML = renderAuditSection(analysis.seo, false, 'SEO');
    renderActionPlan(analysis);
    document.querySelector('#report-notice').textContent = data.notice;
  }

  async function pollRun(runId) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const response = await fetch(`/api/analyze/status?runId=${encodeURIComponent(runId)}`, { cache: 'no-store' });
      const status = await readJson(response);
      if (status.status === 'SUCCEEDED') return status;
      if (TERMINAL_RUN_STATUSES.has(status.status)) throw new Error('Не удалось обработать страницы этого сайта. Проверьте адрес или попробуйте другой сайт.');
      const percent = Math.min(68, 22 + attempt * 2);
      setProgress(percent, 2, 'Изучаем страницы', 'Находим важные разделы, тексты и связи между страницами.');
      await sleep(3000);
    }
    throw new Error('Анализ занял больше обычного. Попробуйте запустить его ещё раз немного позже.');
  }

  analysisForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const rawUrl = analysisInput.value.trim();
    if (!rawUrl) return;

    submitButton.disabled = true;
    submitButton.querySelector('span').textContent = 'Анализируем…';
    errorSection.hidden = true;
    resultSection.hidden = true;
    progress.hidden = false;
    const waitingDomain = document.querySelector('#waiting-domain');
    if (waitingDomain) waitingDomain.textContent = rawUrl.replace(/^https?:\/\//i, '').split('/')[0].slice(0, 24);
    setProgress(8, 1, 'Проверяем адрес', 'Убеждаемся, что сайт доступен для анализа.');
    progress.scrollIntoView({ behavior: 'smooth', block: 'center' });

    try {
      const start = await readJson(await fetch('/api/analyze/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: rawUrl, depth: selectedDepth }),
      }));
      setProgress(22, 2, 'Изучаем сайт', 'Находим страницы и собираем материал для отчёта.');
      await pollRun(start.runId);

      setProgress(76, 3, 'Готовим выводы', 'Сопоставляем наблюдения и выбираем самые полезные рекомендации.');
      const result = await readJson(await fetch('/api/analyze/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: start.runId, url: start.url }),
      }));

      setProgress(96, 4, 'Собираем отчёт', 'Оформляем результаты в удобном для чтения виде.');
      renderResult(result);
      setProgress(100, 4, 'Готово', 'Отчёт сформирован.');
      await sleep(350);
      progress.hidden = true;
      resultSection.hidden = false;
      resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      showError(error);
    } finally {
      submitButton.disabled = false;
      submitButton.querySelector('span').textContent = 'Начать анализ';
    }
  });

  document.querySelector('#retry-analysis').addEventListener('click', () => {
    errorSection.hidden = true;
    analysisForm.requestSubmit();
  });
  document.querySelector('#reset-analysis').addEventListener('click', () => {
    resultSection.hidden = true;
    analysisForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    analysisInput.focus();
  });

  document.querySelectorAll('[data-report-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-report-tab]').forEach((item) => {
        const active = item === tab;
        item.classList.toggle('active', active);
        item.setAttribute('aria-selected', String(active));
      });
      document.querySelectorAll('[data-report-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.reportPanel === tab.dataset.reportTab));
    });
  });
})();
