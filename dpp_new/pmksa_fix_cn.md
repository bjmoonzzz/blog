# PMKSA 缓存上下文安全：深度技术方案建议 (修订版 2.1)

## 1. 技术背景与结论

### 1.1 会造成内存泄漏吗？
**答案：完全不会。**
经过对 `src/ap/pmksa_cache_auth.c` 底层代码的核实，PMKSA 条目的生命周期是由 hostapd 内核管理的：
1. `pmksa_cache_free_entry` 函数在逻辑结束处会调用内部私有函数 `_pmksa_cache_free_entry(entry)`。
2. 该私有函数会显式调用 `os_free()` 来释放条目的所有成员（如身份信息、VLAN 描述符）以及条目结构体本身的内存。
3. **`free_cb` 的角色**：它仅仅是一个“通知钩子”。它的执行与否或者逻辑多寡，都不会干扰底层基础内存的回收。

## 2. 回调函数的实现建议

针对您的 1905 模块，建议实现方案如下：

### 2.1 AP端静态回调实现 (wpa_1905.c)
```c
/* wpa_1905.c */

static void wpa_1905_pmksa_free_cb(struct rsn_pmksa_cache_entry *entry, void *ctx)
{
    /* ctx 为您的 struct wpa_1905 指针 */
    /* 核心提示：这里什么都不写，也不会有内存泄漏 */
    
    if (entry) {
        wpa_printf(MSG_DEBUG, "1905: Notification: PMKSA entry for " MACSTR 
                   " removed from cache.", MAC2STR(entry->spa));
    }
}
```

### 2.2 STA端静态回调实现
```c
static void wpa_1905_supp_pmksa_free_cb(struct rsn_pmksa_cache_entry *entry,
                                       void *ctx, enum pmksa_free_reason reason)
{
    /* 仅仅作为身份标签，无需任何释放逻辑 */
}
```

## 3. 为什么 1905 避不开 PMKSA 逻辑？
由于 `wpa_authenticator` (AP) 和 `wpa_sm` (STA) 的初始化函数 (`wpa_init`, `wpa_sm_init`) 内部硬编码了对 PMKSA 缓存的初始化，只要您在复用这些结构，回调逻辑就会在后台运行。

MTK 的补丁代码由于假设 `cb_ctx` 总是 `hostapd_data` 类型，因此会在这些后台流程触发时尝试非法访问您的 1905 内存空间。

## 4. 彻底解决之道：内存护栏
通过在 `pmksa_cache_auth.c` 等公共代码中加入以下判断，您可以完美隔离 1905 模块：

```c
#include "wpa_auth.h"

// 定位 MTK 强制转换 hapd 的代码段
if (pmksa->free_cb == wpa_auth_pmksa_free_cb) {
    /* 只有 hostapd 的正常流量会进入这里，执行 MTK 的下发逻辑 */
    struct wpa_authenticator *wpa_auth = pmksa->ctx;
    struct hostapd_data *hapd = wpa_auth->cb_ctx;
    // ... 安全执行 MTK 补丁代码 ...
}
```

## 5. 总结
- **安全性**：您的静态回调既是身份标签，又符合接口定义，不会产生内存风险。
- **稳定性**：此方案无需修改 hostapd 数据结构，对既有 MLO 或无线功能无负面影响。
