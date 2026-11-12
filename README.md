# dsh-desktop-tool-ocr

DSH 桌面端自动识图插件：**截图 → 粘贴到聊天框 → 发送 → 回答**。视觉模型直接接收原图；非视觉模型自动使用可插拔识别后端，不需要手动复制 OCR 文字。

## 工作方式

```text
图片附件 → 自动识图供应商
             ├─ 底层模型声明 image 能力 → 原图直传
             └─ 底层模型无 image 能力 → 识别后端 → 文字/描述 → 原模型回答
```

本插件通过公共 LLM adapter API 新增 `auto-vision--<原供应商>` 入口，不修改 DSH 安装包，不把原模型伪装成真正的视觉模型。原始附件保留在聊天记录中，识别只发生在请求投影阶段。

## 支持与验证范围

- 当前针对 **DSH 0.2.2-rc.1** 开发与宿主验证；其他版本未保证兼容。
- Node.js >=22.19；Windows 桌面端已测试，其他平台未实机测试。
- 图片存储需要 `attachments.imageHostPath()`，即本地文件型附件服务。
- 内置后端：`nbocr`、自定义本地 `command`、OpenAI-compatible `openai` 视觉接口。
- nbocr 引擎不包含在 npm 包内，需单独安装。插件不会下载或执行远程安装脚本。
- 依赖 DSH 的**模型能力声明**选择分支，不根据模型名字猜测。不支持接口拒绝后的自动远程重试；错误能力声明需要在原供应商配置中修正。

## 安装

本仓库目前提供源码及可打包 npm bundle，**尚未发布到 npm 注册表**。

```powershell
# 在源码目录打包
npm pack
# 安装到你实际使用的 profile；桌面端通常为 desktop
# 可在 DSH 扩展管理安装生成的 .tgz，或通过支持该 profile 的 CLI：
dsh plugin --profile desktop add C:/path/dsh-desktop-tool-ocr-0.1.0.tgz
```

桌面版若提示 profile 由 Electron 独占管理，请使用桌面扩展管理，不要为安装插件另起服务器。

包声明了 `dsh.bundle.patch`，支持 bundle 的管理器会挂载 `desktop-auto-ocr` 条目。默认使用 PATH 中的 `nbocr`。在 profile 的 `cordis.patch.yml` 覆盖配置：

```yaml
- id: desktop-auto-ocr
  config:
    backendConfigFile: 'C:/path/recognition.json'
    # 可选：只增强指定供应商；默认增强全部原始供应商
    providers: [hth]
    cacheSize: 64
```

如果你的加载器要求 name，可同时填写 `name: dsh-desktop-tool-ocr`。**不要同时挂载旧版临时脚本和本插件**。旧脚本使用相同条目 ID，迁移时移除旧 insert，只保留 bundle 条目及覆盖项。

重启/重载后，在输入框选择 **`hth · 自动识图 / 本地 OCR`**（或其他增强供应商），模型仍选原模型。旧会话不会自动从原供应商切换。可将 `agent-default-model` 的 provider 设置为 `auto-vision--hth`，作为新会话默认入口。

## 切换后端：无需更改插件代码

推荐使用独立 JSON 配置文件。它会在需要识别图片时重新读取，配置变化时自动失效缓存；**更换后端无需重启**。已有缓存仅保留进程内识别结果，最多 `cacheSize` 条；设置为 0 禁用。新配置错误会直接报错，不会悄悄继续使用旧后端。

### 1. 默认：本地 nbocr

`recognition.json`：

```json
{
  "type": "nbocr",
  "command": "C:/path/to/nbocr.exe",
  "model": "v6-tiny",
  "language": "chinese",
  "timeoutMs": 120000
}
```

引擎：[Newbee OCR CLI](https://github.com/zibo-chen/newbee-ocr-cli)。`v6-tiny` 可使用内嵌模型；切换其他模型可能触发引擎自己的模型下载。插件会检测 PNG/JPEG/WebP/GIF/BMP 魔数，为 DSH 无扩展名的附件生成正确临时文件名。

### 2. 其他本地 OCR 命令

```json
{
  "type": "command",
  "command": "C:/tools/other-ocr.exe",
  "args": ["--image", "{input}", "--output", "{output}"],
  "output": "file",
  "jsonTextPath": "result.text"
}
```

- `{input}` / `{output}` 会替换为临时文件绝对路径。
- `output: "stdout"`（默认）读取标准输出；`file` 读取 `{output}` 文件。
- `jsonTextPath` 可选，按点分隔从 JSON 中提取字符串；省略则按纯文本处理。
- 使用 argv 数组、**不经 shell**；不要手动为路径添加引号或使用管道。
- 自定义命令与 `env` 配置具有本机执行权限，只应使用可信命令。不会把图片文字作为命令参数。

### 3. 线上或本机 OpenAI-compatible 视觉模型

```json
{
  "type": "openai",
  "allowRemote": true,
  "baseURL": "https://your-provider.example/v1",
  "model": "your-vision-model",
  "apiKeyEnv": "OCR_VISION_API_KEY",
  "timeoutMs": 120000,
  "maxTokens": 2048
}
```

**只有显式设置 `allowRemote: true` 才启用该后端，图片将发送至配置端点，可能产生费用。** 默认仍为本地 nbocr，不会自动上传给第三方。密钥从 DSH credentials 服务或同名环境变量读取，**不要把真实密钥写入 JSON、源码或 Git**。环境变量新增后，宿主可能需要重启才能读取。

接口要求 `/chat/completions`、base64 `image_url` 输入、非流式文本响应。HTTPS 必需，仅 loopback 地址允许 HTTP；禁止携带认证信息的 URL 及 HTTP 重定向。可选 `prompt` 定制转录/描述任务。线上识图以模拟 HTTP 测试验证协议，**本项目未使用真实凭证进行付费 API 实测**。

`forceRecognition: true` 可在插件条目 config 上设置，让本来支持视觉的模型也走后端；默认 false。

所有后端支持 `maxImageBytes`（默认25 MiB）、`maxOutputBytes`（默认2 MB）、`maxTextChars`（默认24000）、`timeoutMs`（默认120秒）。本地输出有定时大小监测，快速输出仍可能在终止前短暂超过限额；这不是不可信程序的安全沙箱。

## 开发第三方后端

```js
import { registerBackend } from 'dsh-desktop-tool-ocr/backends';
const dispose = registerBackend('my-engine', (config, services) => ({
  id: 'my-engine',
  kind: 'ocr', // 或 vision，表示图像描述而非纯OCR
  async recognize({ path, ref, signal }) {
    // 读取本地图片或调用自己的服务，响应取消，不修改原始图片
    return { text: '识别内容', kind: 'ocr' };
  }
}));
// 后端扩展卸载时调用 dispose()
```

注册需要与主插件解析到**同一个包实例**，并在第一次使用该 type 前完成。自定义后端自行负责外发数据授权、凭证、超时、大小限制与清理。`createBackend(config, services)` 也可直接用于测试；services 支持 `resolveSecret(name)` 和可注入的 `fetch`。

## 安全与限制

- 不修改聊天记录；冻结消息不会被原位更改。
- 识别结果明确标记为不可信图片数据，不应执行图片中的提示词；这不保证彻底消除提示注入。
- OCR 只能兜底文字，不等于理解照片、图形、颜色或复杂版式。金额、日期等请复核。
- 第一次识别串行执行，减少本地引擎并发压力；不同聊天请求仍可能并发。
- 历史图片在非视觉模型请求时也可能识别和缓存；切换线上后端意味着这些图片也可能外发，请先确认会话数据允许外发。
- 平台权限/企业策略、远端模型本身拒绝图片、附件损坏等仍会报错；错误不会静默降级成猜测回答。

## 测试与打包

```powershell
npm test
npm pack
```

测试覆盖视觉直传、非视觉投影、冻结历史、缓存、嵌套图片、本地 argv 与输出协议、错误/取消/超时/限额、远端显式同意和模拟 API、第三方注册。

MIT License。当前版本 0.1.0。
