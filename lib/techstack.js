'use strict';
/**
 * techstack.js — 技术栈 / 营销追踪代码指纹识别（独立站场景）
 * 输入 HTML + 响应头，输出分类识别结果与证据
 */

const SIGNATURES = [
  // ---------- CMS / 建站系统 ----------
  { name: 'WordPress', cat: 'cms', re: /wp-content|wp-includes|wp-json|<meta[^>]+name=["']generator["'][^>]+WordPress/i },
  { name: 'Shopify', cat: 'cms', re: /cdn\.shopify\.com|myshopify\.com|Shopify\.theme|shopify-section|shopify\.pay/i },
  { name: 'Wix', cat: 'cms', re: /wixstatic\.com|parastorage\.com|wix-code|wix\.com/i },
  { name: 'Squarespace', cat: 'cms', re: /squarespace|sqsp\.(com|net)|static1\.squarespace/i },
  { name: 'Webflow', cat: 'cms', re: /webflow|website-files\.com|wf-brand/i },
  { name: 'Magento', cat: 'cms', re: /Mage\.Cookies|magestore|skin\/frontend|varien|magento/i },
  { name: 'Drupal', cat: 'cms', re: /Drupal\.|drupal\.js|sites\/default\/files|data-drupal-selector/i },
  { name: 'Joomla', cat: 'cms', re: /joomla|\/media\/system\/js\/|Joomla!/i },
  { name: 'Ghost', cat: 'cms', re: /ghost-(sdk|search)|generator["'][^>]*Ghost|@tryghost/i },
  { name: 'PrestaShop', cat: 'cms', re: /prestashop|PrestaShop/i },
  { name: 'OpenCart', cat: 'cms', re: /opencart|route=common|index\.php\?route=/i },
  { name: 'BigCommerce', cat: 'cms', re: /bigcommerce|bigcartel/i },
  { name: 'SHOPLINE', cat: 'cms', re: /shopline|sl-icms|shoplineapp/i },
  { name: 'Shoplazza（店匠）', cat: 'cms', re: /shoplazza|shoplazza\.com/i },
  { name: 'Ueeshop', cat: 'cms', re: /ueeshop/i },
  { name: 'AllValue（有赞）', cat: 'cms', re: /allvalue|youzan/i },
  { name: 'ECSHOP', cat: 'cms', re: /ecshop/i },
  // ---------- 前端框架 ----------
  { name: 'Next.js', cat: 'framework', re: /_next\/static|__NEXT_DATA__/ },
  { name: 'Nuxt.js', cat: 'framework', re: /__NUXT__|_nuxt\// },
  { name: 'React', cat: 'framework', re: /data-reactroot|react\.production\.min\.js|react-dom/i },
  { name: 'Vue.js', cat: 'framework', re: /data-v-[0-9a-f]{8}|vue\.runtime|vue\.min\.js|__vue__/i },
  { name: 'Angular', cat: 'framework', re: /ng-version|angular(\.min)?\.js/i },
  { name: 'jQuery', cat: 'framework', re: /jquery[-.]?\d|jquery\.min\.js/i },
  { name: 'Bootstrap', cat: 'framework', re: /bootstrap(\.min)?\.(css|js)/i },
  { name: 'Tailwind CSS', cat: 'framework', re: /tailwindcss|tailwind\.min\.css|cdn\.tailwindcss/i },
  { name: 'Alpine.js', cat: 'framework', re: /alpinejs|x-data=/i },
  // ---------- 服务器 / CDN（headerOnly: 仅响应头识别，避免 HTML 文本误报） ----------
  { name: 'Nginx', cat: 'server', headerOnly: true, header: 'server', re: /nginx/i },
  { name: 'Apache', cat: 'server', headerOnly: true, header: 'server', re: /apache/i },
  { name: 'LiteSpeed', cat: 'server', headerOnly: true, header: 'server', re: /litespeed/i },
  { name: 'Microsoft IIS', cat: 'server', headerOnly: true, header: 'server', re: /iis/i },
  { name: 'OpenResty', cat: 'server', headerOnly: true, header: 'server', re: /openresty/i },
  { name: 'Vercel', cat: 'server', headerOnly: true, header: ['x-vercel-id', 'server'], re: /vercel/i },
  { name: 'Netlify', cat: 'server', headerOnly: true, header: ['x-nf-request-id', 'server'], re: /netlify/i },
  { name: 'Cloudflare', cat: 'cdn', headerOnly: true, header: ['cf-ray', 'server'], re: /cloudflare/i },
  { name: 'AWS CloudFront', cat: 'cdn', header: ['x-amz-cf-id', 'via'], re: /cloudfront/i, htmlRe: /\.cloudfront\.net/i },
  { name: 'Akamai', cat: 'cdn', headerOnly: true, header: ['x-akamai-', 'x-check-cacheable', 'server'], re: /akamai/i },
  { name: 'Fastly', cat: 'cdn', headerOnly: true, header: ['x-served-by', 'x-fastly', 'via'], re: /fastly/i },
  { name: '阿里云 CDN', cat: 'cdn', headerOnly: true, header: ['via', 'x-cache', 'ali-swift'], re: /cn\d+\.(cache|lb)\.aliyuncs|l2cn\d+/i },
  { name: '腾讯云 CDN', cat: 'cdn', headerOnly: true, header: ['x-cache-lookup', 'via'], re: /From Cache|cds\.(cache|b\.net)/i },
  { name: 'GitHub Pages', cat: 'server', headerOnly: true, header: 'server', re: /github\.com/i },
  // ---------- 分析与统计 ----------
  { name: 'Google Analytics 4', cat: 'analytics', re: /G-[A-Z0-9]{6,}/ },
  { name: 'Universal Analytics（旧版）', cat: 'analytics', re: /UA-\d{4,}-\d+/ },
  { name: 'Google Tag Manager', cat: 'analytics', re: /GTM-[A-Z0-9]{4,}|googletagmanager\.com\/gtm\.js/i },
  { name: 'Google Ads', cat: 'analytics', re: /AW-\d{9,}|googleadservices|conversion\.js/i },
  { name: 'Microsoft Clarity', cat: 'analytics', re: /clarity\.ms/ },
  { name: 'Hotjar', cat: 'analytics', re: /static\.hotjar\.com|hjSiteSettings/ },
  { name: 'Yandex Metrica', cat: 'analytics', re: /mc\.yandex\.(ru|com)/ },
  { name: '百度统计', cat: 'analytics', re: /hm\.baidu\.com/ },
  { name: '友盟+', cat: 'analytics', re: /cnzz\.com|umeng/ },
  { name: 'GrowingIO', cat: 'analytics', re: /growingio/ },
  { name: '神策数据', cat: 'analytics', re: /sensorsdata|sa\.distributed/ },
  { name: 'Plausible', cat: 'analytics', re: /plausible\.io/ },
  { name: 'Umami', cat: 'analytics', re: /umami/ },
  { name: 'Statcounter', cat: 'analytics', re: /statcounter\.com/ },
  // ---------- 广告像素（独立站投放核心） ----------
  { name: 'Meta Pixel（Facebook/Instagram）', cat: 'pixel', re: /fbq\(|connect\.facebook\.net|facebook\.net\/en_US\/fbevents/i },
  { name: 'TikTok Pixel', cat: 'pixel', re: /ttq\.(load|track|page|identify)|analytics\.tiktok\.com/i },
  { name: 'Snapchat Pixel', cat: 'pixel', re: /snaptr\(|sc-static\.net\/scevent/i },
  { name: 'Pinterest Tag', cat: 'pixel', re: /pintrk\(|s\.pinimg\.com\/ct\/core\.js/i },
  { name: 'Twitter/X Pixel', cat: 'pixel', re: /twq\(|static\.ads-twitter\.com|analytics\.twitter\.com/i },
  { name: 'LinkedIn Insight Tag', cat: 'pixel', re: /snap\.licdn\.com|_linkedin_partner_id/i },
  { name: 'Kwai Pixel', cat: 'pixel', re: /kwai\.net|kwaicdn|kwaiads/i },
  { name: 'Bing UET', cat: 'pixel', re: /bat\.bing\.com|uetq\(/i },
  { name: 'Reddit Pixel', cat: 'pixel', re: /rdt\(|redditstatic|reddit\.com\/tr\//i },
  { name: 'Quora Pixel', cat: 'pixel', re: /qp\.quora\.com|quora\.com\/_\/ad\//i },
  { name: 'Criteo', cat: 'pixel', re: /criteo|dynamic\.criteo\.com/i },
  // ---------- 支付（结账转化能力） ----------
  { name: 'PayPal', cat: 'payment', re: /paypal\.com\/sdk|paypalobjects|paypal\.com\/buttons/i },
  { name: 'Stripe', cat: 'payment', re: /js\.stripe\.com|stripe\.com\/v3/ },
  { name: 'Klarna', cat: 'payment', re: /klarna/ },
  { name: 'Afterpay / Clearpay', cat: 'payment', re: /afterpay|clearpay|zip\.co/i },
  { name: 'Adyen', cat: 'payment', re: /adyen/ },
  { name: 'Checkout.com', cat: 'payment', re: /checkout\.com/i },
  { name: 'Braintree', cat: 'payment', re: /braintree|braintreegateway/ },
  { name: 'Authorize.Net', cat: 'payment', re: /authorize\.net/i },
  { name: 'Square', cat: 'payment', re: /squareup\.com|square\.site/i },
  { name: 'Razorpay', cat: 'payment', re: /razorpay/ },
  { name: 'Mollie', cat: 'payment', re: /mollie/ },
  { name: '2Checkout', cat: 'payment', re: /2checkout|verifone/ },
  { name: 'Oceanpayment（钱海）', cat: 'payment', re: /oceanpayment/ },
  { name: 'PingPong', cat: 'payment', re: /pingpongx|pingpongpay/ },
  { name: 'Airwallex（空中云汇）', cat: 'payment', re: /airwallex/ },
  { name: 'Asiabill', cat: 'payment', re: /asiabill/ },
  { name: '连连支付', cat: 'payment', re: /lianlianpay|global\.lianlian/ },
  { name: 'Paymentwall', cat: 'payment', re: /paymentwall/ },
  // ---------- 客服 / 聊天 ----------
  { name: 'Intercom', cat: 'chat', re: /intercom|widget\.intercom\.io/ },
  { name: 'Zendesk', cat: 'chat', re: /zdassets|zendesk/ },
  { name: 'Crisp', cat: 'chat', re: /crisp\.chat/ },
  { name: 'Tawk.to', cat: 'chat', re: /tawk\.to|embed\.tawk/ },
  { name: 'Tidio', cat: 'chat', re: /tidio|tidiochat/ },
  { name: 'Drift', cat: 'chat', re: /drift\.com|driftt/ },
  { name: 'LiveChat', cat: 'chat', re: /livechat|livechatinc/ },
  { name: 'Facebook Messenger 聊天插件', cat: 'chat', re: /connect\.facebook\.net.*customerchat|fb-customerchat/i },
  { name: 'WhatsApp 组件', cat: 'chat', re: /wa\.me|api\.whatsapp\.com|whatsapp-button/i },
  { name: '美洽', cat: 'chat', re: /meiqia/ },
  { name: 'SaleSmartly', cat: 'chat', re: /salesmartly/ },
  { name: 'Chatra', cat: 'chat', re: /chatra/ },
  { name: 'Jivosite', cat: 'chat', re: /jivosite/ },
  // ---------- 评论 / 信任 ----------
  { name: 'Yotpo', cat: 'review', re: /yotpo/ },
  { name: 'Judge.me', cat: 'review', re: /judge\.me|cdn\.judge\.me/ },
  { name: 'Loox', cat: 'review', re: /loox/ },
  { name: 'Stamped.io', cat: 'review', re: /stamped\.io/ },
  { name: 'Trustpilot', cat: 'review', re: /trustpilot|widget\.trustpilot/ },
  { name: 'Reviews.io', cat: 'review', re: /reviews\.io/ },
  { name: 'Okendo', cat: 'review', re: /okendo/ },
  { name: 'Norton / Symantec 安全签章', cat: 'review', re: /trustlogo|shield\.norton|seal\.norton|symantec/i },
  { name: 'McAfee SECURE', cat: 'review', re: /mcafeesecure|scanalert/ },
  // ---------- 营销 / CRM ----------
  { name: 'Mailchimp', cat: 'marketing', re: /mailchimp|list-manage\.com|chimpstatic/ },
  { name: 'Klaviyo', cat: 'marketing', re: /klaviyo/ },
  { name: 'Omnisend', cat: 'marketing', re: /omnisend/ },
  { name: 'HubSpot', cat: 'marketing', re: /hs-scripts\.com|js\.hsanalytics|hscollectedforms/ },
  { name: 'ActiveCampaign', re: /activecampaign|trackcmp/, cat: 'marketing' },
  { name: 'Brevo（Sendinblue）', cat: 'marketing', re: /sibautomation|brevo|sendinblue/ },
  { name: 'Privy', cat: 'marketing', re: /privy\.com|widget\.privy|privy-/i },
  { name: 'Justuno', cat: 'marketing', re: /justuno/ },
  { name: 'OptinMonster', cat: 'marketing', re: /optinmonster/ },
  // ---------- 其他 ----------
  { name: 'Google reCAPTCHA', cat: 'misc', re: /recaptcha|grecaptcha/ },
  { name: 'hCaptcha', cat: 'misc', re: /hcaptcha/ },
  { name: 'Cloudflare Turnstile', cat: 'misc', re: /challenges\.cloudflare\.com\/turnstile/ },
  { name: 'Google Maps', cat: 'misc', re: /maps\.googleapis\.com|google\.com\/maps\/embed/ },
  { name: 'YouTube 嵌入', cat: 'misc', re: /youtube\.com\/embed|youtube-nocookie\.com\/embed/ },
  { name: 'Google Fonts', cat: 'misc', re: /fonts\.googleapis\.com|fonts\.gstatic\.com/ },
];

const CAT_LABELS = {
  cms: '建站系统 / CMS',
  framework: '前端框架',
  server: '服务器软件',
  cdn: 'CDN / 加速',
  analytics: '分析统计',
  pixel: '广告像素',
  payment: '支付方式',
  chat: '客服聊天',
  review: '评论 / 信任组件',
  marketing: '营销自动化 / CRM',
  misc: '其他组件',
};

function snippet(text, match) {
  const start = Math.max(0, (match.index || 0) - 20);
  return text.slice(start, start + 60).replace(/\s+/g, ' ').trim();
}

function detectTechStack(html, headers) {
  const found = [];
  const seen = new Set();
  for (const sig of SIGNATURES) {
    let evidence = null;
    if (sig.header) {
      const headerNames = Array.isArray(sig.header) ? sig.header : [sig.header];
      for (const hn of headerNames) {
        const hv = headers[hn];
        if (hv && sig.re.test(String(hv))) {
          evidence = `响应头 ${hn}: ${String(hv).slice(0, 60)}`;
          break;
        }
      }
    }
    if (!evidence && !sig.headerOnly) {
      const re = sig.htmlRe || sig.re;
      const m = re.exec(html);
      if (m) evidence = 'HTML 匹配: ' + snippet(html, m);
    }
    if (evidence && !seen.has(sig.name)) {
      seen.add(sig.name);
      found.push({ name: sig.name, category: sig.cat, evidence });
    }
  }
  return found;
}

/** 提取关键追踪 ID（用于报告展示与营销评分） */
function extractTrackerIds(html) {
  const ids = {
    ga4: [...new Set((html.match(/G-[A-Z0-9]{6,}/g) || []))],
    ua: [...new Set((html.match(/UA-\d{4,}-\d+/g) || []))],
    gtm: [...new Set((html.match(/GTM-[A-Z0-9]{4,}/g) || []))],
    googleAds: [...new Set((html.match(/AW-\d{9,}/g) || []))],
    meta: [...new Set((html.match(/fbq\(\s*['"]init['"]\s*,\s*['"]([^'"]+)['"]/g) || []).map((s) => s.replace(/^fbq\(\s*['"]init['"]\s*,\s*['"]/, '').replace(/['"]$/, '')))],
    tiktok: [...new Set((html.match(/ttq\.load\(\s*['"]([^'"]+)['"]/g) || []).map((s) => s.replace(/^ttq\.load\(\s*['"]/, '').replace(/['"]$/, '')))],
    snapchat: [...new Set((html.match(/snaptr\(\s*['"]init['"]\s*,\s*['"]([^'"]+)['"]/g) || []).map((s) => s.replace(/^snaptr\(\s*['"]init['"]\s*,\s*['"]/, '').replace(/['"]$/, '')))],
    pinterest: [...new Set((html.match(/pintrk\(\s*['"]load['"]\s*,\s*['"](\d+)['"]/g) || []).map((s) => s.replace(/^pintrk\(\s*['"]load['"]\s*,\s*['"]/, '').replace(/['"]$/, '')))],
  };
  return ids;
}

module.exports = { detectTechStack, extractTrackerIds, SIGNATURES, CAT_LABELS };
