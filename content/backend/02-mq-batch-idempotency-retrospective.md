---
title: "MQ 批量任务幂等复盘：不要用 task-id 代替业务去重键"
date: "2026-10-16"
readTime: "20 min"
tags: ["RabbitMQ", "消息队列", "幂等", "去重", "批量任务", "重试", "后端"]
excerpt: "第一次按 task-id 去重，挡住了同一批消息的重复投递，却挡不住不同批次之间的重叠数据；改成按回调判断，又遇到断网重连后的重复执行。本文从这两个故障还原问题边界，给出批量任务的业务幂等键、消费端状态闸门、外部调用幂等和回调去重的完整设计。"
---

# MQ 批量任务幂等复盘：不要用 task-id 代替业务去重键

**作者：Kaze Cinder | 发布于 2026-10-16**

---

最近一次 MQ 设计里，我遇到过两个看起来互相矛盾的问题：

- 第一次投递 `task-id=1`，消息里包含 `1、2、3、4` 四条数据；第二次投递 `task-id=2`，消息里包含 `2、3、4、5` 四条数据。按 `task-id` 去重，两个任务都会被认为是新任务，`2、3、4` 被重复执行；
- 后来改成根据回调信息判断去重，执行 `task-id=1` 时网络断开，重连后消息重新投递，`1、2、3、4` 又完整执行了一遍。

这两个现象的共同根因是：**把“消息属于哪个批次”当成了“这次业务副作用是否已经执行过”。**

`task-id` 可以标识一次批量请求，不能单独标识一条数据的一次业务动作。MQ 又天然是至少一次投递，断网、消费者重启、连接超时、ack 丢失，都可能让同一条消息再次到达。真正需要设计的是**业务动作的幂等边界**，而不是寻找一个“绝不会重复的消息字段”。

> 先记住一句话：
> **task-id 是编排 ID，message-id 是投递 ID，item-operation-key 才是业务幂等 ID。**

---

## 一、先把三个 ID 分开

同一个系统里至少有三种 ID，它们的生命周期和职责完全不同。

| ID | 例子 | 它回答的问题 | 能不能作为业务去重键 |
|---|---|---|---|
| `taskId` | `1`、`2` | 这批请求是谁发起的？ | 不能。不同批次可以包含同一条数据 |
| `messageId` | `msg-8f...` | 这次 MQ 投递是哪一条？ | 只能挡住同一条消息的重复投递 |
| `itemOperationKey` | `item-2:thumbnail:v3` | 这条数据的这个动作是否已经成功？ | 可以。它必须对应真实业务副作用 |

如果供应商也参与异步处理，还需要第四个 ID：

| ID | 例子 | 用途 |
|---|---|---|
| `providerTaskId` | `aliyun-abc123` | 查询外部任务、接收回调，避免重复提交 |

把它们混在一起，就会得到几个典型误判：

- `taskId` 不同，所以以为一定应该执行两次；
- `messageId` 不同，所以以为一定是两次业务请求；
- 回调里的 `providerTaskId` 相同，才发现外部任务其实只有一个，但这时重复提交可能已经发生；
- `redelivered=true`，就把它当成“重复业务”，却无法判断是哪一个动作重复。

`redelivered` 只说明 RabbitMQ 重新投递过消息，不说明业务动作是否完成。它是传输信号，不是幂等依据。

---

## 二、这次问题真正缺的是“批次”和“条目”的关系

原始模型可以简化成这样：

```text
Task 1: [1, 2, 3, 4]
Task 2: [2, 3, 4, 5]
```

但系统没有继续回答一个关键问题：

> `2、3、4` 在两个 task 中出现时，它们代表同一次业务动作，还是两次有意的动作？

这不是 MQ 能替业务决定的。至少有四种合法语义：

| 业务语义 | `2、3、4` 应该怎样处理 |
|---|---|
| 同一版本、同一动作 | 只执行一次，两个 task 都引用同一份结果 |
| 不同版本、不同参数 | 执行两次，幂等键必须包含版本或参数指纹 |
| 最新任务覆盖旧任务 | 新任务进入后取消旧任务，旧消息到达时只 ack 丢弃 |
| 每个批次都必须留下独立产物 | 不能按 item 去重，幂等键要包含 task 维度 |

所以第一步不是写 `select count(*)`，而是给动作命名：

```text
itemId + operation + businessVersion + inputFingerprint
```

例如同一张图片生成缩略图：

```text
item-2:thumbnail:version-3:sha256-xxxx
```

如果只是“给 item-2 发送一次通知”，可以简化成：

```text
item-2:notify
```

如果是“在每个 task 中都生成一份独立结果”，则应该是：

```text
task-1:item-2:generate
 task-2:item-2:generate
```

**去重键必须和业务副作用的边界一致。** 过粗会误删合法任务，过细会挡不住重复执行。

---

## 三、正确的表模型：任务、条目、消费记录分开

不要只在消息 JSON 里放一个 `taskId` 和一个数据数组。批量任务应该拆成父任务和任务条目：

```text
batch_task
  ├── task_id
  ├── status
  └── ...

batch_task_item
  ├── task_id
  ├── item_id
  ├── operation
  ├── business_version
  ├── idempotency_key
  ├── status
  ├── provider_task_id
  ├── result_ref
  ├── lease_until
  └── ...
```

推荐让 `idempotency_key` 具备唯一约束：

```sql
CREATE TABLE batch_task_item (
  id                BIGINT       NOT NULL AUTO_INCREMENT,
  task_id           VARCHAR(64)  NOT NULL,
  item_id           VARCHAR(64)  NOT NULL,
  operation         VARCHAR(64)  NOT NULL,
  business_version  VARCHAR(64)  NOT NULL,
  idempotency_key   VARCHAR(255) NOT NULL,
  status            VARCHAR(32)  NOT NULL DEFAULT 'PENDING',
  provider_task_id  VARCHAR(128) NULL,
  result_ref        VARCHAR(512) NULL,
  lease_until       DATETIME     NULL,
  attempt           INT          NOT NULL DEFAULT 0,
  create_time       DATETIME     NOT NULL,
  update_time       DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_item_operation (idempotency_key),
  UNIQUE KEY uk_provider_task (provider_task_id)
);
```

`task_id` 仍然保留，因为它用于查询批次进度、展示提交记录和聚合结果；只是它不再承担条目级幂等职责。

如果同一条 item 允许出现在多个批次，插入任务条目时要做一次“业务认领”：

```sql
INSERT INTO batch_task_item (
  task_id, item_id, operation, business_version,
  idempotency_key, status, create_time, update_time
) VALUES (?, ?, ?, ?, ?, 'PENDING', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  update_time = update_time;
```

通过影响行数或查询结果判断：

- 第一次插入成功：这个业务动作需要执行；
- 唯一键冲突：这个动作已经被其他 task 创建过，当前 task 只建立“引用关系”，不要再次执行；
- 如果业务要求“最新版本覆盖旧版本”，则更新旧条目的取消标记，而不是简单忽略。

> `INSERT IGNORE` 只能解决“重复创建记录”，不能自动解决“重复外部调用”。外部副作用仍需要自己的幂等协议。

---

## 四、消费端不能靠 callback 才开始判断幂等

回调信息适合回答：

> 外部任务 `providerTaskId=abc` 的状态发生了什么变化？

它不适合回答：

> 我是不是已经向外部服务提交过了？

如果第一次调用外部服务成功，但响应在网络中丢失，消费者看到的是超时：

```text
本地：不知道 providerTaskId
外部：任务其实已经创建
消费者重试：再次 submit
结果：两个外部任务，双倍费用，两个回调
```

因此，提交外部任务时至少要满足一个条件：

1. 供应商支持 `Idempotency-Key`，每次使用同一个 `itemOperationKey`；
2. 供应商支持按业务请求号查询，submit 前先查是否已经创建；
3. 自己维护提交记录，并用唯一约束把“首次提交”变成一次可竞争的状态转换。

推荐的提交逻辑：

```text
消费消息
  ↓
根据 itemOperationKey 查询条目
  ├─ SUCCESS / CANCELLED
  │    └─ 已完成或已取消：ack，结束
  ├─ providerTaskId 不为空
  │    └─ 只查外部状态，禁止再次 submit
  └─ providerTaskId 为空
       ├─ 抢占 SUBMITTING 状态
       ├─ 调用外部 API，并携带 Idempotency-Key
       ├─ 保存 providerTaskId
       └─ ack
```

注意：**不要在一个数据库事务里持有行锁等待外部 API 返回。** 正确做法是用短事务把状态从 `PENDING` 改为 `SUBMITTING`，提交后再调用外部服务；网络调用结束后再用短事务保存结果。状态转换要带条件：

```sql
UPDATE batch_task_item
   SET status = 'SUBMITTING',
       attempt = attempt + 1,
       lease_until = DATE_ADD(NOW(), INTERVAL 5 MINUTE),
       update_time = NOW()
 WHERE idempotency_key = ?
   AND status IN ('PENDING', 'RETRYABLE_FAILED')
   AND (lease_until IS NULL OR lease_until < NOW());
```

只有影响行数为 `1` 的消费者拿到本次执行权。影响行数为 `0` 时，说明已经被其他消费者处理、已经完成，或者当前租约仍然有效：这不是系统异常，应该按状态决定 ack 或延迟重试。

---

## 五、断网重连时，为什么 1234 仍会重新执行

RabbitMQ 的消费语义是至少一次：

```text
deliver → 业务副作用 → basicAck
```

如果网络在“业务副作用已经完成”和“ack 到达 broker”之间断开，broker 不知道业务是否完成，只能把消息重新投递：

```text
第一次投递：业务执行成功 → ack 丢失 → 连接断开
第二次投递：同一消息重新到达 → 业务代码再次执行
```

这不是 RabbitMQ 的 bug，也不是把 `basicAck` 提前一点就能彻底消除的问题。ack 和业务副作用分属两个系统，无法天然组成一个原子事务。

必须针对不同故障点设计恢复行为：

| 故障点 | 重连后的正确动作 |
|---|---|
| 业务代码还没开始 | 正常执行 |
| 已写入 `PROCESSING`，没有副作用 | 检查租约，租约过期后接管 |
| 外部 submit 已成功，响应丢失 | 用幂等键查询，不得盲目再次 submit |
| 本地结果已落库，ack 丢失 | 看到 `SUCCESS`，直接 ack |
| 回调已处理，回调 ack 丢失 | 依据回调唯一键判定已处理，直接 ack |

消费端可以增加 inbox 表记录消息接收，但要注意：

```sql
CREATE TABLE mq_inbox (
  message_id   VARCHAR(128) NOT NULL,
  consumer     VARCHAR(128) NOT NULL,
  received_at  DATETIME     NOT NULL,
  PRIMARY KEY (message_id, consumer)
);
```

`mq_inbox` 只能防止**同一 messageId** 被同一个消费者重复处理。`task-id=1` 和 `task-id=2` 是不同消息时，仍然要靠 `itemOperationKey` 防止 `2、3、4` 的重复副作用。两层记录需要同时存在：

- inbox：传输层去重；
- `batch_task_item` 的唯一键与状态：业务层去重。

---

## 六、回调也要幂等，但它不是唯一防线

回调处理至少需要两道约束：

```text
providerTaskId + eventType + eventVersion
```

或者供应商提供事件唯一 ID 时直接使用：

```text
providerEventId
```

回调表可以这样设计：

```sql
CREATE TABLE provider_callback_event (
  provider_event_id  VARCHAR(128) NOT NULL,
  provider_task_id   VARCHAR(128) NOT NULL,
  event_type         VARCHAR(64)  NOT NULL,
  payload_hash       CHAR(64)     NOT NULL,
  received_at        DATETIME     NOT NULL,
  PRIMARY KEY (provider_event_id),
  UNIQUE KEY uk_task_event (provider_task_id, event_type, payload_hash)
);
```

处理流程：

1. 先用唯一键写入回调事件；
2. 唯一键冲突，说明这个事件已经处理过，直接返回 2xx；
3. 首次写入成功，再根据 `providerTaskId` 找到任务条目；
4. 用状态条件更新推进 `PROCESSING → SUCCESS`；
5. 回调处理完成后再返回成功。

回调重复时一定要返回成功，否则供应商会继续重试，形成回调风暴。回调失败也不要重新 submit，提交和回调是两条不同的恢复路径。

---

## 七、把两个具体场景改成可执行的流程

### 场景 A：task-1 与 task-2 有重叠数据

假设业务定义为“同一 item、同一 operation、同一版本只执行一次”。

```text
task-1: item 1, 2, 3, 4
 task-2: item 2, 3, 4, 5

itemOperationKey:
  item-1:generate:v1  → 新建，执行
  item-2:generate:v1  → task-1 新建，执行
  item-3:generate:v1  → task-1 新建，执行
  item-4:generate:v1  → task-1 新建，执行
  item-2:generate:v1  → task-2 唯一键冲突，引用已有结果
  item-3:generate:v1  → task-2 唯一键冲突，引用已有结果
  item-4:generate:v1  → task-2 唯一键冲突，引用已有结果
  item-5:generate:v1  → 新建，执行
```

task-2 不应该被简单标记成“整批重复”。它仍然需要等待 item-5，并把 `2、3、4` 的已有结果聚合进来。批次状态和条目状态要分开计算。

### 场景 B：执行过程中断网并重投

```text
第一次投递
  → itemOperationKey = item-2:generate:v1
  → 状态抢占成功
  → 外部 submit，携带同一个 Idempotency-Key
  → 外部已创建 providerTaskId=abc
  → 本地保存成功，但 ack 在断网时丢失

第二次投递
  → 查询 itemOperationKey
  → 发现 providerTaskId=abc
  → 查询外部状态，不再次 submit
  → 外部已完成：补写 SUCCESS
  → ack
```

如果供应商不支持幂等 submit，第二次投递也必须先查询“是否已经创建”，或者通过本地 `SUBMITTING` 租约和提交凭证恢复。**绝不能把“调用超时”直接当成“外部没有执行”。**

---

## 八、建议的消息契约

消息里可以同时放批次上下文和条目幂等信息：

```json
{
  "schemaVersion": 1,
  "messageId": "msg-8f0c...",
  "taskId": "task-2",
  "itemId": "item-4",
  "operation": "generate",
  "businessVersion": "v1",
  "idempotencyKey": "item-4:generate:v1",
  "step": "SUBMIT",
  "attempt": 2,
  "deadlineAt": "2026-10-16T18:00:00+08:00",
  "payloadRef": "oss://bucket/input/item-4.json"
}
```

建议 header 另外保留：

| Header | 用途 |
|---|---|
| `x-message-id` | 传输追踪和 inbox 去重 |
| `x-retry-count` | 延迟重试次数，不污染业务字段 |
| `x-idempotency-key` | 消费端快速获取幂等键 |
| `x-schema-version` | 新旧消息兼容 |
| `traceparent` | 跨服务链路追踪 |

消息体的 `attempt` 是业务审计信息，header 的 `x-retry-count` 是传输信息。两者可以同时存在，但要明确谁负责什么，不能只依赖 `redelivered`。

---

## 九、这套方案和 Outbox / Retry / DLQ 的关系

幂等解决“重复执行”，但它不解决所有 MQ 问题，还需要和已有的可靠性机制配合：

```text
业务事务
  ├─ 写 batch_task / batch_task_item
  └─ 写 mq_outbox
       ↓
Outbox 中继发布消息
       ↓
RabbitMQ 主队列
       ↓
消费者：状态闸门 + itemOperationKey 幂等
       ├─ 成功：落库后 ack
       ├─ 可重试失败：发 retry 队列，再 ack 原消息
       └─ 不可重试 / 超过次数：DLQ + 告警
```

- Outbox 保证“任务记录存在但消息没发出去”时可以补投；
- itemOperationKey 保证“消息重复到达”时不重复产生业务副作用；
- providerTaskId 保证“外部已经接受但响应丢失”时不重复 submit；
- callback event key 保证“外部重复回调”时不重复推进状态；
- retry / DLQ 保证失败可控，而不是 `nack(requeue=true)` 热循环。

这几层不能相互替代。只做其中一层，系统仍然会在另一条故障路径上重复执行或丢失任务。

---

## 十、落地清单

在修改代码前，建议先把下面这些问题写进设计文档：

| # | 问题 | 必须明确的答案 |
|---|---|---|
| 1 | 一条消息代表什么 | 一个批次、一个 item，还是一个处理步骤 |
| 2 | 真正的业务动作是什么 | `item + operation + version + input` |
| 3 | 业务幂等键是什么 | 唯一键是否建在数据库里 |
| 4 | 同一 item 出现在两个 task 怎么办 | 合并、复用、覆盖，还是允许并行 |
| 5 | 外部 submit 如何幂等 | Idempotency-Key、查询接口或提交凭证 |
| 6 | ack 的前置条件是什么 | 哪些数据落库后才允许 ack |
| 7 | ack 丢失如何恢复 | 成功状态、租约、外部查询如何判断 |
| 8 | 回调如何幂等 | event id 或 task + event 唯一约束 |
| 9 | 消费状态如何抢占 | 条件更新、租约和超时接管 |
| 10 | 失败如何重试 | 错误分类、退避、次数上限和 DLQ |
| 11 | 批次状态如何聚合 | 所有条目完成、部分失败、取消的定义 |
| 12 | 如何观测重复 | 重复拦截数、重复提交数、重投率和 DLQ 深度 |

尤其要单独监控两个指标：

- `idempotency_hit_count`：命中幂等、成功拦截的次数；
- `provider_duplicate_submit_count`：外部重复提交次数，目标必须是 0。

第一个指标偶尔大于 0 是正常的，说明恢复路径真的被覆盖；第二个指标一旦大于 0，就应该带着 `messageId`、`taskId`、`itemOperationKey` 和 `providerTaskId` 进入事故排查。

---

## 十一、结语：不要追求消息不重复，要保证副作用可重复

这次问题让我重新理解了 MQ 的边界：**消息重复是正常现象，业务副作用重复才是故障。**

- `taskId` 负责描述一次批量请求；
- `messageId` 负责追踪一次传输；
- `itemOperationKey` 负责定义一次业务动作；
- `providerTaskId` 负责找回外部异步任务；
- callback event key 负责处理重复回调；
- 数据库状态和唯一约束负责把这些事实落下来。

对于 `task-1=[1,2,3,4]` 和 `task-2=[2,3,4,5]`，先定义 `2、3、4` 是否属于同一次业务动作，再决定是否复用结果；对于断网重连后的重投，不要试图从 MQ 判断“刚才到底执行到哪一步”，而是回到业务记录和外部任务状态，用幂等键恢复现场。

> **不要追求消息永远只投递一次，要保证同一业务动作即使被投递很多次，也只产生一次有效副作用。**

---

*本文基于一次批量 MQ 任务的设计复盘整理。实际落地时，请结合业务动作是否允许并行、外部服务是否支持幂等键、结果是否可覆盖等约束确定唯一键和状态机。*
