# eap1905 & eap1905_sta 模块设计方案

本方案旨在 `src/drivers` 目录下设计实现 `eap1905.c` (AP侧) 和 `eap1905_sta.c` (STA侧)，通过 UDP 与外部 map 程序通信，复用 hostapd/wpa_supplicant 的 EAPOL 状态机完成 1905 4-way handshake。

## 1. 总体架构

- **外部程序 (Map)**: 负责 1905 协议逻辑、Peer Discovery、UDP 报文封装与转发。
- **eap1905 (AP)**: 运行 `wpa_authenticator` 状态机。
  - 采用 **Fake Hostapd** 模式，伪造 `hapd` 和 `driver` 上下文，防止 MTK 驱动崩溃。
  - 通过 UDP 接收指令和 EAPOL 帧，发送 EAPOL 帧。
- **eap1905_sta (STA)**: 运行 `wpa_sm` (supplicant) 状态机。
  - 同样采用轻量级上下文。
  - 通过 UDP 交互。

## 2. 通信协议 (UDP 事件/信号)

定义简单的 TLV 或定长结构体进行通信：

| Event ID | Name | Direction | Payload | Description |
| :--- | :--- | :--- | :--- | :--- |
| 0 | `EAP1905_EVENT_INIT_AP` | Map->Mod | `{own_mac, conf}` | 初始化 AP 侧 Authenticator |
| 1 | `EAP1905_EVENT_INIT_STA` | Map->Mod | `{own_mac, conf}` | 初始化 STA 侧 Supplicant |
| 2 | `EAP1905_EVENT_ASSOC` | Map->Mod | `{peer_mac, pmk, pmkid}` | 模拟关联 (Trigger Handshake) |
| 3 | `EAP1905_EVENT_DISASSOC`| Map->Mod | `{peer_mac}` | 断开连接/清理状态机 |
| 4 | `EAP1905_EVENT_RX_EAPOL`| Map->Mod | `{peer_mac, data, len}` | 收到 EAPOL 帧 (注入状态机) |
| 5 | `EAP1905_EVENT_TX_EAPOL`| Mod->Map | `{peer_mac, data, len}` | 发送 EAPOL 帧 (回调触发) |
| 6 | `EAP1905_EVENT_SET_KEY` | Mod->Map | `{peer_mac, key_info}` | 密钥安装 (虽然 Fake Driver 会拦截，但这可用于通知 Map) |
| 7 | `EAP1905_EVENT_UPDATE_PMK`| Map->Mod | `{pmk, pmkid}` | 更新/添加 PMKSA |
| 8 | `EAP1905_EVENT_UPDATE_GTK`| Map->Mod | `{gtk, key_id}` | 更新 GTK (Group Rekey) |

## 3. AP 侧设计 (eap1905.c)

### 3.1 核心结构体 `struct eap_1905`
```c
struct eap_1905_peer {
    u8 addr[ETH_ALEN];
    struct wpa_state_machine *sm;
    struct eap_1905 *ctx;
};

struct eap_1905 {
    int sock; // UDP socket
    u8 own_addr[ETH_ALEN];
    struct wpa_authenticator *wpa_auth;
    struct hostapd_data *fake_hapd; // for MTK fix
    struct wpa_driver_ops *dummy_driver; // for MTK fix
    // Peer management (list or hash table)
};
```

### 3.2 关键实现点
1.  **Fake Hostapd**: 
    - 分配 `struct hostapd_data`。
    - 指向 `dummy_driver_ops` (拦截 `set_key`, `send_eapol` 等)。
    - `drv_priv` 指向 `eap_1905` 实例。
2.  **Callbacks (`wpa_auth_callbacks`)**:
    - `send_eapol`: 封装成 Event 5 发送给 UDP。
    - `get_psk`: 从缓存的 PMK 返回 (本方案主要用 PMKSA cache，可能不需要 explicit PSK fetch 如果 PMKSA 命中)。
    - `logger`: `printf` wrapper。
3.  **流程**:
    - `INIT_AP`: `wpa_init()`.
    - `ASSOC`: `wpa_auth_pmksa_add2()` (注入 PMK) -> `wpa_auth_sta_init()` -> `wpa_auth_sta_associated()` (触发 Msg 1)。
    - `RX_EAPOL`: `wpa_receive()`.

## 4. STA 侧设计 (eap1905_sta.c)

### 4.1 核心结构体 `struct eap_1905_sta`
```c
struct eap_1905_sta {
    int sock;
    u8 own_addr[ETH_ALEN];
    u8 bssid[ETH_ALEN]; // Peer AP addr
    struct wpa_sm *sm;
    struct wpa_sm_ctx *sm_ctx;
    // PMK/Config storage
};
```

### 4.2 关键实现点
1.  **Callbacks (`wpa_sm_ctx`)**:
    - `ether_send`: 封装成 Event 5 发送 UDP。
    - `set_key`: 同样拦截或通知 Map。
    - `get_network_ctx`: 返回 NULL 或 dummy 配置。
2.  **流程**:
    - `INIT_STA`: `wpa_sm_init()`.
    - `ASSOC`: 设置 PMK (`wpa_sm_set_pmk`), 设置自身 MAC, 设置 BSSID (`wpa_sm_notify_assoc`).
    - `RX_EAPOL`: `wpa_sm_rx_eapol()`.

## 5. 验证计划

由于这是一个 "Design" 任务，生成的代码将通过静态检查（编译检查如果环境允许，或者由用户审查）。重点检查：
1.  **结构体定义完整性**：是否包含了所有必要字段。
2.  **API 调用正确性**：是否正确使用了 `wpa_auth.h` 和 `wpa.h` 中的函数。
3.  **Fake Hostapd 模式**：是否正确构造了 `hostapd_data` 和 `driver_ops` 以避免 MTK 崩溃。
4.  **UDP 逻辑**：是否正确处理了 Buffer 和 Socket 发送。

代码将直接写入 `src/drivers/eap1905.c` 和 `src/drivers/eap1905_sta.c`。
