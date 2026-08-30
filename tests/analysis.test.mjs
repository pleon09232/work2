import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAnalysisPrompt, normalizeAnalysisOutput, normalizePublicUrl, prepareCrawl } from '../lib/analysis.js';

test('normalizes public website addresses', () => {
  assert.equal(normalizePublicUrl('example.com'), 'https://example.com/');
  assert.equal(normalizePublicUrl('http://example.com/path#part'), 'http://example.com/path');
});

test('rejects local and private addresses', () => {
  assert.throws(() => normalizePublicUrl('localhost:3000'), /Локальные/);
  assert.throws(() => normalizePublicUrl('http://127.0.0.1'), /IP/);
  assert.throws(() => normalizePublicUrl('http://192.168.1.2'), /IP/);
  assert.throws(() => normalizePublicUrl('file:///tmp/report'), /HTTP/);
});

test('prepares facts and a crawl tree from Apify records', () => {
  const crawl = prepareCrawl([
    {
      url: 'https://example.com/',
      crawl: { depth: 0, referrerUrl: '' },
      metadata: { title: 'Главная', description: 'Описание' },
      markdown: '# Главная\n' + 'слово '.repeat(200),
    },
    {
      url: 'https://example.com/catalog',
      crawl: { depth: 1, referrerUrl: 'https://example.com/' },
      metadata: { title: 'Каталог' },
      markdown: '# Каталог',
    },
    {
      url: 'https://example.com/catalog/item',
      crawl: { depth: 2, referrerUrl: 'https://example.com/catalog' },
      metadata: { title: 'Товар' },
      markdown: '# Товар',
    },
  ], 'https://example.com/');

  assert.equal(crawl.facts.pages, 3);
  assert.equal(crawl.facts.maxDepth, 2);
  assert.equal(crawl.facts.pagesWithDescription, 1);
  assert.equal(crawl.tree.children[0].children[0].title, 'Товар');
  assert.doesNotMatch(buildAnalysisPrompt(crawl, 'https://example.com/'), /children/);
});

test('normalizes model titles and accidental ten-point scores', () => {
  const analysis = {
    identity: { title: 'Аудит сайта example.com' },
    structure: { score: 7 },
    content: { score: 65 },
    seo: { score: 4 },
    conclusion: { overallScore: 6 },
  };
  normalizeAnalysisOutput(analysis, 'Example Company');
  assert.equal(analysis.identity.title, 'Example Company');
  assert.equal(analysis.structure.score, 70);
  assert.equal(analysis.content.score, 65);
  assert.equal(analysis.seo.score, 40);
  assert.equal(analysis.conclusion.overallScore, 60);
  assert.ok(analysis.identity.purpose);
  assert.equal(analysis.structure.recommendations.length, 2);
  assert.equal(analysis.content.recommendations.length, 2);
  assert.equal(analysis.seo.recommendations.length, 2);
  assert.ok(analysis.conclusion.topPriorities.length >= 2);
});
