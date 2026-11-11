'use strict';
// semrush.js / trends.js 纯函数单测（fixture 解析 + autoseo 装配，无网络）
const assert = require('assert');
const SM = require('../lib/semrush');
const TR = require('../lib/trends');
const { buildAutoSeo } = require('../lib/autoseo');

let pass = 0;
function ok(name, cond) {
  assert.ok(cond, name);
  pass++;
  console.log('  ✓ ' + name);
}

console.log('== Semrush 解析 ==');
const ovJson = {
  domain: 'example.com',
  traf: 1234567,
  traf_by_country: [
    { country: 'us', shares: 0.42, vis_ts: 518500 },
    { country: 'gb', shares: 0.15, vis_ts: 185000 },
    { country: 'in', shares: 0.1, vis_ts: 123000 },
  ],
  organic_keywords: 5400,
  organic_traffic_cost: 12000,
};
const ov = SM.parseDomainOverview(ovJson);
ok('overview 月访问=1234567', ov.monthlyVisits === 1234567);
ok('overview 国家数=3', ov.countryShares.length === 3);
ok('overview 国家按 share 降序', ov.countryShares[0].country === 'us' && ov.countryShares[0].share === 0.42);

const orgJson = [
  { domain: 'example.com', ph: 'free domain', po: 1, nq: 90000, tr: 8.5, tc: 120, cp: 2.1 },
  { domain: 'example.com', ph: 'domain name', po: 2, nq: 60000, tr: 5.0, tc: 80, cp: 1.5 },
  { domain: 'example.com', ph: 'example', po: 3, nq: 1000, tr: 1.2, tc: 5, cp: 0.5 },
];
const org = SM.parseDomainOrganic(orgJson, 1234567);
ok('organic 解析 3 词', org.length === 3);
ok('organic 搜索量 nq=90000', org[0].volume === 90000);
ok('organic 词级估算流量=round(1234567*8.5%)=' + Math.round((1234567 * 8.5) / 100), org[0].estVisits === Math.round((1234567 * 8.5) / 100));

// 无 key 优雅降级
(async () => {
  const noKey = await SM.fetchSemrush('example.com', { apiKey: '' });
  ok('无 key → available:false 且说明配置', noKey.available === false && /Semrush API key/.test(noKey.reason));

  console.log('== Trends 解析 ==');
  const tlRaw =
    ")]}'\n" +
    JSON.stringify({
      default: {
        timelineData: [
          { time: '2025-12', formattedTime: 'Dec 2025', value: ['50', '55'] },
          { time: '2026-01', formattedTime: 'Jan 2026', value: ['60', '65'] },
          { time: '2026-02', formattedTime: 'Feb 2026', value: ['70', '75'] },
        ],
        lineList: [{ keyword: 'example' }, { keyword: 'free domain' }],
      },
    });
  ok('stripPrefix 去除 )]}\\\' 前缀', TR.stripPrefix(tlRaw).trim().startsWith('{'));
  const tl = TR.parseTimeline(JSON.parse(TR.stripPrefix(tlRaw)), ['example', 'free domain']);
  ok('timeline 两个系列', tl.length === 2);
  ok('timeline 系列1 term=example', tl[0].term === 'example');
  ok('timeline 最新值=70', tl[0].points[tl[0].points.length - 1].value === 70);

  const geoRaw =
    ")]}'\n" +
    JSON.stringify({
      default: {
        geoMapData: [
          { geoName: 'United States', value: '100' },
          { geoName: 'India', value: '65' },
          { geoName: 'United Kingdom', value: '40' },
        ],
      },
    });
  const geo = TR.parseGeoMap(JSON.parse(TR.stripPrefix(geoRaw)));
  ok('geomap 3 国', geo.length === 3);
  ok('geomap 按 value 降序', geo[0].country === 'United States' && geo[0].value === 100);

  console.log('== autoseo 装配（含 semrush + trends） ==');
  const result = {
    domain: 'example.com',
    pages: [
      {
        url: 'https://example.com/',
        title: 'Example Domain',
        h1: ['Example'],
        description: 'example domain for examples',
        keywords: [{ term: 'example' }, { term: 'free domain' }],
        wordCount: { total: 500 },
        internalHrefs: ['/about', '/contact', '/blog', '/faq', '/testimonials'],
        externalHrefs: ['https://twitter.com/x'],
        jsonLd: { count: 1 },
        socialHosts: ['twitter.com'],
        hreflangs: [],
        og: { title: 'Example' },
        isHttps: true,
        mixedContentCount: 0,
      },
    ],
    seo: {
      internalHrefs: ['/about', '/contact', '/blog', '/faq', '/testimonials'],
      externalHrefs: ['https://twitter.com/x'],
      jsonLd: { count: 1 },
      socialHosts: ['twitter.com'],
      hreflangs: [],
      og: { title: 'Example' },
      mixedContentCount: 0,
    },
    traffic: {
      rank: 100,
      sw: { available: false, reason: 'sandbox' },
      semrush: {
        available: true,
        source: 'Semrush Domain Overview（API，第三方估算，非 Google 官方）',
        monthlyVisits: 1234567,
        countryShares: ov.countryShares,
        organicKeywords: 5400,
        topKeywords: org,
      },
      trends: {
        available: true,
        source: 'Google Trends（无需 key，相对热度 0-100）',
        interestOverTime: tl,
        byRegion: geo,
      },
    },
  };
  const a = buildAutoSeo(result);
  ok('autoseo.enabled', a.enabled === true);
  const tk = a.keyword.topKeywords;
  ok('关键词带 searchVolume(Semrush nq)', tk.some((k) => k.searchVolume != null));
  ok('关键词带 monthlyVisits(estVisits)', tk.some((k) => k.monthlyVisits != null));
  ok('关键词带 trendInterest', tk.some((k) => k.trendInterest != null));
  ok('国家来源来自 Semrush(3)', a.keyword.countryShares.length === 3 && a.keyword.countryShares[0].country === 'us');
  ok('swSource 标记 Semrush', /semrush/i.test(a.keyword.swSource));
  ok('trendsOverTime 已暴露', a.keyword.trendsOverTime.length === 2);
  ok('trendsByRegion 已暴露', a.keyword.trendsByRegion.length === 3);
  ok('layers.estimatedVisits 用 Semrush 来源', /Semrush/.test(a.layers.traffic.estimatedVisits.source));
  ok('dataTier 含 Semrush 行', a.dataTier.some((t) => /Semrush/.test(t)));

  console.log('\n全部通过：' + pass + ' 项');
})().catch((e) => {
  console.error('测试失败：', e);
  process.exit(1);
});
