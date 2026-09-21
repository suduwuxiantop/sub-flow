'use strict';

// Rule-set source: blackmatrix7/ios_rule_script (via jsdelivr CDN mirror, more reliable
// inside mainland China than raw.githubusercontent.com).
const BASE = 'https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash';

function rp(name) {
  return { name, url: `${BASE}/${name}/${name}.yaml` };
}

// Each category the user can tick on the web page.
// `policy` is the Clash policy this category's traffic goes to:
//   'PROXY_GROUP' -> routed into the user's node-selector group (built at generation time)
//   'DIRECT'      -> bypass the proxy entirely
//   'REJECT'      -> blocked (used for ad/tracker block)
const CATEGORIES = [
  {
    id: 'ai',
    label: 'AI 工具（ChatGPT / Claude / Gemini 等）',
    groupName: 'AI 工具',
    policy: 'PROXY_GROUP',
    providers: [rp('OpenAi'), rp('Claude'), rp('Gemini'), rp('Copilot')],
  },
  {
    id: 'streaming',
    label: '国外流媒体（Netflix / Disney+ / YouTube / Spotify）',
    groupName: '流媒体',
    policy: 'PROXY_GROUP',
    providers: [rp('Netflix'), rp('Disney'), rp('YouTube'), rp('Spotify'), rp('HBO')],
  },
  {
    id: 'social',
    label: '社交媒体（Telegram / X(Twitter) / Instagram / Facebook）',
    groupName: '社交媒体',
    policy: 'PROXY_GROUP',
    providers: [rp('Telegram'), rp('Twitter'), rp('Instagram'), rp('Facebook')],
  },
  {
    id: 'google',
    label: 'Google 全家桶',
    groupName: 'Google',
    policy: 'PROXY_GROUP',
    providers: [rp('Google')],
  },
  {
    id: 'game',
    label: '游戏平台（Steam / Epic）',
    groupName: '游戏平台',
    policy: 'PROXY_GROUP',
    providers: [rp('Steam'), rp('Epic')],
  },
  {
    id: 'microsoft_apple',
    label: '微软 / 苹果服务（走直连，不占用节点）',
    groupName: null,
    policy: 'DIRECT',
    providers: [rp('Microsoft'), rp('Apple')],
  },
  {
    id: 'ads',
    label: '去广告与追踪拦截',
    groupName: null,
    policy: 'REJECT',
    providers: [rp('Advertising')],
  },
];

// Always applied regardless of user selection, so the base config always makes sense.
const BASELINE = {
  lan: rp('Lan'),
  chinaSite: rp('China'),
  chinaIp: rp('ChinaIp'),
};

module.exports = { CATEGORIES, BASELINE };
