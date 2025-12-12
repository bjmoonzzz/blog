# 1905 EAPOL MTK Crash 解决方案与状态机详解

## 1. MTK Crash 问题分析与解决

### 问题根源
MTK 在 `pmksa_cache_auth_add` (或其调用链) 中添加了私有补丁，强制将 `wpa_auth->cb_ctx` 转换为 `struct hostapd_data *` 并调用底层驱动接口（如 `hapd->driver->set_key` 或类似操作）以将 PMK 下发到硬件。
由于您原本传入的是自定义的轻量级上下文，导致强制转换后访问 `hapd->driver` 时发生非法内存访问 (Crash)。

### 解决方案：Fake Hostapd + Dummy Driver

既然不能修改 MTK 代码，也不能提供真实的 `hapd`（太重且依赖复杂），我们需要**伪造**一个足够让 MTK 代码"开心"的 `hostapd_data`。

#### 1.1 定义 Dummy Driver
实现一个空的驱动接口，拦截所有驱动调用。

```c
// eap1905_driver.c
static int dummy_driver_set_key(void *priv, struct hostapd_data *hapd, ...)
{
    // 拦截下发到驱动的操作，直接返回成功
    return 0; 
}

static int dummy_driver_send_eapol(void *priv, ...)
{
    // 这里可以对接 UDP 发送逻辑，或者在 wpa_auth_callbacks 中处理
    return 0;
}

const struct wpa_driver_ops eap1905_driver_ops = {
    .name = "eap1905_dummy",
    .set_key = dummy_driver_set_key,
    .send_eapol = dummy_driver_send_eapol,
    // ... 其他可能被调用的接口
};
```

#### 1.2 构造 Fake Hostapd
在初始化时，分配一个 `struct hostapd_data`，但只填充关键字段。

```c
// eap1905.c

struct hostapd_data *eap1905_create_fake_hapd(void *my_ctx)
{
    // 1. 分配内存 (必须是 struct hostapd_data 大小，防止越界)
    struct hostapd_data *hapd = os_zalloc(sizeof(struct hostapd_data));
    
    // 2. 填充 Driver 指针 (关键！MTK 代码会访问这个)
    hapd->driver = &eap1905_driver_ops;
    
    // 3. 填充 drv_priv (指向你的自定义上下文，方便在 dummy driver 中找回)
    hapd->drv_priv = my_ctx;
    
    // 4. 填充 msg_ctx (防止打印日志时崩溃)
    hapd->msg_ctx = hapd; 
    
    // 5. 初始化 conf (部分逻辑可能检查 conf)
    hapd->conf = os_zalloc(sizeof(struct hostapd_bss_config));
    // 设置必要的 conf 字段，如 iface 名
    hapd->conf->iface = os_strdup("eap1905");

    return hapd;
}
```

#### 1.3 初始化流程
```c
// 初始化
struct eap1905_peer_ctx *peer = alloc_peer_ctx(...);
struct hostapd_data *fake_hapd = eap1905_create_fake_hapd(peer);

// 传入 fake_hapd 作为上下文
struct wpa_authenticator *wpa_auth = wpa_init(..., &eap1905_cb, fake_hapd);
```

**效果**: 当 MTK 代码执行 `hapd = (struct hostapd_data *)wpa_auth->cb_ctx` 并调用 `hapd->driver->xxx` 时，它实际上调用了 `dummy_driver_xxx`，从而安全地"吞掉"了这次操作，避免了崩溃。

---

## 2. 两种状态机详解

在 1905 EAPOL 交互中，涉及两端（Controller 和 Agent），分别运行不同的状态机。

### 2.1 AP 侧状态机 (`wpa_state_machine`)
*   **位置**: `src/ap/wpa_auth.c`
*   **结构体**: `struct wpa_state_machine`
*   **所属模块**: `wpa_authenticator` (Hostapd)
*   **角色**: **Authenticator (认证者)**
*   **职责**:
    *   发起握手 (发送 Msg 1/4)。
    *   生成 ANonce。
    *   验证 Msg 2/4 和 Msg 4/4 中的 MIC。
    *   派生并分发 GTK (Msg 3/4)。
    *   决定何时安装密钥 (PTK/GTK)。
*   **在您的方案中**: 运行在 Controller (Hostapd) 的 `eap1905` 模块中。

### 2.2 STA 侧状态机 (`wpa_sm`)
*   **位置**: `src/rsn_supp/wpa.c` (或 `wpa_supplicant/wpa_supplicant.c` 中引用)
*   **结构体**: `struct wpa_sm`
*   **所属模块**: `wpa_supplicant`
*   **角色**: **Supplicant (申请者)**
*   **职责**:
    *   响应握手 (接收 Msg 1/4，发送 Msg 2/4)。
    *   生成 SNonce。
    *   验证 Msg 1/4 和 Msg 3/4。
    *   接收并安装 GTK。
*   **在您的方案中**: 运行在 Agent (Supplicant) 的 `eap1905_sta` 模块中。

### 2.3 区别总结

| 特性 | AP 侧状态机 (`wpa_state_machine`) | STA 侧状态机 (`wpa_sm`) |
| :--- | :--- | :--- |
| **主动性** | 主动发起 (发送 Msg 1) | 被动响应 (等待 Msg 1) |
| **密钥生成** | 生成 ANonce, GTK | 生成 SNonce |
| **输入事件** | `RX_EAPOL_KEY_REPLY` (Msg 2/4) | `RX_EAPOL_KEY_FRAME` (Msg 1/3) |
| **状态转换** | `INIT` -> `PTKSTART` -> `PTKINITNEGOTIATING` -> `PTKINITDONE` | `INIT` -> `ASSOCIATED` -> `4WAY_HANDSHAKE` -> `GROUP_HANDSHAKE` -> `COMPLETED` |

**关键点**: 虽然它们都处理 EAPOL 帧，但逻辑是**互补**的。您需要在 Controller 端跑 AP 状态机，在 Agent 端跑 STA 状态机，才能完成一次完整的握手。
