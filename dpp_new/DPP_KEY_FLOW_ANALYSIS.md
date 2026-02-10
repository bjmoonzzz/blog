# DPP Code Analysis: From Configurator to PMK

本文档详细梳理了 hostapd/wpa_supplicant 中 DPP (Device Provisioning Protocol) 全流程的代码实现，重点分析密钥的生成、分发与使用。

## 1. Configurator 初始化 (`dpp_configurator_add`)

**代码入口**: `src/common/dpp.c`: `dpp_configurator_add`

外部（如 `hostapd_cli` 或 `wpa_cli`）通过控制接口命令 `add_configurator` 调用此函数。

```c
// src/common/dpp.c

int dpp_configurator_add(struct dpp_global *dpp, const char *cmd)
{
    // ... 解析参数 ...
    
    // 如果外部传入了私钥 (key=...)，则使用该私钥；否则自动生成。
    // 这就是 Configurator 的 Signing Key (C-sign-key)。
    conf = dpp_keygen_configurator(curve, privkey, privkey_len, ...);
    
    // 生成 kid (Key ID)，它是 C-sign-key 公钥的 hash
    dpp_configurator_gen_kid(conf);
    
    // 将 Configurator 结构体添加到全局链表
    dl_list_add(&dpp->configurator, &conf->list);
}
```

*   **关键密钥**: `conf->csign` (Curve25519/P-256 KeyPair)。这是 Configurator 的身份根密钥，用于签发所有的 Connector。

## 2. DPP 协议交互流程 (Chirp/Auth/Conf)

### A. Chirp (Presence Announcement)
**场景**: Enrollee 广播自己的 Presence，包含其 Bootstrap Key 的 Hash。

**Enrollee 端**:
*   `wpa_supplicant/dpp_supplicant.c`: `wpas_dpp_chirp_tx_status` 处理发送逻辑。
*   构建 Beacon/Probe Req 帧，包含 DPP 元素 (Type, Bootstrap Key Hash)。

**Configurator/Responder 端**:
*   `src/ap/dpp_hostapd.c`: `hostapd_dpp_rx_action` 接收 Action 帧。
*   检查 Chirp 中的 Hash 是否匹配本地配置的 Peer Bootstrap Info (`dpp->bootstrap` 链表)。

### B. Authentication (Auth)
**核心函数**: `src/common/dpp_auth.c`

这是双方建立临时加密信道的阶段。

1.  **Auth Request**:
    *   Initiator 生成 **Protocol Key** ($P_I$, ephemeral)。
    *   发送 $P_I$ 和 $B_I$ (的Hash) 给 Responder。
2.  **Auth Response**:
    *   Responder 找到匹配的 $B_I$。
    *   生成 **Protocol Key** ($P_R$, ephemeral)。
    *   **关键点**: 执行 `dpp_ecdh` 计算共享密钥。
        *   $M = P_I \times B_R$ (或类似组合，取决于 mutual auth)
        *   $N = P_I \times P_R$ (PFS)
    *   推导密钥 `k1`, `k2`, `ke` (KEK)。
3.  **Auth Confirm**: 完成认证，确认双方拥有相同的密钥。

*   **产物**: 一个加密的信道（KEK），用于传输接下来的 Configuration 消息。

### C. Configuration (Conf)
**核心函数**: `src/common/dpp.c`: `dpp_build_conf_obj`

Configurator 生成配置信息并发送给 Enrollee。

```c
// src/common/dpp.c

static struct wpabuf *
dpp_build_conf_obj(struct dpp_authentication *auth, ...)
{
    // 1. 生成 netAccessKey (入网密钥)
    // 通常这是一个新生成的 KeyPair，专用于网络接入
    auth->own_protocol_key = dpp_gen_keypair(auth->curve); // 这里复用了变量名，实际是 netAccessKey
    
    // 2. 准备 Connector 内容
    // 包含 netAccessKey 公钥, Group ID, 过期时间等
    
    // 3. 签名 Connector
    // 使用 Configurator 的 C-sign-key 对上述内容签名
    // sign(netAccessKey.pub | Group | ..., C-sign-key.priv)
    
    // 4. 加密传输
    // 使用 Auth 阶段的 KEK 加密整个 Configuration Object 发送给 Enrollee
}
```

*   **Conf Object 内容**:
    *   **`netAccessKey`**: Enrollee 用于接入网络的私钥（JSON Web Key 格式）。
    *   **`signedConnector`**: Configurator 签发的“身份证”，Enrollee 须出示给 AP 看。
    *   **`psk`/`passphrase`**: (可选) 传统的 WPA2PSK 密钥。
    *   **`C-sign-key` (public)**: Configurator 的公钥，Enrollee 用它来验证别人的 Connector。

## 3. Network Access (Peer Discovery & PMK)

当 Enrollee 拿到配置后，尝试通过 DPP 方式接入网络（DPP Network Introduction）。

**代码入口**: `src/common/dpp.c`: `dpp_peer_intro`

```c
// src/common/dpp.c

int dpp_peer_intro(struct dpp_introduction *intro, const char *own_connector,
                   const u8 *net_access_key, ...)
{
    // 1. 解析自己的 Connector 和 netAccessKey
    own_key = dpp_set_keypair(..., net_access_key, ...);
    
    // 2. 验证对方 (Peer/AP) 的 Connector
    // 使用本地保存的 C-sign-key 公钥验证对方 Connector 的签名
    dpp_check_signed_connector(..., csign_key, ...);
    
    // 3. 从对方 Connector 中提取对方的 netAccessKey 公钥 (intro->peer_key)
    
    // 4. 执行 ECDH 派生 PMK
    // N = own_netAccessKey.priv * peer_netAccessKey.pub
    dpp_ecdh(own_key, intro->peer_key, Nx, &Nx_len);
    
    // 5. 派生 PMK (Pairwise Master Key)
    dpp_derive_pmk(Nx, Nx_len, intro->pmk, ...);
    
    // 6. 派生 PMKID (用于 4-Way Handshake 关联)
    dpp_derive_pmkid(..., intro->pmkid);
}
```

*   **关键流转**:
    1.  Enrollee 发送 Auth Request (包含 Connector)。
    2.  AP 收到后，验证 Connector 签名（确认是同一个 Configurator 签发的，即在同一个 Group）。
    3.  AP 提取 Enrollee 的 `netAccessKey` 公钥。
    4.  AP 使用 **AP 自己的 `netAccessKey` 私钥** 和 **Enrollee 的 `netAccessKey` 公钥** 进行 ECDH。
    5.  Enrollee 做同样的操作（方向相反）。
    6.  双方得到相同的 **PMK**。
    7.  PMK 直接加载到 hostapd/wpa_supplicant 的状态机中，跳过传统的 PSK/802.1x 认证，直接进行 4-way handshake (使用 PMKID 匹配)。

## 总结：密钥生命周期

| 阶段 | 密钥名称 | 类型 | 作用 |
| :--- | :--- | :--- | :--- |
| **Setup** | **C-sign-key** | Long-term | Configurator 的身份根，用于签发 Connector。 |
| **Boot** | **Bootstrap Key** | Long-term | 设备的出厂/重置身份 (QR Code)，用于 Auth 阶段建立信任。 |
| **Auth** | **Protocol Key** | Ephemeral | Auth 协议中的临时 ECDH 密钥，用于生成 KEK 保护配置下发。 |
| **Conf** | **netAccessKey** | Long-term* | **核心密钥**。由 Configurator 生成并下发给 Enrollee (和 AP)。用于日常网络接入。 |
| **Access**| **PMK** | Session | 由双方的 `netAccessKey` 通过 ECDH 实时协商得出，用于 WiFi 链路加密。 |
