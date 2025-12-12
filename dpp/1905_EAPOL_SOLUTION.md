# 1905 EAPOL Context Crash 解决方案

## 1. 问题根源分析

根据您的描述，崩溃的根本原因在于 **上下文 (Context) 不匹配** 和 **回调函数 (Callbacks) 复用不当**。

1.  **Hostapd 侧 (Controller)**:
    - 您复用了 `src/ap/wpa_auth_glue.c` 中的标准回调函数（如 `hostapd_wpa_auth_send_eapol`）。
    - 这些标准回调强制将 `cb_ctx` 转换为 `struct hostapd_data *hapd`。
    - 它们进一步访问 `hapd->driver` (调用 `hostapd_drv_send_eapol`) 或 `hapd->drv_priv`。
    - 由于 `eap1905` 模块启动时只拥有 MAC 和 PMK，没有完整的 `hapd` 及其底层驱动上下文，导致空指针解引用或访问非法内存（MTK 驱动崩溃）。

2.  **Supplicant 侧 (Agent)**:
    - 同样复用了标准流程，导致 `wpa_dbg` / `wpa_msg` 尝试访问 `wpa_s->msg_ctx` 或其他全局上下文，而 `eap1905_sta` 提供的上下文不满足这些要求。

## 2. 解决方案：解耦与自定义回调

**核心思路**: `eap1905` 模块**不应该**使用 `wpa_auth_glue.c` 中的回调。必须为它实现一套**专用的、轻量级的回调函数** (`struct wpa_auth_callbacks`)。

### 2.1 定义轻量级上下文

不要试图伪造庞大的 `struct hostapd_data`。定义一个专属的结构体：

```c
struct eap1905_peer_ctx {
    u8 peer_addr[ETH_ALEN];
    u8 own_addr[ETH_ALEN];
    u8 pmk[PMK_LEN];
    size_t pmk_len;
    u8 pmkid[PMKID_LEN];
    int sock_fd; // 用于发送 UDP 到 Easymesh
    // ... 其他必要字段
};
```

### 2.2 实现自定义回调 (Hostapd 侧)

在 `eap1905.c` 中实现一套新的回调，**直接对接 UDP，而不是调用驱动**。

```c
// 自定义发送 EAPOL 回调
static int eap1905_send_eapol(void *ctx, const u8 *addr,
                              const u8 *data, size_t data_len,
                              int encrypt)
{
    struct eap1905_peer_ctx *peer = ctx;
    
    // 1. 封装 EAPOL 帧到 1905 格式 (TLV)
    // 2. 通过 peer->sock_fd 发送 UDP 给 Easymesh 外部程序
    // 3. 绝对不要调用 hostapd_drv_send_eapol!
    
    return send_udp_to_easymesh(peer, data, data_len);
}

// 自定义获取 PSK 回调
static const u8 * eap1905_get_psk(void *ctx, const u8 *addr,
                                  const u8 *p2p_dev_addr,
                                  const u8 *prev_psk, size_t *psk_len,
                                  int *vlan_id)
{
    struct eap1905_peer_ctx *peer = ctx;
    
    // 直接返回保存在上下文中的 PMK
    if (psk_len) *psk_len = peer->pmk_len;
    return peer->pmk;
}

// 定义回调表
static const struct wpa_auth_callbacks eap1905_auth_cb = {
    .send_eapol = eap1905_send_eapol,
    .get_psk = eap1905_get_psk,
    .logger = eap1905_logger, // 实现一个简单的 printf logger 避免崩溃
    // ... 实现其他必要回调，不需要的留空
};
```

### 2.3 初始化流程修正

在 `eap1905` 模块初始化 `wpa_authenticator` 时，传入自定义的上下文和回调：

```c
// 错误做法 (现状)
// wpa_init(..., &hostapd_wpa_auth_callbacks, hapd);

// 正确做法
struct wpa_authenticator *wpa_auth = wpa_init(
    peer->own_addr,
    &wpa_conf,
    &eap1905_auth_cb,  // <--- 使用自定义回调
    peer               // <--- 传入轻量级上下文
);
```

### 2.4 Supplicant 侧修正

同理，在 Supplicant 端也不要复用依赖 `wpa_s` 的逻辑。
1.  如果 `wpa_supplicant` 的状态机强依赖全局变量，考虑修改 `wpa_debug.c` 中的打印逻辑，或者在 `eap1905_sta` 上下文中提供一个假的 `msg_ctx`。
2.  更彻底的方法是：**Supplicant 端的 1905 EAPOL 状态机也应该独立初始化**，不复用主流程的 `wpa_s` 上下文，而是像 Hostapd 侧一样使用独立上下文和回调。

## 3. 完整交互流程 (修正后)

1.  **Easymesh (UDP)** -> **Hostapd (eap1905)**: "Start Auth for MAC X, PMK Y"
2.  **eap1905**:
    - `peer = alloc_peer_ctx(MAC, PMK)`
    - `wpa_auth = wpa_init(..., &eap1905_auth_cb, peer)`
    - `wpa_auth_pmksa_add2(wpa_auth, ...)` (注入 PMK)
    - `sm = wpa_auth_sta_init(wpa_auth, peer_addr)`
    - `wpa_auth_sta_associated(wpa_auth, sm)`
3.  **wpa_auth**:
    - 状态机生成 Msg 1/4。
    - 调用 `cb->send_eapol` (即 `eap1905_send_eapol`)。
4.  **eap1905_send_eapol**:
    - 拿到 `peer` 上下文。
    - 封装 UDP 发送给 Easymesh。
5.  **Easymesh**: 转发给 Agent。

## 4. 总结

不要试图让一个只有 MAC 和 PMK 的“裸”模块去伪装成一个拥有完整驱动和配置的 BSS (`hapd`)。这不仅会导致崩溃，逻辑上也是错误的。

**解决方案**: **实现一套专用的 `wpa_auth_callbacks`**，将 EAPOL 帧的发送重定向到 UDP 隧道，并从本地轻量级上下文中获取密钥，彻底切断对 `hostapd_data` 和底层驱动的依赖。
