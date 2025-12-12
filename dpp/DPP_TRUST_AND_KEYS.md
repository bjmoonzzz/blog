# DPP/1905 信任链与密钥结构解析

针对您的两个核心疑问，这里为您拆解 DPP 的信任根基和密钥数学结构。

## 1. 双方如何“共享” Configurator？(信任的建立)

您问到点子上了：**凭什么 AP 和 STA 互相甩出一张“身份证”（Connector），对方就敢信？**

答案是：**因为它们都是由同一个“派出所”（Configurator）颁发的。**

### 流程还原
1.  **初始状态**: AP 和 STA 互不相识，也没信赖关系。
2.  **配网 (Onboarding)**:
    *   有一个 **Configurator** (通常是主路由，或者是手机 App)。
    *   Configurator 拥有一个至高无上的 **C-Sign-Key (私钥)**。
    *   **步骤 A**: Configurator 配置 AP。
        *   Configurator 用 C-Sign-Key (私) 对 AP 的 Connector 进行签名。
        *   Configurator 把 **C-Sign-Key (公)** 传给 AP 保存。
    *   **步骤 B**: Configurator 配置 STA。
        *   同理，STA 也得到了签名版 Connector 和 **C-Sign-Key (公)**。
3.  **最终结果**:
    *   AP 和 STA 手里都有这一把 **C-Sign-Key (公钥)**。这就叫“共享 Configurator”。

### 验证时刻
当 AP 把 Connector 发给 STA 时：
1.  STA 拿出其中的签名。
2.  STA 拿出自己手里的 **C-Sign-Key (公钥)**。
3.  **验签**: 如果能解开，说明这个 Connector 确实是 Configurator 签发的。**信任达成！**

## 2. `netAccessKey` 字段详解 (JWK 格式)

Connector 里的 `netAccessKey` 实际上是一个 **JSON Web Key (JWK)** 标准格式的**椭圆曲线公钥**。

```json
"netAccessKey": {
  "kty": "EC",
  "crv": "P-256",
  "x": "MKBBM...",
  "y": "5r6..."
}
```

### 各字段作用

*   **`kty` (Key Type)**: `"EC"`
    *   表示这是 **椭圆曲线 (Elliptic Curve)** 算法的密钥，而不是 RSA。
*   **`crv` (Curve)**: `"P-256"` (或 P-384, BP-256)
    *   表示使用哪条特定的曲线（NIST P-256）。这决定了数学群的参数，双方必须一致才能运算。
*   **`x` 和 `y` (Coordinates)**:
    *   **数学本质**: 椭圆曲线上的一个**点 (Point)** 包含两个坐标 $(x, y)$。
    *   **公钥**: 在 ECC 算法中，**公钥就是一个点**。
    *   **作用**: 这两个长长的 Base64 字符串，就是这个独一无二的公钥点在坐标系上的准确位置。
    *   **数据**: 它们本质上是大整数（对于 P-256 也是 256 比特），经过 Base64URL 编码以便传输。

### 总结
*   **Configurator** 是通过**预先植入 C-Sign-Key (公钥)** 来实现共享信任的。
*   **x, y** 坐标共同构成了一个**ECC 公钥**，用于后续的 ECDH 计算来派生 PMK。
