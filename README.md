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
- **第三方流量源（Semrush 优先 / SimilarWeb 回退）**：自动抓取 Semrush Domain Overview API（需 key）或 SimilarWeb 公开接口，给出**全站月访问估算**、**流量国家来源分布**、**每个关键词的搜索量与月度流量估算**。Semrush 未配置 key 时回退 SimilarWeb。被 Bot 防护拦截 / 网络受限 / 无 key 时优雅降级并提示，绝不编造数字（标注"第三方模型估算，非 Google 官方"）
- **Google Trends（无需 key）**：自动抓取关键词搜索热度随时间趋势（相对 0-100，非绝对值）与品牌搜索地域分布，用于判断关键词上升/下降趋势、指导内容排期
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
| `SEMRUSH_API_KEY` | Semrush API key（配置后用 Semrush 取更准的月访问 / 国家来源 / 关键词搜索量，否则回退 SimilarWeb） | 空 |

> 也可把 key 放进项目根目录的 `config.json`（`{ "semrushApiKey": "你的key" }`），该文件已被 `.gitignore` 忽略，不会进入版本库。参考见 `config.json.example`。
>
> 不想手改文件就用脚本（输入不回显，key 不会留在命令历史里）：
> ```bash
> node scripts/set-semrush-key.js          # 交互输入
> node scripts/set-semrush-key.js --show   # 查看当前 key（脱敏）与来源
> node scripts/set-semrush-key.js --clear  # 清除
> ```
> 服务启动时会打印 Semrush 是否已配置，未配置则提示配置命令。

---

## 命令行导出报告

```bash
node scripts/export-report.js example.com
# 生成 reports/sitelens-example.com.html（自包含单文件）
```

---

## 推送代码（git 协议被拦截时的备用通道）

如果所在网络挡掉了 `github.com` 的 git 协议（`git push` 报 `CONNECT tunnel failed, 502` / 超时），但 `api.github.com` 可达，可用 Git Data API 推送：

```bash
GH_TOKEN=ghp_xxx node scripts/push-via-api.js --dry-run   # 先看会推什么
GH_TOKEN=ghp_xxx node scripts/push-via-api.js             # 真正推送
```

- token 只写进临时 curl 配置（用完即删），不进命令行参数、不进日志、不进版本库。
- 远端 head 在本地存在且是祖先时**逐条重放提交并保留原 SHA**；否则退回**整树同步**（内容一致、SHA 会变）。
- token 只有 `repo` scope 时 GitHub 拒绝经 API 写 `.github/workflows/` 下的文件（404），脚本会自动跳过并提示，其余文件照推。

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
  trafficsrc.js        SimilarWeb 公开接口抓取（月访问 / 关键词月度流量 / 国家来源），优雅降级
  semrush.js           Semrush Domain Overview API（key 模式）：月访问 / 国家来源 / 关键词搜索量与词级流量
  trends.js            Google Trends（无需 key）：关键词搜索热度趋势 + 品牌搜索地域分布
  autoseo.js           AutoSEO 编排：关键词策略 / 内容 E-E-A-T / 外链 / 四层指标 / 节奏
  scoring.js           七维评分 + P0/P1/P2 建议引擎
  pagespeed.js         PageSpeed Insights（不可达时优雅降级）
  rdap.js              域名注册年龄
public/
  index.html  app.js  report-template.js
  vendor/echarts.min.js   本地化图表库（自包含报告依赖）
  samples/                example / allbirds / anker 三份样例报告
scripts/
  export-report.js      CLI 导出自包含 HTML 报告
  set-semrush-key.js    配置 / 查看 / 清除 Semrush API key（输入不回显）
  push-via-api.js       走 GitHub Git Data API 推送（git 协议被拦时的备用通道）
test/
  ui-smoke.js          无头 UI 冒烟测试（42 项）
  autoseo-unit.js       AutoSEO 纯函数单测（11 项）
  trafficsrc-unit.js    SimilarWeb 解析 + 装配单测
  semrush-trends-unit.js Semrush / Trends 解析 + 装配单测（23 项）
  autoseo-render.js     AutoSEO 报告 DOM 渲染测试（含 Semrush+Trends 场景）
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
