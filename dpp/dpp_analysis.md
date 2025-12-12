# DPP 实现细节详细分析

## 1. `dpp_configurator_add` 函数详解 (`src/common/dpp.c`)

`dpp_configurator_add` 函数 (行 4782-4842) 负责在自动化网络中创建一个新的配置器 (Configurator) 实例。配置器是有能力为其他设备 (Enrollees) 进行配网的实体。

### 参数详解：
*   **`curve`**: 指定用于 Configurator Signing Key (C-Sign-Key, 配置器签名密钥) 的椭圆曲线 (ECC)。
    *   示例: "P-256", "P-384", "BP-256"。
    *   如果没有提供，它可能会默认为随附密钥的曲线或系统默认值。
*   **`key`**: 十六进制格式的 **C-Sign-Key** (配置器签名密钥) 私钥。
    *   这是最关键的密钥。它用于签署颁发给设备的 Connectors (配网凭证)。
    *   DPP 网络中的所有设备都信任此密钥 (通过其公钥部分)。
*   **`ppkey`**: **Configurator Protection Key** (配置器保护密钥) 的私钥 (十六进制)。
    *   用于 DPP R2/R3 版本。它是配置器自身 "Connector" 机制的一部分 (因为配置器本身也需要参与网络)。
    *   它对应于 Configurator 自身 Connector 中的 `ppKey`。
*   **`net_access_key_curve`**: 指定为 Enrollees 生成 **netAccessKey** 时使用的曲线。
    *   当 Configurator 为新设备配网时，它会生成一个 `netAccessKey` (用于网络接入的实际密钥)。此参数强制该密钥使用特定的曲线 (例如，如果你希望 C-Sign-Key 是 P-384，但希望设备使用 P-256 进行连接)。

## 2. 外部命令 `dpp_controller_set_params` 的行为

此命令用于配置 **Relay/Controller** (中继/控制器) 实体。它*不*创建 Configurator，而是准备一个 Controller 作为代理或中间人。

*   **功能**: `dpp_controller_set_params` 设置 Controller 将使用的配置字符串 (例如 "configurator=123...")。
*   **行为**:
    1.  将参数字符串存储在 Controller 上下文中。
    2.  当 Controller 收到来自对等端 (Enrollee) 的 **DPP Authentication Request** 时，它会调用 `dpp_set_configurator`。
    3.  此操作会查找本地 Configurator (如果存在 ID 与参数中相符的)，或者准备上下文将请求转发给远程 Configurator。
    4.  本质上，它将 Controller 绑定到特定的配网策略或 Configurator ID。

## 3. 外部 `ctrl_iface` 命令: 获取 DPP URI (Bootstrap)

命令 `DPP_BOOTSTRAP_GET_URI` (映射到 `dpp_bootstrap_get_uri`) 用于检索特定 ID 的引导 URI。

*   **行为**:
    1.  接收一个 bootstrap ID (例如 `1`)。
    2.  在内部列表中查找 `struct dpp_bootstrap_info`。
    3.  返回 `bi->uri` 字符串。
    4.  此 URI 通常看起来像 `DPP:C:81/1;M:aabbccddeeff;I:Information;...`。
    5.  **用例**: 在屏幕上显示 QR 码或写入 NFC 标签，以便其他设备可以扫描并发起与此设备的 DPP 流程。

## 4. DPP 各阶段的密钥使用情况

### A. Chirp 阶段 (存在通告 - Presence Announcement)
**Chirp** (存在通告) 是用于向 Configurator/Controller 通告自身存在的广播帧。

*   **使用的密钥**: **Bootstrapping Public Key Hash** (引导公钥哈希)。
*   **机制**: 帧中包含设备引导公钥的哈希值 (`pubkey_hash_chirp`)。
*   **目的**: 允许 Configurator 识别设备 (如果它已经拥有该设备的引导信息)，而无需暴露完整的公钥或身份。
*   **安全性**: *在 chirp 本身中* 不执行非对称加密操作 (签名/ECDH)，它只是一个包含哈希的通告。

### B. Peer Discovery 阶段 (对等发现)
Peer Discovery (DPP R2+) `DPP_PA_PEER_DISCOVERY_REQ` 用于发现对等点，并使用 Connectors (网络访问凭证) 而不是引导密钥来验证它们。

*   **使用的密钥**: **Connector Key** (`netAccessKey` 的一部分) 和 **C-Sign-Key**。
*   **机制**:
    1.  发送方创建一个包含其 **Connector** 的请求。
    2.  Connector 包含发送方的 `netAccessKey` 公钥，并由 **C-Sign-Key** 签名。
    3.  发送方还可以使用其 `netAccessKey` 私钥对帧 (或 Intro 元素) 进行签名，以证明所有权。
*   **目的**: 已配网设备的相互认证。
*   **验证**: 接收方使用它信任的 C-Sign-Key 验证 Connector 签名。

### C. Authentication 阶段 (Auth - 认证)
核心的 DPP 协议握手 (commit/reveal 风格)。

*   **使用的密钥**:
    *   **Bootstrap Keys (引导密钥)**: `bI` (发起方私钥), `BI` (发起方公钥), `bR` (响应方私钥), `BR` (响应方公钥)。用于 "污染" ECDH 交换，因此只有持有引导密钥的一方才能完成交换。
    *   **Protocol Keys (协议密钥 - 临时)**: `pI` (发起方临时私钥), `PI` (公钥), `pR` (响应方临时私钥), `PR` (公钥)。为每个会话通过随机数生成。
*   **推导**:
    *   使用混合了引导密钥和协议密钥的方式推导出共享秘密 `Lx`。
        *   响应方公式: `L = ((bR + pR) mod q) * BI`
        *   发起方公式: `L = bI * (BR + PR)`
    *   注意: 这将会话绑定到了引导密钥。
*   **派生密钥**:
    *   `k1`: 用于消息认证 (检查 Auth 响应)。
    *   `k2`: 用于推导后续密钥 (如 `ke`)。

### D. Configuration 阶段 (Conf - 配置)
发生在由 Authentication 阶段建立的安全隧道内。

*   **使用的密钥**:
    *   **`ke` (加密密钥)**: 从 Auth 阶段的共享秘密推导而来。
    *   **Configurator Signing Key (C-Sign-Key)**: 有效的 Configurator 使用它来 **签署** Configuration Result 中的 Connector。
*   **机制**:
    1.  Configuration Request 使用 `ke` 加密。
    2.  Configuration Response (包含新的签名 Connector 和 `netAccessKey`) 使用 `ke` 加密。
    3.  Enrollee 解密并存储签名的 Connector + `netAccessKey`.

## 密钥总结

| 密钥名称 | 类型 | 范围 | 用途 |
| :--- | :--- | :--- | :--- |
| **Bootstrap Key** | ECC 密钥对 | 永久/长期 | 在 Auth 期间识别设备。握手的信任根。 |
| **Protocol Key** | ECC 密钥对 | 临时 (会话) | Auth 期间的 ECDH 交换。确保前向保密 (PFS)。 |
| **C-Sign-Key** | ECC 密钥对 | 网络范围 | 信任根。签署 Connectors。由 Configurator 持有。 |
| **netAccessKey** | ECC 密钥对 | 设备/网络范围 | Connector 中的 "身份" 密钥。用于 Peer Discovery 和网络接入。 |
| **ppKey** | ECC 密钥对 | 设备范围 | Connector 的保护密钥 (用于重新配置/更新)。 |
| **ke** | 对称密钥 | 会话 | 加密配置数据 (Conf 阶段)。 |
