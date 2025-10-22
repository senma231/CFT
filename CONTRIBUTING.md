# 贡献指南

感谢您对 Cloudflare 隧道管理器的关注！我们欢迎任何形式的贡献。

## 如何贡献

### 报告问题

如果您发现了 bug 或有功能建议，请：

1. 在 [Issues](../../issues) 中搜索是否已有相关问题
2. 如果没有，创建新的 Issue
3. 提供详细的信息：
   - 操作系统和版本
   - 应用版本
   - 问题描述
   - 复现步骤
   - 相关日志或截图

### 提交代码

1. **Fork 仓库**

2. **克隆到本地**
   ```bash
   git clone https://github.com/你的用户名/CloudflareTunnelManager.git
   cd CloudflareTunnelManager
   ```

3. **创建分支**
   ```bash
   git checkout -b feature/your-feature-name
   ```

4. **安装依赖**
   ```bash
   npm install
   ```

5. **开发和测试**
   ```bash
   npm run dev
   ```

6. **提交更改**
   ```bash
   git add .
   git commit -m "feat: 添加某某功能"
   ```

7. **推送到 GitHub**
   ```bash
   git push origin feature/your-feature-name
   ```

8. **创建 Pull Request**
   - 在 GitHub 上打开您的 fork
   - 点击 "New Pull Request"
   - 填写 PR 描述

## 代码规范

### 提交信息格式

使用语义化的提交信息：

- `feat:` 新功能
- `fix:` 修复 bug
- `docs:` 文档更新
- `style:` 代码格式调整
- `refactor:` 代码重构
- `test:` 测试相关
- `chore:` 构建/工具相关

示例：
```
feat: 添加隧道批量启动功能
fix: 修复托盘图标不显示的问题
docs: 更新 README 安装说明
```

### 代码风格

- 使用 4 空格缩进
- 使用单引号
- 添加必要的注释
- 遵循现有代码风格

### 文件组织

- 主进程代码放在 `src/main/`
- 渲染进程代码放在 `src/renderer/`
- 服务类放在 `src/services/`
- 工具函数放在 `src/utils/`

## 开发流程

### 本地开发

```bash
# 启动开发模式
npm run dev

# 构建前端
npm run build:renderer

# 构建主进程
npm run build:main

# 打包应用
npm run pack
```

### 测试

在提交 PR 之前，请确保：

- [ ] 代码可以正常运行
- [ ] 没有明显的 bug
- [ ] 新功能已测试
- [ ] 没有破坏现有功能

## Pull Request 检查清单

提交 PR 前，请确认：

- [ ] 代码遵循项目规范
- [ ] 提交信息清晰明确
- [ ] 已测试所有更改
- [ ] 更新了相关文档
- [ ] 没有不必要的文件（如 node_modules、build 等）

## 需要帮助？

如果您在贡献过程中遇到问题：

- 查看 [README.md](README.md)
- 在 [Discussions](../../discussions) 中提问
- 在 [Issues](../../issues) 中搜索相关问题

## 行为准则

- 尊重他人
- 保持友好和专业
- 接受建设性的批评
- 关注对项目最有利的事情

感谢您的贡献！🎉

