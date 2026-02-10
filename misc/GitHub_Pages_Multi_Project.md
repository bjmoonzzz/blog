# 多项目部署在同一个 GitHub Pages

> 基于 [多项目部署在同一个GitHub Pages](https://www.cnblogs.com/dev2007/p/13947333.html) 整理

## 核心原理

GitHub Pages 的规则是：
-   **主站**：一个账号只能有一个主 GitHub Pages 仓库（`username.github.io`），对应域名 `https://username.github.io`。
-   **子站**：其他仓库如果开启了 GitHub Pages，会自动映射为 `https://username.github.io/repo-name`。

## 部署步骤

### 1. 部署主站（博客）

1.  创建一个名为 `username.github.io` 的仓库。
2.  上传静态网站内容。
3.  开启 GitHub Pages（通常自动开启）。
4.  访问地址：`https://username.github.io`

### 2. 部署子站（文档/其他项目）

1.  创建普通仓库，例如 `my-docs`。
2.  上传内容（如 Docsify 文档）。
3.  进入仓库 **Settings** -> **GitHub Pages**。
4.  选择构建分支（如 `main`）和目录（如 `/` 或 `/docs`），保存。
5.  系统会自动生成访问地址：`https://username.github.io/my-docs`


![新建仓库配置中开启 GitHub Pages](.assets/GitHub_Pages_Multi_Project.assets/github_pages_config.jpg)

此时，你就在同一个域名下通过 URL 路径区分了不同的项目。
