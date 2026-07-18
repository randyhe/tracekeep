# Atlas

## 中文快速开始

**Atlas 是一个可以直接在 Codex 对话中使用的本地第二大脑。** 你可以让它记住灵感、保存待办、找回被中断的工作，并查看今天应该继续什么。数据默认保存在自己的电脑上；Web Dashboard 只是集中查看和管理记录的辅助入口。

### 最简单的安装方法（Windows 10/11 x64）

安装前只需要确保电脑上已经安装并可以正常打开 **Codex Desktop**。不需要管理员权限，也不需要另外安装 Node.js、pnpm、数据库或 API Key。

1. 打开 [Atlas 最新版本下载页](https://github.com/randyhe/atlas/releases/latest)。
2. 在页面的 **Assets** 区域下载 `Atlas-Windows-x64.zip`。建议同时下载 `Atlas-Windows-x64.zip.sha256` 用于安全校验。
3. 右键 ZIP，选择 **全部解压（Extract All）**。请先完整解压，不要直接在 ZIP 压缩包里面运行程序。
4. 打开解压后的文件夹，双击 **`Install Atlas.cmd`**。
5. 等待黑色命令窗口显示：

   ```text
   Atlas is installed and running. Open a new Codex task to use it.
   ```

   安装程序随后会自动打开 Atlas Dashboard。
6. 完全退出并重新打开 Codex，在 **Plugins → Atlas** 中确认 Atlas 已安装并点击 **Connect**。然后新建一个 Codex 对话，输入：

   > Atlas，请记住：明天继续完成演示视频。

### 怎样才算安装成功？

以下三项都满足，就说明 Atlas 已经可以正常使用：

- **安装窗口成功：** 显示 `Atlas is installed and running`，没有红色错误。
- **Dashboard 成功：** 浏览器自动打开 Atlas，并能看到 `Today`、`Capture`、`Review`、`Search` 等页面。
- **Codex 对话成功：** 在新对话中让 Atlas 记录一件事后，Codex 给出记录确认；打开 Dashboard 的 **Review** 页面可以看到这条新记录。

安装后最常用的说法：

```text
Atlas，请记住这个想法：做一个家庭投资 Dashboard。
Atlas，把“下周回复客户邮件”记录为待办。
Atlas，我有哪些做到一半的事情？
Atlas，今天最值得继续做什么？
Atlas，搜索我之前关于测试计划的决定，并显示来源。
Atlas，打开 Dashboard。
```

以后电脑重启或 Dashboard 没有打开时，只需再次双击 **`Start Atlas.cmd`**，不需要重复安装。Atlas 会优先使用 `127.0.0.1:4310`；如果该端口已被使用，会自动尝试 4311–4319。

### 常见问题

#### Windows 显示安全提醒怎么办？

当前 ZIP 提供 SHA-256 校验，但尚未使用商业 Authenticode 证书签名。请只从本项目的 GitHub Release 下载。可以在 PowerShell 中运行以下命令，并将结果与 `.sha256` 文件比较：

```powershell
Get-FileHash .\Atlas-Windows-x64.zip -Algorithm SHA256
```

确认校验值一致后，再根据 Windows 提示选择是否运行。Atlas 安装程序不会申请管理员权限、修改注册表或添加防火墙规则。

#### 双击安装后，Codex 中看不到 Atlas

完全退出 Codex 后重新打开，然后进入 **Plugins → Atlas** 并点击 **Connect**。必须新建一个 Codex 对话，已经打开的旧对话可能不会立即加载新插件。

#### Dashboard 没有自动打开

双击解压目录中的 **`Start Atlas.cmd`**。它会自动寻找 4310–4319 中可用的本机端口并打开浏览器。如果窗口提示所有端口都被占用，请关闭旧的 Atlas 进程或占用这些端口的本地程序，再重新运行。

#### 可以移动或删除解压后的文件夹吗？

Atlas 是绿色版本，程序、插件副本和个人数据都保存在解压目录中。安装后不要随意移动或删除这个目录。个人数据位于 `work/data`；删除 Atlas 前请先备份该目录。双击 **`Uninstall Atlas.cmd`** 可以移除 Codex 插件，同时保留数据。

---

## English overview

**Atlas — Local-First AI Memory & Action System** helps people remember what mattered and resume what was interrupted. Its primary experience lives inside Codex conversations: users can explicitly ask Atlas to remember an idea, preserve a decision, recover unfinished work, see today's focus, or search prior evidence without switching to another app. The Web dashboard is the optional workspace for batch review, sources, backup, and settings.

Atlas is an **Apps for Your Life** project for OpenAI Build Week. It is not a general chat archive and does not claim access to all ChatGPT or Codex history.

## Install on Windows

Atlas is distributed as a green, no-admin Windows release:

1. Download `Atlas-Windows-x64.zip` and its `.sha256` file from [GitHub Releases](https://github.com/randyhe/atlas/releases/latest).
2. Verify the SHA-256 value, then extract the complete ZIP to a writable folder.
3. Double-click **Install Atlas.cmd**. It installs the personal Codex plugin, creates a local encrypted authentication token, starts Atlas, and opens the dashboard.
4. Open a new Codex task and say: **“Remember this in Atlas: finish the demo video.”**

No administrator account, Node.js installation, package manager, API key, or hosted Atlas account is required. After installation, use **Start Atlas.cmd** whenever Atlas is not already running. The Web dashboard is optional; normal capture and recall happen in Codex conversations.

To remove the Codex integration, double-click **Uninstall Atlas.cmd**. It unregisters the plugin and local marketplace but preserves `work/data`. Delete the extracted Atlas folder only after you have backed up or intentionally discarded that data.

> The current release is distributed as a ZIP with a published SHA-256 checksum. Windows Authenticode signing is planned but requires a trusted code-signing certificate; the project does not claim that unsigned scripts are digitally signed.

## V1 guarantees

- Local capture, review, open-loop tracking, and FTS search work without an AI API key.
- SQLite is the runtime source of truth.
- Git exports are sanitized and intentionally incomplete for restricted data.
- Conversation capture records `codex` as its source and supports Open Loop, Decision, and Reference candidates.
- Codex integration is the preferred interaction layer, while the local API and Web dashboard preserve independent access to the data.
- The default competition configuration has a $0 external service budget and does not enable usage-based AI APIs. Local electricity, storage, connectivity, and an existing subscription are outside that statement.
- The Windows release generates a 256-bit per-user token protected with Windows DPAPI. Browser access uses an HttpOnly, SameSite session cookie; Codex MCP calls use the same local token.
- The service binds only to `127.0.0.1`. It never creates a firewall exception, listens on the LAN, or enables a public tunnel.

## Golden journeys

1. Import or capture an explicit open loop, inspect its Evidence, accept it in Review, move it through Today, then mark it done or scheduled.
2. Capture the same intent from a second source, inspect the **Possible duplicate** hint, merge the Evidence, then undo only the added Evidence link.
3. Import restricted or adversarial text and verify that it remains inert data, is redacted from ordinary responses, and does not enter Search or sanitized exports.

## Architecture

```text
Codex conversation --> skill / MCP --\
                                      +--> atlasd HTTP API --> SQLite schema v2
Local Web review workspace ----------/          |               | business tables
Source imports --> local extractor ----------+               | audit_events
                                                              ` outbox_events
```

`atlasd` is the only SQLite writer. Imports, URLs, and commands are always treated as untrusted text. The deterministic `competition-1` extractor reads user-authored ChatGPT messages only, emits at most three candidates in Decision → Waiting → Open Loop order, and sends every result to Review.

## Local entry points

- Codex: say “Remember this in Atlas,” “What unfinished work should I resume?”, or “Search Atlas for …”. The installed skill uses the local API fallback when MCP is not exposed.
- Plugin: the Windows installer registers the package-local `atlas-release` marketplace and installs `atlas@atlas-release`; open a new Codex task after installation.
- Web review workspace: the installer opens the selected loopback port. Atlas prefers 4310 and safely falls back through 4319.

## Development

```powershell
pnpm install
pnpm check
pnpm build
pnpm start
```

Open `http://127.0.0.1:4310`. On Windows, runtime data defaults to `%LOCALAPPDATA%\Atlas` so an active SQLite database is not placed inside the OneDrive repository. Use `ATLAS_DATA_DIR` to select a different local directory.

For front-end development, run `pnpm dev` and `pnpm dev:web` in separate terminals, then open `http://127.0.0.1:4311`.

## Import endpoints

- `POST /api/v1/imports/manual`
- `POST /api/v1/imports/daily-log`
- `POST /api/v1/imports/chatgpt-export`

Imported text is always treated as untrusted data and every candidate enters Review during Alpha.

ChatGPT Export is limited to 12 MB per HTTP request and 1,000 conversations. It is a manual historical fallback, not automatic history access.

## Competition testing

The repeatable synthetic harness is documented in [`tests/competition/README.md`](tests/competition/README.md). The visible 30-sample Development set produces Open Loop TP 18 / FP 0 / FN 0 and Decision TP 6 / FP 0 / FN 0. After rule freeze, QA generated and ran the separate 50-sample Holdout once: Open Loop TP 35 / FP 0 / FN 0 with a Wilson 95% precision/recall interval of 90.11%–100%. Ten samples remain explicitly pending BA/QA double-label and user arbitration. These results are not retention evidence or a real 14-day Alpha.

The dated Codex/MCP probe is in [`docs/competition/capability-probe-2026-07-15.md`](docs/competition/capability-probe-2026-07-15.md). A later isolated protocol probe verified all 11 MCP tools and a typed `codex` capture against a non-production database. Atlas MCP tools are still not exposed by this current host task, so MCP remains **Experimental**; the installed Atlas skill now provides a verified loopback HTTP fallback without forcing the user into the dashboard.

Windows release packaging and judge instructions are in [`packaging/windows/README-TESTING.md`](packaging/windows/README-TESTING.md). The release builder bundles a matching Node runtime and a self-contained MCP server. Normal installation creates portable data under the extracted release; `--demo` uses a separate synthetic data directory. Neither mode reads the normal `%LOCALAPPDATA%\Atlas` database.

## Security, trust, and license

- Atlas is local-first and imported text is always inert, untrusted data.
- The installer does not request elevation, edit the registry, or change Windows Firewall.
- Ports are restricted to loopback `127.0.0.1:4310-4319`; if all are occupied, startup stops safely.
- Authentication secrets are protected for the current Windows user with DPAPI and are never committed to Git or included in the ZIP.
- Release ZIPs publish SHA-256 hashes. Authenticode status is stated explicitly and never implied.
- Atlas source code is released under the [MIT License](LICENSE). Bundled runtime dependencies remain under their own licenses; see [Third-Party Notices](THIRD-PARTY-NOTICES.md).

## Human and Codex contribution

The user chose the product promise, review-first workflow, schema v2 boundary, privacy model, zero-paid-provider configuration, competition claims, and release gates. Codex assisted with implementation, tests, architecture review, synthetic evaluation, and packaging. Exact model-version claims should be made only when the submission host exposes verifiable model metadata; this repository does not invent a minor model version.

The post-2026-07-13 implementation history is preserved in Git, beginning with `a5bcf40` (local alpha baseline) and `6ab639e` (P0 review and safe restore), followed by the Build Week competition commits on this branch.
