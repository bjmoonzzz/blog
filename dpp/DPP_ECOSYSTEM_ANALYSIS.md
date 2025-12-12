# DPP/EasyMesh 生态全貌解析

您从单个函数延伸到了整个生态系统的运作机制，问到了最本质的信任传递问题。

## 1. 角色与信任源 (The Trust Anchor)

一切始于 **Configurator** (通常是主控制器 Controller)。

*   **Configurator 必须有**: 一个 **Configurator Instance**。
*   **Configurator Instance 必须有**: 一把 **C-Sign-Key 私钥**。
*   **创建方式**:
    1.  **Hostapd 自动生成**: 如果配置了 `dpp_configurator_params`，启动时会自动生成。
    2.  **外部命令创建 (Map 下发)**:
        *   命令: `hostapd_cli dpp_configurator_add`
        *   作用: 让 hostapd 生成一个新的 C-Sign-Key (Priv/Pub)。
        *   **注意**: 这里的 Key 是生成在 hostapd 内存里的。如果 Controller 挂了重启，为了保持信任链不断（不用重配所有 Agent），通常需要把生成的 Key (C-Sign-Key Private) 持久化保存，下次启动时通过命令再注入进去。

## 2. 组网之后，Agent 获得了什么？

当一台新设备 (Agent/Enrollee) 通过 DPP 成功配网后，它不仅仅是拿到了 Wi-Fi 密码，它获得了一整套**身份证明**：

### A. 它获得的私货 (Privates)
1.  **netAccessKey (私钥)**:
    *   **来源**: 在配网过程中，Agent 自己（或者 Configurator 帮它）生成的。
    *   **作用**: 这是它的**身份证私钥**。哪怕 Wi-Fi 密码改了，只要私钥在，它就是这个 Mesh 网络的一员。
2.  **C-Sign-Key (公钥)**:
    *   **来源**: Configurator 给的。
    *   **作用**: 用来**验明正身**。以后任何人拿 Connector 出来，Agent 就用这个公钥验证：“这是咱 Controller 签发的吗？”

### B. 它获得公货 (Publics / Connector)
Configurator 会发给它一个 **Signed Connector**，这就好比 Controller 给它盖了章的**员工工牌**。

*   **工牌内容**:
    *   **netAccessKey (公钥)**: “这是我的公钥，大家请认准。”
    *   **Groups**: “我属于 'FamilyMesh' 组，我是 AP 角色。”
    *   **Expiry**: “有效期到 2099 年。”
*   **工牌签名**: 上述内容被 **C-Sign-Key (私钥)** 签名保护，防篡改。

## 3. 全局生态图解

```mermaid
graph TD
    subgraph Controller [Configurator]
        PrivKey[C-Sign-Key 私钥]
    end

    subgraph Agent_A [设备 A]
        A_Priv[netAccessKey 私钥]
        A_Conn[Connector (含A公钥, 由Controller签名)]
        Trust[C-Sign-Key 公钥]
    end

    subgraph Agent_B [设备 B]
        B_Priv[netAccessKey 私钥]
        B_Conn[Connector (含B公钥, 由Controller签名)]
        Trust2[C-Sign-Key 公钥]
    end

    Controller -->|颁发| A_Conn
    Controller -->|下发| Trust
    Controller -->|颁发| B_Conn
    Controller -->|下发| Trust2
```

## 4. 1905 握手时的交互

当 Agent A 和 Agent B 想要建立加密回程 (Backhaul) 时：

1.  **亮牌**:
    *   A 把 `A_Conn` 扔给 B。
    *   B 把 `B_Conn` 扔给 A。
2.  **验牌**:
    *   A 用手里的 `C-Sign-Key 公钥` 验证 `B_Conn` 的签名。**通了！** (确定 B 是 Controller 认证的好人)。
    *   B 用手里的 `C-Sign-Key 公钥` 验证 `A_Conn` 的签名。**通了！**
3.  **算号**:
    *   A 拿出自己的 `A_Priv` 和 Connector 里的 `B_Pub` 算出一个 Key。
    *   B 拿出自己的 `B_Priv` 和 Connector 里的 `A_Pub` 算出一个 Key。
    *   由 ECDH 原理，**这一对 Key 是一模一样的** (即 PMK)。

通过这套机制，整个 Mesh 网络实现了 **"One Trust Anchor, Any-to-Any Security"**。只要大家都信任 Controller，大家就都互相因为信任。
