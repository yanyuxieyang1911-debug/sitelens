'use strict';
/**
 * httpclient.js — 零依赖 HTTP 客户端
 * 能力：逐跳计时（TTFB/总耗时）、重定向链追踪、gzip/deflate/br 解压、响应体体积上限保护
 */
const http = require('http');
const https = require('https');
const zlib = require('zlib');

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 SiteLensBot/1.0';

function elapsedMs(t0) {
  return Math.round(Number(process.hrtime.bigint() - t0) / 1e4) / 100;
}

function decompress(buf, encoding) {
  const enc = (encoding || '').toLowerCase();
  try {
    if (enc.includes('br')) return zlib.brotliDecompressSync(buf);
    if (enc.includes('gzip')) return zlib.gunzipSync(buf);
    if (enc.includes('deflate')) return zlib.inflateSync(buf);
  } catch (e) {
    return null;
  }
  return buf;
}

function request(urlStr, options = {}) {
  const {
    method = 'GET',
    headers = {},
    timeout = 15000,
    maxRedirects = 5,
    maxBytes = 12 * 1024 * 1024,
    body = null,
  } = options;

  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(urlStr);
    } catch (e) {
      return reject(new Error('无效 URL: ' + urlStr));
    }

    const hops = [];
    let hopIndex = 0;

    const step = (currentUrl, depth) => {
      const isHttps = currentUrl.protocol === 'https:';
      const lib = isHttps ? https : http;
      const t0 = process.hrtime.bigint();
      const reqHeaders = {
        'user-agent': DEFAULT_UA,
        accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'accept-encoding': 'gzip, deflate, br',
        connection: 'close',
        ...headers,
      };

      // 支持请求体（POST 表单 / JSON）
      let reqBody = null;
      if (body != null) {
        reqBody = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
        if (!reqHeaders['content-length']) reqHeaders['content-length'] = String(reqBody.length);
        if (!reqHeaders['content-type']) reqHeaders['content-type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
      }

      const req = lib.request(currentUrl, { method, headers: reqHeaders }, (res) => {
        const ttfbMs = elapsedMs(t0);
        const chunks = [];
        let received = 0;
        let truncated = false;

        res.on('data', (c) => {
          received += c.length;
          if (received > maxBytes) {
            truncated = true;
            req.destroy(new Error('响应体超过 ' + Math.round(maxBytes / 1048576) + 'MB 上限'));
            return;
          }
          chunks.push(c);
        });

        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          const totalMs = elapsedMs(t0);
          const hop = {
            index: hopIndex++,
            url: currentUrl.toString(),
            status: res.statusCode,
            ttfbMs,
            totalMs,
            rawSize: raw.length,
          };
          if (truncated) hop.truncated = true;
          hops.push(hop);

          if (
            [301, 302, 303, 307, 308].includes(res.statusCode) &&
            res.headers.location &&
            depth < maxRedirects
          ) {
            let next;
            try {
              next = new URL(res.headers.location, currentUrl);
            } catch (e) {
              return reject(new Error('重定向地址无效: ' + res.headers.location));
            }
            hop.redirectTo = next.toString();
            return step(next, depth + 1);
          }

          const encoding = res.headers['content-encoding'];
          let body = decompress(raw, encoding);
          let compression = 'none';
          if (encoding) {
            const e = String(encoding).toLowerCase();
            compression = e.includes('br') ? 'br' : e.includes('gzip') ? 'gzip' : e.includes('deflate') ? 'deflate' : 'unknown';
            if (body === null) {
              body = raw;
              compression = compression + '(解码失败)';
            }
          } else {
            body = raw;
          }

          resolve({
            url: currentUrl.toString(),
            status: res.statusCode,
            headers: res.headers,
            body,
            size: body.length,
            rawSize: raw.length,
            ttfbMs,
            totalMs,
            compression,
            hops,
            hopCount: hops.length - 1,
          });
        });
      });

      req.on('error', (e) => reject(e));
      req.setTimeout(timeout, () => req.destroy(new Error('请求超时（' + timeout / 1000 + 's）')));
      if (reqBody) req.write(reqBody);
      req.end();
    };

    step(url, 0);
  });
}

function getText(url, opts = {}) {
  return request(url, { ...opts, maxBytes: opts.maxBytes || 32 * 1024 * 1024 }).then((r) =>
    r.body.toString('utf8')
  );
}

function getJson(url, opts = {}) {
  return getText(url, opts).then((t) => JSON.parse(t));
}

module.exports = { request, getText, getJson, DEFAULT_UA };
