# SiteLens · 独立站分析工具

输入一个域名，SiteLens 自动抓取该网站的**性能、SEO、技术栈、营销追踪、安全与信任**信号，
结合一手公开数据源（Tranco 排名、RDAP 域名年龄、Common Crawl 规模、PageSpeed Insights）
估算流量规模，并给出分优先级（P0 / P1 / P2）的修改建议，最终生成一份自包含的 HTML 研报。

> 零第三方依赖：纯 Node 内置模块实现，`node server.js` 直接跑，无需 `npm install`。

---

## 功能特性

- **七维评分**：性能(22) / SEO 基础(18) / 营销追踪(18) / 技术健康(12) / 安全合规(8) / 转化信任(8) / **GEO 生成引擎优化(14)**
- **GEO（生成式引擎优化）维度**：度量站点被 ChatGPT / Perplexity / Gemini / Claude / 豆包 等 AI 引擎检索引用的**结构就绪度**，覆盖 llms.txt、AI 爬虫 robots 指令、JSON-LD 实体、E-E-A-T（作者/信任页）、内容可提取性(SPA 检测)、FAQ 可引用、权威引用、社交知识图谱、品牌一致性
- **流量估算**：Tranco 全球排名为一手数据；月访问量基于排名的经验模型估算（报告内逐条标注口径）
- **营销追踪识别**：Meta Pixel、Google Ads、TikTok Pixel、GTM、聊天工具、评价插件等，
  并区分「HTML 源码」与「同源 JS 资源」两种检测路径，降低 SPA 漏报
- **防误报三机制**：HTTP≥400 / Cloudflare 挑战页拦截、跨主域跳转、GTM 容器内像素降级为「需人工核实」
- **实时分析**：SSE 流式进度，前端边抓边渲染
- **自包含报告**：ECharts 已 vendor 到 `public/vendor/`，导出的 HTML 报告完全离线自包含
- **部署柔性**：后端不可达时前端自动进入「静态展示版」，不白屏
- **自动 SEO 策略（AutoSEO）**：自动爬取内页（≤12 页，best-effort）抽取关键词，按**意图**（信息/对比/交易）与**词类**（核心/长尾/问答/竞品/品牌）分层；检测同词多页抢排名（keyword cannibalization）；评估内容 **E-E-A-T** 与信任页（About/Contact/Blog/FAQ…）；梳理外链健康度与 disavow 流程；输出**四层效果指标**（流量排名/转化/技术健康/商业）与**日/周/月/季节奏打法**。搜索量、真实排名、外链质量、转化等需接入 GSC / Ahrefs / Semrush / GA4 回填，工具不编造数字

---

## 快速开始（本地）

```bash
node server.js
# 浏览器打开 http://localhost:8720
```

可选环境变量：

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `PORT` | 监听端口 | `8720` |
| `PSI_API_KEY` | Google PageSpeed Insights 密钥（免密钥也能用，配置后提升配额） | 空 |

---

## 命令行导出报告

```bash
node scripts/export-report.js example.com
# 生成 reports/sitelens-example.com.html（自包含单文件）
```

---

## 项目结构

```
server.js              零依赖 HTTP 服务 + SSE 流式分析接口
lib/
  analyzer.js          主编排：抓取、并发、步骤推进、防误报判定
  httpclient.js        带超时与 SSRF 防护的请求层
  traffic.js           Tranco 排名 + 经验模型月访问量估算
  seo.js               SEO / 元数据 / robots / 结构化数据
  techstack.js         ~90 条服务器 / CDN / 前端框架指纹
  geo.js               GEO / 生成式引擎优化（llms.txt / AI 爬虫指令 / 实体 / E-E-A-T）
  keywords.js          关键词抽取 / 意图分类 / 词类分层 / 映射 / 抢词检测 / 挖词扩展
  autoseo.js           AutoSEO 编排：关键词策略 / 内容 E-E-A-T / 外链 / 四层指标 / 节奏
  scoring.js           七维评分 + P0/P1/P2 建议引擎
  pagespeed.js         PageSpeed Insights（不可达时优雅降级）
  rdap.js              域名注册年龄
public/
  index.html  app.js  report-template.js
  vendor/echarts.min.js   本地化图表库（自包含报告依赖）
  samples/                example / allbirds / anker 三份样例报告
test/
  ui-smoke.js          无头 UI 冒烟测试（42 项）
  autoseo-unit.js       AutoSEO 纯函数单测（11 项）
  autoseo-render.js     AutoSEO 报告 DOM 渲染测试
  static-fallback.js   静态降级 jsdom 测试（4 项）
```

---

## 部署

详见 [DEPLOY.md](./DEPLOY.md)。核心路径：

1. **Railway / Render（推荐，自动 HTTPS）**：把仓库推到 GitHub，在平台关联仓库，
   自动读取 `railway.json` / `render.yaml`（Docker 构建），注入 `PORT`。
2. **Docker 自有 VPS**：
   ```bash
   docker build -t sitelens .
   docker run -d -p 8080:8720 -e PORT=8720 sitelens
   ```
3. **纯静态展示**（无后端）：直接托管 `public/`，前端会自动降级为展示版。

健康检查：`GET /api/health` 返回 `{"ok":true}`。

---

## 数据口径说明

- **一手数据**：Tranco 全球排名、RDAP 域名年龄、Common Crawl 抓取规模、响应头指纹。
- **模型估算**：月访问量基于 Tranco 排名的经验模型，仅供参考，非精确指标。
- 工具已内置 SSRF 防护，禁止分析 `localhost` / 私有网段 / 解析到内网的域名。

---

## License

MIT
