# v0.1.0

首个公开发布版本，针对 DSH 0.2.2-rc.1。

- 视觉模型原图直传，非视觉模型自动调用识别后端。
- 内置本地 nbocr、自定义命令及显式授权的 OpenAI-compatible 线上视觉后端。
- 独立 JSON 配置热切换、进程内缓存、取消/超时/大小限制。
- 无扩展名 DSH 附件自动识别图片格式。
- 13 项单元测试及 Windows DSH 实际宿主 smoke 测试通过。
- OCR 引擎需单独安装；线上 API 未使用真实凭证实测，仅模拟协议测试。

## 安装

下载 `dsh-desktop-tool-ocr-0.1.0.tgz`，在 DSH 扩展管理中安装。

或启用「自定义插件索引」并添加：
`https://raw.githubusercontent.com/huanglihome1996-rgb/dsh-desktop-tool-ocr/main/market/index.json`

详细配置见 README。使用原供应商的 `auto-vision--` 增强入口，旧会话需要切换一次。
