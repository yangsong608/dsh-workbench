# 第三方组件与许可

`dsh-workbench` 本体遵循仓库既有许可。以下第三方组件以**原样 vendor** 的方式随插件发布，
仅用于「灵感」模块的两张图，不参与主 bundle 打包，进入灵感视图时按需加载。

| 组件 | 版本 | 许可 | 位置 | 用途 |
|---|---|---|---|---|
| [mind-elixir](https://github.com/SSShooter/mind-elixir-core) | 5.15.1 | MIT | `assets/vendor/mind-elixir/MindElixir.iife.js`、`MindElixir.css` | 思维导图编辑（内联编辑 / 拖拽 / 撤销 / 折叠 / 快捷键） |
| [Apache ECharts](https://echarts.apache.org/) | 6.1.0 | Apache-2.0 | `assets/vendor/echarts.min.js` | 力导图（`graph` + `layout:force`，拖拽 / 缩放 / 邻接高亮） |

## 说明

- vendor 文件保留了各自构建产物中的版权声明；未做修改，升级时整文件替换。
- mind-elixir 通过 `<script>` 注入 `document.head`（IIFE 全局 `MindElixir`），样式表注入 Shadow Root；
  ECharts 同样以 `<script>` 注入后使用全局 `echarts`。
- 两者的加载路径由宿主白名单路由提供（`/workbench-api/assets/vendor/*`），只放行上述三个文件名。
- 若需要离线或内网分发，直接保留 `assets/vendor/` 目录即可，无需额外构建步骤。
