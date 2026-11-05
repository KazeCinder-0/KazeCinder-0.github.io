---
title: "朝闻道特刊 | 开发者新品七日谈（2026-10-29 ~ 11-05）"
category: "ainews"
date: "2026-11-05"
---

# 朝闻道特刊 | 开发者新品七日谈（2026-10-29 ~ 11-05）

> **信息窗口**：2026-10-29 09:00 — 2026-11-05 14:00（北京时间）
> 本期为特刊，选材标准与日报不同：**只收"今天就能上手"的东西**——新 agent 产品、bot、托管服务、CLI/IDE 工具、API 新特性、开源项目。并购、招股书、行情一律不收。每条尽量写清：是什么、怎么用、多少钱、和谁比。

## 🚀 本周值得上手

### 1. Kimi Hosted Agents 正式发布：Agent 运行框架第一次被做成云服务

11 月 5 日，月之暗面正式发布 **Kimi Hosted Agents（托管智能体）**，把支撑 Agent 运行的 **Harness 框架作为云端服务**（Harness as a Service）开放：企业不用自己搭代码执行环境、管上下文、处理任务中断恢复，直接拿到 **7×24 小时**托管运行环境，支持长程任务与多智能体协作。9 月该产品曾以 Beta 形式（含会话管理、工具执行、沙箱、失败恢复）先行开放。

**上手要点：**
- **入口**：Kimi 开放平台控制台 / API / 命令行工具均可配置运行智能体。
- **生态**：内置 **140+ Skills** 与 **30+ 插件**（联网检索、专业数据查询、办公文档、内容生成），支持接入自有工具与私有数据源；官方文档站配套架构设计、配置教程与**运行成本估算工具**。
- **首批模板**：**8 个金融 Agent 模板**开箱即用——投研建模、深度研究、晨报生成、IPO 跟踪、持仓监控，可复制进自己项目空间再接私有研报库。
- **安全**：独立沙箱 + 网络权限控制 + 会话中止 + 全链路审计导出；可挂 **Kimi InferenceHook**，在每次模型推理前拦截敏感内容（企业认证用户定向开放）。
- **怎么看**：这是"卖模型 API"向"卖智能体"的关键一步——对标的是 Codex 的云任务和 Muse 的每用户专属 VM，但 Kimi 选的是 B 端"框架托管"这个生态位。企业自建一套可靠 Harness 通常要数月，这买卖的本质是把那几个月买成订阅。

---

### 2. DeepSeek Harness 上线 Creator Mode：一句话，五分半，生成一个能跑的插件

11 月 2 日晚，DeepSeek 为其开源智能体平台 **DeepSeek Harness** 推出 **Creator Mode（创造模式）**：用自然语言描述需求，智能体现场编写、安装并验证一个可运行插件——官方演示里，一句单行请求约 **5 分 30 秒**做出一个浮动番茄钟插件。

**上手要点：**
- **底座**：Harness 基于 Cordis 的"**一切皆插件**"架构，工具、技能、界面组件都靠插件扩展；Creator Mode 把插件的生产权也交给用户。
- **官方 7 个可复现案例**（含中英文提示词）：地标 **3D 画廊**、Transformer 内部计算的**交互式 3D 演示**、海报设计工作台、**带时间轴和预览器的视频编辑工作台**、论文阅读器、基于真实对话数据的用量统计插件。
- **怎么看**：演示里最值得注意的是"视频编辑工作台"这种专业形态——插件不再是效率小玩意，而是"对话即开发"的入口。开源权重 + 开源 Harness + 一句话造工具，DeepSeek 在把"Agent 平台"这件事做成公共品。

---

### 3. Meta Muse 本周两连跳：新加坡落地 + 1000 万用户配置，模型 API 明码标价

**Muse** 是 Meta Superintelligence Labs 9 月 8 日在北美上线的个人智能体（每个用户一台专属云端 Linux VM，自带浏览器、存储与连接器，后台跑目标、派子智能体、主动发消息）。本周窗口内的增量信息：

- **10 月 28 日落地新加坡**，接入 Shopee、Lazada、Grab 等本地服务。
- **10 月 21 日财报电话会**披露：美加已有超 **1000 万**用户完成初始配置，约 **25%** 日活，购物是核心场景，超四分之一用户在对话内完成下单，平均客单价逾 **200 美元**。
- **模型可单独买**：10 月 12 日上线的 **Muse Wonder** 已进 Meta Model API 与 Muse Code，定价 **$4 / $20 每百万 token**（输入/输出）；**Muse Wonder Full** 通过 Muse Code 的 Power / Maximum Usage 订阅提供（Maximum 为日常额度的 **80 倍**）；官方称 Wonder Full 在 DeepSWE、SWE-Marathon 独立第三方评测登顶。
- **怎么看**：Muse 的差异化在"每用户一台 VM + Sentinel 审批门 + Stripe Link 一次性卡号"这套安全设计，而不只是模型分。9 月 20 日亚马逊曾以"未标明身份的 AI 代理访问"为由封过它——**个人智能体与平台权限的冲突，是这条赛道接下来一整年的主线。**

---

### 4. Grok Bot：马斯克把它从"聊天机器人"改口为"数字同事"

**Grok Bot**（SpaceXAI，前身 xAI）8 月 11 日进入 beta，本周因马斯克 10 月 30/31 日的两帖再度发酵——"**Hire Grok @Bot to be an employee**"、"Think of Grok @Bot as a work colleague"。窗口内它是讨论度最高的 agent 产品。

**上手要点：**
- **形态**：每个 bot 一台**专属云端电脑**，合上笔记本活儿继续干；登录你已有的应用和网站（**无 API 的服务也能操作**）；多步任务做到需要审批为止；工作流靠**演示学习**，存成 routine 反复执行；多个 bot 可并行且互相传递上下文（9 月起团队可共享 Team Bots）。
- **价格与入口**：**纯订阅制，无 API、无免费档**。beta 限定 **SuperGrok Heavy、Cursor Ultra、Cursor Teams Premium** 订阅者（桌面 + iOS），企业访问排队。
- **怎么看**：它和 @grok（X 上免费的聊天 bot）、Grok API 是三个不同产品，别混淆。真正的争议点：把"雇员"作为产品隐喻，意味着把邮箱、日历、CRM 凭据交给一个 24/7 在线的 agent——**"审批门"做得好不好，决定它是同事还是内鬼。**官方至今未给基准数据，能力宣称全部是营销口径。

---

### 5. 苹果×千问 11 月 4 日开放测试：国产模型第一次进系统级入口

11 月 1 日官宣、**11 月 4 日起开放测试**：国行 iPhone 的 Siri、写作工具（"千问创作"）与视觉智能（"询问千问"）可调用阿里千问，12 月随 **iOS 27.3** 正式落地。任何内容发给千问前都会先征得用户同意；阿里承诺不用问答内容训练模型。

**上手要点**：限中国境内购买/Apple 账号与中国区定位双满足的机型（iPhone 15 Pro 起）；首批功能由苹果端侧模型驱动，Siri AI 与 WWDC 2026 宣布的下一代能力**不在其中**。对开发者来说，值得关注的是**开放平台侧**：千问个人智能体方向已有超 **1000 家**合作伙伴申请入驻，"千问 Go!"支持无代码搭应用（由阿里云 Meoo 平台自动完成部署）。

---

### 6. 模型与 API 本周速览：能直接调用的新东西

- **GPT-6.1 Terra 进 Notion（11-3）**：OpenAI 定位"更快、更便宜的 computer use"，Notion 内可直接选用。
- **Hume Audio Decision API（11-4 ship）**：不转写、直接对原始录音返回 yes/no 概率（情绪、说话人数同理），面向 call-QA 与语音 agent 管线，支持实时流。
- **商汤 SenseNova 6.8 Flash 正式版（11-3）**：多模态智能体模型，长期记忆 + 跨会话协作，可生成动态 PPT/3D 场景、接 Figma/Blender；小浣熊客户端限时免费，同步开源循环架构 **Loop-9B-Preview**。
- **美团 LongCat-2.5 正式版 API（11-3）**：1.6 万亿参数（激活约 480 亿）、全程国产算力训练，AutomationBench 51.8 / BrowseComp 91.9 / 3DCodeBench 55.4 三项第一（官方自报）。
- **百度 Apollo World（11-3 首次披露）**：面向物理 AI 的智能体驱动全模态世界模型，提出"2+3"判断标准。
- **DeepSeek 全面开源内部推理框架（11-3 乌镇披露）**：此前已开源编译工具与推理算子库，此次开放编解码组件——大厂推理栈第一次被完整开源。
- **Kimi K3.1 Pro（10-24，背景）**：3 万亿级参数、100 万上下文，代码与长程 Agent 能力为主打，Highspeed 版输出快 2-3 倍——Hosted Agents 的底座就是它。

## 🧰 开源与工具箱（一周上新，按用途分）

**Agent 编排与并行**
- **Agentbox**（11-3）：开源 Electron 桌面应用，把几十个 Claude Code / Codex agent 并排跑，每个隔离在独立 **git worktree**，互不打架。
- **mcp-memory-service**（11-4）：给 agent 加持久记忆的 MCP server，REST API + 知识图谱 + 自动整合，适配 Claude / LangGraph / CrewAI / AutoGen。
- **Bide**（11-4）：Go 库，为 agent 工作流提供 at-most-once 副作用、Merkle 树审计日志与 CRDT 状态——想要可持久、可审计，又不想跑集群的团队看这个。

**护栏与成本控制**
- **LongGuard**（11-3）：开源 Python 护栏，检测 LangGraph / LangChain / OpenAI / Anthropic agent 的推理死循环，并在预算耗尽前硬性熔断。跑长任务前先挂上它。

**数据与采集**
- **Pagesift**（11-3）：单二进制 Rust 爬虫，URL / PDF / Office 转 Markdown/JSON，**Firecrawl / Jina Reader 兼容 API + MCP server**，可完全自托管。
- **小米 Xiaomi-OCR-0**：**0.8B** 参数做文档解析、关键信息抽取与 OCR 问答，输出 Markdown/LaTeX，OmniDocBench v1.6 得 **96.83**，权重与 MCP 服务已开放。
- **英伟达 Nemotron 3.5 Transcribe**：**30B** MoE（激活约 4B），40 种语言语音转写、8 人说话人归属，9 个英文测试集平均词错率 **4.71%**，登顶 HF 开放 ASR 榜。

**端侧与本地**
- **Wavefunction**（11-4）：macOS 极简开源 coding agent，Product Hunt 上作为"轻量替代全 IDE agent"的选项出现。
- **Strata 0.2.10**（11-3）：**8GB 显存**本地跑 **128K** 长上下文的开源工具。
- **StableGen**（11-3）：开源 Blender 插件，用本地生成的 Qwen Image 2.1 给 3D 场景上纹理，单张 **16GB** 卡可跑。

## 📐 值得读的两个思路

- **Code Mode：工具调用正在收敛成一个 exec()**（Philipp Schmid，11-3）：agent 的工具调用正从"每轮一个 JSON action"塌缩为"一个 exec(code) 沙箱里跑类型化工具"，多个 harness 已经落地。对照 DeepSeek Creator Mode 和"一切皆插件"，方向一致：**与其枚举工具，不如给 agent 一台能写代码的机器。**
- **0.016% 的权重 diff 救活一个 0.8B 模型**（11-4）：社区给 Qwen3.5-0.8B 打了一个钉在 'Wait' token 上的推理循环补丁，**MATH-500 从 7.9% 提到 48.1%**，且 diff 在 GGUF Q4_K_M 量化后仍有效——小模型训坏了可以"术后修复"而不是重训。同日 Qwen 负责人公开承诺 **Qwen 4.0 / 5.0 继续开放权重**。

## ⚠️ 本周安全与额度提醒

- **Claude Code 官方扩展被投毒 11 小时**（10-31）：Anthropic 官方账号在 Cursor 市场发布的扩展被植入 SSH 后门，约 **5000 名**开发者中招，恶意版本每 **60 秒**重试写入 `authorized_keys`。自查：`grep -qs svc-telemetry ~/.ssh/authorized_keys && echo 中招了 || echo 干净`。 Cursor 已下架并关闭整个市场审计。
- **Google 披露 LLMJacking 产业链**（11-3）：被盗云凭据 + 暴露的 Ollama 端点 + LiteLLM CVE 被组合利用，**单起事件日损失超 10 万美元**。检查你的推理端点有没有裸奔在公网。
- **额度变化**：OpenAI 已将部分 Pro 套餐的 Work/Codex 额度翻倍（10-30），Anthropic 取消 Ultra 账户 5 小时限制（10-31）；**12 月起 ChatGPT 与 Codex 共享同一额度池**——重度聊天会挤占编程额度，安排好用法。
- **Gem 退役倒计时**：Google 个人账号的 Gem 从 **11 月**起自动转换为 Gemini skill，有 Gem 的先导出知识文件。

---

*口径说明：Muse 个人智能体首发于 2026-09-08（北美）、Grok Bot beta 首发于 2026-08-11、Kimi Hosted Agents Beta 于 9 月上线——本刊收录的是它们在 10-29 ~ 11-05 窗口内的落地与发酵（新加坡上线、财报数据、"work colleague"定调、正式版发布），非首发事件。所有数字均来自报道与官方公告原文。*
