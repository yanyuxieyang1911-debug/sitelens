'use strict';
/**
 * server.js — SiteLens 独立站分析工具服务端
 * 零第三方依赖：node server.js 即可运行（Node >= 18）
 *
 * 接口：
 *   GET /api/analyze?domain=example.com           SSE 流式分析（默认）
 *   GET /api/analyze?domain=example.com&format=json  一次性 JSON 返回
 *   GET /api/health                               健康检查
 *   其余路径                                        静态文件（public/）
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { analyze } = require('./lib/analyzer');

const PORT = Number(process.env.PORT || 8720);
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(pathname, res) {
  let p = pathname;
  try {
    p = decodeURIComponent(pathname);
  } catch (e) {}
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Forbidden');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(data);
  });
}

function handleAnalyze(req, res, u) {
  const domain = (u.searchParams.get('domain') || '').trim();
  const format = u.searchParams.get('format');
  const useSse = format !== 'json';

  if (!domain) {
    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ error: '缺少 domain 参数，例如 /api/analyze?domain=example.com' }));
  }

  if (useSse) {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'access-control-allow-origin': '*',
    });
    res.write('retry: 3000\n\n');
  } else {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  }

  const state = { aborted: false };
  const onStep = (s) => {
    if (!useSse) return;
    try {
      res.write('event: step\ndata: ' + JSON.stringify(s) + '\n\n');
    } catch (e) {}
  };
  const send = (event, data) => {
    if (!useSse) return;
    try {
      res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n');
    } catch (e) {}
  };

  let heartbeat = null;
  if (useSse) {
    heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch (e) {}
    }, 15000);
    req.on('close', () => {
      state.aborted = true;
      if (heartbeat) clearInterval(heartbeat);
    });
  }

  const finish = () => {
    if (heartbeat) clearInterval(heartbeat);
  };

  analyze(domain, { onStep, isAborted: () => state.aborted })
    .then((r) => {
      if (useSse) {
        send('result', r);
        res.end();
      } else {
        res.end(JSON.stringify(r));
      }
      finish();
    })
    .catch((e) => {
      const payload = { error: e.userMessage || e.message || '分析失败', status: e.status || 500 };
      if (useSse) {
        send('error', payload);
        res.end();
      } else {
        res.end(JSON.stringify(payload));
      }
      finish();
    });
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  try {
    if (u.pathname === '/api/analyze') return handleAnalyze(req, res, u);
    if (u.pathname === '/api/health') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: true, uptime: Math.round(process.uptime()) }));
    }
    return serveStatic(u.pathname, res);
  } catch (e) {
    res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: '服务器内部错误：' + e.message }));
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('  📊 SiteLens 独立站分析工具已启动');
  console.log('  ------------------------------------');
  console.log('  本地访问:  http://localhost:' + PORT);
  console.log('  分析接口:  /api/analyze?domain=example.com');
  console.log('  退出:      Ctrl + C');
  console.log('');
});
