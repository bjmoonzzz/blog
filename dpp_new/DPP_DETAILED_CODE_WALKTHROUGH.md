# DPP 源码详解：从密钥生成到 PMK 派生

本文档基于 `hostapd/wpa_supplicant` 源码，详细解读 DPP (Device Provisioning Protocol) 协议中密钥的全生命周期流转。并不止于流程概览，而是深入到函数与代码行级的实现逻辑。

---

## 1. Configurator 身份初始化

**目标**: 创建一个 Configurator 实体，为其分配核心的签名密钥对 (C-sign-key)。
**代码位置**: `src/common/dpp.c`

外部通过 `ADD_configurator` 命令触发 `dpp_configurator_add` 函数。

```c
// src/common/dpp.c

int dpp_configurator_add(struct dpp_global *dpp, const char *cmd)
{
    // ... 变量定义与参数解析 ...

    // 1. 获取或生成 C-sign-key (Configurator Signing Key)
    // 这是 Configurator 的根密钥，用于签发 Connector。
    // 如果 cmd 中指定了 "key=..." 则解析传入的私钥，否则自动生成一个新的。
    conf = dpp_keygen_configurator(curve, privkey, privkey_len,
                                   pp_key, pp_key_len);
    
    // ...
    // 调用链: dpp_keygen_configurator -> dpp_gen_keypair -> crypto_ec_key_gen (常见 P-256)
    // 此时 conf->csign 包含完整的私钥+公钥。
```

```c
// src/common/dpp.c (dpp_keygen_configurator 内部)

    if (dpp_configurator_gen_kid(conf) < 0) // 生成 Key ID
        goto fail;
```

*   **`conf->csign`**: 长期存在的 **C-sign-key (Private + Public)**。
*   **`conf->kid`**: C-sign-key 公钥的 SHA256 Hash，用于标识这个 Configurator。

---

## 2. DPP 发现与认证 (Chirp & Auth)

**目标**: Enrollee (未配网设备) 与 Configurator 建立信任，并交换后续通信所需的加密密钥。

### 2.1 Chirp (Enrollee 广播 Presence)

Enrollee 通过广播 Action 帧 (Chirp) 宣告自己的存在。
**关键数据**: `Bootstrap Key Hash` (Enrollee 自己的 $B_I$ 的哈希)。

**Responder (AP/Relay) 接收处理**:
代码入口: `src/ap/dpp_hostapd.c` -> `hostapd_dpp_rx_action`

```c
// src/ap/dpp_hostapd.c

static void hostapd_dpp_rx_action(struct hostapd_data *hapd, const u8 *src,
                                  const u8 *buf, size_t len, unsigned int freq)
{
    // 解析 Action 帧类型
    if (type == DPP_PA_PRESENCE_ANNOUNCEMENT) { // Chirp 帧
        // 提取 Chirp 中的 Hash
        // 在本地 Bootstrap 数据库中查找是否有匹配的记录
        peer_bi = dpp_bootstrap_find_chirp(hapd->iface->interfaces->dpp, hash);
        
        if (peer_bi) {
             // 找到了！说明我们认识这个设备（比如扫过它的二维码）
             // 触发 Authentication 流程
             hostapd_dpp_auth_init(hapd, ...);
        }
    }
}
```

### 2.2 Authentication (ECDH 密钥交换)

双方进入 Authentication 阶段。
**核心目的**: 验证对方持有正确的 Bootstrap Key，并协商出临时的加密隧道 (KEK)。

**代码位置**: `src/common/dpp_auth.c`

#### Auth Request 构建 (Initiator)
```c
// src/common/dpp_auth.c : dpp_auth_build_req

// 1. 生成临时的 Protocol Key (P_I)
auth->own_protocol_key = dpp_gen_keypair(auth->curve); 

// 2. 将 P_I 的公钥放入消息
wpabuf_put_le16(msg, DPP_ATTR_I_PROTOCOL_KEY);
wpabuf_put_buf(msg, pi); // PI 公钥

// 3. 计算 ECDH 共享密钥 (Mx, Nx)
// 这里的 dpp_ecdh 使用了 Enrollee 的 Bootstrap Key (Peer BI) 和自己的 Protocol Key
// 这确保了只有拥有该 Bootstrap Key 私钥的人才能解开后续数据
dpp_ecdh(auth->own_protocol_key, auth->peer_bi->pubkey, ...);
```

#### Auth Response 处理 (Responder)
```c
// src/common/dpp_auth.c : dpp_auth_resp_rx

// 1. 解析对方发来的 Auth Request
// 提取 Initiator Protocol Key (P_I)

// 2. 自己的 Protocol Key (P_R)
auth->own_protocol_key = dpp_gen_keypair(auth->curve);

// 3. 执行 ECDH
// Nx = P_R (私钥) * P_I (公钥) -> 产生前向保密性
dpp_ecdh(auth->own_protocol_key, auth->peer_protocol_key, auth->Nx, ...);

// 4. 派生加密密钥 k1, k2, ke
dpp_derive_k1(auth->Mx, ...);
dpp_derive_k2(auth->Nx, ...);
dpp_derive_bk_ke(auth); // 生成 ke (Key Encryption Key)
```

**此时，双方拥有了共同的 `ke` (KEK)，用于加密后续的 Configuration 阶段。**

---

## 3. Configuration (生成并下发 netAccessKey)

**目标**: Configurator 生成入网凭证，并通过加密隧道 `ke` 发送给 Enrollee。

**代码位置**: `src/common/dpp.c`: `dpp_build_conf_obj`

configurator 从 `src/ap/dpp_hostapd.c` 的 `hostapd_dpp_gas_resp_cb` 被调用，开始构建配置对象。

```c
// src/common/dpp.c

static struct wpabuf *
dpp_build_conf_obj(struct dpp_authentication *auth, enum dpp_netrole netrole, ...)
{
    struct dpp_configuration *conf = ...; // 获取待下发的配置模板(SSID等)

    // 1. 生成 netAccessKey (核心步骤！)
    // 这是一个全新的 KeyPair，与之前的 Auth Protocol Key 无关。
    // 它就是设备以后的“入网身份证”。
    auth->own_protocol_key = dpp_gen_keypair(auth->curve); 
    // 注：代码里复用了 own_protocol_key 变量暂存这个 key，
    // 随后通过 dpp_copy_netaccesskey 复制到 conf_obj 结构中。
    dpp_copy_netaccesskey(auth, &auth->conf_obj[0]);
    
    // 2. 构建 Signed Connector
    // 这是一个 JSON 对象，包含 netAccessKey 的公钥、过期时间、Group ID。
    // 关键：使用 Configurator 的 C-sign-key 对其进行签名！
    
    // ... 构建 JSON 字符串 ...
    
    // 签名操作
    // 使用 conf->csign (私钥) 对 Connector 内容签名
    // 结果存入 signedConnector 字段
    
    // 3. 打包 Configuration Object
    // 包含: 
    // - netAccessKey (私钥! JSON Web Key 格式)
    // - signedConnector (公钥证书)
    // - C-sign-key (公钥, 信任根)
    // - SSID, Passphrase (传统兼容用)
    
    return conf_obj; 
    // 这个对象随后会被 Auth 阶段生成的 `ke` 加密发送。
}
```

---

## 4. Network Access (Peer Discovery & PMK 派生)

**目标**: Enrollee 拿到 `netAccessKey` 后，以此为凭证接入网络 (无需密码，直接派生 PMK)。

**代码位置**: `src/common/dpp.c`: `dpp_peer_intro`

当 Enrollee 扫描到 AP 或进行连接时，执行 Peer Discovery (DPP Network Introduction)。

```c
// src/common/dpp.c

int dpp_peer_intro(struct dpp_introduction *intro, const char *own_connector,
                   const u8 *net_access_key, ...)
{
    // 1. 加载自己的 netAccessKey (私钥)
    // 从 Config 阶段保存的数据中加载
    own_key = dpp_set_keypair(&own_curve, net_access_key, net_access_key_len);

    // 2. 解析对方 (AP) 的 Connector
    // 验证 Connector 的签名，确保它也是由同一个 Configurator (C-sign-key) 签发的。
    // 这保证了双方属于同一个 Group。
    res = dpp_check_signed_connector(&info, csign_key, ...);
    
    // 3. 解析对方的 netAccessKey (公钥)
    // 从 Connector 的 JSON Payload 中提取 "netAccessKey" 字段
    intro->peer_key = dpp_parse_jwk(netkey, &curve);
    
    // 4. 计算 ECDH 生成 PMK (核心步骤！)
    // 双方使用各自的 netAccessKey 进行协商
    // Nx = own_netAccessKey.priv * peer_netAccessKey.pub
    dpp_ecdh(own_key, intro->peer_key, Nx, &Nx_len);
    
    // 5. 派生 PMK
    // PMK = HKDF(..., "DPP PMK", Nx)
    dpp_derive_pmk(Nx, Nx_len, intro->pmk, curve->hash_len);
    
    // 6. 计算 PMKID
    // 用于 802.11 RSN 关联时的 Key 标识
    dpp_derive_pmkid(curve, own_key, intro->peer_key, intro->pmkid);
    
    return DPP_STATUS_OK;
}
```

**最终结果**: 
两个设备（Enrollee 和 AP）在没有任何预共享密钥 (PSK) 的情况下，仅凭 Configurator 签发的证书 (Connector) 和 对应私钥 (netAccessKey)，通过一次 ECDH 协商出了完全相同的 **PMK**。
这个 PMK 随后被传递给 hostapd/wpa_supplicant 的状态机，作为已认证的密钥，直接完成 4-way Handshake。
