import { analysisResponseFormat, buildAnalysisPrompt } from './analysis.js';

const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions';

function unwrapContent(value) {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((part) => (typeof part === 'string' ? part : part?.text || part?.content || ''))
      .join('')
      .trim();
  }
  return '';
}

function parseAnalysis(data) {
  const message = data?.choices?.[0]?.message;
  const parsed = message?.parsed;
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  if (message?.content && typeof message.content === 'object' && !Array.isArray(message.content)) return message.content;

  const content = unwrapContent(message?.content) || unwrapContent(data?.choices?.[0]?.text);
  if (!content) return null;

  const withoutFence = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(withoutFence);
  } catch {
    const start = withoutFence.indexOf('{');
    const end = withoutFence.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(withoutFence.slice(start, end + 1));
    throw new Error('Не удалось разобрать структурированный ответ модели.');
  }
}

async function requestAnalysis(apiKey, body) {
  const response = await fetch(OPENROUTER_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.PUBLIC_SITE_URL || 'https://work2-six-gules.vercel.app',
      'X-Title': 'SiteScope',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `OpenRouter вернул ошибку ${response.status}.`);
  return data;
}

export async function analyzeWebsite(crawl, requestedUrl) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY не настроен.');

  const model = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-v4-flash-0731';
  const baseBody = {
    model,
    temperature: 0.2,
    max_tokens: 8000,
    reasoning: { effort: 'none', exclude: true },
    plugins: [{ id: 'response-healing' }],
    response_format: analysisResponseFormat,
    messages: [
      {
        role: 'system',
        content: 'Ты аудитор сайтов. Отвечай по-русски, кратко и конкретно. Анализируй только переданные данные краулера. Нельзя утверждать наличие или отсутствие битых ссылок, hreflang, robots.txt, sitemap, микроразметки, мобильной адаптации, скорости, Core Web Vitals, поисковых позиций или конверсии: этих данных нет. Не называй поисковые алгоритмы и санкции. SEO-оценка предварительная и основана только на URL, метаданных, структуре и тексте страниц. Все поля score — проценты качества от 0 до 100, не шкала 1–10; оценка ниже 10 допустима только для практически неработоспособного сайта. Для evidenceUrl используй URL из входных данных либо пустую строку. В каждом списке достаточно 3–5 самых значимых пунктов.',
      },
      {
        role: 'user',
        content: `Проведи полный аудит структуры, контента и предварительной SEO-привлекательности сайта. Данные краулера:\n${buildAnalysisPrompt(crawl, requestedUrl)}`,
      },
    ],
  };

  let lastData = null;
  for (const sort of ['throughput', 'latency']) {
    const data = await requestAnalysis(apiKey, {
      ...baseBody,
      provider: { require_parameters: true, sort, allow_fallbacks: true },
    });
    lastData = data;
    try {
      const analysis = parseAnalysis(data);
      if (analysis) return { analysis, usage: data.usage || null, model: data.model || model };
    } catch (error) {
      if (sort === 'latency') throw error;
    }
  }

  const finishReason = lastData?.choices?.[0]?.finish_reason;
  throw new Error(`Модель не вернула итоговый JSON${finishReason ? ` (причина: ${finishReason})` : ''}.`);
}
