---
title: "RabbitMQ 反思设计：从一份「名词清单」式的 MQ 方案说起"
date: "2026-10-12"
readTime: "32 min"
tags: ["RabbitMQ", "消息队列", "架构设计", "幂等", "重试", "后端"]
excerpt: "评审一份 AI 素材生产工作台项目的 MQ 设计稿时，我发现它列出了 7 个队列、8 种任务状态、5 条幂等规则，却几乎没有一处可以直接施工。本文把这次评审的反思整理成一套 MQ 设计的自查框架：长任务为什么不能占着消息、重试到底该怎么写、入库与投递的双写怎么破、prefetch 的真相，以及一份可以直接抄的参考拓扑。"
---

# RabbitMQ 反思设计：从一份「名词清单」式的 MQ 方案说起

**作者：Kaze Cinder | 发布于 2026-10-12**

---

前段时间帮朋友看了一份《素材中心项目详细技术方案与 SOP》。这是一个 AI 素材生产工作台：用户提交文案、图片、视频、TTS、数字人等生成任务，后端调外部大模型 API，产物存阿里云 OSS，任务调度走 RabbitMQ。

方案写得很"完整"——七个队列名、八个任务状态、五条幂等规则、一张 generation_task 表、一份并发建议表。但我读完 MQ 那一章的感觉是：**这不是设计，是名词清单。**

举几个最典型的例子：

- 队列名有了（`media.video.generate`），但没有 exchange、routing key、binding，也没有重试队列和死信队列；
- 状态机有了（`CREATED → QUEUED → SUBMITTED → PROCESSING → POST_PROCESS → SUCCESS/FAILED/CANCELLED`），但没有一条状态迁移的触发者、超时和补偿路径；
- 幂等规则有了五条，写得还不错，但没人回答"重试的时候怎么保证不重复提交给外部模型"；
- "任务失败自动重试 2 次"——一句话，零机制；
- "并发由配置管理"——一句话，但 RabbitMQ 的并发配置有一个 250 的默认值，能把长任务队列直接压垮。

这篇文章不是吐槽某一份文档，而是把这轮评审沉淀成一套**面向 MQ 的反思设计方法**：先问对问题，再谈拓扑。如果你正在写 MQ 设计文档，建议按第二节的五个问题逐条对照。

> 全文的立场先摆在这里：
> **消息队列的职责只有一件事——在正确的时间，把"该做某件事"可靠地告诉某个消费者。**
> 它不负责记录做到哪了，不负责替你重试出正确性，不负责判断任务是不是已经死了。
> 一旦你开始用"一条未 ack 的消息"来表达"某个任务正在执行中"，你就已经把 MQ 当数据库用了。

---

## 一、MQ 设计文档的合格线：五个问题

一份 MQ 设计文档能不能落地，不看队列名起得漂不漂亮，只看能不能回答下面五个问题。任何一个答不上来，方案就还停在 PPT 阶段。

| # | 问题 | 答不上来的后果 |
|---|------|----------------|
| 1 | **一条消息代表什么？它的生命周期在哪结束？** | 消费语义模糊，重复消费和漏消费同时存在 |
| 2 | **消费者在什么条件下 ack？什么条件下不 ack？** | 消息要么丢，要么无限重投 |
| 3 | **失败之后，谁把消息重新送进来？延迟多久？几次？** | "自动重试 2 次"变成热循环或永远不重试 |
| 4 | **业务写库和发消息之间，谁保证原子性？** | 任务永远 QUEUED，或消息指向不存在的任务 |
| 5 | **堆积、死信、消费者全挂——谁看得见？看见了做什么？** | 故障静默，用户比监控先发现问题 |

对照这五个问题看那份方案：第 1 题半答，第 2 题答了一半（"消费成功后再 ack"），第 3、4 题完全空白，第 5 题没有。

下面是这次评审里暴露出的七个盲区。每一个都有相同的结构：**现象 → 机制 → 正确形态**。

---

## 二、盲区一：让消息"等结果"——长任务占着未 ack 的消息

### 2.1 现象

方案里的视频生成流程是这样写的：

> 视频生成 Worker 消费 `media.video.generate`，调用外部视频模型 API，然后**轮询或等待回调**，获取结果后下载、转码、上传 OSS、生成预览，全部完成后 ack。

从消费开始到 ack，中间横着十几分钟。

### 2.2 机制：`consumer_timeout` 会把 channel 掐掉

RabbitMQ 从 3.8.15 起引入了一个默认开启的保护机制 `consumer_timeout`，**默认 30 分钟**（1800000 ms）。它的判定标准很粗暴：

> 消费者收到一条消息后，如果在 `consumer_timeout` 时间内没有对该消息 ack/nack/reject，broker 就认定这个消费者挂了，**强制关闭它的 channel**。

channel 一关，那条消息立刻被重新入队（`redelivered=true`），被另一个消费者（或重建 channel 后的同一个消费者）再次拿到。

15 分钟的"轮询"看着还没到 30 分钟红线，但你算一下真实链路：

- 消息在队列里排队的时间（不算在内，但会让整条链路更脆）
- 调用外部模型提交（几秒到几十秒）
- 轮询等待（视频类 5～20 分钟，高峰期更久）
- 下载产物（大文件，几十秒到几分钟）
- 转码 + 上传 OSS + 预览（又是几分钟）

**任何一步抖动，累计就跨过 30 分钟。** 更糟的是，运维为了快速发现消费者假死，经常把 `consumer_timeout` 下调到 5～10 分钟——那这个流程是必然踩雷。

### 2.3 踩雷的真实代价：双倍烧钱

这才是最要命的地方。原文的流程是"消费 → 提交外部模型 → 等待结果"。

当 `consumer_timeout` 触发、消息被重投，消费者重新执行的是**同一个函数**：它会**再次调用外部模型的提交接口**。

- 视频生成：一次提交几十块钱起步；
- 数字人：更贵；
- 而且第一次提交的任务其实还在跑，钱已经花了，产物也已经生成了——只是没人认领。

于是你得到的是：**同一笔业务，两次计费，两份产物，一份被丢弃，数据库里可能还只有一个 task 记录。** 这不是理论风险，这是这种写法在压力下的必然结果。

### 2.4 正确形态：把"等待"从消费者里搬出去

核心原则：

> **消费者处理时间必须远小于 `consumer_timeout`，并且绝不能"等待外部世界"。**
> 凡是"等第三方"，一律改造成"提交 + 回调/轮询"两阶段。

**阶段一（提交）——占用消息，但只做提交**

```
消费 media.video.generate
  → 二次校验（任务状态 / 项目是否关闭 / 额度是否充足）
  → 调外部 API 提交，拿到 externalTaskId
  → 落库：status=SUBMITTED, external_task_id=xxx, submitted_at=now
  → 立刻 ack ✅
```

这一步的耗时应该是**秒级**。

**阶段二（回写）——不占用原消息**

```
外部回调（Webhook） 或 轮询器发现任务完成
  → 落库：status=PROCESSING/POST_PROCESS, output=...
  → 投递一条新消息 media.video.result（或 media.preview.process）
  → 由下游消费者做：下载 → 转码 → OSS → 预览生成 → status=SUCCESS
```

时序对比：

```
❌ 错误形态：一条消息扛下全部
   [消息 M] ──提交──等待 15min──下载──转码──上传──ack
                       ↑ 随时可能被 consumer_timeout 掐断，然后重来一遍

✅ 正确形态：一条消息只做一件事
   [消息 M1] ──提交──ack                    （秒级）
   [Webhook] ──落库──投递 M2
   [消息 M2] ──下载──转码──上传──ack         （分钟级，但没有"等待第三方"）
   [消息 M3] ──生成预览──ack
```

阶段二的每个消费者都在做**纯计算 + 与自家 OSS 交互**，耗时可控；即便慢，也可以给这类队列单独调大 `consumer_timeout`，而不会有"重复提交外部模型"的副作用——因为重投时消费入口会先查 `external_task_id`（见第四节）。

> **一句话记住：ack 的时机，应该在"我这一环的确定动作已经完成"的那一刻，而不是"整条业务链路结束"的那一刻。**

---

## 三、盲区二：重试——"失败自动重试 2 次"根本不是机制

方案里关于重试只有一句话：

> 任务失败自动重试 2 次。

### 3.1 为什么这句话无法施工

因为它没有回答任何一个实现层面的问题：

| 必须有答案的问题 | 方案里的答案 |
|---|---|
| 谁触发重试？ | 无 |
| 重试前等多久？ | 无（大概率是 0） |
| 重试次数记在哪？ | 无 |
| 超过 2 次之后呢？ | 无（丢弃？告警？人工？） |
| 哪些错误该重试？ | 无（参数错误重试 2 次也是失败） |
| 重试时会重新调外部模型吗？ | 无（这是最危险的） |

### 3.2 RabbitMQ 本身没有"重试"这个概念

先把事实说清楚，这是设计的前提：

- **`nack(requeue=true)` 不是重试，是"立刻重新入队"。** 消息会马上被再次投递（很可能还是同一个消费者），没有延迟、没有次数上限、没有计数——这就是经典的**热循环**：外部服务挂了，你的消费者会以每秒几千次的频率打它。
- **`redelivered` 只是一个布尔值。** 它告诉你"这条消息至少投递过一次"，但**不告诉你是第几次**，也不能用来做退避。
- **`x-death` 只有在消息经过死信路径之后才会出现。** 如果你用 `nack(requeue=true)` 循环，消息永远进不了死信路径，也就永远没有 `x-death` 计数可用。
- **框架自带的 retry 默认是无状态的。** Spring Boot 的 `spring.rabbitmq.listener.simple.retry` 默认 `enabled=true`、`max-attempts=3`，且默认是 **stateless** 模式：本地重试耗尽后 `reject`，而 `default-requeue-rejected` 默认又是 `true` —— **消息重新入队，立刻又被投回来，又走一遍 3 次本地重试。** 这是个隐藏的热循环，很多线上"MQ 疯狂刷日志"的事故都源于此。

### 3.3 正确形态：ack + 重投重试队列（TTL + DLX）

标准做法是用**延迟队列**（TTL + 死信交换机）自己实现退避重试：

```
                     ┌──────────────────────┐
   生产者 ──▶ media.exchange (topic)         │
                     │                      │
        ┌────────────┼────────────┐         │
        ▼            ▼            ▼         │
 media.video.queue  media.xxx.retry.30s  media.xxx.retry.2m
        │   ▲            │  (TTL=30s)        │ (TTL=2m)
        │   │            │  DLX ─────────────┘
        │   └── 手动重投（带 x-retry-count）│
        │                                    │
        └── 超限 / 不可重试 ──▶ media.xxx.dlq（无人消费，仅告警 + 人工重放）
```

具体步骤：

1. 消费者开启**手动 ack**（`acknowledge-mode=manual`）；
2. 业务处理成功 → `basicAck`；
3. 遇到**可重试错误** → 读 header `x-retry-count`：
   - 未超限：向 `media.<name>.retry.30s`（或 `.2m`，按次数阶梯）发送**新消息**（header 里 `x-retry-count + 1`），然后对原消息 `basicAck`；
   - 超限：投递到 `media.<name>.dlq`，`basicAck`；
4. 遇到**不可重试错误** → 直接进 DLQ（或置 FAILED），`basicAck`。

**为什么是"发新消息 + ack"而不是 `nack(requeue=true)`？** 因为只有"发新消息"才能：控制延迟（TTL）、控制次数（header）、控制去向（DLQ）、换 routing key（走 express 队列让运维插队）。

### 3.4 一个必须知道的坑：TTL 只在队头生效

RabbitMQ 的 **per-message TTL**（在消息属性里写 `expiration`）有一个反直觉的限制：

> **只有处在队头的消息，其 TTL 才会被检查。** 队列里混合不同 TTL 时，一条长 TTL 的消息卡在队头，会把它后面所有短 TTL 的消息一起"堵"到过期。

所以两条实践建议：

- **同一队列里的消息 TTL 必须一致**（队列级 `x-message-ttl`）；
- 需要多级退避（30s / 2min / 10min）就**建多个队列**，各自固定 TTL，用 `x-dead-letter-exchange` + routing key 回到业务 exchange。这也是为什么"每条消息按重试次数设置不同 TTL"这种聪明写法不要用。

### 3.5 错误分类：不要重试不会成功的操作

一份 MQ 文档里，错误分类表往往比拓扑图更重要：

| 分类 | 典型错误 | 处理 |
|---|---|---|
| **可重试**（瞬时） | 连接超时、外部 5xx、429 限流、DNS/网络抖动、DB 死锁 | 退避重投，计数 +1 |
| **不可重试**（确定性） | 参数校验失败、内容风控拒绝、额度不足、素材不存在、模板已下架 | 直接置 FAILED + 记录原因，进 DLQ 供排查 |
| **未知/外部异步** | 外部返回"任务已接受但后续失败" | 由轮询器/回调决定，MQ 不重试（见第二节） |

一句话原则：**重试解决的是"这次没成功，下次可能成功"；解决不了"这个请求本身就是错的"。** 把不可重试的错误丢进重试队列，只会用 3 倍的成本重复得到同一个失败。

### 3.6 重试前必须先查外部状态

这是第二节和这一节的交汇点，也是最容易出事故的地方：

> **任何重试路径的第一步，都是先查 `external_task_id`。**

```
实现重试逻辑时：
  if (task.externalTaskId != null) {
      // 已经提交给外部模型了！
      // 绝对不能再 submit 一次
      // 只能：查询状态 → 已成功则推进后置流程；进行中则继续等待；失败则按错误分类处理
  } else {
      // 尚未提交，可以安全重试 submit
  }
```

配合幂等键 + 条件更新（下一节），才能让"重试"这件事在业务上安全。

### 3.7 消费端骨架（Spring AMQP）

```java
@RabbitListener(queues = "media.video.generate",
                ackMode = "MANUAL",
                concurrency = "1")
public void onVideoGenerate(Message message, Channel channel) throws IOException {
    long tag = message.getMessageProperties().getDeliveryTag();
    String body = new String(message.getBody(), StandardCharsets.UTF_8);
    MqMessage mq = JSON.parseObject(body, MqMessage.class);

    try {
        // 1) 幂等 + 状态闸门：影响行数为 0 说明已被处理 / 已取消 / 状态不对
        int affected = taskMapper.markProcessing(mq.getTaskId());
        if (affected == 0) {
            channel.basicAck(tag, false);   // 丢弃并 ack，不要重试
            return;
        }

        // 2) 二次校验（项目是否关闭、额度是否充足）——失败归类为不可重试
        validateOrThrow(mq);

        // 3) 只做"提交"，绝不等待结果
        if (task.getExternalTaskId() == null) {
            String externalId = videoProvider.submit(mq);       // 秒级
            taskMapper.attachExternalTask(mq.getTaskId(), externalId);
        }
        channel.basicAck(tag, false);       // ✅ 立刻 ack

    } catch (RetryableException e) {
        mqRetryPublisher.retryOrDeadLetter(mq, message, e);     // 发到 retry 队列
        channel.basicAck(tag, false);                           // 原消息 ack 掉
    } catch (Exception e) {
        mqRetryPublisher.toDeadLetter(mq, message, e);          // 不可重试 → DLQ
        channel.basicAck(tag, false);
    }
}
```

对应配置：

```yaml
spring:
  rabbitmq:
    listener:
      simple:
        acknowledge-mode: manual        # 手动 ack，一切以业务为准
        prefetch: 1                     # 长任务队列必须为 1（见第五节）
        concurrency: 1
        max-concurrency: 2
        default-requeue-rejected: false # 拒收不再自动回队
        retry:
          enabled: false                # 关掉框架本地重试，重试由我们自己的 retry 队列负责
```

---

## 四、盲区三：入库与投递的裸双写

### 4.1 现象

几乎所有人的第一版都是这么写的：

```java
taskMapper.insert(task);                 // ① 写库：status = QUEUED
rabbitTemplate.convertAndSend(exchange, routingKey, msg);  // ② 发消息
```

### 4.2 机制：两步非原子，失败的窗口很大

| 崩在哪 | 结果 |
|---|---|
| ① 成功，② 失败（broker 抖动、网络断、发送超时） | 任务永远停在 QUEUED，用户一直转圈，**没人会发现** |
| ① 成功，② 成功但 broker 没收到（publisher 没开 confirm） | 同上，静默 |
| ① 失败，② 成功（顺序颠倒或异常吞掉） | 消息指向一个不存在的 taskId，消费者报空指针 |

开 `publisher-confirm` 能解决"broker 到底收没收到"，但**解决不了"DB 事务和发送动作的原子性"**——因为 confirm 是异步的，你不可能把数据库事务开着等 confirm。

### 4.3 正确形态：Outbox（本地消息表）

在**同一个数据库事务**里同时写业务表和 outbox 表，再由中继器异步发送：

```sql
CREATE TABLE mq_outbox (
  id            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  task_id       VARCHAR(64)  NOT NULL COMMENT '业务任务ID',
  exchange      VARCHAR(128) NOT NULL COMMENT '目标交换机',
  routing_key   VARCHAR(128) NOT NULL COMMENT '路由键',
  payload       JSON         NOT NULL COMMENT '消息体',
  status        VARCHAR(16)  NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/SENT/FAILED',
  retry_count   INT          NOT NULL DEFAULT 0 COMMENT '发送重试次数',
  next_retry_at DATETIME     NULL COMMENT '下次重试时间',
  create_time   DATETIME     NOT NULL,
  update_time   DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_task_routing (task_id, routing_key),
  KEY idx_status_next (status, next_retry_at)
) COMMENT 'MQ 发送箱（保证业务写入与消息投递的一致性）';
```

流程：

```
业务事务 {
    INSERT generation_task ...;
    INSERT mq_outbox (status='PENDING') ...;
} COMMIT                       ← ① 要么都成功，要么都失败

中继 Job（每 1~5 秒）:
    SELECT * FROM mq_outbox WHERE status='PENDING' AND next_retry_at <= NOW() LIMIT 100
    → rabbitTemplate.convertAndSend(...) + 等待 publisher confirm
    → 成功：UPDATE status='SENT'
    → 失败：retry_count+1, next_retry_at = NOW() + backoff，超限置 FAILED 并告警
```

**阶段一可以退化的版本**（不想建表就先用这个）：

- 在 `generation_task` 上加 `mq_sent_at DATETIME NULL`，插入时为空；
- 业务提交后立即尝试发送，成功后回写 `mq_sent_at`；
- 定时 Job 扫描 `status='QUEUED' AND mq_sent_at IS NULL AND create_time < NOW() - INTERVAL 30 SECOND`，补投并回写。

### 4.4 别忘了另一半：消费端必须容忍重复投递

Outbox 只是把生产端做到**至少一次（at-least-once）**，中继 Job 重试、broker 重投都可能造成重复。所以：

> **消息系统的语义永远是"至少一次"，幂等是消费端的法定义务，不是可选项。**

---

## 五、盲区四：并发控制只剩一句"由配置管理"

方案第六章给了一张"建议并发"表：文案 2～5、图片 2～4、视频 1～2、TTS 2～4、数字人 1、预览 2～4。第十二章又给了另一张表："同时运行任务"——文案 2、图片 2、视频 1……

同一个系统，两套数字，而且**没说是全局还是按用户、按队列还是按消费者**。这类模糊在实现阶段会直接变成事故。

### 5.1 先搞清楚 MQ 侧的"并发"到底是什么

在 Spring AMQP 里，队列的并发能力由两个参数共同决定：

| 参数 | 含义 | Spring Boot 默认值 |
|---|---|---|
| `concurrency` | 每个监听容器起的消费者线程数 | `1` |
| `prefetch` | 每个消费者**最多预取多少条未 ack 消息** | **`250`** ⚠️ |
| 实例数 | 部署了几个 pod / 进程 | 你决定 |

有效并发 ≈ `concurrency × 实例数`，而**在途消息量 ≈ `prefetch × concurrency × 实例数`**。

### 5.2 `prefetch=250` 是长任务队列的定时炸弹

默认值 250 是为短消息（毫秒级处理）设计的：一次多拿点，减少网络往返。

但长任务队列（一条消息处理几十秒到几分钟）用 250 会怎样？

1. **内存**：250 条消息的 body 全在消费者内存里排队；
2. **饥饿**：线程被第一条长任务占住，剩下 249 条干等；
3. **故障放大**：消费者一崩，250 条消息同时超时重投；
4. **不公平**：所有实例的第一个消费者都抱走 250 条，队列深度看起来是 0，实际都在别人内存里——监控会骗你。

> **规则：长任务队列 `prefetch` 必须设为 1（最多 2）。** 短消息队列才适合大 prefetch。

### 5.3 `prefetch`/`concurrency` 表达不了"每用户同时 N 个"

这是那张"建议并发"表最大的问题：**消费者并发是全局维度，用户配额是租户维度**，两者不在一个层次。

- `concurrency` 提高 = 全局吞吐变大，但某个用户仍然可以一次占满所有线程；
- 用户 A 提交 10 个视频任务，用户 B 就只能排队——如果这正是你想要的，那就得在**业务层**实现。

用户级/租户级配额的三种实现：

| 方案 | 做法 | 适用 |
|---|---|---|
| DB 计数 | 消费入口 `SELECT COUNT(*) FROM generation_task WHERE creator_id=? AND status IN ('QUEUED','SUBMITTED','PROCESSING')`，超限则延迟重投 | 精确、可审计，量大时要注意索引 |
| Redis 信号量 | `INCR` / `DECR` + 过期兜底 | 高性能，但要处理进程崩溃后的泄漏 |
| 令牌/排队 | 业务层做准入队列，MQ 只承接已准入的任务 | 复杂业务、需要公平调度 |

### 5.4 写并发数字的正确格式

一张合格的并发表，必须写清四件事：

| 维度 | 必须明确 |
|---|---|
| **作用点** | 是 MQ 消费者并发，还是外部 API 调用并发，还是两者都有？ |
| **粒度** | 全局 / 每队列 / 每租户 / 每用户？ |
| **数值与依据** | 为什么是 2 而不是 5？（外部 API 的 QPS 配额？机器规格？） |
| **超限行为** | 排队、拒绝（返回 429）、还是降级？用户看到什么？ |

---

## 六、盲区五：幂等被写成了口号

那份方案的幂等五条其实写得不错：

1. `generation_task.id` 唯一；
2. 状态条件更新；
3. 外部模型提交前保存提交标记；
4. 回调按 `external_task_id` 唯一处理；
5. 固定 Object Key 或内容哈希。

但"写对了规则"和"能实现"之间，还差一个关键定义：**幂等的粒度是什么，以及这些防线在哪一层生效。**

### 6.1 三道防线，各管一件事

| 防线 | 拦住什么 | 实现位置 |
|---|---|---|
| **唯一键** | 同一业务对象的重复创建 | DB（唯一索引） |
| **状态条件更新** | 同一任务的重复执行、乱序覆盖 | DB（`UPDATE ... WHERE status IN (...)` + 判断影响行数） |
| **外部提交标记** | 对第三方 API 的重复提交（真金白银） | DB + 提交前检查 |

三条都要有，缺一条就有洞。

### 6.2 状态条件更新：判断影响行数才算完成

方案里给出的条件更新 SQL 是全篇质量最高的地方，这里把它补全：

```sql
-- 幂等闸门：只有处于预期前置状态的任务才允许推进
UPDATE generation_task
   SET status = 'PROCESSING',
       update_time = NOW()
 WHERE id = #{taskId}
   AND status IN ('SUBMITTED')     -- 前置状态白名单
   AND del_flag = '0';

-- 调用方：
int rows = mapper.markProcessing(taskId);
if (rows == 0) {
    // 已经处理过 / 已取消 / 状态不对 → 丢弃这条消息并 ack
    acknowledge();
    return;
}
```

**`rows == 0` 不是异常，是正常分支。** 它代表"这条消息是重复的，或者任务状态已经变了"，正确动作是**丢弃 + ack**，而不是重试或者报错。

状态机必须写全"谁改的、什么条件下改"：

| 从 | 到 | 触发者 | 条件 |
|---|---|---|---|
| CREATED | QUEUED | 业务接口 | 事务内写 outbox |
| QUEUED | SUBMITTED | 消费者 | 成功拿到 `external_task_id` |
| SUBMITTED | PROCESSING | 回调/轮询 | 外部任务开始运行 |
| PROCESSING | POST_PROCESS | 回调/轮询 | 外部返回产物 URL |
| POST_PROCESS | SUCCESS | 后置消费者 | OSS 上传 + 预览生成完成 |
| 任意非终态 | FAILED | 消费者/扫描器 | 不可重试错误，或重试超限 |
| 任意非终态 | CANCELLED | 用户/扫描器 | 见 7.3 |

### 6.3 消息里必须有"这是第几次"

方案的消息体只有 `taskId/taskType/projectId/creatorId/modelCode/templateId/inputObjectKeys/parameters`——**没有一个字段能表达重试次数、消息唯一性、超时时间**。结果是：消费者无法判断"这条消息我是不是已经处理过"，也无法做退避决策。

建议的消息契约（v1）：

```json
{
  "schemaVersion": 1,
  "messageId": "b7f3c1e2-...",
  "taskId": "T202610120001",
  "taskType": "video",
  "step": "SUBMIT",
  "projectId": "P1001",
  "creatorId": "U2001",
  "modelCode": "video-v2",
  "templateId": "tpl-9",
  "attempt": 1,
  "deadlineAt": "2026-10-12T16:00:00+08:00",
  "inputObjectKeys": ["input/a.jpg", "input/b.mp4"],
  "externalTaskId": null,
  "parameters": { "duration": 15, "ratio": "16:9" }
}
```

同时消息 header 带上：

| Header | 用途 |
|---|---|
| `x-retry-count` | 消费端退避与超限判定 |
| `x-message-id` | 全链路追踪（配合日志 MDC） |
| `x-schema-version` | 灰度升级消息契约时做兼容分支 |

> `attempt` 同时放在 body 和 header 里似乎是冗余，但这是故意的：body 是业务事实（可入库），header 是传输元数据（不污染业务）。**至少保证有一个，并且消费端以 header 为准。**

### 6.4 幂等键要能抵抗乱序

最容易被忽略的场景：**旧消息后到。**

任务已经推进到 `POST_PROCESS`，这时一条早先超时重投的 `SUBMITTED` 阶段消息到达。如果消费逻辑是 `UPDATE ... SET status='PROCESSING' WHERE id=?`（没有前置状态白名单），状态就被**回退**了。

所以条件更新的 `WHERE` 子句里必须带**前置状态白名单**，或者带**单调递增的 `version` 字段**：

```sql
UPDATE generation_task
   SET status = 'PROCESSING', version = version + 1
 WHERE id = #{taskId} AND version = #{expectedVersion};
```

---

## 七、盲区六：卡死的任务没有出口

### 7.1 RabbitMQ 没有 visibility timeout

用惯了 SQS 的人会有一个误解：以为消息也有"可见性超时"，处理超时会自动被别人接管。

**RabbitMQ 没有这个机制。** 只有两种情况能被自动发现：

- 未 ack 且超过 `consumer_timeout` → channel 关闭、消息重投；
- 消费者连接断开 → 该消费者所有未 ack 消息重投。

**一旦你 ack 了消息，MQ 对这条业务就彻底失忆了。** 而按第二节的正确做法，我们是"提交完就 ack"——于是"任务提交给外部模型之后卡住了"这种事，**没有任何一方会知道**。

于是数据库里会出现一批永远停在 `SUBMITTED` / `PROCESSING` 的任务：用户看到"生成中"，实际外部任务早就失败了。

### 7.2 解法：心跳字段 + 扫描器

```sql
ALTER TABLE generation_task
  ADD COLUMN heartbeat_at DATETIME NULL COMMENT '心跳时间（消费者/轮询器定期续期）';
```

配套一个定时扫描器（每分钟）：

| 扫描条件 | 判定 | 动作 |
|---|---|---|
| `status='QUEUED' AND create_time < NOW()-2min` 且无发送记录 | 消息可能丢了 | 补投消息（幂等由状态闸门保证） |
| `status='PROCESSING' AND heartbeat_at < NOW()-5min` | 消费者/轮询器可能死了 | **查外部状态**：已完成→推进；进行中→续期心跳；不存在→重投；明确失败→FAILED |
| `status='SUBMITTED' AND submitted_at < NOW()-30min` | 外部任务超期 | 查外部状态，按上一条处理 |
| 任意非终态且超过 `deadlineAt` | 超时 | 置 FAILED（可重试的走 retry 队列） |

**关键点：扫描器的动作是"查外部状态"，不是"重新提交"。** 这是双倍计费的唯一真正防线。

另外，队列里的消息也应该有 TTL（比如 2 小时）：消息过期直接进 DLQ，避免半夜重启后把三天前的任务全部复活。

### 7.3 取消（CANCELLED）必须分三种情形

方案的状态机里有 `CANCELLED`，但没写怎么取消。而"取消"在一个异步系统里是最容易做错的功能，因为它要面对**三种物理状态**：

| 情形 | 消息状态 | 正确动作 |
|---|---|---|
| **排队中** | 消息还在队列里 | 更新 task 为 CANCELLED。**不要试图去队列里删消息**（删不到，也不该删）；靠消费入口的状态闸门丢弃并 ack |
| **处理中（本系统内）** | 正在跑后置流程（下载/转码） | 置 CANCELLED + 设置取消标记；消费者在每个可中断点检查标记，尽早返回并清理临时产物 |
| **已提交外部模型** | 外部任务正在跑，钱已花 | 尽力调外部取消接口；无论成败，**结果回调到达后直接丢弃**；必须如实告知用户"已产生计费" |

> 结论：**取消不是删消息，是打标记 + 消费端尊重标记。** 消息可以被消费，但不能产生副作用。

---

## 八、盲区七：没有可观测性，等于没有 MQ

方案把"监控告警"完全留白。而 MQ 系统最典型的故障模式恰恰是**静默**：

- 队列在堆积，但消费者没报错；
- 死信队列里有 3000 条消息，没人看过；
- 某个队列的消费者数为 0（部署时路由键写错了），流量全部进 DLQ。

### 8.1 最低限度的指标集

| 指标 | 含义 | 告警建议 |
|---|---|---|
| `queue_messages_ready` | 可消费消息数（堆积） | 连续 5 分钟 > 阈值 |
| `queue_messages_unacknowledged` | 在途未 ack | 突增（消费者假死/卡住） |
| `queue_consumers` | 消费者数量 | **== 0 且队列非空 → 立即告警**（最有效的一条） |
| `message_age` / oldest age | 最老消息年龄 | > 业务 SLA 的一半 |
| redelivery rate | 重投率 | 明显上升 = 有系统性错误 |
| DLQ 深度 | 死信数量 | **> 0 就该有人看**，持续增长必须告警 |
| retry 队列深度 | 重试积压 | 外部服务大面积故障的信号 |
| publisher confirm nack | 发送失败 | > 0 告警 |
| 任务状态分布 | QUEUED/PROCESSING 存量 | PROCESSING 存量只增不减 = 扫描器失效 |

另外一定要有**业务侧**的埋点：`submit 成功率`、`外部模型 P95 耗时`、`重复提交拦截次数`（这个指标为 0 说明幂等根本没生效过——它应该是偶尔 > 0 的）。

### 8.2 MQ 不是状态存储

这是全文最重要的一个边界：

> **业务状态一律以 MySQL 为准；MQ 里的消息只是"待办事项的通知单"。**

推论：

- 不要设计任何"靠消息是否还在队列里判断任务状态"的逻辑；
- 不要用队列深度当作任务数量的真相；
- 允许消息丢失（有 outbox + 扫描器补投），也允许消息重复（有幂等闸门）；
- 真正的状态机只有一份，在数据库里。

### 8.3 还有几个容易被推到"待确认"的问题

那份方案把"RabbitMQ 部署方式和消息持久化策略"列为待确认项。这类问题不能拖到实施阶段，它们直接决定可用性：

| 问题 | 结论 |
|---|---|
| 持久化 | 业务队列 `durable=true` + 消息 `delivery_mode=2`；不能接受"重启丢消息" |
| 高可用 | **classic mirrored queue 已在 RabbitMQ 3.9 废弃、4.0 移除**，新项目直接用 **quorum queue**；quorum queue 原生支持 `x-delivery-limit`（新版默认 20）对重投计数，比自维护 `x-retry-count` 更省事 |
| 手动重试插队 | 运维手动重试不能被排在几千条消息后面 → 独立 `media.<type>.express` 队列，或对队列设 `x-max-priority` |
| 凭据隔离 | 不同业务用不同 vhost + 最小权限账号，别所有服务共用 `guest` |
| 消息大小 | 消息体只放**引用**（Object Key / ID），不进二进制；大产物走 OSS，传 URL |
| 版本兼容 | `schemaVersion` + 消费端兼容分支，避免上线期间新旧格式互斥 |

---

## 九、把设计写成"可施工"的清单

回头看，那份方案缺的不是知识，而是**把知识落到参数层面的习惯**。下面这张表可以用来自查任何一份 MQ 设计稿：

| # | 项 | 必须写出 | 验收方式 |
|---|---|---|---|
| 1 | Exchange / Queue / Binding | 名称、类型、routing key、是否 durable | 能照着一条条建出来 |
| 2 | 消息契约 | JSON 字段 + header + 版本号 | 消费端能按契约解析 |
| 3 | ack 时机 | 精确到"哪一行代码之后" | 代码 review 能指出位置 |
| 4 | 超时 | `consumer_timeout` 值 vs 单条消息 P99 处理时间 | P99 < timeout 的 1/3 |
| 5 | 重试 | 触发条件、延迟序列、次数上限、计数位置 | 断点调试能复现 |
| 6 | 错误分类 | 可重试 / 不可重试 的错误码清单 | 每条错误都有归属 |
| 7 | 死信 | 队列名、消费策略、告警阈值、重放方式 | DLQ 有消息能被人看到 |
| 8 | 幂等 | 幂等键、唯一索引、条件更新 SQL、影响行数处理 | 重复投递不产生副作用 |
| 9 | 生产端一致性 | outbox 表或补投 Job | kill 掉 broker 不丢任务 |
| 10 | 并发 | prefetch / concurrency / 实例数 + 作用维度 | 压测能对上 |
| 11 | 用户配额 | 实现在哪一层、超限行为 | 单用户打不满全局 |
| 12 | 卡死兜底 | heartbeat 字段 + 扫描器 + 扫描周期 | 手动 kill 消费者能自愈 |
| 13 | 取消 | 三种情形的分别处理 | 取消后不再产生副作用 |
| 14 | 监控 | 指标、阈值、通知对象 | 人为制造故障能被发现 |
| 15 | 部署 | 持久化、quorum、vhost、凭据、消息大小 | 重启/主从切换不丢消息 |

**判断一份 MQ 文档是否合格的简易标准：把这份文档交给一个没参与设计的工程师，他能不能独立把队列建出来、把消费者写出来、把故障演练跑出来。** 做不到就是清单，不是设计。

---

## 十、结语：MQ 不解决状态问题

这次评审让我重新想清楚了一件事：**MQ 最容易出问题的地方，从来不是"消息队列用得好不好"，而是"人们指望它做什么"。**

- 指望它记住"任务正在执行" → 于是让消息长时间不 ack，撞上 `consumer_timeout`；
- 指望它自动重试 → 于是写下"失败重试 2 次"，实现出来是热循环；
- 指望它保证"要么都成功" → 于是裸双写，任务永远挂起；
- 指望它兜住并发 → 于是"由配置管理"，然后被默认的 `prefetch=250` 教做人。

把这些期待拿掉，MQ 的定位就变得非常清晰：

> **它是一根可靠的通知线。** 发出通知（outbox 保证不丢）、收到通知（幂等保证不重复执行）、通知失败怎么办（重试队列保证可控）、通知不到怎么办（扫描器保证兜底）、通知出了问题谁发现（监控保证可见）——五件事，一件都不能少。

五个问题、七个盲区、十五项清单，本质上都在回答同一句话：**把"等待"从消费者里搬出去，把"状态"放回数据库，把"控制"写进参数。**

---

## 附录 A：一份可直接抄的参考拓扑

**Exchange**

```
media.exchange (topic, durable)
  ├─ media.<type>.queue          ← 主队列，手动 ack，prefetch=1
  ├─ media.<type>.retry.30s      ← TTL=30000，DLX → media.exchange
  ├─ media.<type>.retry.2m       ← TTL=120000，DLX → media.exchange
  ├─ media.<type>.express        ← 运维手动重试，优先消费
  └─ media.<type>.dlq            ← 无 TTL，无人消费，仅告警 + 人工重放
```

**队列参数（主队列）**

```
durable=true
x-message-ttl=7200000            # 2 小时，过期进 DLQ
x-dead-letter-exchange=media.exchange
x-dead-letter-routing-key=media.<type>.dlq
```

**重试队列参数**

```
durable=true
x-message-ttl=30000              # 队列级 TTL，全队列统一
x-dead-letter-exchange=media.exchange
x-dead-letter-routing-key=media.<type>.queue   # 回到主队列
```

**消费者约定**

```
acknowledge-mode = manual
prefetch         = 1        （长任务）
concurrency      = 1，max-concurrency = 2
retry.enabled    = false
default-requeue-rejected = false
```

**消费端七步**

```
① 解析消息（含 schemaVersion 兼容）
② 状态闸门：条件更新，rows==0 → ack 丢弃
③ 二次校验：项目状态 / 额度 / 参数（不可重试则 DLQ）
④ 判断 externalTaskId：已有 → 只查询续跑，绝不重新 submit
⑤ 执行本步动作（提交 / 下载 / 转码 / 上传 / 预览）
⑥ 落库新状态，按需投递下一步消息
⑦ ack
```

---

## 附录 B：评审时用的五个问题（可打印自查表）

1. 一条消息代表什么？它在哪一步 ack？ack 之后如果这一步卡住了，谁知道？
2. 失败后谁重新投递？延迟多少？几次？计数记在哪？超限去哪？
3. 哪些错误不该重试？它们的错误码列全了吗？
4. 写库和发消息，崩在中间会怎样？我凭什么相信不会？
5. 队列堆积、消费者为 0、DLQ 有消息——谁在什么时候会知道？

---

*本文基于一次真实的技术方案评审整理，文中涉及的第三方默认值（`consumer_timeout` = 30 分钟、Spring AMQP `prefetch` = 250、`default-requeue-rejected` = true 等）请以你实际使用的版本为准。*
