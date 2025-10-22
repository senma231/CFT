# Cloudflare 隧道管理器

<div align="center">

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)
![Electron](https://img.shields.io/badge/Electron-28.0.0-47848F.svg)

一个基于 Electron 的现代化 Cloudflare 隧道管理工具，提供直观的图形界面和强大的隧道管理功能。

[功能特性](#-功能特性) • [快速开始](#-快速开始) • [使用说明](#-使用说明) • [开发指南](#-开发指南) • [贡献](#-贡献)

</div>

---

## ✨ 功能特性

### 核心功能
- 🚇 **隧道管理** - 创建、启动、停止、重启和删除 Cloudflare 隧道
- 📊 **实时监控** - 实时显示隧道状态、流量统计和连接信息
- 🔄 **路由配置** - 灵活的路由规则配置，支持 HTTP/HTTPS/TCP/UDP
- 🌐 **Cloudflare API** - 集成 Cloudflare API，直接管理云端隧道
- 📝 **日志管理** - 完整的日志记录、查看和导出功能
- ⚙️ **服务管理** - Cloudflared 服务的下载、安装和更新

### 用户体验
- 🎨 **现代化界面** - 基于 Bootstrap 5 的响应式设计
- 🔔 **系统托盘** - 最小化到系统托盘，后台运行
- 💾 **配置持久化** - 自动保存配置，支持导入导出
- 🌙 **主题支持** - 支持亮色/暗色主题切换
- 🔐 **安全架构** - Context Isolation 和 IPC 安全通信

## 📋 系统要求

### 运行环境
- **操作系统**: Windows 10+, macOS 10.14+, Ubuntu 18.04+
- **Cloudflared**: 自动下载安装（或手动安装）

### 开发环境
- **Node.js**: >= 18.0.0
- **npm**: >= 8.0.0

## 🚀 快速开始

### 方式一：下载预编译版本（推荐）

1. 前往 [Releases](../../releases) 页面
2. 下载适合您系统的安装包
3. 运行安装程序或解压后运行

### 方式二：从源码构建

#### 1. 克隆仓库

```bash
git clone https://github.com/你的用户名/CloudflareTunnelManager.git
cd CloudflareTunnelManager
```

#### 2. 安装依赖

```bash
npm install
```

#### 3. 开发模式运行

```bash
npm run dev
```

#### 4. 构建生产版本

```bash
# 构建前端
npm run build:renderer

# 构建主进程
npm run build:main

# 打包应用
npm run pack
```

### 方式三：使用 GitHub Actions 自动打包

推送代码到 GitHub 后，在 Actions 标签页手动触发打包工作流，无需本地构建环境。

## 📁 项目结构

```text
CloudflareTunnelManager/
├── .github/
│   └── workflows/          # GitHub Actions 工作流
│       ├── build.yml       # 自动打包（标签触发）
│       └── manual-build.yml # 手动打包
├── src/
│   ├── main/              # 主进程
│   │   └── main.js        # 应用入口、窗口管理、IPC 处理
│   ├── preload/           # 预加载脚本
│   │   └── preload.js     # 安全的 API 桥接
│   ├── renderer/          # 渲染进程
│   │   ├── app.js         # 应用逻辑
│   │   ├── index.html     # HTML 模板
│   │   └── styles/        # 样式文件
│   ├── services/          # 业务服务
│   │   ├── TunnelManager.js    # 隧道管理
│   │   ├── CloudflareAPI.js    # Cloudflare API
│   │   └── ConfigManager.js    # 配置管理
│   ├── models/            # 数据模型
│   └── utils/             # 工具函数
├── assets/
│   ├── icons/             # 应用图标（.ico, .png）
│   └── images/            # 图片资源
├── webpack.config.js      # Webpack 配置
├── webpack.main.config.js # 主进程 Webpack 配置
├── package.json           # 项目配置
└── README.md              # 项目文档
```

## 💡 使用说明

### 首次使用

1. **配置 Cloudflare API**（可选）
   - 进入"设置" → "Cloudflare 配置"
   - 输入 API Token 和 Account ID
   - 测试连接

2. **下载 Cloudflared**
   - 进入"服务管理"
   - 点击"下载 Cloudflared"
   - 等待下载完成

3. **创建隧道**
   - 点击"新建隧道"
   - 填写隧道名称和配置
   - 添加路由规则
   - 保存并启动

### 主要功能

#### 隧道管理
- 创建、启动、停止、重启、删除隧道
- 实时查看隧道状态和统计信息
- 批量操作多个隧道
- 导入/导出隧道配置

#### 路由配置
- 支持 HTTP/HTTPS/TCP/UDP 协议
- 灵活的路由规则配置
- 域名和服务映射

#### 日志管理
- 实时日志流
- 日志过滤和搜索
- 日志导出

#### 系统托盘
- 最小化到系统托盘
- 快速启动/停止隧道
- 托盘菜单快捷操作

## 🔧 开发指南

### 技术栈

- **框架**: Electron 28.0.0
- **前端**: Bootstrap 5, Vanilla JavaScript
- **构建**: Webpack 5
- **打包**: electron-builder
- **存储**: electron-store
- **日志**: electron-log

### 开发环境设置

```bash
# 克隆仓库
git clone https://github.com/你的用户名/CloudflareTunnelManager.git
cd CloudflareTunnelManager

# 安装依赖
npm install

# 启动开发模式
npm run dev
```

### 可用脚本

```bash
npm run dev              # 开发模式（热重载）
npm run build:renderer   # 构建前端
npm run build:main       # 构建主进程
npm run pack             # 打包应用（不压缩）
npm start                # 启动应用
```

### 项目配置

#### package.json 主要配置

```json
{
  "main": "src/main/main.js",
  "scripts": {
    "dev": "webpack serve --mode development",
    "build:renderer": "webpack --mode production",
    "build:main": "webpack --config webpack.main.config.js --mode production",
    "pack": "electron-builder --dir"
  },
  "build": {
    "appId": "com.cloudflare.tunnel.manager",
    "productName": "Cloudflare隧道管理器",
    "win": {
      "target": ["dir"],
      "icon": "assets/icons/icon.ico"
    }
  }
}
```

### 调试

开发模式下自动打开 DevTools：

```javascript
// src/main/main.js
if (!isPackaged || isDev) {
    mainWindow.webContents.openDevTools();
}
```

### 日志位置

- **Windows**: `%USERPROFILE%\AppData\Roaming\cloudflare-tunnel-manager\logs\`
- **macOS**: `~/Library/Logs/cloudflare-tunnel-manager/`
- **Linux**: `~/.config/cloudflare-tunnel-manager/logs/`

## 📦 打包部署

### 本地打包

```bash
# 构建
npm run build:renderer
npm run build:main

# 打包
npm run pack
```

输出目录：`build-output/win-unpacked/`

### GitHub Actions 自动打包（推荐）

1. **推送代码到 GitHub**

```bash
git add .
git commit -m "更新代码"
git push
```

2. **手动触发打包**
   - 打开 GitHub 仓库
   - 点击 Actions 标签
   - 选择"手动打包"工作流
   - 点击 Run workflow

3. **下载产物**
   - 等待构建完成
   - 在 Artifacts 中下载

### 发布版本

```bash
# 创建标签
git tag v2.0.0
git push origin v2.0.0

# GitHub Actions 自动打包并创建 Release
```

## 🛠️ 故障排除

### 常见问题

#### Q: 应用启动后显示空白页面

**A**: 确保已构建前端代码

```bash
npm run build:renderer
npm start
```

#### Q: 托盘图标不显示或报错

**A**: 检查图标文件

- Windows: 需要 `assets/icons/icon.ico`
- macOS: 需要 `assets/icons/icon.png`
- Linux: 需要 `assets/icons/icon.png`

#### Q: Cloudflared 下载失败

**A**: 手动下载并放置

1. 从 [Cloudflare 官网](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/) 下载
2. 放置到系统 PATH 或应用数据目录

#### Q: 隧道启动失败

**A**: 检查以下项目

- Cloudflared 是否已安装
- 配置文件是否正确
- 端口是否被占用
- 查看日志获取详细错误信息

#### Q: GitHub Actions 打包失败

**A**: 查看 Actions 日志

1. 点击失败的工作流
2. 查看红色步骤的详细日志
3. 根据错误信息修复

### 性能优化

- 使用生产构建（代码压缩和优化）
- 定期清理日志文件
- 关闭不需要的隧道
- 监控系统资源使用

## 🤝 贡献

欢迎贡献代码、报告问题或提出建议！

### 贡献流程

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

### 代码规范

- 使用 ESLint 检查代码
- 遵循现有代码风格
- 添加必要的注释
- 更新相关文档

### 报告问题

在 [Issues](../../issues) 页面报告问题时，请提供：

- 操作系统和版本
- 应用版本
- 详细的问题描述
- 复现步骤
- 相关日志

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

## 🙏 致谢

- [Electron](https://www.electronjs.org/) - 跨平台桌面应用框架
- [Bootstrap](https://getbootstrap.com/) - 前端 UI 框架
- [Cloudflare](https://www.cloudflare.com/) - 提供隧道服务
- [electron-builder](https://www.electron.build/) - 应用打包工具

## 📞 支持

- 📖 [文档](../../wiki)
- 🐛 [问题反馈](../../issues)
- 💬 [讨论区](../../discussions)

---

<div align="center">

**Cloudflare 隧道管理器** - 让隧道管理变得简单高效 🚀

Made with ❤️ by the community

</div>
