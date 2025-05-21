# Google集群工作负载跟踪数据格式说明

## 集群基础概念
一个Google集群是由多台机器组成的集合，这些机器被安装在物理机架(rack)中，并通过高带宽集群网络连接。单元(cell)是指共享同一集群管理系统的机器集合，这些机器通常都位于同一个集群内，集群管理系统负责将工作分配给各台机器。

Borg支持两种资源请求类型：
- **任务(job)**：由一个或多个任务(task)组成，描述用户想要运行的计算作业
- **资源预留集(alloc set)**：由一个或多个资源预留实例(allocs/alloc instances)组成，描述可供任务运行的资源预留环境

单个任务实例(task)代表一个Linux程序（可能包含多个进程），运行在单台机器上。任务可以指定必须运行的资源预留集，这种情况下它的每个任务实例都将从该资源预留集的某个资源预留实例中获取资源。如果任务没有指定资源预留集，它的任务实例将直接从机器获取资源。

我们统称任务和资源预留集为"集合"(collections)，称任务实例和资源预留实例为"实例"(instances)，用"事物"(thing)来泛指集合或实例。

## 数据表通用字段

### 脱敏处理技术
出于保密原因，我们对跟踪数据中的某些信息进行了脱敏处理。特别是：
- 大多数自由文本字段被随机哈希
- 资源大小经过线性变换（缩放）
- 某些值被映射到排序后的序列

我们确保这些处理方式保持一致，以便数据仍可用于研究。

脱敏转换类型包括：
- **未处理**：值保持原样
- **哈希处理**：通过密钥加密哈希转换为不可逆值
- **有序映射**：将观测值排序后映射为连续整数（从0开始）
- **缩放处理**：除以类型特定常数归一化到[0,1]范围，并保留最多10位二进制精度
- **特殊处理**：少数值采用特殊处理方式

### 时间和时间戳
每条记录都包含一个时间戳，以微秒为单位，表示从跟踪周期开始前600秒算起的时间（64位整数）。例如，跟踪开始后20秒的事件时间戳为620,000,000微秒。

特殊时间值：
- `0`：表示跟踪窗口开始前发生的事件
- `2^63-1`(MAXINT)：表示跟踪窗口结束后发生的事件

用量测量中的时间处理略有不同，因为最大测量长度为300秒。我们对其应用相同的时间偏移以确保清晰分离。

### 唯一标识符
每个集合（任务、资源预留集）和每台机器都被分配一个唯一的64位标识符。这些ID不会被重复使用，但机器ID在移除后重新加入集群时可能保持不变。极少数情况下，集合ID在停止、重新配置和重启时可能保持不变。

任务实例通过其所属任务的ID和任务在任务中的索引（从0开始）来标识。具有相同任务ID和任务索引的任务实例可以（且经常）被停止和重启而不分配新的ID。资源预留实例也有类似的生命周期。

### 用户和集合名称
用户名和集合名称经过哈希处理，以不透明的base64编码字符串形式提供，仅支持相等性测试。

逻辑集合名是通过启发式方法从多个内部名称字段组合而成的规范化名称，哈希后生成不透明的base64字符串（例如，逻辑名称中的大多数数字会被固定字符串替换）。同一程序不同执行生成的自动集合名通常具有相同的逻辑名称。

### 资源单位
资源请求和用量测量都经过归一化和缩放处理：

- **内存**：以字节为单位，通过除以所有跟踪中观察到的最大机器内存值进行缩放
- **CPU**：以"Google计算单元"(GCU)为单位，通过类似内存的方式缩放为归一化计算单元(NCU)
- 大多数资源用包含CPU(NCU)和内存(归一化字节)的Resources结构体描述

## 数据表详情

### 机器表

#### 机器事件表(MachineEvents)
| 字段 | 说明 |
|------|------|
| time | 时间戳 |
| machine_id | 机器唯一ID |
| type | 事件类型：ADD/REMOVE/UPDATE |
| switch_id | 机器连接的网络交换机ID |
| capacity | 机器提供的资源容量(Resources结构体) |
| platform_id | 机器微架构和芯片组版本 |
| missing_data_reason | 数据缺失原因 |

机器事件类型：
- ADD：机器加入集群
- REMOVE：机器移出集群
- UPDATE：机器可用资源变更

#### 机器属性表(MachineAttributes)
| 字段 | 说明 |
|------|------|
| time | 时间戳 |
| machine_id | 机器ID |
| name | 属性名(脱敏) |
| value | 属性值(整数或哈希字符串) |
| deleted | 是否删除标记 |

### 集合和实例表

#### 集合事件表(CollectionEvents)
| 字段 | 说明 |
|------|------|
| time | 时间戳 |
| type | 事件类型 |
| collection_id | 集合唯一ID |
| scheduling_class | 调度类别(0-3) |
| missing_type | 缺失记录类型 |
| collection_type | 0=任务,1=资源预留集 |
| priority | 优先级(数值越大优先级越高) |
| alloc_collection_id | 所属资源预留集ID |
| user | 提交者(哈希) |
| collection_name | 集合全名(哈希) |
| collection_logical_name | 集合逻辑名(哈希) |
| parent_collection_id | 父集合ID |
| start_after_collection_ids | 前置集合ID列表 |
| max_per_machine | 单机最大实例数 |
| max_per_switch | 同交换机最大实例数 |
| vertical_scaling | 自动扩缩设置 |
| scheduler | 调度器类型 |

#### 实例事件表(InstanceEvents)
| 字段 | 说明 |
|------|------|
| time | 时间戳 |
| type | 事件类型 |
| collection_id | 所属集合ID |
| scheduling_class | 调度类别 |
| missing_type | 缺失记录类型 |
| collection_type | 集合类型 |
| priority | 优先级 |
| alloc_collection_id | 所属资源预留集ID |
| instance_index | 实例索引 |
| machine_id | 所在机器ID |
| alloc_instance_index | 所属资源预留实例索引 |
| resource_request | 资源请求(Resources结构体) |
| constraint | 机器约束条件 |

### 资源用量表(InstanceUsage)
| 字段 | 说明 |
|------|------|
| start_time | 测量开始时间 |
| end_time | 测量结束时间 |
| collection_id | 集合ID |
| instance_index | 实例索引 |
| machine_id | 机器ID |
| alloc_collection_id | 资源预留集ID |
| alloc_instance_index | 资源预留实例索引 |
| collection_type | 集合类型 |
| average_usage | 平均用量(Resources) |
| maximum_usage | 最大用量(Resources) |
| random_sampled_usage | 随机采样用量(Resources) |
| assigned_memory | 分配内存限制 |
| page_cache_memory | 页面缓存内存 |
| cycles_per_instruction | 每指令周期数(CPI) |
| memory_accesses_per_instruction | 每指令内存访问数(MAI) |
| sample_rate | 采样频率(Hz) |
| cpu_usage_distribution | CPU用量分布(11个百分位) |
| tail_cpu_usage_distribution | CPU用量尾部分布(91-99百分位) |

## 事件类型详细说明

### 集合和实例生命周期事件
| 事件类型 | 描述 |
|---------|------|
| SUBMIT | 事物被提交到集群管理器 |
| QUEUE | 事物进入队列等待调度 |
| ENABLE | 事物变为可调度状态 |
| SCHEDULE | 事物被调度到机器上（可能不会立即运行） |
| EVICT | 事物因高优先级任务、资源超配或机器故障等原因被取消调度 |
| FAIL | 事物因程序错误（如段错误、内存超限）被取消调度 |
| FINISH | 事物正常完成 |
| KILL | 事物被用户或驱动程序终止 |
| LOST | 事物终止但源数据中缺少记录 |
| UPDATE_PENDING | 等待调度的事物的调度类/资源需求/约束被更新 |
| UPDATE_RUNNING | 运行中事物的调度类/资源需求/约束被更新 |

### 缺失记录类型
| 类型 | 描述 |
|-----|------|
| SNAPSHOT_BUT_NO_TRANSITION | 快照显示状态变更但缺少对应事件记录 |
| NO_SNAPSHOT_OR_TRANSITION | 事物从集群状态快照中消失但无终止记录 |
| EXISTS_BUT_NO_CREATION | 事物存在但缺少创建记录 |
| TRANSITION_MISSING_STEP | 状态转换缺少中间步骤记录 |

## 资源用量测量细节

### CPU用量测量
- 采样频率：约每秒1次
- 计算公式：
  - 窗口平均CPU使用率 = ∑(Ucpu) / Twindow
  - 最大CPU使用率 = max(Ucpu/Tsample)
- 所有原始数据都归一化为NCU值
- CPU用量单位：NCU秒/秒（持续使用2个GCU的任务将显示为2.0 GCU-s/s）

### 内存用量测量
- 采样频率：每个采样周期收集
- 计算公式：
  - 窗口平均内存用量 = ∑(Umem×Tsample) / Twindow
  - 最大内存用量 = max(Umem)
- 所有原始数据都归一化

### 性能指标
- **CPI**(Cycles Per Instruction)：每指令周期数
- **MAI**(Memory Accesses Per Instruction)：每指令内存访问数
- 数据来源：处理器性能计数器（并非所有机器都收集）

## 约束条件处理

### 机器约束结构
| 字段 | 说明 |
|------|------|
| name | 约束属性名（哈希处理） |
| value | 约束值（哈希字符串/整数/空） |
| relation | 比较运算符 |

### 比较运算符类型
| 运算符 | 匹配条件 |
|-------|----------|
| EQUAL | 机器属性值等于约束值 |
| NOT_EQUAL | 机器属性值不等于约束值 |
| LESS_THAN | 机器属性值（整数）小于约束值 |
| LESS_THAN_EQUAL | 机器属性值小于等于约束值 |
| GREATER_THAN | 机器属性值大于约束值 |
| GREATER_THAN_EQUAL | 机器属性值大于等于约束值 |
| PRESENT | 机器具有该属性 |
| NOT_PRESENT | 机器不具有该属性 |

## 优先级分层详解
| 优先级范围 | 层级 | 特性 |
|-----------|------|------|
| 0-99 | 免费层 | 内部计费低，无SLO保证 |
| 100-115 | 批处理层 | 由批处理调度器管理，低内部计费 |
| 116-119 | 中间层 | 介于免费层和生产层之间的SLO |
| 120-359 | 生产层 | 最高优先级，防止延迟敏感任务被驱逐 |
| ≥360 | 监控层 | 用于监控其他任务的健康状态 |

## 容器资源隔离说明
- 使用Linux容器实现资源隔离和用量统计
- 每个任务运行在独立容器中（可包含多个进程）
- 资源预留实例也有关联容器（任务容器嵌套其中）
- 内存隔离通过Linux memcg实现，部分内核内存使用会计入任务

## 测量窗口特性
- 典型长度：5分钟（300秒）
- 可能缩短的情况：
  - 实例启动/停止时
  - 实例更新时
- 测量可能持续到实例终止后数十秒
- 部分测量记录可能因系统限制而缺失

## 文件格式说明
原始字段定义以GitHub上的[clusterdata_trace_format_v3.proto](https://github.com/google/cluster-data)文件为权威标准，本文档可视为对该文件的注释说明。