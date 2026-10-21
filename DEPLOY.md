# SiteLens 部署指南

SiteLens 是一个**零第三方依赖**的 Node 全栈工具（`node server.js` 即可运行，无需 `npm install`）。
真正的分析能力（抓取外部网站、Tranco 排名、PageSpeed、Common Crawl）全部在后端运行，
因此上线必须提供 **Node 运行时**，纯静态托管无法使用分析功能。

服务监听 `0.0.0.0`，端口由环境变量 `PORT` 控制（默认 `8720`）。

---

## 1. 本地运行（开发 / 内网）

```bash
node server.js
# 浏览器打开 http://localhost:8720
```

可选环境变量：
- `PORT`：监听端口（默认 8720）
- `PSI_API_KEY`：Google PageSpeed Insights 密钥（免密钥也能用，配置后提升配额）

---

## 2. Docker 容器化（任意支持容器/VPS 的平台）

```bash
docker build -t sitelens .
docker run -d --name sitelens -p 8080:8720 -e PORT=8720 sitelens
# 访问 http://<服务器IP>:8080
```

健康检查：`GET /api/health` 返回 `{"ok":true}`。

---

## 3. 一键部署到 Railway（推荐，免费额度、自动 HTTPS）

1. 把整个项目推到 GitHub。
2. 在 [Railway](https://railway.app) 新建 Project → Deploy from GitHub repo。
3. Railway 会自动读取 `railway.json`（使用 Dockerfile 构建），并注入 `PORT`。
4. 部署完成后得到的域名即可公开访问。

---

## 4. 一键部署到 Render（免费额度、自动 HTTPS）

1. 推送项目到 GitHub。
2. 在 [Render](https://render.com) 新建 Web Service → 关联仓库。
3. Render 读取 `render.yaml`（Docker 运行时），自动构建并注入 `PORT`。
4. 免费套餐会有冷启动（首次访问约 30–60s），属正常现象。

---

## 5. 部署后的注意事项

- **出口网络**：服务器需能访问目标站点以及 `tranco-list.eu` / `index.commoncrawl.org` /
  `rdap` / `googleapis.com`（PageSpeed）。若某些源不可达，工具会自动降级，分析结果仍可用。
- **速率限制**：公开部署时建议在前层加基础限流（如 Nginx `limit_req` 或 Cloudflare），
  避免被滥用为抓取代理。单域名单次分析约抓取十余个请求，耗时 10–30s。
- **SSRF 防护**：工具已内置，禁止分析 `localhost`、私有网段（10/172.16/192.168/127 等）
  及解析到内网的域名。
- **流量数据为估算**：Tranco 排名为一手数据，月访问量为基于排名的经验模型估算，
  报告内已逐条标注口径，请勿当作精确指标对外承诺。

---

## 6. 纯静态展示页部署（无后端 · 仅 UI + 样例报告）

只想对外展示产品形态、暂不提供实时分析时，可直接把 `public/` 目录托管到任意静态平台
（CloudStudio / Vercel / Netlify / GitHub Pages / 对象存储 + CDN 等）。

前端加载时会自动探测后端 `GET /api/health`：

- **探测成功** → 正常模式，输入域名实时分析；
- **探测失败** → 自动进入「静态展示版」：顶部显示橙色提示横幅，示例按钮改为打开
  预生成的样例报告（`public/samples/`，已内置 example / allbirds / anker 三份），
  表单提交会提示「需部署后端」而**不会白屏崩溃**。

```bash
# 本地预览静态版（任选其一）
python -m http.server 8080 -d public      # Python 自带
# 或 npx serve public                      # 需联网安装
```

> 注意：静态版**不含实时分析能力**，仅用于产品展示。要提供完整分析，请用第 2–4 节的
> 容器化 / Railway / Render 部署（带 Node 后端）。

