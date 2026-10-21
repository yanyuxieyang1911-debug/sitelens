/* app.js — SiteLens 前端交互：SSE 流式分析、报告渲染、独立 HTML 导出 */
(function () {
  'use strict';

  var form = document.getElementById('analyzeForm');
  var input = document.getElementById('domainInput');
  var btn = document.getElementById('analyzeBtn');
  var hero = document.getElementById('hero');
  var progressPanel = document.getElementById('progressPanel');
  var stepList = document.getElementById('stepList');
  var elapsedEl = document.getElementById('elapsed');
  var errorPanel = document.getElementById('errorPanel');
  var reportMount = document.getElementById('reportMount');
  var reportActions = document.getElementById('reportActions');
  var exportBtn = document.getElementById('exportBtn');
  var printBtn = document.getElementById('printBtn');

  var currentData = null;
  var es = null;
  var timer = null;
  var stepNodes = {};
  var apiAvailable = true;
  // 静态 / 演示部署（无 Node 后端）时，示例按钮指向预生成的样例报告
  var SAMPLES = {
    'example.com': 'samples/sitelens-example.com.html',
    'allbirds.com': 'samples/sitelens-allbirds.com.html',
    'anker.com': 'samples/sitelens-anker.com.html',
    'www.anker.com': 'samples/sitelens-anker.com.html',
  };

  // 探测后端 API 是否可用；不可用时进入「静态展示模式」
  function probeApi() {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, 3500);
    fetch('/api/health', { cache: 'no-store', signal: ctrl.signal })
      .then(function (r) {
        if (!r.ok) throw new Error('bad status');
        return r.json();
      })
      .then(function (j) {
        if (!j || j.ok !== true) throw new Error('no ok');
        apiAvailable = true;
      })
      .catch(function () {
        apiAvailable = false;
        showStaticBanner();
      })
      .finally(function () { clearTimeout(t); });
  }

  function showStaticBanner() {
    var b = document.getElementById('statusBanner');
    if (!b) return;
    b.hidden = false;
    b.innerHTML =
      '<b>当前为静态展示版</b>：后台分析服务（Node）未运行，无法实时抓取域名。' +
      '如需在线使用，请用 Docker 部署到 Railway / Render 等平台（见项目 DEPLOY.md）；' +
      '或本地执行 <code>node server.js</code> 后访问 <code>http://localhost:8720</code>。' +
      '下方「试试」按钮可查看预生成的样例报告。';
  }

  function normalizeDomain(v) {
    var s = (v || '').trim().toLowerCase();
    s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
    s = s.split(/[/?#]/)[0];
    s = s.replace(/:\d+$/, '');
    s = s.replace(/\.$/, '');
    s = s.replace(/^www\./, '');
    return s;
  }

  function showError(msg) {
    errorPanel.innerHTML = '<b>分析失败</b>' + escapeHtml(msg);
    errorPanel.hidden = false;
  }
  function hideError() {
    errorPanel.hidden = true;
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function resetSteps() {
    stepList.innerHTML = '';
    stepNodes = {};
  }
  function upsertStep(s) {
    var li = stepNodes[s.key];
    if (!li) {
      li = document.createElement('li');
      li.innerHTML = '<span class="ic"></span><span class="label"></span><span class="detail"></span>';
      stepList.appendChild(li);
      stepNodes[s.key] = li;
    }
    li.querySelector('.label').textContent = s.label;
    li.querySelector('.detail').textContent = s.detail || '';
    var ic = li.querySelector('.ic');
    if (s.status === 'start') {
      ic.innerHTML = '<span class="spinner"></span>';
    } else {
      ic.textContent = '✅';
    }
  }

  function startTimer() {
    var t0 = Date.now();
    if (timer) clearInterval(timer);
    timer = setInterval(function () {
      var sec = ((Date.now() - t0) / 1000).toFixed(0);
      elapsedEl.textContent = '已用时 ' + sec + 's';
    }, 500);
  }
  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function startAnalysis(domain) {
    if (es) {
      es.close();
      es = null;
    }
    hideError();
    reportMount.innerHTML = '';
    reportActions.hidden = true;
    hero.classList.add('no-print');
    progressPanel.hidden = false;
    resetSteps();
    startTimer();
    btn.disabled = true;
    btn.textContent = '分析中…';

    es = new EventSource('/api/analyze?domain=' + encodeURIComponent(domain));

    es.addEventListener('step', function (ev) {
      try {
        upsertStep(JSON.parse(ev.data));
      } catch (e) {}
    });

    es.addEventListener('result', function (ev) {
      stopTimer();
      btn.disabled = false;
      btn.textContent = '开始分析';
      progressPanel.hidden = true;
      es.close();
      es = null;
      try {
        currentData = JSON.parse(ev.data);
      } catch (e) {
        showError('报告数据解析失败');
        return;
      }
      try {
        renderReport(currentData, reportMount);
        reportActions.hidden = false;
        if (currentData.warnings && currentData.warnings.length) {
          console.warn('[SiteLens] 分析警告：', currentData.warnings);
        }
      } catch (e) {
        showError('报告渲染失败：' + e.message);
      }
    });

    es.addEventListener('error', function (ev) {
      stopTimer();
      btn.disabled = false;
      btn.textContent = '开始分析';
      progressPanel.hidden = true;
      if (es) { es.close(); es = null; }
      var msg = '分析服务连接中断，请重试';
      try {
        if (ev.data) {
          var d = JSON.parse(ev.data);
          msg = d.error || msg;
        }
      } catch (e) {}
      showError(msg);
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var domain = normalizeDomain(input.value);
    if (!domain || !/^[a-z0-9一-龥-]+(\.[a-z0-9一-龥-]+)+$/.test(domain) || !/\.[a-z一-龥]{2,}$/.test(domain)) {
      showError('域名格式不正确，请输入类似 allbirds.com 的域名（无需 http:// 与路径）');
      return;
    }
    input.value = domain;
    if (!apiAvailable) {
      showError('当前为静态展示版，后台分析服务未运行，无法实时抓取。请本地运行 node server.js 或按 DEPLOY.md 部署到云端，也可点击「试试」查看样例报告。');
      return;
    }
    startAnalysis(domain);
  });

  document.querySelectorAll('.examples button').forEach(function (b) {
    b.addEventListener('click', function () {
      var d = b.getAttribute('data-d');
      if (!apiAvailable && SAMPLES[d]) {
        window.open(SAMPLES[d], '_blank');
        return;
      }
      input.value = d;
      form.dispatchEvent(new Event('submit'));
    });
  });

  /* ---------- 导出独立 HTML 报告（内联 ECharts + 渲染器，完全自包含） ---------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  exportBtn.addEventListener('click', function () {
    if (!currentData) return;
    exportBtn.disabled = true;
    exportBtn.textContent = '生成中…';
    Promise.all([
      fetch('report-template.js').then(function (r) { return r.text(); }),
      fetch('vendor/echarts.min.js').then(function (r) { return r.text(); }),
    ])
      .then(function (texts) {
        var tpl = texts[0];
        var echartsSrc = texts[1];
        var payload = JSON.stringify(currentData).replace(/<\//g, '<\\/');
        var now = new Date();
        var stamp = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '-' + pad(now.getHours()) + pad(now.getMinutes());
        var html = [
          '<!DOCTYPE html>',
          '<html lang="zh-CN">',
          '<head>',
          '<meta charset="UTF-8">',
          '<meta name="viewport" content="width=device-width, initial-scale=1">',
          '<title>SiteLens 流量分析报告 - ' + escapeHtml(currentData.domain) + '</title>',
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
        var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'SiteLens报告-' + currentData.domain + '-' + stamp + '.html';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
      })
      .catch(function (e) {
        showError('导出失败：' + e.message);
      })
      .finally(function () {
        exportBtn.disabled = false;
        exportBtn.textContent = '⬇ 导出独立 HTML 报告';
      });
  });

  printBtn.addEventListener('click', function () {
    window.print();
  });

  // 页面加载即探测后端可用性（静态部署时进入展示模式）
  probeApi();
})();
