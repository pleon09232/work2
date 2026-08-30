import { isIP } from 'node:net';

const MAX_MARKDOWN_PER_PAGE = 5000;
const MAX_TOTAL_MARKDOWN = 120000;

function isPrivateIpv4(hostname) {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 0
    || parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || parts[0] >= 224;
}

function isPrivateIpv6(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb');
}

export function normalizePublicUrl(input) {
  const value = typeof input === 'string' ? input.trim() : '';
  if (!value || value.length > 2048) throw new Error('Введите корректный адрес сайта.');
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && !/^https?:\/\//i.test(value)) {
    throw new Error('Разрешены только публичные HTTP и HTTPS адреса.');
  }

  let url;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    throw new Error('Не удалось распознать URL сайта.');
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Разрешены только публичные HTTP и HTTPS адреса.');
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Локальные и служебные адреса сканировать нельзя.');
  }

  const ipVersion = isIP(hostname.replace(/^\[|\]$/g, ''));
  if ((ipVersion === 4 && isPrivateIpv4(hostname)) || (ipVersion === 6 && isPrivateIpv6(hostname))) {
    throw new Error('Частные IP-адреса сканировать нельзя.');
  }

  url.hash = '';
  return url.toString();
}

function cleanText(value, maxLength = 500) {
  return typeof value === 'string' ? value.replace(/\0/g, '').trim().slice(0, maxLength) : '';
}

function normalizeComparableUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    url.searchParams.sort();
    const result = url.toString();
    return result.endsWith('/') && url.pathname !== '/' ? result.slice(0, -1) : result;
  } catch {
    return '';
  }
}

export function prepareCrawl(items, requestedUrl) {
  const seen = new Set();
  const pages = [];
  let totalMarkdown = 0;

  for (const item of Array.isArray(items) ? items : []) {
    const url = normalizeComparableUrl(item?.url || item?.crawl?.loadedUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const rawMarkdown = cleanText(item?.markdown || item?.text || '', MAX_MARKDOWN_PER_PAGE);
    const remaining = Math.max(0, MAX_TOTAL_MARKDOWN - totalMarkdown);
    const markdown = rawMarkdown.slice(0, remaining);
    totalMarkdown += markdown.length;

    const extractedTitle = cleanText(item?.metadata?.title || item?.title || '', 240);
    pages.push({
      url,
      path: new URL(url).pathname || '/',
      title: extractedTitle || new URL(url).pathname || 'Без названия',
      hasTitle: Boolean(extractedTitle),
      description: cleanText(item?.metadata?.description || item?.description || '', 500),
      parentUrl: normalizeComparableUrl(item?.crawl?.referrerUrl || ''),
      depth: Number.isInteger(item?.crawl?.depth) ? item.crawl.depth : Number.isInteger(item?.depth) ? item.depth : 0,
      markdown,
      wordCount: markdown ? markdown.split(/\s+/u).filter(Boolean).length : 0,
      language: cleanText(item?.metadata?.languageCode || item?.language || '', 20),
    });
  }

  pages.sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path, 'ru'));
  const requested = normalizeComparableUrl(requestedUrl);
  const pageMap = new Map(pages.map((page) => [page.url, page]));
  const rootPage = pageMap.get(requested) || pages.find((page) => page.depth === 0) || pages[0];
  const nodes = new Map(pages.map((page) => [page.url, { ...page, markdown: undefined, children: [] }]));

  for (const page of pages) {
    if (!rootPage || page.url === rootPage.url) continue;
    const parentPage = page.parentUrl && pageMap.get(page.parentUrl);
    let parent = parentPage && parentPage.depth < page.depth ? nodes.get(page.parentUrl) : null;
    if (!parent || parent.url === page.url) {
      parent = pages
        .filter((candidate) => candidate.url !== page.url && page.url.startsWith(`${candidate.url.replace(/\/$/, '')}/`))
        .sort((a, b) => b.url.length - a.url.length)
        .map((candidate) => nodes.get(candidate.url))[0];
    }
    (parent || nodes.get(rootPage.url))?.children.push(nodes.get(page.url));
  }

  const tree = rootPage ? nodes.get(rootPage.url) : null;
  const sectionNames = new Set(pages.map((page) => page.path.split('/').filter(Boolean)[0]).filter(Boolean));
  const titles = pages.map((page) => page.title.toLowerCase()).filter(Boolean);
  const descriptions = pages.map((page) => page.description.toLowerCase()).filter(Boolean);
  const duplicateCount = (values) => values.length - new Set(values).size;

  return {
    pages,
    tree,
    facts: {
      pages: pages.length,
      sections: sectionNames.size,
      maxDepth: pages.reduce((max, page) => Math.max(max, page.depth), 0),
      pagesWithTitle: pages.filter((page) => page.hasTitle).length,
      pagesWithDescription: pages.filter((page) => page.description).length,
      duplicateTitles: duplicateCount(titles),
      duplicateDescriptions: duplicateCount(descriptions),
      thinPages: pages.filter((page) => page.wordCount < 150).length,
      totalWords: pages.reduce((sum, page) => sum + page.wordCount, 0),
    },
  };
}

const stringArray = { type: 'array', items: { type: 'string' }, maxItems: 5 };
const recommendationArray = {
  type: 'array',
  maxItems: 5,
  items: {
    type: 'object',
    properties: {
      priority: { type: 'string', enum: ['high', 'medium', 'low'] },
      title: { type: 'string' },
      details: { type: 'string' },
      evidenceUrl: { type: 'string' },
    },
    required: ['priority', 'title', 'details', 'evidenceUrl'],
    additionalProperties: false,
  },
};

const auditSection = {
  type: 'object',
  properties: {
    score: { type: 'integer', minimum: 0, maximum: 100, description: 'Оценка качества: 0 — крайне плохо, 100 — отлично.' },
    verdict: { type: 'string' },
    strengths: stringArray,
    weaknesses: stringArray,
    recommendations: recommendationArray,
  },
  required: ['score', 'verdict', 'strengths', 'weaknesses', 'recommendations'],
  additionalProperties: false,
};

export const analysisResponseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'website_audit',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        identity: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Краткое фактическое название сайта, компании или проекта по содержимому страниц. Не название отчёта.' },
            purpose: { type: 'string' },
            audience: { type: 'string' },
            businessType: { type: 'string' },
            language: { type: 'string' },
            summary: { type: 'string' },
          },
          required: ['title', 'purpose', 'audience', 'businessType', 'language', 'summary'],
          additionalProperties: false,
        },
        structure: auditSection,
        content: {
          ...auditSection,
          properties: { ...auditSection.properties, topics: stringArray },
          required: [...auditSection.required, 'topics'],
        },
        seo: auditSection,
        conclusion: {
          type: 'object',
          properties: {
            overallScore: { type: 'integer', minimum: 0, maximum: 100, description: 'Итоговая оценка качества сайта: 0 — крайне плохо, 100 — отлично.' },
            verdict: { type: 'string' },
            topPriorities: stringArray,
            limitations: stringArray,
          },
          required: ['overallScore', 'verdict', 'topPriorities', 'limitations'],
          additionalProperties: false,
        },
      },
      required: ['identity', 'structure', 'content', 'seo', 'conclusion'],
      additionalProperties: false,
    },
  },
};

export function buildAnalysisPrompt(crawl, requestedUrl) {
  const pages = crawl.pages.map(({ url, title, hasTitle, description, parentUrl, depth, wordCount, language, markdown }) => ({
    url,
    title,
    hasTitle,
    description,
    parentUrl,
    depth,
    wordCount,
    language,
    content: markdown,
  }));

  return JSON.stringify({ requestedUrl, crawlFacts: crawl.facts, pages });
}

function normalizePercentage(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  if (score > 0 && score <= 10) return Math.round(score * 10);
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function normalizeAnalysisOutput(analysis, fallbackTitle) {
  if (!analysis || typeof analysis !== 'object') return analysis;
  if (/(аудит|анализ).*сайт/iu.test(analysis.identity?.title || '')) analysis.identity.title = fallbackTitle;
  for (const key of ['structure', 'content', 'seo']) {
    if (analysis[key]) analysis[key].score = normalizePercentage(analysis[key].score);
  }
  if (analysis.conclusion) analysis.conclusion.overallScore = normalizePercentage(analysis.conclusion.overallScore);
  return analysis;
}
