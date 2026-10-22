'use strict';
/**
 * seo.js — 零依赖 HTML 解析与站内 SEO 体检
 * 输出结构化页面要素 + 逐项体检结论（供评分与报告渲染使用）
 */

function decodeEntities(s) {
  if (!s) return '';
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(parseInt(d, 10)));
}

function parseAttrs(attrsStr) {
  const attrs = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(attrsStr))) {
    const key = m[1].toLowerCase();
    if (attrs[key] === undefined) {
      attrs[key] = decodeEntities(
        m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : ''
      );
    }
  }
  return attrs;
}

function* iterateTags(html) {
  const re = /<([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let m;
  while ((m = re.exec(html))) {
    yield { tag: m[1].toLowerCase(), attrs: parseAttrs(m[2] || '') };
  }
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function countWords(text) {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const latin = (text.match(/[a-zA-Z]+(?:['-][a-zA-Z]+)*/g) || []).length;
  return { cjk, latin, total: cjk + latin };
}

function isInternal(href, pageHost) {
  try {
    const u = new URL(href, 'https://' + pageHost);
    return u.hostname === pageHost || u.hostname === 'www.' + pageHost || pageHost === 'www.' + u.hostname;
  } catch (e) {
    return false;
  }
}

function parseHtml(html, finalUrl, domain) {
  const pageHost = new URL(finalUrl).hostname;
  const metas = [];
  const imgs = [];
  const links = [];
  const scripts = [];
  const stylesheets = [];
  const jsonLdBlocks = [];
  let htmlLang = '';
  let charset = '';
  let canonical = '';
  let robotsMeta = '';
  let viewport = '';
  let generator = '';
  let favicon = '';
  const og = {};
  const twitter = {};
  const hreflangs = [];
  const h1s = [];
  const h2s = [];
  const socialHosts = new Set();

  for (const t of iterateTags(html)) {
    switch (t.tag) {
      case 'html':
        if (t.attrs.lang) htmlLang = t.attrs.lang;
        break;
      case 'meta': {
        metas.push(t.attrs);
        const key = (t.attrs.name || t.attrs.property || t.attrs['http-equiv'] || '').toLowerCase();
        const content = t.attrs.content || '';
        if (key === 'charset') charset = content || charset;
        if (t.attrs.charset) charset = t.attrs.charset;
        if (key === 'description' && !metas._desc) metas._desc = content;
        if (key === 'robots') robotsMeta = content;
        if (key === 'viewport') viewport = content;
        if (key === 'generator') generator = content;
        if (key.startsWith('og:')) og[key.slice(3)] = content;
        if (key.startsWith('twitter:')) twitter[key.slice(6)] = content;
        break;
      }
      case 'link': {
        const rel = (t.attrs.rel || '').toLowerCase();
        if (rel.includes('canonical')) canonical = t.attrs.href || canonical;
        else if (rel.includes('icon')) favicon = t.attrs.href || favicon;
        else if (rel.includes('alternate') && t.attrs.hreflang) hreflangs.push(t.attrs.hreflang);
        else if (rel.includes('stylesheet')) stylesheets.push(t.attrs.href || '');
        break;
      }
      case 'script': {
        scripts.push({ src: t.attrs.src || '', inline: !t.attrs.src });
        if ((t.attrs.type || '').toLowerCase() === 'application/ld+json') {
          jsonLdBlocks.push('ld+json');
        }
        break;
      }
      case 'img':
        imgs.push({
          src: t.attrs.src || t.attrs['data-src'] || '',
          alt: t.attrs.alt === undefined ? null : t.attrs.alt,
          loading: t.attrs.loading || '',
        });
        break;
      case 'a': {
        const href = t.attrs.href || '';
        if (!href || href.startsWith('#') || /^(javascript|mailto|tel):/i.test(href)) break;
        const rel = (t.attrs.rel || '').toLowerCase();
        links.push({
          href,
          internal: isInternal(href, pageHost),
          nofollow: rel.includes('nofollow'),
        });
        try {
          const h = new URL(href, finalUrl).hostname;
          if (/facebook\.com|instagram\.com|twitter\.com|x\.com|tiktok\.com|youtube\.com|linkedin\.com|pinterest\.|weibo\.com|zhihu\.com/.test(h)) {
            socialHosts.add(h);
          }
        } catch (e) {}
        break;
      }
      case 'h1':
        h1s.push('');
        break;
      case 'h2':
        h2s.push('');
        break;
      default:
        break;
    }
  }

  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch ? decodeEntities(titleMatch[1]).replace(/\s+/g, ' ').trim() : '';

  const bodyText = stripTags(html);
  const words = countWords(bodyText);

  const imgsMissingAlt = imgs.filter((i) => i.alt === null || String(i.alt).trim() === '').length;
  const imgsLazy = imgs.filter((i) => i.loading === 'lazy').length;
  const externalScripts = scripts.filter((s) => s.src && !isInternal(s.src, pageHost));
  const thirdPartyHosts = [...new Set(externalScripts.map((s) => {
    try { return new URL(s.src, finalUrl).hostname; } catch (e) { return ''; }
  }).filter(Boolean))];

  const mixedContent = [];
  if (finalUrl.startsWith('https:')) {
    for (const t of iterateTags(html)) {
      const u = t.attrs.src || t.attrs.href || '';
      if (u.startsWith('http://')) mixedContent.push(u.slice(0, 120));
    }
  }

  const jsonLdTypes = [];
  for (const m of html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || []) {
    const inner = m.replace(/<script[^>]*>|<\/script>/gi, '');
    for (const t of inner.match(/"@type"\s*:\s*"([^"]+)"/g) || []) {
      jsonLdTypes.push(t.replace(/"@type"\s*:\s*"/, '').replace(/"$/, ''));
    }
  }

  const scriptSrcs = [];
  for (const s of scripts) {
    if (!s.src) continue;
    try {
      scriptSrcs.push(new URL(s.src, finalUrl).toString());
    } catch (e) {}
  }

  const metaDescription = metas._desc || '';

  return {
    title,
    titleLength: title.length,
    metaDescription,
    descriptionLength: metaDescription.length,
    generator,
    htmlLang,
    charset,
    canonical,
    viewport,
    robotsMeta,
    favicon,
    og,
    twitter,
    hreflangs,
    h1Count: h1s.length,
    h2Count: h2s.length,
    images: { total: imgs.length, missingAlt: imgsMissingAlt, lazy: imgsLazy },
    links: {
      internal: links.filter((l) => l.internal).length,
      external: links.filter((l) => !l.internal).length,
      nofollow: links.filter((l) => l.nofollow).length,
    },
    scripts: { total: scripts.length, inline: scripts.filter((s) => s.inline).length, external: externalScripts.length, thirdPartyHosts },
    stylesheets: stylesheets.length,
    scriptSrcs,
    jsonLd: { count: jsonLdBlocks.length, types: [...new Set(jsonLdTypes)] },
    socialHosts: [...socialHosts],
    wordCount: words,
    mixedContent: mixedContent.slice(0, 10),
    mixedContentCount: mixedContent.length,
  };
}

/**
 * 站内 SEO 体检：返回逐项结论
 * crawl: { robots, sitemap } 由 analyzer 提供
 */
function auditOnPage(seo, crawl) {
  const checks = [];
  const add = (id, label, severity, weight, detail) => checks.push({ id, label, severity, weight, detail });

  const titleLen = seo.titleLength;
  if (!seo.title) add('title', 'Title 标题', 'error', 15, '页面没有 <title> 标签');
  else if (titleLen < 10) add('title', 'Title 标题', 'warn', 15, `标题过短（${titleLen} 字符）：「${seo.title}」`);
  else if (titleLen > 60) add('title', 'Title 标题', 'warn', 15, `标题过长（${titleLen} 字符），搜索结果会被截断`);
  else add('title', 'Title 标题', 'pass', 15, `「${seo.title}」（${titleLen} 字符）`);

  const dLen = seo.descriptionLength;
  if (!seo.metaDescription) add('desc', 'Meta Description', 'error', 12, '缺少描述标签，搜索结果将自动截取正文，点击率通常更低');
  else if (dLen < 50) add('desc', 'Meta Description', 'warn', 12, `描述过短（${dLen} 字符）`);
  else if (dLen > 160) add('desc', 'Meta Description', 'warn', 12, `描述过长（${dLen} 字符），超出部分不会展示`);
  else add('desc', 'Meta Description', 'pass', 12, `${dLen} 字符，长度合适`);

  if (seo.h1Count === 0) add('h1', 'H1 主标题', 'error', 10, '页面没有 H1 标签');
  else if (seo.h1Count > 1) add('h1', 'H1 主标题', 'warn', 10, `检测到 ${seo.h1Count} 个 H1，建议每页唯一`);
  else add('h1', 'H1 主标题', 'pass', 10, '唯一 H1');

  const altRatio = seo.images.total ? (seo.images.total - seo.images.missingAlt) / seo.images.total : 1;
  if (seo.images.total === 0) add('img-alt', '图片 ALT 覆盖率', 'warn', 8, '首页未检测到 <img> 图片（可能是 JS 懒加载或背景图方案）');
  else if (altRatio < 0.9) add('img-alt', '图片 ALT 覆盖率', 'warn', 8, `${seo.images.missingAlt}/${seo.images.total} 张图片缺少 alt，影响图片搜索与无障碍`);
  else add('img-alt', '图片 ALT 覆盖率', 'pass', 8, `${seo.images.total - seo.images.missingAlt}/${seo.images.total} 张图片有 alt`);

  if (!seo.canonical) add('canonical', 'Canonical 标签', 'warn', 8, '缺少 canonical，多入口（带参数/UTM）页面可能造成重复内容稀释权重');
  else add('canonical', 'Canonical 标签', 'pass', 8, '已设置 canonical');

  if (!seo.viewport) add('viewport', '移动端 viewport', 'error', 10, '缺少 viewport meta，移动端会被缩放渲染，Google 移动优先索引下影响大');
  else if (!/width\s*=\s*device-width/.test(seo.viewport)) add('viewport', '移动端 viewport', 'warn', 10, 'viewport 未声明 width=device-width');
  else add('viewport', '移动端 viewport', 'pass', 10, '已适配移动端');

  if (seo.robotsMeta && /noindex/i.test(seo.robotsMeta)) add('noindex', '索引状态', 'error', 20, `robots meta 含 noindex：${seo.robotsMeta}，页面不会被搜索引擎收录`);
  else add('noindex', '索引状态', 'pass', 20, '允许收录');

  if (crawl && crawl.robots && crawl.robots.found && crawl.sitemap && crawl.sitemap.found) add('crawl', 'robots.txt 与 sitemap.xml', 'pass', 8, `sitemap 含约 ${crawl.sitemap.urlCount} 个 URL`);
  else if (crawl && crawl.robots && crawl.robots.found) add('crawl', 'robots.txt 与 sitemap.xml', 'warn', 8, '有 robots.txt 但未发现可用 sitemap.xml');
  else add('crawl', 'robots.txt 与 sitemap.xml', 'warn', 8, '缺少 robots.txt / sitemap.xml，收录效率与索引可控性下降');

  if (seo.jsonLd.count > 0) add('jsonld', '结构化数据 JSON-LD', 'pass', 6, `检测到 ${seo.jsonLd.count} 段，类型：${seo.jsonLd.types.slice(0, 4).join(', ') || '未知'}`);
  else add('jsonld', '结构化数据 JSON-LD', 'warn', 6, '缺少 JSON-LD 结构化数据，无法获得富媒体摘要（评分星标、价格、FAQ 等）');

  if (seo.htmlLang) add('lang', 'html lang 属性', 'pass', 5, `lang="${seo.htmlLang}"`);
  else add('lang', 'html lang 属性', 'warn', 5, '缺少 lang 属性');

  // 跨境独立站关键：多语言 / 区域声明（hreflang）
  if (seo.hreflangs && seo.hreflangs.length) {
    const dup = seo.hreflangs.length !== new Set(seo.hreflangs.map((h) => h.toLowerCase())).size;
    add('hreflang', '多语言 / 区域声明 (hreflang)', dup ? 'warn' : 'pass', 6,
      (dup ? '存在重复 hreflang 值，建议去重；' : '') + '声明了 ' + seo.hreflangs.length + ' 个语言/区域版本：' + seo.hreflangs.slice(0, 8).join(', '));
  } else {
    add('hreflang', '多语言 / 区域声明 (hreflang)', 'warn', 6, '未声明 hreflang，面向多国市场的独立站易出现重复内容、被分错区域版本，影响各语种 SEO');
  }

  const ogOk = seo.og && seo.og.title && seo.og.description && seo.og.image;
  if (ogOk) add('og', 'Open Graph 社交分享标签', 'pass', 6, 'title/description/image 齐全');
  else add('og', 'Open Graph 社交分享标签', 'warn', 6, 'OG 标签不完整，社交平台分享时展示效果差');

  if (seo.wordCount.total >= 300) add('words', '首页正文词数', 'pass', 5, `约 ${seo.wordCount.total} 词`);
  else if (seo.wordCount.total >= 100) add('words', '首页正文词数', 'warn', 5, `仅约 ${seo.wordCount.total} 词，内容偏薄${seo.scripts.external > 15 ? '（可能是 JS 渲染型 SPA，爬虫可见内容更少）' : ''}`);
  else add('words', '首页正文词数', 'error', 5, `仅约 ${seo.wordCount.total} 词，首页几乎没有可索引文本`);

  if (seo.h2Count >= 2) add('h2', '标题层级 H2', 'pass', 3, `${seo.h2Count} 个 H2`);
  else add('h2', '标题层级 H2', 'warn', 3, 'H2 过少，内容结构不清晰');

  if (seo.favicon) add('favicon', 'Favicon', 'pass', 2, '已设置');
  else add('favicon', 'Favicon', 'warn', 2, '未检测到 favicon');

  if (seo.mixedContentCount > 0) add('mixed', '混合内容', 'error', 5, `HTTPS 页面引用了 ${seo.mixedContentCount} 个 http:// 资源，可能被浏览器拦截`);
  else add('mixed', '混合内容', 'pass', 5, '无混合内容');

  if (seo.twitter && seo.twitter.card) add('twitter', 'Twitter Card', 'pass', 3, seo.twitter.card);
  else add('twitter', 'Twitter Card', 'warn', 3, '缺少 twitter:card');

  if (seo.links.internal >= 10) add('internal-links', '首页内链数量', 'pass', 5, `${seo.links.internal} 个内链`);
  else add('internal-links', '首页内链数量', 'warn', 5, `仅 ${seo.links.internal} 个内链，不利于爬虫发现与权重传递`);

  return checks;
}

module.exports = { parseHtml, auditOnPage, iterateTags, decodeEntities, stripTags };
