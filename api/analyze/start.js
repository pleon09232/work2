import { startCrawl } from '../../lib/apify.js';
import { normalizePublicUrl } from '../../lib/analysis.js';
import { requireSession } from '../../lib/server-auth.js';

const ALLOWED_DEPTHS = new Set([1, 3, 5]);

export default async function handler(request, response) {
  if (!requireSession(request, response)) return;
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Используйте POST-запрос.' });
  }

  try {
    const url = normalizePublicUrl(request.body?.url);
    const requestedDepth = Number(request.body?.depth);
    const depth = ALLOWED_DEPTHS.has(requestedDepth) ? requestedDepth : 3;
    const run = await startCrawl(url, depth);
    return response.status(202).json({
      ok: true,
      runId: run.id,
      datasetId: run.defaultDatasetId,
      status: run.status,
      url,
      depth,
    });
  } catch (error) {
    const isInputError = /URL|адрес|IP|HTTP|Локальные/i.test(error.message);
    if (!isInputError) console.error('Analysis start failed:', error);
    return response.status(isInputError ? 400 : 502).json({ error: isInputError ? error.message : 'Не удалось начать анализ. Попробуйте ещё раз через несколько минут.' });
  }
}
