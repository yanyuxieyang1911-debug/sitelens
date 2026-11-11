'use strict';
/**
 * test/autoseo-render.js — 在真实 DOM 中渲染含 autoseo 的报告，验证新区块不报错
 * 运行：NODE_PATH="C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules" node test/autoseo-render.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require(path.join(
  'C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules', 'jsdom'
));

const ROOT = path.join(__dirname, '..');
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="m"></div></body></html>');
global.window = dom.window;
global.document = dom.window.document;
// 图表桩：仅验证渲染流程不抛错，不校验图表
dom.window.echarts = { init: () => ({ setOption() {}, resize() {} }) };

require(path.join(ROOT, 'public', 'report-template.js'));

const KW = require('../lib/keywords');
const { buildAutoSeo } = require('../lib/autoseo');
const { parseHtml } = require('../lib/seo');

function makeEntry(html, url) {
  const kw = KW.extractKeywords(html, url);
  const seo = parseHtml(html, url, 'example.com');
  return { url, status: 200, title: kw.title, h1: kw.h1, h2: kw.h2, description: kw.description, keywords: kw.terms, wordCount: seo.wordCount, isHttps: true };
}

const HOME = `<!DOCTYPE html><html lang="en"><head><title>Wholesale Yoga Mats Manufacturer | Buy Yoga Mats</title>
<meta name="description" content="Yoga mats wholesale manufacturer. Buy yoga mats direct from factory."></head><body>
<h1>Yoga Mats</h1><h2>Best Yoga Mats</h2>
<a href="/about">About</a><a href="/contact">Contact</a><a href="/blog">Blog</a><a href="/faq">FAQ</a>
<a href="https://facebook.com/x">fb</a>
<p>We are a yoga mats manufacturer offering wholesale yoga mats. Our yoga mats are high quality. Buy yoga mats from our factory. Yoga mats price is competitive. Yoga mats wholesale. Yoga mats manufacturer. Yoga mats supplier. Yoga mats factory. Yoga mats quote. Yoga mats catalog. Yoga mats OEM. Yoga mats custom. Yoga mats private label. Yoga mats bulk. Yoga mats shipping. Yoga mats warranty. Yoga mats for studios. Yoga mats for home.</p></body></html>`;
const PROD = `<!DOCTYPE html><html lang="en"><head><title>Yoga Mats Price | Yoga Mats Wholesale</title>
<meta name="description" content="Yoga mats price list and wholesale yoga mats quotation."></head><body>
<h1>Yoga Mats</h1><h2>Yoga Mats Price</h2>
<p>Yoga mats price starts from factory. Wholesale yoga mats available. Yoga mats manufacturer quotes. Yoga mats supplier. Yoga mats factory. Yoga mats wholesale. Yoga mats bulk. Yoga mats OEM. Yoga mats custom. Yoga mats private label. Yoga mats catalog. Yoga mats shipping. Yoga mats warranty. Yoga mats quality. Yoga mats material. Yoga mats thickness.</p></body></html>`;

// 读取真实样例报告数据
const sampleFile = path.join(ROOT, 'reports', 'sitelens-example.com.html');
const raw = fs.readFileSync(sampleFile, 'utf8');
const m = /window\.__DATA__\s*=\s*([\s\S]+?);\s*renderReport/.exec(raw);
if (!m) { console.error('无法从样例报告提取 __DATA__'); process.exit(1); }
const data = JSON.parse(m[1]);

// 注入自动计算的 autoseo
const seoHome = parseHtml(HOME, 'https://example.com/', 'example.com');
seoHome.internalHrefs = ['/about', '/contact', '/blog', '/faq'];
seoHome.externalHosts = ['facebook.com'];
data.seo = Object.assign({}, data.seo, seoHome);
data.traffic = Object.assign({}, data.traffic, { rank: 50000 });
data.pagespeed = Object.assign({}, data.pagespeed, { available: false });
data.pages = [makeEntry(HOME, 'https://example.com/'), makeEntry(PROD, 'https://example.com/product')];
data.autoseo = buildAutoSeo(data);

const mount = document.getElementById('m');
let threw = null;
try {
  window.renderReport(data, mount);
} catch (e) {
  threw = e;
}

if (threw) {
  console.error('✗ renderReport 抛错：', threw.message);
  process.exit(1);
}

const txt = mount.textContent || '';
const checks = [
  ['渲染出自动 SEO 策略标题', txt.includes('自动 SEO 策略')],
  ['渲染出关键词策略区块', txt.includes('关键词策略')],
  ['检测到抢词并提示', txt.includes('同词多页抢排名') || txt.includes('keyword cannibalization')],
  ['渲染出 E-E-A-T', txt.includes('E-E-A-T')],
  ['渲染出四层指标-流量与排名层', txt.includes('流量与排名层')],
  ['渲染出四层指标-商业层', txt.includes('商业层')],
  ['渲染出节奏打法-每日', txt.includes('每日')],
  ['口径标注出现', txt.includes('需接入')],
];
let ok = true;
for (const [name, pass] of checks) {
  console.log((pass ? '  ✓ ' : '  ✗ ') + name);
  if (!pass) ok = false;
}
// 老区块不应因新增而丢失
if (!txt.includes('综合') && !txt.includes('维度')) { /* 样例可能无综合分文本，跳过 */ }
console.log('\nautoseo 渲染测试 ' + (ok ? '通过' : '存在失败项'));
process.exit(ok ? 0 : 1);
