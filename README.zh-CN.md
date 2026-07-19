# Atlas

> **被打断没关系，Atlas 记得你做到哪里。**

[下载 Windows 版](https://github.com/randyhe/atlas/releases/latest) · [English](README.md) · [工作原理](#atlas-如何工作) · [隐私安全与费用](#隐私安全与费用)

生活不会等你做完一件事再开始下一件事。电话来了，孩子叫你，一场会议开始了，一个新想法又冒出来。查了一半的夏令营、还没预约的体检、等待回复的维修安排，都可能被下一次打断重新埋下去。

**Atlas 是一个以 Codex 对话为入口的个人记忆与行动系统。** 你不用停下来打开另一个待办 App，只要在对话里说出不想遗忘的事情；以后再问 Atlas 上次做到哪里、下一步做什么，或者当时为什么值得继续。每条记录都能追溯来源，本地 Web Dashboard 则提供集中审核和管理的位置。

**它会替你记住：刚才做到哪里？下一步做什么？为什么值得继续？**

![模拟的最新版 Codex 对话，通过 Atlas 记录和继续日常事项](docs/assets/atlas-codex-conversation.png)

*模拟的 Codex 对话，全部使用合成数据；Codex 不同版本的具体界面可能有所变化。*

## 30 秒理解 Atlas

1. **想到时就说**

   > Atlas，请记住：下次继续比较这三家夏令营，先确认接送时间。

2. **需要时就问**

   > Atlas，我有哪些做到一半的事情？

你还可以这样说：

```text
Atlas，请记住这个想法：周末带孩子去自然博物馆。
Atlas，把“下周给牙医打电话”记录为待办。
Atlas，今天最值得继续做什么？
Atlas，搜索我之前关于家庭旅行住宿的决定，并显示来源。
Atlas，打开 Dashboard。
```

## Windows 安装方法

Atlas 提供 Windows 10/11 x64 绿色版。电脑需要已安装 Codex Desktop，但不需要管理员权限，也不需要另外安装 Node.js、pnpm、数据库、API Key 或云端账户。

1. 打开 [Atlas 最新版本下载页](https://github.com/randyhe/atlas/releases/latest)。
2. 在 **Assets** 中下载 `Atlas-Windows-x64.zip`，建议同时下载 `Atlas-Windows-x64.zip.sha256`。
3. 右键 ZIP，选择 **全部解压（Extract All）**。不要直接在压缩包里运行。
4. 打开解压后的文件夹，双击 **`Install Atlas.cmd`**。
5. 等待窗口显示：

   ```text
   Atlas is installed and running. Open a new Codex task to use it.
   ```

6. 完全退出并重新打开 Codex，进入 **Plugins → Atlas**，点击 **Connect**，然后新建一个对话。

### 怎样才算安装成功？

以下三项都满足，说明 Atlas 已经可以使用：

- **安装窗口：** 显示 `Atlas is installed and running`，没有红色错误。
- **Dashboard：** 浏览器打开 Atlas，并能看到 `Today`、`Capture`、`Review` 和 `Search`。
- **Codex 对话：** 让 Atlas 记录一件事后，Codex 给出确认；Dashboard 的 **Review** 页面能看到新记录。

电脑重启后，只需双击 **`Start Atlas.cmd`**。Atlas 优先使用 `127.0.0.1:4310`；端口已被使用时会依次尝试 4311–4319。它不会监听局域网，也不会创建 Windows 防火墙规则。

校验下载文件和排查安装问题，请查看 [Windows 测试说明](packaging/windows/README-TESTING.md)。

## Atlas 如何工作

Atlas 围绕两个最常用的动作设计：

- **在对话中记录：** 明确让 Atlas 记住一个想法、决定、参考资料或以后要做的事情。
- **带着上下文继续：** 询问还有哪些事情没有闭环，或搜索以前的记录和来源。

Codex 对话中的主动记录只保存你明确交给 Atlas 的内容，不会自动保存当前整段会话。通过 ChatGPT Export 手动导入的对话则会保存在本地，用于提取候选项、搜索和来源追踪。

新提取的内容会先进入 **Review**，确认后才成为正式行动或决定。Atlas 不会执行导入内容中的命令，也不会打开导入内容中的 URL。Dashboard 是一个可选的集中工作区，可以审核、搜索、合并重复项、安排、完成或主动放弃记录。

Atlas 不是完整聊天归档工具，也不宣称可以自动读取全部 ChatGPT 或 Codex 历史。ChatGPT Export 只是手动导入历史的兜底方式。

### Dashboard 用于集中审核和管理

Web Dashboard 适合一次查看多条记录、检查来源、搜索、合并重复项和管理状态。它为对话优先的体验提供集中管理，但不要求你每次记录或回忆之前都先打开网页。

![Atlas Today 页面，使用合成的日常生活示例](docs/assets/atlas-today.png)

## 隐私、安全与费用

- **本地优先：** `atlasd` 只监听 `127.0.0.1`，SQLite 数据留在用户电脑上。
- **本地认证：** Windows 版生成 256 位令牌并使用 Windows DPAPI 保护；浏览器使用 HttpOnly、SameSite Session Cookie。
- **不信任导入内容：** 导入的文字、命令和 URL 始终只是惰性数据。Restricted 内容不会进入普通搜索、脱敏导出、日志或截图。
- **不需要付费 Provider：** 记录、审核、状态管理、备份和 FTS5 搜索不需要 AI API Key。Atlas 不会静默启用按量付费 API 或云托管。
- **绿色安装：** 不申请管理员权限、不修改注册表、不修改 Windows 防火墙。
- **下载可校验：** Release 提供 SHA-256；当前安装包尚未使用 Authenticode 商业证书签名，Windows 可能显示安全提醒。

详细威胁边界和安全报告方式请查看 [SECURITY.md](SECURITY.md)。

## v0.2.0 已验证能力

- 在 Codex 对话中记录 Open Loop、Decision 和 Reference。
- Review 中支持修改、接受、拒绝、合并重复项和撤销。
- 支持 open、waiting、scheduled、done 和 dismissed 状态。
- 带来源的 FTS5 搜索、本地备份恢复和脱敏导出。
- Manual、Daily Log 和 ChatGPT Export 导入，以及确定性的本地提取。
- Windows 绿色启动和仅限本机的端口回退。

## 开发与技术资料

```powershell
pnpm install
pnpm check
pnpm start
```

打开 `http://127.0.0.1:4310`。开发环境数据默认保存在 `%LOCALAPPDATA%\Atlas`；可以用 `ATLAS_DATA_DIR` 隔离。下载版使用自己的 `work/data` 目录。

- [技术架构与接口](docs/technical-reference.md)
- [比赛证据与声明边界](docs/competition/README.md)
- [需求追踪](docs/quality/requirements-traceability.md)
- [参与贡献](CONTRIBUTING.md)

Atlas 使用 [MIT License](LICENSE)。打包依赖保留各自许可证，详见 [Third-Party Notices](THIRD-PARTY-NOTICES.md)。
