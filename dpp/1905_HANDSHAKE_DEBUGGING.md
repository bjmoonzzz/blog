# 1905 握手 M1->M2 死循环问题排查指南

您遇到的现象是：**AP (Controller) 不断重发 M1 (Msg 1/4)，且能收到 M2，但就是不发 M3。**

这表明 AP **拒收 (Silently Discard)** 了 STA 发来的 M2。在 WPA 状态机中，如果收到的 M2 验证失败，AP 会保持在 `PTKSTART` 状态，超时后重发 M1。

以下是可能的原因及排查步骤，按可能性排序。

## 原因一：MIC 校验失败 (最常见)

AP 算出 PTK 后，会用其中的 KCK 校验 M2 帧末尾的 MIC。如果校验失败，说明 **AP 和 STA 生成的 PTK 不一致**。

*   **根本原因**: AP 和 STA 持有的 **PMK** 不一致。
*   **在 1905 场景下**:
    *   PMK 来自 DPP Bootstrapping。
    *   **检查点**: 确保两端 `wpa_sm_set_pmk` (STA) 和 `eap_1905_db_add_neighbor` (AP) 时注入的 PMK 是**字节级完全一致**的。
    *   **Debug 方法**: 在两端代码中打印 PMK 的 Hex dump。

## 原因二：RSN IE 不匹配 (Anti-Downgrade 机制)

这是 WPA 的安全机制。STA 在 M2 中携带的 RSN IE，必须与它在“关联阶段”发送给 AP 的 IE **完全一致**。

*   **问题**:
    *   在 1905 中，可能没有真正的“关联帧”。
    *   **AP 端**: 在 `eap1905` 中，您可能手动构造了一个 STA Entry，或者没有保存 STA 的 RSN IE。
    *   **STA 端**: 您调用 `wpa_sm_set_assoc_wpa_ie_default` 生成了一个 IE 放在 M2 里。
    *   **冲突**: 如果 AP 认为 STA 是 Open 系统，或者记录的 IE 为空，而 STA 发来的 M2 里却有 IE，匹配就会失败。
*   **现象**: `wpa_receive` 会打印 `WPA: RSN IE in EAPOL-Key does not match the one received in association`。
*   **解决**:
    *   确保 AP 端在初始化 STA (Fake Hostapd 逻辑) 时，**注入**了与 STA 侧一模一样的 RSN IE。
    *   或者，确保两端都配置为相同的 WPA2-CCMP 参数，生成的 Default IE 自然一致。

## 原因三：Replay Counter 错误

AP 发出的 M1 携带了一个 Key Replay Counter (例如 1)。它期望收到的 M2 携带**与其相同**的 Counter (也是 1)。

*   **问题**:
    *   如果 STA 端的 `wpa_sm_rx_eapol` 处理逻辑有问题，或者使用了旧的 Counter 回复。
    *   如果 AP 端在重发 M1 时增加了 Counter (变为 2)，但 STA 还在回上一条 M1 的包 (Counter 1)。
*   **现象**: `wpa_receive` 会打印 `WPA: Replay Counter does not match`。

## 原因四：状态机未就绪

如果 AP 的状态机虽然初始化了，但没有正确进入等待 M2 的状态。

*   **期望状态**: 发完 M1 后，AP 状态机应处于 `PTKSTART`。
*   **检查**: 确保 `wpa_auth_sm_event(WPA_ASSOC)` 已被正确触发。

---

## 调试建议 (Action Plan)

请在 `hostapd` (AP) 端开启 `-dd` (Double Debug) 日志，重点观察 `src/ap/wpa_auth.c` 中的输出。

1.  **搜索 "MIC"**:
    *   如果看到 `WPA: EAPOL-Key MIC check failed`，那就是 **PMK 不一致**。
2.  **搜索 "IE"**:
    *   如果看到 `WPA: RSN IE mismatch`，那就是 **ieee802_11 模拟关联流程的问题**。
3.  **搜索 "Replay"**:
    *   如果看到 `WPA: Invalid Replay Counter`，检查 UDP 乱序或重发逻辑。

**代码修改自查 (eap1905.c)**:
在调用 `wpa_receive` 之前，确保您传进去的 `wpa_state_machine *sm` 是正确的那个 Peer 的状态机。如果您管理了多个 Peer，别传错了。
