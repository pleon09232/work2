const APIFY_API = 'https://api.apify.com/v2';

function getToken() {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error('APIFY_API_TOKEN не настроен.');
  return token;
}

async function apifyFetch(path, options = {}) {
  const response = await fetch(`${APIFY_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Apify вернул ошибку ${response.status}.`;
    throw new Error(message);
  }
  return data?.data ?? data;
}

export async function startCrawl(url, depth) {
  return apifyFetch('/acts/apify~website-content-crawler/runs', {
    method: 'POST',
    body: JSON.stringify({
      startUrls: [{ url }],
      crawlerType: 'cheerio',
      maxCrawlDepth: depth,
      maxCrawlPages: 50,
      maxResults: 50,
      useSitemaps: false,
      respectRobotsTxtFile: true,
      proxyConfiguration: { useApifyProxy: true },
      saveMarkdown: true,
      saveHtml: false,
      saveHtmlAsFile: false,
      saveScreenshots: false,
      summarize: false,
      maxConcurrency: 10,
    }),
  });
}

export function getCrawlRun(runId) {
  return apifyFetch(`/actor-runs/${encodeURIComponent(runId)}`);
}

export async function getCrawlItems(datasetId) {
  const data = await apifyFetch(`/datasets/${encodeURIComponent(datasetId)}/items?clean=true&format=json&limit=50`, {
    headers: { 'Content-Type': 'application/json' },
  });
  return Array.isArray(data) ? data : [];
}
