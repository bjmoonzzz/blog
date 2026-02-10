# WiFi 驱动架构全面分析指南 (第三部分)

## 5. 无线收发包路径

### 5.1 TX (发送) 数据路径详解

#### 5.1.1 完整 TX 流程
```
┌─────────────────────────────────────────────────────────┐
│ 1. 应用层数据包                                          │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 2. 内核网络栈 (TCP/IP 封装)                             │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 3. net_device->ndo_start_xmit()                         │
│    文件: mt_wifi/os/linux/rt_main_dev.c                 │
│    函数: rt28xx_send_packets()                          │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 4. 协议栈层处理                                          │
│    文件: mt_wifi/common/cmm_data.c                      │
│    - RTMP_SendPackets()                                 │
│    - APSendPacket() / STASendPacket()                   │
│    - 查找目标 STA (WCID)                                │
│    - 选择 TID/AC 队列                                   │
│    - 加密处理 (WEP/TKIP/AES)                            │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 5. MAC 接口层                                            │
│    文件: wlan_hwifi/mac_ops.c                           │
│    - mac_ops->tx_check_resource()  // 检查资源      │
│    - mac_ops->tx_data()            // 提交数据      │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 6. Token 管理                                            │
│    文件: wlan_hwifi/tk_mgmt.c                           │
│    - tk_request()                  // 申请 Token    │
│    - 分配 TXD/TXP 缓冲区                                │
│    - 建立 Token 映射关系                                │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 7. TXD/TXP 填充                                          │
│    文件: wlan_hwifi/hw_ops.c                            │
│    - hw_ops->write_txd()           // 填充 TXD      │
│    - hw_ops->write_txp()           // 填充 TXP      │
│                                                          │
│    TXD (TX Descriptor): 硬件描述符                       │
│    - 包长度、目标地址、加密信息等                        │
│                                                          │
│    TXP (TX Payload): 数据负载                            │
│    - 802.11 帧头 + 数据                                 │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 8. 总线 DMA 传输                                         │
│    文件: wlan_hwifi/bus.c                               │
│    - bus_dma_ops->tx_data_queue()                   │
│    - 将 TXD/TXP 写入 TX Ring                            │
│    - 触发硬件 DMA                                        │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 9. 硬件 MAC 处理                                         │
│    - 读取 TXD/TXP                                        │
│    - 添加 FCS                                            │
│    - 发送到 PHY                                          │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 10. TX 完成中断                                          │
│     - 硬件产生 TX Done 中断                              │
│     - bus_tx_done_handler()                         │
│     - 释放 Token                                         │
│     - 回调 tx_status()                                   │
└─────────────────────────────────────────────────────────┘
```

#### 5.1.2 关键数据结构

**TX Token 结构**:
```c
// wlan_hwifi/tk_mgmt.h
struct tk_entry {
    struct list_head list;           // 链表节点
    struct sk_buff_head tx_q;        // TX 队列
    struct idr_entry sid;        // Token ID
    dma_addr_t dma_addr;             // TXD DMA 地址
    dma_addr_t pkt_pa;               // 数据包物理地址
    u8 *txd_ptr;                     // TXD 虚拟地址
    struct hw_sta *sta;          // 关联的 STA
    u16 wcid;                        // WCID (Wireless Client ID)
    u8 bss_idx;                      // BSS 索引
    u8 band_idx;                     // 频段索引
    u8 tid;                          // TID (Traffic Identifier)
    u8 hf:2;                         // 头部格式
    u8 rdy:1;                        // Token 就绪标志
    u8 is_fixed_rate:1;              // 固定速率
    u8 is_prior:1;                   // 优先级
    u8 is_sp:1;                      // Service Period
    u8 amsdu_en:1;                   // AMSDU 使能
    // ... 更多字段
};

// Token 管理器
struct tk_mgmt {
    struct idr_mgmt idrm;        // IDR 管理器
    struct list_head free_list;      // 空闲 Token 列表
    spinlock_t lock;                 // 保护锁
    u32 total_cnt;                   // 总 Token 数
    u32 free_cnt;                    // 空闲 Token 数
    struct tk_dbg dbg;           // 调试统计
};
```

**TXD 结构** (以 FMAC 为例):
```c
// wlan_hwifi/chips/fmac_connac.c
// TXD 格式 (硬件描述符)
struct txd_fmac {
    u32 txd[8];  // 8 个 DWORD (32 字节)
    
    // txd[0]: 包类型、队列索引、长度等
    // txd[1]: WCID、子类型、头部格式等
    // txd[2]: 子类型、加密信息、功率等
    // txd[3]: BA 控制、序列号等
    // txd[4]: PID、TX 状态等
    // txd[5-7]: 扩展字段
};

// TXD 字段定义
#define MT_TXD0_TX_BYTES        GENMASK(15, 0)
#define MT_TXD0_PKT_FMT         GENMASK(21, 20)
#define MT_TXD0_Q_IDX           GENMASK(31, 25)

#define MT_TXD1_WLAN_IDX        GENMASK(7, 0)
#define MT_TXD1_HDR_FORMAT      GENMASK(17, 16)
#define MT_TXD1_HDR_INFO        GENMASK(20, 19)
```

#### 5.1.3 零拷贝技术

驱动使用零拷贝技术减少内存拷贝：

```c
// 零拷贝 TX 流程
1. SKB 直接映射到 DMA
   dma_addr = dma_map_single(dev, skb->data, 
                             skb->len, DMA_TO_DEVICE);

2. TXD 指向 SKB 的 DMA 地址
   txd->buf_addr = dma_addr;

3. 硬件直接从 SKB 读取数据

4. TX 完成后解除映射
   dma_unmap_single(dev, dma_addr, 
                    skb->len, DMA_TO_DEVICE);
```

**优势**:
- 减少 CPU 拷贝开销
- 降低内存带宽占用
- 提高吞吐量

#### 5.1.4 TX Ring 结构

```c
// TX Ring 描述符
struct tx_ring {
    struct tx_desc *desc;        // 描述符数组
    dma_addr_t desc_dma;             // 描述符 DMA 地址
    u32 desc_size;                   // 描述符数量
    u32 head;                        // 头指针
    u32 tail;                        // 尾指针
    u32 queued;                      // 已排队数量
    spinlock_t lock;                 // 保护锁
};

// TX 描述符
struct tx_desc {
    __le32 buf_addr;                 // 缓冲区地址
    __le32 info;                     // 控制信息
    __le32 token;                    // Token ID
    __le32 reserved;
} __packed;
```

**TX Ring 操作**:
```c
// 入队
static int tx_ring_enqueue(struct tx_ring *ring,
                          struct tk_entry *tk_entry)
{
    u32 idx = ring->tail;
    struct tx_desc *desc = &ring->desc[idx];
    
    // 填充描述符
    desc->buf_addr = cpu_to_le32(tk_entry->dma_addr);
    desc->token = cpu_to_le32(tk_entry->sid.idx);
    
    // 更新尾指针
    ring->tail = (ring->tail + 1) % ring->desc_size;
    ring->queued++;
    
    // 通知硬件
    writel(ring->tail, ring->hw_tail_ptr);
}

// 出队
static void tx_ring_dequeue(struct tx_ring *ring)
{
    u32 idx = ring->head;
    
    // 更新头指针
    ring->head = (ring->head + 1) % ring->desc_size;
    ring->queued--;
}
```

#### 5.1.5 TX 队列管理

**WMM 队列映射**:
```c
// 用户优先级到 AC 的映射
UCHAR WMM_UP2AC_MAP[8] = {
    QID_AC_BE,  // UP 0 → AC_BE
    QID_AC_BK,  // UP 1 → AC_BK
    QID_AC_BK,  // UP 2 → AC_BK
    QID_AC_BE,  // UP 3 → AC_BE
    QID_AC_VI,  // UP 4 → AC_VI
    QID_AC_VI,  // UP 5 → AC_VI
    QID_AC_VO,  // UP 6 → AC_VO
    QID_AC_VO,  // UP 7 → AC_VO
};

// AC 队列优先级
enum {
    QID_AC_BK = 0,  // Background (最低)
    QID_AC_BE = 1,  // Best Effort
    QID_AC_VI = 2,  // Video
    QID_AC_VO = 3,  // Voice (最高)
};
```

**队列选择流程**:
```
数据包到达
  ↓
提取 TOS/DSCP
  ↓
映射到 UP (0-7)
  ↓
映射到 AC (BE/BK/VI/VO)
  ↓
选择对应的 TX 队列
  ↓
入队并调度发送
```

### 5.2 RX (接收) 数据路径详解

#### 5.2.1 完整 RX 流程
```
┌─────────────────────────────────────────────────────────┐
│ 1. 硬件 PHY 接收无线信号                                 │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 2. 硬件 MAC 处理                                         │
│    - 解调、解扰                                          │
│    - FCS 校验                                            │
│    - 生成 RXD (RX Descriptor)                           │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 3. DMA 传输到内存                                        │
│    - 硬件将 RXD + 数据写入 RX Ring                       │
│    - 产生 RX 中断                                        │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 4. 中断处理                                              │
│    文件: wlan_hwifi/bus.c                               │
│    - bus_irq_handler()         // 中断入口          │
│    - napi_schedule()               // 调度 NAPI         │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 5. NAPI 轮询处理                                         │
│    - bus_rx_poll()             // NAPI poll 函数    │
│    - bus_rx_process()          // 处理 RX Ring      │
│    - 从 RX Ring 读取 RXD + 数据                         │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 6. RXD 解析                                              │
│    文件: wlan_hwifi/hw_ops.c                            │
│    - hw_ops->rx_pkt()                               │
│    - 解析 RXD 字段:                                      │
│      * WCID (发送者)                                     │
│      * BSS Index                                         │
│      * 加密状态                                          │
│      * 信号强度 (RSSI)                                   │
│      * 速率信息                                          │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 7. MAC 接口层                                            │
│    文件: wlan_hwifi/mac_if.c                            │
│    - interface_ops->rx_pkt()                        │
│    - 将数据包传递给协议栈层                              │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 8. 协议栈层处理                                          │
│    文件: mt_wifi/common/cmm_data.c                      │
│    - APHandleRxDonePacket()                             │
│    - 解密处理 (如需要)                                   │
│    - 重排序处理 (BA)                                     │
│    - 统计更新                                            │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 9. 帧类型分发                                            │
│    - 管理帧 → APHandleRxMgmtFrame()                     │
│    - 控制帧 → APHandleRxControlFrame()                  │
│    - 数据帧 → APHandleRxDataFrame()                     │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 10. 数据帧处理                                           │
│     - 802.11 → 802.3 转换                               │
│     - announce_802_3_packet()                           │
│     - 提交到内核网络栈                                   │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 11. 内核网络栈                                           │
│     - netif_rx() / netif_receive_skb()                  │
│     - TCP/IP 协议栈处理                                  │
│     - 传递给应用层                                       │
└─────────────────────────────────────────────────────────┘
```

#### 5.2.2 RXD 结构
```c
// RX Descriptor 包含的信息
struct rxd_info {
    u16 rx_byte_count;      // 接收字节数
    u16 pkt_type;           // 包类型 (数据/管理/控制)
    u8 wcid;                // 发送者 WCID
    u8 bss_idx;             // BSS 索引
    u8 key_id;              // 密钥 ID
    u8 cipher_err;          // 加密错误标志
    u8 tkip_mic_err;        // TKIP MIC 错误
    s8 rssi[4];             // RSSI (每天线)
    u8 snr[4];              // SNR (每天线)
    u16 rate;               // 速率
    u8 bw;                  // 带宽
    u8 gi;                  // Guard Interval
    // ... 更多字段
};
```



### 5.2 RX (接收) 数据路径详解

#### 5.2.1 完整 RX 流程
```
┌─────────────────────────────────────────────────────────┐
│ 1. 硬件 PHY 接收无线信号                                 │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 2. 硬件 MAC 处理                                         │
│    - 解调、解扰                                          │
│    - FCS 校验                                            │
│    - 生成 RXD (RX Descriptor)                           │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 3. DMA 传输到内存                                        │
│    - 硬件将 RXD + 数据写入 RX Ring                       │
│    - 产生 RX 中断                                        │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 4. 中断处理                                              │
│    文件: wlan_hwifi/bus.c                               │
│    - bus_irq_handler()         // 中断入口          │
│    - napi_schedule()               // 调度 NAPI         │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 5. NAPI 轮询处理                                         │
│    - bus_rx_poll()             // NAPI poll 函数    │
│    - bus_rx_process()          // 处理 RX Ring      │
│    - 从 RX Ring 读取 RXD + 数据                         │
│    - 批量处理 (budget 限制)                             │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 6. RXD 解析                                              │
│    文件: wlan_hwifi/hw_ops.c                            │
│    - hw_ops->rx_pkt()                               │
│    - 解析 RXD 字段:                                      │
│      * WCID (发送者)                                     │
│      * BSS Index                                         │
│      * 加密状态                                          │
│      * 信号强度 (RSSI)                                   │
│      * 速率信息                                          │
│      * 错误标志                                          │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 7. MAC 接口层                                            │
│    文件: wlan_hwifi/mac_if.c                            │
│    - interface_ops->rx_pkt()                        │
│    - 将数据包传递给协议栈层                              │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 8. 协议栈层处理                                          │
│    文件: mt_wifi/common/cmm_data.c                      │
│    - APHandleRxDonePacket()                             │
│    - 解密处理 (如需要)                                   │
│    - 重排序处理 (BA)                                     │
│    - 统计更新                                            │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 9. 帧类型分发                                            │
│    - 管理帧 → APHandleRxMgmtFrame()                     │
│    - 控制帧 → APHandleRxControlFrame()                  │
│    - 数据帧 → APHandleRxDataFrame()                     │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 10. 数据帧处理                                           │
│     - 802.11 → 802.3 转换                               │
│     - announce_802_3_packet()                           │
│     - 提交到内核网络栈                                   │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 11. 内核网络栈                                           │
│     - netif_rx() / netif_receive_skb()                  │
│     - TCP/IP 协议栈处理                                  │
│     - 传递给应用层                                       │
└─────────────────────────────────────────────────────────┘
```

#### 5.2.2 RX Ring 结构

```c
// RX Ring 描述符
struct rx_ring {
    struct rx_desc *desc;        // 描述符数组
    dma_addr_t desc_dma;             // 描述符 DMA 地址
    void **buf;                      // 缓冲区指针数组
    u32 desc_size;                   // 描述符数量
    u32 buf_size;                    // 每个缓冲区大小
    u32 head;                        // 头指针 (硬件)
    u32 tail;                        // 尾指针 (软件)
    spinlock_t lock;                 // 保护锁
};

// RX 描述符
struct rx_desc {
    __le32 buf_addr;                 // 缓冲区 DMA 地址
    __le32 info;                     // 控制信息
    __le32 rxd[6];                   // RXD 字段
} __packed;
```

**RX Ring 操作**:
```c
// 初始化 RX Ring
static int rx_ring_init(struct rx_ring *ring, u32 size)
{
    int i;
    
    // 分配描述符
    ring->desc = dma_alloc_coherent(dev, 
                                    size * sizeof(*ring->desc),
                                    &ring->desc_dma, GFP_KERNEL);
    
    // 分配缓冲区
    ring->buf = kcalloc(size, sizeof(*ring->buf), GFP_KERNEL);
    
    // 为每个描述符分配 SKB
    for (i = 0; i < size; i++) {
        struct sk_buff *skb;
        dma_addr_t dma_addr;
        
        skb = dev_alloc_skb(ring->buf_size);
        dma_addr = dma_map_single(dev, skb->data,
                                  ring->buf_size,
                                  DMA_FROM_DEVICE);
        
        ring->buf[i] = skb;
        ring->desc[i].buf_addr = cpu_to_le32(dma_addr);
    }
    
    ring->head = 0;
    ring->tail = 0;
}

// 补充 RX 缓冲区
static void rx_ring_refill(struct rx_ring *ring)
{
    while (ring->tail != ring->head) {
        u32 idx = ring->tail;
        struct sk_buff *skb;
        dma_addr_t dma_addr;
        
        // 分配新的 SKB
        skb = dev_alloc_skb(ring->buf_size);
        if (!skb)
            break;
        
        // DMA 映射
        dma_addr = dma_map_single(dev, skb->data,
                                  ring->buf_size,
                                  DMA_FROM_DEVICE);
        
        // 更新描述符
        ring->buf[idx] = skb;
        ring->desc[idx].buf_addr = cpu_to_le32(dma_addr);
        
        // 更新尾指针
        ring->tail = (ring->tail + 1) % ring->desc_size;
    }
}
```

#### 5.2.3 NAPI 轮询机制

**NAPI 结构**:
```c
// NAPI 实例
struct napi {
    struct napi_struct napi;         // NAPI 结构
    struct hw_dev *dev;          // 设备指针
    struct rx_ring *ring;        // RX Ring
    int budget;                      // 预算 (每次最多处理的包数)
};

// NAPI 初始化
static void napi_init(struct hw_dev *dev)
{
    struct napi *mnapi = &dev->napi;
    
    netif_napi_add(dev->netdev, &mnapi->napi,
                   napi_poll, NAPI_POLL_WEIGHT);
    napi_enable(&mnapi->napi);
}
```

**NAPI Poll 函数**:
```c
static int napi_poll(struct napi_struct *napi, int budget)
{
    struct napi *mnapi = container_of(napi, struct napi, napi);
    struct hw_dev *dev = mnapi->dev;
    int work_done = 0;
    
    // 处理 RX 包，最多 budget 个
    work_done = bus_rx_process(dev, budget);
    
    // 如果处理完所有包，重新启用中断
    if (work_done < budget) {
        napi_complete(napi);
        bus_enable_irq(dev);
    }
    
    return work_done;
}
```

**NAPI 优势**:
- **减少中断开销**: 批量处理多个包
- **提高吞吐量**: 减少上下文切换
- **防止活锁**: budget 限制防止 RX 占用过多 CPU
- **公平性**: 与其他 NAPI 设备共享 CPU

**NAPI 调优**:
```bash
# 调整 NAPI weight (每次轮询处理的包数)
echo 64 > /sys/class/net/ra0/napi_weight

# 查看 NAPI 统计
cat /proc/net/softnet_stat
```

#### 5.2.4 RXD 结构详解

```c
// RX Descriptor 包含的信息
struct rxd_info {
    // 基本信息
    u16 rx_byte_count;      // 接收字节数
    u16 pkt_type;           // 包类型 (数据/管理/控制)
    u8 wcid;                // 发送者 WCID
    u8 bss_idx;             // BSS 索引
    u8 key_id;              // 密钥 ID
    
    // 错误标志
    u8 cipher_err:1;        // 加密错误
    u8 tkip_mic_err:1;      // TKIP MIC 错误
    u8 icv_err:1;           // ICV 错误
    u8 fcs_err:1;           // FCS 错误
    u8 length_err:1;        // 长度错误
    
    // 信号质量
    s8 rssi[4];             // RSSI (每天线)
    u8 snr[4];              // SNR (每天线)
    u8 rcpi;                // RCPI
    
    // 速率信息
    u16 rate;               // 速率 (MCS/VHT/HE/EHT)
    u8 bw;                  // 带宽 (20/40/80/160/320MHz)
    u8 gi;                  // Guard Interval
    u8 nss;                 // 空间流数量
    u8 stbc;                // STBC
    u8 ldpc;                // LDPC
    
    // 时间戳
    u32 timestamp;          // 接收时间戳
    
    // 其他
    u8 amsdu:1;             // AMSDU 标志
    u8 more_data:1;         // More Data 标志
    u8 eosp:1;              // EOSP 标志
    u16 seq_num;            // 序列号
    u8 tid;                 // TID
};
```

**RXD 解析示例**:
```c
static void parse_rxd(struct hw_dev *dev,
                     struct rx_desc *desc,
                     struct rxd_info *info)
{
    u32 *rxd = desc->rxd;
    
    // 解析基本信息
    info->rx_byte_count = FIELD_GET(RXD0_RX_BYTE_COUNT, rxd[0]);
    info->pkt_type = FIELD_GET(RXD0_PKT_TYPE, rxd[0]);
    info->wcid = FIELD_GET(RXD1_WLAN_IDX, rxd[1]);
    info->bss_idx = FIELD_GET(RXD1_BSS_IDX, rxd[1]);
    
    // 解析错误标志
    info->cipher_err = FIELD_GET(RXD2_CIPHER_ERR, rxd[2]);
    info->fcs_err = FIELD_GET(RXD2_FCS_ERR, rxd[2]);
    
    // 解析信号质量
    info->rssi[0] = FIELD_GET(RXD3_RSSI0, rxd[3]);
    info->rssi[1] = FIELD_GET(RXD3_RSSI1, rxd[3]);
    
    // 解析速率信息
    info->rate = FIELD_GET(RXD4_RATE, rxd[4]);
    info->bw = FIELD_GET(RXD4_BW, rxd[4]);
    info->gi = FIELD_GET(RXD4_GI, rxd[4]);
}
```

#### 5.2.5 内存池设计

为了提高性能，驱动使用内存池预分配 SKB：

```c
// SKB 内存池
struct skb_pool {
    struct sk_buff_head free_list;   // 空闲 SKB 列表
    spinlock_t lock;                 // 保护锁
    u32 pool_size;                   // 池大小
    u32 buf_size;                    // SKB 大小
    u32 free_cnt;                    // 空闲数量
    u32 alloc_cnt;                   // 分配计数
    u32 free_cnt_stat;               // 释放计数
};

// 初始化内存池
static int skb_pool_init(struct skb_pool *pool,
                        u32 size, u32 buf_size)
{
    int i;
    
    skb_queue_head_init(&pool->free_list);
    spin_lock_init(&pool->lock);
    pool->pool_size = size;
    pool->buf_size = buf_size;
    
    // 预分配 SKB
    for (i = 0; i < size; i++) {
        struct sk_buff *skb;
        
        skb = dev_alloc_skb(buf_size);
        if (!skb)
            break;
        
        skb_queue_tail(&pool->free_list, skb);
        pool->free_cnt++;
    }
    
    return 0;
}

// 从池中分配 SKB
static struct sk_buff *skb_pool_alloc(struct skb_pool *pool)
{
    struct sk_buff *skb;
    unsigned long flags;
    
    spin_lock_irqsave(&pool->lock, flags);
    
    skb = __skb_dequeue(&pool->free_list);
    if (skb) {
        pool->free_cnt--;
        pool->alloc_cnt++;
    }
    
    spin_unlock_irqrestore(&pool->lock, flags);
    
    // 如果池为空，动态分配
    if (!skb)
        skb = dev_alloc_skb(pool->buf_size);
    
    return skb;
}

// 释放 SKB 到池
static void skb_pool_free(struct skb_pool *pool,
                         struct sk_buff *skb)
{
    unsigned long flags;
    
    // 重置 SKB
    skb_trim(skb, 0);
    skb_reset_tail_pointer(skb);
    
    spin_lock_irqsave(&pool->lock, flags);
    
    // 如果池未满，放回池中
    if (pool->free_cnt < pool->pool_size) {
        __skb_queue_tail(&pool->free_list, skb);
        pool->free_cnt++;
        pool->free_cnt_stat++;
        skb = NULL;
    }
    
    spin_unlock_irqrestore(&pool->lock, flags);
    
    // 如果池已满，释放 SKB
    if (skb)
        dev_kfree_skb(skb);
}
```

**内存池优势**:
- **减少分配开销**: 预分配避免频繁的内存分配
- **减少碎片**: 固定大小的缓冲区
- **提高缓存命中率**: 重用相同的内存区域
- **可预测的性能**: 避免内存分配失败

#### 5.2.6 SKB 管理

**SKB 结构**:
```c
struct sk_buff {
    // 数据指针
    unsigned char *head;             // 缓冲区起始
    unsigned char *data;             // 数据起始
    unsigned char *tail;             // 数据结束
    unsigned char *end;              // 缓冲区结束
    
    // 长度信息
    unsigned int len;                // 数据长度
    unsigned int data_len;           // 分片数据长度
    
    // 网络信息
    __be16 protocol;                 // 协议类型
    __u16 queue_mapping;             // 队列映射
    __u8 pkt_type;                   // 包类型
    
    // 设备信息
    struct net_device *dev;          // 网络设备
    
    // 时间戳
    ktime_t tstamp;                  // 时间戳
    
    // 控制块 (驱动私有数据)
    char cb[48];                     // 控制块
};
```

**SKB 操作**:
```c
// 分配 SKB
skb = dev_alloc_skb(size);

// 预留头部空间
skb_reserve(skb, headroom);

// 添加数据
skb_put(skb, len);

// 移除头部
skb_pull(skb, len);

// 移除尾部
skb_trim(skb, len);

// 克隆 SKB
skb2 = skb_clone(skb, GFP_ATOMIC);

// 释放 SKB
dev_kfree_skb(skb);
```

**驱动私有数据**:
```c
// 使用 SKB 控制块存储驱动私有数据
struct skb_cb {
    u32 token_id;                    // Token ID
    u16 wcid;                        // WCID
    u8 tid;                          // TID
    u8 flags;                        // 标志
};

#define SKB_CB(skb) ((struct skb_cb *)((skb)->cb))

// 设置私有数据
SKB_CB(skb)->token_id = token_id;
SKB_CB(skb)->wcid = wcid;

// 读取私有数据
token_id = SKB_CB(skb)->token_id;
```

---

## 6. 性能优化技术总结

### 6.1 CPU 优化

**中断亲和性**:
```bash
# 将 WiFi 中断绑定到 CPU 2-3
echo 0c > /proc/irq/<irq_num>/smp_affinity
```

**RPS/RFS 配置**:
```bash
# 启用 RPS (Receive Packet Steering)
echo f > /sys/class/net/ra0/queues/rx-0/rps_cpus

# 启用 RFS (Receive Flow Steering)
echo 32768 > /proc/sys/net/core/rps_sock_flow_entries
echo 2048 > /sys/class/net/ra0/queues/rx-0/rps_flow_cnt
```

### 6.2 内存优化

**技术清单**:
1. **零拷贝**: 减少内存拷贝
2. **内存池**: 预分配缓冲区
3. **DMA 直接访问**: 硬件直接读写内存
4. **缓存对齐**: 提高缓存命中率

### 6.3 吞吐量优化

**关键技术**:
1. **AMSDU/AMPDU 聚合**: 减少开销
2. **批量处理**: NAPI 批量处理
3. **硬件加速**: WED/RRO 卸载
4. **队列深度**: 增加 Ring 大小

### 6.4 延迟优化

**优化措施**:
1. **优先级队列**: VO/VI 队列优先
2. **快速路径**: 绕过复杂处理
3. **中断延迟**: 减少中断延迟
4. **NAPI 调优**: 调整 budget

---

**文档更新**: Part 3 已完成补充，新增 RX Ring、NAPI、内存池、SKB 管理等内容
