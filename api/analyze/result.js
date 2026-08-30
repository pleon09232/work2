import { getCrawlItems, getCrawlRun } from '../../lib/apify.js';
import { normalizeAnalysisOutput, normalizePublicUrl, prepareCrawl } from '../../lib/analysis.js';
import { analyzeWebsite } from '../../lib/openrouter.js';
import { requireSession } from '../../lib/server-auth.js';

const RUN_ID_PATTERN = /^[a-zA-Z0-9_-]{8,64}$/;

export const config = { maxDuration: 300 };

export default async function handler(request, response) {
  if (!requireSession(request, response)) return;
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Используйте POST-запрос.' });
  }

  const runId = typeof request.body?.runId === 'string' ? request.body.runId : '';
  if (!RUN_ID_PATTERN.test(runId)) return response.status(400).json({ error: 'Некорректный идентификатор запуска.' });

  try {
    const requestedUrl = normalizePublicUrl(request.body?.url);
    const run = await getCrawlRun(runId);
    if (run.status !== 'SUCCEEDED') return response.status(409).json({ error: 'Сбор страниц ещё не завершён.' });

    const items = await getCrawlItems(run.defaultDatasetId);
    const crawl = prepareCrawl(items, requestedUrl);
    if (!crawl.pages.length) return response.status(422).json({ error: 'Не удалось найти доступные страницы сайта.' });

    const llm = await analyzeWebsite(crawl, requestedUrl);
    normalizeAnalysisOutput(llm.analysis, crawl.pages[0]?.title || new URL(requestedUrl).hostname, crawl.facts, crawl.pages);
    return response.status(200).json({
      ok: true,
      siteUrl: requestedUrl,
      collectedAt: run.finishedAt || new Date().toISOString(),
      facts: crawl.facts,
      tree: crawl.tree,
      pages: crawl.pages.map(({ markdown, ...page }) => page),
      analysis: llm.analysis,
      model: llm.model,
      usage: llm.usage,
      notice: 'SEO-аудит предварительный: краулер не измеряет Core Web Vitals, позиции в поиске и серверную производительность.',
    });
  } catch (error) {
    console.error('Analysis result failed:', error);
    return response.status(502).json({ error: 'Не удалось подготовить итоговый отчёт. Попробуйте запустить анализ ещё раз.' });
  }
}
