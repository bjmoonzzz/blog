# Wi-Fi 安全演进与状态机关系详解

本文档详细阐述从 WEP 到 WPA3 的演进历史、技术区别，以及它们与“四次握手状态机”的关系。

## 1. 概念演进史 (The Evolution)

### 1.1 WEP (Wired Equivalent Privacy)
*   **时代**: 1997 (原始 802.11 标准)。
*   **加密**: RC4 流密码。
*   **认证**: 开放系统 (Open) 或 共享密钥 (Shared Key)。
*   **致命伤**: IV 重用导致的密钥破解，可以在几分钟内被破解。
*   **状态机关系**: **无**。WEP 没有 4-way handshake，也没有动态密钥协商。Key 是静态配置死的。

### 1.2 WPA (Wi-Fi Protected Access)
*   **时代**: 2003 (802.11i 草案)。
*   **背景**: WEP 被破，IEEE 正在制定 802.11i，但硬件厂商等不及了。Wi-Fi 联盟推出了 WPA 作为“补丁”。
*   **加密**: **TKIP** (Temporal Key Integrity Protocol)。它巧妙地复用了 WEP 的 RC4 硬件引擎，但加了**动态密钥轮转**。
*   **认证**: 引入了 802.1X (Enterprise) 和 PSK (Personal)。
*   **状态机关系**: **引入了 4-way handshake**。这是 WPA 状态机的诞生。

### 1.3 WPA2 (RSN - Robust Security Network)
*   **时代**: 2004 (802.11i 正式标准)。
*   **加密**: **CCMP** (基于 AES)。彻底抛弃了 RC4，需要新的硬件支持。
*   **术语**: 在代码中用 `WPA_PROTO_RSN` 表示。
*   **状态机关系**: **继承并标准化了 4-way handshake**。

### 1.4 WPA3 (The New Standard)
*   **时代**: 2018。
*   **核心改进**:
    *   **SAE (Simultaneous Authentication of Equals)**: 取代了 PSK，彻底杜绝了字典攻击和“抓包离线破解”。
    *   **PMF (Protected Management Frames)**: 强制开启，保护 Deauth/Disassoc 帧。
*   **加密**: 依然是 AES (CCMP/GCMP)，但密钥派生算法 (KDF) 升级为 SHA-256/384 (Suite B)。
*   **状态机关系**: **依然沿用 4-way handshake**，但输入参数变了 (PMK 来源不同，KDF 算法更强)。

---

## 2. 状态机与四次握手的关系：是同一个吗？

**结论：是同一个通用的状态机引擎 (`wpa_sm`)，但是“配件”不同。**

Hostapd 和 wpa_supplicant 并没有为 WPA, WPA2, WPA3 分别写三套代码，而是用一套 **通用状态机**，通过 **参数配置** 来适应不同的标准。

### 2.1 这里的“通用”指什么？
四次握手 (4-Way Handshake) 的**骨架**从未改变：
1.  **Msg 1**: AP 发 ANonce。
2.  **Msg 2**: STA 发 SNonce + MIC。
3.  **Msg 3**: AP 发 GTK + MIC。
4.  **Msg 4**: STA 确认。

无论你是 WPA 还是 WPA3，这个 `1->2->3->4` 的流程是完全一样的。

### 2.2 这里的“变化”指什么？
虽然骨架一样，但处理每个消息时的**算法细节**不同。状态机通过以下参数来区分：

#### A. 协议版本 (`WPA_PROTO_`)
*   **WPA**: 构造 EAPOL 帧时，Descriptor Version 填 1 (RC4/HMAC-MD5)。
*   **RSN (WPA2/3)**: Descriptor Version 填 2 (AES/HMAC-SHA1)。

#### B. 密钥管理套件 (`WPA_KEY_MGMT_`)
这是最大的区别来源，它决定了 **Key Derivation Function (KDF)** 怎么算：
*   **WPA2-PSK**: 使用 SHA-1 算法计算 PTK。
*   **WPA2-PSK-SHA256**: 使用 SHA-256 算法。
*   **WPA3-SAE**: 同样使用 SHA-256，但 **PMK 的来源** 是 SAE 握手产生的，而不是 PSK。

#### C. 加密套件 (`WPA_CIPHER_`)
*   **TKIP**: 派生出的 PTK 长度和组合不同 (512 bits)。
*   **CCMP**: PTK 长度较短 (384 bits)。

### 2.3 wpa_supplicant 是如何兼容的？

在 `wpa_sm_init` 之后，我们通过 `wpa_sm_set_param` 把这些“配件”装上去：

```c
// 设置协议：决定了 EAPOL 帧格式 (Ver 1 vs Ver 2)
wpa_sm_set_param(sm, WPA_PARAM_PROTO, WPA_PROTO_RSN); 

// 设置算法：决定了 KDF 是用 SHA1 还是 SHA256，PMK 是哪来的
wpa_sm_set_param(sm, WPA_PARAM_KEY_MGMT, WPA_KEY_MGMT_SAE); 

// 设置加密：决定了 Key 的长度
wpa_sm_set_param(sm, WPA_PARAM_PAIRWISE, WPA_CIPHER_CCMP);
```

**状态机就像一个“万能加工厂”**：
*   **输入**: 一堆参数 (Proto, AKM, Cipher) + PMK + ANonce/SNonce。
*   **处理**: `wpa_sm_rx_eapol` -> `wpa_derive_ptk`。
    *   在 `wpa_derive_ptk` 内部，会根据 `KEY_MGMT` 自动选择是调 `sha1_prf` 还是 `sha256_kdf`。
*   **输出**: 对应格式的 Msg 2/4。

## 3. 总结

| 特性 | WEP | WPA | WPA2 (RSN) | WPA3 (RSN) |
| :--- | :--- | :--- | :--- | :--- |
| **状态机** | 无 | 有 (V1) | 有 (V2) | 有 (V2 + SHA256) |
| **4-Way 流程** | 无 | 有 | 有 | 有 |
| **代码实现** | 驱动/内核直接处理 | `wpa_sm` | `wpa_sm` | `wpa_sm` |
| **区别点** | - | 协议=WPA<br>算法=HMAC-MD5 | 协议=RSN<br>算法=HMAC-SHA1 | 协议=RSN<br>算法=HMAC-SHA256 |

所以在 `eap1905_sta.c` 中，我们实际上是在配置状态机运行在 **WPA2 (RSN) + CCMP** 模式下，这是最标准、兼容性最好的配置。
