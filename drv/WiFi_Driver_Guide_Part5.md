# WiFi 驱动架构全面分析指南 (第五部分)

## 6.6 MLO (Multi-Link Operation) 支持

### 6.6.1 MLO 架构
**文件**: `wlan_hwifi/wsys.h`, `wlan_hwifi/mlo/`

MLO 是 WiFi 7 (802.11be) 的核心特性，允许设备同时在多个链路上通信。

```
┌─────────────────────────────────────────────┐
│  MLD (Multi-Link Device)                    │
│  ┌─────────────────────────────────────┐   │
│  │  MLD BSS Group                       │   │
│  │  ┌──────────┐  ┌──────────┐        │   │
│  │  │ Link 0   │  │ Link 1   │        │   │
│  │  │ (2.4GHz) │  │ (5GHz)   │        │   │
│  │  └──────────┘  └──────────┘        │   │
│  │  ┌──────────┐                       │   │
│  │  │ Link 2   │                       │   │
│  │  │ (6GHz)   │                       │   │
│  │  └──────────┘                       │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

#### 6.6.2 MLO 数据结构
```c
// wlan_hwifi/wsys.h

// MLD BSS 组
struct mld_bss_entry {
    u8 mld_type;                    // 单链路/多链路
    u8 ref_cnt;                     // 引用计数
    u32 remap_id;                   // 硬件重映射表 ID
    u32 mat_idx;                    // MAT 表索引
    u8 mld_addr[MAC_ADDR_LEN];      // MLD MAC 地址
    struct mutex mutex;             // 保护锁
    struct idr_entry mld_group_idx; // MLD 组索引
    struct hw_bss *mld_bss[MLD_LINK_MAX]; // 链路 BSS 数组
};

// MLD STA 条目
struct mld_sta_entry {
    u8 ref_cnt;                     // 引用计数
    u32 links[MLD_LINK_MAX];        // 每链路 LWTBL 索引
    u32 rx_pkt_cnt[MLD_LINK_MAX];   // 每链路接收包计数
    struct hw_sta *primary;     // 主 UWTBL
    struct hw_sta *secondary;   // 辅 UWTBL
    u32 setup_wcid;                 // Setup 链路 WCID
    u8 setup_band;                  // Setup 链路频段
    struct idr_entry *sys_idx;  // 系统索引
    struct mld_bss_entry *mld_bss; // 关联的 MLD BSS
    struct hw_sta *link_sta[MLD_LINK_MAX]; // 链路 STA 数组
};
```

#### 6.6.3 MLO 操作接口
```c
// wlan_hwifi/mac_ops.h

struct mac_ops {
    // MLD 管理
    int (*add_mld)(struct hw_dev *dev, 
                   struct bss_mld_cfg *mld_cfg);
    int (*remove_mld)(struct hw_dev *dev, 
                      u32 mld_group_idx);
    
    // 链路管理
    int (*mld_add_link)(struct hw_dev *dev, 
                        struct hw_bss *hw_bss, 
                        u32 mld_group_idx);
    int (*mld_remove_link)(struct hw_dev *dev, 
                           struct hw_bss *hw_bss);
};
```

#### 6.6.4 MLO 数据包处理
```
TX 路径 (MLO):
  应用数据包
    ↓
  选择链路 (基于 TID/QoS/链路状态)
    ↓
  添加 MLD 头部
    ↓
  在选定链路上发送

RX 路径 (MLO):
  从多个链路接收
    ↓
  识别 MLD STA
    ↓
  重排序 (跨链路)
    ↓
  提交到上层
```

### 6.7 组播 (Multicast) 处理

#### 6.7.1 组播架构
**文件**: `mt_wifi/common/igmp_snoop.c`

```c
// IGMP Snooping 支持
#ifdef IGMP_SNOOP_SUPPORT

// 组播过滤表
struct _MULTICAST_FILTER_TABLE_ENTRY {
    BOOLEAN Valid;
    UCHAR type;                     // 静态/动态
    UINT lastTime;                  // 最后更新时间
    PNET_DEV net_dev;               // 网络设备
    UCHAR Addr[MAC_ADDR_LEN];       // 组播 MAC 地址
    LIST_HEADER MemberList;         // 成员列表
    struct _MULTICAST_FILTER_TABLE_ENTRY *pNext;
};

// 组播成员
struct _MEMBER_ENTRY {
    struct _MEMBER_ENTRY *pNext;
    UCHAR Addr[MAC_ADDR_LEN];       // 成员 MAC 地址
    UCHAR IPAddr[4];                // IP 地址
};

#endif
```

#### 6.7.2 组播发送流程
```
组播数据包到达
  ↓
IgmpPktInfoQuery()                  // 查询 IGMP 信息
  ↓
MulticastFilterTableLookup()        // 查找组播表
  ↓
获取成员列表
  ↓
对每个成员:
  ├── 克隆数据包
  ├── 设置目标 WCID
  └── 发送单播
```

#### 6.7.3 IGMP Snooping
```c
// IGMP 报文处理
VOID IGMPSnooping(
    RTMP_ADAPTER *pAd,
    PUCHAR pDstMacAddr,
    PUCHAR pSrcMacAddr,
    PUCHAR pIpHeader,
    PNET_DEV pDev,
    UCHAR FromWhichBSSID)
{
    // 1. 解析 IGMP 报文类型
    //    - IGMP Join (0x16)
    //    - IGMP Leave (0x17)
    //    - IGMP Query (0x11)
    
    // 2. 更新组播过滤表
    switch (IgmpType) {
    case IGMP_V2_MEMBERSHIP_REPORT:
        // 添加成员到组播组
        MulticastFilterTableInsertEntry(...);
        break;
        
    case IGMP_LEAVE_GROUP:
        // 从组播组移除成员
        MulticastFilterTableDeleteEntry(...);
        break;
    }
}
```

### 6.8 4 地址转换 (4-Address Translation)

#### 6.8.1 4 地址模式概述
4 地址模式用于 WDS (Wireless Distribution System) 和 Repeater 场景。

**标准 3 地址帧**:
```
┌──────────┬──────────┬──────────┬──────────┬────────┐
│ Frame    │ Duration │ Address1 │ Address2 │Address3│
│ Control  │          │ (RA)     │ (TA)     │ (DA/SA)│
└──────────┴──────────┴──────────┴──────────┴────────┘
```

**4 地址帧**:
```
┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬────────┐
│ Frame    │ Duration │ Address1 │ Address2 │ Address3 │ Seq Ctrl │Address4│
│ Control  │          │ (RA)     │ (TA)     │ (DA)     │          │ (SA)   │
└──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴────────┘
```

#### 6.8.2 4 地址处理流程
**文件**: `mt_wifi/common/client_wds.c`, `mt_wifi/common/a4_conn.c`

```c
// TX 路径: 3 地址 → 4 地址
VOID CliWds_ProxyTabUpdate(
    RTMP_ADAPTER *pAd,
    USHORT Aid,
    PUCHAR pMac)
{
    // 1. 查找/创建 WDS 表项
    // 2. 更新 MAC 映射
    // 3. 设置 4 地址标志
}

// RX 路径: 4 地址 → 3 地址
VOID APHandleRxDataFrame_Wds(
    RTMP_ADAPTER *pAd,
    RX_BLK *pRxBlk)
{
    // 1. 检查 ToDS 和 FromDS 标志
    if (pRxBlk->FC->ToDs && pRxBlk->FC->FrDs) {
        // 这是 4 地址帧
        // 2. 提取 Address4 (SA)
        // 3. 更新 WDS 表
        // 4. 转换为 3 地址或以太网帧
    }
}
```

#### 6.8.3 A4 连接管理
```c
// A4 (4-Address) 连接表
struct _A4_CONNECT_ENTRY {
    BOOLEAN valid;
    UCHAR a4_apcli_idx;             // APCLI 索引
    UCHAR a4_wcid;                  // WCID
    UCHAR a4_addr[MAC_ADDR_LEN];    // 对端 MAC 地址
};

// A4 连接操作
VOID a4_add_entry(
    RTMP_ADAPTER *pAd,
    UCHAR apcli_idx,
    UCHAR wcid,
    PUCHAR addr)
{
    // 添加 A4 连接表项
}

VOID a4_del_entry(
    RTMP_ADAPTER *pAd,
    UCHAR apcli_idx,
    PUCHAR addr)
{
    // 删除 A4 连接表项
}
```

### 6.9 其他重要特性

#### 6.9.1 AMSDU (Aggregated MSDU)
**文件**: `mt_wifi/common/cmm_data.c`

```c
// AMSDU 聚合
VOID RTMPBuildAMSDU(
    RTMP_ADAPTER *pAd,
    struct wifi_dev *wdev,
    PNDIS_PACKET pPacket,
    UCHAR *pHeaderBufPtr,
    UINT *pSrcBufLen)
{
    // 1. 检查是否支持 AMSDU
    // 2. 添加 AMSDU 子帧头
    // 3. 聚合多个 MSDU
}

// AMSDU 解聚合
VOID deaggregate_AMSDU_announce(
    RTMP_ADAPTER *pAd,
    PNDIS_PACKET pPacket,
    PUCHAR pData,
    ULONG DataSize,
    UCHAR OpMode)
{
    // 1. 解析 AMSDU 子帧
    // 2. 提取每个 MSDU
    // 3. 分别提交到网络栈
}
```

#### 6.9.2 AMPDU (Aggregated MPDU)
**文件**: `mt_wifi/common/ba_action.c`

```c
// AMPDU 聚合在硬件层完成
// 驱动负责 BA 会话管理

// 重排序缓冲区
struct reordering_mpdu {
    struct reordering_mpdu *next;
    PNDIS_PACKET pPacket;
    int Sequence;
    BOOLEAN bAMSDU;
};

// 重排序处理
VOID ba_reordering_resource_init(
    RTMP_ADAPTER *pAd,
    int num)
{
    // 初始化重排序资源
}
```

#### 6.9.3 TIM (Traffic Indication Map)
**文件**: `mt_wifi/common/bcn.c`

```c
// TIM 更新
VOID APUpdateBeaconFrame(
    RTMP_ADAPTER *pAd,
    INT apidx)
{
    // 1. 检查 PS 队列
    // 2. 更新 TIM bitmap
    // 3. 设置 DTIM Count
    // 4. 更新 Beacon
}
```



---

## 6.10 MLO 深入解析

### 6.10.1 MLO 链路选择策略

**链路选择因素**:
```c
// 链路选择参数
struct mlo_link_selection {
    u8 link_id;                      // 链路 ID
    u8 band_idx;                     // 频段索引
    s8 rssi;                         // RSSI
    u8 channel_load;                 // 信道负载
    u16 available_bw;                // 可用带宽
    u32 throughput;                  // 吞吐量
    u32 latency;                     // 延迟
    u8 priority;                     // 优先级
    bool is_primary;                 // 是否主链路
};

// 链路选择算法
static u8 mlo_select_best_link(
    struct mld_sta_entry *mld_sta,
    u8 tid)
{
    struct mlo_link_selection links[MLD_LINK_MAX];
    u8 best_link = 0;
    u32 best_score = 0;
    int i;
    
    // 1. 收集所有链路信息
    for (i = 0; i < MLD_LINK_MAX; i++) {
        if (!mld_sta->link_sta[i])
            continue;
        
        collect_link_info(mld_sta, i, &links[i]);
    }
    
    // 2. 计算每个链路的得分
    for (i = 0; i < MLD_LINK_MAX; i++) {
        u32 score = 0;
        
        // RSSI 权重: 40%
        score += (links[i].rssi + 100) * 40;
        
        // 信道负载权重: 30%
        score += (100 - links[i].channel_load) * 30;
        
        // 可用带宽权重: 20%
        score += (links[i].available_bw / 10) * 20;
        
        // 延迟权重: 10%
        score += (1000 - links[i].latency) * 10;
        
        // 主链路加分
        if (links[i].is_primary)
            score += 1000;
        
        if (score > best_score) {
            best_score = score;
            best_link = i;
        }
    }
    
    return best_link;
}
```

**TID 到链路映射**:
```c
// TID-to-Link Mapping
struct tid_to_link_map {
    u8 tid;                          // TID (0-7)
    u8 link_bitmap;                  // 链路位图
    u8 direction;                    // 方向 (UL/DL/Both)
};

// 默认映射策略
static const struct tid_to_link_map default_t2lm[] = {
    { .tid = 6, .link_bitmap = 0x01, .direction = BOTH },  // VO → Link 0
    { .tid = 7, .link_bitmap = 0x01, .direction = BOTH },  // VO → Link 0
    { .tid = 4, .link_bitmap = 0x02, .direction = BOTH },  // VI → Link 1
    { .tid = 5, .link_bitmap = 0x02, .direction = BOTH },  // VI → Link 1
    { .tid = 0, .link_bitmap = 0x04, .direction = BOTH },  // BE → Link 2
    { .tid = 3, .link_bitmap = 0x04, .direction = BOTH },  // BE → Link 2
    { .tid = 1, .link_bitmap = 0x07, .direction = BOTH },  // BK → All Links
    { .tid = 2, .link_bitmap = 0x07, .direction = BOTH },  // BK → All Links
};
```

### 6.10.2 EMLSR (Enhanced Multi-Link Single Radio)

**EMLSR 模式**:
- 单个射频在多个链路间快速切换
- 降低功耗
- 适合移动设备

```c
// EMLSR 配置
struct emlsr_config {
    bool enable;                     // 是否启用
    u16 transition_delay;            // 切换延迟 (us)
    u8 padding_delay;                // 填充延迟
    u16 medium_sync_delay;           // 介质同步延迟
    u8 emlsr_links;                  // EMLSR 链路位图
};

// EMLSR 链路切换
static int emlsr_switch_link(
    struct hw_dev *dev,
    struct mld_sta_entry *mld_sta,
    u8 from_link,
    u8 to_link)
{
    // 1. 通知固件准备切换
    mcu_emlsr_prepare_switch(dev, mld_sta, to_link);
    
    // 2. 等待当前链路 TX 完成
    wait_for_tx_complete(dev, from_link);
    
    // 3. 切换射频到新链路
    switch_radio_to_link(dev, to_link);
    
    // 4. 同步介质状态
    medium_sync(dev, to_link);
    
    // 5. 通知固件切换完成
    mcu_emlsr_switch_done(dev, mld_sta, to_link);
    
    return 0;
}
```

### 6.10.3 EMLMR (Enhanced Multi-Link Multi Radio)

**EMLMR 模式**:
- 多个射频同时工作
- 最高性能
- 功耗较高

```c
// EMLMR 配置
struct emlmr_config {
    bool enable;                     // 是否启用
    u8 num_radios;                   // 射频数量
    u8 link_mapping[MAX_RADIO_NUM];  // 射频到链路映射
    bool simultaneous_tx;            // 是否支持同时发送
    bool simultaneous_rx;            // 是否支持同时接收
};

// EMLMR 并发传输
static int emlmr_concurrent_tx(
    struct hw_dev *dev,
    struct mld_sta_entry *mld_sta,
    struct sk_buff_head *tx_q[MLD_LINK_MAX])
{
    int i;
    
    // 1. 为每个链路准备 TX
    for (i = 0; i < MLD_LINK_MAX; i++) {
        if (skb_queue_empty(&tx_q[i]))
            continue;
        
        prepare_tx_on_link(dev, mld_sta, i, &tx_q[i]);
    }
    
    // 2. 同时触发所有链路的 TX
    trigger_concurrent_tx(dev, mld_sta);
    
    // 3. 等待所有链路 TX 完成
    wait_for_all_tx_complete(dev, mld_sta);
    
    return 0;
}
```

### 6.10.4 STR vs NSTR

**STR (Simultaneous Transmit and Receive)**:
- 可以同时发送和接收
- 需要良好的射频隔离
- 性能最高

**NSTR (Non-Simultaneous Transmit and Receive)**:
- 不能同时发送和接收
- 射频隔离要求低
- 成本较低

```c
// STR/NSTR 能力
struct mlo_str_capability {
    bool str_support;                // 是否支持 STR
    u8 str_link_pairs;               // STR 链路对位图
    u16 min_isolation;               // 最小隔离度 (dB)
    u16 max_tx_power_diff;           // 最大发送功率差 (dBm)
};

// NSTR 冲突避免
static bool nstr_check_conflict(
    struct hw_dev *dev,
    u8 tx_link,
    u8 rx_link)
{
    struct mlo_str_capability *cap = &dev->mlo_cap;
    
    // 如果支持 STR，无冲突
    if (cap->str_support)
        return false;
    
    // NSTR 模式下，TX 和 RX 不能在不同链路同时进行
    if (tx_link != rx_link)
        return true;
    
    return false;
}
```

### 6.10.5 T2LM (TID-to-Link Mapping)

**T2LM 协商**:
```c
// T2LM Request
struct t2lm_request {
    u8 dialog_token;                 // Dialog Token
    u8 direction;                    // 方向 (UL/DL/Both)
    u8 default_link_mapping;         // 默认链路映射
    u8 mapping_switch_time;          // 切换时间
    u8 expected_duration;            // 预期持续时间
    struct tid_to_link_map map[8];   // TID 映射
};

// T2LM 协商流程
static int t2lm_negotiate(
    struct hw_dev *dev,
    struct mld_sta_entry *mld_sta,
    struct t2lm_request *req)
{
    struct t2lm_response resp;
    
    // 1. 验证请求
    if (!validate_t2lm_request(dev, req)) {
        resp.status = T2LM_STATUS_INVALID;
        goto send_response;
    }
    
    // 2. 检查资源
    if (!check_t2lm_resources(dev, req)) {
        resp.status = T2LM_STATUS_NO_RESOURCE;
        goto send_response;
    }
    
    // 3. 应用映射
    apply_t2lm_mapping(dev, mld_sta, req);
    resp.status = T2LM_STATUS_SUCCESS;
    
send_response:
    // 4. 发送响应
    send_t2lm_response(dev, mld_sta, &resp);
    
    return 0;
}
```

---

## 6.11 VLAN 支持详解

### 6.11.1 VLAN 标签处理

**VLAN 帧格式**:
```
┌──────────┬──────────┬──────────┬──────────┬────────┐
│ Dst MAC  │ Src MAC  │ VLAN Tag │ EtherType│ Data   │
│ (6 bytes)│ (6 bytes)│ (4 bytes)│ (2 bytes)│        │
└──────────┴──────────┴──────────┴──────────┴────────┘

VLAN Tag (4 bytes):
┌──────────┬──────────┬──────────┬──────────┐
│ TPID     │ PCP│DEI  │ VID      │
│ (0x8100) │ (3)│(1)  │ (12 bits)│
└──────────┴──────────┴──────────┴──────────┘
```

**VLAN 处理** (`mt_wifi/common/cmm_data.c`):
```c
// TX 路径添加 VLAN 标签
VOID insert_vlan_tag(
    RTMP_ADAPTER *pAd,
    PNDIS_PACKET pkt,
    UINT16 vlan_id,
    UINT8 priority)
{
    struct sk_buff *skb = RTPKT_TO_OSPKT(pkt);
    UCHAR *pSrcBuf;
    UINT16 vlan_tci;
    
    // 1. 构造 VLAN TCI
    vlan_tci = (priority << 13) | (vlan_id & 0x0FFF);
    
    // 2. 插入 VLAN 标签
    if (skb_vlan_tag_present(skb)) {
        // 已有 VLAN 标签，更新
        skb->vlan_tci = vlan_tci;
    } else {
        // 添加 VLAN 标签
        skb = vlan_insert_tag(skb, htons(ETH_P_8021Q), vlan_tci);
    }
}

// RX 路径移除 VLAN 标签
VOID remove_vlan_tag(
    RTMP_ADAPTER *pAd,
    PNDIS_PACKET pkt)
{
    struct sk_buff *skb = RTPKT_TO_OSPKT(pkt);
    UCHAR *pSrcBuf;
    
    pSrcBuf = GET_OS_PKT_DATAPTR(pkt);
    
    // 检查是否有 VLAN 标签
    if (*(UINT16 *)(pSrcBuf + 12) != htons(ETH_P_8021Q))
        return;
    
    // 移除 VLAN 标签 (4 字节)
    NdisMoveMemory(pSrcBuf + LENGTH_802_1Q, pSrcBuf, 
                   LENGTH_802_3_NO_TYPE);
    RtmpOsSkbPullRcsum(skb, LENGTH_802_1Q);
    
    // 重置 SKB 指针
    RtmpOsSkbResetMacHeader(skb);
    RtmpOsSkbResetNetworkHeader(skb);
    RtmpOsSkbResetTransportHeader(skb);
    RtmpOsSkbResetMacLen(skb);
    
    skb->vlan_tci = 0;
}
```

### 6.11.2 VLAN 配置

**Per-BSS VLAN 配置**:
```c
// BSS VLAN 配置
struct bss_vlan_config {
    bool enable;                     // 是否启用 VLAN
    u16 vlan_id;                     // VLAN ID (1-4094)
    u8 priority;                     // 优先级 (0-7)
    bool tag_on_tx;                  // TX 时是否添加标签
    bool untag_on_rx;                // RX 时是否移除标签
};

// 配置 VLAN
INT Set_VLAN_ID_Proc(
    RTMP_ADAPTER *pAd,
    RTMP_STRING *arg)
{
    POS_COOKIE pObj = (POS_COOKIE)pAd->OS_Cookie;
    UCHAR apidx = pObj->ioctl_if;
    BSS_STRUCT *pMbss;
    UINT16 vlan_id;
    
    if (apidx >= pAd->ApCfg.BssidNum)
        return FALSE;
    
    pMbss = &pAd->ApCfg.MBSSID[apidx];
    vlan_id = simple_strtol(arg, 0, 10);
    
    // 验证 VLAN ID
    if (vlan_id == 0 || vlan_id > 4094) {
        MTWF_DBG(pAd, DBG_CAT_CFG, DBG_LVL_ERROR,
                "Invalid VLAN ID: %d\n", vlan_id);
        return FALSE;
    }
    
    // 设置 VLAN ID
    pMbss->wdev.VLAN_VID = vlan_id;
    pMbss->wdev.VLAN_Priority = 0;
    
    return TRUE;
}
```

### 6.11.3 VLAN 与 QoS 映射

**VLAN PCP 到 WMM UP 映射**:
```c
// VLAN PCP (Priority Code Point) 到 UP 映射
UCHAR VLAN_PCP_TO_UP[8] = {
    0,  // PCP 0 → UP 0 (BE)
    1,  // PCP 1 → UP 1 (BK)
    2,  // PCP 2 → UP 2 (BK)
    3,  // PCP 3 → UP 3 (BE)
    4,  // PCP 4 → UP 4 (VI)
    5,  // PCP 5 → UP 5 (VI)
    6,  // PCP 6 → UP 6 (VO)
    7,  // PCP 7 → UP 7 (VO)
};

// 从 VLAN 标签提取优先级
static UCHAR get_priority_from_vlan(PNDIS_PACKET pkt)
{
    struct sk_buff *skb = RTPKT_TO_OSPKT(pkt);
    UINT16 vlan_tci;
    UCHAR pcp;
    
    if (!skb_vlan_tag_present(skb))
        return 0;
    
    vlan_tci = skb->vlan_tci;
    pcp = (vlan_tci >> 13) & 0x07;
    
    return VLAN_PCP_TO_UP[pcp];
}
```

---

## 6.12 组播速率控制

### 6.12.1 组播速率策略

**组播速率选择**:
```c
// 组播速率配置
struct mcast_rate_config {
    bool auto_rate;                  // 自动速率
    u8 fixed_rate;                   // 固定速率 (MCS)
    u8 min_rate;                     // 最小速率
    u8 max_rate;                     // 最大速率
    bool use_lowest_rate;            // 使用最低速率
};

// 选择组播速率
static u8 select_mcast_rate(
    RTMP_ADAPTER *pAd,
    struct wifi_dev *wdev)
{
    struct mcast_rate_config *cfg = &wdev->mcast_rate_cfg;
    u8 rate;
    
    // 1. 如果配置了固定速率
    if (!cfg->auto_rate) {
        return cfg->fixed_rate;
    }
    
    // 2. 如果使用最低速率
    if (cfg->use_lowest_rate) {
        return get_lowest_basic_rate(wdev);
    }
    
    // 3. 自动选择：基于最慢的 STA
    rate = find_slowest_sta_rate(pAd, wdev);
    
    // 4. 限制在配置的范围内
    if (rate < cfg->min_rate)
        rate = cfg->min_rate;
    if (rate > cfg->max_rate)
        rate = cfg->max_rate;
    
    return rate;
}
```

### 6.12.2 组播可靠性

**组播重传机制**:
```c
// 组播重传配置
struct mcast_retry_config {
    bool enable;                     // 是否启用重传
    u8 retry_limit;                  // 重传次数
    u16 retry_timeout;               // 重传超时 (ms)
    bool use_unicast;                // 转换为单播
};

// 组播转单播
static int mcast_to_unicast(
    RTMP_ADAPTER *pAd,
    struct wifi_dev *wdev,
    PNDIS_PACKET pkt)
{
    MULTICAST_FILTER_TABLE_ENTRY *pEntry;
    MEMBER_ENTRY *pMemberEntry;
    PNDIS_PACKET pClonedPkt;
    
    // 1. 查找组播组
    pEntry = MulticastFilterTableLookup(
        &pAd->pMulticastFilterTable,
        get_mcast_addr(pkt),
        wdev->if_dev);
    
    if (!pEntry)
        return -1;
    
    // 2. 为每个成员发送单播
    pMemberEntry = pEntry->MemberList.pHead;
    while (pMemberEntry) {
        // 克隆数据包
        pClonedPkt = skb_clone(RTPKT_TO_OSPKT(pkt), GFP_ATOMIC);
        
        // 修改目标地址为单播
        set_dest_addr(pClonedPkt, pMemberEntry->Addr);
        
        // 发送单播
        APSendPacket(pAd, pClonedPkt);
        
        pMemberEntry = pMemberEntry->pNext;
    }
    
    // 3. 释放原始组播包
    dev_kfree_skb(RTPKT_TO_OSPKT(pkt));
    
    return 0;
}
```

---

**文档更新**: Part 5 已补充 MLO 详细内容 (链路选择、EMLSR/EMLMR、STR/NSTR、T2LM)、VLAN 支持、组播速率控制等
