import { analysisResponseFormat, buildAnalysisPrompt } from './analysis.js';

const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions';

export async function analyzeWebsite(crawl, requestedUrl) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY не настроен.');

  const model = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-v4-flash-0731';
  const response = await fetch(OPENROUTER_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.PUBLIC_SITE_URL || 'https://work2-six-gules.vercel.app',
      'X-Title': 'SiteScope',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 6000,
      provider: { require_parameters: true, sort: 'throughput', allow_fallbacks: true },
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
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `OpenRouter вернул ошибку ${response.status}.`);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('Модель не вернула результат анализа.');

  try {
    return { analysis: JSON.parse(content), usage: data.usage || null, model: data.model || model };
  } catch {
    throw new Error('Не удалось разобрать структурированный ответ модели.');
  }
}
