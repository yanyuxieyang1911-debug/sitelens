'use strict';
/**
 * scoring.js — 评分引擎 + 修改建议引擎
 * 六维评分：性能 / SEO / 营销追踪 / 技术健康 / 安全合规 / 转化信任
 * 建议分级：P0（致命）P1（重要）P2（优化）
 */

const DIMENSIONS = [
  { key: 'performance', label: '性能体验', weight: 25, icon: '⚡', desc: 'TTFB、页面体积、压缩、重定向' },
  { key: 'seo', label: 'SEO 基础', weight: 20, icon: '🔍', desc: '标题/描述/H1/图片/结构化数据' },
  { key: 'marketing', label: '营销与追踪', weight: 20, icon: '📈', desc: 'GA4/GTM/广告像素/客服（独立站核心）' },
  { key: 'tech', label: '技术健康', weight: 15, icon: '🧩', desc: 'HTTPS/证书/Cookie/混合内容' },
  { key: 'security', label: '安全合规', weight: 10, icon: '🔒', desc: '安全响应头与传输加密' },
  { key: 'trust', label: '转化信任', weight: 10, icon: '🤝', desc: '支付/评论/客服/社交背书' },
];

function clamp(n, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

/** 线性插值评分：stops = [[阈值, 分数], ...] 按阈值升序 */
function ramp(value, stops) {
  if (value <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (value <= stops[i][0]) {
      const [x0, y0] = stops[i - 1];
      const [x1, y1] = stops[i];
      return y0 + (y1 - y0) * (value - x0) / (x1 - x0);
    }
  }
  return stops[stops.length - 1][1];
}

function mkItem(label, score, max, note) {
  return { label, score: Math.round(clamp(score, 0, max)), max, note: note || '' };
}

function dimScore(items) {
  const totalMax = items.reduce((s, i) => s + i.max, 0);
  const total = items.reduce((s, i) => s + i.score, 0);
  return { score: totalMax ? Math.round((total / totalMax) * 100) : 0, items };
}

// ---------- 工具 ----------
function hasTech(a, name) {
  return a.tech.some((t) => t.name === name);
}
function hasTechRe(a, re) {
  return a.tech.some((t) => re.test(t.name));
}
function techNamesByCat(a, cat) {
  return a.tech.filter((t) => t.category === cat).map((t) => t.name);
}
function hasGTM(a) {
  return hasTechRe(a, /Google Tag Manager/);
}
function parseCookies(headers) {
  let raw = headers['set-cookie'] || [];
  if (!Array.isArray(raw)) raw = [raw];
  return raw.map((c) => {
    const lower = String(c).toLowerCase();
    return {
      httpOnly: lower.includes('httponly'),
      secure: lower.includes('secure'),
      sameSite: lower.includes('samesite'),
    };
  });
}
function fmtMs(ms) {
  return ms >= 1000 ? (ms / 1000).toFixed(2) + 's' : Math.round(ms) + 'ms';
}

// ---------- 各维度评分 ----------
function scorePerformance(a) {
  const items = [];
  const p = a.page;
  items.push(mkItem('首字节响应 TTFB', ramp(p.ttfbMs, [[200, 100], [500, 80], [1000, 55], [1500, 30], [3000, 10]]), 100, '实测 ' + fmtMs(p.ttfbMs) + '（优秀 < 500ms）'));

  items.push(mkItem('页面体积', ramp(p.size, [[100 * 1024, 100], [300 * 1024, 85], [500 * 1024, 70], [1024 * 1024, 45], [3 * 1024 * 1024, 15]]), 100, '解压后 ' + (p.size / 1024).toFixed(0) + ' KB'));

  let compScore = 50;
  const c = p.compression;
  if (c === 'br') compScore = 100;
  else if (c === 'gzip') compScore = 88;
  else if (c === 'deflate') compScore = 65;
  else if (c === 'none') compScore = p.size > 30 * 1024 ? 25 : 60;
  items.push(mkItem('传输压缩', compScore, 100, 'Content-Encoding: ' + c + (p.rawSize ? '，压缩率 ' + Math.round((1 - p.size / Math.max(1, p.rawSize)) * 100) + '%' : '')));

  const hops = p.hopCount || 0;
  items.push(mkItem('重定向跳转', ramp(hops, [[0, 100], [1, 85], [2, 65], [3, 45], [4, 25]]), 100, hops === 0 ? '直达，无跳转' : hops + ' 次跳转'));

  const cc = p.headers['cache-control'];
  items.push(mkItem('缓存策略', cc ? 100 : 55, 100, cc ? 'Cache-Control: ' + String(cc).slice(0, 40) : '首页未返回 Cache-Control 头'));

  if (a.pagespeed && a.pagespeed.available && a.pagespeed.mobile && a.pagespeed.mobile.scores.performance != null) {
    items.push(mkItem('Lighthouse 性能分', a.pagespeed.mobile.scores.performance, 100, 'Google PageSpeed Insights 移动端（实验室数据）'));
  }
  return dimScore(items);
}

function scoreSeo(a) {
  const checks = a.seo.checks;
  const totalW = checks.reduce((s, c) => s + c.weight, 0);
  const got = checks.reduce((s, c) => s + c.weight * (c.severity === 'pass' ? 1 : c.severity === 'warn' ? 0.55 : 0.1), 0);
  const items = checks.map((c) =>
    mkItem(c.label, c.severity === 'pass' ? 100 : c.severity === 'warn' ? 55 : 10, 100, c.detail)
  );
  return { score: totalW ? Math.round((got / totalW) * 100) : 0, items };
}

function scoreMarketing(a) {
  const ids = a.trackerIds || {};
  const items = [];
  const push = (label, score, max, note) => items.push(mkItem(label, score, max, note));
  // 抓取被拦截时，“未检测到”不代表“未部署”，备注必须说清
  const blocked = a.page && a.page.blocked;
  const na = (normalNote) => (blocked ? '首页抓取被拦截（HTTP ' + a.page.status + '），无法检测' : normalNote);

  push('Google Analytics 4', ids.ga4 && ids.ga4.length ? 22 : 0, 22, ids.ga4 && ids.ga4.length ? 'ID: ' + ids.ga4.join(', ') : hasGTM(a) ? '页面未直接加载 GA4（可能由 GTM 容器加载，HTML 扫描不可见）' : na('未部署 GA4，无法统计自然与直接流量'));
  push('Google Tag Manager', ids.gtm && ids.gtm.length ? 12 : 0, 12, ids.gtm && ids.gtm.length ? 'ID: ' + ids.gtm.join(', ') : na('未部署 GTM，所有营销代码只能硬编码，迭代慢'));
  push('Meta Pixel', ids.meta && ids.meta.length ? 22 : 0, 22, ids.meta && ids.meta.length ? 'ID: ' + ids.meta.join(', ') : na('未检测到 Meta Pixel'));
  push('TikTok Pixel', ids.tiktok && ids.tiktok.length ? 16 : 0, 16, ids.tiktok && ids.tiktok.length ? 'ID: ' + ids.tiktok.join(', ') : na('未检测到 TikTok Pixel'));
  push('Google Ads 转化', ids.googleAds && ids.googleAds.length ? 10 : 0, 10, ids.googleAds && ids.googleAds.length ? 'ID: ' + ids.googleAds.join(', ') : na('未检测到 AW- 转化代码'));

  const otherPixelNames = techNamesByCat(a, 'pixel').filter(
    (n) => !/Meta Pixel|TikTok Pixel/.test(n)
  );
  push('其他广告像素', Math.min(8, otherPixelNames.length * 4), 8, otherPixelNames.length ? otherPixelNames.join('、') : na('无（Snapchat/Pinterest/LinkedIn 等）'));

  const chats = techNamesByCat(a, 'chat');
  push('客服 / 聊天组件', chats.length ? 10 : 0, 10, chats.length ? chats.join('、') : na('未检测到在线客服，售前咨询流失无法挽回'));

  return dimScore(items);
}

function scoreTech(a) {
  const items = [];
  const push = (label, score, max, note) => items.push(mkItem(label, score, max, note));

  const tlsOk = a.tls && a.tls.ok;
  const httpsOk = a.page.url.startsWith('https:');
  let certScore = 0;
  let certNote = '站点未使用 HTTPS';
  if (httpsOk && tlsOk) {
    const days = a.tls.daysLeft;
    certScore = days == null ? 15 : days > 60 ? 20 : days > 30 ? 15 : days > 14 ? 8 : 0;
    certNote = '证书 ' + (a.tls.daysLeft != null ? '剩余 ' + a.tls.daysLeft + ' 天' : '有效期未知') + '（' + (a.tls.issuer || '未知签发机构') + '）';
  } else if (httpsOk && !tlsOk) {
    certScore = 8;
    certNote = 'HTTPS 已启用，但证书详情获取失败';
  }
  push('HTTPS 与证书', certScore, 20, certNote);

  const proto = tlsOk ? a.tls.protocol : '';
  const tlsScore = tlsOk ? (/TLSv1\.[23]/.test(proto) ? 10 : 3) : 0;
  push('TLS 协议版本', tlsScore, 10, tlsOk ? '协商 ' + proto : '未获取（站点未启用 HTTPS 或探测失败）');

  const serverHeader = a.page.headers['server'];
  push('服务器软件可识别', serverHeader ? 10 : 4, 10, serverHeader ? 'Server: ' + serverHeader : '未返回 Server 头（不利于故障定位）');

  const cdns = techNamesByCat(a, 'cdn');
  push('CDN 加速', cdns.length ? 10 : 0, 10, cdns.length ? cdns.join('、') : '未识别到 CDN，海外访客延迟可能偏高');

  const cookies = parseCookies(a.page.headers);
  let cookieScore = 0;
  let cookieNote = '未下发 Cookie';
  if (cookies.length) {
    const first = cookies[0];
    cookieScore = (first.httpOnly ? 5 : 0) + (first.secure ? 5 : 0) + (first.sameSite ? 5 : 0);
    cookieNote =
      cookies.length + ' 个 Cookie；HttpOnly ' + (first.httpOnly ? '✓' : '✗') +
      ' / Secure ' + (first.secure ? '✓' : '✗') + ' / SameSite ' + (first.sameSite ? '✓' : '✗');
  }
  push('Cookie 安全属性', cookieScore, 15, cookieNote);

  push('无混合内容', a.seo.mixedContentCount === 0 ? 15 : 0, 15, a.seo.mixedContentCount ? a.seo.mixedContentCount + ' 个 http:// 资源被 HTTPS 页面引用' : '未发现混合内容');

  const cms = techNamesByCat(a, 'cms');
  push('建站系统识别', cms.length ? 10 : 3, 10, cms.length ? cms.join('、') : '未能识别建站系统（自研或高度定制）');

  return dimScore(items);
}

function scoreSecurity(a) {
  const h = a.page.headers;
  const items = [];
  const push = (label, score, max, note) => items.push(mkItem(label, score, max, note));
  const lower = (v) => String(v || '').toLowerCase();

  const hsts = h['strict-transport-security'];
  const hstsScore = hsts ? (/max-age\s*=\s*(\d+)/.test(lower(hsts)) && parseInt(RegExp.$1, 10) >= 15552000 ? 20 : 10) : 0;
  push('HSTS 强制加密', hstsScore, 20, hsts ? lower(hsts).slice(0, 60) : '缺少 Strict-Transport-Security 头');

  const csp = h['content-security-policy'];
  push('CSP 内容安全策略', csp ? 20 : 0, 20, csp ? '已配置 CSP' : '缺少 Content-Security-Policy，XSS 与数据注入风险高');

  push('X-Content-Type-Options', h['x-content-type-options'] ? 15 : 0, 15, h['x-content-type-options'] ? lower(h['x-content-type-options']) : '缺少 nosniff 头');

  const xfo = h['x-frame-options'];
  const frameAncestors = csp && /frame-ancestors/i.test(csp);
  push('防点击劫持', xfo || frameAncestors ? 15 : 0, 15, xfo ? lower(xfo) : frameAncestors ? 'CSP 含 frame-ancestors' : '缺少 X-Frame-Options 与 frame-ancestors');

  push('Referrer-Policy', h['referrer-policy'] ? 10 : 0, 10, h['referrer-policy'] ? lower(h['referrer-policy']) : '未设置 Referrer-Policy');

  push('Permissions-Policy', h['permissions-policy'] ? 10 : 0, 10, h['permissions-policy'] ? '已配置' : '未限制浏览器能力（摄像头/定位等）');

  push('HTTPS 传输', a.page.url.startsWith('https:') ? 10 : 0, 10, a.page.url.startsWith('https:') ? '全站 HTTPS' : 'HTTP 明文传输');

  return dimScore(items);
}

function scoreTrust(a) {
  const items = [];
  const push = (label, score, max, note) => items.push(mkItem(label, score, max, note));

  const chats = techNamesByCat(a, 'chat');
  push('在线客服', chats.length ? 15 : 0, 15, chats.length ? chats.join('、') : '无客服组件，售前流失不可挽回');

  const reviews = techNamesByCat(a, 'review');
  push('评论 / 信任签章', reviews.length ? 20 : 0, 20, reviews.length ? reviews.join('、') : '无评论系统或安全签章，新客信任成本高');

  const payments = techNamesByCat(a, 'payment');
  push('支付方式', payments.length >= 3 ? 20 : payments.length === 2 ? 14 : payments.length === 1 ? 7 : 0, 20, payments.length ? '识别到 ' + payments.length + ' 种：' + payments.join('、') : '首页未识别到支付组件（可能在结账页）');

  push('社交媒体链接', a.seo.socialHosts.length >= 2 ? 10 : a.seo.socialHosts.length === 1 ? 5 : 0, 10, a.seo.socialHosts.length ? a.seo.socialHosts.join('、') : '首页无社交媒体主页链接');

  const og = a.seo.og || {};
  push('分享卡片完整度', og.title && og.description && og.image ? 10 : 0, 10, og.title && og.description && og.image ? 'og:title/description/image 齐全' : 'OG 标签不完整');

  const types = (a.seo.jsonLd.types || []).join(' ');
  push('实体结构化数据', /Organization|Product|WebSite|Store/.test(types) ? 15 : 0, 15, types ? 'JSON-LD 类型: ' + types : '无 JSON-LD');

  const age = a.rdap && a.rdap.ageYears;
  push('域名年龄', age >= 5 ? 10 : age >= 2 ? 7 : age >= 1 ? 4 : 1, 10, age != null ? '注册于 ' + a.rdap.registeredAt + '（约 ' + age + ' 年）' : '注册信息不可查');

  return dimScore(items);
}

// ---------- 总分 ----------
function computeScores(a) {
  const dims = {};
  dims.performance = scorePerformance(a);
  dims.seo = scoreSeo(a);
  dims.marketing = scoreMarketing(a);
  dims.tech = scoreTech(a);
  dims.security = scoreSecurity(a);
  dims.trust = scoreTrust(a);

  let overall = 0;
  let weightSum = 0;
  for (const d of DIMENSIONS) {
    overall += dims[d.key].score * d.weight;
    weightSum += d.weight;
  }
  overall = Math.round(overall / weightSum);
  const grade = overall >= 85 ? 'A' : overall >= 70 ? 'B' : overall >= 55 ? 'C' : overall >= 40 ? 'D' : 'E';
  const gradeText = { A: '优秀', B: '良好', C: '中等', D: '偏弱', E: '危险' }[grade];
  return { overall, grade, gradeText, dimensions: dims };
}

// ---------- 建议引擎 ----------
const RULES = [
  // ===== P0 =====
  {
    id: 'fetch-blocked',
    priority: 'P1',
    dimension: 'tech',
    when: (a) => !!(a.page && a.page.blocked),
    title: '首页抓取被目标站点拦截，站内结论不完整',
    problem: (a) => '首页返回 HTTP ' + a.page.status + (a.page.status === 429 ? '（触发限流 / Bot 防护）' : a.page.status === 403 ? '（被 WAF / Cloudflare 挑战拦截）' : ''),
    action: '稍后重试或更换网络环境；也可人工访问首页，核对技术栈、像素与 SEO 要素的真实情况',
    impact: '性能与证书数据仍有效；但 SEO / 技术栈 / 像素类结论基于错误页，已自动抑制“未检测到”类误报',
  },
  {
    id: 'noindex',
    priority: 'P0',
    dimension: 'seo',
    when: (a) => a.seo.robotsMeta && /noindex/i.test(a.seo.robotsMeta) && !a.page.redirectedAway,
    title: '首页被设置为禁止收录（noindex）',
    problem: (a) => 'robots meta 为「' + a.seo.robotsMeta + '」',
    action: '立即移除 noindex；若在 Google Search Console / 百度站长平台也设置了不收录，一并解除',
    impact: '不修复则 SEO 全部无效，自然流量恒为 0',
  },
  {
    id: 'noindex-subdomain',
    priority: 'P2',
    dimension: 'seo',
    when: (a) => a.seo.robotsMeta && /noindex/i.test(a.seo.robotsMeta) && !!a.page.redirectedAway,
    title: '落地页（跳转目标）为 noindex，通常属正确配置',
    problem: (a) => a.domain + ' 跳转到了 ' + a.page.url + '，该页 robots 为「' + a.seo.robotsMeta + '」',
    action: '若这是结账 / 购物车子页，noindex 是正确做法，可忽略；想分析主站首页请直接访问主域地址',
    impact: '无——前提是它确实是不该被收录的功能页',
  },
  {
    id: 'ttfb-critical',
    priority: 'P0',
    dimension: 'performance',
    when: (a) => a.page.ttfbMs > 1500,
    title: '首字节响应（TTFB）过慢',
    problem: (a) => '实测 TTFB ' + fmtMs(a.page.ttfbMs) + '，超过 1.5s 高危线',
    action: '① 全站接入 CDN；② 服务端加页面缓存/对象缓存（Redis）；③ 排查慢 SQL 与阻塞的第三方接口；④ 独立站目标：TTFB < 800ms',
    impact: 'TTFB 每劣化 500ms，跳出率与转化率通常显著恶化，且直接影响搜索排名',
  },
  {
    id: 'no-https',
    priority: 'P0',
    dimension: 'security',
    when: (a) => !a.page.url.startsWith('https:'),
    title: '站点未启用 HTTPS',
    problem: '最终落地页为 HTTP 明文',
    action: '申请证书（Let\'s Encrypt 免费）并配置 301 全量跳转 HTTPS',
    impact: 'Chrome 标记"不安全"，支付页信任骤降，Google 明确降权',
  },
  {
    id: 'cert-expiring',
    priority: 'P0',
    dimension: 'tech',
    when: (a) => a.tls && a.tls.ok && a.tls.daysLeft != null && a.tls.daysLeft < 14,
    title: 'SSL 证书即将过期',
    problem: (a) => '证书仅剩余 ' + a.tls.daysLeft + ' 天',
    action: '立即续期，并配置自动续期（certbot renew / 托管平台自动续签）',
    impact: '过期后浏览器直接拦截全站，流量瞬间归零',
  },
  {
    id: 'no-analytics',
    priority: 'P0',
    dimension: 'marketing',
    when: (a) => {
      const ids = a.trackerIds || {};
      return !(ids.ga4 || []).length && !(ids.ua || []).length && !(ids.gtm || []).length;
    },
    title: '全站未检测到任何分析工具',
    problem: 'GA4 / Universal Analytics / GTM 均未部署',
    action: '先用 GTM 部署 GA4（最轻量路径），保证"看得见流量"再谈优化',
    impact: '没有数据基准，所有优化都是盲猜，广告 ROI 也无法核算',
  },
  {
    id: 'no-meta-pixel',
    priority: 'P0',
    dimension: 'marketing',
    when: (a) => !hasTechRe(a, /Meta Pixel/) && !hasGTM(a),
    title: '未检测到 Meta Pixel',
    problem: '面向 Facebook / Instagram 投放的像素缺失',
    action: '通过 GTM 部署 fbq（init + PageView），并配置 ViewContent / AddToCart / InitiateCheckout / Purchase 事件；建议同时配置 CAPI 服务端事件',
    impact: '没有像素 = 无法跑再营销广告、无法优化购买事件，投放 CPM 显著偏高',
  },
  {
    id: 'meta-pixel-via-gtm',
    priority: 'P2',
    dimension: 'marketing',
    when: (a) => !hasTechRe(a, /Meta Pixel/) && hasGTM(a),
    title: 'Meta Pixel 未在页面源码中直接检测到（GTM 托管）',
    problem: (a) => '站点通过 GTM（' + (a.trackerIds.gtm || []).join(', ') + '）管理代码，容器内的像素无法从 HTML 扫描识别',
    action: '登录 GTM 容器确认已部署 fbq 与 Purchase 事件；或提供 Pixel ID 人工核对',
    impact: '若容器内实际未部署，Meta 投放将缺少转化数据',
  },
  {
    id: 'redirect-chain',
    priority: 'P0',
    dimension: 'performance',
    when: (a) => (a.page.hopCount || 0) >= 3,
    title: '重定向链过长',
    problem: (a) => '访问首页经历 ' + a.page.hopCount + ' 次跳转',
    action: '收敛为单次跳转（http→https、www→apex 各一跳），站内链接直接写最终绝对地址',
    impact: '每多一跳增加 100-500ms 延迟并稀释爬虫权重',
  },
  {
    id: 'no-title',
    priority: 'P0',
    dimension: 'seo',
    when: (a) => !a.seo.title,
    title: '缺少 Title 标题',
    problem: '页面没有 <title> 标签',
    action: '补充唯一 Title：品牌词 + 核心品类/价值词，控制在 60 字符内',
    impact: '搜索结果展示为 URL 或无标题，点击率大幅下降',
  },
  // ===== P1 =====
  {
    id: 'ttfb-slow',
    priority: 'P1',
    dimension: 'performance',
    when: (a) => a.page.ttfbMs > 800 && a.page.ttfbMs <= 1500,
    title: '首字节响应（TTFB）偏慢',
    problem: (a) => '实测 TTFB ' + fmtMs(a.page.ttfbMs),
    action: '接 CDN、开服务端缓存、压缩动态接口耗时；目标 < 500ms',
    impact: '拖慢 LCP，影响搜索排名与付费流量落地体验',
  },
  {
    id: 'no-tiktok-pixel',
    priority: 'P1',
    dimension: 'marketing',
    when: (a) => !hasTechRe(a, /TikTok Pixel/) && !hasGTM(a) && hasTechRe(a, /Google Analytics 4|Meta Pixel/),
    title: '未检测到 TikTok Pixel',
    problem: '已有其他分析工具，但缺少 TikTok 像素',
    action: '部署 ttq.load + ViewContent/CompletePayment 等事件；TikTok 是独立站低成本起量的重要渠道',
    impact: '无法在 TikTok 投放再营销与转化广告，错失低成本流量',
  },
  {
    id: 'tiktok-pixel-via-gtm',
    priority: 'P2',
    dimension: 'marketing',
    when: (a) => !hasTechRe(a, /TikTok Pixel/) && hasGTM(a),
    title: 'TikTok Pixel 未在页面源码中直接检测到（GTM 托管）',
    problem: (a) => '站点通过 GTM（' + (a.trackerIds.gtm || []).join(', ') + '）管理代码，容器内像素不可见',
    action: '登录 GTM 容器确认是否已部署 ttq 与关键转化事件',
    impact: '若容器内未部署，TikTok 投放缺少转化数据',
  },
  {
    id: 'no-compression',
    priority: 'P1',
    dimension: 'performance',
    when: (a) => a.page.compression === 'none' && a.page.size > 20 * 1024,
    title: '未启用传输压缩',
    problem: (a) => '首页 ' + (a.page.size / 1024).toFixed(0) + 'KB 未压缩传输',
    action: 'Nginx 开启 gzip / brotli（brotli 优先），文本资源通常可减少 70%+ 体积',
    impact: '直接拖慢首屏，移动端流量消耗翻倍',
  },
  {
    id: 'page-too-big',
    priority: 'P1',
    dimension: 'performance',
    when: (a) => a.page.size > 800 * 1024,
    title: '首页体积过大',
    problem: (a) => '解压后 ' + (a.page.size / 1024).toFixed(0) + 'KB',
    action: '拆分关键 CSS、延迟加载非首屏 JS、压缩图片为 WebP/AVIF、清除未使用代码',
    impact: '体积 > 800KB 时移动端首屏通常超过 4s',
  },
  {
    id: 'missing-security-headers',
    priority: 'P1',
    dimension: 'security',
    when: (a) => {
      const h = a.page.headers;
      const missing = [];
      if (!h['strict-transport-security']) missing.push('HSTS');
      if (!h['content-security-policy']) missing.push('CSP');
      if (!h['x-content-type-options']) missing.push('X-Content-Type-Options');
      if (!h['x-frame-options']) missing.push('X-Frame-Options');
      return missing.length >= 2;
    },
    title: '多项安全响应头缺失',
    problem: (a) => {
      const h = a.page.headers;
      const missing = [];
      if (!h['strict-transport-security']) missing.push('HSTS');
      if (!h['content-security-policy']) missing.push('CSP');
      if (!h['x-content-type-options']) missing.push('X-Content-Type-Options');
      if (!h['x-frame-options']) missing.push('X-Frame-Options');
      if (!h['referrer-policy']) missing.push('Referrer-Policy');
      return '缺失：' + missing.join('、');
    },
    action: '在 Nginx/CDN 层补齐安全头（CSP 可先从 report-only 模式灰度）',
    impact: 'XSS、点击劫持、MIME 嗅探风险上升，部分企业客户采购审计会卡此项',
  },
  {
    id: 'no-sitemap',
    priority: 'P1',
    dimension: 'seo',
    when: (a) => !(a.crawl.sitemap && a.crawl.sitemap.found),
    title: '缺少 sitemap.xml',
    problem: '未发现可用的 sitemap.xml',
    action: '生成并提交 sitemap 至 Google Search Console 与百度站长平台；robots.txt 中声明 Sitemap 地址',
    impact: '收录发现效率下降，新页面/新品页索引变慢',
  },
  {
    id: 'no-canonical',
    priority: 'P1',
    dimension: 'seo',
    when: (a) => !a.seo.canonical,
    title: '缺少 Canonical 标签',
    problem: 'UTM 参数、追踪链接会产生多个重复版本',
    action: '为每页声明 self-referencing canonical',
    impact: '重复内容稀释权重，落地页排名被分流',
  },
  {
    id: 'no-viewport',
    priority: 'P1',
    dimension: 'seo',
    when: (a) => !a.seo.viewport,
    title: '缺少移动端 viewport',
    problem: '未声明 width=device-width',
    action: '添加 <meta name="viewport" content="width=device-width, initial-scale=1">',
    impact: 'Google 移动优先索引下排名受损，移动端体验差',
  },
  {
    id: 'no-chat',
    priority: 'P1',
    dimension: 'marketing',
    when: (a) => !hasTechRe(a, /Intercom|Zendesk|Crisp|Tawk\.to|Tidio|Drift|LiveChat|WhatsApp|美洽|SaleSmartly|Chatra|Jivosite|Messenger/),
    title: '无在线客服组件',
    problem: '独立站售前咨询无承接',
    action: '部署 WhatsApp / Messenger / Crisp 等聊天组件，配置自动问候语与常见问题快捷回复',
    impact: '售前疑问无人解答直接流失，行业经验客服组件可挽回 5-15% 咨询单',
  },
  {
    id: 'no-jsonld',
    priority: 'P1',
    dimension: 'seo',
    when: (a) => a.seo.jsonLd.count === 0,
    title: '缺少结构化数据（JSON-LD）',
    problem: '无法获得富媒体摘要',
    action: '为 Organization / Product / BreadcrumbList / FAQPage 添加 JSON-LD',
    impact: '搜索结果缺少星级、价格、FAQ 展示，点击率低一截',
  },
  {
    id: 'cookie-flags',
    priority: 'P1',
    dimension: 'tech',
    when: (a) => {
      const cookies = parseCookies(a.page.headers);
      return cookies.length > 0 && !(cookies[0].httpOnly && cookies[0].secure && cookies[0].sameSite);
    },
    title: 'Cookie 安全属性不完整',
    problem: '首个 Cookie 缺少 HttpOnly / Secure / SameSite 中的部分属性',
    action: '服务端下发 Cookie 时补齐三个属性（会话 Cookie 设 HttpOnly+Secure+SameSite=Lax/Strict）',
    impact: '会话被窃取 / CSRF 风险上升',
  },
  {
    id: 'mixed-content',
    priority: 'P1',
    dimension: 'tech',
    when: (a) => a.seo.mixedContentCount > 0,
    title: '存在混合内容',
    problem: (a) => a.seo.mixedContentCount + ' 个 http:// 资源被 HTTPS 页面引用',
    action: '全量替换为 https:// 或协议相对地址',
    impact: '浏览器拦截资源导致页面残缺，地址栏安全标识消失',
  },
  {
    id: 'payment-single',
    priority: 'P1',
    dimension: 'trust',
    when: (a) => techNamesByCat(a, 'payment').length === 1,
    title: '支付方式单一',
    problem: (a) => '仅识别到：' + techNamesByCat(a, 'payment').join('、'),
    action: '至少补充信用卡直连收单（Stripe/Airwallex/Oceanpayment 等）+ PayPal；欧美市场加 Klarna/Afterpay 分期',
    impact: '支付方式是独立站弃单率的第一大因素，单一渠道弃单率可高出 10-20 个百分点',
  },
  {
    id: 'thin-content',
    priority: 'P1',
    dimension: 'seo',
    when: (a) => a.seo.wordCount.total < 300,
    title: '首页内容过薄',
    problem: (a) => '可索引正文约 ' + a.seo.wordCount.total + ' 词',
    action: '补充品类卖点、使用场景、信任背书、FAQ；JS 渲染型站点务必做 SSR/SSG',
    impact: '内容薄 = 关键词覆盖少 + 转化理由不足',
  },
  // ===== P2 =====
  {
    id: 'title-length',
    priority: 'P2',
    dimension: 'seo',
    when: (a) => a.seo.title && (a.seo.titleLength < 10 || a.seo.titleLength > 60),
    title: 'Title 长度不理想',
    problem: (a) => '当前 ' + a.seo.titleLength + ' 字符：「' + a.seo.title.slice(0, 50) + '」',
    action: '控制在 30-60 字符，品牌词后置，核心词前置',
    impact: '过长被截断、过短浪费展示位',
  },
  {
    id: 'desc-issues',
    priority: 'P2',
    dimension: 'seo',
    when: (a) => !a.seo.metaDescription || a.seo.descriptionLength < 50 || a.seo.descriptionLength > 160,
    title: 'Meta Description 待优化',
    problem: (a) => a.seo.metaDescription ? a.seo.descriptionLength + ' 字符' : '缺失',
    action: '写 80-155 字符的行动导向描述，含核心词与差异化卖点',
    impact: '描述是免费的"广告文案"，直接影响点击率',
  },
  {
    id: 'h1-issues',
    priority: 'P2',
    dimension: 'seo',
    when: (a) => a.seo.h1Count !== 1,
    title: 'H1 标签异常',
    problem: (a) => a.seo.h1Count === 0 ? '无 H1' : a.seo.h1Count + ' 个 H1',
    action: '每页唯一 H1，包含核心关键词',
    impact: 'H1 是页面主题最强信号',
  },
  {
    id: 'img-alt',
    priority: 'P2',
    dimension: 'seo',
    when: (a) => a.seo.images.total > 0 && (a.seo.images.total - a.seo.images.missingAlt) / a.seo.images.total < 0.9,
    title: '图片 ALT 覆盖率不足',
    problem: (a) => a.seo.images.missingAlt + '/' + a.seo.images.total + ' 张图片缺 alt',
    action: '为内容图片补描述性 alt（含关键词自然变体）',
    impact: '图片搜索流量 + 无障碍合规',
  },
  {
    id: 'og-incomplete',
    priority: 'P2',
    dimension: 'trust',
    when: (a) => {
      const og = a.seo.og || {};
      return !(og.title && og.description && og.image);
    },
    title: '社交分享卡片不完整',
    problem: 'og:title / og:description / og:image 未全部配置',
    action: '补全 OG 三件套与 twitter:card，分享到 FB/WhatsApp/TG 时才有像样卡片',
    impact: '社交传播时的免费曝光位被浪费',
  },
  {
    id: 'no-lazy-load',
    priority: 'P2',
    dimension: 'performance',
    when: (a) => a.seo.images.total >= 5 && a.seo.images.lazy / a.seo.images.total < 0.5,
    title: '图片缺少懒加载',
    problem: (a) => a.seo.images.lazy + '/' + a.seo.images.total + ' 张图片使用 loading="lazy"',
    action: '首屏图片保留 eager，其余加 loading="lazy" 与解码占位',
    impact: '减少首屏并发请求，LCP 更稳',
  },
  {
    id: 'no-google-ads',
    priority: 'P2',
    dimension: 'marketing',
    when: (a) => hasTechRe(a, /Google Analytics 4/) && !hasTechRe(a, /Google Ads/),
    title: '未检测到 Google Ads 转化代码',
    problem: '有 GA4 但无 AW- 转化追踪',
    action: '通过 GTM 部署 AW- 代码并配置 purchase 转化，与 GA4 受众打通',
    impact: '投放 Google 购物/搜索广告时无法出价优化',
  },
  {
    id: 'no-review',
    priority: 'P2',
    dimension: 'trust',
    when: (a) => techNamesByCat(a, 'review').length === 0,
    title: '无评论 / 信任签章组件',
    problem: '未识别到 Yotpo / Judge.me / Trustpilot / Norton 等',
    action: '接入评论系统并申请 Norton/McAfee 安全签章，结账页展示退换货政策',
    impact: '新客对陌生独立站的信任缺口需要第三方背书弥补',
  },
  {
    id: 'few-internal-links',
    priority: 'P2',
    dimension: 'seo',
    when: (a) => a.seo.links.internal < 10,
    title: '首页内链过少',
    problem: (a) => '仅 ' + a.seo.links.internal + ' 个内链',
    action: '增加品类页/热门产品/博客内容的入口链接',
    impact: '爬虫发现效率与站内权重传递下降',
  },
  {
    id: 'no-twitter-card',
    priority: 'P2',
    dimension: 'trust',
    when: (a) => !(a.seo.twitter && a.seo.twitter.card),
    title: '缺少 Twitter Card',
    problem: '无 twitter:card 标签',
    action: '补 twitter:card=summary_large_image 与对应标题/图片',
    impact: 'X 平台分享无大图卡片',
  },
];

// 抓取被目标站点拦截（HTTP 4xx/5xx、Cloudflare 挑战）时，
// 以下“未检测到 X”类规则一律抑制——基于错误页得出的缺失结论都是误报
const FETCH_BLOCKED_SUPPRESSED = new Set([
  'no-analytics',
  'no-meta-pixel',
  'meta-pixel-via-gtm',
  'no-tiktok-pixel',
  'tiktok-pixel-via-gtm',
  'no-google-ads',
  'no-chat',
  'no-review',
]);

// 域名跳转到了其他子域（如主域 → 结账子域）时，
// 针对“首页内容”的规则同样抑制——落地页不是用户要查的主站
const REDIRECTED_AWAY_SUPPRESSED = new Set(['no-title', 'thin-content']);

function buildSuggestions(a) {
  const out = [];
  const seen = new Set();
  for (const r of RULES) {
    if (seen.has(r.id)) continue;
    if (a.page && a.page.blocked && FETCH_BLOCKED_SUPPRESSED.has(r.id)) continue;
    if (a.page && a.page.redirectedAway && REDIRECTED_AWAY_SUPPRESSED.has(r.id)) continue;
    let cond = false;
    try {
      cond = r.when(a);
    } catch (e) {
      cond = false;
    }
    if (!cond) continue;
    seen.add(r.id);
    out.push({
      id: r.id,
      priority: r.priority,
      dimension: r.dimension,
      title: r.title,
      problem: typeof r.problem === 'function' ? r.problem(a) : r.problem,
      action: r.action,
      impact: r.impact,
    });
  }
  const order = { P0: 0, P1: 1, P2: 2 };
  out.sort((x, y) => order[x.priority] - order[y.priority]);
  return out;
}

// ---------- 亮点 ----------
function buildPositives(a) {
  const out = [];
  const ids = a.trackerIds || {};
  const add = (title, detail) => out.push({ title, detail });

  if (a.page.ttfbMs <= 400) add('响应速度快', 'TTFB 仅 ' + fmtMs(a.page.ttfbMs));
  if (a.page.url.startsWith('https:') && a.tls && a.tls.ok && a.tls.daysLeft > 60) add('证书健康', 'HTTPS 正常，证书剩余 ' + a.tls.daysLeft + ' 天');
  if (a.page.compression === 'br' || a.page.compression === 'gzip') add('已启用传输压缩', 'Content-Encoding: ' + a.page.compression);
  if ((ids.ga4 || []).length && (ids.gtm || []).length) add('分析体系完整', 'GA4 + GTM 均已部署');
  if ((ids.meta || []).length && (ids.tiktok || []).length) add('主流广告像素齐全', 'Meta + TikTok 双通道可投放');
  if (a.seo.title && a.seo.titleLength >= 10 && a.seo.titleLength <= 60) add('Title 长度规范', a.seo.titleLength + ' 字符');
  if (a.seo.jsonLd.count > 0) add('有结构化数据', a.seo.jsonLd.types.slice(0, 3).join(', ') || 'JSON-LD 存在');
  if (techNamesByCat(a, 'chat').length) add('有客服组件', techNamesByCat(a, 'chat').join('、'));
  if (techNamesByCat(a, 'payment').length >= 2) add('支付渠道多元', techNamesByCat(a, 'payment').join('、'));
  if (a.crawl.sitemap && a.crawl.sitemap.found) add('sitemap 已配置', '约 ' + a.crawl.sitemap.urlCount + ' 个 URL');
  if (a.rdap && a.rdap.ageYears >= 3) add('老域名', '注册约 ' + a.rdap.ageYears + ' 年，信任积淀较好');
  if (a.seo.mixedContentCount === 0 && a.page.url.startsWith('https:')) add('无混合内容', '资源引用干净');
  return out;
}

// ---------- 一句话诊断 ----------
function buildDiagnosis(a, scores) {
  const dims = Object.entries(scores.dimensions).map(([k, v]) => ({ key: k, label: (DIMENSIONS.find((d) => d.key === k) || {}).label || k, score: v.score }));
  dims.sort((x, y) => x.score - y.score);
  const worst = dims[0];
  const best = dims[dims.length - 1];
  const p0 = a.suggestions.filter((s) => s.priority === 'P0').length;
  const p1 = a.suggestions.filter((s) => s.priority === 'P1').length;
  const trafficLine = a.traffic.rank
    ? '全球排名约 #' + a.traffic.rank.toLocaleString() + '，月访问估算 ' + Math.round(a.traffic.estimate.mid / 10000) + ' 万'
    : '未进入 Tranco 全球前 100 万，体量偏小或为新站';
  const blockedLine = a.page && a.page.blocked
    ? '⚠️ 首页抓取被拦截（HTTP ' + a.page.status + '），性能数据有效，但 SEO / 技术栈 / 像素类结论基于错误页，仅供参考，请人工复核。'
    : '';
  return (
    '综合 ' + scores.overall + ' 分（' + scores.grade + ' / ' + scores.gradeText + '）：最薄弱维度是「' + worst.label + '」（' + worst.score + ' 分），最强是「' + best.label + '」（' + best.score + ' 分）；当前 ' + p0 + ' 个 P0、' + p1 + ' 个 P1 级问题。流量侧：' + trafficLine + '（估算口径见报告脚注）。建议按 P0 → P1 → P2 顺序修复。' + blockedLine
  );
}

module.exports = {
  DIMENSIONS,
  computeScores,
  buildSuggestions,
  buildPositives,
  buildDiagnosis,
  techNamesByCat,
  fmtMs,
};
