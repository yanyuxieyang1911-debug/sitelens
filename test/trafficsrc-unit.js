'use strict';
// trafficsrc 与 autoseo SW 装配的单测（零网络，用 fixture）
const assert = require('assert');
const TS = require('../lib/trafficsrc');
const { buildAutoSeo } = require('../lib/autoseo');

// 1) parseSimilarWeb 解析
const fixture = {
  engagements: { monthlyVisits: 1234567 },
  top_country_shares: [
    { country: 'United States', code: 'US', share: 0.35 },
    { country: 'India', code: 'IN', share: 0.2 },
    { country: 'United Kingdom', code: 'GB', share: 0.1 },
  ],
  top_keywords: [
    { name: 'buy red shoes', estimated_monthly_visits: 12000, share: 0.05 },
    { name: 'red shoes wholesale', estimated_monthly_visits: 8000, share: 0.03 },
    { name: 'red shoes', estimated_monthly_visits: 45000, share: 0.2 },
  ],
};
const p = TS.parseSimilarWeb(fixture);
assert.strictEqual(p.available, true);
assert.strictEqual(p.monthlyVisits, 1234567);
assert.strictEqual(p.countryShares.length, 3);
assert.strictEqual(p.countryShares[0].country, 'United States');
assert.strictEqual(p.countryShares[0].share, 0.35);
assert.strictEqual(p.topKeywords.length, 3);
assert.strictEqual(p.topKeywords[0].term, 'buy red shoes');
console.log('✓ parseSimilarWeb');

// 2) matchKeywordVolume
const detected = [{ term: 'red shoes' }, { term: 'buy red shoes' }, { term: 'blue hats' }];
const vol = TS.matchKeywordVolume(detected, p.topKeywords);
assert.strictEqual(vol.get(TS.normalizeTerm('red shoes')), 45000);
assert.strictEqual(vol.get(TS.normalizeTerm('buy red shoes')), 12000);
assert.strictEqual(vol.has(TS.normalizeTerm('blue hats')), false);
console.log('✓ matchKeywordVolume');

// 3) buildAutoSeo 装配 SW 数据
const mockResult = {
  domain: 'example.com',
  traffic: { rank: 168, sw: p },
  seo: { internalHrefs: ['https://example.com/about', 'https://example.com/privacy'], externalHrefs: [], jsonLd: { count: 0, types: [] }, socialHosts: [], hreflangs: [], og: {}, images: { total: 0, missingAlt: 0, lazy: 0 }, mixedContentCount: 0, links: {} },
  pages: [
    {
      url: 'https://example.com/', title: 'Red Shoes - Buy Online', h1: ['Red Shoes'], description: 'Buy red shoes wholesale', keywords: [{ term: 'red shoes', score: 30, freq: 5, sources: ['title', 'h1'] }, { term: 'buy red shoes', score: 12, freq: 2, sources: ['description'] }], wordCount: { total: 500 },
    },
  ],
  dataSources: [],
};
const a = buildAutoSeo(mockResult);
assert.strictEqual(a.enabled, true);
const top = a.keyword.topKeywords.find((k) => k.term === 'red shoes');
assert.ok(top, '应有 red shoes');
assert.strictEqual(top.monthlyVisits, 45000);
assert.strictEqual(a.keyword.swAvailable, true);
assert.strictEqual(a.keyword.countryShares.length, 3);
assert.strictEqual(a.keyword.swKeywords.length, 3);
assert.strictEqual(a.keyword.swMonthlyVisits, 1234567);
assert.strictEqual(a.layers.traffic.estimatedVisits.value, 1234567);
console.log('✓ buildAutoSeo SW 装配');

// 4) SW 不可用时优雅降级
const a2 = buildAutoSeo(Object.assign({}, mockResult, { traffic: { rank: 168, sw: { available: false, reason: 'HTTP 403', countryShares: [], topKeywords: [] } } }));
assert.strictEqual(a2.keyword.swAvailable, false);
assert.strictEqual(a2.keyword.swSource, 'HTTP 403');
assert.strictEqual(a2.layers.traffic.estimatedVisits.value, null);
console.log('✓ 降级（不可用时）');

console.log('\n全部 trafficsrc/autoseo-SW 单测通过 ✅');
