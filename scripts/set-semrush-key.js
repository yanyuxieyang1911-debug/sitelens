#!/usr/bin/env node
'use strict';
/**
 * set-semrush-key.js — 配置 / 查看 / 清除 Semrush API key
 *
 * 用途：不想手改 config.json 时，用一条命令把 key 写进去（输入不回显，不会留在命令历史里）。
 * 写入位置：项目根 config.json 的 semrushApiKey 字段（该文件已被 .gitignore 忽略，不会进版本库）。
 *
 * 用法：
 *   node scripts/set-semrush-key.js              # 交互输入（不回显）
 *   node scripts/set-semrush-key.js --show       # 查看当前 key（脱敏）与来源
 *   node scripts/set-semrush-key.js --clear      # 清除已保存的 key
 *   node scripts/set-semrush-key.js --key=xxxx   # 非交互写入（会留在 shell 历史，建议仅脚本里用）
 *   node scripts/set-semrush-key.js --verify     # 写入后顺便向 Semrush 校验一次
 *
 * key 获取：Semrush → 右上头像 → Subscription info → API access（形如 32 位十六进制）。
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CONFIG = path.join(__dirname, '..', 'config.json');

function readConfig() {
  try {
    const o = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
    return o && typeof o === 'object' ? o : {};
  } catch (e) {
    return {};
  }
}

function writeConfig(cfg) {
  const json = JSON.stringify(cfg, null, 2) + '\n';
  fs.writeFileSync(CONFIG, json, { mode: 0o600 });
  try {
    fs.chmodSync(CONFIG, 0o600);
  } catch (e) {}
}

function mask(k) {
  if (!k) return '(未设置)';
  if (k.length <= 8) return '*'.repeat(k.length);
  return k.slice(0, 4) + '****' + k.slice(-4);
}

/** 隐藏回显地读一行；非 TTY（管道）时直接读 stdin 第一行 */
function askHidden(question) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      let buf = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (d) => {
        buf += d;
        const nl = buf.indexOf('\n');
        if (nl >= 0) {
          process.stdin.pause();
          resolve(buf.slice(0, nl).trim());
        }
      });
      process.stdin.on('end', () => resolve(buf.trim()));
      process.stdin.on('error', reject);
      return;
    }
    process.stdout.write(question);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = function () {}; // 吞掉回显，key 不出现在屏幕上
    rl.question('', (ans) => {
      rl.close();
      process.stdout.write('\n');
      resolve(String(ans || '').trim());
    });
  });
}

function fingerprint(key) {
  if (/^[0-9a-f]{32}$/i.test(key)) return '';
  return '⚠ 这个 key 不像标准的 Semrush key（通常为 32 位十六进制），已按原样保存，但可能无法通过校验。';
}

/** 向 Semrush 发一次最小请求，确认 key 可用 */
async function verifyKey(key) {
  const url =
    'https://api.semrush.com/analytics/ta/api/v3/summary?key=' + encodeURIComponent(key) +
    '&target=example.com&export_columns=target,visits&database=us';
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    const text = await r.text();
    clearTimeout(t);
    if (!r.ok) return { ok: false, msg: 'HTTP ' + r.status + '：' + text.slice(0, 120) };
    if (/^\s*ERROR/i.test(text)) return { ok: false, msg: text.slice(0, 160) };
    return { ok: true, msg: '接口返回正常（' + text.split('\n')[0].slice(0, 60) + '）' };
  } catch (e) {
    clearTimeout(t);
    return { ok: false, msg: '校验请求失败（网络不通或被代理拦截）：' + String((e && e.message) || e).slice(0, 120) };
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (n) => argv.includes(n);
  const getArg = (n) => {
    const hit = argv.find((a) => a.startsWith(n + '='));
    return hit ? hit.slice(n.length + 1) : null;
  };

  if (flag('--help') || flag('-h')) {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!.*\n/, '').replace(/\/\*\*\n?/, ''));
    return;
  }

  const cfg = readConfig();
  const envKey = process.env.SEMRUSH_API_KEY || '';

  if (flag('--show')) {
    console.log('');
    console.log('  配置文件   : ' + CONFIG);
    console.log('  已保存 key : ' + mask(cfg.semrushApiKey));
    console.log('  环境变量   : ' + (envKey ? mask(envKey) + '（优先级更高，会覆盖配置文件）' : '(未设置)'));
    console.log('  生效 key   : ' + mask(envKey || cfg.semrushApiKey || ''));
    console.log('');
    return;
  }

  if (flag('--clear')) {
    delete cfg.semrushApiKey;
    writeConfig(cfg);
    console.log('\n  ✓ 已清除 config.json 中的 semrushApiKey' + (envKey ? '（注意：环境变量 SEMRUSH_API_KEY 仍生效）' : '') + '\n');
    return;
  }

  let key = getArg('--key');
  const interactive = !key;
  if (interactive) {
    console.log('\n  Semrush API key 配置（输入不回显，直接回车取消）');
    console.log('  获取位置：Semrush → 头像 → Subscription info → API access\n');
    key = await askHidden('  请粘贴 key：');
  }
  if (!key) {
    console.log('\n  (已取消，未做修改)\n');
    return;
  }

  const warn = fingerprint(key);
  cfg.semrushApiKey = key;
  writeConfig(cfg);
  console.log('\n  ✓ 已写入 ' + CONFIG);
  console.log('    key：' + mask(key) + '（该文件已被 .gitignore 忽略，不会进版本库）');
  if (warn) console.log('  ' + warn);
  if (envKey && envKey !== key) console.log('  ⚠ 环境变量 SEMRUSH_API_KEY 已设置且不同，运行时以环境变量为准（先 unset 再用这个）');

  if (flag('--verify')) {
    process.stdout.write('\n  正在向 Semrush 校验… ');
    const r = await verifyKey(key);
    console.log(r.ok ? '✓ ' + r.msg : '✗ ' + r.msg);
  }
  console.log('');
}

main().catch((e) => {
  console.error('\n  ✗ ' + String((e && e.message) || e) + '\n');
  process.exitCode = 1;
});
