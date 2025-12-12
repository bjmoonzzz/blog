# Hostapd WPA 事件处理详解：SME vs Driver Offload

您观察到的现象（WPA3 走 `hostapd_mgmt_rx`，WPA2 走 `hostapd_notif_assoc`）揭示了 Wi-Fi 驱动架构中最核心的一个区别：**关联管理实体 (SME, Station Management Entity) 到底是在 Hostapd 内部，还是在驱动/固件内部**。

## 1. 核心机制解析

### 1.1 `EVENT_RX_MGMT` (WPA3 路径)
*   **含义**: 驱动收到了一个 802.11 管理帧（Authentication/Association），但**驱动自己不处理**（或虽然处理了但上报 raw frame 供上层进一步处理），而是原封不动地抛给 Hostapd。
*   **处理**: 走 `hostapd_mgmt_rx` 分支。
*   **背景**:
    *   **Hostapd-based SME**: 这是现代 mac80211 驱动（如 MTK 驱动在开启特定模式下）和 WPA3/SAE 的典型路径。
    *   **WPA3 (SAE) 的特殊性**: SAE 的握手过程（Commit/Confirm）非常复杂，包含复杂的椭圆曲线计算 (Dragonfly)。绝大多数旧版 Wi-Fi 固件不支持这些计算，或者支持不灵活。因此，**SAE 的所有 Authentication 帧通常必须上报给 Hostapd**，由 Hostapd 内置的 SAE 逻辑来处理。
    *   处理完 Authentication 后，接下来的 Association 帧也自然流向 `hostapd_mgmt_rx`。

### 1.2 `EVENT_ASSOC` (WPA2 路径)
*   **含义**: 驱动（或 Firmware）已经**自己独立完成了** Authentication 和 Association 的握手过程。它只是通知 Hostapd：“有个 STA 已经连上物理层了（Associated），这是它的信息”。
*   **处理**: 走 `hostapd_notif_assoc` 分支。
*   **背景**:
    *   **Driver/Firmware Offload**: 这是传统闭源驱动（Qualcomm/Broadcom/Realtek）和部分旧版 mac80211 驱动处理 WPA2 的经典方式。
    *   对于 WPA2-PSK，认证过程非常简单（Open Auth -> Assoc），大部分固件都内置了这个逻辑。为了性能和省事，固件自己就做了，做完告诉 Hostapd 一声。

---

## 2. 为什么会有这种差异？(Why the Split?)

| 特性 | WPA2 (PSK/Open) | WPA3 (SAE) |
| :--- | :--- | :--- |
| **认证帧复杂度** | 极低 (Auth Alg=0, Seq=1/2)，几乎是空的。 | **极高** (Auth Alg=3, Seq=1/2)，包含复杂的加密元素。 |
| **Firmware 支持** | 几乎所有 Wi-Fi 芯片固件都原生支持。 | 需要升级固件才能支持。很多老芯片固件根本改不动。 |
| **处理位置** | **Firmware/Driver** (为了效率)。 | **Hostapd** (为了灵活性和兼容性)。 |
| **Hostapd 事件** | `EVENT_ASSOC` (结果通知)。 | `EVENT_RX_MGMT` (原始帧处理)。 |

### 关于 "ASSOC 不属于 MGMT 吗？"
**技术上当然属于。** Association Request 绝对是 Management Frame (Type 0, Subtype 0)。

但这里的区别在于**谁来消费这个帧**：
*   如果 **Hostapd** 需要亲自解析、回复 Assoc Resp，那它就是通过 `EVENT_RX_MGMT` 拿到的。
*   如果 **驱动** 已经替 Hostapd 回复了 Assoc Resp，那么 Hostapd 就不需要再处理“接收 Assoc Req”这个动作了，它只需要通过 `EVENT_ASSOC` 知道结果。

---

## 3. 为什么有的机型 WPA2/3 都走 `hostapd_mgmt_rx`？

这取决于驱动的实现模式 (Driver Capability)。

*   **SoftMAC 驱动 (如 ath9k, mt76)**: 几乎所有的管理帧都交给 Hostapd 处理。这种驱动不管你跑 WPA2 还是 WPA3，都走 `EVENT_RX_MGMT`。Hostapd 全权负责回复 Auth/Assoc。
*   **FullMAC 驱动 (如某些高通/博通方案)**: 固件包办一切。WPA2 时走 `EVENT_ASSOC`。但在 WPA3 时，因为固件可能不支持 SAE，或者驱动配置了 `WPA_DRIVER_FLAGS_SAE` 让 Hostapd 处理，所以 WPA3 可能会回落到 `EVENT_RX_MGMT`。

**总结**:
*   **WPA3 走 `EVENT_RX_MGMT`**: 因为 SAE 极其复杂，必须由 Hostapd 亲自操刀。
*   **WPA2 走 `EVENT_ASSOC`**: 因为 WPA2 很简单，驱动/固件为了省事自己干了（Offload）。
*   **都走 `EVENT_RX_MGMT`**: 说明这个驱动采用了 Hostapd-SME 模式，把控制权完全交给了 Hostapd。
