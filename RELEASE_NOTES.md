# v0.2.0

- 安装激活、模型目录/设置更新时扫描模型；调用前按精确ID核验。
- 官方文档/元数据证据三态缓存，报告包含URL、时间、证据hash及路由信任状态。
- OpenAI官方模型Markdown、DeepSeek明确文档ID及可配置官方models API；不按名称推测能力。
- 区分厂商能力与第三方网关传图能力，第三方默认不自动修正。
- 支持通过公共settings CAS修正已确认可信路由的 pi-ai models[].input；其他adapter仅报告。
- 手动覆盖、别名映射、禁用联网/写配置开关。
- 24项单测与实际宿主识图回归通过；公开DeepSeek/OpenAI文档实时核验通过，未知模型404保持unknown。
- 未覆盖所有厂商；不调用付费推理、不发送用户图片探测，不将未知视作不支持。

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
