# EasyCore Item Web Editer

EasyCore 物品生成器是一个纯前端静态工具，用于制作 EasyCore 网易物品配置，并导出 EasyCore 组件配置与 NeigeItems 示例配置。

## 在线访问

[https://bluenines.github.io/easycore_item_web_editer/](https://bluenines.github.io/easycore_item_web_editer/)

## 功能

- 选择本地 easycore 组件目录后进入编辑器。
- 拖入 PNG 作为物品贴图，并自动计算像素哈希。
- 从组件的 `resource_packs/easyCoreResource/textures/items` 读取已有贴图，用于导出时复用相同像素的贴图路径。
- 只在 `java_identifier` 选择网格中显示已经匹配到材质贴图的条目。
- 导出行为包物品 JSON、资源包物品 JSON、`textures/item_texture.json`、PNG 贴图和 NeigeItems 示例 YAML。
- 贴图像素相同的多个物品仍然分别导出自己的物品配置，只复用贴图路径和 PNG。

## 本地运行

这是静态页面，可以直接打开 `index.html`。如果浏览器限制目录读取能力，建议用本地静态服务运行：

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

然后访问：

```text
http://127.0.0.1:8765/
```

## 目录

- `index.html`：页面入口。
- `app.js`：编辑器主逻辑。
- `styles.css`：页面样式。
- `java_identifier_mapping.js`：`java_identifier` 到 material 数字 ID 的映射。
- `java_identifier_textures.js`：`java_identifier` 到原版材质贴图的映射。
- `items/`：选择器实际使用的原版材质贴图。

## 开源协议

MIT License
