# WiFi 驱动架构全面分析指南

## 目录
1. [驱动概述](#1-驱动概述)
2. [驱动加载到内核](#2-驱动加载到内核)
3. [核心架构与模块](#3-核心架构与模块)
4. [驱动与各模块通信](#4-驱动与各模块通信)
5. [无线收发包路径](#5-无线收发包路径)
6. [支持的无线特性](#6-支持的无线特性)

---

## 1. 驱动概述

### 1.1 项目结构
这是一个 MediaTek 无线芯片驱动项目，采用**双层架构**设计：

```
项目根目录/
├── wlan_hwifi/          # 硬件抽象层 (HAL) - 芯片相关
│   ├── main.c/h         # 驱动入口
│   ├── bus/             # 总线驱动 (PCI/AXI/USB/SDIO)
│   ├── chips/           # 芯片特定实现 (MT7990/MT7992)
│   ├── mcu/             # MCU/固件通信
│   └── interface/       # MAC接口层
│
└── mt_wifi/             # 协议栈层 - WiFi协议实现
    ├── os/linux/        # Linux 系统接口
    ├── common/          # 通用功能
    ├── ap/              # AP 模式
    ├── sta/             # STA 模式
    └── protocol/        # 802.11 协议实现
```

### 1.2 支持的芯片
- MT7990 系列
- MT7992 系列
- 支持 WiFi 6E/7 (802.11be)

### 1.3 支持的总线接口
- PCI/PCIe
- AXI (片上总线)
- USB
- SDIO

---

## 2. 驱动加载到内核

### 2.1 模块入口点

**文件位置**: `wlan_hwifi/main.c`

```c
// 模块初始化入口
module_init(hwifi_drv_init)

// 模块卸载入口
module_exit(hwifi_drv_exit)
```

### 2.2 初始化流程详解

#### 阶段 1: 驱动框架初始化
```
hwifi_drv_init()
  ├── hwifi_drv_register_debugfs()  // 注册 debugfs
  ├── bus_init()                     // 初始化总线管理器
  ├── interface_init()               // 初始化接口管理器
  ├── chip_init()                    // 初始化芯片管理器
  └── wsys_init()                    // 初始化 WiFi 系统管理器
```

#### 阶段 2: 设备注册流程
```
hwifi_register_device()
  ├── wsys_register_device()         // 注册 WiFi 系统设备
  ├── hwifi_init_device()            // 初始化硬件设备
  │   ├── hw_chip_reset()            // 芯片复位
  │   ├── hw_reset()                 // WiFi 子系统复位
  │   ├── hw_init()                  // 硬件 MAC TX/RX 初始化
  │   ├── mcu_hw_ops_init()          // MCU 硬件操作初始化
  │   ├── hdev_ops_init()            // 设备操作初始化
  │   ├── mcu_init_device()          // MCU 设备初始化
  │   ├── hwctrl_init_device()       // 硬件控制层初始化
  │   └── dbg_init_device()          // 调试模块初始化
  └── interface_register_device()    // 注册 MAC 接口设备
```

#### 阶段 3: 网络设备注册
```
mt_wifi 层初始化 (rt_main_dev.c)
  ├── RTMPAllocAdapterBlock()            // 分配适配器结构
  ├── RtmpOSNetDevAttach()               // 附加网络设备
  └── register_netdev()                  // 注册到内核网络子系统
```


### 2.3 关键数据结构

#### 全局驱动结构
```c
// wlan_hwifi/main.h
struct hwifi_drv {
    struct interface_mgmt inf;    // 接口管理器
    struct bus_mgmt bus;          // 总线管理器
    struct chip_mgmt chips;       // 芯片管理器
    struct wsys_mgmt wsys;        // WiFi 系统管理器
    struct dentry *debugfs_dir;       // debugfs 根目录
};

// 全局单例
static struct hwifi_drv hwifi_drv;
```

#### 硬件设备结构
```c
// wlan_hwifi/core.h
struct hw_dev {
    struct chip *chip;            // 芯片信息
    struct bus_trans *trans;      // 总线传输实体
    struct hw_ops *ops;           // 硬件操作回调
    struct mcu_ctrl mcu;          // MCU 控制器
    struct hw_ctrl hw_ctrl;       // 硬件控制器
    struct hw_phy_mgmt phy_mgmt;  // PHY 管理器
    unsigned long state;              // 设备状态标志
    // ... 更多字段
};

// 设备状态标志
#define HWIFI_STATE_RUNNING    0      // 设备运行中
#define HWIFI_STATE_SUSPEND    1      // 设备挂起
#define HWIFI_STATE_RESET      2      // 设备复位中
```

### 2.4 设备树 (Device Tree) 支持

对于 AXI 总线（片上总线），驱动支持通过设备树进行配置：

```dts
// 设备树示例
wifi@18000000 {
    compatible = "mediatek,mt7992-wifi";
    reg = <0x18000000 0x100000>;
    interrupts = <GIC_SPI 213 IRQ_TYPE_LEVEL_HIGH>;
    
    memory-region = <&wifi_reserved>;
    
    mediatek,wed = <&wed0>;
    mediatek,wed-pcie = <&pcie0>;
    
    status = "okay";
};
```

**关键属性**:
- `compatible`: 芯片兼容性字符串
- `reg`: 寄存器基地址和大小
- `interrupts`: 中断配置
- `memory-region`: 预留内存区域
- `mediatek,wed`: WED 硬件加速器引用

### 2.5 平台设备驱动模型

对于非 PCI 设备（如 AXI），使用 Linux 平台设备驱动模型：

```c
// 平台驱动结构
static struct platform_driver axi_driver = {
    .probe = axi_probe,
    .remove = axi_remove,
    .driver = {
        .name = "wifi-axi",
        .of_match_table = of_match_ptr(wifi_of_ids),
    },
};

// 设备树匹配表
static const struct of_device_id wifi_of_ids[] = {
    { .compatible = "mediatek,mt7992-wifi" },
    { .compatible = "mediatek,mt7990-wifi" },
    {},
};
```

### 2.6 电源管理

#### 2.6.1 Suspend/Resume 流程
```c
// 挂起流程
hwifi_suspend()
  ├── 停止所有 TX/RX 队列
  ├── 保存设备状态
  ├── 通知 MCU 进入低功耗模式
  ├── 关闭中断
  └── 设置 HWIFI_STATE_SUSPEND 标志

// 恢复流程
hwifi_resume()
  ├── 清除 HWIFI_STATE_SUSPEND 标志
  ├── 恢复中断
  ├── 通知 MCU 退出低功耗模式
  ├── 恢复设备状态
  └── 重启 TX/RX 队列
```

#### 2.6.2 运行时电源管理
```c
// 运行时 PM 操作
static const struct dev_pm_ops wifi_pm_ops = {
    SET_SYSTEM_SLEEP_PM_OPS(hwifi_suspend, hwifi_resume)
    SET_RUNTIME_PM_OPS(hwifi_runtime_suspend,
                       hwifi_runtime_resume,
                       NULL)
};
```

---

## 3. 核心架构与模块

### 3.1 分层架构

```
┌─────────────────────────────────────────────┐
│         用户空间应用 (hostapd/wpa_supplicant)│
└─────────────────────────────────────────────┘
                    ↕ (ioctl/netlink)
┌─────────────────────────────────────────────┐
│      Linux 内核网络子系统 (net_device)       │
└─────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────┐
│   mt_wifi 协议栈层 (802.11 协议实现)        │
│   - AP/STA 模式管理                          │
│   - MLME 状态机                              │
│   - 数据包封装/解封装                        │
│   - 安全加密                                 │
└─────────────────────────────────────────────┘
                    ↕ (MAC 接口层)
┌─────────────────────────────────────────────┐
│   wlan_hwifi 硬件抽象层                     │
│   - 芯片驱动                                 │
│   - MCU 通信                                 │
│   - Token 管理                               │
│   - 硬件资源管理                             │
└─────────────────────────────────────────────┘
                    ↕ (总线层)
┌─────────────────────────────────────────────┐
│   总线驱动 (PCI/AXI/USB/SDIO)               │
└─────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────┐
│   硬件芯片 (MT7990/MT7992)                  │
│   - MAC 硬件                                 │
│   - PHY 硬件                                 │
│   - 固件 (WM/WA/WO/DSP MCU)                 │
└─────────────────────────────────────────────┘
```

### 3.2 核心模块详解

#### 3.2.1 总线管理器 (bus.c/h)
**职责**:
- 抽象不同总线接口 (PCI/AXI/USB/SDIO)
- 提供统一的 DMA 操作接口
- 管理 TX/RX Ring 缓冲区
- 中断处理

**关键结构**:
```c
struct bus_trans {
    enum bus_type type;           // 总线类型
    struct bus_io_ops *io_ops;    // IO 操作 (读写寄存器)
    struct bus_dma_ops *dma_ops;  // DMA 操作
    void *priv;                       // 总线私有数据
};
```

#### 3.2.2 芯片管理器 (chips.c/h)
**职责**:
- 管理不同芯片型号
- 提供芯片特定操作
- 固件加载管理

**关键结构**:
```c
struct chip_drv {
    u32 chip_id;                      // 芯片 ID (如 0x7992)
    u32 device_id;                    // 设备 ID
    struct chip_hw_cap hw_cap;    // 硬件能力
    struct chip_ctrl_ops *ops;    // 芯片控制操作
    struct chip_mcu_info mcu_info;// MCU/固件信息
    struct bus_cfg bus_cfg;       // 总线配置
};

// 芯片硬件能力
struct chip_hw_cap {
    size_t dev_size;                  // 设备结构大小
    u32 eeprom_size;                  // EEPROM 大小
    u32 mtxd_sz;                      // MAC TXD 大小
    unsigned long mac_cap;            // MAC 能力标志
    struct chip_mcu_info *mcu_infos; // MCU 信息数组
    struct hwres_cap *hwres;      // 硬件资源能力
};
```

#### 3.2.3 芯片能力查询

驱动通过芯片 ID 查询硬件能力：

```c
// 硬件资源能力
struct hwres_cap {
    struct range uwtbl;               // UWTBL 范围
    struct range group;               // 组范围
    struct range tx_token;            // TX Token 范围
    struct range rx_token;            // RX Token 范围
    struct range bss;                 // BSS 范围
    struct range mld_addr;            // MLD 地址范围
    struct range link_addr;           // Link 地址范围
    struct range mld_remap;           // MLD 重映射范围
    u8 radio_num;                     // 射频数量
    struct hwres_radio_cap radio_cap[MAX_BAND_NUM]; // 每频段能力
};

// 每频段能力
struct hwres_radio_cap {
    u8 band_idx;                      // 频段索引
    struct range omac;                // OMAC 范围
    struct range ext_omac;            // 扩展 OMAC 范围
    struct range rept_omac;           // Repeater OMAC 范围
    struct range wmm_set;             // WMM 集合范围
    struct hwres_radio_info *info; // 射频信息
};
```

#### 3.2.4 FMAC vs BMAC 架构

**FMAC (Full MAC)**:
- 固件实现完整的 MAC 层功能
- 驱动只负责数据传输和配置
- 适合高性能场景
- 固件负载较重

**BMAC (Basic MAC)**:
- 固件只实现基本 MAC 功能
- 驱动实现更多 MAC 层逻辑
- 更灵活，易于调试
- 驱动负载较重

```c
// 架构选择
enum {
    MAC_TYPE_NONE,
    MAC_TYPE_FMAC,    // Full MAC
    MAC_TYPE_BMAC,    // Basic MAC
    MAC_TYPE_MAX
};

// 不同架构的 TXD 处理
// FMAC: 简化的 TXD，固件完成大部分工作
// BMAC: 详细的 TXD，驱动填充更多信息
```

#### 3.2.5 SER (System Error Recovery) 机制

**SER 级别**:
```c
enum HW_SER_LEVEL {
    HW_SER_LV_0_0 = 0,    // 无错误
    HW_SER_LV_0_5 = 5,    // 轻微错误，软件恢复
    HW_SER_LV_1_0 = 10,   // 中等错误，部分复位
    HW_SER_LV_10_0 = 100, // 严重错误，完全复位
};
```

**SER 恢复流程**:
```
检测到错误
  ↓
判断错误级别
  ↓
├─ LV 0.5: 软件恢复
│   ├── 清除错误状态
│   ├── 重启相关队列
│   └── 继续运行
│
├─ LV 1.0: 部分复位
│   ├── 停止 TX/RX
│   ├── 复位 MAC 子系统
│   ├── 重新初始化
│   └── 恢复运行
│
└─ LV 10.0: 完全复位
    ├── 停止所有操作
    ├── 芯片完全复位
    ├── 重新加载固件
    ├── 重新初始化所有模块
    └── 恢复运行
```

#### 3.2.6 芯片复位流程

```c
// wlan_hwifi/main.c
static int hwifi_hw_init(struct hw_dev *dev)
{
    int ret;
    
    // 1. 芯片级复位
    hw_chip_reset(dev);
    
    // 2. WiFi 子系统复位
    hw_reset(dev);
    
    // 3. 硬件 MAC TX/RX 初始化
    ret = hw_init(dev);
    if (ret)
        goto err;
    
    // 4. MCU 硬件操作初始化
    mcu_hw_ops_init(dev);
    
    // 5. MAC 操作初始化
    hdev_ops_init(dev);
    
    return 0;
err:
    return ret;
}
```

#### 3.2.7 MAC 接口层 (mac_if.c/h)
**职责**:
- 连接硬件层和协议栈层
- 提供统一的 MAC 操作接口
- 数据包上下行传递

**关键接口**:
```c
struct interface_ops {
    // 设备管理
    struct hw_dev *(*alloc_device)(...);
    int (*register_device)(...);
    
    // 数据包接收
    int (*rx_pkt)(...);
    int (*rx_indicate_pkt)(...);
    
    // TX 状态回调
    int (*tx_status)(...);
    
    // 事件处理
    int (*rx_event)(...);
    int (*rx_uni_event)(...);
    
    // PHY 管理
    int (*add_phy)(...);
    
    // SER 事件
    int (*rx_ser_event)(...);
    
    // 芯片复位
    int (*chip_reset)(unsigned int chip_id);
};
```

