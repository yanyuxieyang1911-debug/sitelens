#!/usr/bin/env node
'use strict';
/**
 * push-via-api.js — 用 GitHub Git Data API 推送本地提交
 *
 * 适用场景：本机 / 容器 / 沙箱里 github.com 的 git 协议（22 或 443 的 git-upload-pack）
 * 被网络策略拦截，但 api.github.com 可达。
 *
 * 用法：
 *   GH_TOKEN=ghp_xxx node scripts/push-via-api.js
 *   GH_TOKEN=ghp_xxx node scripts/push-via-api.js --dry-run        # 只看会推什么，不写远端
 *   node scripts/push-via-api.js --token=ghp_xxx --branch=main
 *   node scripts/push-via-api.js --message="自定义提交信息"
 *
 * 两种模式：
 *   ① 重放模式（保留原提交 SHA）：远端 head 在本地存在且是 HEAD 的祖先 → 逐条复刻提交。
 *   ② 整树同步（SHA 会变）：远端历史与本地分叉（例如之前用 API 建过检查点）→
 *      在远端 head 之上建一个"内容 = 本地 HEAD"的提交。
 *
 * 已知限制：token 只有 repo scope 时，GitHub 拒绝经 API 写 .github/workflows/ 下的文件
 * （返回 404）。脚本会自动跳过这些路径并醒目提示，不会因此失败。
 *
 * 安全：token 只写入临时 curl 配置文件（用完即删），不进 argv、不进日志、不落版本库。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TMP_DIR = path.join(ROOT, '.gh-tmp');
const WORKFLOW_PREFIX = '.github/workflows/';
const MAX_BLOB_BYTES = 8 * 1024 * 1024;

// ---------- 参数 ----------
function parseArgs(argv) {
  const o = { dryRun: false, branch: '', message: '', token: '', remote: 'origin' };
  for (const a of argv) {
    if (a === '--dry-run' || a === '-n') o.dryRun = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a.startsWith('--branch=')) o.branch = a.slice(9);
    else if (a.startsWith('--message=')) o.message = a.slice(10);
    else if (a.startsWith('--token=')) o.token = a.slice(8);
    else if (a.startsWith('--remote=')) o.remote = a.slice(9);
    else throw new Error('未知参数：' + a + '（用 --help 查看用法）');
  }
  return o;
}

function usage() {
  console.log(
    [
      '',
      '  push-via-api.js — 走 GitHub Git Data API 推送（git 协议被拦时的备用通道）',
      '',
      '  用法：',
      '    GH_TOKEN=ghp_xxx node scripts/push-via-api.js [选项]',
      '',
      '  选项：',
      '    --dry-run, -n       只看会推什么，不写远端',
      '    --branch=<name>     目标分支（默认当前分支）',
      '    --remote=<name>     读取哪个 remote 的仓库地址（默认 origin）',
      '    --message=<text>    整树同步模式下的提交信息',
      '    --token=<token>     也可用环境变量 GH_TOKEN / GITHUB_TOKEN',
      '    --help, -h          显示本帮助',
      '',
    ].join('\n')
  );
}

// ---------- git ----------
function git(args, opts) {
  return execFileSync('git', args, Object.assign({ cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }, opts));
}
function gitBuffer(args) {
  return execFileSync('git', args, { cwd: ROOT, maxBuffer: 512 * 1024 * 1024 });
}
function tryGit(args) {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    }).trim();
  } catch (e) {
    return '';
  }
}

function parseRepo(url) {
  let m = /^https?:\/\/[^/]+\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url);
  if (!m) m = /^git@[^:]+:([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url);
  if (!m) m = /^ssh:\/\/[^/]+\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url);
  return m ? { owner: m[1], repo: m[2] } : null;
}

// ---------- curl 封装 ----------
let API_BASE = '';
let curlReady = false;

function initCurl(token) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const cfg = path.join(TMP_DIR, 'curl.cfg');
  const lines = [
    'silent',
    'show-error',
    'header = "Authorization: token ' + token + '"',
    'header = "Accept: application/vnd.github+json"',
    'header = "X-GitHub-Api-Version: 2022-11-28"',
    '',
  ];
  fs.writeFileSync(cfg, lines.join('\n'), { mode: 0o600 });
  try {
    fs.chmodSync(cfg, 0o600);
  } catch (e) {}
  curlReady = true;
}

function cleanup() {
  try {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  } catch (e) {}
}
process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});

/**
 * 调一次 GitHub API。返回 { code, data, text }。
 * body 走临时文件（比 stdin 在 Windows 上稳），token 走 curl 配置文件（不进 argv）。
 */
function api(method, endpoint, body) {
  if (!curlReady) throw new Error('curl 未初始化');
  const args = ['-sS', '--config', '.gh-tmp/curl.cfg', '-X', method];
  if (body !== undefined) {
    fs.writeFileSync(path.join(TMP_DIR, 'body.json'), JSON.stringify(body));
    args.push('-H', 'Content-Type: application/json', '--data-binary', '@.gh-tmp/body.json');
  }
  args.push('-w', '\n%{http_code}', API_BASE + endpoint);
  let out;
  try {
    out = execFileSync('curl', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  } catch (e) {
    throw new Error('curl 调用失败（网络不可达？）：' + String(e.message || e).slice(0, 200));
  }
  const idx = out.lastIndexOf('\n');
  const code = Number(out.slice(idx + 1).trim());
  const text = out.slice(0, idx);
  let data = null;
  try {
    data = JSON.parse(text);
  } catch (e) {}
  return { code, data, text };
}

function apiOk(method, endpoint, body) {
  const r = api(method, endpoint, body);
  if (r.code !== 200 && r.code !== 201 && r.code !== 204) {
    const msg = (r.data && r.data.message) || (r.text || '').slice(0, 200) || '(空响应)';
    throw new Error(method + ' ' + endpoint + ' → HTTP ' + r.code + '：' + msg);
  }
  return r.data;
}

// ---------- 读取本地对象 ----------
function readCommit(sha) {
  const raw = git(['cat-file', '-p', sha], { encoding: 'utf8' }); // 不 trim：消息末尾换行要原样保留
  const sep = raw.indexOf('\n\n');
  const headers = sep >= 0 ? raw.slice(0, sep) : raw;
  const message = sep >= 0 ? raw.slice(sep + 2) : '';
  const out = { sha, tree: '', parent: '', author: null, committer: null, message };
  for (const line of headers.split('\n')) {
    if (line.startsWith('tree ')) out.tree = line.slice(5).trim();
    else if (line.startsWith('parent ')) out.parent = line.slice(7).trim(); // 只取第一个父（线性历史够用）
    else if (line.startsWith('author ') || line.startsWith('committer ')) {
      const m = /^(author|committer) (.*) <(.*)> (\d+) ([+-]\d{4})$/.exec(line);
      if (m) {
        out[m[1]] = { name: m[2], email: m[3], date: new Date(Number(m[4]) * 1000).toISOString() };
      }
    }
  }
  return out;
}

function lsTree(rev) {
  const out = git(['ls-tree', '-r', '-z', rev]);
  const map = new Map();
  for (const rec of out.split('\0')) {
    if (!rec) continue;
    const tab = rec.indexOf('\t');
    const meta = rec.slice(0, tab).split(' ');
    const p = rec.slice(tab + 1);
    if (meta[1] !== 'blob') continue;
    map.set(p, { mode: meta[0], sha: meta[2] });
  }
  return map;
}

function parseNameStatus(prev, next) {
  const out = git(['diff', '--name-status', '-z', prev, next]);
  const tok = out.split('\0');
  const ops = [];
  for (let i = 0; i < tok.length; i++) {
    const st = tok[i];
    if (!st) continue;
    const kind = st[0];
    if (kind === 'R' || kind === 'C') {
      const from = tok[++i];
      const to = tok[++i];
      if (kind === 'R') ops.push({ op: 'D', path: from });
      ops.push({ op: 'A', path: to });
    } else {
      const p = tok[++i];
      ops.push({ op: kind === 'D' ? 'D' : kind === 'A' ? 'A' : 'M', path: p });
    }
  }
  return ops;
}

// ---------- 远端写入 ----------
const blobCache = new Map();

function uploadBlob(sha) {
  if (blobCache.has(sha)) return blobCache.get(sha);
  const buf = gitBuffer(['cat-file', 'blob', sha]);
  if (buf.length > MAX_BLOB_BYTES) {
    throw new Error('文件过大（' + Math.round(buf.length / 1024) + 'KB）暂不支持经 API 推送：' + sha);
  }
  const d = apiOk('POST', '/git/blobs', { content: buf.toString('base64'), encoding: 'base64' });
  blobCache.set(sha, d.sha);
  return d.sha;
}

// 每个 rev 的树缓存（重放模式下必须读该提交自己的树，不能读 HEAD）
const treeCache = new Map();
function treeOf(rev) {
  if (!treeCache.has(rev)) treeCache.set(rev, lsTree(rev));
  return treeCache.get(rev);
}

function buildEntries(ops, stats, rev) {
  const tree = treeOf(rev);
  const entries = [];
  for (const o of ops) {
    if (o.path.startsWith(WORKFLOW_PREFIX)) {
      stats.workflow.add(o.path);
      continue;
    }
    if (o.op === 'D') {
      entries.push({ path: o.path, mode: '100644', type: 'blob', sha: null });
      stats.deleted++;
      continue;
    }
    const info = tree.get(o.path);
    if (!info) continue;
    entries.push({ path: o.path, mode: info.mode, type: 'blob', sha: uploadBlob(info.sha) });
    stats.files++;
  }
  return entries;
}

// ---------- 主流程 ----------
function main() {
  const opt = parseArgs(process.argv.slice(2));
  if (opt.help) return usage();

  const token = opt.token || process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
  if (!token) {
    console.error('\n  ✗ 缺少 GitHub token。');
    console.error('    用法：GH_TOKEN=ghp_xxx node scripts/push-via-api.js');
    console.error('    token 需要 repo scope；想推 .github/workflows/ 还要 workflow scope。\n');
    process.exit(2);
  }

  const remoteUrl = tryGit(['remote', 'get-url', opt.remote]);
  const rp = parseRepo(remoteUrl);
  if (!rp) throw new Error('无法从 remote "' + opt.remote + '" 解析出 owner/repo：' + (remoteUrl || '(空)'));
  API_BASE = 'https://api.github.com/repos/' + rp.owner + '/' + rp.repo;

  const branch = opt.branch || tryGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branch || branch === 'HEAD') throw new Error('当前处于游离 HEAD，请用 --branch=<name> 指定分支');

  const localHead = tryGit(['rev-parse', 'HEAD']);
  if (!localHead) throw new Error('本地还没有任何提交');

  initCurl(token);

  console.log('');
  console.log('  仓库      : ' + rp.owner + '/' + rp.repo + '  (' + branch + ')');
  console.log('  本地 HEAD : ' + localHead.slice(0, 7) + '  ' + (tryGit(['log', '-1', '--pretty=%s']) || ''));

  // 远端现状
  const refRes = api('GET', '/git/ref/heads/' + branch);
  let remoteHead = null;
  let remoteTree = null;
  if (refRes.code === 200 && refRes.data && refRes.data.object) {
    remoteHead = refRes.data.object.sha;
    const c = apiOk('GET', '/git/commits/' + remoteHead);
    remoteTree = c.tree && c.tree.sha;
    console.log('  远端 HEAD : ' + remoteHead.slice(0, 7) + '  ' + String(c.message || '').split('\n')[0]);
  } else if (refRes.code === 404) {
    console.log('  远端 HEAD : (分支不存在，将首次创建)');
  } else {
    const msg = (refRes.data && refRes.data.message) || refRes.text.slice(0, 160);
    throw new Error('读取远端分支失败 HTTP ' + refRes.code + '：' + msg);
  }

  if (remoteHead === localHead) {
    console.log('\n  ✓ 远端已是本地 HEAD，无需推送。\n');
    return;
  }

  const remoteKnownLocally = remoteHead ? !!tryGit(['cat-file', '-e', remoteHead + '^{commit}']) : false;
  const fastForward =
    !!remoteHead && remoteKnownLocally && (() => {
      try {
        git(['merge-base', '--is-ancestor', remoteHead, 'HEAD']);
        return true;
      } catch (e) {
        return false;
      }
    })();

  const stats = { files: 0, deleted: 0, workflow: new Set() };

  if (fastForward) {
    // 模式 ①：逐条重放，可保留原提交 SHA
    const list = git(['rev-list', '--reverse', remoteHead + '..HEAD']).trim().split('\n').filter(Boolean);
    console.log('\n  模式      : 重放 ' + list.length + ' 个提交（保留原 SHA）');
    let prevSha = remoteHead;
    let prevTree = remoteTree;
    let lastSha = remoteHead;
    for (const sha of list) {
      const meta = readCommit(sha);
      const ops = parseNameStatus(prevSha, sha);
      const before = { files: stats.files, deleted: stats.deleted };
      const entries = opt.dryRun
        ? ops.map((o) => ({ path: o.path }))
        : buildEntries(ops, stats, sha);
      const skipped = [...stats.workflow].filter((p) => ops.some((o) => o.path === p));
      if (!opt.dryRun && !entries.length) {
        console.log('    · ' + sha.slice(0, 7) + ' 仅含需 workflow scope 的文件，跳过');
        continue;
      }
      if (opt.dryRun) {
        console.log('    · ' + sha.slice(0, 7) + ' ' + ops.length + ' 个文件变更  ' + String(meta.message).split('\n')[0].slice(0, 60));
        prevSha = sha;
        lastSha = sha;
        continue;
      }
      const tree = apiOk('POST', '/git/trees', { base_tree: prevTree, tree: entries });
      const c = apiOk('POST', '/git/commits', {
        message: meta.message,
        tree: tree.sha,
        parents: [prevSha],
        author: meta.author || undefined,
        committer: meta.committer || meta.author || undefined,
      });
      const same = c.sha === sha;
      console.log('    · ' + sha.slice(0, 7) + ' → ' + c.sha.slice(0, 7) + (same ? '  ✓ SHA 一致' : '  ⚠ SHA 不一致（内容已上传）') +
        '  [' + (stats.files - before.files) + ' 改/' + (stats.deleted - before.deleted) + ' 删]');
      if (skipped.length) console.log('      ↳ 跳过 workflow 文件：' + skipped.join(', '));
      prevSha = c.sha;
      prevTree = tree.sha;
      lastSha = c.sha;
    }
    if (opt.dryRun) {
      console.log('\n  (dry-run) 未写入远端。\n');
      return;
    }
    apiOk('PATCH', '/git/refs/heads/' + branch, { sha: lastSha, force: false });
    console.log('\n  ✓ 已推送，远端 ' + branch + ' → ' + lastSha.slice(0, 7));
  } else {
    // 模式 ②：整树同步
    console.log('\n  模式      : 整树同步（远端历史与本地分叉，SHA 会变化）');
    if (remoteHead && !remoteKnownLocally) {
      console.log('    原因：远端 HEAD ' + remoteHead.slice(0, 7) + ' 在本地不存在（可能是之前用 API 建的检查点提交）');
    }
    const headTree = treeOf('HEAD');
    const remoteBlobs = new Map();
    if (remoteTree) {
      const rt = apiOk('GET', '/git/trees/' + remoteTree + '?recursive=1');
      for (const e of rt.tree || []) if (e.type === 'blob') remoteBlobs.set(e.path, e.sha);
    }
    const ops = [];
    for (const [p, info] of headTree) if (remoteBlobs.get(p) !== info.sha) ops.push({ op: remoteBlobs.has(p) ? 'M' : 'A', path: p });
    for (const p of remoteBlobs.keys()) if (!headTree.has(p)) ops.push({ op: 'D', path: p });

    if (!ops.length) {
      console.log('    本地与远端文件内容一致，无需提交。\n');
      return;
    }
    console.log('    文件变更：' + ops.length + ' 个（改/增 ' + ops.filter((o) => o.op !== 'D').length + '，删 ' + ops.filter((o) => o.op === 'D').length + '）');
    for (const o of ops.slice(0, 15)) console.log('      ' + o.op + '  ' + o.path);
    if (ops.length > 15) console.log('      … 另有 ' + (ops.length - 15) + ' 个');

    if (opt.dryRun) {
      const wf = ops.filter((o) => o.path.startsWith(WORKFLOW_PREFIX));
      if (wf.length) console.log('\n    ⚠ 以下 workflow 文件会被跳过（token 需 workflow scope）：' + wf.map((o) => o.path).join(', '));
      console.log('\n  (dry-run) 未写入远端。\n');
      return;
    }

    const entries = buildEntries(ops, stats, 'HEAD');
    if (!entries.length) {
      console.log('\n  ⚠ 唯一差异是需要 workflow scope 的 workflow 文件（已跳过），无需提交。');
      console.log('    其余文件远端已与本地一致。\n');
      return;
    }
    const treeBody = { tree: entries };
    if (remoteTree) treeBody.base_tree = remoteTree;
    const tree = apiOk('POST', '/git/trees', treeBody);

    const msg = opt.message || ('chore: 同步本地 HEAD（' + localHead.slice(0, 7) + '）到远端\n\n' +
      '本次为整树同步：远端历史与本地分叉，文件内容以本地 ' + localHead + ' 为准。\n' +
      '原提交：' + (tryGit(['log', '-1', '--pretty=%s']) || ''));
    const commit = apiOk('POST', '/git/commits', {
      message: msg,
      tree: tree.sha,
      parents: remoteHead ? [remoteHead] : [],
    });
    apiOk('PATCH', '/git/refs/heads/' + branch, { sha: commit.sha, force: true });
    console.log('\n  ✓ 已同步，远端 ' + branch + ' → ' + commit.sha.slice(0, 7) +
      '（' + stats.files + ' 个文件上传' + (stats.deleted ? '，' + stats.deleted + ' 个删除' : '') + '）');
  }

  if (stats.workflow.size) {
    console.log('\n  ⚠ 以下 workflow 文件未推送（GitHub 要求 token 带 workflow scope）：');
    for (const p of stats.workflow) console.log('      ' + p);
    console.log('    解决：给 token 勾上 workflow scope 后在本机 `git push --force origin ' + branch + '`，');
    console.log('          或改用 SSH 推送。其余文件已全部到位，功能不受影响。');
  }
  console.log('\n  下一步：git fetch ' + opt.remote + '   # 刷新本地跟踪分支');
  console.log('  仓库：https://github.com/' + rp.owner + '/' + rp.repo + '/commits/' + branch + '\n');
}

try {
  main();
} catch (e) {
  console.error('\n  ✗ ' + String((e && e.message) || e).replace(/gh[pousr]_[A-Za-z0-9]+/g, '[TOKEN_REDACTED]') + '\n');
  process.exitCode = 1;
}
