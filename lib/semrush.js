'use strict';
/**
 * semrush.js — Semrush 流量源（需 API key，第三方估算）
 *
 * 通过 Semrush Analytics (Trends) API v2 取：
 *   - domain_overview：全站月访问估算(traf) + traffic_by_country(国家来源)
 *   - domain_organic：Top 自然关键词（搜索量 nq / 排名 po / 流量占比 tr → 估算词级月访问）
 *
 * 口径：第三方模型估算，非 Google 官方，量级可能偏差；无 key 或失败优雅降级。
 * 绝不在无数据时编造数字。
 */

const { getJson } = require('./httpclient');

const BROWSER_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  accept: 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9',
};

const BASE = 'https://api.semrush.com/analytics/ta/v2/';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 纯函数：解析 domain_overview 响应 */
function parseDomainOverview(json) {
  if (!json || typeof json !== 'object') return null;
  const monthlyVisits = num(json.traf != null ? json.traf : json.traffic);
  const countryShares = (json.traf_by_country || [])
    .map((c) => ({
      country: c.country || c.code || '未知',
      code: c.code || '',
      share: num(c.shares),
      visits: num(c.vis_ts),
    }))
    .filter((c) => c.country && c.share != null)
    .sort((a, b) => b.share - a.share)
    .slice(0, 12);
  return {
    monthlyVisits,
    countryShares,
    organicKeywords: num(json.organic_keywords),
    organicTrafficCost: num(json.organic_traffic_cost),
    paidKeywords: num(json.paid_keywords),
  };
}

/** 纯函数：解析 domain_organic 响应（数组），按全站月访问估算词级流量 */
function parseDomainOrganic(json, monthlyVisits) {
  if (!Array.isArray(json)) return [];
  return json
    .map((it) => {
      const term = it.ph || it.keyword || it.Keyword || '';
      const volume = num(it.nq != null ? it.nq : it.search_volume != null ? it.search_volume : it.kom);
      const position = num(it.po != null ? it.po : it.position);
      const trafficPct = num(it.tr != null ? it.tr : it.traffic_percent);
      const estVisits =
        monthlyVisits != null && trafficPct != null ? Math.round((monthlyVisits * trafficPct) / 100) : null;
      return {
        term,
        position,
        volume, // 搜索量（月）
        trafficPct, // 占全站自然流量百分比
        estVisits, // 该词带来的估算月访问
        cpc: num(it.cp != null ? it.cp : it.cpc),
      };
    })
    .filter((k) => k.term);
}

/**
 * 抓取 Semrush 数据。
 * @returns {Promise<{available:boolean, source:string, monthlyVisits:?number,
 *   countryShares:Array, organicKeywords:?number, topKeywords:Array, reason:string, fetchedAt:string}>}
 */
async function fetchSemrush(domain, opts) {
  opts = opts || {};
  const apiKey = opts.apiKey || '';
  const timeout = opts.timeout || 15000;
  const host = String(domain || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
  const base = {
    available: false,
    source: 'Semrush（需 API key）',
    monthlyVisits: null,
    countryShares: [],
    organicKeywords: null,
    topKeywords: [],
    reason: '未配置',
    fetchedAt: null,
  };
  if (!apiKey) {
    return Object.assign({}, base, {
      reason: '未配置 Semrush API key（在 config.json 设置 semrushApiKey 或环境变量 SEMRUSH_API_KEY）',
    });
  }
  if (!host) return Object.assign({}, base, { reason: '域名无效' });

  try {
    const ovUrl =
      BASE + '?key=' + encodeURIComponent(apiKey) + '&type=domain_overview&domain=' + encodeURIComponent(host) + '&database=us';
    let parsed = null;
    try {
      const ov = await getJson(ovUrl, { headers: BROWSER_HEADERS, timeout });
      parsed = parseDomainOverview(ov);
    } catch (e) {
      // overview 失败不影响整体降级
    }

    let topKeywords = [];
    try {
      const orgUrl =
        BASE +
        '?key=' +
        encodeURIComponent(apiKey) +
        '&type=domain_organic&domain=' +
        encodeURIComponent(host) +
        '&database=us&display_limit=20&display_sort=tr_desc';
      const org = await getJson(orgUrl, { headers: BROWSER_HEADERS, timeout });
      topKeywords = parseDomainOrganic(org, parsed ? parsed.monthlyVisits : null);
    } catch (e) {
      // organic 可选
    }

    const monthlyVisits = parsed ? parsed.monthlyVisits : null;
    const countryShares = parsed ? parsed.countryShares : [];

    if (monthlyVisits == null && !countryShares.length && !topKeywords.length) {
      return Object.assign({}, base, {
        reason: 'Semrush 未返回数据（域名体量过小 / key 权限不足 / 额度耗尽）',
      });
    }
    return {
      available: true,
      source: 'Semrush Domain Overview（API，第三方估算，非 Google 官方）',
      monthlyVisits,
      countryShares,
      organicKeywords: parsed ? parsed.organicKeywords : null,
      topKeywords,
      reason: '',
      fetchedAt: new Date().toISOString(),
    };
  } catch (e) {
    return Object.assign({}, base, { reason: String((e && e.message) || e).slice(0, 120) });
  }
}

module.exports = { fetchSemrush, parseDomainOverview, parseDomainOrganic, BASE };
