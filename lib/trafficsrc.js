'use strict';
/**
 * trafficsrc.js — 零依赖「第三方流量估算」抓取
 *
 * 目标：从 SimilarWeb 公开接口抓取真实估算数据，补齐两个用户最关心的维度：
 *   1) 每个关键词的月度访问量（月度流量）
 *   2) 网站流量的国家来源分布
 *
 * 数据性质（重要，务必标注）：SimilarWeb 给出的是「第三方模型估算」，
 *   不是 Google / GA 的真实数据，量级可能偏差数倍。本工具仅如实展示并明确标注来源，
 *   绝不把它包装成一手数据。抓取失败（被 Bot 防护拦截 / 网络受限）时优雅降级，
 *   返回 available:false，由报告侧显示「需接入 / 抓取受限」，不编造数字。
 *
 * 免费源说明：SimilarWeb 公开接口无需密钥；Semrush / Google Trends 暂无干净免费接口，
 *   本模块预留 parse 扩展点，后续可接入。Google Trends 只能给相对热度(0-100)，
 *   不给绝对值，故不用于「月度流量」字段，仅作扩展方向。
 */

const { getJson } = require('./httpclient');

// 浏览器级 UA + Referer，尽量避开 Bot 拦截（仍可能被数据中心 IP 拦截，属正常降级）
const BROWSER_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  accept: 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9',
  referer: 'https://www.similarweb.com/',
};

function normalizeTerm(t) {
  return String(t || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .trim();
}

/**
 * 抓取 SimilarWeb 估算。
 * @returns {Promise<{available:boolean, source:string, monthlyVisits:?number,
 *   countryShares:Array, topKeywords:Array, reason:string, fetchedAt:string}>}
 */
async function fetchSimilarWeb(domain, opts) {
  opts = opts || {};
  const timeout = opts.timeout || 12000;
  const host = String(domain || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
  const base = {
    available: false,
    source: 'SimilarWeb 公开估算（第三方）',
    monthlyVisits: null,
    countryShares: [],
    topKeywords: [],
    reason: '未抓取',
    fetchedAt: null,
  };
  if (!host) return Object.assign({}, base, { reason: '域名无效' });

  const url = 'https://data.similarweb.com/api/website?url=' + encodeURIComponent(host);
  try {
    const d = await getJson(url, { headers: BROWSER_HEADERS, timeout });
    const parsed = parseSimilarWeb(d);
    if (!parsed.available) {
      return Object.assign({}, base, { reason: parsed.reason || '接口返回空（站点体量过小或无数据）' });
    }
    return parsed;
  } catch (e) {
    // 403/404/超时/解析失败 → 正常降级
    return Object.assign({}, base, { reason: String((e && e.message) || e).slice(0, 80) });
  }
}

/**
 * 纯函数：把 SimilarWeb 原始 JSON 解析为统一结构（便于单测，不依赖网络）。
 */
function parseSimilarWeb(d) {
  if (!d || typeof d !== 'object') {
    return { available: false, monthlyVisits: null, countryShares: [], topKeywords: [], reason: '返回数据异常' };
  }
  const monthlyVisits =
    d.engagements && d.engagements.monthlyVisits != null
      ? Number(d.engagements.monthlyVisits)
      : null;

  const countryShares = (d.top_country_shares || [])
    .map((c) => ({
      country: c.country || c.code || '未知',
      code: c.code || '',
      share: typeof c.share === 'number' ? c.share : null, // 0-1 占比
    }))
    .filter((c) => c.country && c.share != null)
    .sort((a, b) => b.share - a.share)
    .slice(0, 12);

  const topKeywords = (d.top_keywords || [])
    .map((k) => ({
      term: k.name,
      monthlyVisits: k.estimated_monthly_visits != null ? Number(k.estimated_monthly_visits) : null,
      share: typeof k.share === 'number' ? k.share : null,
    }))
    .filter((k) => k.term)
    .slice(0, 20);

  if (monthlyVisits == null && !countryShares.length && !topKeywords.length) {
    return { available: false, monthlyVisits: null, countryShares: [], topKeywords: [], reason: '接口返回空（站点体量过小或无数据）' };
  }
  return {
    available: true,
    source: 'SimilarWeb 第三方估算（非 Google 官方）',
    monthlyVisits,
    countryShares,
    topKeywords,
    reason: '',
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * 把 SW 的 top_keywords（带估算月访问量）与站内抽取词按词面匹配，
 * 为匹配上的站内词附加 monthlyVisits。
 * @param {Array<{term:string}>} detected 站内抽取 topKeywords
 * @param {Array<{term:string, monthlyVisits:?number}>} swKws SW 关键词
 * @returns {Map<string, number>} term(归一化) -> monthlyVisits
 */
function matchKeywordVolume(detected, swKws) {
  const map = new Map();
  if (!swKws || !swKws.length) return map;
  const swNorm = swKws.map((k) => ({ norm: normalizeTerm(k.term), vol: k.monthlyVisits }));
  for (const d of detected || []) {
    const dn = normalizeTerm(d.term);
    if (!dn) continue;
    // 精确匹配
    let hit = swNorm.find((s) => s.norm && s.norm === dn);
    // 容错：长词包含 / 被包含
    if (!hit) {
      hit = swNorm.find(
        (s) => s.norm && s.norm.length >= 4 && (s.norm.includes(dn) || dn.includes(s.norm))
      );
    }
    if (hit && hit.vol != null) map.set(dn, hit.vol);
  }
  return map;
}

module.exports = { fetchSimilarWeb, parseSimilarWeb, matchKeywordVolume, normalizeTerm, BROWSER_HEADERS };
