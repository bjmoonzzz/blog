# WPA/RSN 认证全流程深度解析指南

本文档旨在为开发者提供一个关于 Wi-Fi WPA/RSN 关联与认证过程的**百科全书式指南**。我们将涵盖从基础概念到代码实现的每一个细节，重点解析 Hostapd (AP) 和 wpa_supplicant (STA) 端的交互与状态机驱动机制。

---

## 1. 核心概念与术语 (The Basics)

在深入代码之前，必须理解几个核心概念。

### 1.1 角色
- **Authenticator (认证者)**: 通常是 AP (Hostapd)。它控制端口的开关，持有主密钥，并发起认证。
- **Supplicant (申请者)**: 通常是 STA (手机/电脑/wpa_supplicant)。它请求访问网络。
- **Authentication Server (AS)**: 认证服务器 (如 Radius)。在 WPA-Personal (PSK) 模式下，AP 内置了 AS 功能；在 WPA-Enterprise 模式下是独立的。

### 1.2 密钥体系
- **MSK (Master Session Key)**: EAP 认证成功后导出的根密钥（Enterprise 模式）。
- **PMK (Pairwise Master Key)**: 成对主密钥。
    - **WPA2-PSK**: 直接由 `Passphrase` (密码) 和 `SSID` 派生 (PBKDF2)。
    - **WPA3-SAE**: 通过 SAE (Dragonfly) 交互生成，每次连接都不同。
    - **WPA-Enterprise**: 由 MSK 截取。
    - **PMK 必须在 4-way handshake 之前由双方独立获知。**
- **PTK (Pairwise Transient Key)**: 成对临时密钥。用于加密单播数据。
    - 由 `PMK`, `ANonce` (AP随机数), `SNonce` (STA随机数), `MAC地址` 派生。
    - 包含 KCK (密钥确认), KEK (密钥加密), TK (流量加密)。
- **GTK (Group Transient Key)**: 组临时密钥。用于加密广播/组播数据。由 AP 生成并通过加密的 EAPOL 帧下发给 STA。

### 1.3 4-Way Handshake (四次握手)
这是 WPA 的核心仪式，目的有三：
1.  确认双方持有相同的 **PMK** (通过 MIC 校验)。
2.  交换随机数 (`ANonce`, `SNonce`) 以生成 **PTK**。
3.  安全下发 **GTK**。

---

## 2. 认证全流程详解 (The Grand Flow)

我们将流程分为三个阶段：**扫描与链路建立**、**PMK 获取**、**4-Way Handshake**。

### 阶段一：链路建立 (802.11 Management)

在 WPA 介入之前，必须先建立 802.11 链路。

1.  **Probe (探测)**: STA 发送 Probe Req，AP 回复 Probe Resp。
2.  **Authentication (认证)**:
    -   **Open System**: 这是一个“空”认证。STA 发送 Auth (Alg=0)，AP 回复 Success。这是 WPA2 的标准前奏。
    -   **SAE (WPA3)**: 在此阶段进行复杂的 Commit/Confirm 帧交换（由 `ieee802_11.c` 处理），完成后双方生成 **PMK**。
3.  **Association (关联)**:
    -   STA 发送 **Assoc Req**: 携带 RSN IE (声明支持的加密套件)。
    -   AP 检查 RSN IE，如果匹配，回复 **Assoc Resp** (Status=Success)。
    -   **关键点**: 关联成功标志着物理链路建立，接下来交给 WPA 状态机。

### 阶段二：WPA 状态机启动 (The Handover)

此时，驱动层 (Driver/Firmware) 认为连接已建立，通知上层应用。

#### AP 端 (Hostapd)
-   **触发**: `handle_assoc` (ieee802_11.c) -> `wpa_auth_sta_associated` (wpa_auth.c)。
-   **动作**:
    1.  为该 STA 创建 `struct wpa_state_machine`。
    2.  状态机进入 `AUTHENTICATION2` 状态。
    3.  **生成 ANonce**。
    4.  准备 PMK (从 Cache 或 PSK 查找)。

#### STA 端 (wpa_supplicant)
-   **触发**: 收到 `EVENT_ASSOC` 事件 -> `wpa_supplicant_event_assoc` (events.c)。
-   **动作**:
    1.  初始化 `wpa_sm`。
    2.  调用 `wpa_sm_set_assoc_wpa_ie` 设置关联时用的 IE。
    3.  调用 `wpa_sm_set_pmk` (如果是 PSK)。
    4.  调用 `wpa_sm_notify_assoc` 通知状态机准备接收 EAPOL。

### 阶段三：4-Way Handshake ( The Dance)

#### Message 1/4 (AP -> STA)
-   **内容**: `ANonce` (明文)。不加密，无 MIC。
-   **AP 动作**: 状态机处于 `PTKSTART`。发送后启动去重传定时器。
-   **STA 动作**: `wpa_sm_rx_eapol`。
    -   生成 **SNonce**。
    -   计算 **PTK** = PRF(PMK, ANonce, SNonce, MACs)。
    -   现在 STA 拥有了 PTK。

#### Message 2/4 (STA -> AP)
-   **内容**: `SNonce` (明文), `RSN IE` (STA 的 IE，用于确认未被篡改), **MIC** (用 PTK 中的 KCK 计算)。
-   **STA 动作**: 发送后，STA 等待 Msg 3。
-   **AP 动作**:
    -   收到 SNonce。
    -   计算 **PTK** (AP 此时才拥有 PTK)。
    -   **验证 MIC**: 确认 STA 真的拥有 PMK。如果 MIC 错误，丢弃并断开。
    -   状态机进入 `PTKINITNEGOTIATING`。

#### Message 3/4 (AP -> STA)
-   **内容**: `ANonce` (再次确认), `RSN IE` (AP 的 IE), **MIC**，**GTK** (用 PTK 中的 KEK 加密)。
-   **AP 动作**: 派生或获取 GTK，加密放入帧中。
-   **STA 动作**:
    -   验证 MIC。
    -   解密获取 **GTK**。
    -   安装 PTK (如果是 WPA2)。

#### Message 4/4 (STA -> AP)
-   **内容**: 仅 **MIC**。确认收到 Keys。
-   **STA 动作**: 安装 Keys (PTK/GTK)，开启加密端口。状态机进入 `WPA_COMPLETED`。
-   **AP 动作**: 验证 MIC。状态机进入 `PTKINITDONE`。安装 Keys，开启加密端口。

---

## 3. WPA2 vs WPA3 关键区别

| 特性 | WPA2 (Personal) | WPA3 (SAE) |
| :--- | :--- | :--- |
| **PMK 来源** | `SSID` + `Passphrase` (静态) | SAE 握手结果 (动态，PFS特性) |
| **PMK 生成时机** | 上电或配置时预计算 | 802.11 Authentication 阶段 |
| **管理帧保护 (PMF)** | 可选 (通常关闭) | **强制开启** |
| **4-Way Handshake** | 标准流程 | 依然存在，但复用 SAE 生成的 PMK |
| **状态机影响** | PMK 是配置好的 | 需要等待 SAE 模块回调注入 PMK (或通过 PMKSA Cache) |

在代码中，WPA3 的 SAE 处理主要在 `ieee802_11.c` 的 `handle_auth` 中完成，成功后会将 PMK 存入 `pmksa_cache`。当进入 4-Way Handshake 时，`wpa_auth.c` 会发现缓存中有 PMK，直接使用。

---

## 4. 详解：`ibss_rsn_supp_init` 与 API 作用

您提到的 `ibss_rsn_supp_init` 是手动驱动 wpa_supplicant 核心状态机的一个极佳范例。在 `eap1905_sta` 中，我们需要做完全相同的事情。

### 4.1 核心结构体 `wpa_sm_ctx`
这是状态机与外界交互的**接口层/回调表**。
-   `wpa_sm` 是纯逻辑，不知道什么是 "Socket" 或 "Driver"。
-   当它需要发包时，调用 `ctx->ether_send`。
-   当它需要装 Key 时，调用 `ctx->set_key`。

### 4.2 关键函数解析

#### 1. `wpa_sm_init(struct wpa_sm_ctx *ctx)`
-   **作用**: 分配并初始化一个新的 `wpa_sm` 实例。
-   **参数**: 传入回调表 `ctx`。
-   **返回值**: `struct wpa_sm *` 指针，代表这个 Supplicant 实例。

#### 2. `wpa_sm_set_own_addr(sm, addr)`
-   **作用**: 告诉状态机“我是谁”。参与 PTK 计算 (Min(MAC1, MAC2), Max(...))。

#### 3. `wpa_sm_set_param(sm, PARAM_NAME, value)`
-   **作用**: 配置状态机参数。
-   `WPA_PARAM_PROTO`: `WPA_PROTO_RSN` (WPA2) 或 `WPA_PROTO_WPA` (WPA1)。
-   `WPA_PARAM_KEY_MGMT`: `WPA_KEY_MGMT_PSK` 或 `WPA_KEY_MGMT_SAE`。决定了用什么算法算 Key。
-   `WPA_PARAM_PAIRWISE`/`GROUP`: `WPA_CIPHER_CCMP` (AES)。

#### 4. `wpa_sm_set_pmk(sm, pmk, len, ...)`
-   **作用**: **注入主密钥**。
-   **重要**: 对于 PSK，必须在握手开始前调用。对于 1905 流程，在这里注入 DPP 产生的 PMK。

#### 5. `wpa_sm_set_assoc_wpa_ie_default(sm, ie, len)`
-   **作用**: 设置“我发送给 AP 的 Association Request 中的 IE”。
-   **为什么需要**: 4-way handshake 的 Msg 2/4 和 Msg 3/4 会回传这些 IE 进行校验，以此防止降级攻击（如攻击者篡改了 Assoc Req 让双方用弱加密，握手阶段校验 IE 内容如果不一致则报错）。

#### 6. `wpa_sm_notify_assoc(sm, bssid)`
-   **作用**: **发令枪**。告诉状态机“链路已通，对方 BSSID 是多少”。
-   **副作用**: 清空旧的 Replay Counter，重置 SNonce，准备接收 Msg 1/4。

#### 7. `wpa_sm_rx_eapol(sm, src, data, len)`
-   **作用**: **数据入口**。
-   **流程**: 当收到 EAPOL 帧时调用。它解析帧类型，如果是 Key 帧，根据当前状态（等待 Msg1 或 Msg3）进行处理，并驱动状态机前进一步。

---

## 5. 开发建议：复用指南

如果您要实现 `eap1905_sta.c`：

1.  **Context 准备**: 定义一套 `wpa_sm_ctx`，把 `ether_send` 指向您的 UDP 发送函数。
2.  **Initialize**:
    ```c
    sm = wpa_sm_init(&my_ctx);
    wpa_sm_set_param(sm, ... RSN, CCMP ...);
    ```
3.  **On Connect (收到 Map 指令)**:
    ```c
    wpa_sm_set_pmk(sm, my_pmk, ...); // 注入 PMK
    wpa_sm_set_own_addr(sm, my_mac);
    wpa_sm_set_assoc_wpa_ie_default(sm, ...); // 生成一个标准的 RSN IE
    wpa_sm_notify_assoc(sm, peer_bssid); // 准备就绪！
    ```
4.  **On RX UDP (收到 EAPOL)**:
    ```c
    wpa_sm_rx_eapol(sm, peer_addr, data, len); // 喂给状态机
    ```
    状态机会自动处理，并通过 `ctx->ether_send` 回吐 Msg 2/4 或 4/4。

通过这种方式，您完全复用了经过千锤百炼的 wpa_supplicant 状态机，无需自己处理复杂的 Nonce 生成、密钥派生和 MIC 校验。
