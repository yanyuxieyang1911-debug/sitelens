'use strict';
/**
 * analyzer.js — 分析编排器
 * 流程：域名规范化 → DNS → 首页抓取（计时/重定向/压缩）→ TLS 证书 → SEO 解析
 *       → 技术栈与追踪代码 → robots/sitemap → 流量数据 + PageSpeed（并行）
 *       → RDAP 域名年龄 → 评分与建议
 */
const dns = require('dns').promises;
const tls = require('tls');
const { request } = require('./httpclient');
const { parseHtml, auditOnPage } = require('./seo');
const { detectTechStack, extractTrackerIds } = require('./techstack');
const { getTrafficData } = require('./traffic');
const { getPageSpeed } = require('./pagespeed');
const { getDomainAgeYears } = require('./rdap');
const { computeScores, buildSuggestions, buildPositives, buildDiagnosis } = require('./scoring');
const { buildGeo } = require('./geo');

const PRIVATE_IP_RE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|::1$|fe80:|fc00:|fd|fec0:)/i;

class HttpError extends Error {
  constructor(status, userMessage) {
    super(userMessage);
    this.status = status;
    this.userMessage = userMessage;
  }
}

function normalizeDomain(input) {
  if (!input || typeof input !== 'string') return null;
  let s = input.trim().toLowerCase();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // 去协议
  s = s.split(/[/?#]/)[0]; // 去路径/查询/锚点
  s = s.replace(/:\d+$/, ''); // 去端口
  s = s.replace(/\.$/, ''); // 去根点
  s = s.replace(/^www\./, ''); // 去 www
  if (!/^[a-z0-9\u4e00-\u9fa5-]+(\.[a-z0-9\u4e00-\u9fa5-]+)+$/.test(s)) return null;
  if (!/\.[a-z\u4e00-\u9fa5]{2,}$/.test(s)) return null;
  if (s.length > 253) return null;
  return s;
}

async function resolveDns(domain) {
  const out = { a: [], aaaa: [], mx: [], ns: [], soa: null, lookupMs: null, error: null };
  const t0 = Date.now();
  try {
    const r = await dns.lookup(domain, { all: true });
    out.lookupMs = Date.now() - t0;
    out.a = r.filter((x) => x.family === 4).map((x) => x.address);
    out.aaaa = r.filter((x) => x.family === 6).map((x) => x.address);
    if (out.a.some((ip) => PRIVATE_IP_RE.test(ip))) {
      out.error = '域名解析到内网/保留地址，已按安全策略拒绝分析';
    }
  } catch (e) {
    out.lookupMs = Date.now() - t0;
    out.error = 'DNS 解析失败（' + (e.code || e.message) + '）';
  }
  await Promise.allSettled([
    dns.resolveMx(domain).then((v) => {
      out.mx = v.sort((a, b) => a.priority - b.priority).slice(0, 5).map((m) => m.priority + ' ' + m.exchange);
    }).catch(() => {}),
    dns.resolveNs(domain).then((v) => { out.ns = v.slice(0, 5); }).catch(() => {}),
    dns.resolveSoa(domain).then((v) => { out.soa = v; }).catch(() => {}),
  ]);
  return out;
}

function checkTls(host) {
  return new Promise((resolve) => {
    const sock = tls.connect({ host, port: 443, servername: host, timeout: 8000 }, () => {
      try {
        const cert = sock.getPeerCertificate();
        const cn = (cert.subject && cert.subject.CN) || (cert.subjectaltname || '').split(', ')[0].replace(/^DNS:/, '') || '';
        const info = {
          ok: true,
          subject: cn,
          issuer: (cert.issuer && (cert.issuer.O || cert.issuer.CN)) || '',
          validFrom: cert.valid_from,
          validTo: cert.valid_to,
          daysLeft: cert.valid_to ? Math.round((new Date(cert.valid_to).getTime() - Date.now()) / 86400000) : null,
          protocol: sock.getProtocol(),
        };
        sock.destroy();
        resolve(info);
      } catch (e) {
        sock.destroy();
        resolve({ ok: false, error: String(e && e.message) });
      }
    });
    sock.on('error', (e) => resolve({ ok: false, error: e.code || e.message }));
    sock.on('timeout', () => { sock.destroy(); resolve({ ok: false, error: 'TLS 连接超时' }); });
  });
}

const INTERESTING_HEADERS = [
  'server', 'x-powered-by', 'content-type', 'content-encoding', 'cache-control', 'pragma',
  'cf-ray', 'x-amz-cf-id', 'via', 'x-served-by', 'x-cache', 'x-vercel-id', 'x-nf-request-id',
  'strict-transport-security', 'content-security-policy', 'x-content-type-options',
  'x-frame-options', 'referrer-policy', 'permissions-policy', 'x-generator',
  'x-drupal-cache', 'set-cookie', 'alt-svc', 'content-security-policy-report-only',
];

function trimHeaders(headers) {
  const out = {};
  for (const k of INTERESTING_HEADERS) {
    if (headers[k] !== undefined) out[k] = headers[k];
  }
  return out;
}

async function fetchTextFile(url, opts = {}) {
  const { timeout = 8000, maxBytes = 4 * 1024 * 1024 } = opts;
  try {
    const r = await request(url, { timeout, maxRedirects: 3, maxBytes });
    if (r.status >= 200 && r.status < 300 && r.body.length > 0) {
      return { found: true, status: r.status, text: r.body.toString('utf8'), url: r.url };
    }
    return { found: false, status: r.status };
  } catch (e) {
    return { found: false, error: e.message };
  }
}

function mergeTrackerIds(base, extra) {
  if (!extra) return base;
  const out = { ...base };
  for (const k of Object.keys(extra)) {
    if (Array.isArray(extra[k]) && extra[k].length) {
      out[k] = [...new Set([...(out[k] || []), ...extra[k]])];
    }
  }
  return out;
}

/** 扫描同源 JS 资源（限量）：SPA/Next.js 站点常把像素代码打包进 bundle，HTML 看不到 */
async function scanJsBundles(scriptSrcs, pageUrl) {
  const pageHost = new URL(pageUrl).hostname;
  const sameOrigin = scriptSrcs.filter((u) => {
    try {
      const h = new URL(u).hostname;
      return h === pageHost || h === 'www.' + pageHost || pageHost === 'www.' + h;
    } catch (e) {
      return false;
    }
  });
  const targets = sameOrigin.slice(0, 10);
  if (!targets.length) return '';
  const texts = await Promise.all(
    targets.map((u) =>
      fetchTextFile(u, { timeout: 8000, maxBytes: 2 * 1024 * 1024 })
        .then((r) => (r.found ? r.text.slice(0, 2 * 1024 * 1024) : ''))
        .catch(() => '')
    )
  );
  const joined = texts.filter(Boolean).join('\n');
  return joined.slice(0, 4 * 1024 * 1024);
}

async function fetchRobots(domain) {
  const r = await fetchTextFile('https://' + domain + '/robots.txt');
  if (!r.found) {
    const r2 = await fetchTextFile('http://' + domain + '/robots.txt');
    if (!r2.found) return { found: false };
    return parseRobots(r2);
  }
  return parseRobots(r);
}

function parseRobots(r) {
  const sitemaps = [...r.text.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
  const disallowAll = /^\s*user-agent:\s*\*[\s\S]{0,200}?disallow:\s*\/\s*$/im.test(r.text);
  return { found: true, status: r.status, sitemaps, disallowAll, preview: r.text.slice(0, 600) };
}

async function fetchSitemap(domain, robots) {
  const candidates = [];
  if (robots && robots.found && robots.sitemaps && robots.sitemaps.length) {
    candidates.push(...robots.sitemaps.slice(0, 3));
  }
  candidates.push('https://' + domain + '/sitemap.xml');
  candidates.push('https://' + domain + '/sitemap_index.xml');
  for (const url of candidates) {
    const r = await fetchTextFile(url);
    if (r.found && /<urlset|<sitemapindex/i.test(r.text)) {
      const locs = [...r.text.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => m[1].trim());
      const isIndex = /<sitemapindex/i.test(r.text);
      return {
        found: true,
        url,
        isIndex,
        urlCount: isIndex ? locs.length : locs.length,
        sampleUrls: locs.slice(0, 5),
      };
    }
  }
  return { found: false };
}

async function fetchLlms(domain) {
  const r = await fetchTextFile('https://' + domain + '/llms.txt');
  if (r.found && r.text && r.text.length) {
    return { found: true, url: r.url, size: r.text.length, preview: r.text.slice(0, 400) };
  }
  // 部分站点放在 www 前缀下
  const r2 = await fetchTextFile('https://www.' + domain + '/llms.txt');
  if (r2.found && r2.text && r2.text.length) {
    return { found: true, url: r2.url, size: r2.text.length, preview: r2.text.slice(0, 400) };
  }
  return { found: false };
}

async function analyze(input, ctx = {}) {
  const onStep = ctx.onStep || (() => {});
  const isAborted = ctx.isAborted || (() => false);
  const t0 = Date.now();

  const domain = normalizeDomain(input);
  if (!domain) {
    throw new HttpError(400, '域名格式不正确，请输入类似 example.com 的域名（不要带 http:// 或路径）');
  }

  const result = {
    domain,
    startedAt: new Date().toISOString(),
    warnings: [],
    dataSources: [],
  };

  // 1. DNS
  onStep({ key: 'dns', label: '解析域名 DNS', status: 'start' });
  if (isAborted()) throw new HttpError(499, '分析已取消');
  result.dns = await resolveDns(domain);
  if (result.dns.error && result.dns.error.includes('内网')) {
    throw new HttpError(400, result.dns.error);
  }
  if (result.dns.error && result.dns.a.length === 0) {
    throw new HttpError(400, '无法解析域名 ' + domain + '（' + result.dns.error + '），请检查拼写或 DNS 配置');
  }
  result.dataSources.push('DNS 系统解析（一手）');
  onStep({
    key: 'dns',
    label: '解析域名 DNS',
    status: 'done',
    detail: (result.dns.a[0] || '已解析') + (result.dns.lookupMs != null ? ' · ' + result.dns.lookupMs + 'ms' : ''),
  });

  // 2. 首页抓取
  onStep({ key: 'fetch', label: '抓取首页并测量响应性能', status: 'start' });
  if (isAborted()) throw new HttpError(499, '分析已取消');
  const candidates = [
    'https://' + domain + '/',
    'https://www.' + domain + '/',
    'http://' + domain + '/',
    'http://www.' + domain + '/',
  ];
  let page = null;
  let lastErr = null;
  for (const url of candidates) {
    try {
      page = await request(url, { timeout: 15000, maxRedirects: 6 });
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!page) {
    throw new HttpError(502, '无法访问 ' + domain + '：' + (lastErr ? lastErr.code || lastErr.message : '未知错误') + '。站点可能宕机、屏蔽服务器请求，或网络不通。');
  }
  if (page.headers['cf-mitigated'] || (page.status === 403 && page.headers['cf-ray'])) {
    result.warnings.push('站点启用了 Cloudflare Bot 防护，首页抓取被拦截，站内 HTML 分析可能不完整（性能数据仍有效）');
  }
  if (page.status >= 400) {
    result.warnings.push('首页返回 HTTP ' + page.status + '，站内分析基于错误页进行，仅供参考');
  }
  // 抓取被拦截标记：后续“未检测到 X”类结论需抑制，避免基于错误页误报
  const fetchBlocked = page.status >= 400 || !!page.headers['cf-mitigated'];
  // 跳转脱离主域标记（如主域 301 到结账子域）：落地页结论可能不代表用户要查的站点
  const finalHost = new URL(page.url).hostname;
  const redirectedAway =
    finalHost !== domain && finalHost !== 'www.' + domain && domain !== 'www.' + finalHost;
  if (redirectedAway) {
    result.warnings.push(
      domain + ' 跳转到了 ' + page.url + '，本次分析的是跳转后的落地页，其结论（如 noindex、标题缺失）可能只代表该子页而非主站'
    );
  }
  result.page = {
    url: page.url,
    status: page.status,
    blocked: fetchBlocked,
    redirectedAway,
    headers: trimHeaders(page.headers),
    size: page.size,
    rawSize: page.rawSize,
    ttfbMs: page.ttfbMs,
    totalMs: page.totalMs,
    compression: page.compression,
    hopCount: page.hopCount,
    hops: page.hops,
    isHttps: page.url.startsWith('https:'),
  };
  result.dataSources.push('直接 HTTP 测量（一手）');
  onStep({
    key: 'fetch',
    label: '抓取首页并测量响应性能',
    status: 'done',
    detail: 'TTFB ' + Math.round(page.ttfbMs) + 'ms · ' + (page.size / 1024).toFixed(0) + 'KB · ' + (page.hopCount || 0) + ' 跳',
  });

  // 3. TLS
  onStep({ key: 'tls', label: '检查 SSL 证书', status: 'start' });
  result.tls = page.url.startsWith('https:') ? await checkTls(finalHost) : { ok: false, error: '站点未启用 HTTPS' };
  onStep({
    key: 'tls',
    label: '检查 SSL 证书',
    status: 'done',
    detail: result.tls.ok ? (result.tls.protocol || 'TLS') + ' · 剩余 ' + (result.tls.daysLeft != null ? result.tls.daysLeft + ' 天' : '未知') : result.tls.error || '未启用',
  });

  // 4. robots / sitemap（先行获取，供 SEO 体检引用）
  onStep({ key: 'crawl', label: '检查 robots.txt / sitemap.xml / llms.txt', status: 'start' });
  const robots = await fetchRobots(domain);
  const sitemap = await fetchSitemap(domain, robots);
  const llms = await fetchLlms(domain);
  result.crawl = { robots, sitemap };
  result.llms = llms;
  onStep({
    key: 'crawl',
    label: '检查 robots.txt / sitemap.xml / llms.txt',
    status: 'done',
    detail: 'robots ' + (robots.found ? '✓' : '✗') + ' · sitemap ' + (sitemap.found ? '✓ ' + sitemap.urlCount + ' URL' : '✗') + ' · llms.txt ' + (llms.found ? '✓' : '✗'),
  });

  // 5. SEO 解析与体检
  onStep({ key: 'seo', label: '解析 SEO 要素', status: 'start' });
  if (isAborted()) throw new HttpError(499, '分析已取消');
  const html = page.body.toString('utf8');
  result.seo = parseHtml(html, page.url, domain);
  result.seo.checks = auditOnPage(result.seo, result.crawl);
  onStep({
    key: 'seo',
    label: '解析 SEO 要素',
    status: 'done',
    detail: '体检 ' + result.seo.checks.length + ' 项 · 正文约 ' + result.seo.wordCount.total + ' 词',
  });

  // 5.5 GEO（生成式引擎优化 / AI 搜索就绪度）
  onStep({ key: 'geo', label: '分析 GEO 生成引擎优化就绪度', status: 'start' });
  result.geo = buildGeo({
    seo: result.seo,
    html,
    robotsPreview: result.crawl.robots && result.crawl.robots.found ? result.crawl.robots.preview : '',
    llms: result.llms,
    domain,
    blocked: fetchBlocked || result.page.redirectedAway,
  });
  onStep({
    key: 'geo',
    label: '分析 GEO 生成引擎优化就绪度',
    status: 'done',
    detail: (result.geo.checks || []).length + ' 项体检 · AI 爬虫 ' + (result.geo.aiCrawlers || []).filter((b) => b.status === 'blocked').length + ' 个封禁',
  });

  // 6. 技术栈（HTML + 同源 JS 资源合并识别）
  onStep({ key: 'tech', label: '识别技术栈与追踪代码', status: 'start' });
  const bundleText = await scanJsBundles(result.seo.scriptSrcs || [], page.url);
  const techFromHtml = detectTechStack(html, page.headers);
  const tech = [...techFromHtml];
  if (bundleText) {
    const fromJs = detectTechStack(bundleText, {});
    const names = new Set(tech.map((t) => t.name));
    for (const t of fromJs) {
      if (!names.has(t.name)) {
        names.add(t.name);
        tech.push({
          name: t.name,
          category: t.category,
          evidence: 'JS 资源匹配: ' + t.evidence.replace(/^HTML 匹配:\s*/, ''),
        });
      }
    }
    result.jsBundleScanned = true;
  }
  result.tech = tech;
  result.trackerIds = mergeTrackerIds(extractTrackerIds(html), bundleText ? extractTrackerIds(bundleText) : null);
  onStep({
    key: 'tech',
    label: '识别技术栈与追踪代码',
    status: 'done',
    detail: '识别到 ' + result.tech.length + ' 项技术特征' + (bundleText ? '（含 JS 资源扫描）' : ''),
  });

  // 7. 流量 + PageSpeed + RDAP（并行）
  onStep({ key: 'traffic', label: '查询流量数据（Tranco / PageSpeed）', status: 'start' });
  if (isAborted()) throw new HttpError(499, '分析已取消');
  const [traffic, pagespeed, rdap] = await Promise.all([
    getTrafficData(domain, { timeout: 25000 }),
    getPageSpeed(page.url, { timeout: 30000 }),
    getDomainAgeYears(domain, 10000),
  ]);
  result.traffic = traffic;
  result.pagespeed = pagespeed;
  result.rdap = rdap;
  if (traffic.rank != null) result.dataSources.push('Tranco 全球排名榜单（一手）');
  if (pagespeed.available) result.dataSources.push('Google PageSpeed Insights（实验室数据）');
  if (traffic.commonCrawl) result.dataSources.push('Common Crawl 索引（一手，规模信号）');
  if (rdap) result.dataSources.push('RDAP 域名注册信息（一手）');
  onStep({
    key: 'traffic',
    label: '查询流量数据（Tranco / PageSpeed）',
    status: 'done',
    detail: traffic.rank != null ? '全球排名 #' + traffic.rank.toLocaleString() : (traffic.rankReason || '无排名数据') + (pagespeed.available ? ' · PSI 可用' : ''),
  });

  // 8. 评分与建议
  onStep({ key: 'score', label: '生成评分与修改建议', status: 'start' });
  if (isAborted()) throw new HttpError(499, '分析已取消');
  result.scores = computeScores(result);
  result.suggestions = buildSuggestions(result);
  result.positives = buildPositives(result);
  result.diagnosis = buildDiagnosis(result, result.scores);
  result.durationMs = Date.now() - t0;
  result.finishedAt = new Date().toISOString();

  const p0 = result.suggestions.filter((s) => s.priority === 'P0').length;
  onStep({
    key: 'score',
    label: '生成评分与修改建议',
    status: 'done',
    detail: '综合 ' + result.scores.overall + ' 分 · ' + p0 + ' 个 P0 问题',
  });

  return result;
}

module.exports = { analyze, normalizeDomain, HttpError };
