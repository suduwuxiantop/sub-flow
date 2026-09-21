# Sub-Flow

把任意机场（VPN/代理服务商）的订阅链接，转换成一份根据使用习惯自动分流的 Clash / Mihomo 订阅。

在线体验：<https://sub.suduwuxian.top>

## 它解决什么问题

大部分机场给的订阅只是一堆节点，客户端默认全局走一个策略，要么全代理要么全直连。真正好用的分流规则（AI 工具走代理、国内网站直连、广告拦截、流媒体单独分组）需要自己手写 Clash 规则，对不熟悉配置格式的人门槛很高。

Sub-Flow 做的事情很简单：

1. 你贴入原始订阅链接（支持 `vmess://` `trojan://` `vless://` `ss://` `hysteria2://`，以及机场直接返回 Clash YAML 格式的订阅）
2. 勾选你关心的分类（AI 工具 / 国外流媒体 / 社交媒体 / Google / 游戏平台 / 微软苹果直连 / 广告拦截）
3. 生成一个新的订阅链接，添加到 Clash Verge / Clash Mi / Mihomo 等客户端

新链接本身是"活的"——客户端每次刷新订阅，Sub-Flow 都会重新拉取你的原始机场订阅，保证节点始终是最新的，分流规则也会跟着社区维护的规则库每天自动更新。

## 支持的协议

- VMess (`vmess://`)
- Trojan (`trojan://`)
- VLESS (`vless://`，含 REALITY / WS / gRPC)
- Shadowsocks (`ss://`，含用户信息 base64 内嵌和整体 base64 两种写法)
- Hysteria2 (`hysteria2://` / `hy2://`)
- 已经是 Clash YAML 格式的订阅（直接透传）

## 架构

零依赖，纯 Node.js 内置模块实现，没有数据库，没有用户账号体系：

```
public/index.html   前端单页
server.js           HTTP 路由：/api/categories /api/generate /sub/:token
lib/parse.js         协议解析 -> Clash proxy 对象
lib/rules.js          分流分类定义（对接开源规则库 blackmatrix7/ios_rule_script）
lib/generate.js       生成完整 Clash 配置对象
lib/yaml.js            零依赖 YAML 序列化
lib/fetcher.js          安全的订阅拉取（限流、限速、限重定向）
lib/ssrf-guard.js        防止内网穿透 / 服务器自身探测
lib/storage.js            token -> 原始订阅信息 映射（本地 JSON 文件）
lib/ratelimit.js           简单的按 IP 限流
```

分流规则集来自开源社区维护的 [blackmatrix7/ios_rule_script](https://github.com/blackmatrix7/ios_rule_script)，通过 jsdelivr CDN 镜像加载，Clash 客户端本地每 24 小时自动刷新一次规则，不需要 Sub-Flow 自己维护规则内容。

## 安全设计

这是一个公开工具，会替用户去抓取任意 URL，天然是 SSRF 高危场景，因此：

- 只允许 `http/https`
- 拒绝解析到内网 / 回环 / 链路本地地址的域名（含重定向链路上的每一跳）
- 显式拒绝指向部署此服务自身的域名/IP
- 单次拉取限制 3MB、10 秒超时、最多 5 次重定向
- 按 IP 限流（生成接口每小时 20 次，订阅拉取接口每小时 60 次）

## 本地运行

```bash
node server.js
# 默认监听 :3721，可用 PORT 环境变量修改
```

```bash
npm test   # 跑内置的解析/生成单元测试
```

## 部署

不依赖任何 npm 包，服务器上只要有 Node.js 即可直接运行，推荐用 pm2 常驻：

```bash
pm2 start server.js --name sub-flow
```

宝塔面板：在"网站"新建一个 Node 项目站点指向本目录，启动文件填 `server.js`，端口按需修改（默认 3721），并在 Nginx 反向代理里配置好域名转发即可。

## License

MIT
