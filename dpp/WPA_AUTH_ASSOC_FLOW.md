# WPA/RSN 关联与认证流程详解

本文档详细梳理了 Hostapd (AP) 和 wpa_supplicant (STA) 端从接收管理帧到完成 WPA 认证（4-way handshake）的完整流程。

## 1. 总体架构与状态机

在 WPA/RSN 网络中，认证过程并非单一线性的，而是涉及多个状态机的协同工作：

*   **AP 端 (Authenticator)**:
    *   **Hostapd Core**: 处理 802.11 管理帧 (Auth/Assoc/Deauth)。
    *   **WPA Authenticator (`wpa_authenticator`)**: 负责生成密钥、发起握手、管理 PMKSA 缓存。
    *   **EAPOL State Machine**: 负责 IEEE 802.1X 端口控制 (Initialized/Disconnected/Authenticated)。
*   **STA 端 (Supplicant)**:
    *   **WPA Supplicant Core**: 负责扫描、选择网络、SME (Station Management Entity) 决策。
    *   **WPA SM (`wpa_sm`)**: 负责响应握手、验证密钥、安装密钥。
    *   **EAPOL SM**: 处理 EAP 认证（如果是 WPA-Enterprise）或 EAPOL 帧传输。

---

## 2. AP 端流程 (Hostapd)

### 2.1 接收管理帧 (802.11 Management Frames)

流程起点通常是驱动接收到无线报文并上报给 Hostapd。

1.  **Driver -> Hostapd**: `driver_nl80211.c` 接收 netlink 事件，调用 `drv_callbacks.c` 中的回调。
2.  **Hostapd Core**: `src/ap/ieee802_11.c` 中的 `ieee802_11_mgmt()` 函数是所有管理帧的入口。

### 2.2 认证阶段 (Authentication)

*   **帧类型**: 0x00 (Authentication)
*   **处理函数**: `handle_auth()` in `src/ap/ieee802_11.c`
*   **逻辑**:
    1.  检查 ACL (MAC 过滤)。
    2.  检查算法 (Open System / SAE / Shared Key)。
    3.  如果是 **WPA2-PSK/WPA3-SAE**，通常先进行 Open Authentication (或 SAE commit/confirm)。
    4.  成功后发送 Authentication Reply (Status: Success)。
    5.  设置 STA 标志位 `WLAN_STA_AUTH`。

### 2.3 关联阶段 (Association)

*   **帧类型**: 0x00 (Association Request)
*   **处理函数**: `handle_assoc()` in `src/ap/ieee802_11.c`
*   **逻辑**:
    1.  **验证**: 检查 STA 是否已认证 (`WLAN_STA_AUTH`)。
    2.  **创建 Station**: 调用 `ap_sta_add()` 创建 `struct sta_info`。
    3.  **解析 IE**: 检查 RSN IE (WPA2) 或 WPA IE，验证加密套件 (Cipher) 和 AKM (Key Mgmt) 是否匹配。
    4.  **回复**: 发送 Association Response (Status: Success)。
    5.  **通知 WPA 模块**:
        *   调用 `wpa_auth_sta_init()` 初始化该 STA 的 WPA 状态机 (`wpa_state_machine`)。
        *   调用 `wpa_auth_sta_associated()` 通知 WPA 模块 STA 已关联。

### 2.4 WPA 握手启动 (4-Way Handshake)

*   **入口**: `wpa_auth_sta_associated()` in `src/ap/wpa_auth.c`
*   **WPA 状态机动作**:
    1.  **状态迁移**: `INITIALIZE` -> `AUTHENTICATION2` -> `INITPMK` -> `PTKSTART`。
    2.  **获取 PMK**:
        *   **PSK/SAE**: 从配置或 SAE 交换结果中获取 PMK。
        *   **Cache**: 检查 PMKSA 缓存 (`pmksa_cache_auth.c`) 是否命中。
        *   **Event**: `EAP1905_EVENT_ASSOC` (您的设计) 此时注入 PMK。
    3.  **构造 Msg 1/4**:
        *   生成 **ANonce** (随机数)。
        *   状态机进入 `PTKSTART`。
        *   调用 `wpa_send_eapol()` -> `cb->send_eapol()` 发送 EAPOL-Key (Msg 1/4)。

---

## 3. STA 端流程 (wpa_supplicant)

### 3.1 扫描与选网

1.  **扫描**: `wpa_supplicant_scan()`。
2.  **选网**: `wpa_supplicant_select_bss()` 选中目标 AP。

### 3.2 认证与关联 (SME/Driver)

*   **SME (Software)**: 如果驱动支持 SME (如 mac80211)，wpa_supplicant 负责构造 Auth/Assoc 帧。
    *   `sme_authenticate()` -> `sme_send_authentication()`.
    *   收到 Auth Resp -> `sme_associate()` -> `sme_send_association()`.
*   **Driver (Hardware)**: 如果是硬件卸载 (Offload)，wpa_supplicant 只下发 `connect` 命令，驱动自行完成 Auth/Assoc。

### 3.3 关联成功事件

*   **事件**: `EVENT_ASSOC`
*   **处理**: `wpa_supplicant_event_assoc()` in `wpa_supplicant/events.c`
*   **逻辑**:
    1.  更新状态为 `WPA_ASSOCIATED`。
    2.  **初始化 WPA SM**: 如果尚未初始化，调用 `wpa_sm_init()`。
    3.  **设置参数**:
        *   `wpa_sm_set_pmk()`: 设置 PMK (如果是 PSK)。
        *   `wpa_sm_set_assoc_wpa_ie()`: 传入关联时的 RSN IE。
        *   `wpa_sm_notify_assoc()`: 通知状态机已关联。

### 3.4 接收 EAPOL (Msg 1/4)

*   **接收**: 驱动接收 EAPOL 帧 (EtherType 0x888e) -> `wpa_supplicant_rx_eapol()`.
*   **分发**: `wpa_sm_rx_eapol()` in `src/rsn_supp/wpa.c`.
*   **WPA SM 动作**:
    1.  **校验**: 检查 Replay Counter，检查帧类型。
    2.  **生成 Keys**:
        *   收到 Msg 1 (含 ANonce) -> 生成 **SNonce**。
        *   通过 `(PMK, ANonce, SNonce, Addresses)` 派生 **PTK**。
    3.  **构造 Msg 2/4**:
        *   包含 SNonce。
        *   包含 RSN IE (用于确认)。
        *   计算 MIC.
    4.  **发送**: 调用 `ctx->ether_send()` 发送 EAPOL-Key (Msg 2/4)。

---

## 4. 总结与对比

| 特性 | Hostapd (AP) | wpa_supplicant (STA) |
| :--- | :--- | :--- |
| **角色** | **Authenticator** (发起者) | **Supplicant** (响应者) |
| **状态机结构** | `struct wpa_state_machine` (per-STA) | `struct wpa_sm` (global/per-interface) |
| **核心文件** | `src/ap/wpa_auth.c` | `src/rsn_supp/wpa.c` |
| **初始化时机** | 收到 Association Request 后 (`handle_assoc` -> `wpa_auth_sta_init`) | 收到 Association Event 后 (`wpa_supplicant_event_assoc`) |
| **密钥安装** | Msg 4/4 接收校验后或发送 Msg 3/4 后（取决于配置） | Msg 3/4 接收校验后 |
| **PMK 来源** | 配置 (PSK) / SAE 握手 / Radius | 配置 (PSK) / SAE 握手 / 802.1X |

### 关于 ibss_rsn.c
您提到的 `ibss_rsn.c` 是 IBSS (Ad-hoc) 模式下的 RSN 实现。因为 IBSS 节点既是 AP 也是 STA (对等)，所以它混合使用了 `wpa_authenticator` (Authenticator role) 和 `wpa_sm` (Supplicant role)。
*   **Initializtion**: 您看到的 `ibss_rsn_supp_init` 正是它初始化“作为 Supplicant 一面”的过程，手动构造了 `wpa_sm_ctx` 并调用 `wpa_sm_init`。这也正是您的 `eap1905_sta` 需要模仿的方式——**手动驱动 Supplicant 状态机**。
