'use strict';
/**
 * autoseo.js — 自动 SEO 编排（覆盖用户 SEO 岗六大模块 + 节奏打法 + 四层指标）
 *
 * 输入：analyzer 产出的 result（需含 result.pages：已爬取页面的结构化数据，含首页）
 * 输出：result.autoseo = {
 *   enabled, pagesCrawled,
 *   keyword:{ topKeywords, intentDist, categoryDist, cannibalization, suggestions, pageTargeting },
 *   content:{ trustSignals, eeAtRating, thinPages, topicIdeas },
 *   offpage:{ outboundProfile, backlinkNeeds, disavowWorkflow, brandMonitoring, manual },
 *   layers:{ traffic, conversion, technical, commercial },
 *   rhythm:{ daily, weekly, monthly, quarterly },
 *   dataTier:[...]   // 口径标注：一手自动 vs 需接入 GSC/Ahrefs/GA4
 * }
 *
 * 口径铁律：本工具只做「站内可抓取内容」自动分析。搜索量、真实排名、外链数量、
 * 自然会话、转化、成交等一律标记为「需接入 GSC / Ahrefs / Semrush / GA4」手动/API 回填，
 * 绝不编造数字（与 SiteLens 整体口径一致）。
 */

const KW = require('./keywords');
const TS = require('./trafficsrc');

// ---- 内容/E-E-A-T 信任页探测 ----
const TRUST_PATTERNS = [
  { key: 'about', label: '关于我们 About', re: /\/(about|about-us|company|our-story|profile)/i },
  { key: 'contact', label: '联系我们 Contact', re: /\/(contact|contact-us|get-in-touch|inquiry|enquiry)/i },
  { key: 'blog', label: '博客/资讯 Blog', re: /\/(blog|news|articles?|insights|resources|knowledge)/i },
  { key: 'faq', label: 'FAQ 问答', re: /\/(faq|questions|help-center)/i },
  { key: 'testimonial', label: '客户案例/评价', re: /\/(testimonials?|reviews?|cases?|customers?|clients?)/i },
  { key: 'privacy', label: '隐私政策 Privacy', re: /\/(privacy|privacy-policy)/i },
  { key: 'terms', label: '服务条款 Terms', re: /\/(terms|terms-of-service|legal)/i },
  { key: 'cert', label: '认证/资质', re: /\/(certification|certificates?|quality|factory-tour|production)/i },
];

function pathOf(href, domain) {
  try {
    return new URL(href, 'https://' + domain).pathname;
  } catch (e) {
    return href;
  }
}

function analyzeContentSignals(result) {
  const home = result.seo || {};
  const internalHrefs = home.internalHrefs || [];
  const domain = result.domain;
  const found = {};
  for (const p of TRUST_PATTERNS) {
    found[p.key] = internalHrefs.some((h) => p.re.test(pathOf(h, domain)));
  }
  const trustSignals = TRUST_PATTERNS.map((p) => ({
    key: p.key,
    label: p.label,
    found: found[p.key],
  }));

  // E-E-A-T 评分：信任页齐全度 + 结构化数据 + 社交图谱 + 多语言
  const mustHave = ['about', 'contact', 'blog', 'faq', 'testimonial'];
  const haveMust = mustHave.filter((k) => found[k]).length;
  let score = 0;
  score += (haveMust / mustHave.length) * 50; // 信任页 50 分
  score += (home.jsonLd && home.jsonLd.count > 0 ? 15 : 0); // 实体结构化 15
  score += (home.socialHosts && home.socialHosts.length >= 2 ? 15 : home.socialHosts && home.socialHosts.length === 1 ? 8 : 0); // 社交知识图谱 15
  score += (home.hreflangs && home.hreflangs.length ? 10 : 0); // 多区域 10
  score += (home.og && home.og.title ? 10 : 0); // 品牌展示一致性 10
  score = Math.round(Math.min(100, score));
  const eeAtRating = score >= 75 ? '强' : score >= 50 ? '中' : '弱';

  // 薄弱页面（内容稀薄）：基于已爬页面词数
  const thinPages = (result.pages || [])
    .filter((p) => (p.wordCount && p.wordCount.total != null ? p.wordCount.total < 300 : false))
    .map((p) => ({ url: p.url, words: p.wordCount ? p.wordCount.total : 0 }));

  // 选题建议：从 top 关键词生成问答/对比型待建内容（填补意图缺口）
  const map = KW.buildKeywordMap(result.pages || []);
  const topCore = [...map.keywords.values()]
    .filter((e) => e.category === 'core' || e.category === 'longtail')
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, 6);
  const topicIdeas = [];
  for (const e of topCore) {
    if (e.intent !== 'informational') {
      topicIdeas.push({ type: '问答/指南', topic: '怎么选 ' + e.term + '（采购避坑指南）', intent: 'information', from: e.term });
    }
    if (e.intent !== 'comparison') {
      topicIdeas.push({ type: '对比页', topic: e.term + ' vs 竞品：参数/价格/交付对比', intent: 'comparison', from: e.term });
    }
  }
  topicIdeas.push({ type: '案例', topic: '客户案例：用 ' + (topCore[0] ? topCore[0].term : '本产品') + ' 解决的真实问题', intent: 'trust', from: 'E-E-A-T' });
  topicIdeas.push({ type: 'FAQ', topic: '行业高频 FAQ 聚合（承接长尾问答流量）', intent: 'information', from: '长尾词覆盖' });

  return { trustSignals, eeAtScore: score, eeAtRating, thinPages, topicIdeas, haveMust, mustTotal: mustHave.length };
}

function analyzeOffpage(result) {
  const home = result.seo || {};
  const externalHosts = home.externalHosts || [];
  const outboundProfile = {
    outboundDomainCount: externalHosts.length,
    topDomains: externalHosts.slice(0, 12),
    note: externalHosts.length
      ? '首页向 ' + externalHosts.length + ' 个外部域名出链，需排查是否含低质/不相关站（可能稀释权重或被视作链接农场）'
      : '首页未检测到出站链接',
  };
  const backlinkNeeds = {
    needsApi: true,
    metrics: [
      { key: 'referringDomains', label: '引用域名数（Referring Domains）', source: 'Ahrefs / Semrush / GSC 链接报告', manual: true },
      { key: 'domainRating', label: '域名权威 DA/DR', source: 'Ahrefs DR / Moz DA', manual: true },
      { key: 'followRatio', label: 'dofollow / nofollow 比例', source: 'Ahrefs', manual: true },
      { key: 'spamScore', label: '垃圾外链占比 / Spam Score', source: 'Semrush / Moz', manual: true },
      { key: 'topAnchor', label: '锚文本分布（是否过度优化「精确匹配」）', source: 'Ahrefs', manual: true },
    ],
  };
  const disavowWorkflow = [
    '用 Ahrefs/Semrush 导出全部反链，按 DA 与相关性排序',
    '标记明显垃圾/付费/不相关链接（色情、赌博、PBN、链轮）',
    '在 Google Search Console 生成并上传 disavow.txt（仅处理确认有害链接）',
    '提交后观察 2–4 周索引与排名变化，勿频繁提交',
  ];
  const brandMonitoring = [
    '社媒：Facebook / Instagram / LinkedIn / X(Twitter) / TikTok 品牌词提及',
    '论坛与行业平台：Reddit、Quora、行业 BBS、知乎、贴吧',
    '新闻与媒体：Google Alerts / Mention / Brand24 设置品牌词监控',
    '负面舆情：出现即响应，沉淀正面 UGC 作为信任资产',
  ];
  const manual = {
    backlinks: null,
    referringDomains: null,
    domainRating: null,
    monthlyBudget: null, // 外链/内容预算（高级岗自定）
  };
  return { outboundProfile, backlinkNeeds, disavowWorkflow, brandMonitoring, manual };
}

function analyzeLayers(result) {
  const traffic = result.traffic || {};
  const ps = result.pagespeed || {};
  const home = result.seo || {};
  const sw = traffic.sw || null;
  const swOk = !!(sw && sw.available);

  // 第一层 流量与排名（过程指标）
  const trafficLayer = {
    organicSessions: { value: null, source: 'GA4 / GSC', manual: true, note: '自然搜索会话（UV/会话）及环比同比' },
    coreKeywordTop10: { value: null, source: 'Ahrefs / Semrush / 站长之家', manual: true, note: '进入前 10 的核心词数、前 3 词数' },
    indexedPages: { value: null, source: 'GSC 索引报告', manual: true, note: '被收录页面数、索引覆盖率、有效收录占比' },
    globalRank: {
      value: traffic.rank != null ? traffic.rank : null,
      source: traffic.rank != null ? 'Tranco 全球排名（一手）' : '无排名数据',
      manual: false,
      note: traffic.rank != null ? '全球排名 #' + traffic.rank.toLocaleString() + '（规模信号，非流量绝对值）' : '未进入 Tranco 榜单，无法给出排名口径',
    },
    estimatedVisits: swOk
      ? { value: sw.monthlyVisits != null ? sw.monthlyVisits : null, source: 'SimilarWeb 第三方估算（非 Google 官方）', manual: false, note: '全站月访问估算，量级可能与真实值偏差数倍；含国家来源与关键词月度流量' }
      : { value: null, source: 'SimilarWeb 公开估算接口', manual: true, note: sw && sw.reason ? '抓取受限：' + sw.reason + '（多为数据中心 IP 被 Bot 防护拦截，换本地网络或手动填入）' : '未抓取，需在可访问 SimilarWeb 的网络下重试' },
    organicShareTarget: { value: '40%+', source: '行业基准（外贸 B2B 健康线）', manual: false, note: '自然流量占总流量目标比例，健康 B2B 站通常 40%+' },
  };

  // 第二层 转化（核心业务指标）
  const ctaHrefs = (home.internalHrefs || []).concat(home.externalHrefs || []);
  const hasContact = ctaHrefs.some((h) => /\/(contact|quote|request|inquiry|enquiry|get-started|signup|register)/i.test(pathOf(h, result.domain)));
  const conversionLayer = {
    leadsFromOrganic: { value: null, source: 'GA4 + CRM 归因', manual: true, note: '自然流量带来的有效询盘/线索（带公司名+联系人）' },
    landingCvr: { value: null, source: 'GA4 目标/事件', manual: true, note: '落地页转化率 = 线索 / 访问' },
    organicCac: { value: null, source: '财务归因', manual: true, note: '自然渠道获客成本，对比付费投放 CAC' },
    kwToLeadAttribution: { value: null, source: 'GSC + CRM', manual: true, note: '哪些词真正带来客户而非只带来点击' },
    ctaPresent: { value: hasContact ? '已检测到转化入口' : '未检测到明确转化入口', source: '站内自动检测（一手）', manual: false, note: '站内是否具备 contact/quote/request 等询盘入口' },
  };

  // 第三层 技术健康（底线指标）
  const cwv = ps && ps.available ? ps : null;
  const technicalLayer = {
    lcp: cwv && cwv.lcp != null ? { value: cwv.lcp, pass: cwv.lcp <= 2500, source: 'PageSpeed Insights 实验室（一手）', manual: false } : { value: null, source: 'PageSpeed Insights', manual: true, note: '需接入 PSI；LCP 目标 ≤2.5s' },
    inp: cwv && cwv.inp != null ? { value: cwv.inp, pass: cwv.inp <= 200, source: 'PSI（一手）', manual: false } : { value: null, source: 'PSI', manual: true, note: 'INP 目标 ≤200ms' },
    cls: cwv && cwv.cls != null ? { value: cwv.cls, pass: cwv.cls <= 0.1, source: 'PSI（一手）', manual: false } : { value: null, source: 'PSI', manual: true, note: 'CLS 目标 ≤0.1' },
    httpsCoverage: { value: (result.pages || []).every((p) => p.isHttps !== false) ? '全站 HTTPS' : '存在非 HTTPS 页', source: '站内爬取（一手）', manual: false },
    crawlErrors: { value: null, source: 'GSC 覆盖率报告', manual: true, note: '抓取错误数、死链数、索引异常页面数' },
    mixedContent: { value: home.mixedContentCount || 0, source: '站内爬取（一手）', manual: false, note: 'HTTPS 页内的 http:// 混合资源' },
  };

  // 第四层 商业（高级岗必须背）
  const commercialLayer = {
    roi: {
      formula: 'SEO ROI = (自然渠道成交金额 − (人力成本 + 工具费 + 外链/内容预算)) / 投入',
      inputs: {
        laborCost: { value: null, manual: true, note: 'SEO 人力月成本' },
        toolCost: { value: null, manual: true, note: 'Ahrefs/Semrush/GSC 等工具费' },
        linkBudget: { value: null, manual: true, note: '外链/内容外包预算' },
        deals: { value: null, manual: true, note: '自然渠道成交金额' },
      },
      lag: 'SEO 对漏斗有 3–6 个月滞后，看累计而非单月',
    },
    brandSearchGrowth: { value: null, source: 'GSC / Google Trends', manual: true, note: '品牌词搜索量增长（品牌力间接体现）' },
    cumulativeContribution: { value: null, source: 'GA4 多渠道归因', manual: true, note: '自然流量对销售漏斗的长期累计贡献' },
  };

  return { traffic: trafficLayer, conversion: conversionLayer, technical: technicalLayer, commercial: commercialLayer };
}

function buildRhythm() {
  return {
    daily: [
      '看核心词排名波动、收录异常、抓取错误、核心词掉榜',
      '看自然流量与询盘线索，标记异常波动当天排查（算法更新/竞品/技术故障）',
      '处理紧急技术问题（页面打不开、收录掉、被惩罚迹象）',
    ],
    weekly: [
      '更新关键词库与排名表，复盘本周上线优化动作效果',
      '推进 1–2 个站内优化项（标题/内链/落地页改造）',
      '跟进开发排期，检查外链新增情况',
      '输出周报：本周动作 + 数据变化 + 下周计划',
    ],
    monthly: [
      '月度复盘：自然流量、线索量、转化率环比，计算 SEO 渠道贡献',
      '内容排期与选题会，淘汰低效内容、规划高价值新页面',
      '外链渠道盘点：高质量续投，低质渠道砍掉',
      '竞品对标：对比 2–3 个核心竞品的词库/内容/外链，找缺口',
    ],
    quarterly: [
      '关键词策略重估：市场变化、新业务线、新区域（如新增印尼语站点）',
      '技术审计全量跑一遍（CWV、索引、结构）',
      '预算与人力分配复盘，向管理层提增长方案',
    ],
  };
}

function buildAutoSeo(result) {
  const pages = result.pages || [];
  if (!pages.length) {
    return { enabled: false, reason: '未爬取到页面数据（首页不可达或被拦截）', pagesCrawled: 0 };
  }

  // 每页设定核心词并做定位审计
  const pagesForMap = pages.map((p) => {
    const kws = p.keywords || [];
    const primary = kws.length ? kws[0].term : '';
    const audit = KW.auditPageTargeting({ url: p.url, title: p.title, h1Text: (p.h1 || []).join(' '), description: p.description }, primary);
    return Object.assign({}, p, { primaryKeyword: primary, targeting: audit });
  });

  const map = KW.buildKeywordMap(pagesForMap);
  const cannibalization = KW.detectCannibalization(map);

  const topKeywords = [...map.keywords.values()]
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, 24)
    .map((e) => ({ term: e.term, intent: e.intent, intentLabel: e.intentLabel, category: e.category, pages: e.pages.length, totalScore: e.totalScore }));

  // ---- 第三方流量估算（SimilarWeb）：关键词月度流量 + 国家来源 ----
  const sw = (result.traffic && result.traffic.sw) || null;
  const volMap = sw && sw.available ? TS.matchKeywordVolume(topKeywords, sw.topKeywords) : new Map();
  const normOf = (t) => TS.normalizeTerm(t);
  topKeywords.forEach((k) => {
    k.monthlyVisits = volMap.has(normOf(k.term)) ? volMap.get(normOf(k.term)) : null;
  });
  const swKeywords = sw && sw.available ? sw.topKeywords.slice(0, 15) : [];
  const countryShares = sw && sw.available ? sw.countryShares.slice(0, 10) : [];
  const swAvailable = !!(sw && sw.available);
  const swMonthlyVisits = swAvailable ? sw.monthlyVisits : null;

  // 挖词扩展：用最强非品牌核心词作种子
  const seedEntry = [...map.keywords.values()].find((e) => e.category === 'core' || e.category === 'longtail');
  const suggestions = seedEntry ? KW.suggestExpansions(seedEntry.term, { lang: /[一-鿿]/.test(seedEntry.term) ? 'zh' : 'en' }) : [];

  const pageTargeting = pagesForMap.map((p) => ({
    url: p.url,
    primaryKeyword: p.primaryKeyword,
    passCount: p.targeting.passCount,
    total: p.targeting.total,
    ok: p.targeting.ok,
  }));

  const content = analyzeContentSignals(Object.assign({}, result, { pages: pagesForMap }));
  const offpage = analyzeOffpage(result);
  const layers = analyzeLayers(result);

  const dataTier = [
    '一手（自动抓取）：关键词抽取/意图/映射/cannibalization、E-E-A-T 信任页、出站链接、HTTPS、混合内容、Tranco 排名',
    '第三方估算（SimilarWeb 公开接口）：全站月访问量、关键词月度流量、流量国家来源（非 Google 官方，量级可能偏差数倍）',
    '需接入 GSC：真实排名、收录覆盖率、抓取错误、自然流量会话',
    '需接入 Ahrefs/Semrush/站长之家：搜索量、外链数量与质量、竞品词库',
    '需接入 GA4/CRM：转化、线索归因、CAC、SEO ROI',
  ];

  return {
    enabled: true,
    pagesCrawled: pages.length,
    keyword: {
      topKeywords,
      intentDist: map.intentDist,
      categoryDist: map.categoryDist,
      cannibalization,
      suggestions,
      pageTargeting,
      swKeywords,
      countryShares,
      swAvailable,
      swMonthlyVisits,
      swSource: swAvailable ? (sw.source || 'SimilarWeb 第三方估算') : (sw ? sw.reason || '抓取受限' : '未抓取'),
    },
    content,
    offpage,
    layers,
    rhythm: buildRhythm(),
    dataTier,
  };
}

module.exports = { buildAutoSeo, analyzeContentSignals, analyzeOffpage, analyzeLayers, buildRhythm };
