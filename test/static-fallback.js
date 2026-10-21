'use strict';
/**
 * test/static-fallback.js — 前端「无后端 / 静态展示」降级路径验证（jsdom）
 * 运行：NODE_PATH=<managed>/node/workspace/node_modules node test/static-fallback.js
 *
 * 验证两点：
 *  1) 探测不到 /api/health 时，顶部「静态展示版」横幅显示，且表单提交不崩溃（提示而非白屏）
 *  2) 探测到 /api/health 时，横幅保持隐藏（正常模式）
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const PUBLIC = path.join(__dirname, '..', 'public');

function buildDom() {
  const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  // 去掉所有 <script> 标签：页面脚本不自动执行，由我们手动 eval app.js
  const htmlNoScripts = html.replace(/<script[\s\S]*?<\/script>/g, '');
  const dom = new JSDOM(htmlNoScripts, { runScripts: 'outside-only' });
  const { window } = dom;
  if (!window.AbortController) {
    window.AbortController = class {
      constructor() { this.signal = {}; }
      abort() {}
    };
  }
  return { dom, window };
}

function runApp(window) {
  const src = fs.readFileSync(path.join(PUBLIC, 'app.js'), 'utf8');
  window.eval(src);
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let failures = 0;
function check(name, cond) {
  console.log((cond ? '  ✓ ' : '  ✗ FAIL: ') + name);
  if (!cond) failures++;
}

async function testNoBackend() {
  console.log('\n[场景 A] 无后端（静态展示部署）');
  const { window } = buildDom();
  window.fetch = () => Promise.reject(new Error('no backend'));
  runApp(window);
  await wait(200);
  const b = window.document.getElementById('statusBanner');
  check('展示版横幅显示（hidden=false 且含「静态展示版」文案）',
    !!b && b.hidden === false && /静态展示版/.test(b.innerHTML));
  // 表单提交不应抛出异常导致页面崩溃
  let crashed = false;
  try {
    const input = window.document.getElementById('domainInput');
    input.value = 'allbirds.com';
    window.document.getElementById('analyzeForm').dispatchEvent(new window.Event('submit'));
  } catch (e) {
    crashed = true;
    console.log('    异常:', e.message);
  }
  check('表单提交不崩溃（显示提示而非白屏）', !crashed);
  const err = window.document.getElementById('errorPanel');
  check('表单提交后给出明确提示（非空白）', !!err && !err.hidden && err.innerHTML.length > 0);
}

async function testWithBackend() {
  console.log('\n[场景 B] 有后端（正常部署）');
  const { window } = buildDom();
  window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
  runApp(window);
  await wait(200);
  const b = window.document.getElementById('statusBanner');
  check('横幅保持隐藏（正常模式）', !!b && b.hidden === true);
}

(async () => {
  console.log('=== SiteLens 前端降级测试 ===');
  await testNoBackend();
  await testWithBackend();
  console.log('\n' + (failures === 0 ? 'ALL PASS ✅' : failures + ' 项失败 ❌'));
  process.exit(failures === 0 ? 0 : 1);
})();
