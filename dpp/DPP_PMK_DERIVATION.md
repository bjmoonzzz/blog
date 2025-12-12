# 1905/DPP PMK 派生机制深度解析

您问到了 1905 握手最核心的问题：**双方凭什么能算出一样的 PMK？**

答案在于 **DPP Connector** 机制以及其背后的 **ECDH (Elliptic Curve Diffie-Hellman)** 密钥交换算法。这与传统的 WPA2-PSK（预共享）完全不同。

## 1. 核心原料：Connector 中的宝藏

当 1905 设备配对（Onboarding）成功时，Configurator 会给双方（Enrollee 和自己）各发一个 `Connector`。这个 Connector 是一个 JSON 对象，里面最重要的两个东西是：

1.  **netAccessKey (私钥/公钥对)**: 这是每个设备独有的身份密钥 (ECDSA Key Pair)。
2.  **Groups (组信息)**: 包含 `groupId`，用来确认咱们是不是一家人。

**Connector 长这样 (简化版)**:
```json
{
  "groups": [{"groupId": "MyMeshNet", "netRole": "ap"}],
  "netAccessKey": {"x": "...", "y": "...", "crv": "P-256"}
}
```

## 2. 握手前奏：Peer Introduction

在可以算出 PMK 之前，必须发生一次 **Peer Introduction (介绍)**。这通常发生在 1905 层的 `DPP_AUTHENTICATION_REQ/RESP` 交互中。

1.  **交换 Connector**: AP 和 Sta 把自己的 Connector 发给对方。
2.  **验证 Connector**:
    *   检查签名：确保这是 Configurator 签发的（双方都信任 Configurator 的 C-Sign-Key）。
    *   检查 Group：确认 `groupId` 一致（是不是同一个 Mesh 网络）。

## 3. 见证奇迹：ECDH 密钥协商

一旦验证通过，双方就会拿出自己的**私钥**和对方 Connector 里的**公钥**，开始运行 **ECDH 算法**。

**公式**:
*   设备 A 算：`SharedSecret = ECDH(PrivKey_A, PubKey_B)`
*   设备 B 算：`SharedSecret = ECDH(PrivKey_B, PubKey_A)`

**数学原理**:
尽管 A 和 B 只有对方的公钥，不知道对方的私钥，但 ECDH 算法保证了**他们算出来的 `SharedSecret` (共享秘密) 是字节级完全一致的！** 这就是公钥密码学的魔力。在代码 `dpp.c` 中，这一步由 `dpp_ecdh()` 完成，结果叫 `Nx`。

## 4. 最终步：HKDF 派生 PMK

拿到共享秘密 `Nx` 后，还不能直接当 PMK 用。需要通过 **HKDF (HMAC-based Key Derivation Function)** 进行“萃取和扩展”。

**派生公式**:
`PMK = HKDF(Context="DPP PMK", Input=Nx, Salt=NULL)`

在 hostapd 代码 `dpp_derive_pmk` 中可以看到：
```c
// 1. 用 ECDH 算出 Nx (Shared Secret)
dpp_ecdh(own_key, intro->peer_key, Nx, &Nx_len);

// 2. 用 HKDF 算出 PMK
// "DPP PMK" 是写死的字符串，确保双方上下文一致
const char *label = "DPP PMK";
hkdf_extract(hash_len, NULL, 0, Nx, Nx_len, prk);
hkdf_expand(hash_len, prk, hash_len, label, os_strlen(label), pmk, hash_len);
```

## 5. 总结

**1905 握手双方基于什么产生一致的 PMK？**

1.  **基于**: 双方各自持有的 **netAccessKey (私钥)** 和对方 **Connector (公钥)**。
2.  **算法**:
    *   **ECDH**: 实现“由于私钥不同但公钥互换，导致结果一致”的零知识协商。
    *   **HKDF**: 将协商结果标准化为定长的 PMK (如 32 字节)。

这就是为什么 1905 不需要像 WPA2 那样输入密码，也不需要像 SAE 那样进行复杂的 Dragonfly 交互，只要交换 Connector，PMK 就自动产生了。
