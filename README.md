# 词语接龙 · 小组 PK 赛

面向三年级语文课堂的独立 Web App。支持：

- 尾字相同、尾音相同、成语接龙三种规则
- 自由练习与 2～4 组轮流 PK
- 浏览器中文语音识别，以及老师键盘输入兜底
- 自动判定、音效、积分、撤销、尝试记录与冠军结算
- 本地成语词典与带声调拼音判断，不依赖外部工作流或密钥

## 项目架构

使用 React 19、TypeScript、Vite 和 Tailwind CSS，构建产物为 `dist/` 下的静态文件。游戏逻辑、计分和成语校验在浏览器内运行，无需应用服务器、数据库或 API 密钥。

已移除 OpenAI Sites、vinext、Next.js 兼容层和 Cloudflare Workers 部署依赖。字体使用系统字体栈，构建无需下载 Google Fonts。

```text
index.html              页面入口、标题、分享信息
src/main.tsx            React 挂载入口
src/App.tsx             游戏界面和交互逻辑
src/globals.css         全局样式
components/、lib/         共享组件和工具
public/                 成语词典、图标、分享图片
.github/workflows/deploy.yml  检查、构建与 Pages 部署
```

## 本地运行

推荐 Node.js 24（版本记录在 `.nvmrc`）。

```bash
npm ci
npm run dev
```

建议课堂电脑使用最新版 Chrome 或 Edge，并允许网页访问麦克风。语音识别不可用时，仍可通过页面中的老师输入框完成游戏。

## 构建和检查

```bash
npm run lint
npm run typecheck
npm run build
npm run preview
```

`npm run preview`（或 `npm start`）仅用于本地预览构建结果；线上由 GitHub Pages 提供静态文件。

本地默认使用根路径 `/`。模拟当前仓库的 Pages 子路径：

```bash
BASE_PATH=/teacher-helper-games/ npm run build
BASE_PATH=/teacher-helper-games/ npm run preview
```

打开 `http://localhost:4173/teacher-helper-games/`。词典、脚本、样式和图片统一使用 Vite 的基础路径。

## GitHub Actions 部署

首次启用：

1. 在仓库 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。
2. 将本次修改提交并推送到 `main` 分支。
3. 在 **Actions → Build and deploy to GitHub Pages** 中查看运行结果；也可选择 `main` 后点击 **Run workflow** 手动部署。

工作流先执行 `npm ci`、lint、类型检查和构建，再上传 `dist/` 并部署到 `github-pages` 环境。Pull Request 和非 `main` 分支的手动运行只执行检查和构建；仅 `main` 可以发布。

部署使用 GitHub 自动提供的 `GITHUB_TOKEN` 和 OIDC，无需设置个人访问令牌、Sites 或 Cloudflare 密钥。仓库需允许 GitHub Actions，且 `github-pages` 环境的部署规则应允许 `main`。

默认访问地址为 [词语接龙](https://chenxno7.github.io/teacher-helper-games/)，首次部署成功后生效；实际地址以工作流的 deployment 输出为准。工作流从 `configure-pages` 获取基础路径，可适配仓库子路径、用户站点或在 Pages 设置中配置的自定义域名。

官方参考：[Vite 静态部署](https://vite.dev/guide/static-deploy.html#github-pages)、[GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## 数据说明

成语校验数据整理自 MIT 许可的 [chinese-xinhua](https://github.com/pwxcoo/chinese-xinhua)，构建时只保留四个汉字的成语词条。拼音与词语语境读音由 `pinyin-pro` 提供。
