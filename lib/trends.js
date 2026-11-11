'use strict';
/**
 * trends.js — Google Trends 流量源（无需 API key，相对热度）
 *
 * 通过 Google Trends 的 explore + widgetdata 接口取：
 *   - 关键词搜索热度随时间（近 12 个月月均，0-100 相对值，非绝对值）
 *   - 品牌词搜索地域分布（by region，国家维度相对热度）
 *
 * 口径：Google Trends 给的是「相对兴趣」(0-100)，不是搜索量或流量绝对值；
 * 与 Semrush/SimilarWeb 的「估算流量」是不同维度，报告内需明确区分。
 * 接口被拦截 / 解析失败 → 优雅降级。
 */

const { request } = require('./httpclient');

const TRENDS = 'https://trends.google.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function stripPrefix(text) {
  // Google 接口返回 )]}'\n 前缀 + JSON
  const idxB = text.indexOf('{');
  const idxA = text.indexOf('[');
  let start = idxB;
  if (idxA >= 0 && (idxB < 0 || idxA < idxB)) start = idxA;
  if (start < 0) return text;
  return text.slice(start);
}

function parseJsonp(text) {
  return JSON.parse(stripPrefix(String(text)));
}

async function getCookies() {
  try {
    const r = await request(TRENDS + '/', { method: 'GET', headers: { 'user-agent': UA }, timeout: 10000 });
    const sc = r.headers && r.headers['set-cookie'];
    if (!sc) return '';
    const arr = Array.isArray(sc) ? sc : [sc];
    return arr.map((c) => String(c).split(';')[0]).join('; ');
  } catch (e) {
    return '';
  }
}

async function explore(terms, cookies, timeout) {
  const reqPayload = JSON.stringify({
    comparisonItem: terms.map((t) => ({ keyword: t, geo: '', time: 'today 12-m' })),
    category: 0,
    property: '',
  });
  const body = 'hl=en&tz=-480&req=' + encodeURIComponent(reqPayload);
  const r = await request(TRENDS + '/trends/api/explore', {
    method: 'POST',
    headers: {
      'user-agent': UA,
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      cookie: cookies,
      origin: TRENDS,
      referer: TRENDS + '/',
    },
    timeout,
    body,
  });
  const json = parseJsonp(r.body.toString('utf8'));
  return (json && json.widgets) || [];
}

async function widgetData(baseUrl, widget, cookies, timeout) {
  const reqObj = widget.request || {};
  const url =
    baseUrl +
    '?req=' +
    encodeURIComponent(JSON.stringify(reqObj)) +
    '&token=' +
    encodeURIComponent(widget.token);
  const r = await request(url, {
    method: 'GET',
    headers: { 'user-agent': UA, cookie: cookies, referer: TRENDS + '/' },
    timeout,
  });
  return parseJsonp(r.body.toString('utf8'));
}

/** 纯函数：解析 multiline（interest over time） */
function parseTimeline(data, terms) {
  const def = data && data.default;
  if (!def) return [];
  const labels = (def.lineList || []).map((l) => l.keyword || l.text || '');
  const keywords = labels.length ? labels : terms || [];
  const tl = def.timelineData || [];
  return keywords.map((kw, i) => ({
    term: kw,
    points: tl.map((pt) => ({
      time: pt.formattedTime,
      value: Number((pt.value || [])[i]) || 0,
    })),
  }));
}

/** 纯函数：解析 geomap（interest by region） */
function parseGeoMap(data) {
  const def = data && data.default;
  if (!def) return [];
  const gm = def.geoMapData || [];
  return gm
    .map((d) => ({ country: d.geoName, value: Number(d.value) || 0 }))
    .filter((d) => d.country)
    .sort((a, b) => b.value - a.value)
    .slice(0, 15);
}

/**
 * 抓取 Google Trends。
 * @param {{brand?:string, keywords?:string[]}} params
 * @returns {Promise<{available:boolean, source:string, interestOverTime:Array,
 *   byRegion:Array, reason:string, fetchedAt:string}>}
 */
async function fetchTrends(params, opts) {
  opts = opts || {};
  const timeout = opts.timeout || 15000;
  const out = {
    available: false,
    source: 'Google Trends（无需 key，相对热度 0-100）',
    interestOverTime: [],
    byRegion: [],
    reason: '未抓取',
    fetchedAt: null,
  };
  const terms = [];
  if (params && params.brand) terms.push(params.brand);
  (params && params.keywords ? params.keywords : []).slice(0, 4).forEach((t) => {
    if (t && terms.indexOf(t) < 0) terms.push(t);
  });
  if (!terms.length) return Object.assign({}, out, { reason: '无可分析的词（缺少品牌词与首页关键词）' });

  const cookies = await getCookies();
  let widgets;
  try {
    widgets = await explore(terms, cookies, timeout);
  } catch (e) {
    return Object.assign({}, out, { reason: 'Trends explore 失败：' + String((e && e.message) || e).slice(0, 80) });
  }
  if (!widgets.length) return Object.assign({}, out, { reason: 'Trends 未返回 widget（可能为 Bot 拦截）' });

  try {
    const tsWidget = widgets.find((w) => w.id === 'TIMESERIES');
    if (tsWidget) {
      const data = await widgetData(TRENDS + '/trends/api/widgetdata/multiline', tsWidget, cookies, timeout);
      out.interestOverTime = parseTimeline(data, terms);
    }
    const geoWidget = widgets.find((w) => /^GEO_MAP/.test(w.id || ''));
    if (geoWidget) {
      const data = await widgetData(TRENDS + '/trends/api/widgetdata/geomap', geoWidget, cookies, timeout);
      out.byRegion = parseGeoMap(data);
    }
    if (!out.interestOverTime.length && !out.byRegion.length) {
      return Object.assign({}, out, { reason: 'Trends 未返回可用数据' });
    }
    out.available = true;
    out.reason = '';
    out.fetchedAt = new Date().toISOString();
    return out;
  } catch (e) {
    return Object.assign({}, out, { reason: 'Trends widget 解析失败：' + String((e && e.message) || e).slice(0, 80) });
  }
}

module.exports = { fetchTrends, parseTimeline, parseGeoMap, stripPrefix };
