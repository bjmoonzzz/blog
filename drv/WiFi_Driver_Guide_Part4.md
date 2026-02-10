# WiFi 驱动架构全面分析指南 (第四部分)

## 6. 支持的无线特性

### 6.1 Beacon (信标帧) 处理

#### 6.1.1 Beacon 发送机制
**文件**: `mt_wifi/common/bcn.c`, `mt_wifi/ap/ap_mlme.c`

**Beacon 生成流程**:
```
定时器触发 (每 Beacon Interval)
  ↓
BeaconTransmitRequired()              // 检查是否需要发送
  ↓
UpdateBeaconHandler()                 // 更新 Beacon 内容
  ↓
MakeBeacon()                          // 构造 Beacon 帧
  ├── 添加 SSID IE
  ├── 添加 Supported Rates IE
  ├── 添加 DS Parameter Set IE
  ├── 添加 TIM IE (Traffic Indication Map)
  ├── 添加 HT Capabilities IE
  ├── 添加 VHT Capabilities IE
  ├── 添加 HE Capabilities IE
  ├── 添加 EHT Capabilities IE
  ├── 添加 RSN IE (安全信息)
  └── 添加 Vendor Specific IEs
  ↓
AsicUpdateBeacon()                    // 发送到硬件
  ↓
硬件自动发送 Beacon
```

**关键函数**:
```c
// mt_wifi/common/bcn.c
VOID UpdateBeaconHandler(
    RTMP_ADAPTER *pAd,
    struct wifi_dev *wdev,
    UCHAR reason)
{
    // 更新 Beacon 内容
    // reason 可以是:
    // - BCN_UPDATE_INIT: 初始化
    // - BCN_UPDATE_IE_CHG: IE 变化
    // - BCN_UPDATE_TIM: TIM 更新
    // - BCN_UPDATE_CSA: 信道切换
}
```

#### 6.1.2 Beacon 接收处理
```c
// mt_wifi/common/mlme.c
VOID PeerBeacon(
    RTMP_ADAPTER *pAd,
    MLME_QUEUE_ELEM *Elem)
{
    // 解析 Beacon 帧
    // 更新 BSS 表
    // 检测重叠 BSS
    // 更新信道信息
}
```

### 6.2 Probe Request/Response 处理

#### 6.2.1 Probe Request 处理 (AP 模式)
**文件**: `mt_wifi/ap/ap_mlme.c`

```c
VOID APPeerProbeReqAction(
    RTMP_ADAPTER *pAd,
    MLME_QUEUE_ELEM *Elem)
{
    // 1. 解析 Probe Request
    // 2. 检查 SSID 匹配
    // 3. 检查支持的速率
    // 4. 构造 Probe Response
    // 5. 发送 Probe Response
}
```

**Probe Response 构造**:
```c
VOID MakeProbeRspFrame(
    RTMP_ADAPTER *pAd,
    struct wifi_dev *wdev,
    UCHAR *pOutBuffer,
    ULONG *pFrameLen)
{
    // 添加 IE:
    // - SSID
    // - Supported Rates
    // - Extended Supported Rates
    // - DS Parameter Set
    // - HT/VHT/HE/EHT Capabilities
    // - RSN IE
    // - WPS IE (如果启用)
}
```

### 6.3 管理帧 (Management Frame) 处理

#### 6.3.1 管理帧类型
```c
// mt_wifi/include/rtmp_dot11.h
#define SUBTYPE_ASSOC_REQ       0x00  // 关联请求
#define SUBTYPE_ASSOC_RSP       0x01  // 关联响应
#define SUBTYPE_REASSOC_REQ     0x02  // 重关联请求
#define SUBTYPE_REASSOC_RSP     0x03  // 重关联响应
#define SUBTYPE_PROBE_REQ       0x04  // 探测请求
#define SUBTYPE_PROBE_RSP       0x05  // 探测响应
#define SUBTYPE_BEACON          0x08  // 信标
#define SUBTYPE_ATIM            0x09  // ATIM
#define SUBTYPE_DISASSOC        0x0a  // 解除关联
#define SUBTYPE_AUTH            0x0b  // 认证
#define SUBTYPE_DEAUTH          0x0c  // 解除认证
#define SUBTYPE_ACTION          0x0d  // 动作帧
```

#### 6.3.2 管理帧处理流程
```
RX 路径接收管理帧
  ↓
APHandleRxMgmtFrame()                 // mt_wifi/ap/ap_data.c
  ↓
根据子类型分发:
  ├── SUBTYPE_BEACON → PeerBeacon()
  ├── SUBTYPE_PROBE_REQ → APPeerProbeReqAction()
  ├── SUBTYPE_AUTH → APPeerAuthReqAtIdleAction()
  ├── SUBTYPE_ASSOC_REQ → APPeerAssocReqAction()
  ├── SUBTYPE_REASSOC_REQ → APPeerReassocReqAction()
  ├── SUBTYPE_DISASSOC → APPeerDisassocAction()
  ├── SUBTYPE_DEAUTH → APPeerDeauthAction()
  └── SUBTYPE_ACTION → APPeerActionFrame()
```

#### 6.3.3 Action 帧处理
**文件**: `mt_wifi/common/action.c`

```c
// Action 帧类别
#define CATEGORY_SPECTRUM       0   // 频谱管理
#define CATEGORY_QOS            1   // QoS
#define CATEGORY_DLS            2   // DLS
#define CATEGORY_BA             3   // Block Ack
#define CATEGORY_PUBLIC         4   // 公共动作
#define CATEGORY_RM             5   // 无线资源管理
#define CATEGORY_FT             6   // Fast BSS Transition
#define CATEGORY_HT             7   // HT
#define CATEGORY_SA_QUERY       8   // SA Query
#define CATEGORY_PROTECTED_DUAL 9   // Protected Dual
#define CATEGORY_WNM            10  // WNM
#define CATEGORY_VHT            21  // VHT
#define CATEGORY_S1G            22  // S1G
#define CATEGORY_PROTECTED_HE   30  // Protected HE
```

### 6.4 数据帧 (Data Frame) 处理

#### 6.4.1 数据帧类型
```c
// 数据帧子类型
#define SUBTYPE_DATA            0x00  // 普通数据
#define SUBTYPE_DATA_CFACK      0x01  // 数据 + CF-Ack
#define SUBTYPE_DATA_CFPOLL     0x02  // 数据 + CF-Poll
#define SUBTYPE_DATA_CFACK_CFPOLL 0x03 // 数据 + CF-Ack + CF-Poll
#define SUBTYPE_NULL_FUNC       0x04  // Null 帧
#define SUBTYPE_CFACK           0x05  // CF-Ack
#define SUBTYPE_CFPOLL          0x06  // CF-Poll
#define SUBTYPE_CFACK_CFPOLL    0x07  // CF-Ack + CF-Poll
#define SUBTYPE_QDATA           0x08  // QoS 数据
#define SUBTYPE_QDATA_CFACK     0x09  // QoS 数据 + CF-Ack
#define SUBTYPE_QDATA_CFPOLL    0x0a  // QoS 数据 + CF-Poll
#define SUBTYPE_QDATA_CFACK_CFPOLL 0x0b // QoS 数据 + CF-Ack + CF-Poll
#define SUBTYPE_QOS_NULL        0x0c  // QoS Null
```

#### 6.4.2 数据帧处理流程
```
RX 路径接收数据帧
  ↓
APHandleRxDataFrame()                 // mt_wifi/ap/ap_data.c
  ↓
检查帧类型:
  ├── QoS 数据帧 → 提取 TID
  ├── AMSDU → 解聚合
  ├── AMPDU → 重排序
  └── 普通数据帧
  ↓
解密处理 (如需要)
  ├── WEP
  ├── TKIP
  ├── CCMP (AES)
  └── GCMP
  ↓
802.11 → 802.3 转换
  ↓
提交到网络栈
```

### 6.5 控制帧 (Control Frame) 处理

#### 6.5.1 控制帧类型
```c
#define SUBTYPE_WRAPPER         0x07  // Control Wrapper
#define SUBTYPE_BLOCK_ACK_REQ   0x08  // Block Ack Request
#define SUBTYPE_BLOCK_ACK       0x09  // Block Ack
#define SUBTYPE_PS_POLL         0x0a  // PS-Poll
#define SUBTYPE_RTS             0x0b  // RTS
#define SUBTYPE_CTS             0x0c  // CTS
#define SUBTYPE_ACK             0x0d  // ACK
#define SUBTYPE_CFEND           0x0e  // CF-End
#define SUBTYPE_CFEND_CFACK     0x0f  // CF-End + CF-Ack
```

#### 6.5.2 Block Ack 处理
**文件**: `mt_wifi/common/ba_action.c`

```c
// BA 会话建立
VOID BAOriSessionSetUp(
    RTMP_ADAPTER *pAd,
    MAC_TABLE_ENTRY *pEntry,
    UCHAR TID,
    USHORT TimeOut,
    ULONG DelayTime,
    BOOLEAN isForced)
{
    // 1. 发送 ADDBA Request
    // 2. 等待 ADDBA Response
    // 3. 建立 BA 会话
    // 4. 启用 AMPDU 聚合
}

// BA 帧接收处理
VOID BARecSessionStart(
    RTMP_ADAPTER *pAd,
    MAC_TABLE_ENTRY *pEntry,
    UCHAR TID)
{
    // 1. 分配重排序缓冲区
    // 2. 发送 ADDBA Response
    // 3. 启动重排序定时器
}
```



---

## 6.6 认证与关联流程详解

### 6.6.1 完整认证流程

**Open System 认证**:
```
STA                                AP
 │                                  │
 │  ───── Auth Request ────────>   │
 │  (Algorithm: Open System)        │
 │                                  │
 │  <───── Auth Response ──────    │
 │  (Status: Success)               │
 │                                  │
```

**Shared Key 认证** (已废弃):
```
STA                                AP
 │                                  │
 │  ───── Auth Request ────────>   │
 │  (Algorithm: Shared Key)         │
 │                                  │
 │  <───── Auth Response ──────    │
 │  (Challenge Text)                │
 │                                  │
 │  ───── Auth Request ────────>   │
 │  (Encrypted Challenge)           │
 │                                  │
 │  <───── Auth Response ──────    │
 │  (Status: Success/Failure)       │
 │                                  │
```

**SAE 认证** (WPA3):
```
STA                                AP
 │                                  │
 │  ───── Auth (Commit) ───────>   │
 │  (SAE Commit Element)            │
 │                                  │
 │  <───── Auth (Commit) ──────    │
 │  (SAE Commit Element)            │
 │                                  │
 │  ───── Auth (Confirm) ──────>   │
 │  (SAE Confirm Element)           │
 │                                  │
 │  <───── Auth (Confirm) ─────    │
 │  (SAE Confirm Element)           │
 │                                  │
```

**代码实现** (`mt_wifi/ap/ap_mlme.c`):
```c
VOID APPeerAuthReqAtIdleAction(
    RTMP_ADAPTER *pAd,
    MLME_QUEUE_ELEM *Elem)
{
    USHORT Seq, Alg, Status;
    UCHAR Addr2[MAC_ADDR_LEN];
    CHAR Challenge[CIPHER_TEXT_LEN];
    
    // 1. 解析认证请求
    if (!PeerAuthReqSanity(pAd, Elem->Msg, Elem->MsgLen,
                          Addr2, &Alg, &Seq, &Status,
                          Challenge)) {
        return;
    }
    
    // 2. 根据算法类型处理
    switch (Alg) {
    case AUTH_MODE_OPEN:
        // Open System 认证
        APPeerAuthSimpleRspGenAndSend(pAd, Elem, Alg, Seq + 1,
                                     MLME_SUCCESS);
        break;
        
    case AUTH_MODE_KEY:
        // Shared Key 认证 (已废弃)
        if (Seq == 1) {
            // 发送 Challenge
            APPeerAuthChallengeRspGenAndSend(pAd, Elem);
        } else if (Seq == 3) {
            // 验证 Challenge
            APPeerAuthConfirmAction(pAd, Elem);
        }
        break;
        
    case AUTH_MODE_SAE:
        // SAE 认证 (WPA3)
        SAE_PeerAuthReqAction(pAd, Elem);
        break;
    }
}
```

### 6.6.2 关联流程详解

**关联请求/响应**:
```
STA                                AP
 │                                  │
 │  ───── Assoc Request ───────>   │
 │  - Capability Info               │
 │  - Listen Interval               │
 │  - SSID                          │
 │  - Supported Rates               │
 │  - HT/VHT/HE/EHT Capabilities    │
 │  - RSN IE                        │
 │                                  │
 │  <───── Assoc Response ─────    │
 │  - Status Code                   │
 │  - AID (Association ID)          │
 │  - Supported Rates               │
 │  - HT/VHT/HE/EHT Operation       │
 │                                  │
```

**代码实现** (`mt_wifi/ap/ap_mlme.c`):
```c
VOID APPeerAssocReqAction(
    RTMP_ADAPTER *pAd,
    MLME_QUEUE_ELEM *Elem)
{
    USHORT CapabilityInfo, ListenInterval, StatusCode;
    UCHAR Addr2[MAC_ADDR_LEN];
    UCHAR Rates[MAX_LEN_OF_SUPPORTED_RATES];
    UCHAR RatesLen;
    MAC_TABLE_ENTRY *pEntry;
    
    // 1. 解析关联请求
    if (!PeerAssocReqSanity(pAd, Elem->Msg, Elem->MsgLen,
                           Addr2, &CapabilityInfo,
                           &ListenInterval, Rates, &RatesLen)) {
        return;
    }
    
    // 2. 检查是否允许关联
    StatusCode = APBuildAssociation(pAd, pEntry, Elem,
                                   CapabilityInfo,
                                   Rates, RatesLen);
    
    // 3. 发送关联响应
    APPeerAssocRspAction(pAd, Elem, StatusCode);
    
    // 4. 如果成功，添加到 MAC 表
    if (StatusCode == MLME_SUCCESS) {
        MacTableInsertEntry(pAd, Addr2, wdev, ENTRY_CLIENT);
    }
}
```

### 6.6.3 重关联流程

**重关联** (用于漫游):
```
STA                                New AP
 │                                  │
 │  ───── Reassoc Request ─────>   │
 │  - Current AP Address            │
 │  - Capability Info               │
 │  - Listen Interval               │
 │  - SSID                          │
 │  - Supported Rates               │
 │  - FT IE (if 802.11r)            │
 │                                  │
 │  <───── Reassoc Response ───    │
 │  - Status Code                   │
 │  - AID                           │
 │  - Supported Rates               │
 │                                  │
```

### 6.6.4 解关联/解认证

**解关联**:
```c
// 发送解关联帧
VOID APMlmeDeauthReqAction(
    RTMP_ADAPTER *pAd,
    MLME_QUEUE_ELEM *Elem)
{
    MLME_DEAUTH_REQ_STRUCT *pInfo;
    HEADER_802_11 DeauthHdr;
    PUCHAR pOutBuffer = NULL;
    ULONG FrameLen = 0;
    
    pInfo = (MLME_DEAUTH_REQ_STRUCT *)Elem->Msg;
    
    // 1. 构造解认证帧
    MgtMacHeaderInit(pAd, &DeauthHdr, SUBTYPE_DEAUTH,
                    0, pInfo->Addr, wdev->if_addr, wdev->bssid);
    
    // 2. 添加 Reason Code
    MakeOutgoingFrame(pOutBuffer, &FrameLen,
                     2, &pInfo->Reason,
                     END_OF_ARGS);
    
    // 3. 发送
    MiniportMMRequest(pAd, 0, pOutBuffer, FrameLen);
    
    // 4. 从 MAC 表删除
    MacTableDeleteEntry(pAd, pInfo->Wcid, pInfo->Addr);
}
```

**常见 Reason Code**:
```c
#define REASON_RESERVED                 0
#define REASON_UNSPECIFY                1
#define REASON_NO_LONGER_VALID          2
#define REASON_DEAUTH_STA_LEAVING       3
#define REASON_DISASSOC_INACTIVE        4
#define REASON_DISASSOC_AP_UNABLE       5
#define REASON_CLS2ERR                  6
#define REASON_CLS3ERR                  7
#define REASON_DISASSOC_STA_LEAVING     8
#define REASON_STA_REQ_ASSOC_NOT_AUTH   9
#define REASON_INVALID_IE               13
#define REASON_MIC_FAILURE              14
#define REASON_4_WAY_TIMEOUT            15
#define REASON_GROUP_KEY_HS_TIMEOUT     16
#define REASON_IE_DIFFERENT             17
#define REASON_MCIPHER_NOT_VALID        18
#define REASON_UCIPHER_NOT_VALID        19
#define REASON_AKMP_NOT_VALID           20
#define REASON_UNSUPPORT_RSNE_VER       21
#define REASON_INVALID_RSNE_CAP         22
#define REASON_8021X_AUTH_FAIL          23
```

---

## 6.7 PS-Poll 与省电模式

### 6.7.1 PS-Poll 处理

**PS-Poll 帧格式**:
```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ Frame Control│ AID          │ BSSID        │ TA           │
│ (2 bytes)    │ (2 bytes)    │ (6 bytes)    │ (6 bytes)    │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

**PS-Poll 处理流程** (`mt_wifi/ap/ap_data.c`):
```c
VOID APHandleRxPsPoll(
    RTMP_ADAPTER *pAd,
    UCHAR *pAddr,
    USHORT Aid,
    struct wifi_dev *wdev)
{
    MAC_TABLE_ENTRY *pEntry;
    PNDIS_PACKET pPacket;
    
    // 1. 查找 STA
    pEntry = MacTableLookup(pAd, pAddr);
    if (!pEntry || !pEntry->PsMode)
        return;
    
    // 2. 从 PS 队列取出一个包
    pPacket = DequeuePacketFromPsQueue(&pEntry->PsQueue);
    if (!pPacket)
        return;
    
    // 3. 设置 More Data 标志
    if (!IsQueueEmpty(&pEntry->PsQueue)) {
        // 还有更多数据
        RTMP_SET_PACKET_MOREDATA(pPacket, TRUE);
    }
    
    // 4. 发送数据包
    APSendPacket(pAd, pPacket);
}
```

### 6.7.2 TIM (Traffic Indication Map)

**TIM 更新**:
```c
VOID APUpdateBeaconFrame(
    RTMP_ADAPTER *pAd,
    INT apidx)
{
    BSS_STRUCT *pMbss = &pAd->ApCfg.MBSSID[apidx];
    UCHAR TimBitmap[WLAN_MAX_NUM_OF_TIM];
    UCHAR TimLen;
    INT i;
    
    // 1. 清空 TIM bitmap
    NdisZeroMemory(TimBitmap, sizeof(TimBitmap));
    
    // 2. 检查每个 STA 的 PS 队列
    for (i = 0; i < MAX_LEN_OF_MAC_TABLE; i++) {
        MAC_TABLE_ENTRY *pEntry = &pAd->MacTab.Content[i];
        
        if (!IS_ENTRY_CLIENT(pEntry))
            continue;
        
        if (pEntry->wdev != &pMbss->wdev)
            continue;
        
        // 如果有缓存的数据，设置对应的 bit
        if (!IsQueueEmpty(&pEntry->PsQueue)) {
            UCHAR aid = pEntry->Aid;
            TimBitmap[aid / 8] |= (1 << (aid % 8));
        }
    }
    
    // 3. 检查组播队列
    if (!IsQueueEmpty(&pMbss->McastPsQueue)) {
        TimBitmap[0] |= 0x01;  // 设置 bit 0
    }
    
    // 4. 更新 Beacon 中的 TIM IE
    UpdateTimIE(pAd, apidx, TimBitmap, &TimLen);
}
```

---

## 6.8 RTS/CTS 机制

### 6.8.1 RTS/CTS 流程

**完整流程**:
```
STA A                  STA B                  Other STAs
  │                      │                        │
  │  ──── RTS ────────> │                        │
  │  (Duration: 300us)   │                        │
  │                      │                        │
  │                      │  ← NAV = 300us ────   │
  │                      │                        │
  │  <──── CTS ────────  │                        │
  │  (Duration: 200us)   │                        │
  │                      │                        │
  │  ──── Data ───────> │                        │
  │                      │                        │
  │  <──── ACK ────────  │                        │
  │                      │                        │
```

**RTS 阈值配置**:
```c
// 设置 RTS 阈值
INT Set_RTSThreshold_Proc(
    RTMP_ADAPTER *pAd,
    RTMP_STRING *arg)
{
    struct wifi_dev *wdev;
    UINT32 rts_threshold;
    
    rts_threshold = simple_strtol(arg, 0, 10);
    
    // 范围检查
    if (rts_threshold > MAX_RTS_THRESHOLD)
        rts_threshold = MAX_RTS_THRESHOLD;
    
    // 设置到硬件
    wdev->rts_threshold = rts_threshold;
    AsicUpdateRtsThreshold(pAd, wdev, rts_threshold);
    
    return TRUE;
}
```

**使用场景**:
- **隐藏节点问题**: RTS/CTS 解决隐藏节点
- **大包传输**: 超过 RTS 阈值的包使用 RTS/CTS
- **高干扰环境**: 减少碰撞

### 6.8.2 CTS-to-Self

**CTS-to-Self** (自己给自己发 CTS):
```
STA                    Other STAs
  │                        │
  │  ──── CTS-to-Self ──> │
  │  (Duration: 200us)     │
  │                        │
  │                        │  ← NAV = 200us
  │                        │
  │  ──── Data ─────────> │
  │                        │
```

**用途**:
- **保护机制**: 保护 HT/VHT/HE 传输
- **混合模式**: Legacy 和 HT 混合
- **减少开销**: 比 RTS/CTS 开销小

---

## 6.9 Action 帧详细分类

### 6.9.1 Action 帧类别

**完整分类** (`mt_wifi/include/rtmp_dot11.h`):
```c
// Action 帧类别
#define CATEGORY_SPECTRUM       0   // 频谱管理
#define CATEGORY_QOS            1   // QoS
#define CATEGORY_DLS            2   // DLS (Direct Link Setup)
#define CATEGORY_BA             3   // Block Ack
#define CATEGORY_PUBLIC         4   // 公共动作
#define CATEGORY_RM             5   // 无线资源管理 (802.11k)
#define CATEGORY_FT             6   // Fast BSS Transition (802.11r)
#define CATEGORY_HT             7   // HT
#define CATEGORY_SA_QUERY       8   // SA Query (PMF)
#define CATEGORY_PROTECTED_DUAL 9   // Protected Dual
#define CATEGORY_WNM            10  // WNM (802.11v)
#define CATEGORY_UNPROTECTED_WNM 11 // Unprotected WNM
#define CATEGORY_TDLS           12  // TDLS
#define CATEGORY_MESH           13  // Mesh
#define CATEGORY_MULTIHOP       14  // Multihop
#define CATEGORY_SELF_PROTECTED 15  // Self Protected
#define CATEGORY_DMG            16  // DMG
#define CATEGORY_WMM            17  // WMM
#define CATEGORY_FST            18  // FST
#define CATEGORY_ROBUST_AV      19  // Robust AV Streaming
#define CATEGORY_UNPROT_DMG     20  // Unprotected DMG
#define CATEGORY_VHT            21  // VHT
#define CATEGORY_S1G            22  // S1G
#define CATEGORY_PROTECTED_HE   30  // Protected HE
#define CATEGORY_VENDOR_SPECIFIC 127 // Vendor Specific
```

### 6.9.2 Block Ack Action

**ADDBA Request/Response**:
```c
// ADDBA Request
struct addba_req {
    u8 category;                     // CATEGORY_BA
    u8 action;                       // ADDBA_REQ
    u8 dialog_token;                 // Dialog Token
    u16 param_set;                   // BA Parameter Set
    u16 timeout;                     // BA Timeout
    u16 start_seq;                   // BA Starting Sequence
} __packed;

// BA Parameter Set
#define BA_PARAM_AMSDU_SUPPORT  BIT(0)
#define BA_PARAM_POLICY         BIT(1)  // 0=Delayed, 1=Immediate
#define BA_PARAM_TID            GENMASK(5, 2)
#define BA_PARAM_BUF_SIZE       GENMASK(15, 6)
```

**处理流程** (`mt_wifi/common/ba_action.c`):
```c
VOID PeerAddBAReqAction(
    RTMP_ADAPTER *pAd,
    MLME_QUEUE_ELEM *Elem)
{
    FRAME_ADDBA_REQ AddbaReq;
    MAC_TABLE_ENTRY *pEntry;
    UCHAR TID;
    USHORT BufSize;
    
    // 1. 解析 ADDBA Request
    if (!PeerAddBAReqActionSanity(pAd, Elem->Msg, Elem->MsgLen,
                                  &AddbaReq)) {
        return;
    }
    
    // 2. 提取参数
    TID = (AddbaReq.BaParm.field.TID);
    BufSize = AddbaReq.BaParm.field.BufSize;
    
    // 3. 分配重排序缓冲区
    BARecSessionStart(pAd, pEntry, TID, BufSize);
    
    // 4. 发送 ADDBA Response
    SendAddBAResponse(pAd, pEntry, TID, ADDBA_RESULTCODE_SUCCESS);
}
```

### 6.9.3 HT Action

**HT Action 类型**:
```c
#define HT_ACTION_NOTIFY_CHANNEL_WIDTH  0  // 通知信道宽度
#define HT_ACTION_SMPS                  1  // SM Power Save
#define HT_ACTION_PSMP                  2  // PSMP
#define HT_ACTION_SET_PCO_PHASE         3  // PCO Phase
#define HT_ACTION_CSI                   4  // CSI
#define HT_ACTION_NONCOMPRESSED_BF      5  // Non-compressed Beamforming
#define HT_ACTION_COMPRESSED_BF         6  // Compressed Beamforming
#define HT_ACTION_ASEL_INDICES_FB       7  // ASEL Indices Feedback
```

### 6.9.4 VHT Action

**Operating Mode Notification**:
```c
// VHT Operating Mode Notification
struct vht_opmode_notif {
    u8 category;                     // CATEGORY_VHT
    u8 action;                       // VHT_ACTION_OPMODE_NOTIF
    u8 operating_mode;               // Operating Mode
} __packed;

// Operating Mode 字段
#define VHT_OPMODE_CHANNEL_WIDTH    GENMASK(1, 0)
#define VHT_OPMODE_RX_NSS           GENMASK(6, 4)
#define VHT_OPMODE_RX_NSS_TYPE      BIT(7)
```

---

**文档更新**: Part 4 已补充认证/关联流程、PS-Poll、RTS/CTS、Action 帧详细分类等内容


---

## 6.10 WNM (Wireless Network Management) 和 BTM (BSS Transition Management)

### 6.10.1 WNM 概述

**WNM (802.11v)** 提供无线网络管理功能，包括：
- **BTM (BSS Transition Management)**: BSS 转换管理（漫游）
- **DMS (Directed Multicast Service)**: 定向组播服务
- **FMS (Flexible Multicast Service)**: 灵活组播服务
- **TFS (Traffic Filtering Service)**: 流量过滤服务
- **Sleep Mode**: 睡眠模式
- **TIM Broadcast**: TIM 广播

**文件位置**:
- `mt_wifi/include/wnm.h` - WNM 结构定义
- `mt_wifi/ap/ap_cfg.c` - BTM 请求处理
- `mt_wifi/os/linux/cfg80211/cfg80211.c` - Auto Roaming

### 6.10.2 BTM (BSS Transition Management) 机制

#### 6.10.2.1 BTM 状态机

**文件**: `mt_wifi/include/wnm.h`

```c
// BTM 状态
enum BTM_STATE {
    WAIT_BTM_QUERY,        // 等待 BTM Query
    WAIT_PEER_BTM_QUERY,   // 等待对端 BTM Query
    WAIT_BTM_REQ,          // 等待 BTM Request
    WAIT_BTM_RSP,          // 等待 BTM Response
    WAIT_PEER_BTM_REQ,     // 等待对端 BTM Request
    WAIT_PEER_BTM_RSP,     // 等待对端 BTM Response
    BTM_UNKNOWN,           // 未知状态
    MAX_BTM_STATE,
};

// BTM 事件
enum BTM_EVENT {
    BTM_QUERY,             // BTM Query
    PEER_BTM_QUERY,        // 对端 BTM Query
    BTM_REQ,               // BTM Request
    BTM_REQ_IE,            // BTM Request IE
    BTM_REQ_PARAM,         // BTM Request 参数
    BTM_RSP,               // BTM Response
    PEER_BTM_REQ,          // 对端 BTM Request
    PEER_BTM_RSP,          // 对端 BTM Response
    BTM_REQ_TIMEOUT,       // BTM Request 超时
    PEER_BTM_RSP_TIMEOUT,  // 对端 BTM Response 超时
    MAX_BTM_MSG,
};
```

#### 6.10.2.2 BTM 数据结构

```c
// BTM 对等体条目
typedef struct _BTM_PEER_ENTRY {
    DL_LIST List;                           // 链表节点
    enum BTM_STATE CurrentState;            // 当前状态
    UCHAR ControlIndex;                     // 控制索引 (AP Index)
    UCHAR PeerMACAddr[MAC_ADDR_LEN];        // 对端 MAC 地址
    UCHAR DialogToken;                      // Dialog Token
    void *Priv;                             // 私有数据
    RALINK_TIMER_STRUCT WaitPeerBTMRspTimer; // 等待响应定时器
    RALINK_TIMER_STRUCT WaitPeerBTMReqTimer; // 等待请求定时器
    UINT32 WaitPeerBTMRspTime;              // 等待响应时间
} BTM_PEER_ENTRY, *PBTM_PEER_ENTRY;

// BTM 请求帧
typedef struct GNU_PACKED _BTM_REQ_FRAME {
    UINT8 request_mode;                     // 请求模式
    UINT16 disassociation_timer;            // 解关联定时器 (TBTT)
    UINT8 validity_interval;                // 有效间隔 (TBTT)
} BTM_REQ_FRAME, *PBTM_REQ_FRAME;

// BTM 事件数据
typedef struct GNU_PACKED _BTM_EVENT_DATA {
    UCHAR ControlIndex;                     // 控制索引
    UCHAR PeerMACAddr[MAC_ADDR_LEN];        // 对端 MAC
    UINT16 EventType;                       // 事件类型
    union {
        struct {
            UCHAR DialogToken;
            UINT16 BTMReqLen;
            UCHAR BTMReq[0];
        } GNU_PACKED BTM_REQ_DATA;
        
        struct {
            UCHAR DialogToken;
            UINT16 BTMQueryLen;
            UCHAR BTMQuery[0];
        } GNU_PACKED PEER_BTM_QUERY_DATA;
        
        struct {
            UCHAR DialogToken;
            UINT16 BTMRspLen;
            UCHAR BTMRsp[0];
        } GNU_PACKED PEER_BTM_RSP_DATA;
    } u;
} BTM_EVENT_DATA, *PBTM_EVENT_DATA;
```

#### 6.10.2.3 BTM Request 帧格式

```c
// BSS Transition Management Request 帧
struct GNU_PACKED BSS_TM_REQ {
    u8 category;                // CATEGORY_WNM (10)
    u8 action;                  // WNM_ACTION_BTM_REQ (7)
    u8 dialog_token;            // Dialog Token
    u8 req_mode;                // Request Mode
    u16 disassoc_timer;         // Disassociation Timer (TBTT)
    u8 validity_interval;       // Validity Interval (TBTT)
    // 可选字段:
    // - BSS Termination Duration
    // - Session Information URL
    // - BSS Transition Candidate List Entries
    u8 variable[];
};

// Request Mode 位定义
#define BTM_REQ_MODE_PREF_CAND_LIST_INCLUDED    BIT(0)  // 包含候选列表
#define BTM_REQ_MODE_ABRIDGED                   BIT(1)  // 简化模式
#define BTM_REQ_MODE_DISASSOC_IMMINENT          BIT(2)  // 即将解关联
#define BTM_REQ_MODE_BSS_TERMINATION_INCLUDED   BIT(3)  // 包含 BSS 终止
#define BTM_REQ_MODE_ESS_DISASSOC_IMMINENT      BIT(4)  // ESS 即将解关联
```

#### 6.10.2.4 BTM 处理流程

**AP 侧发送 BTM Request**:

```
AP                                  STA
 │                                   │
 │  ──── BTM Request ─────────────> │
 │  (Dialog Token, Candidate List)  │
 │                                   │
 │                                   │  ← 评估候选 AP
 │                                   │
 │  <──── BTM Response ──────────── │
 │  (Status, Target BSSID)          │
 │                                   │
 │                                   │  ← 开始漫游
 │  <──── Reassociation Request ─── │
 │                                   │
 │  ──── Reassociation Response ──> │
 │                                   │
```

**代码实现** (`mt_wifi/ap/ap_cfg.c`):

```c
// 发送 BTM Request
INT Send_BTM_Req(
    IN PRTMP_ADAPTER pAd,
    IN RTMP_STRING *PeerMACAddr,
    IN RTMP_STRING *BTMReq,
    IN UINT32 BTMReqLen)
{
    PWNM_CTRL pWNMCtrl;
    BTM_EVENT_DATA *Event;
    BTM_PEER_ENTRY *BTMPeerEntry;
    BOOLEAN IsFound = FALSE;
    
    // 1. 查找或创建 BTM Peer Entry
    DlListForEach(BTMPeerEntry, &pWNMCtrl->BTMPeerList, 
                  BTM_PEER_ENTRY, List) {
        if (MAC_ADDR_EQUAL(BTMPeerEntry->PeerMACAddr, PeerMACAddr)) {
            IsFound = TRUE;
            break;
        }
    }
    
    if (!IsFound) {
        // 分配新的 Peer Entry
        os_alloc_mem(NULL, (UCHAR **)&BTMPeerEntry, 
                     sizeof(*BTMPeerEntry));
        NdisZeroMemory(BTMPeerEntry, sizeof(*BTMPeerEntry));
        BTMPeerEntry->CurrentState = WAIT_BTM_REQ;
        BTMPeerEntry->ControlIndex = APIndex;
        NdisMoveMemory(BTMPeerEntry->PeerMACAddr, PeerMACAddr, 
                      MAC_ADDR_LEN);
        BTMPeerEntry->DialogToken = RandomByte(pAd);
        
        // 添加到列表
        DlListAddTail(&pWNMCtrl->BTMPeerList, &BTMPeerEntry->List);
    }
    
    // 2. 构造 BTM Event
    os_alloc_mem(NULL, (UCHAR **)&Buf, 
                 sizeof(*Event) + BTMReqLen);
    Event = (BTM_EVENT_DATA *)Buf;
    Event->ControlIndex = APIndex;
    NdisMoveMemory(Event->PeerMACAddr, PeerMACAddr, MAC_ADDR_LEN);
    Event->EventType = BTM_REQ;
    Event->u.BTM_REQ_DATA.DialogToken = BTMPeerEntry->DialogToken;
    Event->u.BTM_REQ_DATA.BTMReqLen = BTMReqLen;
    NdisMoveMemory(Event->u.BTM_REQ_DATA.BTMReq, BTMReq, BTMReqLen);
    
    // 3. 加入 MLME 队列
    MlmeEnqueue(pAd, BTM_STATE_MACHINE, BTM_REQ, 
                sizeof(*Event) + BTMReqLen, Buf, 0);
    
    return TRUE;
}
```

#### 6.10.2.5 BTM Candidate List

**Neighbor Report 信息**:
```c
struct GNU_PACKED NEIGHBOR_REPORT_INFO {
    u8 bssid[MAC_ADDR_LEN];     // 候选 AP 的 BSSID
    u32 bssid_info;             // BSSID 信息
    u8 op_class;                // 操作类别
    u8 channel;                 // 信道号
    u8 phy_type;                // PHY 类型
};

// BSSID Info 位定义
#define BSSID_INFO_AP_REACHABILITY      GENMASK(1, 0)
#define BSSID_INFO_SECURITY             BIT(2)
#define BSSID_INFO_KEY_SCOPE            BIT(3)
#define BSSID_INFO_CAPABILITY           GENMASK(13, 4)
#define BSSID_INFO_MOBILITY_DOMAIN      BIT(14)
#define BSSID_INFO_HT                   BIT(15)
#define BSSID_INFO_VHT                  BIT(16)
#define BSSID_INFO_FTM                  BIT(17)
```

### 6.10.3 Auto Roaming 机制

#### 6.10.3.1 Auto Roaming 配置

**文件**: `mt_wifi/os/linux/cfg80211/cfg80211.c`

```c
// 设置自动漫游
INT Set_AutoRoaming_Proc(
    PRTMP_ADAPTER pAd,
    RTMP_STRING *arg)
{
    PSTA_ADMIN_CONFIG pStaCfg;
    UINT32 enable;
    
    enable = simple_strtol(arg, 0, 10);
    
    pStaCfg->bAutoRoaming = (enable > 0) ? TRUE : FALSE;
    
    if (pStaCfg->bAutoRoaming) {
        // 启用自动漫游
        // 设置 RSSI 阈值
        pStaCfg->RoamingRssiThreshold = -70; // dBm
        
        // 启动漫游扫描定时器
        RTMPSetTimer(&pStaCfg->RoamingScanTimer, 
                     ROAMING_SCAN_INTERVAL);
    } else {
        // 禁用自动漫游
        RTMPCancelTimer(&pStaCfg->RoamingScanTimer, &Cancelled);
    }
    
    return TRUE;
}
```

#### 6.10.3.2 Roaming 触发条件

```c
// 检查是否需要漫游
BOOLEAN CheckRoamingCondition(
    PRTMP_ADAPTER pAd,
    PSTA_ADMIN_CONFIG pStaCfg)
{
    INT32 current_rssi;
    
    // 1. 获取当前 RSSI
    current_rssi = pStaCfg->RssiSample.AvgRssi[0];
    
    // 2. 检查 RSSI 阈值
    if (current_rssi < pStaCfg->RoamingRssiThreshold) {
        // RSSI 低于阈值，触发漫游
        return TRUE;
    }
    
    // 3. 检查连接质量
    if (pStaCfg->ChannelQuality < ROAMING_QUALITY_THRESHOLD) {
        return TRUE;
    }
    
    // 4. 检查丢包率
    if (pStaCfg->TxErrorRatio > ROAMING_TX_ERROR_THRESHOLD) {
        return TRUE;
    }
    
    return FALSE;
}
```

#### 6.10.3.3 Roaming 完成通知

**文件**: `mt_wifi/os/linux/cfg80211/cfg80211_util.c`

```c
// 通知 cfg80211 漫游完成
VOID CFG80211OS_Roamed(
    PNET_DEV pNetDev,
    IN UCHAR *pBSSID,
    IN UCHAR *pReqIe,
    IN UINT32 ReqIeLen,
    IN UCHAR *pRspIe,
    IN UINT32 RspIeLen)
{
    struct cfg80211_roam_info roam_info = {
        .links[0].channel = NULL,
        .links[0].bssid = pBSSID,
        .req_ie = pReqIe,
        .req_ie_len = ReqIeLen,
        .resp_ie = pRspIe,
        .resp_ie_len = RspIeLen,
    };
    
    // 通知内核漫游完成
    cfg80211_roamed(pNetDev, &roam_info, GFP_KERNEL);
}
```

### 6.10.4 Fast Roaming 支持

#### 6.10.4.1 Header Translation for Fast Roaming

**文件**: `mt_wifi/hw_ctrl/hw_init.c`

```c
// 初始化快速漫游支持
VOID AsicInitFastRoaming(PRTMP_ADAPTER pAd)
{
    // 设置 Header Translation 黑名单
    // 允许 EAPOL 和 Fast Roaming 帧通过
    AsicRxHeaderTaranBLCtl(pAd, 0, TRUE, ETH_TYPE_EAPOL);
    AsicRxHeaderTaranBLCtl(pAd, 1, TRUE, ETH_TYPE_WAI);
    AsicRxHeaderTaranBLCtl(pAd, 2, TRUE, ETH_TYPE_FASTROAMING);
}
```

#### 6.10.4.2 Roam Calibration

**Roam Calibration** 用于测量和优化漫游性能：

```c
#ifdef ROAM_CALIB_SUPPORT
// 记录漫游校准数据
VOID RoamCalibData(
    PRTMP_ADAPTER pAd,
    UCHAR *pAddr,
    VOID *pData,
    RTMP_STRING *pMsg,
    RTMP_STRING *pFunc)
{
    if (!pAd->RoamCalibEnable)
        return;
    
    // 记录时间戳和事件
    MTWF_LOG(DBG_CAT_CFG, DBG_SUBCAT_ALL, DBG_LVL_OFF,
             ("[ROAM_CALIB] %s: %s, MAC="MACSTR", Time=%lu\n",
              pFunc, pMsg, MAC2STR(pAddr), jiffies));
}
#endif /* ROAM_CALIB_SUPPORT */
```

**关键漫游事件**:
- `"Send Auth Resp to STA"` - 发送认证响应
- `"Send Assoc Resp"` - 发送关联响应
- `"Send Re-Assoc Resp"` - 发送重关联响应
- `"Install Key Start"` - 开始安装密钥
- `"Install Key Completed"` - 密钥安装完成
- `"Key Install/Remove Start"` - 密钥安装/删除开始
- `"Key Install/Remove Completed"` - 密钥安装/删除完成

### 6.10.5 BSS Reconfig with BTM

**MBSS 重配置流程** (`mt_wifi/ap/ap_mbss.c`):

```c
// BSS 重配置状态
enum BSS_RECONFIG_STATE {
    BSS_RECONFIG_IDLE_STAGE,
    BSS_RECONFIG_COUNTDOWN_STAGE,
    BSS_RECONFIG_COUNTDOWN_STAGE_END,
    BSS_RECONFIG_BTM_DISASSOC_STAGE,        // BTM 解关联阶段
    BSS_RECONFIG_BTM_DISASSOC_STAGE_END,
    BSS_RECONFIG_BTM_TERMINATE_STAGE,       // BTM 终止阶段
    BSS_RECONFIG_BTM_TERMINATE_STAGE_END,
};

// BSS 重配置状态机
VOID MBSS_Reconfig_SM(
    PRTMP_ADAPTER pAd,
    struct wifi_dev *wdev,
    enum BSS_RECONFIG_STATE state)
{
    BSS_STRUCT *pMbss = wdev->func_dev;
    
    switch (state) {
    case BSS_RECONFIG_BTM_DISASSOC_STAGE:
        // 发送 BTM Request 通知 STA 即将解关联
        SendBTMReqToAllSTA(pAd, pMbss, 
                          BTM_REQ_MODE_DISASSOC_IMMINENT);
        break;
        
    case BSS_RECONFIG_BTM_TERMINATE_STAGE:
        // 发送 BTM Request 通知 BSS 终止
        SendBTMReqToAllSTA(pAd, pMbss,
                          BTM_REQ_MODE_BSS_TERMINATION_INCLUDED);
        break;
        
    // ... 其他状态处理
    }
}
```

### 6.10.6 WNM 控制结构

```c
// WNM 控制结构
typedef struct _WNM_CTRL {
    UINT32 TimeadvertisementIELen;          // Time Advertisement IE 长度
    UINT32 TimezoneIELen;                   // Timezone IE 长度
    PUCHAR TimeadvertisementIE;             // Time Advertisement IE
    PUCHAR TimezoneIE;                      // Timezone IE
    NDIS_SPIN_LOCK IeLock;                  // IE 锁
    RTMP_OS_SEM BTMPeerListLock;            // BTM Peer 列表锁
    RTMP_OS_SEM WNMNotifyPeerListLock;      // WNM Notify Peer 列表锁
    BOOLEAN ProxyARPEnable;                 // Proxy ARP 使能
    BOOLEAN WNMNotifyEnable;                // WNM Notify 使能
    BOOLEAN WNMBTMEnable;                   // WNM BTM 使能
    NDIS_SPIN_LOCK ProxyARPListLock;        // Proxy ARP 列表锁
    NDIS_SPIN_LOCK ProxyARPIPv6ListLock;    // Proxy ARP IPv6 列表锁
    DL_LIST IPv4ProxyARPList;               // IPv4 Proxy ARP 列表
    DL_LIST IPv6ProxyARPList;               // IPv6 Proxy ARP 列表
    DL_LIST BTMPeerList;                    // BTM Peer 列表
    DL_LIST WNMNotifyPeerList;              // WNM Notify Peer 列表
} WNM_CTRL, *PWNM_CTRL;
```

### 6.10.7 漫游性能优化

**优化建议**:

1. **RSSI 阈值调整**:
   ```bash
   # 设置漫游 RSSI 阈值
   iwpriv ra0 set RoamingRssiThreshold=-70
   ```

2. **扫描间隔优化**:
   ```c
   #define ROAMING_SCAN_INTERVAL   5000  // 5 秒
   ```

3. **候选 AP 数量**:
   ```c
   #define MAX_BTM_CANDIDATE_NUM   8     // 最多 8 个候选 AP
   ```

4. **快速重关联**:
   - 使用 PMK 缓存 (802.11i)
   - 使用 Fast BSS Transition (802.11r)
   - 使用 Opportunistic Key Caching (OKC)

---

**文档更新**: Part 4 已补充完整的 WNM/BTM 漫游机制，包括状态机、数据结构、处理流程、Auto Roaming、Fast Roaming 和性能优化
