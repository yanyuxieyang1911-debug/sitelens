'use strict';
/**
 * geo.js — GEO（Generative Engine Optimization，生成式引擎优化 / AI 搜索优化）维度
 * 评估站点被 ChatGPT / Perplexity / Gemini / Bing Copilot / Claude / 豆包 等
 * AI 引擎检索并引用的"可引用性"与"实体清晰度"。
 *
 * ⚠️ 口径铁律：本模块度量的是"结构就绪度"（AI 引擎偏好的技术特征），
 * 而非实际被引用的次数。真实引用量需调用各 AI 平台 API 或品牌监测，
 * 本工具不抓取 AI 回答，相关数字一律标注为"就绪度评估"，禁止对外宣称"已被引用 N 次"。
 */

/**
 * 已知 AI 爬虫 / 抓取代理（用于解析 robots.txt 指令）
 * 来源：各平台公开文档（OpenAI GPTBot、Google-Extended、Anthropic ClaudeBot、PerplexityBot 等）
 */
const AI_BOTS = [
  { key: 'GPTBot', label: 'GPTBot（OpenAI / ChatGPT）' },
  { key: 'Google-Extended', label: 'Google-Extended（Gemini / AI Overviews）' },
  { key: 'GoogleOther', label: 'GoogleOther（Google 通用抓取）' },
  { key: 'ClaudeBot', label: 'ClaudeBot（Anthropic / Claude）' },
  { key: 'ChatGPT-User', label: 'ChatGPT-User（ChatGPT 联网浏览）' },
  { key: 'PerplexityBot', label: 'PerplexityBot（Perplexity）' },
  { key: 'Applebot-Extended', label: 'Applebot-Extended（Apple Intelligence）' },
  { key: 'Bytespider', label: 'Bytespider（ByteDance / 豆包）' },
  { key: 'CCBot', label: 'CCBot（Common Crawl，多数 AI 训练语料来源）' },
  { key: 'Omgilibot', label: 'Omgilibot（Brave Web Search）' },
];

/**
 * 解析 robots.txt 文本，返回每个主流 AI 爬虫的指令状态
 * 返回：{ hasRobots, anyBlocked, perBot: { botKey: 'allowed'|'blocked'|'partial'|'unknown' } }
 */
function parseAiCrawlerDirectives(robotsText) {
  const perBot = {};
  AI_BOTS.forEach((b) => (perBot[b.key] = 'unknown'));
  if (!robotsText || !robotsText.trim()) {
    return { hasRobots: false, anyBlocked: false, perBot };
  }

  const lines = robotsText.split(/\r?\n/);
  const blocks = [];
  let cur = null;
  for (const raw of lines) {
    const line = raw.split('#')[0].trim();
    if (!line) continue;
    const m = line.match(/^(user-agent|allow|disallow)\s*:\s*(.*)$/i);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const val = m[2].trim();
    if (field === 'user-agent') {
      cur = { agents: [val], disallow: [], allow: [] };
      blocks.push(cur);
    } else if (cur) {
      if (field === 'disallow') cur.disallow.push(val);
      else cur.allow.push(val);
    }
  }

  function resolve(botKey) {
    let specific = null;
    let star = null;
    for (const b of blocks) {
      for (const a of b.agents) {
        const al = String(a).toLowerCase();
        if (al === botKey.toLowerCase()) specific = b;
        else if (al === '*') star = b;
      }
    }
    const blk = specific || star;
    if (!blk) return 'unknown';
    // 注意：空 Disallow（Disallow: 无值）在 robots.txt 中表示"允许全部"，不能当作封禁根路径
    const blockRoot = blk.disallow.some((d) => d === '/');
    const allowRoot = blk.allow.some((a) => a === '/' || a === '');
    if (blockRoot && !allowRoot) return 'blocked';
    if (allowRoot) return 'allowed';
    if (blk.disallow.some((d) => d !== '')) return 'partial';
    return 'allowed'; // 仅声明了 user-agent 但无实质 disallow → 视为允许
  }

  let anyBlocked = false;
  for (const bot of AI_BOTS) {
    const s = resolve(bot.key);
    perBot[bot.key] = s;
    if (s === 'blocked') anyBlocked = true;
  }
  return { hasRobots: true, anyBlocked, perBot };
}

/** 从 HTML 中提取近似纯文本长度（用于内容可提取性评估） */
function plainTextLen(html) {
  if (!html) return 0;
  const t = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length;
}

/** 扫描影响 GEO 的页面信号（E-E-A-T / FAQ / 权威引用 / 社交 / 可提取性） */
function scanSignals(html, seo, domain) {
  const lower = (html || '').toLowerCase();
  const htmlLen = html ? html.length : 1;

  // E-E-A-T · 作者/责任编辑署名
  const hasAuthor =
    /itemprop=["']author["']/i.test(html || '') ||
    /(class|rel)=["'][^"']*(author|byline|reviewer)["']/i.test(lower) ||
    /\b(written|posted|authored)\s+by\b/i.test(lower) ||
    /\bby\s+<a/i.test(lower);

  // E-E-A-T · 企业实体信任页
  const pageSignals = {
    about: /(href=["'][^"']*\babout)/i.test(html || '') || /\babout[- ]?us\b/i.test(lower),
    contact: /(href=["'][^"']*\bcontact)/i.test(html || '') || /\bcontact[- ]?us\b/i.test(lower),
    privacy: /(href=["'][^"']*\bprivacy)/i.test(html || '') || /\bprivacy[- ]?policy\b/i.test(lower),
    terms: /(href=["'][^"']*\bterms)/i.test(html || '') || /\bterms[- ]?of[- ]?(service|use)\b/i.test(lower),
  };

  // FAQ 可引用内容
  const hasFaqSchema = (seo.jsonLd && seo.jsonLd.types || []).includes('FAQPage');
  const hasFaqHeading = /(faq|frequently asked|常见问题|问答|q&a)/i.test(lower);
  const hasFaq = hasFaqSchema || hasFaqHeading;

  // 权威外链 / 引用背书（.edu / .gov / Wikipedia / Wikidata / 主流媒体）
  const outbound = [];
  const re = /href=["']https?:\/\/([^"'\/]+)/gi;
  let m;
  while ((m = re.exec(html || ''))) outbound.push(m[1].toLowerCase());
  const dom = (domain || '').toLowerCase();
  const authoritative = outbound.filter((h) => {
    if (dom && (h === dom || h.endsWith('.' + dom) || h === 'www.' + dom)) return false;
    return (
      /\.edu(\.|$)/.test(h) ||
      /\.gov(\.|$)/.test(h) ||
      /wikipedia\.org/.test(h) ||
      /wikidata\.org/.test(h) ||
      /(nytimes|bbc\.|reuters|forbes|techcrunch|theguardian|cnbc|bloomberg|wsj\.)/.test(h)
    );
  });

  // 社交 / 知识图谱存在
  const socialCount = (seo.socialHosts || []).length;

  // 内容可提取性
  const textLen = plainTextLen(html);
  const ratio = Math.min(1, textLen / htmlLen);
  const wordTotal = (seo.wordCount && seo.wordCount.total) || 0;
  const isSpa = (seo.scripts && seo.scripts.external > 15) && wordTotal < 200;

  return {
    hasAuthor,
    pageSignals,
    hasFaq,
    hasFaqSchema,
    authoritativeCount: authoritative.length,
    socialCount,
    ratio,
    textLen,
    isSpa,
    wordTotal,
  };
}

/**
 * 主入口：构建 GEO 维度的体检项 + AI 爬虫指令 + 信号摘要
 * @param {Object} opts { seo, html, robotsPreview, llms, domain, blocked }
 */
function buildGeo(opts) {
  const seo = opts.seo || {};
  const html = opts.html || '';
  const robotsPreview = opts.robotsPreview || '';
  const llms = opts.llms || { found: false };
  const blocked = !!opts.blocked;

  const checks = [];
  const add = (id, label, severity, weight, detail) =>
    checks.push({ id, label, severity, weight, detail });

  const ai = parseAiCrawlerDirectives(robotsPreview);
  const signals = scanSignals(html, seo, opts.domain);

  // 1. llms.txt 机器可读摘要
  const llmsFound = !!(llms && llms.found);
  add(
    'llms-txt',
    'llms.txt 机器可读摘要',
    llmsFound ? 'pass' : 'warn',
    10,
    llmsFound
      ? '已发布：' + (llms.url || '根目录 llms.txt')
      : '未发布 llms.txt（新兴标准：在根目录放置一份给 AI 引擎的站点摘要与允许抓取路径说明，可显著提升被引用概率）'
  );

  // 2. 结构化实体数据（JSON-LD 实体类型）
  const types = (seo.jsonLd && seo.jsonLd.types) || [];
  const ENTITY_TYPES = ['Organization', 'WebSite', 'Product', 'Brand', 'Store', 'Corporation', 'LocalBusiness', 'AggregateRating'];
  const hasEntity = types.some((t) => ENTITY_TYPES.includes(t));
  add(
    'geo-entity',
    '结构化实体数据（JSON-LD）',
    hasEntity ? 'pass' : types.length ? 'warn' : 'error',
    12,
    hasEntity
      ? '实体类型：' + types.filter((t) => ENTITY_TYPES.includes(t)).join(', ')
      : types.length
      ? '仅检测到非实体类型（' + types.join(', ') + '），缺 Organization / Product 等实体标注'
      : '无 JSON-LD 实体标注，AI 难以确认"你是谁、卖什么"'
  );

  // 3. AI 爬虫可访问性
  if (!ai.hasRobots) {
    add('geo-aicrawl', 'AI 爬虫可访问性', 'warn', 10, '未检测到 robots.txt，默认允许抓取；建议你显式声明 AI 爬虫策略（保留 GPTBot / Google-Extended / ClaudeBot / PerplexityBot）');
  } else if (ai.anyBlocked) {
    const blockedList = AI_BOTS.filter((b) => ai.perBot[b.key] === 'blocked').map((b) => b.key);
    add('geo-aicrawl', 'AI 爬虫可访问性', 'error', 10, 'robots.txt 已封禁：' + blockedList.join('、') + '，AI 引擎将无法引用本站内容');
  } else {
    add('geo-aicrawl', 'AI 爬虫可访问性', 'pass', 10, '未封禁主流 AI 爬虫（GPTBot / Google-Extended / ClaudeBot / PerplexityBot 等）');
  }

  // 4. E-E-A-T · 作者/署名信号
  add(
    'geo-eeat-author',
    '作者 / 署名信号（E-E-A-T）',
    signals.hasAuthor ? 'pass' : 'warn',
    6,
    signals.hasAuthor ? '检测到作者署名 / 责任编辑标注' : '未检测到作者署名或责任编辑，专家性（Experience/Expertise）信号弱'
  );

  // 5. E-E-A-T · 企业实体信任页
  const present = ['about', 'contact', 'privacy', 'terms'].filter((k) => signals.pageSignals[k]);
  const miss = ['about', 'contact', 'privacy', 'terms'].filter((k) => !signals.pageSignals[k]);
  add(
    'geo-eeat-entity',
    '企业信任页（About/Contact/Privacy/Terms）',
    present.length >= 3 ? 'pass' : present.length >= 1 ? 'warn' : 'error',
    8,
    present.length >= 3
      ? '齐备：' + present.join(' / ').toUpperCase()
      : '缺失：' + miss.join(' / ').toUpperCase() + '，AI 与企业客户难以核验实体可信度'
  );

  // 6. 内容可提取性（AI 可读）
  if (signals.isSpa) {
    add('geo-extractable', '内容可提取性（AI 可读）', 'error', 10, '疑似 SPA / JS 渲染：首页可索引正文仅约 ' + signals.wordTotal + ' 词，AI 爬虫难以直接读取核心内容，需 SSR/SSG');
  } else if (signals.wordTotal >= 300 && signals.ratio >= 0.05) {
    add('geo-extractable', '内容可提取性（AI 可读）', 'pass', 10, '纯文本占比约 ' + (signals.ratio * 100).toFixed(0) + '%，约 ' + signals.wordTotal + ' 词，AI 可稳定读取');
  } else {
    add('geo-extractable', '内容可提取性（AI 可读）', 'warn', 10, '正文偏薄或混排较重（词数 ' + signals.wordTotal + '，纯文本占比约 ' + (signals.ratio * 100).toFixed(0) + '%）');
  }

  // 7. FAQ 可引用内容
  add(
    'geo-faq',
    '问答 / FAQ 可引用内容',
    signals.hasFaq ? 'pass' : 'warn',
    6,
    signals.hasFaq
      ? signals.hasFaqSchema
        ? '已具备 FAQPage 结构化数据，易被 AI 直接引用作答'
        : '检测到 FAQ 板块，建议补 FAQPage 结构化数据以强化引用'
      : '缺少 FAQ / 问答板块，AI 难以直接引用"标准答案"'
  );

  // 8. 权威外链 / 引用背书
  add(
    'geo-citations',
    '权威外链 / 引用背书',
    signals.authoritativeCount > 0 ? 'pass' : 'warn',
    6,
    signals.authoritativeCount > 0
      ? '引用权威来源 ' + signals.authoritativeCount + ' 处（.edu / .gov / Wikipedia / 主流媒体）'
      : '未发现指向 .edu / .gov / Wikipedia / 主流媒体的权威引用，内容可信度信号弱'
  );

  // 9. 社交 / 知识图谱存在
  add(
    'geo-social',
    '社交 / 知识图谱存在',
    signals.socialCount >= 2 ? 'pass' : 'warn',
    6,
    signals.socialCount >= 2
      ? '社交主页 ' + signals.socialCount + ' 个：' + (seo.socialHosts || []).join('、')
      : '社交主页 ' + signals.socialCount + ' 个，知识图谱实体信号弱'
  );

  // 10. 品牌实体一致性（Title 与 OG 标题是否同品牌）
  const ogTitle = (seo.og && seo.og.title) || '';
  const title = seo.title || '';
  const brandOk = !!(
    title &&
    ogTitle &&
    (title.toLowerCase().indexOf(ogTitle.toLowerCase().slice(0, 8)) >= 0 ||
      ogTitle.toLowerCase().indexOf(title.toLowerCase().slice(0, 8)) >= 0)
  );
  add(
    'geo-brand',
    '品牌实体一致性',
    brandOk ? 'pass' : 'warn',
    4,
    brandOk ? 'Title 与 OG 标题品牌一致，利于 AI 实体消歧' : 'Title 与社交分享标题品牌不一致，AI 实体消歧困难'
  );

  // 抓取被拦截（HTTP 4xx / Cloudflare 挑战）或跳转脱离主域时，
  // 基于错误页得出的"缺失"结论均为误报，统一降级为 warn 并标注
  if (blocked) {
    checks.forEach((c) => {
      if (c.severity !== 'warn') {
        c.severity = 'warn';
        c.detail = c.detail + '（首页抓取被拦截，GEO 结论仅供参考）';
      }
    });
  }

  const aiCrawlers = AI_BOTS.map((b) => ({ key: b.key, label: b.label, status: ai.perBot[b.key] }));

  return {
    blocked,
    checks,
    aiCrawlers,
    llms: llms || { found: false },
    signals: {
      hasAuthor: signals.hasAuthor,
      pageSignals: signals.pageSignals,
      hasFaq: signals.hasFaq,
      hasFaqSchema: signals.hasFaqSchema,
      authoritativeCount: signals.authoritativeCount,
      socialCount: signals.socialCount,
      ratio: signals.ratio,
      isSpa: signals.isSpa,
      wordTotal: signals.wordTotal,
    },
  };
}

module.exports = { buildGeo, parseAiCrawlerDirectives, AI_BOTS };
