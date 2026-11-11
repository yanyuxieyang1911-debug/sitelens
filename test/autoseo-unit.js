'use strict';
/**
 * test/autoseo-unit.js — 自动 SEO 模块纯函数单测（零网络）
 * 运行：node test/autoseo-unit.js
 */
const assert = require('assert');
const KW = require('../lib/keywords');
const { buildAutoSeo } = require('../lib/autoseo');
const { parseHtml } = require('../lib/seo');

function makeEntry(html, url) {
  const kw = KW.extractKeywords(html, url);
  const seo = parseHtml(html, url, 'example.com');
  return {
    url,
    status: 200,
    title: kw.title,
    h1: kw.h1,
    h2: kw.h2,
    description: kw.description,
    keywords: kw.terms,
    wordCount: seo.wordCount,
    isHttps: url.startsWith('https:'),
  };
}

const HOME_HTML = `<!DOCTYPE html><html lang="en"><head>
<title>Wholesale Yoga Mats Manufacturer | Buy Yoga Mats</title>
<meta name="description" content="Yoga mats wholesale manufacturer. Buy yoga mats direct from factory.">
<link rel="canonical" href="https://example.com/">
</head><body>
<h1>Yoga Mats</h1>
<h2>Best Yoga Mats</h2>
<a href="/about">About</a><a href="/contact">Contact</a><a href="/blog">Blog</a><a href="/faq">FAQ</a>
<a href="https://facebook.com/x">fb</a>
<p>We are a yoga mats manufacturer offering wholesale yoga mats. Our yoga mats are high quality. Buy yoga mats from our factory. Yoga mats price is competitive. Yoga mats for studios. Yoga mats for home. Yoga mats wholesale. Yoga mats manufacturer. Yoga mats supplier. Yoga mats factory. Yoga mats quote. Yoga mats catalog. Yoga mats OEM. Yoga mats custom. Yoga mats private label. Yoga mats bulk. Yoga mats shipping. Yoga mats warranty.</p>
</body></html>`;

const PRODUCT_HTML = `<!DOCTYPE html><html lang="en"><head>
<title>Yoga Mats Price | Yoga Mats Wholesale</title>
<meta name="description" content="Yoga mats price list and wholesale yoga mats quotation.">
</head><body>
<h1>Yoga Mats</h1>
<h2>Yoga Mats Price</h2>
<p>Yoga mats price starts from factory. Wholesale yoga mats available. Yoga mats manufacturer quotes. Yoga mats supplier. Yoga mats factory. Yoga mats wholesale. Yoga mats bulk. Yoga mats OEM. Yoga mats custom. Yoga mats private label. Yoga mats catalog. Yoga mats shipping. Yoga mats warranty. Yoga mats quality. Yoga mats material. Yoga mats thickness. Yoga mats color. Yoga mats MOQ.</p>
</body></html>`;

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (e) {
    console.error('  ✗ ' + name + ' — ' + e.message);
    process.exitCode = 1;
  }
}

console.log('keywords.extractKeywords');
check('首页抽取到 yoga mats 关键词', () => {
  const kw = KW.extractKeywords(HOME_HTML, 'https://example.com/');
  const hit = kw.terms.find((t) => t.term === 'yoga mats');
  assert.ok(hit, '应包含 yoga mats');
  assert.ok(hit.score >= 6, '应为高权重词，实际 ' + hit.score);
});

check('意图分类：buy/price → 交易型', () => {
  assert.strictEqual(KW.classifyIntent('buy yoga mats').intent, 'transactional');
  assert.strictEqual(KW.classifyIntent('yoga mats price').intent, 'transactional');
});
check('意图分类：how to → 信息型', () => {
  assert.strictEqual(KW.classifyIntent('how to choose yoga mats').intent, 'informational');
});
check('意图分类：vs → 对比型', () => {
  assert.strictEqual(KW.classifyIntent('yoga mats vs competitor').intent, 'comparison');
});

check('词类：疑问词 → 问答词', () => {
  assert.strictEqual(KW.categorize('how to choose yoga mats', 'example'), 'question');
});
check('词类：短词 → 核心词', () => {
  assert.strictEqual(KW.categorize('yoga mats', 'example'), 'core');
});

console.log('keywords.detectCannibalization');
check('同词多页重点优化被识别为抢词', () => {
  const pages = [makeEntry(HOME_HTML, 'https://example.com/'), makeEntry(PRODUCT_HTML, 'https://example.com/product')];
  const map = KW.buildKeywordMap(pages);
  const issues = KW.detectCannibalization(map);
  assert.ok(issues.length > 0, '应检测到抢词');
  assert.ok(issues.some((i) => i.term === 'yoga mats'), 'yoga mats 应被标记');
});
check('单页无抢词', () => {
  const pages = [makeEntry(HOME_HTML, 'https://example.com/')];
  const map = KW.buildKeywordMap(pages);
  assert.strictEqual(KW.detectCannibalization(map).length, 0);
});

check('挖词扩展生成建议', () => {
  const s = KW.suggestExpansions('yoga mats', { lang: 'en' });
  assert.ok(s.length >= 6);
  assert.ok(s.some((x) => x.intent === 'transactional'));
});

console.log('autoseo.buildAutoSeo');
check('整体装配结构正确', () => {
  const result = {
    domain: 'example.com',
    seo: parseHtml(HOME_HTML, 'https://example.com/', 'example.com'),
    traffic: { rank: 50000 },
    pagespeed: { available: false },
    pages: [makeEntry(HOME_HTML, 'https://example.com/'), makeEntry(PRODUCT_HTML, 'https://example.com/product')],
  };
  result.seo.internalHrefs = ['/about', '/contact', '/blog', '/faq'];
  result.seo.externalHosts = ['facebook.com'];
  const a = buildAutoSeo(result);
  assert.strictEqual(a.enabled, true);
  assert.ok(a.keyword.topKeywords.length > 0);
  const idSum = a.keyword.intentDist.informational + a.keyword.intentDist.comparison + a.keyword.intentDist.transactional + a.keyword.intentDist.other;
  assert.ok(idSum > 0, '意图分布应有计数');
  assert.ok(a.keyword.cannibalization.length > 0, '应检测到抢词');
  assert.ok(a.content.trustSignals.length === 8);
  assert.ok(a.content.trustSignals.filter((t) => t.found).length >= 4, '应识别到 about/contact/blog/faq');
  assert.ok(a.offpage.backlinkNeeds.needsApi === true);
  assert.ok(a.layers.traffic.globalRank.value === 50000);
  assert.ok(a.layers.technical.mixedContent.value === 0);
  assert.ok(a.rhythm.daily.length === 3 && a.rhythm.quarterly.length === 3);
  assert.ok(Array.isArray(a.dataTier) && a.dataTier.length === 4);
});

check('首页不可达时返回 enabled:false', () => {
  const a = buildAutoSeo({ domain: 'x.com', seo: {}, pages: [] });
  assert.strictEqual(a.enabled, false);
  assert.ok(a.reason);
});

console.log('\n通过 ' + passed + ' 项断言（失败则上方标记 ✗）');
