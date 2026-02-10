# WiFi 驱动架构全面分析指南 (第二部分)

## 4. 驱动与各模块通信

### 4.1 与内核网络子系统通信

#### 4.1.1 网络设备操作
**文件**: `mt_wifi/os/linux/rt_main_dev.c`

```c
// 网络设备操作结构
static const struct net_device_ops rt_wifi_netdev_ops = {
    .ndo_open = mt_wifi_open,           // 打开设备
    .ndo_stop = mt_wifi_close,          // 关闭设备
    .ndo_start_xmit = rt28xx_send_packets, // 发送数据包
    .ndo_get_stats = RT28xx_get_ether_stats, // 获取统计信息
    .ndo_do_ioctl = rt28xx_ioctl,       // ioctl 控制
    // ... 更多操作
};
```

#### 4.1.2 数据包发送流程
```
应用层
  ↓
内核网络栈 (TCP/IP)
  ↓
net_device->ndo_start_xmit()
  ↓
rt28xx_send_packets()                    // mt_wifi/os/linux/
  ↓
RTMP_SendPackets()                       // mt_wifi/common/cmm_data.c
  ↓
APSendPacket() / STASendPacket()         // 根据模式
  ↓
mac_ops->tx_data()                   // MAC 接口层
  ↓
hw_ops->write_txd/write_txp()        // 硬件层
  ↓
总线 DMA 传输
  ↓
硬件 MAC
```

#### 4.1.3 数据包接收流程
```
硬件 MAC
  ↓
总线 DMA 中断
  ↓
bus_rx_process()                     // wlan_hwifi/bus.c
  ↓
hw_ops->rx_pkt()                     // 解析 RXD
  ↓
interface_ops->rx_pkt()              // MAC 接口层
  ↓
APHandleRxDonePacket()                   // mt_wifi/common/cmm_data.c
  ↓
announce_802_3_packet()                  // 转换为以太网帧
  ↓
netif_rx() / netif_receive_skb()         // 提交到内核网络栈
```

### 4.2 与网桥模块通信

#### 4.2.1 网桥集成
驱动通过标准 Linux 网桥接口集成：

```c
// 设备标志支持网桥
net_dev->priv_flags |= IFF_BRIDGE_PORT;

// 网桥转发钩子
net_dev->netdev_ops->ndo_bridge_getlink = ...;
net_dev->netdev_ops->ndo_bridge_setlink = ...;
```

#### 4.2.2 4 地址转换 (4-Address Mode)
**文件**: `mt_wifi/common/client_wds.c`, `mt_wifi/common/a4_conn.c`

**用途**: 支持 WDS (Wireless Distribution System) 和 Repeater 模式

```c
// 4 地址帧格式
// 文件: mt_wifi/include/protocol/dot11_base.h
struct _HEADER_802_11_A4 {
    FRAME_CONTROL   FC;          // 帧控制字段
    UINT16          Duration;    // 持续时间
    UCHAR           Addr1[6];    // RA (Receiver Address)
    UCHAR           Addr2[6];    // TA (Transmitter Address)
    UCHAR           Addr3[6];    // DA (Destination Address)
#ifdef CFG_BIG_ENDIAN
    UINT16          Sequence:12; // 序列号
    UINT16          Frag:4;      // 分片号
#else
    UINT16          Frag:4;      // 分片号
    UINT16          Sequence:12; // 序列号
#endif
    UCHAR           Addr4[6];    // SA (Source Address)
    UCHAR           Octet[0];    // 帧体
};
```

**处理流程**:
```
RX 路径:
  4 地址帧 → 提取 SA/DA → 更新 MAC 表 → 转换为 3 地址/以太网帧

TX 路径:
  以太网帧 → 查找 WDS 表 → 添加 Addr4 → 发送 4 地址帧
```

### 4.3 与芯片 Firmware 通信

#### 4.3.1 MCU 架构
芯片采用**多 MCU 架构**:

```
┌─────────────────────────────────────────┐
│  Host Driver (Linux)                    │
└─────────────────────────────────────────┘
         ↕ (命令/事件)
┌─────────────────────────────────────────┐
│  WM MCU (WiFi Management)               │
│  - WiFi 协议栈                          │
│  - MLME 状态机                          │
│  - 信道管理                             │
│  - Beacon 生成                          │
└─────────────────────────────────────────┘
         ↕
┌─────────────────────────────────────────┐
│  WA MCU (WiFi Accelerator)              │
│  - TX 加速 (TXD 生成)                   │
│  - QoS 管理                             │
│  - 速率控制辅助                         │
└─────────────────────────────────────────┘
         ↕
┌─────────────────────────────────────────┐
│  WO MCU (WiFi Offload)                  │
│  - RX 重排序                            │
│  - BA 管理                              │
│  - RRO (RX Reordering Offload)          │
└─────────────────────────────────────────┘
         ↕
┌─────────────────────────────────────────┐
│  DSP MCU (Digital Signal Processor)     │
│  - PHY 校准                             │
│  - RF 控制                              │
│  - 温度补偿                             │
└─────────────────────────────────────────┘
```

#### 4.3.2 MCU 通信机制
**文件**: `wlan_hwifi/mcu/mcu.c`, `wlan_hwifi/mcu/mcu_wm.c`

**命令发送**:
```c
// 命令结构
struct mcu_txblk {
    enum mcu_dest dest;      // 目标 MCU (WM/WA/WO/DSP)
    enum mcu_path path;      // 命令路径
    u32 cmd_type;                // 命令类型
    u32 cmd_id;                  // 命令 ID
    void *cmd_buf;               // 命令缓冲区
    u32 cmd_len;                 // 命令长度
    bool need_wait;              // 是否需要等待响应
    struct completion *ack_done; // 响应完成信号
};

// 发送命令
int mcu_send_cmd(struct hw_dev *dev, 
                     struct mcu_txblk *txblk);
```

**事件接收**:
```c
// 事件处理流程
bus_rx_process()
  ↓
hw_ops->rx_event()           // 识别事件包
  ↓
mcu_rx_event()               // MCU 事件处理
  ↓
mcu_rx_event_handler()       // 根据事件类型分发
  ↓
- TX Free Done Event → 释放 TX Token
- BA Event → 更新 BA 状态
- Beacon Event → 更新 Beacon 信息
- 等等...
```

#### 4.3.3 统一命令格式 (Unified Command)

新一代芯片使用统一命令格式，简化命令处理：

```c
// 统一命令头部
struct uni_cmd_hdr {
    u8 cmd_type;                 // 命令类型
    u8 cmd_ver;                  // 命令版本
    u16 cmd_len;                 // 命令长度
    u8 option;                   // 选项标志
    u8 seq_num;                  // 序列号
    u16 reserved;
} __packed;

// 统一命令 TLV 格式
struct uni_cmd_tlv {
    u16 tag;                     // TLV 标签
    u16 len;                     // TLV 长度
    u8 data[];                   // TLV 数据
} __packed;
```

**优点**:
- 统一的命令格式，易于扩展
- TLV 结构，灵活性高
- 版本控制，向后兼容
- 减少命令类型数量

#### 4.3.4 固件下载流程
```
mcu_init_device()
  ↓
1. 下载 ROM Patch
   mcu_fwdl_patch()
     ├── 读取 patch 文件
     ├── 分段传输到芯片 (每段 4KB)
     ├── 验证 checksum
     └── 等待 MCU 确认
  ↓
2. 下载 RAM 固件
   mcu_fwdl_ram()
     ├── 读取 firmware 文件
     ├── 分段传输 (WM/WA/WO/DSP)
     │   ├── WM: WiFi 管理固件
     │   ├── WA: WiFi 加速固件
     │   ├── WO: WiFi 卸载固件
     │   └── DSP: DSP 固件
     ├── 验证 checksum
     └── 等待 MCU 确认
  ↓
3. 启动 MCU
   mcu_start_device()
     ├── 发送启动命令
     ├── 等待 MCU 就绪事件
     ├── 初始化 MCU 队列
     └── 设置 MCU_STATE_START
```

**固件文件格式**:
```c
// 固件头部
struct fw_header {
    u32 magic;                   // 魔数 (0x4D544B46)
    u32 version;                 // 版本号
    u32 chip_id;                 // 芯片 ID
    u32 build_date;              // 编译日期
    u32 fw_len;                  // 固件长度
    u32 crc;                     // CRC 校验
    u8 reserved[8];
} __packed;
```

#### 4.3.5 固件日志收集

驱动支持收集固件日志用于调试：

```c
// 固件日志配置
int mcu_fw_log_2_host(struct hw_dev *dev, 
                          u8 ctrl,      // 控制：开启/关闭
                          int dest)     // 目标 MCU
{
    // 发送命令到 MCU
    // MCU 将日志通过事件发送到 Host
}

// 固件日志事件处理
static void mcu_rx_fw_log_event(struct hw_dev *dev,
                                     struct sk_buff *skb)
{
    // 解析固件日志
    // 输出到 dmesg 或文件
}
```

**日志级别**:
- ERROR: 错误信息
- WARN: 警告信息
- INFO: 一般信息
- DEBUG: 调试信息
- TRACE: 跟踪信息

#### 4.3.6 命令队列管理

```c
// MCU 命令队列
struct mcu_ctrl {
    struct sk_buff_head tx_q;        // 发送队列
    struct sk_buff_head res_q;       // 响应队列
    wait_queue_head_t wait;          // 等待队列
    spinlock_t lock;                 // 队列锁
    u16 msg_seq;                     // 消息序列号
    enum mcu_state state;        // MCU 状态
};

// 命令发送流程
1. 分配 SKB
2. 填充命令头部和数据
3. 加入 tx_q
4. 触发 DMA 传输
5. 如果需要响应，等待 res_q
6. 超时处理
```

#### 4.3.7 事件队列管理

```c
// 事件处理
static void mcu_rx_event(struct hw_dev *dev,
                             struct sk_buff *skb,
                             u32 mcu_type)
{
    struct mcu_ctrl *mcu = &dev->mcu;
    
    // 解析事件头部
    // 根据事件类型分发
    switch (event_type) {
    case MCU_EVENT_CMD_RESULT:
        // 命令响应，加入 res_q
        skb_queue_tail(&mcu->res_q, skb);
        wake_up(&mcu->wait);
        break;
        
    case MCU_EVENT_TX_DONE:
        // TX 完成事件
        mcu_tx_done_event(dev, skb);
        break;
        
    case MCU_EVENT_FW_LOG:
        // 固件日志
        mcu_rx_fw_log_event(dev, skb);
        break;
        
    // ... 更多事件类型
    }
}
```



---

## 5. 硬件加速技术

### 5.1 WED (Wireless Ethernet Dispatch) 加速

#### 5.1.1 WED 架构概述

WED 是 MediaTek 的硬件加速引擎，用于卸载 WiFi 数据包处理到专用硬件。

```
┌─────────────────────────────────────────────┐
│  Linux 网络栈                                │
└─────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────┐
│  WED (Wireless Ethernet Dispatch)           │
│  ┌─────────────────────────────────────┐   │
│  │  TX Path Offload                     │   │
│  │  - 以太网 → 802.11 转换              │   │
│  │  - TXD 生成                          │   │
│  │  - QoS 处理                          │   │
│  └─────────────────────────────────────┘   │
│  ┌─────────────────────────────────────┐   │
│  │  RX Path Offload                     │   │
│  │  - 802.11 → 以太网转换               │   │
│  │  - RXD 解析                          │   │
│  │  - 重排序                            │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────┐
│  WiFi 驱动 (wlan_hwifi)                     │
└─────────────────────────────────────────────┘
```

**文件**: `wlan_hwifi/bus/wed.c`, `wlan_hwifi/bus/wed.h`

#### 5.1.2 WED TX Offload

**TX 路径优化**:
```
传统路径:
  网络栈 → 驱动 → TXD 生成 → DMA → 硬件

WED 加速路径:
  网络栈 → WED → TXD 生成 (硬件) → DMA → 硬件
  
性能提升: 减少 CPU 负载 50-70%
```

**关键特性**:
- 硬件 TXD 生成
- 自动 QoS 映射
- 零拷贝传输
- 批量处理

```c
// WED TX 配置
struct wed_tx_cfg {
    u32 tx_ring_base;            // TX Ring 基地址
    u32 tx_ring_size;            // TX Ring 大小
    u32 token_start;             // Token 起始 ID
    u32 token_size;              // Token 数量
    bool offload_enable;         // 是否启用卸载
};

// WED TX 初始化
int wed_tx_init(struct wed_device *wed,
                    struct wed_tx_cfg *cfg)
{
    // 配置 TX Ring
    // 配置 Token 池
    // 启用 TX Offload
}
```

#### 5.1.3 WED RX Offload

**RX 路径优化**:
```
传统路径:
  硬件 → DMA → 驱动 → RXD 解析 → 重排序 → 网络栈

WED 加速路径:
  硬件 → DMA → WED → RXD 解析 (硬件) → 重排序 (硬件) → 网络栈
  
性能提升: 减少延迟 30-50%
```

**关键特性**:
- 硬件 RXD 解析
- 硬件重排序 (RRO)
- 直接内存访问
- NAPI 集成

```c
// WED RX 配置
struct wed_rx_cfg {
    u32 rx_ring_base;            // RX Ring 基地址
    u32 rx_ring_size;            // RX Ring 大小
    u32 reorder_buf_base;        // 重排序缓冲区基地址
    u32 reorder_buf_size;        // 重排序缓冲区大小
    bool rro_enable;             // 是否启用 RRO
};
```

#### 5.1.4 WED 与 NPU 集成

WED 可以与网络处理器 (NPU) 集成，进一步提升性能：

```
┌─────────────────────────────────────────────┐
│  NPU (Network Processing Unit)              │
│  - 包分类                                    │
│  - 流量整形                                  │
│  - NAT/路由                                  │
└─────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────┐
│  WED (Wireless Ethernet Dispatch)           │
└─────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────┐
│  WiFi 驱动                                   │
└─────────────────────────────────────────────┘
```

**优势**:
- 完整的硬件加速路径
- 最小化 CPU 干预
- 支持高吞吐量场景 (10Gbps+)
- 低延迟 (<1ms)

### 5.2 RRO (RX Reordering Offload)

#### 5.2.1 RRO 架构

RRO 将 RX 重排序卸载到硬件，减少 CPU 负载。

**文件**: `wlan_hwifi/bus/rro.c`, `wlan_hwifi/bus/rro.h`

```c
// RRO 配置
struct rro_cfg {
    u32 reorder_buf_base;        // 重排序缓冲区基地址
    u32 reorder_buf_size;        // 缓冲区大小
    u32 max_win_size;            // 最大窗口大小
    u32 timeout;                 // 超时时间 (ms)
    bool enable;                 // 是否启用
};

// RRO 初始化
int rro_init(struct hw_dev *dev,
                 struct rro_cfg *cfg)
{
    // 分配重排序缓冲区
    // 配置硬件参数
    // 启用 RRO
}
```

#### 5.2.2 RRO 工作流程

```
1. 接收 AMPDU 包
   ↓
2. 硬件检查序列号
   ↓
3. 判断是否需要重排序
   ├─ 顺序正确 → 直接提交
   └─ 乱序 → 放入重排序缓冲区
   ↓
4. 等待缺失的包
   ├─ 收到 → 按序提交
   └─ 超时 → 提交已有的包
   ↓
5. 更新 BA 窗口
```

**性能对比**:
```
软件重排序:
- CPU 使用率: 30-40%
- 延迟: 2-5ms
- 吞吐量: 受 CPU 限制

硬件重排序 (RRO):
- CPU 使用率: 5-10%
- 延迟: <1ms
- 吞吐量: 接近线速
```

#### 5.2.3 RRO 与 WO MCU 协同

```
┌─────────────────────────────────────────────┐
│  WO MCU (WiFi Offload)                      │
│  - BA 会话管理                               │
│  - 重排序策略                                │
│  - 超时处理                                  │
└─────────────────────────────────────────────┘
                    ↕ (控制)
┌─────────────────────────────────────────────┐
│  RRO 硬件引擎                                │
│  - 序列号检查                                │
│  - 缓冲区管理                                │
│  - 按序提交                                  │
└─────────────────────────────────────────────┘
```

**协同工作**:
1. WO MCU 管理 BA 会话
2. RRO 硬件执行重排序
3. WO MCU 处理异常情况
4. 驱动监控整体状态

### 5.3 性能优化总结

#### 5.3.1 硬件加速效果

| 场景 | 无加速 | WED | WED+RRO | WED+RRO+NPU |
|------|--------|-----|---------|-------------|
| 吞吐量 | 2Gbps | 5Gbps | 8Gbps | 10Gbps+ |
| CPU 使用率 | 80% | 40% | 20% | 10% |
| 延迟 | 5ms | 2ms | 1ms | <1ms |

#### 5.3.2 适用场景

**WED 适用于**:
- 高吞吐量需求 (>2Gbps)
- 多用户并发
- 路由器/网关设备

**RRO 适用于**:
- AMPDU 聚合场景
- 低延迟需求
- 高速率连接 (WiFi 6/7)

**NPU 集成适用于**:
- 企业级设备
- 复杂网络拓扑
- 需要硬件 NAT/路由

---

## 6. 总线层详细分析

### 6.1 PCI/PCIe 总线

#### 6.1.1 PCI 配置空间

```c
// PCI 配置空间读取
static int pci_probe(struct pci_dev *pdev,
                     const struct pci_device_id *id)
{
    // 1. 启用 PCI 设备
    ret = pcim_enable_device(pdev);
    
    // 2. 映射 BAR 空间
    ret = pcim_iomap_regions(pdev, BIT(0), pci_name(pdev));
    
    // 3. 设置为总线主控
    pci_set_master(pdev);
    
    // 4. 配置 DMA 掩码
    dma_set_mask(&pdev->dev, DMA_BIT_MASK(32));
    dma_set_coherent_mask(&pdev->dev, DMA_BIT_MASK(32));
    
    // 5. 获取 IO 映射
    iomap = pcim_iomap_table(pdev);
    trans->regs = iomap[0];  // BAR0 寄存器基地址
}
```

#### 6.1.2 MSI/MSI-X 中断

```c
// MSI-X 中断配置
static int pci_enable_msi(struct pci_dev *pdev, int nvec)
{
    int ret;
    
    // 尝试 MSI-X
    ret = pci_alloc_irq_vectors(pdev, nvec, nvec, 
                                 PCI_IRQ_MSIX);
    if (ret > 0)
        return ret;
    
    // 回退到 MSI
    ret = pci_alloc_irq_vectors(pdev, 1, nvec,
                                 PCI_IRQ_MSI);
    if (ret > 0)
        return ret;
    
    // 回退到传统中断
    return pci_alloc_irq_vectors(pdev, 1, 1,
                                  PCI_IRQ_LEGACY);
}
```

**中断向量分配**:
```
Vector 0: TX 完成中断
Vector 1: RX 数据中断
Vector 2: RX 事件中断
Vector 3: 错误中断
Vector 4-7: 预留
```

#### 6.1.3 PCIe 代数和带宽

```c
// 检测 PCIe 代数和通道数
static int pci_get_gen_width(struct pci_dev *pdev,
                             enum pcie_gen *gen,
                             enum pcie_link_width *width)
{
    enum pci_bus_speed speed;
    
    pcie_bandwidth_available(pdev, NULL, &speed, width);
    
    switch (speed) {
    case PCIE_GEN1:  // 2.5 GT/s
        *gen = PCIE_GEN1;
        break;
    case PCIE_GEN2:  // 5 GT/s
        *gen = PCIE_GEN2;
        break;
    case PCIE_GEN3:  // 8 GT/s
        *gen = PCIE_GEN3;
        break;
    case PCIE_GEN4:  // 16 GT/s
        *gen = PCIE_GEN4;
        break;
    }
}
```

**带宽计算**:
```
PCIe Gen1 x1: 250 MB/s
PCIe Gen2 x1: 500 MB/s
PCIe Gen3 x1: 1 GB/s
PCIe Gen3 x2: 2 GB/s
PCIe Gen3 x4: 4 GB/s
```

### 6.2 DMA 映射

#### 6.2.1 一致性 DMA vs 流式 DMA

```c
// 一致性 DMA (用于描述符)
void *virt = dma_alloc_coherent(&pdev->dev, size,
                                &dma_addr, GFP_KERNEL);

// 流式 DMA (用于数据包)
dma_addr_t dma_addr = dma_map_single(&pdev->dev, data,
                                     size, DMA_TO_DEVICE);
```

**区别**:
- **一致性 DMA**: CPU 和设备看到相同的数据，无需同步，但性能较低
- **流式 DMA**: 需要显式同步，但性能更高

#### 6.2.2 DMA 方向

```c
enum dma_data_direction {
    DMA_BIDIRECTIONAL = 0,  // 双向
    DMA_TO_DEVICE = 1,      // CPU → 设备 (TX)
    DMA_FROM_DEVICE = 2,    // 设备 → CPU (RX)
    DMA_NONE = 3,           // 无 DMA
};
```

---

**文档更新**: Part 2 已补充 WED、RRO、NPU 集成、PCI 详细信息等内容
