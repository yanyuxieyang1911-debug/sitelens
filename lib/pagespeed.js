'use strict';
/**
 * pagespeed.js — Google PageSpeed Insights v5（免费接口，无需密钥即有低频配额）
 * 产出 Lighthouse 实验室数据：性能/SEO/无障碍/最佳实践评分 + Core Web Vitals
 * 支持环境变量 PSI_API_KEY 提升配额；不可达时优雅降级
 */
const { getJson } = require('./httpclient');

const VITAL_KEYS = [
  ['largest-contentful-paint', 'LCP 最大内容绘制'],
  ['first-contentful-paint', 'FCP 首次内容绘制'],
  ['total-blocking-time', 'TBT 总阻塞时间'],
  ['cumulative-layout-shift', 'CLS 累积布局偏移'],
  ['speed-index', 'SI 速度指数'],
  ['interactive', 'TTI 可交互时间'],
];

async function runStrategy(url, strategy, timeout, apiKey) {
  const api =
    'https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=' +
    encodeURIComponent(url) +
    '&strategy=' +
    strategy +
    '&category=performance&category=seo&category=accessibility&category=best-practices' +
    (apiKey ? '&key=' + encodeURIComponent(apiKey) : '');
  const j = await getJson(api, { timeout });
  if (!j || !j.lighthouseResult) throw new Error('返回格式异常');
  const cats = j.lighthouseResult.categories || {};
  const audits = j.lighthouseResult.audits || {};
  const score = (k) => (cats[k] && typeof cats[k].score === 'number' ? Math.round(cats[k].score * 100) : null);
  const vitals = {};
  for (const [key, label] of VITAL_KEYS) {
    const a = audits[key];
    if (a) {
      vitals[key] = {
        label,
        value: typeof a.numericValue === 'number' ? Math.round(a.numericValue * 100) / 100 : null,
        display: a.displayValue || null,
        score: typeof a.score === 'number' ? Math.round(a.score * 100) : null,
      };
    }
  }
  const field = j.loadingExperience && j.loadingExperience.metrics ? j.loadingExperience.metrics : null;
  return {
    strategy,
    scores: {
      performance: score('performance'),
      seo: score('seo'),
      accessibility: score('accessibility'),
      bestPractices: score('best-practices'),
    },
    vitals,
    fieldData: field ? ' CrUX 真实用户数据可用' : null,
  };
}

async function getPageSpeed(url, opts = {}) {
  const timeout = opts.timeout || 30000;
  const apiKey = process.env.PSI_API_KEY || '';
  const out = { available: false, reason: null, mobile: null, desktop: null, usedApiKey: !!apiKey };

  const results = await Promise.allSettled([
    runStrategy(url, 'mobile', timeout, apiKey),
    runStrategy(url, 'desktop', timeout, apiKey),
  ]);
  out.mobile = results[0].status === 'fulfilled' ? results[0].value : null;
  out.desktop = results[1].status === 'fulfilled' ? results[1].value : null;
  out.available = !!(out.mobile || out.desktop);
  if (!out.available) {
    const err = results[0].reason || results[1].reason;
    out.reason = 'PageSpeed Insights 不可达或超出免费配额（' + (err && err.message ? err.message : '未知错误') + '）';
  }
  return out;
}

module.exports = { getPageSpeed, VITAL_KEYS };
