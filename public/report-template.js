/* report-template.js — SiteLens 报告渲染器（页面内渲染与独立 HTML 导出共用）
 * 暴露：window.renderReport(data, mount)、window.REPORT_CSS
 * 注意：本文件会被内联进导出的 HTML，因此严禁出现 script 结束标签的字面量（会被 HTML 解析器截断）
 */
(function (global) {
  'use strict';

  var REPORT_CSS = [
    '.rp{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;color:#1f2937;background:#f5f6f8;border-radius:14px;padding:20px;line-height:1.6}',
    '.rp *,.rp *::before,.rp *::after{box-sizing:border-box}',
    '.rp h2{font-size:20px;margin:0}',
    '.rp h3{font-size:15px;margin:0 0 12px;display:flex;align-items:center;gap:8px}',
    '.rp code{background:#f1f5f9;border:1px solid #e2e8f0;border-radius:5px;padding:1px 7px;font-size:12.5px;color:#0f172a;font-family:ui-monospace,SFMono-Regular,Consolas,monospace}',
    '.rp .card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px 18px;margin-bottom:14px;box-shadow:0 1px 2px rgba(15,23,42,.04)}',
    '.rp .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}',
    '@media (max-width:900px){.rp .grid2{grid-template-columns:1fr}}',
    '.rp .tier{font-size:10.5px;font-weight:600;padding:2px 7px;border-radius:99px;white-space:nowrap}',
    '.tier.t1{background:#ecfdf5;color:#047857;border:1px solid #a7f3d0}',
    '.tier.t2{background:#fff7ed;color:#c2410c;border:1px solid #fed7aa}',
    '.tier.t3{background:#f8fafc;color:#64748b;border:1px solid #e2e8f0}',
    '.verdict{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:14px;box-shadow:0 1px 3px rgba(15,23,42,.06)}',
    '.verdict-main{display:flex;gap:22px;align-items:flex-start;flex-wrap:wrap}',
    '.score-ring{width:118px;height:118px;border-radius:50%;flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff}',
    '.score-ring b{font-size:38px;line-height:1;font-weight:700}',
    '.score-ring span{font-size:11px;opacity:.85;margin-top:4px}',
    '.verdict-text{flex:1;min-width:260px}',
    '.verdict-text h2{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
    '.grade{font-size:12px;font-weight:700;padding:3px 10px;border-radius:99px}',
    '.grade.gA{background:#ecfdf5;color:#047857}.grade.gB{background:#eff6ff;color:#1d4ed8}.grade.gC{background:#fffbeb;color:#b45309}.grade.gD{background:#fff7ed;color:#c2410c}.grade.gE{background:#fef2f2;color:#b91c1c}',
    '.diagnosis{margin:10px 0 6px;color:#374151;font-size:14px}',
    '.verdict-meta{font-size:12px;color:#9ca3af}',
    '.verdict-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:16px}',
    '@media (max-width:900px){.verdict-stats{grid-template-columns:repeat(2,1fr)}}',
    '.stat{background:#f8fafc;border:1px solid #eef2f7;border-radius:10px;padding:10px 12px}',
    '.stat label{display:block;font-size:11.5px;color:#6b7280;margin-bottom:3px}',
    '.stat b{font-size:19px;color:#0f172a}',
    '.stat small{display:block;font-size:11px;color:#9ca3af;margin-top:2px}',
    '.stat .bad{color:#dc2626}',
    '.chart{width:100%;height:300px}',
    '.chart-tall{height:330px}',
    '.dim-row{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px dashed #eef2f7;font-size:13px}',
    '.dim-row:last-child{border-bottom:none}',
    '.dim-row .dim-label{width:118px;flex:none;color:#374151}',
    '.dim-row .dim-bar{flex:1;height:8px;background:#f1f5f9;border-radius:99px;overflow:hidden}',
    '.dim-row .dim-bar i{display:block;height:100%;border-radius:99px}',
    '.dim-row .dim-score{width:34px;text-align:right;font-weight:700;font-size:13px}',
    '.dim-detail{margin:4px 0 8px 128px;font-size:12px;color:#6b7280}',
    '.dim-detail li{margin:1px 0}',
    '.rp table{width:100%;border-collapse:collapse;font-size:12.8px}',
    '.rp th{background:#f8fafc;color:#475569;font-weight:600;text-align:left;padding:8px 10px;border-bottom:1px solid #e5e7eb;white-space:nowrap}',
    '.rp td{padding:8px 10px;border-bottom:1px solid #f1f5f9;vertical-align:top}',
    '.rp tr:last-child td{border-bottom:none}',
    '.pill{display:inline-block;font-size:11px;font-weight:600;padding:2px 9px;border-radius:99px;white-space:nowrap}',
    '.pill.ok{background:#ecfdf5;color:#047857}.pill.warn{background:#fffbeb;color:#b45309}.pill.err{background:#fef2f2;color:#b91c1c}.pill.info{background:#eff6ff;color:#1d4ed8}.pill.na{background:#f8fafc;color:#94a3b8}',
    '.chips{display:flex;flex-wrap:wrap;gap:6px}',
    '.chip{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:3px 10px;font-size:12px;color:#334155}',
    '.chip b{color:#0f172a;font-weight:600}',
    '.chip .jsflag{color:#7c3aed;font-size:10px;margin-left:3px}',
    '.tech-group{margin-bottom:12px}',
    '.tech-group h4{margin:0 0 6px;font-size:12.5px;color:#64748b;font-weight:600}',
    '.sugg{border:1px solid #e5e7eb;border-left-width:4px;border-radius:10px;padding:12px 14px;margin-bottom:10px;background:#fff}',
    '.sugg.p0{border-left-color:#dc2626}.sugg.p1{border-left-color:#d97706}.sugg.p2{border-left-color:#2563eb}',
    '.sugg-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px}',
    '.sugg-head .pri{font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;color:#fff}',
    '.sugg.p0 .pri{background:#dc2626}.sugg.p1 .pri{background:#d97706}.sugg.p2 .pri{background:#2563eb}',
    '.sugg-head b{font-size:14px}',
    '.sugg .row{font-size:12.8px;margin:3px 0;color:#374151}',
    '.sugg .row i{font-style:normal;font-weight:600;color:#111827;margin-right:6px}',
    '.sugg .impact{color:#6b7280;font-size:12.3px}',
    '.sugg-dim{font-size:10.5px;font-weight:600;padding:2px 7px;border-radius:99px;background:#eef2f7;color:#475569;margin-left:auto}',
    '.sugg .row.action{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px 10px;color:#166534}',
    '.sugg .row.action i{color:#15803d}',
    '.sugg-code{margin:8px 0 0;padding:10px 12px;background:#0f172a;color:#e2e8f0;border-radius:8px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word;overflow-x:auto}',
    '.p-group-title{font-size:13px;font-weight:700;margin:14px 0 8px}',
    '.p-group-title.p0{color:#dc2626}.p-group-title.p1{color:#b45309}.p-group-title.p2{color:#1d4ed8}',
    '.warnbox{background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 14px;font-size:12.8px;color:#92400e;margin-bottom:10px}',
    '.note{font-size:12px;color:#6b7280;background:#f8fafc;border-radius:8px;padding:9px 12px;margin-top:10px}',
    '.kv{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px;font-size:12.5px}',
    '.kv div{background:#f8fafc;border-radius:8px;padding:7px 11px}',
    '.kv b{color:#0f172a}',
    '.rp-footer{font-size:11.8px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px;margin-top:4px}',
    '.rp-footer li{margin:2px 0}',
    '.mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11.5px;color:#475569;word-break:break-all}',
    '.empty{color:#9ca3af;font-size:12.5px;padding:8px 0}',
    '@media print{.rp{background:#fff;padding:0}.rp .card,.verdict{box-shadow:none;break-inside:avoid}}',
    '.rp .intent-pill{font-size:10.5px;font-weight:600;padding:2px 7px;border-radius:99px;white-space:nowrap}',
    '.intent-pill.info{background:#eff6ff;color:#1d4ed8}.intent-pill.comp{background:#f5f3ff;color:#6d28d9}.intent-pill.trans{background:#ecfdf5;color:#047857}.intent-pill.other{background:#f8fafc;color:#64748b}',
    '.rp .cat-pill{font-size:10px;font-weight:600;padding:1px 6px;border-radius:6px;background:#f1f5f9;color:#475569}',
    '.rp .kw-table td .term{font-weight:600;color:#0f172a}',
    '.rp .kw-table td.trend{font-weight:600;color:#db2777;text-align:right;white-space:nowrap}',
    '.rp .trends-box{background:#fdf2f8;border:1px solid #fbcfe8;border-radius:12px;padding:14px 16px;margin-top:12px}',
    '.rp .layer{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;margin-bottom:12px}',
    '.rp .layer h4{margin:0 0 10px;font-size:14px;display:flex;align-items:center;gap:8px}',
    '.rp .metric{display:grid;grid-template-columns:1fr auto;gap:2px 12px;font-size:12.6px;padding:5px 0;border-bottom:1px dashed #f1f5f9}',
    '.rp .metric:last-child{border-bottom:none}',
    '.rp .metric .m-label{color:#374151}',
    '.rp .metric .m-val{font-weight:600;color:#0f172a;text-align:right}',
    '.rp .metric .m-src{font-size:11px;color:#9ca3af;grid-column:1/-1}',
    '.rp .cannibal{background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:10px 14px;margin-bottom:8px;font-size:12.6px}',
    '.rp .cannibal b{color:#b45309}',
    '.rp .chk{font-size:12.8px;padding:4px 0 4px 22px;position:relative;color:#374151}',
    '.rp .chk::before{content:"☐";position:absolute;left:0;color:#94a3b8}',
    '.rp .topic{font-size:12.6px;padding:6px 10px;background:#f8fafc;border:1px solid #eef2f7;border-radius:8px;margin-bottom:6px}',
    '.rp .dist-bar{display:flex;height:10px;border-radius:99px;overflow:hidden;margin:6px 0 10px}',
    '.rp .dist-bar i{height:100%}',
    '.rp .sw-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;margin:12px 0}',
    '.rp .sw-box.sw-disabled{background:#fffbeb;border-color:#fde68a}',
    '.rp .sw-head{display:flex;align-items:center;gap:8px;font-size:13.5px;margin-bottom:6px}',
    '.rp .sw-chart{width:100%;height:240px}',
    '.rp .kw-table td.vol{font-weight:600;color:#1d4ed8;text-align:right;white-space:nowrap}',
    '.rp .muted{color:#cbd5e1}'
  ].join('\n');

  if (typeof document !== 'undefined' && !document.getElementById('rp-style')) {
    var st = document.createElement('style');
    st.id = 'rp-style';
    st.textContent = REPORT_CSS;
    document.head.appendChild(st);
  }

  // ---------- 工具 ----------
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function el(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }
  function fmtInt(n) {
    return n === null || n === undefined || isNaN(n) ? '—' : Number(n).toLocaleString('zh-CN');
  }
  function fmtVisits(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    if (n >= 1e8) return trimZero((n / 1e8).toFixed(2)) + ' 亿';
    if (n >= 1e4) return fmtInt(Math.round(n / 1e4)) + ' 万';
    return fmtInt(n);
  }
  function trimZero(s) {
    return s.replace(/\.?0+$/, '');
  }
  function fmtMs(ms) {
    if (ms === null || ms === undefined || isNaN(ms)) return '—';
    return ms >= 1000 ? (ms / 1000).toFixed(2) + ' s' : Math.round(ms) + ' ms';
  }
  function fmtKB(b) {
    if (b === null || b === undefined || isNaN(b)) return '—';
    return b >= 1024 * 1024 ? (b / 1048576).toFixed(2) + ' MB' : Math.round(b / 1024) + ' KB';
  }
  function fmtDateTime(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('zh-CN', { hour12: false });
    } catch (e) {
      return iso;
    }
  }
  function scoreColor(s) {
    return s >= 80 ? '#16a34a' : s >= 60 ? '#d97706' : '#dc2626';
  }

  var DIMENSION_META = [
    { key: 'performance', label: '性能体验', icon: '⚡', weight: 22 },
    { key: 'seo', label: 'SEO 基础', icon: '🔍', weight: 18 },
    { key: 'marketing', label: '营销与追踪', icon: '📈', weight: 18 },
    { key: 'tech', label: '技术健康', icon: '🧩', weight: 12 },
    { key: 'security', label: '安全合规', icon: '🔒', weight: 8 },
    { key: 'trust', label: '转化信任', icon: '🤝', weight: 8 },
    { key: 'geo', label: 'GEO 优化', icon: '🤖', weight: 14 },
  ];

  // 仅渲染数据中实际存在的维度（老样例报告无 geo 维度时不会崩）
  function presentDimensions(data) {
    return DIMENSION_META.filter(function (m) {
      return data && data.scores && data.scores.dimensions && data.scores.dimensions[m.key];
    });
  }

  var CAT_LABELS = {
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

  var TRACKER_MATRIX = [
    { key: 'ga4', label: 'Google Analytics 4', core: true },
    { key: 'gtm', label: 'Google Tag Manager', core: true },
    { key: 'meta', label: 'Meta Pixel（FB/INS）', core: true },
    { key: 'tiktok', label: 'TikTok Pixel', core: true },
    { key: 'googleAds', label: 'Google Ads 转化（AW-）', core: false },
    { key: 'snapchat', label: 'Snapchat Pixel', core: false },
    { key: 'pinterest', label: 'Pinterest Tag', core: false },
    { key: 'ua', label: 'Universal Analytics（旧版）', core: false },
  ];

  // ---------- 图表 ----------
  var chartRegistry = [];
  var hasEcharts = typeof global.echarts !== 'undefined';
  function initChart(id, option) {
    if (!hasEcharts) return null;
    var node = document.getElementById(id);
    if (!node) return null;
    var c = global.echarts.init(node);
    c.setOption(option);
    chartRegistry.push(c);
    return c;
  }
  if (typeof window !== 'undefined') {
    var resizeBound = false;
    window.addEventListener('resize', function () {
      chartRegistry.forEach(function (c) {
        try { c.resize(); } catch (e) {}
      });
      resizeBound = true;
    });
  }

  function drawCharts(d) {
    var dimsMeta = presentDimensions(d);
    var dims = dimsMeta.map(function (m) {
      var v = (d.scores.dimensions[m.key] || {}).score || 0;
      return v;
    });
    var baseline = dimsMeta.map(function () { return 75; });
    initChart('rp-radar', {
      color: ['#2563eb', '#cbd5e1'],
      tooltip: {},
      radar: {
        indicator: dimsMeta.map(function (m) {
          return { name: m.icon + ' ' + m.label, max: 100 };
        }),
        radius: '62%',
        splitNumber: 4,
        axisName: { color: '#475569', fontSize: 11 },
        splitArea: { areaStyle: { color: ['#ffffff', '#f8fafc'] } },
        splitLine: { lineStyle: { color: '#e2e8f0' } },
        axisLine: { lineStyle: { color: '#e2e8f0' } },
      },
      series: [
        {
          type: 'radar',
          name: '本站得分',
          data: [
            {
              value: dims,
              name: '本站得分',
              areaStyle: { opacity: 0.22 },
              lineStyle: { width: 2 },
              itemStyle: { color: '#2563eb' },
            },
          ],
        },
        {
          type: 'radar',
          name: '良好基准(75)',
          data: [
            {
              value: baseline,
              name: '良好基准 75',
              symbol: 'none',
              lineStyle: { type: 'dashed', color: '#94a3b8', width: 1.5 },
              areaStyle: null,
            },
          ],
        },
      ],
    });

    // 性能条形图（毫秒口径）
    var perfItems = [];
    perfItems.push({ name: 'TTFB 首字节', value: Math.round(d.page.ttfbMs), good: 500, warn: 1500 });
    var psiM = d.pagespeed && d.pagespeed.available ? d.pagespeed.mobile : null;
    if (psiM && psiM.vitals) {
      var lcp = psiM.vitals['largest-contentful-paint'];
      var fcp = psiM.vitals['first-contentful-paint'];
      var tbt = psiM.vitals['total-blocking-time'];
      if (lcp && lcp.value != null) perfItems.push({ name: 'LCP 最大内容', value: Math.round(lcp.value), good: 2500, warn: 4000 });
      if (fcp && fcp.value != null) perfItems.push({ name: 'FCP 首次内容', value: Math.round(fcp.value), good: 1800, warn: 3000 });
      if (tbt && tbt.value != null) perfItems.push({ name: 'TBT 阻塞时间', value: Math.round(tbt.value), good: 200, warn: 600 });
    }
    if (perfItems.length > 1 || hasEcharts) {
      initChart('rp-perf', {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: function (ps) { return ps[0].name + '：<b>' + ps[0].value + ' ms</b>'; } },
        grid: { left: 8, right: 46, top: 10, bottom: 6, containLabel: true },
        xAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 11 }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
        yAxis: {
          type: 'category',
          data: perfItems.map(function (i) { return i.name; }).reverse(),
          axisLabel: { color: '#475569', fontSize: 11.5 },
          axisLine: { lineStyle: { color: '#e2e8f0' } },
          axisTick: { show: false },
        },
        series: [
          {
            type: 'bar',
            barWidth: 16,
            data: perfItems
              .map(function (i) {
                return {
                  value: i.value,
                  itemStyle: { color: i.value <= i.good ? '#16a34a' : i.value <= i.warn ? '#d97706' : '#dc2626', borderRadius: [0, 4, 4, 0] },
                };
              })
              .reverse(),
            label: { show: true, position: 'right', color: '#475569', fontSize: 11, formatter: '{c} ms' },
          },
        ],
      });
    }

    // SEO 体检环形图
    var counts = { pass: 0, warn: 0, error: 0 };
    (d.seo.checks || []).forEach(function (c) {
      counts[c.severity === 'pass' ? 'pass' : c.severity === 'warn' ? 'warn' : 'error']++;
    });
    initChart('rp-seo', {
      tooltip: { trigger: 'item', formatter: '{b}：{c} 项（{d}%）' },
      color: ['#16a34a', '#d97706', '#dc2626'],
      series: [
        {
          type: 'pie',
          radius: ['58%', '78%'],
          center: ['50%', '46%'],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: '#fff', borderWidth: 2 },
          label: { show: true, fontSize: 11, color: '#475569', formatter: '{b} {c}' },
          data: [
            { name: '通过', value: counts.pass },
            { name: '警告', value: counts.warn },
            { name: '问题', value: counts.error },
          ],
        },
      ],
      graphic: [
        {
          type: 'text',
          left: 'center',
          top: '40%',
          style: { text: String(counts.pass + counts.warn + counts.error), fontSize: 22, fontWeight: 700, fill: '#0f172a' },
        },
        {
          type: 'text',
          left: 'center',
          top: '54%',
          style: { text: '体检项', fontSize: 11, fill: '#94a3b8' },
        },
      ],
    });

    // 第三方流量估算：流量国家来源横向柱状图
    if (
      d.autoseo && d.autoseo.enabled && d.autoseo.keyword &&
      d.autoseo.keyword.swAvailable && d.autoseo.keyword.countryShares &&
      d.autoseo.keyword.countryShares.length
    ) {
      var cs = d.autoseo.keyword.countryShares;
      initChart('swCountryChart', {
        grid: { left: 8, right: 56, top: 10, bottom: 4, containLabel: true },
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: function (p) { return p[0].name + '：' + p[0].value.toFixed(1) + '%'; } },
        xAxis: { type: 'value', axisLabel: { formatter: '{value}%', color: '#94a3b8', fontSize: 11 }, splitLine: { lineStyle: { color: '#eef2f7' } } },
        yAxis: {
          type: 'category',
          data: cs.map(function (c) { return c.country; }).reverse(),
          axisLabel: { color: '#475569', fontSize: 11.5 },
          axisLine: { lineStyle: { color: '#e2e8f0' } },
          axisTick: { show: false },
        },
        series: [
          {
            type: 'bar',
            barWidth: 14,
            data: cs
              .map(function (c) { return { value: +(c.share * 100).toFixed(2), itemStyle: { color: '#2563eb', borderRadius: [0, 4, 4, 0] } }; })
              .reverse(),
            label: { show: true, position: 'right', color: '#475569', fontSize: 11, formatter: '{c}%' },
          },
        ],
      });
    }

    // Google Trends：关键词搜索热度趋势（相对 0-100，多词折线）
    if (
      d.autoseo && d.autoseo.enabled && d.autoseo.keyword &&
      d.autoseo.keyword.trendsAvailable && d.autoseo.keyword.trendsOverTime &&
      d.autoseo.keyword.trendsOverTime.length
    ) {
      var series = d.autoseo.keyword.trendsOverTime;
      var times = (series[0] && series[0].points) ? series[0].points.map(function (p) { return p.time; }) : [];
      var palette = ['#2563eb', '#16a34a', '#db2777', '#ea580c', '#7c3aed'];
      initChart('trendsLineChart', {
        grid: { left: 8, right: 16, top: 28, bottom: 4, containLabel: true },
        tooltip: { trigger: 'axis' },
        legend: { data: series.map(function (s) { return s.term; }), top: 0, textStyle: { fontSize: 11, color: '#475569' }, type: 'scroll' },
        xAxis: { type: 'category', data: times, axisLabel: { color: '#94a3b8', fontSize: 10, interval: Math.ceil(times.length / 6) }, axisLine: { lineStyle: { color: '#e2e8f0' } } },
        yAxis: { type: 'value', max: 100, axisLabel: { color: '#94a3b8', fontSize: 11 }, splitLine: { lineStyle: { color: '#eef2f7' } } },
        series: series.map(function (s, i) {
          return {
            name: s.term,
            type: 'line',
            smooth: true,
            showSymbol: false,
            data: s.points.map(function (p) { return p.value; }),
            itemStyle: { color: palette[i % palette.length] },
            lineStyle: { width: 2 },
          };
        }),
      });
    }
  }

  // ---------- 各区块 ----------
  function buildVerdict(d) {
    var s = d.scores;
    var p0 = d.suggestions.filter(function (x) { return x.priority === 'P0'; }).length;
    var p1 = d.suggestions.filter(function (x) { return x.priority === 'P1'; }).length;
    var ringColor = scoreColor(s.overall);
    var est = d.traffic.estimate;
    var visitsHtml = est
      ? '<b>' + fmtVisits(est.mid) + '</b><small>区间 ' + fmtVisits(est.low) + ' ~ ' + fmtVisits(est.high) + ' · 模型估算</small>'
      : '<b class="bad">无法估算</b><small>' + esc(d.traffic.rankReason || '未获得排名数据') + '</small>';
    var rankHtml = d.traffic.rank != null
      ? '<b>#' + fmtInt(d.traffic.rank) + '</b><small>Tranco 榜单 ' + esc(d.traffic.rankListId || '') + ' · 一手数据</small>'
      : '<b class="bad">未上榜</b><small>' + esc(d.traffic.rankReason || '未进入全球 Top 100 万') + '</small>';
    return el(
      '<section class="verdict">' +
      '<div class="verdict-main">' +
      '<div class="score-ring" style="background:conic-gradient(' + ringColor + ' ' + s.overall + '%, #eef2f7 0)"><div style="width:88px;height:88px;border-radius:50%;background:' + ringColor + ';display:flex;flex-direction:column;align-items:center;justify-content:center"><b>' + s.overall + '</b><span>' + s.grade + ' · ' + esc(s.gradeText) + '</span></div></div>' +
      '<div class="verdict-text">' +
      '<h2><code>' + esc(d.domain) + '</code><span class="grade g' + s.grade + '">' + s.grade + ' / ' + esc(s.gradeText) + '</span></h2>' +
      '<p class="diagnosis">' + esc(d.diagnosis) + '</p>' +
      '<div class="verdict-meta">分析时点 ' + esc(fmtDateTime(d.startedAt)) + ' · 耗时 ' + (d.durationMs / 1000).toFixed(1) + 's · 落地页 ' + esc(d.page.url) + '（HTTP ' + d.page.status + '）</div>' +
      '</div></div>' +
      '<div class="verdict-stats">' +
      '<div class="stat"><label>月访问量（估算）</label>' + visitsHtml + '</div>' +
      '<div class="stat"><label>全球排名</label>' + rankHtml + '</div>' +
      '<div class="stat"><label>TTFB 首字节</label><b>' + esc(fmtMs(d.page.ttfbMs)) + '</b><small>实测 · 优秀 &lt; 500ms</small></div>' +
      '<div class="stat"><label>待修复问题</label><b><span class="bad">' + p0 + ' 个 P0</span> · ' + p1 + ' 个 P1</b><small>按优先级处理</small></div>' +
      '</div>' +
      '</section>'
    );
  }

  function buildDimCard(d) {
    var dimsMeta = presentDimensions(d);
    var rows = dimsMeta.map(function (m) {
      var dim = d.scores.dimensions[m.key] || { score: 0, items: [] };
      var items = (dim.items || [])
        .map(function (it) {
          return '<li>' + esc(it.label) + '：' + esc(it.note) + '</li>';
        })
        .join('');
      return (
        '<div class="dim-row"><span class="dim-label">' + m.icon + ' ' + esc(m.label) + '</span>' +
        '<span class="dim-bar"><i style="width:' + dim.score + '%;background:' + scoreColor(dim.score) + '"></i></span>' +
        '<span class="dim-score" style="color:' + scoreColor(dim.score) + '">' + dim.score + '</span></div>' +
        '<ul class="dim-detail">' + items + '</ul>'
      );
    }).join('');
    var noteTxt = '权重：' + dimsMeta.map(function (m) { return m.label + ' ' + m.weight + '%'; }).join(' · ') +
      '。雷达虚线为"良好"基准 75 分。';
    return el(
      '<section class="card"><h3>📊 ' + dimsMeta.length + ' 维健康度 <span class="tier t1">评分模型</span></h3>' +
      '<div id="rp-radar" class="chart"></div>' + rows +
      '<div class="note">' + esc(noteTxt) + '</div>' +
      '</section>'
    );
  }

  function buildPerfCard(d) {
    var p = d.page;
    var psiNote =
      d.pagespeed && d.pagespeed.available
        ? '<tr><td>Lighthouse 性能分（移动端）</td><td><b>' + (d.pagespeed.mobile ? d.pagespeed.mobile.scores.performance : '—') + '</b> / 100</td></tr>'
        : '';
    return el(
      '<section class="card"><h3>⚡ 性能实测 <span class="tier t1">一手 · 本工具直连测量</span></h3>' +
      '<div class="kv">' +
      '<div>TTFB：<b>' + esc(fmtMs(p.ttfbMs)) + '</b></div>' +
      '<div>总耗时：<b>' + esc(fmtMs(p.totalMs)) + '</b></div>' +
      '<div>页面体积：<b>' + esc(fmtKB(p.size)) + '</b>（传输 ' + esc(fmtKB(p.rawSize)) + '）</div>' +
      '<div>压缩：<b>' + esc(p.compression) + '</b></div>' +
      '<div>重定向：<b>' + (p.hopCount || 0) + ' 跳</b></div>' +
      '<div>落地协议：<b>' + (p.isHttps ? 'HTTPS' : 'HTTP') + '</b></div>' +
      '</div>' +
      '<div id="rp-perf" class="chart" style="margin-top:8px"></div>' +
      '<table style="margin-top:6px">' + psiNote + '</table>' +
      (d.pagespeed && !d.pagespeed.available ? '<div class="note">PageSpeed Insights 暂不可用：' + esc(d.pagespeed.reason || '') + '（Lighthouse 实验室数据缺失，性能分仅基于直连测量）</div>' : '') +
      '</section>'
    );
  }

  function buildTrafficCard(d) {
    var t = d.traffic;
    var est = t.estimate;
    var body =
      '<div class="kv">' +
      '<div>Tranco 全球排名：<b>' + (t.rank != null ? '#' + fmtInt(t.rank) : '未上榜') + '</b></div>' +
      '<div>月访问量估算：<b>' + (est ? fmtVisits(est.mid) : '—') + '</b>' + (est ? '（区间 ' + fmtVisits(est.low) + ' ~ ' + fmtVisits(est.high) + '）' : '') + '</div>' +
      '<div>Common Crawl 抓取 URL：<b>' + (t.commonCrawl ? fmtInt(t.commonCrawl.sampledUrls) + (t.commonCrawl.truncated ? '+' : '') : '—') + '</b>' + (t.commonCrawl ? '<small style="color:#9ca3af"> ' + esc(t.commonCrawl.index) + '</small>' : '') + '</div>' +
      '<div>域名年龄：<b>' + (d.rdap && d.rdap.ageYears != null ? d.rdap.ageYears + ' 年' : '—') + '</b></div>' +
      '</div>';
    var notes = (t.notes || []).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('');
    return el(
      '<section class="card"><h3>🌐 流量估算 <span class="tier t1">排名一手</span> <span class="tier t2">访问量为模型估算</span></h3>' +
      body +
      (notes ? '<ul class="dim-detail" style="margin-left:0">' + notes + '</ul>' : '') +
      '<div class="note"><b>口径说明：</b>全球排名来自 Tranco 榜单（一手数据，' + esc(t.rankListId || '最新期') + '）；月访问量为基于排名的经验模型估算（锚点插值），<b>非 SimilarWeb 一手流量数据</b>，误差可达数倍，仅作数量级判断；Common Crawl 数据为站点规模信号而非流量。未获得排名时本工具拒绝输出访问量数字，避免编造数据。</div>' +
      '</section>'
    );
  }

  function buildSeoCard(d) {
    var checks = d.seo.checks || [];
    var rows = checks
      .map(function (c) {
        var cls = c.severity === 'pass' ? 'ok' : c.severity === 'warn' ? 'warn' : 'err';
        var txt = c.severity === 'pass' ? '通过' : c.severity === 'warn' ? '警告' : '问题';
        return (
          '<tr><td style="white-space:nowrap">' + esc(c.label) + '</td>' +
          '<td><span class="pill ' + cls + '">' + txt + '</span></td>' +
          '<td>' + esc(c.detail) + '</td></tr>'
        );
      })
      .join('');
    var crawl = d.crawl || {};
    return el(
      '<section class="card"><h3>🔍 SEO 体检 <span class="tier t1">一手 · 首页源码解析</span></h3>' +
      '<div class="grid2" style="margin-bottom:10px"><div id="rp-seo" class="chart" style="height:240px"></div>' +
      '<div class="kv" style="align-content:start">' +
      '<div>Title：<b>' + esc(d.seo.title || '（缺失）') + '</b>（' + d.seo.titleLength + ' 字符）</div>' +
      '<div>Description：<b>' + (d.seo.metaDescription ? d.seo.descriptionLength + ' 字符' : '缺失') + '</b></div>' +
      '<div>H1 / H2：<b>' + d.seo.h1Count + ' / ' + d.seo.h2Count + '</b></div>' +
      '<div>图片：<b>' + d.seo.images.total + '</b> 张（缺 alt ' + d.seo.images.missingAlt + '）</div>' +
      '<div>内链 / 外链：<b>' + d.seo.links.internal + ' / ' + d.seo.links.external + '</b></div>' +
      '<div>正文词数：<b>' + fmtInt(d.seo.wordCount.total) + '</b></div>' +
      '<div>robots.txt：<b>' + (crawl.robots && crawl.robots.found ? '存在' : '缺失') + '</b></div>' +
      '<div>sitemap.xml：<b>' + (crawl.sitemap && crawl.sitemap.found ? crawl.sitemap.urlCount + ' 个 URL' : '缺失') + '</b></div>' +
      '<div>多语言 hreflang：<b>' + (d.seo.hreflangs && d.seo.hreflangs.length ? d.seo.hreflangs.length + ' 种' : '未声明') + '</b></div>' +
      '</div></div>' +
      '<table><thead><tr><th>检查项</th><th>结论</th><th>详情</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="note">SEO 检测基于首页单页源码；抓取时间 ' + esc(fmtDateTime(d.startedAt)) + '。SPA 站点经服务端渲染（SSR/SSG）后方可被爬虫完整索引。</div>' +
      '</section>'
    );
  }

  function buildGeoCard(d) {
    var g = d.geo;
    if (!g) return null;
    var checks = g.checks || [];
    var rows = checks
      .map(function (c) {
        var cls = c.severity === 'pass' ? 'ok' : c.severity === 'warn' ? 'warn' : 'err';
        var txt = c.severity === 'pass' ? '就绪' : c.severity === 'warn' ? '待优化' : '风险';
        return (
          '<tr><td style="white-space:nowrap">' + esc(c.label) + '</td>' +
          '<td><span class="pill ' + cls + '">' + txt + '</span></td>' +
          '<td>' + esc(c.detail) + '</td></tr>'
        );
      })
      .join('');
    var bots = (g.aiCrawlers || [])
      .map(function (b) {
        var cls = b.status === 'allowed' ? 'ok' : b.status === 'blocked' ? 'err' : b.status === 'partial' ? 'warn' : 'na';
        var txt = b.status === 'allowed' ? '允许' : b.status === 'blocked' ? '封禁' : b.status === 'partial' ? '部分限制' : '未声明';
        return '<tr><td>' + esc(b.label) + '</td><td><span class="pill ' + cls + '">' + txt + '</span></td></tr>';
      })
      .join('');
    var llm = g.llms || {};
    var llmsHtml = llm.found
      ? '<div class="kv" style="margin-top:8px"><div>llms.txt：<b>已发布</b></div><div>地址：<b class="mono">' + esc(llm.url || '') + '</b></div></div>'
      : '<div class="note" style="margin-top:8px">未检测到 llms.txt（新兴标准：在根目录放置一份给 AI 引擎的站点摘要与允许抓取路径说明，可显著提升被 AI 引用概率）。</div>';
    var blockedBanner = g.blocked
      ? '<div class="warnbox" style="margin-bottom:10px">⚠️ 首页抓取被拦截，GEO 结论基于错误页，仅供参考。</div>'
      : '';
    return el(
      '<section class="card"><h3>🤖 GEO 生成引擎优化 <span class="tier t2">AI 搜索就绪度</span></h3>' +
      blockedBanner +
      '<div class="warnbox" style="background:#eef2ff;border-color:#c7d2fe;color:#3730a3">GEO（Generative Engine Optimization）度量站点被 ChatGPT / Perplexity / Gemini / Claude / 豆包 等 AI 引擎检索并引用的<b>结构就绪度</b>，<b>非实际引用次数</b>。真实引用量需调用各平台 API 或品牌监测，本工具不抓取 AI 回答，相关结论一律标注为就绪度评估。</div>' +
      (bots ? '<h4 style="margin:12px 0 6px;font-size:12.5px;color:#64748b">AI 爬虫在 robots.txt 中的指令</h4><table><thead><tr><th>AI 抓取代理</th><th>状态</th></tr></thead><tbody>' + bots + '</tbody></table>' : '') +
      llmsHtml +
      '<h4 style="margin:12px 0 6px;font-size:12.5px;color:#64748b">GEO 就绪度体检</h4>' +
      '<table><thead><tr><th>维度</th><th>结论</th><th>详情</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="note">提高 GEO 的核心路径：发布 llms.txt + 完整 JSON-LD 实体（Organization / Product）+ 解除对 AI 爬虫的 robots 封禁 + 补齐信任页（About/Contact/Privacy/Terms）与 FAQ 结构化 + 增加权威引用与社交知识图谱。提升 SEO 的同时即为 GEO 打底，二者同源。</div>' +
      '</section>'
    );
  }

  function buildTechCard(d) {
    var groups = {};
    (d.tech || []).forEach(function (t) {
      (groups[t.category] = groups[t.category] || []).push(t);
    });
    var order = ['cms', 'framework', 'server', 'cdn', 'analytics', 'pixel', 'payment', 'chat', 'review', 'marketing', 'misc'];
    var html = '';
    order.forEach(function (cat) {
      if (!groups[cat]) return;
      var chips = groups[cat]
        .map(function (t) {
          var jsFlag = t.evidence && t.evidence.indexOf('JS') === 0 ? '<span class="jsflag">JS</span>' : '';
          return '<span class="chip" title="' + esc(t.evidence) + '"><b>' + esc(t.name) + '</b>' + jsFlag + '</span>';
        })
        .join('');
      html += '<div class="tech-group"><h4>' + esc(CAT_LABELS[cat] || cat) + '</h4><div class="chips">' + chips + '</div></div>';
    });
    if (!html) html = '<div class="empty">未识别到已知技术特征（自研站或高度定制）</div>';
    return el(
      '<section class="card"><h3>🧩 技术栈识别 <span class="tier t1">一手 · 源码 + JS 资源扫描</span></h3>' +
      html +
      '<div class="note">识别依据：首页 HTML 源码 + 同源 JS 资源（最多 10 个）+ 响应头。<span class="jsflag">JS</span> 标记表示该特征在打包 JS 中识别。鼠标悬停芯片可查看匹配证据。</div>' +
      '</section>'
    );
  }

  function buildTrackerCard(d) {
    var ids = d.trackerIds || {};
    var techNames = (d.tech || []).map(function (t) { return t.name; });
    var rows = TRACKER_MATRIX.map(function (m) {
      var list = ids[m.key] || [];
      var has = list.length > 0;
      return (
        '<tr><td>' + esc(m.label) + (m.core ? ' <span class="pill info">核心</span>' : '') + '</td>' +
        '<td><span class="pill ' + (has ? 'ok' : 'na') + '">' + (has ? '已部署' : '未直接检测到') + '</span></td>' +
        '<td class="mono">' + esc(list.join(', ') || '—') + '</td></tr>'
      );
    }).join('');

    function compRow(label, re) {
      var found = techNames.filter(function (n) { return re.test(n); });
      return (
        '<tr><td>' + esc(label) + '</td>' +
        '<td><span class="pill ' + (found.length ? 'ok' : 'na') + '">' + (found.length ? '已识别' : '未识别') + '</span></td>' +
        '<td>' + esc(found.join('、') || '—') + '</td></tr>'
      );
    }
    var compRows =
      compRow('客服 / 聊天', /Intercom|Zendesk|Crisp|Tawk|Tidio|Drift|LiveChat|WhatsApp|Messenger|美洽|SaleSmartly|Chatra|Jivosite/) +
      compRow('支付方式', /PayPal|Stripe|Klarna|Afterpay|Adyen|Checkout|Braintree|Authorize|Square|Razorpay|Mollie|2Checkout|Oceanpayment|PingPong|Airwallex|Asiabill|连连|Paymentwall/) +
      compRow('评论 / 信任签章', /Yotpo|Judge|Loox|Stamped|Trustpilot|Reviews|Okendo|Norton|McAfee/) +
      compRow('邮件 / CRM 营销', /Mailchimp|Klaviyo|Omnisend|HubSpot|ActiveCampaign|Brevo|Sendinblue|Privy|Justuno|OptinMonster/);

    return el(
      '<section class="card"><h3>📈 营销与追踪覆盖 <span class="tier t1">一手 · 源码扫描</span> <span class="tier t3">GTM 容器内不可见</span></h3>' +
      '<table><thead><tr><th>追踪代码</th><th>状态</th><th>ID</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<table style="margin-top:10px"><thead><tr><th>转化组件</th><th>状态</th><th>识别结果</th></tr></thead><tbody>' + compRows + '</tbody></table>' +
      '<div class="note">"未直接检测到"≠"一定没有"：通过 GTM 容器或打包 JS 动态注入的代码可能无法从源码识别（JS 打包注入已尽量扫描）。GA4/旧版 UA、Meta/TikTok 等像素的 ID 均已提取，可直接与广告后台核对。</div>' +
      '</section>'
    );
  }

  function buildPsiCard(d) {
    var psi = d.pagespeed;
    function stratRows(s) {
      if (!s) return '<tr><td colspan="2" class="empty">该策略数据不可用</td></tr>';
      var v = s.vitals || {};
      function vrow(key, unit) {
        var it = v[key];
        if (!it) return '';
        var color = it.score == null ? '#94a3b8' : it.score >= 0.9 ? '#16a34a' : it.score >= 0.5 ? '#d97706' : '#dc2626';
        return (
          '<tr><td>' + esc(it.label) + '</td><td><b style="color:' + color + '">' + esc(it.display || (it.value != null ? it.value + unit : '—')) + '</b></td></tr>'
        );
      }
      return (
        '<tr><td>综合评分（性能 / SEO / 无障碍 / 最佳实践）</td><td><b>' +
        [s.scores.performance, s.scores.seo, s.scores.accessibility, s.scores.bestPractices].map(function (x) { return x == null ? '—' : x; }).join(' / ') +
        '</b></td></tr>' +
        vrow('largest-contentful-paint', ' ms') +
        vrow('first-contentful-paint', ' ms') +
        vrow('total-blocking-time', ' ms') +
        vrow('cumulative-layout-shift', '') +
        vrow('speed-index', ' ms') +
        vrow('interactive', ' ms')
      );
    }
    return el(
      '<section class="card"><h3>🧪 Lighthouse 实验室数据 <span class="tier t1">一手 · Google PageSpeed Insights</span></h3>' +
      '<table><thead><tr><th>指标</th><th>移动端</th></tr></thead><tbody>' + stratRows(psi.mobile) + '</tbody></table>' +
      '<table style="margin-top:10px"><thead><tr><th>指标</th><th>桌面端</th></tr></thead><tbody>' + stratRows(psi.desktop) + '</tbody></table>' +
      '<div class="note">Lighthouse 为实验室模拟数据，与真实用户体验（CrUX）存在差异；阈值参考 Google Core Web Vitals 良好线。</div>' +
      '</section>'
    );
  }

  function buildSuggestionsCard(d) {
    var groups = { P0: [], P1: [], P2: [] };
    d.suggestions.forEach(function (s) { groups[s.priority].push(s); });
    var titleMap = { P0: 'P0 · 立即处理（影响流量/收录/转化）', P1: 'P1 · 尽快处理（明显短板）', P2: 'P2 · 优化项（锦上添花）' };
    var dimLabel = { performance: '性能', seo: 'SEO 基础', marketing: '营销追踪', tech: '技术健康', security: '安全合规', trust: '转化信任', geo: 'GEO 生成引擎优化' };
    var html = '';
    ['P0', 'P1', 'P2'].forEach(function (pri) {
      if (!groups[pri].length) return;
      html += '<div class="p-group-title ' + pri.toLowerCase() + '">' + titleMap[pri] + ' · ' + groups[pri].length + ' 项</div>';
      groups[pri].forEach(function (s) {
        var dl = dimLabel[s.dimension] || s.dimension || '';
        html +=
          '<div class="sugg ' + pri.toLowerCase() + '">' +
          '<div class="sugg-head"><span class="pri">' + pri + '</span><b>' + esc(s.title) + '</b>' + (dl ? '<span class="sugg-dim">' + esc(dl) + '</span>' : '') + '</div>' +
          '<div class="row"><i>问题</i><span>' + esc(s.problem) + '</span></div>' +
          '<div class="row action"><i>具体做法</i><span>' + esc(s.action) +
            (s.actionCode ? '</span><pre class="sugg-code">' + esc(s.actionCode) + '</pre>' : '</span>') +
          '</div>' +
          '<div class="row impact"><i>影响</i>' + esc(s.impact) + '</div>' +
          '</div>';
      });
    });
    if (!html) html = '<div class="empty">未发现明显问题，站点状态良好</div>';
    return el('<section class="card"><h3>🛠 修改建议 <span class="tier t2">按优先级排序 · 问题/做法/影响</span></h3>' + html + '</section>');
  }

  function buildPositivesCard(d) {
    if (!d.positives || !d.positives.length) return null;
    var chips = d.positives
      .map(function (p) { return '<span class="chip" title="' + esc(p.detail) + '">✅ <b>' + esc(p.title) + '</b> · ' + esc(p.detail) + '</span>'; })
      .join('');
    return el('<section class="card"><h3>✅ 做得好的地方</h3><div class="chips">' + chips + '</div></section>');
  }

  function buildAppendix(d) {
    var h = d.page.headers || {};
    var headerRows = Object.keys(h)
      .map(function (k) {
        var v = Array.isArray(h[k]) ? h[k].join('；') : h[k];
        return '<tr><td class="mono" style="white-space:nowrap">' + esc(k) + '</td><td class="mono">' + esc(String(v).slice(0, 220)) + '</td></tr>';
      })
      .join('');
    var hops = (d.page.hops || [])
      .map(function (hop) {
        return (
          '<tr><td>' + hop.index + '</td><td class="mono">' + esc(hop.url) + '</td><td>' + hop.status + '</td><td>' + esc(fmtMs(hop.ttfbMs)) + '</td></tr>'
        );
      })
      .join('');
    var tls = d.tls || {};
    var tlsHtml = tls.ok
      ? '<div>协议：<b>' + esc(tls.protocol) + '</b></div><div>签发者：<b>' + esc(tls.issuer) + '</b></div><div>主体：<b>' + esc(tls.subject) + '</b></div><div>剩余有效期：<b>' + (tls.daysLeft != null ? tls.daysLeft + ' 天' : '未知') + '</b></div>'
      : '<div>证书：<b>' + esc(tls.error || '不可用') + '</b></div>';
    var dns = d.dns || {};
    var dnsHtml =
      '<div>A 记录：<b class="mono">' + esc((dns.a || []).join(', ') || '—') + '</b></div>' +
      '<div>AAAA：<b class="mono">' + esc((dns.aaaa || []).join(', ') || '—') + '</b></div>' +
      '<div>MX：<b class="mono">' + esc((dns.mx || []).join(' / ') || '—') + '</b></div>' +
      '<div>NS：<b class="mono">' + esc((dns.ns || []).join(' / ') || '—') + '</b></div>' +
      '<div>解析耗时：<b>' + (dns.lookupMs != null ? dns.lookupMs + ' ms' : '—') + '</b></div>';
    var warnings = (d.warnings || [])
      .map(function (w) { return '<div>⚠️ ' + esc(w) + '</div>'; })
      .join('');
    var sources = (d.dataSources || []).map(function (s) { return '<span class="chip">' + esc(s) + '</span>'; }).join('');
    var rdapHtml = d.rdap
      ? '<div>注册商：<b>' + esc(d.rdap.registrar || '—') + '</b></div><div>注册时间：<b>' + esc(d.rdap.registeredAt) + '</b></div><div>到期时间：<b>' + esc(d.rdap.expiresAt || '—') + '</b></div>'
      : '';
    return el(
      '<section class="card"><h3>📎 原始数据附录 <span class="tier t3">可复核</span></h3>' +
      (warnings ? '<div class="warnbox">' + warnings + '</div>' : '') +
      '<div class="grid2">' +
      '<div><h4 style="margin:0 0 6px;font-size:12.5px;color:#64748b">TLS / 证书</h4><div class="kv">' + tlsHtml + '</div>' +
      '<h4 style="margin:12px 0 6px;font-size:12.5px;color:#64748b">DNS</h4><div class="kv">' + dnsHtml + '</div>' +
      (rdapHtml ? '<h4 style="margin:12px 0 6px;font-size:12.5px;color:#64748b">RDAP 注册信息</h4><div class="kv">' + rdapHtml + '</div>' : '') + '</div>' +
      '<div><h4 style="margin:0 0 6px;font-size:12.5px;color:#64748b">请求链路（重定向链）</h4>' +
      (hops ? '<table><thead><tr><th>#</th><th>URL</th><th>状态</th><th>TTFB</th></tr></thead><tbody>' + hops + '</tbody></table>' : '<div class="empty">直达，无跳转</div>') + '</div>' +
      '</div>' +
      '<h4 style="margin:14px 0 6px;font-size:12.5px;color:#64748b">响应头（关键项）</h4>' +
      '<table><tbody>' + headerRows + '</tbody></table>' +
      '<h4 style="margin:14px 0 6px;font-size:12.5px;color:#64748b">本次分析数据来源</h4><div class="chips">' + sources + '</div>' +
      '</section>'
    );
  }

  function buildFooter(d) {
    return el(
      '<footer class="rp-footer">' +
      '<div><b>口径与可信度标注：</b></div>' +
      '<ul>' +
      '<li>性能（TTFB/体积/压缩/重定向链）、SEO 要素、技术栈与像素、响应头、TLS/DNS：本工具直连测量与源码解析，<b>一手数据</b>；SEO 与技术栈仅覆盖首页及其同源 JS 资源。</li>' +
      '<li>Tranco 全球排名、Common Crawl 索引、RDAP 注册信息：<b>一手公开数据</b>。</li>' +
      '<li>月访问量与流量国家来源：优先采用 <b>Semrush API</b> 估算（需配置 key），否则回退 <b>SimilarWeb</b> 公开接口估算（非 Google 官方，量级可能偏差数倍）。均为第三方模型估算，非站点真实 Analytics 数据。</li>' +
      '<li>关键词月度流量 / 搜索量：来自 Semrush（词级估算流量 nq 搜索量）或 SimilarWeb 估算；Google Trends 给出的是关键词<b>相对搜索热度 0-100</b>（非搜索量/流量绝对值），用于趋势判断。</li>' +
      '<li>PageSpeed Insights：Google Lighthouse <b>实验室数据</b>，与真实用户环境存在差异。</li>' +
      '<li>分析为单次采样，结果受网络波动、CDN 节点、Bot 防护与登录状态影响；建议连续多日测量取均值。</li>' +
      '</ul>' +
      '<div style="margin-top:6px">由 <b>SiteLens 独立站分析工具</b> 自动生成 · ' + esc(fmtDateTime(d.finishedAt || d.startedAt)) + ' · 报告仅供建站与运营参考，不构成投资建议</div>' +
      '</footer>'
    );
  }

  // ---------- 主渲染 ----------
  function intentClass(i) {
    return i === 'informational' ? 'info' : i === 'comparison' ? 'comp' : i === 'transactional' ? 'trans' : 'other';
  }
  function catLabel(c) {
    return { core: '核心词', longtail: '长尾词', question: '问答词', competitor: '竞品词', brand: '品牌词' }[c] || c;
  }
  function renderMetric(label, m) {
    var manual = m.manual;
    var val = (m.value === null || m.value === undefined)
      ? '<span class="mini-pill" style="background:#f8fafc;color:#94a3b8">需接入</span>'
      : esc(String(m.value)) + (m.pass === true
        ? ' <span class="mini-pill" style="background:#ecfdf5;color:#047857">达标</span>'
        : m.pass === false ? ' <span class="mini-pill" style="background:#fef2f2;color:#b91c1c">未达标</span>' : '');
    return '<div class="metric"><span class="m-label">' + esc(label) + (manual ? ' <span class="tier t3">手动</span>' : '') +
      '</span><span class="m-val">' + val + '</span>' +
      '<span class="m-src">' + esc(m.source || '') + (m.note ? ' · ' + esc(m.note) : '') + '</span></div>';
  }

  // 流量数字格式化：>=1万 显示「x.x万」，否则千分位
  function fmtVol(n) {
    if (n == null) return '<span class="muted">—</span>';
    var v = Number(n);
    if (!isFinite(v)) return '<span class="muted">—</span>';
    if (v >= 10000) return (Math.round(v / 1000) / 10).toFixed(1).replace(/\.0$/, '') + '万';
    return v.toLocaleString('en-US');
  }
  function fmtPct(share) {
    if (share == null) return '—';
    return (share * 100).toFixed(1) + '%';
  }
  // Google Trends 相对热度：0-100 整数，null 显示 —
  function fmtTrend(n) {
    if (n == null) return '<span class="muted">—</span>';
    var v = Number(n);
    if (!isFinite(v)) return '<span class="muted">—</span>';
    return v + '';
  }
  // 是否优先使用 Semrush 作为流量来源
  function smOkLabel(source) {
    return /semrush/i.test(source || '');
  }

  function buildAutoSeoCard(data) {
    var a = data && data.autoseo;
    if (!a || !a.enabled) {
      if (a && a.reason) {
        return el('<section class="card"><h3>🚀 自动 SEO 策略 <span class="tier t3">未启用</span></h3>' +
          '<div class="note">' + esc(a.reason) + '</div></section>');
      }
      return null;
    }
    var kw = a.keyword, content = a.content, off = a.offpage, layers = a.layers, rhythm = a.rhythm;
    var html = '';

    html += '<section class="card"><h3>🚀 自动 SEO 策略 <span class="tier t2">关键词 / 内容 / 外链 / 四层指标</span></h3>';
    html += '<div class="note">基于 <b>' + a.pagesCrawled + '</b> 个已爬页面自动生成。带「<span class="tier t3">手动</span>」标记的指标需接入 GSC / Ahrefs / Semrush / GA4 回填，本工具不编造搜索量、排名与外链数字（与 SiteLens 口径一致）。</div>';

    // ---- 关键词策略 ----
    html += '<h4 style="margin:14px 0 6px;font-size:14px;color:#334155">① 关键词策略（自动抽取 + 意图 + 映射）</h4>';
    var id = kw.intentDist, tot = (id.informational + id.comparison + id.transactional + id.other) || 1;
    html += '<div class="dist-bar">' +
      '<i style="width:' + (id.informational / tot * 100) + '%;background:#1d4ed8"></i>' +
      '<i style="width:' + (id.comparison / tot * 100) + '%;background:#6d28d9"></i>' +
      '<i style="width:' + (id.transactional / tot * 100) + '%;background:#047857"></i>' +
      '<i style="width:' + (id.other / tot * 100) + '%;background:#94a3b8"></i></div>';
    html += '<div class="chips" style="margin-bottom:10px">' +
      '<span class="chip">信息型 <b>' + id.informational + '</b></span>' +
      '<span class="chip">对比型 <b>' + id.comparison + '</b></span>' +
      '<span class="chip">交易型 <b>' + id.transactional + '</b></span>' +
      '<span class="chip">其他 <b>' + id.other + '</b></span></div>';

    html += '<table class="kw-table"><thead><tr><th>关键词</th><th>意图</th><th>词类</th><th>命中页</th><th>权重</th><th>月度流量(估算)</th><th>搜索量</th><th>热度(Trends)</th></tr></thead><tbody>';
    html += kw.topKeywords.map(function (k) {
      return '<tr><td class="term">' + esc(k.term) + '</td><td><span class="intent-pill ' + intentClass(k.intent) + '">' + esc(k.intentLabel) + '</span></td>' +
        '<td><span class="cat-pill">' + esc(catLabel(k.category)) + '</span></td><td>' + k.pages + '</td><td>' + k.totalScore + '</td><td class="vol">' + fmtVol(k.monthlyVisits) + '</td><td>' + fmtVol(k.searchVolume) + '</td><td class="trend">' + fmtTrend(k.trendInterest) + '</td></tr>';
    }).join('');
    html += '</tbody></table>';

    // 第三方流量估算：Semrush（优先）/ SimilarWeb + Google Trends
    html += '<div class="sw-box' + (kw.swAvailable ? '' : ' sw-disabled') + '">';
    html += '<div class="sw-head"><b>🌍 第三方流量估算' +
      (smOkLabel(kw.swSource) ? '（Semrush）' : '（SimilarWeb）') + '</b>' +
      (kw.swAvailable
        ? '<span class="tier t2">已抓取</span>'
        : '<span class="tier t3">抓取受限</span>') + '</div>';
    if (kw.swAvailable) {
      html += '<div class="note">数据来源：' + esc(kw.swSource || '第三方估算') + '（<b>第三方模型估算，非 Google 官方</b>），量级可能与真实值偏差数倍，仅作参考。全站月访问估算：<b>' + fmtVol(kw.swMonthlyVisits) + '</b>。</div>';

      // 国家来源：ECharts 横向柱状图 + 表格
      if (kw.countryShares && kw.countryShares.length) {
        html += '<h5 style="margin:10px 0 4px;font-size:13px;color:#334155">流量国家来源（Top ' + kw.countryShares.length + '，' + (smOkLabel(kw.swSource) ? 'Semrush' : 'SimilarWeb') + '）</h5>';
        html += '<div class="sw-chart" id="swCountryChart"></div>';
        html += '<div class="chips" style="margin-top:6px">' + kw.countryShares.slice(0, 8).map(function (c) {
          return '<span class="chip">' + esc(c.country) + ' <b>' + fmtPct(c.share) + '</b></span>';
        }).join('') + '</div>';
      }

      // 带量的外部分词（Semrush/SW 真实词 + 月度流量）
      if (kw.swKeywords && kw.swKeywords.length) {
        html += '<h5 style="margin:12px 0 4px;font-size:13px;color:#334155">外部分词与月度流量（' + (smOkLabel(kw.swSource) ? 'Semrush' : 'SimilarWeb') + ' Top ' + kw.swKeywords.length + '）</h5>';
        html += '<table class="kw-table"><thead><tr><th>关键词</th><th>月度流量(估算)</th><th>占站比重</th></tr></thead><tbody>' +
          kw.swKeywords.map(function (k) {
            return '<tr><td class="term">' + esc(k.term) + '</td><td class="vol">' + fmtVol(k.monthlyVisits) + '</td><td>' + fmtPct(k.share) + '</td></tr>';
          }).join('') + '</tbody></table>';
      }
    } else {
      html += '<div class="note">未能抓取到第三方流量数据（' + esc(kw.swSource || '抓取受限') + '）。Semrush 需配置 API key（config.json 或环境变量 SEMRUSH_API_KEY）；SimilarWeb/Google Trends 多为数据中心 IP 被 Bot 防护拦截，在你本机运行 <code>node server.js</code> 通常可正常获取。</div>';
    }

    // Google Trends：关键词搜索趋势（相对热度）+ 品牌搜索地域分布
    if (kw.trendsAvailable && kw.trendsOverTime && kw.trendsOverTime.length) {
      html += '<div class="trends-box"><div class="sw-head"><b>📈 关键词搜索趋势（Google Trends）</b><span class="tier t2">已抓取</span></div>';
      html += '<div class="note">Google Trends 给出的是<b>相对搜索热度（0-100）</b>，不是搜索量或流量绝对值；用于判断关键词的上升/下降趋势，指导内容排期。</div>';
      html += '<div class="sw-chart" id="trendsLineChart"></div>';
      if (kw.trendsByRegion && kw.trendsByRegion.length) {
        html += '<h5 style="margin:12px 0 4px;font-size:13px;color:#334155">品牌搜索地域分布（Google Trends，相对热度 Top ' + kw.trendsByRegion.length + '）</h5>';
        html += '<div class="chips" style="margin-top:6px">' + kw.trendsByRegion.slice(0, 10).map(function (c) {
          return '<span class="chip">' + esc(c.country) + ' <b>' + (c.value != null ? c.value : '—') + '</b></span>';
        }).join('') + '</div>';
      }
      html += '</div>';
    }
    html += '</div>';

    // 抢词检测
    if (kw.cannibalization.length) {
      html += '<div class="warnbox" style="margin:10px 0">⚠️ 检测到 <b>' + kw.cannibalization.length + '</b> 个关键词在多个页面重复重点优化（keyword cannibalization），会互相抢排名。建议为每个词指定唯一承接页，其余页用 canonical 或改写降权。</div>';
      html += kw.cannibalization.slice(0, 8).map(function (c) {
        return '<div class="cannibal"><b>' + esc(c.term) + '</b> <span class="intent-pill ' + intentClass(c.intent) + '">' + esc(c.intentLabel) + '</span> 同时出现在 ' + c.pages.length + ' 页：' + c.pages.map(esc).join(' · ') + '</div>';
      }).join('');
    } else {
      html += '<div class="note" style="margin:10px 0">未检测到明显的同词多页抢排名问题。</div>';
    }

    // 页面定位审计 + 挖词扩展
    html += '<div class="grid2" style="margin-top:10px"><div><b style="font-size:13px">单页关键词定位</b>' +
      kw.pageTargeting.map(function (p) {
        return '<div class="chk ' + (p.ok ? 'done' : '') + '">' + esc(p.url.replace(/^https?:\/\//, '')) + ' — 「' + esc(p.primaryKeyword || '—') + '」 ' + p.passCount + '/' + p.total + '</div>';
      }).join('') + '</div>';
    html += '<div><b style="font-size:13px">挖词扩展建议（种子：' + esc((kw.suggestions[0] && kw.suggestions[0].term) || '—') + '）</b>' +
      kw.suggestions.map(function (s) {
        return '<div class="topic"><span class="intent-pill ' + intentClass(s.intent) + '">' + esc(s.intentLabel) + '</span> <span class="cat-pill">' + esc(catLabel(s.category)) + '</span> ' + esc(s.term) + '<div style="color:#6b7280;font-size:11.5px">' + esc(s.why) + '</div></div>';
      }).join('') + '</div></div>';

    // ---- 内容 SEO / E-E-A-T ----
    html += '<h4 style="margin:16px 0 6px;font-size:14px;color:#334155">② 内容 SEO 与 E-E-A-T 信号</h4>';
    html += '<div class="chips" style="margin-bottom:8px"><span class="chip">E-E-A-T 评级 <b>' + esc(content.eeAtRating) + '</b>（' + content.eeAtScore + '/100）</span>' +
      '<span class="chip">信任页 <b>' + content.haveMust + '/' + content.mustTotal + '</b></span>' +
      '<span class="chip">薄弱页 <b>' + content.thinPages.length + '</b></span></div>';
    html += '<div class="grid2"><div>' + content.trustSignals.map(function (t) {
      return '<div class="chk ' + (t.found ? 'done' : '') + '">' + esc(t.label) + '</div>';
    }).join('') + '</div>';
    html += '<div><b style="font-size:12.5px;color:#64748b">待建内容选题（填补意图缺口）</b>' +
      content.topicIdeas.map(function (t) {
        return '<div class="topic"><span class="cat-pill">' + esc(t.type) + '</span> ' + esc(t.topic) + '</div>';
      }).join('') + '</div></div>';
    if (content.thinPages.length) {
      html += '<div class="note">内容稀薄页（正文 &lt;300 词，建议 content refresh 重写/更新数据/合并）：' +
        content.thinPages.map(function (p) { return esc(p.url.replace(/^https?:\/\//, '')) + '(' + p.words + '词)'; }).join(' · ') + '</div>';
    }

    // ---- 站外 SEO / 外链 ----
    html += '<h4 style="margin:16px 0 6px;font-size:14px;color:#334155">③ 站外 SEO / 外链（健康度与流程）</h4>';
    html += '<div class="note">' + esc(off.outboundProfile.note) + (off.outboundProfile.topDomains.length ? ' 出站域名：' + off.outboundProfile.topDomains.slice(0, 8).map(esc).join('、') : '') + '</div>';
    html += '<div class="warnbox" style="background:#fff7ed;border-color:#fde68a;color:#92400e">外链数量、质量（DA/DR、垃圾占比）、锚文本分布需用 Ahrefs / Semrush / GSC 链接报告回填（见下方「需接入」）。反链健康度排查与 disavow 流程如下：</div>';
    html += '<div class="grid2"><div><b style="font-size:12.5px;color:#64748b">反链健康度指标（需接入）</b>' +
      off.backlinkNeeds.metrics.map(function (m) { return renderMetric(m.label, { value: null, source: m.source, manual: true, note: '' }); }).join('') + '</div>';
    html += '<div><b style="font-size:12.5px;color:#64748b">Disavow 拒绝烂链流程</b>' +
      off.disavowWorkflow.map(function (s, i) { return '<div class="chk">' + (i + 1) + '. ' + esc(s) + '</div>'; }).join('') + '</div></div>';
    html += '<div class="note"><b>品牌提及与声誉监测：</b>' + off.brandMonitoring.map(esc).join(' · ') + '</div>';

    // ---- 四层指标 ----
    html += '<h4 style="margin:16px 0 6px;font-size:14px;color:#334155">④ 效果指标（四层，别只看排名）</h4>';
    html += '<div class="layer"><h4>🌊 流量与排名层（过程）</h4>' +
      renderMetric('全球排名', layers.traffic.globalRank) +
      renderMetric('自然流量会话', layers.traffic.organicSessions) +
      renderMetric('核心词前 10 数', layers.traffic.coreKeywordTop10) +
      renderMetric('收录页面数/覆盖率', layers.traffic.indexedPages) +
      renderMetric('月访问估算(SW)', layers.traffic.estimatedVisits) +
      renderMetric('自然流量占比目标', layers.traffic.organicShareTarget) + '</div>';
    html += '<div class="layer"><h4>🎯 转化层（核心业务）</h4>' +
      renderMetric('自然询盘/线索', layers.conversion.leadsFromOrganic) +
      renderMetric('落地页转化率', layers.conversion.landingCvr) +
      renderMetric('自然渠道 CAC', layers.conversion.organicCac) +
      renderMetric('词→线索归因', layers.conversion.kwToLeadAttribution) +
      renderMetric('站内转化入口', layers.conversion.ctaPresent) + '</div>';
    html += '<div class="layer"><h4>🧱 技术健康层（底线）</h4>' +
      renderMetric('LCP', layers.technical.lcp) +
      renderMetric('INP', layers.technical.inp) +
      renderMetric('CLS', layers.technical.cls) +
      renderMetric('HTTPS 覆盖率', layers.technical.httpsCoverage) +
      renderMetric('抓取错误/死链', layers.technical.crawlErrors) +
      renderMetric('混合内容', layers.technical.mixedContent) + '</div>';
    html += '<div class="layer"><h4>💰 商业层（高级岗必背）</h4>' +
      '<div class="note" style="margin-top:0">' + esc(layers.commercial.roi.formula) + ' — ' + esc(layers.commercial.roi.lag) + '</div>' +
      renderMetric('人力成本', layers.commercial.roi.inputs.laborCost) +
      renderMetric('工具费', layers.commercial.roi.inputs.toolCost) +
      renderMetric('外链/内容预算', layers.commercial.roi.inputs.linkBudget) +
      renderMetric('自然成交金额', layers.commercial.roi.inputs.deals) +
      renderMetric('品牌词搜索增长', layers.commercial.brandSearchGrowth) +
      renderMetric('漏斗累计贡献', layers.commercial.cumulativeContribution) + '</div>';

    // ---- 节奏打法 ----
    html += '<h4 style="margin:16px 0 6px;font-size:14px;color:#334155">⑤ 节奏打法（日 / 周 / 月 / 季）</h4>';
    var rhythmGroups = [['每日', rhythm.daily], ['每周', rhythm.weekly], ['每月', rhythm.monthly], ['每季', rhythm.quarterly]];
    html += '<div class="grid2">' + rhythmGroups.map(function (g) {
      return '<div><b style="font-size:12.5px;color:#64748b">' + g[0] + '</b>' + g[1].map(function (s) { return '<div class="chk">' + esc(s) + '</div>'; }).join('') + '</div>';
    }).join('') + '</div>';

    // 口径
    html += '<div class="rp-footer"><b>数据口径：</b><ul style="margin:4px 0 0;padding-left:18px">' +
      a.dataTier.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>';

    html += '</section>';
    return el(html);
  }

  function renderReport(data, mount) {
    if (!mount) throw new Error('renderReport 需要挂载节点');
    mount.innerHTML = '';
    var root = el('<div class="rp"></div>');
    root.appendChild(buildVerdict(data));
    var grid = el('<div class="grid2"></div>');
    grid.appendChild(buildDimCard(data));
    grid.appendChild(buildPerfCard(data));
    root.appendChild(grid);
    root.appendChild(buildTrafficCard(data));
    root.appendChild(buildSeoCard(data));
    var geoCard = buildGeoCard(data);
    if (geoCard) root.appendChild(geoCard);
    var grid2 = el('<div class="grid2"></div>');
    grid2.appendChild(buildTechCard(data));
    grid2.appendChild(buildTrackerCard(data));
    root.appendChild(grid2);
    if (data.pagespeed && data.pagespeed.available) root.appendChild(buildPsiCard(data));
    root.appendChild(buildSuggestionsCard(data));
    var autoSeo = buildAutoSeoCard(data);
    if (autoSeo) root.appendChild(autoSeo);
    var pos = buildPositivesCard(data);
    if (pos) root.appendChild(pos);
    root.appendChild(buildAppendix(data));
    root.appendChild(buildFooter(data));
    mount.appendChild(root);
    drawCharts(data);
    return root;
  }

  global.REPORT_CSS = REPORT_CSS;
  global.renderReport = renderReport;
})(typeof window !== 'undefined' ? window : globalThis);
