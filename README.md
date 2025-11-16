# 书签哨兵 (Bookmark Sentry)

<div align="center">
  <img src="https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white" alt="Chrome Extension">
  <img src="https://img.shields.io/badge/Vue-3.x-4FC08D?logo=vue.js&logoColor=white" alt="Vue 3">
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Vite-5.x-646CFF?logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="MIT License">
</div>

## 📖 简介

书签哨兵是一款智能的Chrome浏览器扩展，能够自动检测网页上的链接是否已被收藏为书签。通过先进的布隆过滤器算法，即使管理数万个书签也能保持极快的查询速度。

## ✨ 核心功能

### 🔍 智能URL检测
- **选中文本查询**: 从选中的文本中提取所有URL并批量检查是否已收藏（支持保留原始文本格式和换行）
- **单链接检查**: 右键点击任意链接快速检查收藏状态
- **页面URL提取**: 一键提取当前页面所有URL，在独立结果页面显示收藏状态

### 🎯 灵活的标记系统
- **手动标记模式** (默认): 需要时手动开启，不影响页面加载性能
- **自动标记模式** (可选): 访问网页时自动扫描并标记已收藏的链接
- **视觉反馈**: 已收藏的链接显示⭐图标，鼠标悬停显示提示
- **状态管理**: 支持开启/关闭/刷新标记，标记状态智能管理

### ⚙️ 可配置的URL匹配规则
用户可以自定义URL比较规则，选择忽略以下差异：
- 协议差异 (http/https)
- 末尾斜杠
- 大小写差异
- www前缀
- URL片段（#后的内容）

### 🚀 高性能设计
- **布隆过滤器**: O(k)时间复杂度，空间占用减少90%以上
- **分批处理**: 使用requestIdleCallback优化，不阻塞页面
- **智能缓存**: 7天自动更新，增量同步变化
- **异步处理**: 所有操作均采用异步处理，确保流畅体验

## 📦 安装

### 开发环境

1. **克隆项目**
```bash
git clone https://github.com/Topkill/chrome-bookmarks-check.git
cd chrome-bookmarks-check
```

2. **安装依赖**
```bash
npm install
```

3. **开发模式**
```bash
npm run dev
```

4. **构建扩展**
```bash
npm run build
```

### 安装到Chrome

1. 打开Chrome浏览器，访问 `chrome://extensions/`
2. 开启右上角的"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择项目的 `dist` 目录

## 🎮 使用指南

### 基本操作

#### 检查选中文本中的URL
1. 选中包含URL的文本（支持多行文本）
2. 右键选择"提取url并在书签中搜索"
3. 在新打开的结果页面查看详细信息
   - 原始文本（保留换行格式）
   - 提取到的所有URL
   - 已收藏/未收藏的分类列表

#### 检查单个链接
1. 右键点击任何链接
2. 选择"检查此链接是否已收藏"
3. 在结果页面查看收藏状态

#### 手动标记页面链接
1. 点击扩展图标打开Popup
2. 点击"手动开启标记"按钮
3. 页面上已收藏的链接会显示⭐图标
4. 支持随时关闭/刷新标记
5. 关闭后可重新开启，状态正确恢复

#### 提取页面所有URL
1. 点击扩展图标
2. 点击"提取页面URL"按钮
3. 在新打开的结果页面查看：
   - 页面上所有URL的列表
   - 每个URL的收藏状态
   - 智能去重，避免重复显示相似URL

### 结果页面功能

结果页面会智能显示：
- **原始文本**: 完整保留用户选中的文本格式
- **提取的URL列表**: 所有成功提取的URL
- **规范化URL**: 用于匹配的标准化URL格式
- **收藏状态详情**: 
  - 已收藏的URL会标注状态
  - 如果书签中保存的URL与原始URL有实质性差异，会显示"书签中保存为: [实际URL]"
  - 智能过滤微小差异（如协议、www前缀等），避免重复显示

### 设置选项

通过点击扩展图标 → 设置，可以配置：

| 设置类型 | 选项 | 默认值 | 说明 |
|---------|------|--------|------|
| **基本设置** | 自动标记页面链接 | 关闭 | 开启后自动扫描，可能影响性能 |
| | 显示通知提醒 | 开启 | 控制系统通知弹窗 |
| | **检查单个链接时的操作** | 打开结果页面 | 右键点击单个链接时的反馈方式 |
| | **检查多个链接时的操作** | 打开结果页面 | 批量检查链接时的反馈方式 |
| **结果显示方式** | 打开结果页面 | ✓ | 在新标签页中详细显示检查结果 |
| | 显示系统通知 | | 通过系统通知快速显示结果摘要 |
| | 显示页面内弹窗 | | 在当前页面内以弹窗形式显示结果 |
| **持续时间设置** | 通知持续时间 | 15秒 | 系统通知自动消失时间，0表示永久显示 |
| | 单链接弹窗持续时间 | 5秒 | 单个链接结果弹窗显示时间 |
| | 多链接弹窗持续时间 | 15秒 | 多个链接结果弹窗显示时间 |
| **URL匹配** | 忽略协议差异 | 关闭 | 开启后，http/https视为相同 |
| | 忽略末尾斜杠 | 关闭 | 开启后，有无斜杠视为相同 |
| | 忽略大小写 | 关闭 | 开启后，url大小写视为相同 |
| | 忽略www前缀 | 关闭 | 开启后，有无www视为相同 |
| | 忽略URL片段 | 关闭 | 开启后，忽略#后的内容 |
| **高级设置** | 批量查询大小 | 50 | 每批查询的URL数量(10-200) |
| | 缓存更新间隔 | 7天 | 书签缓存过期时间(1-30天) |

## 🛠️ 技术栈

- **前端框架**: Vue 3 + TypeScript
- **构建工具**: Vite 5
- **样式**: Tailwind CSS
- **扩展开发**: Chrome Extension Manifest V3
- **插件**: @crxjs/vite-plugin (支持热更新)
- **核心算法**: 布隆过滤器 (Bloom Filter)

## 📁 项目结构

```
bookmark-sentry/
├── src/
│   ├── background/        # Service Worker后台脚本
│   │   ├── index.ts      # 后台主入口（处理右键菜单、消息通信）
│   │   └── services/     # 服务模块
│   │       ├── bookmark-cache-service.ts  # 书签缓存管理
│   │       └── storage-service.ts         # 存储服务
│   ├── content/          # Content Script内容脚本
│   │   ├── index.ts      # 内容脚本入口
│   │   ├── link-extractor.ts  # 链接提取器
│   │   ├── query-manager.ts   # 查询管理器
│   │   └── dom-marker.ts      # DOM标记器
│   ├── popup/            # 弹出窗口UI
│   │   ├── App.vue       # Vue主组件
│   │   └── main.ts       # 入口文件
│   ├── options/          # 设置页面
│   ├── results/          # 结果展示页面
│   │   ├── index.html    # 结果页面模板
│   │   └── main.ts       # 结果页面逻辑
│   ├── types/            # TypeScript类型定义
│   │   ├── messaging.ts  # 消息类型定义
│   │   └── chrome.d.ts   # Chrome API类型
│   └── utils/            # 工具函数
│       └── bloom-filter.ts  # 布隆过滤器实现
├── public/               # 静态资源
│   └── icons/           # 扩展图标
├── dist/                 # 构建输出目录
└── package.json          # 项目配置
```

## 🔧 开发命令

| 命令 | 说明 |
|------|------|
| `npm install` | 安装依赖 |
| `npm run dev` | 启动开发服务器（支持热更新） |
| `npm run build` | 构建生产版本 |
| `npm run preview` | 预览构建结果 |
| `npm run test` | 运行测试 |

## 🎯 使用场景

- **研究资料收集**: 快速识别已收藏的参考资料，避免重复
- **新闻阅读**: 标记已读文章，一目了然
- **技术学习**: 管理教程和文档链接，追踪学习进度
- **网址整理**: 批量检查链接状态，优化书签管理
- **内容创作**: 检查引用链接是否已收藏，方便后续查阅

## 🚀 性能优化

- **布隆过滤器**: 相比直接存储，空间占用减少90%以上
- **分批处理**: 避免阻塞主线程，保持页面流畅
- **按需加载**: 默认关闭自动标记，用户手动开启
- **智能缓存**: 增量更新，减少重复计算
- **延迟加载**: 异步操作确保UI响应速度

## 📊 性能指标

- 首次缓存构建（80k书签）: < 5秒
- 单次查询（100个URL）: < 50毫秒
- 内存占用: < 20MB
- 误判率: < 0.1%
- 页面标记响应时间: < 1秒

## 🐛 最近修复

- ✅ 修复了选中文本中换行符丢失的问题
- ✅ 优化了"提取页面URL"功能，结果在新页面显示
- ✅ 修复了关闭标记后重新开启无效的问题
- ✅ 修复了刷新标记后计数显示错误
- ✅ 优化了结果页面，避免重复显示相似URL
- ✅ **修复了右键菜单功能显示错误结果类型的问题**
  - 修正了单链接和多链接操作设置的选择逻辑
  - 增强了通知内容，显示详细的URL信息（原始链接、规范化链接、书签位置）
  - 添加了可自定义的持续时间设置，支持通知、单链接弹窗、多链接弹窗分别设置
  - 实现了通知自动清除功能
  - 修正了多链接弹窗默认持续时间为15秒

## 🤝 贡献

欢迎提交Issue和Pull Request！

## 📄 许可证

本项目采用 Apache 2.0 许可证。详见 [LICENSE](LICENSE) 文件。

## 🙏 致谢

- 感谢所有贡献者
- 使用了 [@crxjs/vite-plugin](https://github.com/crxjs/chrome-extension-tools) 提供的Chrome扩展开发支持

## 📮 联系方式

- 问题反馈: [GitHub Issues](https://github.com/Topkill/chrome-bookmarks-check/issues)
- 功能建议: [GitHub Discussions](https://github.com/Topkill/chrome-bookmarks-check/discussions)
