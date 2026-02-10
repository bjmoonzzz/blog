在生成配置对象时 (`dpp_build_conf_obj_dpp`)，如果需要为 Enrollee 生成 netAccessKey (connector 中的核心密钥)，直接使用了保存的 peer_protocol_key 作为输入。这是为了确保只有持有对应私钥的 Enrollee 才能使用该 Connector。

---

Agent 的 netAccessKey

作为 Responder (响应者)，在回复 Auth Request 时，会调用 dpp_auth_build_resp_ok。在该函数中，Agent 调用 dpp_gen_keypair(auth->curve) 生成一个临时的 own_protocol_key。这个生成的密钥对一直保存在 dpp_authentication *auth 结构体中。

当 Agent 收到 Configurator 发来的 Configuration Object (配置对象) 后，会调用 dpp_parse_cred_dpp 进行解析。在解析成功且确认版本兼容后，会调用 dpp_copy_netaccesskey(auth, conf)，直接从 auth->own_protocol_key 中提取私钥 (crypto_ec_key_get_ecprivate_key)，并将其赋值给 auth->net_access_key，进而保存到 ssid->net_access_key，最终用于 Peer Disc Resp 作为 own_key 进行密钥派生。

---

struct crypto_ec_key 结构与操作详解

struct crypto_ec_key 是 hostapd/wpa_supplicant 定义的一个不透明的结构体，用于封装底层的椭圆曲线（EC）密钥对。

1. 结构体包含的信息

虽然在头文件中它是对外隐藏的，但在具体的 OpenSSL 实现 (crypto_openssl.c) 中，它实际上直接对应于 OpenSSL 的 EVP_PKEY 结构体。它主要包含：

私钥 (Private Key): 一个大数 (Bignum)，即 d。

公钥 (Public Key): 曲线上的一个点 (EC Point)，即 Q = d * G。

曲线参数 (EC Group): 定义了所使用的椭圆曲线（如 NIST P-256, P-384 等）。

2. 主要操作函数

你可以对这个结构体进行多种操作，包括提取密钥、签名、验证、ECDH 等。

提取公钥/私钥的操作：

crypto_ec_key_get_pubkey_point(key, mode): 获取公钥点。

返回 struct wpabuf *，包含公钥点的二进制数据（通常包含 x 和 y 坐标）。

这是你提到的函数，非常常用，用于将公钥发送给对端。

crypto_ec_key_get_ecprivate_key(key, include_params): 获取私钥。

返回 struct wpabuf *，包含私钥的二进制数据 (ASN.1 DER 编码的 ECPrivateKey)。

crypto_ec_key_get_subject_public_key(key): 获取包含 ASN.1 头部信息的公钥 (SubjectPublicKeyInfo)。

crypto_ec_key_get_public_key(key) (底层): 获取抽象的 crypto_ec_point 对象。

crypto_ec_key_get_private_key(key) (底层): 获取抽象的 crypto_bignum 对象。

其他常用操作：

生成密钥对: crypto_ec_key_gen(group)。

签名: crypto_ec_key_sign(...) (生成 ECDSA 签名)。

验证: crypto_ec_key_verify_signature(...) (验证 ECDSA 签名)。

ECDH 密钥协商: crypto_ecdh_init2(group, own_key) 然后使用 crypto_ecdh_set_peerkey。

比较: crypto_ec_key_cmp(key1, key2) (检查两个密钥是否相同)。

调试: crypto_ec_key_debug_print(...) (在日志中打印密钥详情)。

总结： 是的，你可以通过 crypto_ec_key_get_ecprivate_key 单独拿出私钥，也可以通过  crypto_ec_key_get_pubkey_point 单独拿出公钥。这个结构体是 DPP 协议中进行密钥管理和加密运算的核心对象。