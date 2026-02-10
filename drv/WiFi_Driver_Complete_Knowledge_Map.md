# WiFi 驱动完整知识图谱与任务清单

## 📋 文档说明
本文档是对 WiFi 驱动项目的**完整知识图谱**，系统性地列出所有关键模块、技术点和学习路径。
基于对整个项目结构的深入分析，涵盖从底层硬件到上层应用的所有层次。

---

## 🎯 项目整体架构

### 双层架构设计
```
┌─────────────────────────────────────────────────────────┐
│  应用层 (hostapd/wpa_supplicant/iwpriv)                 │
└─────────────────────────────────────────────────────────┘
                         ↕
┌─────────────────────────────────────────────────────────┐
│  mt_wifi 层 (WiFi 协议栈 + 功能特性)                    │
│  - 802.11 协议实现                                       │
│  - AP/STA 模式管理                                       │
│  - 高级特性 (TWT/MBO/MAP/WPS 等)                        │
└─────────────────────────────────────────────────────────┘
                         ↕
┌─────────────────────────────────────────────────────────┐
│  wlan_hwifi 层 (硬件抽象层)                             │
│  - 芯片驱动                                              │
│  - MCU 通信                                              │
│  - 总线管理                                              │
└─────────────────────────────────────────────────────────┘
                         ↕
┌─────────────────────────────────────────────────────────┐
│  硬件层 (MT7990/MT7992 芯片 + 固件)                     │
└─────────────────────────────────────────────────────────┘
```

---

## 📚 知识模块分类 (共 15 大类，100+ 子模块)

### 【第一部分】底层硬件与驱动基础 (wlan_hwifi 层)

#### 1. 驱动框架与初始化
- [ ] 1.1 模块加载机制 (module_init/exit)
- [ ] 1.2 设备探测与注册流程
- [ ] 1.3 全局驱动管理器 (hwifi_drv)
- [ ] 1.4 设备树 (Device Tree) 解析
- [ ] 1.5 平台设备驱动模型
- [ ] 1.6 电源管理 (suspend/resume)
- [ ] 1.7 热插拔支持

#### 2. 总线层架构
- [ ] 2.1 总线抽象层设计
- [ ] 2.2 PCI/PCIe 总线驱动
  - [ ] 2.2.1 PCI 设备枚举
  - [ ] 2.2.2 BAR 空间映射
  - [ ] 2.2.3 MSI/MSI-X 中断
  - [ ] 2.2.4 DMA 映射与管理
- [ ] 2.3 AXI 总线驱动 (片上总线)
- [ ] 2.4 USB 总线驱动
- [ ] 2.5 SDIO 总线驱动
- [ ] 2.6 WED (Wireless Ethernet Dispatch) 加速
  - [ ] 2.6.1 WED 架构与原理
  - [ ] 2.6.2 TX/RX Offload
  - [ ] 2.6.3 与网络处理器集成
- [ ] 2.7 RRO (RX Reordering Offload)
- [ ] 2.8 NPU (Network Processing Unit) 集成

#### 3. 芯片驱动层
- [ ] 3.1 芯片管理框架
- [ ] 3.2 MT7990 芯片驱动
- [ ] 3.3 MT7992 芯片驱动
- [ ] 3.4 芯片能力查询 (hw_cap)
- [ ] 3.5 芯片寄存器操作
- [ ] 3.6 FMAC vs BMAC 架构
  - [ ] 3.6.1 FMAC (Full MAC) 实现
  - [ ] 3.6.2 BMAC (Basic MAC) 实现
  - [ ] 3.6.3 架构选择与差异
- [ ] 3.7 芯片复位与恢复
- [ ] 3.8 SER (System Error Recovery) 机制

#### 4. MCU 与固件通信
- [ ] 4.1 多 MCU 架构设计
- [ ] 4.2 WM MCU (WiFi Management)
  - [ ] 4.2.1 WM 固件功能
  - [ ] 4.2.2 WM 命令接口
  - [ ] 4.2.3 WM 事件处理
- [ ] 4.3 WA MCU (WiFi Accelerator)
  - [ ] 4.3.1 TXD 生成加速
  - [ ] 4.3.2 QoS 管理
- [ ] 4.4 WO MCU (WiFi Offload)
  - [ ] 4.4.1 RX 重排序
  - [ ] 4.4.2 BA 管理
- [ ] 4.5 DSP MCU (Digital Signal Processor)
  - [ ] 4.5.1 PHY 校准
  - [ ] 4.5.2 RF 控制
- [ ] 4.6 固件下载流程
  - [ ] 4.6.1 ROM Patch 下载
  - [ ] 4.6.2 RAM 固件下载
  - [ ] 4.6.3 固件验证机制
- [ ] 4.7 命令队列管理
- [ ] 4.8 事件队列管理
- [ ] 4.9 统一命令格式 (Unified Command)
- [ ] 4.10 固件日志收集

#### 5. DMA 与内存管理
- [ ] 5.1 DMA 映射与缓冲区管理
- [ ] 5.2 TX Ring 管理
- [ ] 5.3 RX Ring 管理
- [ ] 5.4 Token 机制详解
  - [ ] 5.4.1 TX Token 分配与回收
  - [ ] 5.4.2 RX Token 管理
  - [ ] 5.4.3 Token 池优化
- [ ] 5.5 SKB (Socket Buffer) 管理
- [ ] 5.6 内存池设计
- [ ] 5.7 零拷贝技术

#### 6. 中断处理
- [ ] 6.1 中断注册与分发
- [ ] 6.2 NAPI 轮询机制
- [ ] 6.3 中断合并 (Interrupt Coalescing)
- [ ] 6.4 中断亲和性 (IRQ Affinity)
- [ ] 6.5 软中断处理

#### 7. 硬件资源管理
- [ ] 7.1 WCID (Wireless Client ID) 管理
- [ ] 7.2 OMAC (Own MAC) 管理
- [ ] 7.3 BSS Index 管理
- [ ] 7.4 Band Index 管理
- [ ] 7.5 IDR (ID Radix) 管理器
- [ ] 7.6 硬件队列管理

---

### 【第二部分】WiFi 协议栈 (mt_wifi 层)

#### 8. 核心协议实现
- [ ] 8.1 802.11 MAC 层实现
- [ ] 8.2 MLME (MAC Layer Management Entity)
  - [ ] 8.2.1 状态机设计
  - [ ] 8.2.2 认证流程
  - [ ] 8.2.3 关联流程
  - [ ] 8.2.4 漫游处理
- [ ] 8.3 帧处理
  - [ ] 8.3.1 管理帧 (Management Frame)
  - [ ] 8.3.2 控制帧 (Control Frame)
  - [ ] 8.3.3 数据帧 (Data Frame)
- [ ] 8.4 Beacon 管理
  - [ ] 8.4.1 Beacon 生成与发送
  - [ ] 8.4.2 TIM (Traffic Indication Map)
  - [ ] 8.4.3 DTIM (Delivery TIM)
  - [ ] 8.4.4 Beacon 更新机制
- [ ] 8.5 Probe Request/Response
- [ ] 8.6 Association/Reassociation
- [ ] 8.7 Disassociation/Deauthentication

#### 9. 数据包处理
- [ ] 9.1 TX 数据路径完整流程
  - [ ] 9.1.1 从网络栈接收
  - [ ] 9.1.2 队列选择 (WMM)
  - [ ] 9.1.3 加密处理
  - [ ] 9.1.4 聚合处理
  - [ ] 9.1.5 TXD/TXP 构造
  - [ ] 9.1.6 DMA 传输
  - [ ] 9.1.7 TX 完成处理
- [ ] 9.2 RX 数据路径完整流程
  - [ ] 9.2.1 DMA 接收
  - [ ] 9.2.2 RXD 解析
  - [ ] 9.2.3 解密处理
  - [ ] 9.2.4 重排序处理
  - [ ] 9.2.5 解聚合处理
  - [ ] 9.2.6 提交到网络栈
- [ ] 9.3 QoS (Quality of Service)
  - [ ] 9.3.1 WMM (WiFi Multimedia)
  - [ ] 9.3.2 EDCA (Enhanced Distributed Channel Access)
  - [ ] 9.3.3 TID 映射
  - [ ] 9.3.4 AC 队列管理
- [ ] 9.4 聚合技术
  - [ ] 9.4.1 AMSDU (Aggregated MSDU)
  - [ ] 9.4.2 AMPDU (Aggregated MPDU)
  - [ ] 9.4.3 Block Ack 机制
  - [ ] 9.4.4 重排序缓冲区

#### 10. 安全机制
- [ ] 10.1 加密算法
  - [ ] 10.1.1 WEP
  - [ ] 10.1.2 TKIP
  - [ ] 10.1.3 CCMP (AES)
  - [ ] 10.1.4 GCMP
  - [ ] 10.1.5 GCMP-256
- [ ] 10.2 认证协议
  - [ ] 10.2.1 Open System
  - [ ] 10.2.2 Shared Key
  - [ ] 10.2.3 WPA/WPA2-PSK
  - [ ] 10.2.4 WPA/WPA2-Enterprise (802.1X)
  - [ ] 10.2.5 WPA3-SAE
  - [ ] 10.2.6 OWE (Opportunistic Wireless Encryption)
- [ ] 10.3 密钥管理
  - [ ] 10.3.1 PTK (Pairwise Transient Key)
  - [ ] 10.3.2 GTK (Group Temporal Key)
  - [ ] 10.3.3 IGTK (Integrity Group Temporal Key)
  - [ ] 10.3.4 密钥派生
  - [ ] 10.3.5 密钥重协商
- [ ] 10.4 PMF (Protected Management Frames)
- [ ] 10.5 SAE (Simultaneous Authentication of Equals)


#### 11. 工作模式
- [ ] 11.1 AP (Access Point) 模式
  - [ ] 11.1.1 AP 初始化
  - [ ] 11.1.2 STA 管理
  - [ ] 11.1.3 MBSS (Multiple BSS)
  - [ ] 11.1.4 隐藏 SSID
  - [ ] 11.1.5 MAC 过滤
  - [ ] 11.1.6 速率限制
- [ ] 11.2 STA (Station) 模式
  - [ ] 11.2.1 扫描机制
  - [ ] 11.2.2 BSS 选择
  - [ ] 11.2.3 连接流程
  - [ ] 11.2.4 漫游处理
  - [ ] 11.2.5 省电模式
- [ ] 11.3 APCLI (AP Client) 模式
  - [ ] 11.3.1 Repeater 功能
  - [ ] 11.3.2 桥接模式
  - [ ] 11.3.3 多 APCLI 支持
- [ ] 11.4 WDS (Wireless Distribution System)
  - [ ] 11.4.1 4 地址模式
  - [ ] 11.4.2 WDS 表管理
  - [ ] 11.4.3 桥接与路由模式
- [ ] 11.5 Monitor 模式
  - [ ] 11.5.1 混杂模式
  - [ ] 11.5.2 Radiotap 头部
  - [ ] 11.5.3 Prism 头部
- [ ] 11.6 Mesh 模式

#### 12. 信道与频谱管理
- [ ] 12.1 信道扫描
  - [ ] 12.1.1 主动扫描
  - [ ] 12.1.2 被动扫描
  - [ ] 12.1.3 后台扫描
  - [ ] 12.1.4 Off-Channel 扫描
- [ ] 12.2 自动信道选择 (ACS)
  - [ ] 12.2.1 信道质量评估
  - [ ] 12.2.2 干扰检测
  - [ ] 12.2.3 负载均衡
- [ ] 12.3 DFS (Dynamic Frequency Selection)
  - [ ] 12.3.1 雷达检测
  - [ ] 12.3.2 CAC (Channel Availability Check)
  - [ ] 12.3.3 信道切换
  - [ ] 12.3.4 NOP (Non-Occupancy Period)
- [ ] 12.4 CSA (Channel Switch Announcement)
- [ ] 12.5 频段支持
  - [ ] 12.5.1 2.4GHz 频段
  - [ ] 12.5.2 5GHz 频段
  - [ ] 12.5.3 6GHz 频段 (WiFi 6E)
- [ ] 12.6 带宽管理
  - [ ] 12.6.1 20MHz
  - [ ] 12.6.2 40MHz
  - [ ] 12.6.3 80MHz
  - [ ] 12.6.4 160MHz
  - [ ] 12.6.5 320MHz (WiFi 7)
- [ ] 12.7 DBDC (Dual Band Dual Concurrent)
- [ ] 12.8 AFC (Automated Frequency Coordination) - 6GHz

#### 13. PHY 层特性
- [ ] 13.1 802.11a/b/g (Legacy)
- [ ] 13.2 802.11n (HT - High Throughput)
  - [ ] 13.2.1 HT Capabilities
  - [ ] 13.2.2 HT Operation
  - [ ] 13.2.3 MIMO (Multiple Input Multiple Output)
  - [ ] 13.2.4 Short GI (Guard Interval)
  - [ ] 13.2.5 40MHz 带宽
- [ ] 13.3 802.11ac (VHT - Very High Throughput)
  - [ ] 13.3.1 VHT Capabilities
  - [ ] 13.3.2 VHT Operation
  - [ ] 13.3.3 MU-MIMO
  - [ ] 13.3.4 80/160MHz 带宽
  - [ ] 13.3.5 256-QAM
- [ ] 13.4 802.11ax (HE - High Efficiency / WiFi 6)
  - [ ] 13.4.1 HE Capabilities
  - [ ] 13.4.2 HE Operation
  - [ ] 13.4.3 OFDMA
  - [ ] 13.4.4 BSS Color
  - [ ] 13.4.5 TWT (Target Wake Time)
  - [ ] 13.4.6 MU-EDCA
  - [ ] 13.4.7 Spatial Reuse
  - [ ] 13.4.8 1024-QAM
- [ ] 13.5 802.11be (EHT - Extremely High Throughput / WiFi 7)
  - [ ] 13.5.1 EHT Capabilities
  - [ ] 13.5.2 EHT Operation
  - [ ] 13.5.3 MLO (Multi-Link Operation)
  - [ ] 13.5.4 320MHz 带宽
  - [ ] 13.5.5 4096-QAM
  - [ ] 13.5.6 Multi-RU
  - [ ] 13.5.7 Enhanced MU-MIMO
- [ ] 13.6 TxBF (Transmit Beamforming)
  - [ ] 13.6.1 Explicit Beamforming
  - [ ] 13.6.2 Implicit Beamforming
  - [ ] 13.6.3 Sounding 过程
  - [ ] 13.6.4 Beamforming 校准
- [ ] 13.7 速率控制 (Rate Adaptation)
  - [ ] 13.7.1 Minstrel 算法
  - [ ] 13.7.2 固定速率
  - [ ] 13.7.3 速率统计
- [ ] 13.8 功率控制
  - [ ] 13.8.1 TPC (Transmit Power Control)
  - [ ] 13.8.2 功率表管理
  - [ ] 13.8.3 温度补偿

---

### 【第三部分】高级特性与功能

#### 14. WiFi 6/6E/7 特性
- [ ] 14.1 TWT (Target Wake Time)
  - [ ] 14.1.1 Individual TWT
  - [ ] 14.1.2 Broadcast TWT
  - [ ] 14.1.3 TWT 协商
  - [ ] 14.1.4 TWT 调度
  - [ ] 14.1.5 省电优化
- [ ] 14.2 OFDMA (Orthogonal Frequency Division Multiple Access)
  - [ ] 14.2.1 RU (Resource Unit) 分配
  - [ ] 14.2.2 UL OFDMA
  - [ ] 14.2.3 DL OFDMA
  - [ ] 14.2.4 Trigger Frame
- [ ] 14.3 BSS Color
  - [ ] 14.3.1 Color 分配
  - [ ] 14.3.2 Color 冲突检测
  - [ ] 14.3.3 Color 变更
- [ ] 14.4 Spatial Reuse
  - [ ] 14.4.1 OBSS PD (Overlapping BSS Preamble Detection)
  - [ ] 14.4.2 SRP (Spatial Reuse Parameter)
- [ ] 14.5 MU-EDCA (Multi-User EDCA)
- [ ] 14.6 UORA (Uplink OFDMA Random Access)
- [ ] 14.7 MLO (Multi-Link Operation)
  - [ ] 14.7.1 MLD (Multi-Link Device) 管理
  - [ ] 14.7.2 链路建立与拆除
  - [ ] 14.7.3 跨链路聚合
  - [ ] 14.7.4 链路选择策略
  - [ ] 14.7.5 EMLSR (Enhanced Multi-Link Single Radio)
  - [ ] 14.7.6 EMLMR (Enhanced Multi-Link Multi Radio)
  - [ ] 14.7.7 STR (Simultaneous Transmit and Receive)
  - [ ] 14.7.8 NSTR (Non-Simultaneous Transmit and Receive)
- [ ] 14.8 Multi-RU
- [ ] 14.9 Punctured Preamble
- [ ] 14.10 T2LM (TID-to-Link Mapping)

#### 15. 企业级特性
- [ ] 15.1 Fast Roaming
  - [ ] 15.1.1 802.11r (FT - Fast Transition)
  - [ ] 15.1.2 802.11k (RRM - Radio Resource Management)
  - [ ] 15.1.3 802.11v (WNM - Wireless Network Management)
  - [ ] 15.1.4 OKC (Opportunistic Key Caching)
  - [ ] 15.1.5 PMK Caching
- [ ] 15.2 802.11k RRM
  - [ ] 15.2.1 Beacon Report
  - [ ] 15.2.2 Channel Load Report
  - [ ] 15.2.3 Noise Histogram Report
  - [ ] 15.2.4 Link Measurement
  - [ ] 15.2.5 Neighbor Report
- [ ] 15.3 802.11v WNM
  - [ ] 15.3.1 BSS Transition Management
  - [ ] 15.3.2 DMS (Directed Multicast Service)
  - [ ] 15.3.3 FMS (Flexible Multicast Service)
  - [ ] 15.3.4 Sleep Mode
  - [ ] 15.3.5 TFS (Traffic Filtering Service)
- [ ] 15.4 802.11u Interworking
  - [ ] 15.4.1 GAS (Generic Advertisement Service)
  - [ ] 15.4.2 ANQP (Access Network Query Protocol)
  - [ ] 15.4.3 Hotspot 2.0 (Passpoint)
- [ ] 15.5 MBO (Multi-Band Operation)
  - [ ] 15.5.1 Non-Preferred Channel Report
  - [ ] 15.5.2 Cellular Data Capability
  - [ ] 15.5.3 Association Disallowed
  - [ ] 15.5.4 BTM (BSS Transition Management)
- [ ] 15.6 OCE (Optimized Connectivity Experience)
  - [ ] 15.6.1 FILS (Fast Initial Link Setup)
  - [ ] 15.6.2 Reduced Neighbor Report
  - [ ] 15.6.3 Probe Response Suppression
- [ ] 15.7 WPS (WiFi Protected Setup)
  - [ ] 15.7.1 PIN 方式
  - [ ] 15.7.2 PBC (Push Button Configuration)
  - [ ] 15.7.3 Registrar/Enrollee
- [ ] 15.8 WMM (WiFi Multimedia)
  - [ ] 15.8.1 AC 队列
  - [ ] 15.8.2 TSPEC (Traffic Specification)
  - [ ] 15.8.3 ADDTS/DELTS
  - [ ] 15.8.4 Admission Control

#### 16. 网络功能
- [ ] 16.1 组播优化
  - [ ] 16.1.1 IGMP Snooping
  - [ ] 16.1.2 MLD Snooping (IPv6)
  - [ ] 16.1.3 组播转单播
  - [ ] 16.1.4 组播速率控制
- [ ] 16.2 桥接功能
  - [ ] 16.2.1 Linux Bridge 集成
  - [ ] 16.2.2 STP (Spanning Tree Protocol)
  - [ ] 16.2.3 VLAN 支持
  - [ ] 16.2.4 MAC 学习
- [ ] 16.3 NAT/路由
  - [ ] 16.3.1 MAT (MAC Address Translation)
  - [ ] 16.3.2 IPv4 NAT
  - [ ] 16.3.3 IPv6 路由
  - [ ] 16.3.4 PPPoE 支持
- [ ] 16.4 QoS 管理
  - [ ] 16.4.1 带宽限制
  - [ ] 16.4.2 流量整形
  - [ ] 16.4.3 优先级队列
  - [ ] 16.4.4 DABS QoS
- [ ] 16.5 负载均衡
  - [ ] 16.5.1 Band Steering
  - [ ] 16.5.2 Client Steering
  - [ ] 16.5.3 Airtime Fairness
- [ ] 16.6 Mesh 网络
  - [ ] 16.6.1 Mesh 路由
  - [ ] 16.6.2 Mesh 转发
  - [ ] 16.6.3 Mesh 安全

#### 17. 管理与配置
- [ ] 17.1 配置接口
  - [ ] 17.1.1 iwpriv 命令
  - [ ] 17.1.2 ioctl 接口
  - [ ] 17.1.3 sysfs 接口
  - [ ] 17.1.4 debugfs 接口
  - [ ] 17.1.5 netlink 接口
- [ ] 17.2 配置文件
  - [ ] 17.2.1 Profile 解析
  - [ ] 17.2.2 参数验证
  - [ ] 17.2.3 动态配置
- [ ] 17.3 统计信息
  - [ ] 17.3.1 TX/RX 统计
  - [ ] 17.3.2 错误统计
  - [ ] 17.3.3 性能统计
  - [ ] 17.3.4 MIB 计数器
- [ ] 17.4 日志系统
  - [ ] 17.4.1 日志级别
  - [ ] 17.4.2 日志分类
  - [ ] 17.4.3 固件日志
  - [ ] 17.4.4 Trace 功能

#### 18. 测试与验证
- [ ] 18.1 ATE (Automatic Test Equipment)
  - [ ] 18.1.1 TX 测试
  - [ ] 18.1.2 RX 测试
  - [ ] 18.1.3 校准流程
  - [ ] 18.1.4 RF 测试
- [ ] 18.2 DVT (Design Verification Test)
  - [ ] 18.2.1 功能验证
  - [ ] 18.2.2 性能验证
  - [ ] 18.2.3 压力测试
- [ ] 18.3 Sniffer 功能
  - [ ] 18.3.1 抓包接口
  - [ ] 18.3.2 过滤规则
  - [ ] 18.3.3 Wireshark 集成
- [ ] 18.4 性能测试
  - [ ] 18.4.1 吞吐量测试
  - [ ] 18.4.2 延迟测试
  - [ ] 18.4.3 并发测试
  - [ ] 18.4.4 稳定性测试

#### 19. 高级应用
- [ ] 19.1 MAP (Multi-AP)
  - [ ] 19.1.1 Controller/Agent 架构
  - [ ] 19.1.2 Topology Discovery
  - [ ] 19.1.3 Steering 策略
  - [ ] 19.1.4 Backhaul 优化
  - [ ] 19.1.5 MAP R1/R2/R3/R4
- [ ] 19.2 WHC (WiFi Home Connect)
- [ ] 19.3 WAPP (WiFi Application)
- [ ] 19.4 Band Steering
  - [ ] 19.4.1 2.4G/5G 切换
  - [ ] 19.4.2 RSSI 阈值
  - [ ] 19.4.3 负载感知
- [ ] 19.5 Airtime Fairness
- [ ] 19.6 VOW (Video Over WiFi)
  - [ ] 19.6.1 视频流优化
  - [ ] 19.6.2 QoS 保证
  - [ ] 19.6.3 带宽预留

---

### 【第四部分】系统集成与优化

#### 20. 操作系统集成
- [ ] 20.1 Linux 内核接口
  - [ ] 20.1.1 网络设备驱动模型
  - [ ] 20.1.2 字符设备接口
  - [ ] 20.1.3 平台设备驱动
- [ ] 20.2 网络栈集成
  - [ ] 20.2.1 sk_buff 处理
  - [ ] 20.2.2 netdev_ops 实现
  - [ ] 20.2.3 ethtool 支持
  - [ ] 20.2.4 TC (Traffic Control) 集成
- [ ] 20.3 用户空间接口
  - [ ] 20.3.1 nl80211/cfg80211
  - [ ] 20.3.2 Wireless Extensions
  - [ ] 20.3.3 hostapd 集成
  - [ ] 20.3.4 wpa_supplicant 集成
- [ ] 20.4 文件系统
  - [ ] 20.4.1 /proc 接口
  - [ ] 20.4.2 /sys 接口
  - [ ] 20.4.3 debugfs 接口
  - [ ] 20.4.4 固件文件加载

#### 21. 性能优化
- [ ] 21.1 CPU 优化
  - [ ] 21.1.1 中断亲和性
  - [ ] 21.1.2 NAPI 调优
  - [ ] 21.1.3 RPS/RFS
  - [ ] 21.1.4 XPS (Transmit Packet Steering)
- [ ] 21.2 内存优化
  - [ ] 21.2.1 内存池
  - [ ] 21.2.2 零拷贝
  - [ ] 21.2.3 DMA 优化
  - [ ] 21.2.4 缓存对齐
- [ ] 21.3 吞吐量优化
  - [ ] 21.3.1 聚合优化
  - [ ] 21.3.2 队列深度调整
  - [ ] 21.3.3 批处理
  - [ ] 21.3.4 硬件加速
- [ ] 21.4 延迟优化
  - [ ] 21.4.1 快速路径
  - [ ] 21.4.2 优先级队列
  - [ ] 21.4.3 中断延迟
- [ ] 21.5 功耗优化
  - [ ] 21.5.1 动态功率管理
  - [ ] 21.5.2 省电模式
  - [ ] 21.5.3 唤醒优化

#### 22. 调试与诊断
- [ ] 22.1 调试工具
  - [ ] 22.1.1 debugfs 接口
  - [ ] 22.1.2 trace 工具
  - [ ] 22.1.3 dump 工具
  - [ ] 22.1.4 寄存器读写
- [ ] 22.2 日志分析
  - [ ] 22.2.1 内核日志
  - [ ] 22.2.2 驱动日志
  - [ ] 22.2.3 固件日志
  - [ ] 22.2.4 性能日志
- [ ] 22.3 问题诊断
  - [ ] 22.3.1 连接问题
  - [ ] 22.3.2 性能问题
  - [ ] 22.3.3 稳定性问题
  - [ ] 22.3.4 兼容性问题
- [ ] 22.4 Crash 分析
  - [ ] 22.4.1 Kernel Panic
  - [ ] 22.4.2 Oops 分析
  - [ ] 22.4.3 固件 Crash
  - [ ] 22.4.4 内存泄漏

---

## 📖 学习路径规划

### 阶段一：基础入门 (1-2 周)
**目标**: 理解驱动整体架构和基本流程

1. **驱动框架** (2-3 天)
   - 模块加载流程
   - 设备注册流程
   - 全局数据结构

2. **总线层** (2-3 天)
   - PCI 驱动基础
   - DMA 基本概念
   - 中断处理基础

3. **数据路径** (3-4 天)
   - TX 基本流程
   - RX 基本流程
   - Token 机制

4. **MCU 通信** (2-3 天)
   - 固件下载
   - 命令发送
   - 事件接收

### 阶段二：协议栈深入 (2-3 周)
**目标**: 掌握 WiFi 协议实现

1. **MLME 状态机** (3-4 天)
   - 认证流程
   - 关联流程
   - 状态转换

2. **帧处理** (3-4 天)
   - 管理帧
   - 控制帧
   - 数据帧

3. **安全机制** (3-4 天)
   - 加密算法
   - 认证协议
   - 密钥管理

4. **QoS 与聚合** (2-3 天)
   - WMM
   - AMSDU/AMPDU
   - Block Ack

### 阶段三：高级特性 (3-4 周)
**目标**: 掌握 WiFi 6/7 和企业特性

1. **WiFi 6/7 特性** (1-2 周)
   - HE/EHT 协议
   - TWT
   - OFDMA
   - MLO

2. **企业特性** (1 周)
   - Fast Roaming
   - 802.11k/v/r
   - MBO/OCE

3. **高级应用** (1 周)
   - MAP
   - Band Steering
   - VOW

### 阶段四：系统优化 (1-2 周)
**目标**: 性能调优和问题诊断

1. **性能优化** (3-4 天)
   - CPU 优化
   - 内存优化
   - 吞吐量优化

2. **调试诊断** (3-4 天)
   - 调试工具使用
   - 日志分析
   - 问题定位

---

## 📝 文档编写计划

基于以上知识图谱，计划编写以下系列文档：

### 系列 1: 底层硬件驱动 (10-12 篇)
1. 驱动框架与初始化详解
2. 总线层架构深入分析
3. 芯片驱动实现 (FMAC vs BMAC)
4. MCU 多核架构与固件通信
5. DMA 与 Token 机制详解
6. 中断处理与 NAPI 优化
7. 硬件资源管理 (WCID/OMAC/BSS)
8. WED 硬件加速原理
9. RRO 重排序卸载
10. SER 系统错误恢复

### 系列 2: WiFi 协议栈 (15-18 篇)
1. MLME 状态机完整解析
2. Beacon 管理机制
3. 管理帧处理流程
4. 数据包 TX 路径详解
5. 数据包 RX 路径详解
6. QoS 与 WMM 实现
7. AMSDU/AMPDU 聚合技术
8. Block Ack 重排序机制
9. 安全加密实现
10. WPA/WPA2/WPA3 认证
11. 信道管理与 DFS
12. 自动信道选择 (ACS)
13. AP 模式实现
14. STA 模式实现
15. WDS 与 4 地址转换

### 系列 3: WiFi 6/7 特性 (8-10 篇)
1. 802.11ax (WiFi 6) 完整解析
2. TWT 目标唤醒时间
3. OFDMA 与 RU 分配
4. BSS Color 机制
5. Spatial Reuse 空间复用
6. 802.11be (WiFi 7) 新特性
7. MLO 多链路操作详解
8. Multi-RU 与 Punctured Preamble

### 系列 4: 企业与高级特性 (10-12 篇)
1. Fast Roaming 快速漫游
2. 802.11k RRM 无线资源管理
3. 802.11v WNM 网络管理
4. 802.11r FT 快速切换
5. MBO 多频段操作
6. OCE 优化连接体验
7. Hotspot 2.0 (Passpoint)
8. MAP 多 AP 协同
9. Band Steering 频段引导
10. VOW 视频优化

### 系列 5: 系统集成与优化 (6-8 篇)
1. Linux 内核集成
2. 用户空间接口 (nl80211/cfg80211)
3. 性能优化技术
4. 调试工具与方法
5. 问题诊断与排查
6. 测试验证方法

---

## 🎯 下一步行动

### 立即开始
1. **补充现有文档** - 基于知识图谱补充已有的 6 篇文档
2. **编写系列 1** - 从底层硬件驱动开始，逐步深入
3. **建立索引** - 创建完整的文档索引和交叉引用

### 优先级排序
**高优先级** (核心必学):
- 驱动框架与初始化
- 数据包 TX/RX 路径
- MCU 通信机制
- MLME 状态机
- 安全机制

**中优先级** (深入理解):
- 总线层实现
- Token 管理
- QoS 与聚合
- 信道管理
- WiFi 6/7 特性

**低优先级** (按需学习):
- 高级企业特性
- 特定应用场景
- 性能调优技巧

---

## 📊 知识图谱统计

- **总模块数**: 22 大类
- **子模块数**: 100+ 个
- **预计文档数**: 50-60 篇
- **预计总字数**: 50-60 万字
- **学习周期**: 2-3 个月 (全职学习)

---

**文档版本**: 1.0  
**创建日期**: 2026-02-09  
**状态**: 知识图谱已完成，文档编写进行中
