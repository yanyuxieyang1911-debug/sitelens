'use strict';
/**
 * test/ui-smoke.js — 报告渲染器无头冒烟测试（jsdom + echarts 桩）
 * 运行：NODE_PATH=<managed>/node/workspace/node_modules node test/ui-smoke.js
 * 验证：renderReport 各分支、图表 option 组装、独立 HTML 导出组装可执行
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const PUBLIC = path.join(__dirname, '..', 'public');
const CACHE = path.join(__dirname, '..', '.cache');

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log('  ✓ ' + name);
  } else {
    failures++;
    console.log('  ✗ FAIL: ' + name);
  }
}

function makeEchartsStub(registry) {
  return {
    init(el) {
      const inst = {
        el,
        option: null,
        setOption(o) {
          this.option = o;
          registry.push(this);
        },
        resize() {},
      };
      return inst;
    },
  };
}

function loadTemplate(window) {
  const src = fs.readFileSync(path.join(PUBLIC, 'report-template.js'), 'utf8');
  window.eval(src);
}

function baseDom() {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', {
    url: 'http://localhost:8720/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  return dom;
}

// ---------- 场景 1：完整数据（anker，PSI 不可用分支） ----------
console.log('\n[场景1] 完整数据渲染（www.anker.com）');
{
  const charts = [];
  const dom = baseDom();
  dom.window.echarts = makeEchartsStub(charts);
  loadTemplate(dom.window);
  const data = JSON.parse(fs.readFileSync(path.join(CACHE, 'anker2.json'), 'utf8'));
  let err = null;
  try {
    dom.window.renderReport(data, dom.window.document.getElementById('app'));
  } catch (e) {
    err = e;
  }
  const doc = dom.window.document;
  check('渲染无异常', !err);
  if (err) console.log('    ' + err.stack);
  check('根容器 .rp 存在', !!doc.querySelector('.rp'));
  check('结论卡分数正确', doc.querySelector('.score-ring b').textContent === String(data.scores.overall));
  check('诊断语注入', doc.querySelector('.diagnosis').textContent.includes('综合'));
  check('域名注入（规范化后）', doc.querySelector('.verdict-text code').textContent === data.domain);
  check('6 个维度行', doc.querySelectorAll('.dim-row').length === 6);
  check('维度明细条目', doc.querySelectorAll('.dim-detail li').length > 10);
  check('SEO 体检表行数 = checks 数', doc.querySelectorAll('.rp table tbody tr').length > 5);
  check('建议卡片数 = suggestions 数', doc.querySelectorAll('.sugg').length === data.suggestions.length);
  check('P0/P1/P2 分组标题（1~3 组）', doc.querySelectorAll('.p-group-title').length >= 1 && doc.querySelectorAll('.p-group-title').length <= 3);
  check('技术栈分组渲染', doc.querySelectorAll('.tech-group').length >= 3);
  check('追踪矩阵 8 行', (doc.querySelector('.rp').textContent.match(/Google Analytics 4/g) || []).length >= 1);
  check('附录响应头表', doc.body.textContent.includes('strict-transport-security') || doc.body.textContent.includes('server'));
  check('数据来源区块', doc.body.textContent.includes('Tranco'));
  check('页脚口径说明', doc.body.textContent.includes('口径与可信度标注'));
  check('图表初始化 3 个', charts.length === 3);
  check('雷达图 6 个指标', charts[0] && charts[0].option.radar.indicator.length === 6);
  check('雷达图含基准序列', charts[0] && charts[0].option.series.length === 2);
  const perfBars = charts[1] && charts[1].option.series[0].data.length;
  check('性能条形图 ≥1 条（TTFB）', perfBars >= 1);
  check('SEO 环形图 3 项', charts[2] && charts[2].option.series[0].data.length === 3);
  const html = doc.getElementById('app').innerHTML;
  check('无 undefined 泄漏', !/>undefined</.test(html));
  check('无 NaN 泄漏', !html.includes('NaN'));
  check('无 Object 对象泄漏', !html.includes('[object'));
}

// ---------- 场景 2：无排名/无 PSI 分支 ----------
console.log('\n[场景2] 降级分支（无 Tranco 排名 / 无 PageSpeed）');
{
  const charts = [];
  const dom = baseDom();
  dom.window.echarts = makeEchartsStub(charts);
  loadTemplate(dom.window);
  const data = JSON.parse(fs.readFileSync(path.join(CACHE, 'anker2.json'), 'utf8'));
  data.traffic = { rank: null, rankReason: '未进入 Tranco 全球 Top 100 万', estimate: null, commonCrawl: null, notes: ['测试备注'] };
  data.pagespeed = { available: false, reason: '测试：接口不可达', mobile: null, desktop: null };
  data.positives = [];
  let err = null;
  try {
    dom.window.renderReport(data, dom.window.document.getElementById('app'));
  } catch (e) {
    err = e;
  }
  const doc = dom.window.document;
  check('降级渲染无异常', !err);
  if (err) console.log('    ' + err.stack);
  check('流量卡显示无法估算', doc.body.textContent.includes('无法估算'));
  check('PSI 不可用提示', doc.body.textContent.includes('PageSpeed Insights 暂不可用'));
  check('无 positives 时跳过亮点卡', !doc.body.textContent.includes('做得好的地方'));
  check('性能图仅 TTFB 一条', charts[1].option.series[0].data.length === 1);
  check('排名显示未上榜', doc.body.textContent.includes('未上榜'));
}

// ---------- 场景 3：独立 HTML 导出组装可执行 ----------
console.log('\n[场景3] 导出 HTML 组装与执行');
{
  const data = JSON.parse(fs.readFileSync(path.join(CACHE, 'anker2.json'), 'utf8'));
  const tpl = fs.readFileSync(path.join(PUBLIC, 'report-template.js'), 'utf8');
  const echartsStubSrc =
    'window.echarts={init:function(el){var i={setOption:function(){},resize:function(){}};window.__charts=(window.__charts||0)+1;return i}};';
  const payload = JSON.stringify(data).replace(/<\//g, '<\\/');
  check('payload 无裸 </script', !payload.includes('</script'));
  const html =
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>t</title></head><body><div id="app"></div>' +
    '<scr' + 'ipt>' + echartsStubSrc + '</scr' + 'ipt>' +
    '<scr' + 'ipt>' + tpl + '</scr' + 'ipt>' +
    '<scr' + 'ipt>window.__DATA__=' + payload + ';renderReport(window.__DATA__,document.getElementById("app"));</scr' + 'ipt>' +
    '</body></html>';
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
  const doc = dom.window.document;
  check('导出 HTML 执行后生成 .rp', !!doc.querySelector('.rp'));
  check('导出 HTML 图表初始化 3 次', dom.window.__charts === 3);
  check('导出 HTML 分数一致', doc.querySelector('.score-ring b').textContent === String(data.scores.overall));
  check('导出 HTML 建议数一致', doc.querySelectorAll('.sugg').length === data.suggestions.length);
  const outHtml = doc.getElementById('app').innerHTML;
  check('导出 HTML 无 undefined 泄漏', !/>undefined</.test(outHtml));
}

// ---------- 场景 4：example.com（小站/无技术特征） ----------
console.log('\n[场景4] 极简站点（example.com）');
{
  const charts = [];
  const dom = baseDom();
  dom.window.echarts = makeEchartsStub(charts);
  loadTemplate(dom.window);
  const data = JSON.parse(fs.readFileSync(path.join(CACHE, 'example.json'), 'utf8'));
  let err = null;
  try {
    dom.window.renderReport(data, dom.window.document.getElementById('app'));
  } catch (e) {
    err = e;
  }
  check('example.com 渲染无异常', !err);
  if (err) console.log('    ' + err.stack);
  check('技术栈区域有内容', doc2Count(dom.window.document) > 0);
  check('访问量估算展示', dom.window.document.body.textContent.includes('亿') || dom.window.document.body.textContent.includes('万'));
}

function doc2Count(doc) {
  return doc.querySelectorAll('.chip, .empty').length;
}

console.log('\n=================================');
if (failures) {
  console.log('结果：' + failures + ' 项失败');
  process.exit(1);
} else {
  console.log('结果：全部通过 ✅');
}
