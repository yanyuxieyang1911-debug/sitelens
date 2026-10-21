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
    '@media print{.rp{background:#fff;padding:0}.rp .card,.verdict{box-shadow:none;break-inside:avoid}}'
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
    { key: 'performance', label: '性能体验', icon: '⚡', weight: 25 },
    { key: 'seo', label: 'SEO 基础', icon: '🔍', weight: 20 },
    { key: 'marketing', label: '营销与追踪', icon: '📈', weight: 20 },
    { key: 'tech', label: '技术健康', icon: '🧩', weight: 15 },
    { key: 'security', label: '安全合规', icon: '🔒', weight: 10 },
    { key: 'trust', label: '转化信任', icon: '🤝', weight: 10 },
  ];

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
    var dims = DIMENSION_META.map(function (m) {
      var v = (d.scores.dimensions[m.key] || {}).score || 0;
      return v;
    });
    initChart('rp-radar', {
      color: ['#2563eb', '#cbd5e1'],
      tooltip: {},
      radar: {
        indicator: DIMENSION_META.map(function (m) {
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
              value: [75, 75, 75, 75, 75, 75],
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
    var rows = DIMENSION_META.map(function (m) {
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
    return el(
      '<section class="card"><h3>📊 六维健康度 <span class="tier t1">评分模型</span></h3>' +
      '<div id="rp-radar" class="chart"></div>' + rows +
      '<div class="note">权重：性能 25% · SEO 20% · 营销追踪 20% · 技术健康 15% · 安全合规 10% · 转化信任 10%。雷达虚线为"良好"基准 75 分。</div>' +
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
      '</div></div>' +
      '<table><thead><tr><th>检查项</th><th>结论</th><th>详情</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="note">SEO 检测基于首页单页源码；抓取时间 ' + esc(fmtDateTime(d.startedAt)) + '。SPA 站点经服务端渲染（SSR/SSG）后方可被爬虫完整索引。</div>' +
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
    var html = '';
    ['P0', 'P1', 'P2'].forEach(function (pri) {
      if (!groups[pri].length) return;
      html += '<div class="p-group-title ' + pri.toLowerCase() + '">' + titleMap[pri] + ' · ' + groups[pri].length + ' 项</div>';
      groups[pri].forEach(function (s) {
        html +=
          '<div class="sugg ' + pri.toLowerCase() + '">' +
          '<div class="sugg-head"><span class="pri">' + pri + '</span><b>' + esc(s.title) + '</b></div>' +
          '<div class="row"><i>问题</i>' + esc(s.problem) + '</div>' +
          '<div class="row"><i>做法</i>' + esc(s.action) + '</div>' +
          '<div class="row impact"><i>影响</i>' + esc(s.impact) + '</div>' +
          '</div>';
      });
    });
    if (!html) html = '<div class="empty">未发现明显问题，站点状态良好</div>';
    return el('<section class="card"><h3>🛠 修改建议 <span class="tier t2">按优先级排序</span></h3>' + html + '</section>');
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
      '<li>月访问量：基于 Tranco 排名的经验模型<b>估算</b>（非 SimilarWeb 一手流量），误差可达数倍，仅作数量级判断。</li>' +
      '<li>PageSpeed Insights：Google Lighthouse <b>实验室数据</b>，与真实用户环境存在差异。</li>' +
      '<li>分析为单次采样，结果受网络波动、CDN 节点、Bot 防护与登录状态影响；建议连续多日测量取均值。</li>' +
      '</ul>' +
      '<div style="margin-top:6px">由 <b>SiteLens 独立站分析工具</b> 自动生成 · ' + esc(fmtDateTime(d.finishedAt || d.startedAt)) + ' · 报告仅供建站与运营参考，不构成投资建议</div>' +
      '</footer>'
    );
  }

  // ---------- 主渲染 ----------
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
    var grid2 = el('<div class="grid2"></div>');
    grid2.appendChild(buildTechCard(data));
    grid2.appendChild(buildTrackerCard(data));
    root.appendChild(grid2);
    if (data.pagespeed && data.pagespeed.available) root.appendChild(buildPsiCard(data));
    root.appendChild(buildSuggestionsCard(data));
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
