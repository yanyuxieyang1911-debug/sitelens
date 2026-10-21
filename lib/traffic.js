'use strict';
/**
 * traffic.js — 流量数据模块
 * 数据源（全部免费、无需密钥）：
 *  1. Tranco 榜单（https://tranco-list.eu）——全球网站排名，一手数据
 *  2. Common Crawl 索引 —— 站点规模信号（被抓取 URL 数），一手数据
 * 访问量 = 基于排名的经验模型估算（非一手流量数据，报告须标注口径）
 */
const fs = require('fs');
const path = require('path');
const { getText, getJson } = require('./httpclient');

const CACHE_DIR = path.join(__dirname, '..', '.cache');
let rankCache = null; // { listId, map: Map<domain, rank> }

// 排名 → 月访问量 的经验锚点（log-log 插值）
// 锚点参照主流流量工具公开量级校准，误差可能达数倍，仅作数量级判断
const ANCHORS = [
  [1, 6.5e10],
  [100, 2.5e8],
  [1000, 2.5e7],
  [1e4, 2.5e6],
  [1e5, 2.5e5],
  [1e6, 2.5e4],
];

function estimateFromRank(rank) {
  const r = Math.max(1, Math.min(1e6, rank));
  const pts = ANCHORS.map(([x, y]) => [Math.log10(x), Math.log10(y)]);
  let i = 0;
  while (i < pts.length - 1 && r > ANCHORS[i + 1][0]) i++;
  let y;
  if (r <= ANCHORS[0][0]) y = pts[0][1];
  else if (r >= ANCHORS[ANCHORS.length - 1][0]) y = pts[pts.length - 1][1];
  else {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const lr = (Math.log10(r) - x0) / (x1 - x0);
    y = y0 + (y1 - y0) * lr;
  }
  const mid = Math.round(Math.pow(10, y));
  return { low: Math.round(mid / 2.5), mid, high: Math.round(mid * 2) };
}

function parseTrancoCsv(csv, listId) {
  const map = new Map();
  const lines = csv.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const comma = line.indexOf(',');
    if (comma < 0) continue;
    const rank = parseInt(line.slice(0, comma), 10);
    const domain = line.slice(comma + 1).trim().toLowerCase();
    if (Number.isFinite(rank) && domain) {
      if (!map.has(domain)) map.set(domain, rank);
      if (map.size >= 1.2e6) break;
    }
  }
  if (map.size < 1000) return null;
  return { listId, map };
}

function withDeadline(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

const FAST_FAIL_ERRORS = ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'ECONNRESET', 'EPIPE'];

function isFastFailError(e) {
  return !!(e && (FAST_FAIL_ERRORS.includes(e.code) || FAST_FAIL_ERRORS.includes(e.errno)));
}

async function latestTrancoDate(timeout) {
  // 方案 A：首页解析最新日期
  try {
    const home = await getText('https://tranco-list.eu/', { timeout: Math.min(timeout, 10000) });
    const dates = [...home.matchAll(/lists\/date\/(\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]);
    if (dates.length) return dates.sort().slice(-1)[0];
  } catch (e) {
    // 网络级错误（域名不可达等）不必再逐日重试
    if (isFastFailError(e)) return null;
  }
  // 方案 B：从今天起向前试 5 天
  const today = new Date();
  for (let d = 0; d < 5; d++) {
    const day = new Date(today.getTime() - d * 86400000);
    const ds = day.toISOString().slice(0, 10);
    try {
      const meta = await getJson('https://tranco-list.eu/api/lists/date/' + ds, { timeout: 5000 });
      if (meta && (meta.list_id || meta.list)) return ds;
    } catch (e) {
      if (isFastFailError(e)) return null;
    }
  }
  return null;
}

async function loadTrancoList(timeout) {
  if (rankCache) return rankCache;
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const files = fs.readdirSync(CACHE_DIR).filter((f) => f.startsWith('tranco-') && f.endsWith('.csv'));
    for (const f of files) {
      try {
        const parsed = parseTrancoCsv(fs.readFileSync(path.join(CACHE_DIR, f), 'utf8'), f.replace(/^tranco-|\.csv$/g, ''));
        if (parsed) {
          rankCache = parsed;
          return rankCache;
        }
      } catch (e) {}
    }
  } catch (e) {}

  const date = await latestTrancoDate(timeout);
  if (!date) return null;
  let listId = null;
  try {
    const meta = await getJson('https://tranco-list.eu/api/lists/date/' + date, { timeout });
    listId = meta && (meta.list_id || meta.list || meta.id);
  } catch (e) {}
  if (!listId) return null;

  const candidates = [
    'https://tranco-list.eu/download/' + listId + '/1000000',
    'https://tranco-list.eu/download/' + listId,
    'https://tranco-list.eu/download/' + listId + '/100000',
  ];
  for (const url of candidates) {
    try {
      const csv = await getText(url, { timeout, maxBytes: 40 * 1024 * 1024 });
      const parsed = parseTrancoCsv(csv, listId);
      if (parsed) {
        try {
          fs.writeFileSync(path.join(CACHE_DIR, 'tranco-' + listId + '.csv'), csv);
        } catch (e) {}
        rankCache = parsed;
        return rankCache;
      }
    } catch (e) {}
  }
  return null;
}

async function trancoRank(domain, timeout) {
  const cache = await loadTrancoList(timeout);
  if (!cache) return { rank: null, reason: 'Tranco 榜单不可达（网络限制或服务异常）' };
  const rank = cache.map.get(domain) ?? cache.map.get('www.' + domain) ?? null;
  return { rank, listId: cache.listId, reason: rank ? null : '未进入 Tranco 全球 Top 100 万' };
}

async function commonCrawlSignal(domain, timeout) {
  const colls = await getJson('https://index.commoncrawl.org/collinfo.json', { timeout });
  const latest = Array.isArray(colls) && colls.length ? colls[0] : null;
  if (!latest || !latest.id) return null;
  const url =
    'https://index.commoncrawl.org/' +
    latest.id +
    '-index?url=' +
    encodeURIComponent(domain) +
    '&output=json&matchType=domain&limit=500';
  const text = await getText(url, { timeout, maxBytes: 16 * 1024 * 1024 });
  // 大站全域名查询可能触发 CC 网关超时（返回 HTML 错误页），按不可用处理
  if (!text.trim().startsWith('{') && !/^\{.*\n\{/m.test(text) && !text.includes('"urlkey"')) {
    if (/504|502|503|time-?out/i.test(text.slice(0, 500))) return null;
  }
  const lines = text.split('\n').filter((l) => l.trim().startsWith('{'));
  if (lines.length === 0 && text.trim().startsWith('<')) return null;
  return {
    index: latest.id,
    sampledUrls: lines.length,
    truncated: lines.length >= 500,
    note: '最近一次 Common Crawl 抓取中出现的 URL 数（站点规模信号，非流量）',
  };
}

async function getTrafficData(domain, opts = {}) {
  const timeout = opts.timeout || 25000;
  const out = {
    rank: null,
    rankListId: null,
    rankSource: null,
    rankReason: null,
    estimate: null,
    commonCrawl: null,
    notes: [],
  };

  try {
    const t = await withDeadline(
      trancoRank(domain, timeout),
      15000,
      { rank: null, reason: 'Tranco 查询超时（网络受限时自动跳过）' }
    );
    if (t.rank != null) {
      out.rank = t.rank;
      out.rankListId = t.listId;
      out.rankSource = 'Tranco 榜单（一手）';
      out.estimate = estimateFromRank(t.rank);
    } else {
      out.rankReason = t.reason;
      out.notes.push(t.reason);
    }
  } catch (e) {
    out.rankReason = 'Tranco 查询异常：' + (e.message || e);
    out.notes.push(out.rankReason);
  }

  try {
    out.commonCrawl = await withDeadline(commonCrawlSignal(domain, Math.min(timeout, 12000)), 15000, null);
  } catch (e) {
    out.notes.push('Common Crawl 信号不可用');
  }

  if (!out.estimate) {
    out.notes.push('未获得排名数据时，不做访问量数字估算，避免编造流量');
  }
  return out;
}

module.exports = { getTrafficData, estimateFromRank };
