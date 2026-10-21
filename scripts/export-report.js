'use strict';
/**
 * scripts/export-report.js — 命令行导出自包含 HTML 报告（无需浏览器）
 * 用法：node scripts/export-report.js <域名> [输出目录，默认 reports/]
 */
const fs = require('fs');
const path = require('path');
const { analyze } = require('../lib/analyzer');

const PUBLIC = path.join(__dirname, '..', 'public');

function buildStandalone(data, tpl, echartsSrc) {
  const payload = JSON.stringify(data).replace(/<\//g, '<\\/');
  return [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>SiteLens 流量分析报告 - ' + data.domain + '</title>',
    '<style>',
    'body{margin:0;background:#eef1f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}',
    '.wrap{max-width:1080px;margin:0 auto;padding:18px}',
    '</style>',
    '</head>',
    '<body>',
    '<div class="wrap"><div id="app"></div></div>',
    '<scr' + 'ipt>' + echartsSrc + '</scr' + 'ipt>',
    '<scr' + 'ipt>' + tpl + '</scr' + 'ipt>',
    '<scr' + 'ipt>window.__DATA__=' + payload + ';renderReport(window.__DATA__,document.getElementById("app"));</scr' + 'ipt>',
    '</body>',
    '</html>',
  ].join('\n');
}

async function main() {
  const domain = process.argv[2];
  const outDir = process.argv[3] || path.join(__dirname, '..', 'reports');
  if (!domain) {
    console.error('用法: node scripts/export-report.js <域名> [输出目录]');
    process.exit(1);
  }
  process.stderr.write('正在分析 ' + domain + ' …\n');
  const data = await analyze(domain, {
    onStep: (s) => {
      process.stderr.write('  ' + (s.status === 'done' ? '✓' : '…') + ' ' + s.label + (s.detail ? ' — ' + s.detail : '') + '\n');
    },
  });
  const tpl = fs.readFileSync(path.join(PUBLIC, 'report-template.js'), 'utf8');
  const echartsSrc = fs.readFileSync(path.join(PUBLIC, 'vendor', 'echarts.min.js'), 'utf8');
  const html = buildStandalone(data, tpl, echartsSrc);
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, 'sitelens-' + data.domain + '.html');
  fs.writeFileSync(file, html);
  console.log('报告已生成: ' + file + '（' + (html.length / 1024).toFixed(0) + ' KB，自包含可离线打开）');
}

main().catch((e) => {
  console.error('失败: ' + (e.userMessage || e.message));
  process.exit(1);
});
