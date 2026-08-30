import { getCrawlRun } from '../../lib/apify.js';
import { requireSession } from '../../lib/server-auth.js';

const RUN_ID_PATTERN = /^[a-zA-Z0-9_-]{8,64}$/;

export default async function handler(request, response) {
  if (!requireSession(request, response)) return;
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Используйте GET-запрос.' });
  }

  const runId = typeof request.query?.runId === 'string' ? request.query.runId : '';
  if (!RUN_ID_PATTERN.test(runId)) return response.status(400).json({ error: 'Некорректный идентификатор запуска.' });

  try {
    const run = await getCrawlRun(runId);
    return response.status(200).json({
      ok: true,
      status: run.status,
      datasetId: run.defaultDatasetId,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
    });
  } catch (error) {
    console.error('Analysis status failed:', error);
    return response.status(502).json({ error: 'Не удалось продолжить анализ. Попробуйте ещё раз через несколько минут.' });
  }
}
