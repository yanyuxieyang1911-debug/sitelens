'use strict';
/**
 * keywords.js — 零依赖关键词自动化
 *
 * 能力：
 *  1. extractKeywords(html, pageUrl)   从单页抽取加权关键词候选
 *  2. classifyIntent(term)             意图分类：信息型 / 对比型 / 交易型 / 其他
 *  3. categorize(term, brandToken)     词类分层：核心 / 长尾 / 问答 / 竞品 / 品牌
 *  4. buildKeywordMap(pages)           关键词 → 页面映射 + 意图/词类分布
 *  5. detectCannibalization(map)       同词多页抢排名（keyword cannibalization）
 *  6. suggestExpansions(seed, opts)    基于种子词生成挖词扩展（问答/长尾/对比/交易）
 *  7. auditPageTargeting(page, pk)     单页关键词定位审计（标题/H1/URL/描述是否命中）
 *
 * 说明：本模块只做「站内可抓取内容」的自动分析，不连接 GSC / Ahrefs / Semrush。
 *      真实搜索量、排名、外链需用这些平台 API 回填（见 autoseo.js 的 manual 槽位）。
 */

const EN_STOP = new Set((
  'a an the and or but if then else when at by for with without about into over under of to in on ' +
  'is are was were be been being am do does did done have has had having will would shall should ' +
  'can could may might must this that these those it its it\'s he she they them his her their our ' +
  'we you your i me my mine ours yours theirs as at from up down out off so such than too very just ' +
  'not no nor only also more most less least new now old all any both each few many much other some ' +
  'what which who whom whose how why where there here get got using use used via per using our your ' +
  'product products service services company companies business businesses world global home page ' +
  'pages site website web online shop store free best top high quality good great premium professional ' +
  'one two three first second main main find learn read see view show more info information contact ' +
  'us our we offer providing provide solutions solution help need want looking look make made making ' +
  'item items cart checkout buy buying order orders shipping delivery sale sales price prices cost ' +
  'com www http https html php www net org cn en us uk eu de fr es it nl se no dk fi ie ch at be ' +
  'click here enter search results related related post tag tags category categories blog article ' +
  'articles news about terms privacy policy cookie cookies menu navigation footer header sidebar'
).split(/\s+/));

const CJK_STOP = new Set(
  '的 了 和 与 及 或 在 是 我 你 他 她 它 们 这 那 有 个 为 以 也 都 就 而 及 等 被 把 让 由 从 向 到 ' +
  '对 于 对 但 并 因为 所以 如果 虽然 但是 我们 你们 他们 自己 什么 怎么 如何 这个 那个 这些 那些 ' +
  '可以 通过 进行 使用 提供 包括 以及 或者 一种 一个 一些 没有 不是 就是 还是 因为 所以 并且 而且 ' +
  '公司 产品 我们 您 您的 网站 首页 关于 联系 业务 服务 解决方案 更多 了解 查看 点击 这里 进入'
);

const INTENT_RULES = [
  {
    intent: 'transactional',
    label: '交易型',
    // 买 / 价格 / 批发 / 厂家 / 采购 等明确转化意图
    re: /(\b(buy|purchase|order|shop|cheap|wholesale|manufacturer|supplier|factory|quote|price|pricing|cost|discount|coupon|for sale|free shipping|near me|rent|hire|book|subscribe|sign up)\b)|(买|价格|报价|批发|厂家|工厂|供应商|采购|直销|定做|定制|货源|多少钱|下单|订购|招商)/i,
  },
  {
    intent: 'comparison',
    label: '对比型',
    re: /(\b(vs|versus|compare|comparison|difference|alternative|alternatives|better than|vs\.|or)\b)|(对比|区别|和.*?哪个|哪个好|评测|推荐|排名|vs\.?|还是)/i,
  },
  {
    intent: 'informational',
    label: '信息型',
    re: /(\b(how|what|why|when|where|who|which|guide|tutorial|tips|idea|ideas|examples?|meaning|definition|explain|learn|beginners?)\b)|(怎么|如何|什么|为什么|哪里|教程|指南|攻略|是什么|意思|方法|步骤|百科)/i,
  },
];

const QUESTION_RE = /^\s*(how|what|why|when|where|who|which|is|are|can|should|do|does|did|will|would|怎么|如何|什么|为什么|哪里|是否|能不能)\b|吗[?？]?$|\?$/i;

function tokenizeEn(text) {
  // 仅保留字母数字与连字符，拆分 camelCase / 连字符
  const lower = text.toLowerCase();
  const out = [];
  const re = /[a-z0-9]+(?:['-][a-z0-9]+)*/g;
  let m;
  while ((m = re.exec(lower))) out.push(m[0]);
  return out;
}

function cjkNgrams(text, n) {
  const out = [];
  for (let i = 0; i + n <= text.length; i++) out.push(text.slice(i, i + n));
  return out;
}

function isCjk(ch) {
  return /[一-鿿]/.test(ch);
}

/**
 * 从单页抽取关键词候选。
 * 返回 { title, h1, h2, description, terms:[{term,score,freq,sources}], rawLen }
 * sources 取值：title / h1 / h2 / description / body
 */
function extractKeywords(html, pageUrl) {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '';
  const h1s = [];
  const h2s = [];
  const descMatch = /<meta[^>]+name\s*=\s*["']?description["']?[^>]*content\s*=\s*["']([^"']*)["']/i.exec(html) ||
    /<meta[^>]+content\s*=\s*["']([^"']*)["'][^>]*name\s*=\s*["']?description["']?/i.exec(html);
  const description = descMatch ? descMatch[1].replace(/\s+/g, ' ').trim() : '';

  const hRe = /<h([12])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let hm;
  while ((hm = hRe.exec(html))) {
    const txt = hm[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (hm[1] === '1') h1s.push(txt);
    else h2s.push(txt);
  }

  // 正文：去脚本样式后取纯文本
  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ');

  const rawLen = bodyText.length;
  const scores = new Map(); // term -> {score, freq, sources:Set}
  const add = (term, weight, source) => {
    if (!term || term.length < 2) return;
    const e = scores.get(term) || { score: 0, freq: 0, sources: new Set() };
    e.score += weight;
    e.freq += 1;
    e.sources.add(source);
    scores.set(term, e);
  };

  // 标题 / H1 / H2：高权重
  const titleTokens = tokenizeEn(title);
  titleTokens.forEach((t) => add(t, 5, 'title'));
  cjkNgrams(title.replace(/<[^>]+>/g, ''), 2).forEach((g) => { if (!CJK_STOP.has(g)) add(g, 4, 'title'); });
  h1s.forEach((h) => {
    tokenizeEn(h).forEach((t) => add(t, 3, 'h1'));
    cjkNgrams(h, 2).forEach((g) => { if (!CJK_STOP.has(g)) add(g, 2, 'h1'); });
  });
  h2s.forEach((h) => {
    tokenizeEn(h).forEach((t) => add(t, 2, 'h2'));
    cjkNgrams(h, 2).forEach((g) => { if (!CJK_STOP.has(g)) add(g, 1.5, 'h2'); });
  });
  if (description) {
    tokenizeEn(description).forEach((t) => add(t, 2, 'description'));
    cjkNgrams(description, 2).forEach((g) => { if (!CJK_STOP.has(g)) add(g, 1.2, 'description'); });
  }

  // 正文：一元 + 二元（英文），CJK 2-4 元
  const tokens = tokenizeEn(bodyText);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.length >= 3 && !EN_STOP.has(t) && !/^\d+$/.test(t)) add(t, 1, 'body');
    if (i + 1 < tokens.length) {
      const big = tokens[i] + ' ' + tokens[i + 1];
      if (!EN_STOP.has(tokens[i]) && !EN_STOP.has(tokens[i + 1])) add(big, 1.4, 'body');
    }
  }
  // CJK 2/3/4 元
  const cjkRun = bodyText.replace(/[^\u4e00-\u9fff]/g, '');
  for (const n of [2, 3, 4]) {
    cjkNgrams(cjkRun, n).forEach((g) => { if (!CJK_STOP.has(g)) add(g, n === 2 ? 0.8 : 1.0, 'body'); });
  }

  const terms = [...scores.entries()]
    .map(([term, e]) => ({ term, score: Math.round(e.score * 10) / 10, freq: e.freq, sources: [...e.sources] }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 40);

  return { title, h1: h1s, h2: h2s, description, terms, rawLen };
}

function classifyIntent(term) {
  for (const r of INTENT_RULES) {
    if (r.re.test(term)) return { intent: r.intent, label: r.label, confidence: 0.8 };
  }
  return { intent: 'other', label: '其他 / 导航', confidence: 0.3 };
}

function categorize(term, brandToken) {
  const t = term.toLowerCase();
  if (brandToken && t.includes(brandToken.toLowerCase())) return 'brand';
  if (QUESTION_RE.test(term) || /^(how|what|why|when|where|who|which|怎么|如何|什么|为什么|哪里)/i.test(term)) return 'question';
  // 竞品：含 vs / versus / 对比 / 与 X 比较
  if (/\b(vs|versus)\b|对比|和.*比|比较/.test(term)) return 'competitor';
  const words = term.split(/\s+/).filter(Boolean);
  const modifiers = /(best|top|cheap|wholesale|manufacturer|supplier|factory|for|in|near|online|custom|customized|2024|2025|2026|guide|review|price)/i;
  if (words.length >= 3 || modifiers.test(term) || /[\u4e00-\u9fff]{4,}/.test(term)) return 'longtail';
  return 'core';
}

/**
 * 构建关键词 → 页面映射。
 * pages: [{ url, title, h1, h2, keywords:[{term,score,freq,sources}], primaryKeyword }]
 * 返回 { keywords:Map(term->{term,intent,category,pages:[{url,score}],totalScore}),
 *         intentDist, categoryDist, primaryByPage }
 */
function buildKeywordMap(pages) {
  const map = new Map();
  const intentDist = { informational: 0, comparison: 0, transactional: 0, other: 0 };
  const categoryDist = { core: 0, longtail: 0, question: 0, competitor: 0, brand: 0 };

  for (const p of pages) {
    const brandToken = (p.url ? p.url : '').split('/')[2] || '';
    const seen = new Set();
    for (const kw of p.keywords || []) {
      const term = kw.term;
      if (seen.has(term)) continue;
      seen.add(term);
      let entry = map.get(term);
      if (!entry) {
        const intent = classifyIntent(term);
        const cat = categorize(term, brandToken.split('.')[0]);
        entry = { term, intent: intent.intent, intentLabel: intent.label, category: cat, pages: [], totalScore: 0 };
        intentDist[intent.intent] = (intentDist[intent.intent] || 0) + 1;
        categoryDist[cat] = (categoryDist[cat] || 0) + 1;
        map.set(term, entry);
      }
      entry.pages.push({ url: p.url, score: kw.score });
      entry.totalScore += kw.score;
    }
  }

  const primaryByPage = pages.map((p) => ({
    url: p.url,
    title: p.title,
    primaryKeyword: p.primaryKeyword || (p.keywords && p.keywords[0] ? p.keywords[0].term : ''),
  }));

  return { keywords: map, intentDist, categoryDist, primaryByPage };
}

/**
 * 检测关键词互相抢词（cannibalization）。
 * 判定：一个词出现在 ≥2 个页面，且至少 2 个页面把它作为高权重词（score≥该页前 5 名阈值）。
 */
function detectCannibalization(map) {
  const issues = [];
  for (const entry of map.keywords.values()) {
    if (entry.pages.length < 2) continue;
    const urls = entry.pages.map((p) => p.url);
    // 高权重页面数（score≥6 视为该页重点词）
    const strong = entry.pages.filter((p) => p.score >= 6);
    if (strong.length >= 2) {
      issues.push({
        term: entry.term,
        intent: entry.intent,
        intentLabel: entry.intentLabel,
        category: entry.category,
        pages: urls,
        strongPages: strong.map((p) => p.url),
        severity: strong.length >= 3 ? 'high' : 'medium',
      });
    }
  }
  issues.sort((a, b) => b.pages.length - a.pages.length);
  return issues;
}

/**
 * 基于种子词生成挖词扩展建议（不连外网，按意图模板生成）。
 * opts: { lang:'en'|'zh', market:'', audience:'' }
 */
function suggestExpansions(seed, opts) {
  opts = opts || {};
  const lang = opts.lang || 'en';
  const market = opts.market || (lang === 'zh' ? '中国' : 'USA');
  const audience = opts.audience || (lang === 'zh' ? '工厂' : 'factory');
  const s = (seed || '').trim();
  if (!s) return [];
  const out = [];
  const push = (term, intent, category, why) => out.push({ term, intent, intentLabel: intentLabelOf(intent), category, why });

  if (lang === 'zh') {
    push('什么是' + s, 'informational', 'question', '问答型：承接「认知阶段」流量');
    push(s + '怎么选', 'informational', 'question', '问答型：决策前教育内容');
    push(s + '和' + s + '的区别', 'comparison', 'competitor', '对比型：截获竞品/方案对比搜索');
    push(s + '价格', 'transactional', 'longtail', '交易型：高转化长尾');
    push(s + '厂家', 'transactional', 'longtail', '交易型：供应链/批发意图');
    push(s + '批发', 'transactional', 'longtail', '交易型：B2B 采购意图');
    push(s + ' ' + market + ' ' + audience, 'transactional', 'longtail', '区域+受众长尾，转化价值高');
    push(' best ' + s, 'comparison', 'longtail', '对比型：best 类搜索');
  } else {
    push('what is ' + s, 'informational', 'question', 'Question: top-of-funnel awareness');
    push('how to choose ' + s, 'informational', 'question', 'Question: pre-decision education');
    push(s + ' vs ' + s + ' alternative', 'comparison', 'competitor', 'Comparison: capture competitor/alternative search');
    push(s + ' price', 'transactional', 'longtail', 'Transactional: high-converting long tail');
    push(s + ' manufacturer', 'transactional', 'longtail', 'Transactional: B2B supplier intent');
    push(s + ' wholesale', 'transactional', 'longtail', 'Transactional: bulk purchase intent');
    push(s + ' for ' + audience + ' in ' + market, 'transactional', 'longtail', 'Geo + audience long tail, high intent');
    push('best ' + s, 'comparison', 'longtail', 'Comparison: best-of search');
  }
  return out;
}

function intentLabelOf(intent) {
  return { informational: '信息型', comparison: '对比型', transactional: '交易型', other: '其他 / 导航' }[intent] || '其他 / 导航';
}

/**
 * 单页关键词定位审计：核心词是否命中标题/H1/URL slug/描述。
 * page: { url, title, keywords, primaryKeyword }
 */
function auditPageTargeting(page, primaryKeyword) {
  const pk = (primaryKeyword || page.primaryKeyword || '').toLowerCase();
  const title = (page.title || '').toLowerCase();
  const url = (page.url || '').toLowerCase();
  const desc = (page.description || '').toLowerCase();
  if (!pk) return { ok: false, checks: [], note: '未识别到核心词，先确定该页目标词再做审计' };
  const slug = url.split('?')[0].replace(/^https?:\/\//, '').split('/').pop().replace(/\.html?$/, '');
  const checks = [
    { label: '核心词在 Title', pass: title.includes(pk), detail: title.includes(pk) ? '✓' : '建议把核心词放进标题前段' },
    { label: '核心词在 H1', pass: (page.h1Text || '').toLowerCase().includes(pk), detail: (page.h1Text || '').toLowerCase().includes(pk) ? '✓' : 'H1 应含核心词' },
    { label: '核心词在 URL', pass: slug.includes(pk.replace(/\s+/g, '-')), detail: slug.includes(pk.replace(/\s+/g, '-')) ? '✓' : 'URL 静态化并包含核心词' },
    { label: '核心词在 Description', pass: desc.includes(pk), detail: desc.includes(pk) ? '✓' : '描述含核心词可提升点击率' },
  ];
  const passCount = checks.filter((c) => c.pass).length;
  return { ok: passCount >= 3, passCount, total: checks.length, checks };
}

module.exports = {
  extractKeywords,
  classifyIntent,
  categorize,
  buildKeywordMap,
  detectCannibalization,
  suggestExpansions,
  auditPageTargeting,
  intentLabelOf,
  EN_STOP,
  CJK_STOP,
};
