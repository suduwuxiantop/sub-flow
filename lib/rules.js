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
// `group` is a UI-only section label used to organize the (growing) checkbox list and to
// power the search/filter box on the front end. It has no effect on the generated config.
const CATEGORIES = [
  {
    id: 'ai',
    label: 'AI 工具（ChatGPT / Claude / Gemini / Copilot）',
    group: 'AI',
    groupName: 'AI 工具',
    policy: 'PROXY_GROUP',
    providers: [rp('OpenAI'), rp('Claude'), rp('Gemini'), rp('Copilot')],
  },
  {
    id: 'streaming',
    label: '国外流媒体（Netflix / Disney+ / YouTube / Spotify）',
    group: '流媒体',
    groupName: '流媒体',
    policy: 'PROXY_GROUP',
    providers: [rp('Netflix'), rp('Disney'), rp('YouTube'), rp('Spotify'), rp('HBO')],
  },
  {
    id: 'video_cn',
    label: '哔哩哔哩（港澳台 / 海外番剧解锁）',
    group: '流媒体',
    groupName: '哔哩哔哩',
    policy: 'PROXY_GROUP',
    providers: [rp('BiliBili')],
  },
  {
    id: 'tiktok',
    label: 'TikTok（国际版抖音）',
    group: '流媒体',
    groupName: 'TikTok',
    policy: 'PROXY_GROUP',
    providers: [rp('TikTok')],
  },
  {
    id: 'social',
    label: '社交媒体（Telegram / X(Twitter) / Instagram / Facebook）',
    group: '社交',
    groupName: '社交媒体',
    policy: 'PROXY_GROUP',
    providers: [rp('Telegram'), rp('Twitter'), rp('Instagram'), rp('Facebook')],
  },
  {
    id: 'chat',
    label: '即时通讯（WhatsApp / Discord / Line）',
    group: '社交',
    groupName: '即时通讯',
    policy: 'PROXY_GROUP',
    providers: [rp('Whatsapp'), rp('Discord'), rp('Line')],
  },
  {
    id: 'social2',
    label: '更多社区（Reddit / Pinterest）',
    group: '社交',
    groupName: '更多社区',
    policy: 'PROXY_GROUP',
    providers: [rp('Reddit'), rp('Pinterest')],
  },
  {
    id: 'google',
    label: 'Google 全家桶',
    group: '常用服务',
    groupName: 'Google',
    policy: 'PROXY_GROUP',
    providers: [rp('Google')],
  },
  {
    id: 'game',
    label: '游戏平台（Steam / Epic / Xbox）',
    group: '游戏',
    groupName: '游戏平台',
    policy: 'PROXY_GROUP',
    providers: [rp('Steam'), rp('Epic'), rp('Xbox')],
  },
  {
    id: 'microsoft_apple',
    label: '微软 / 苹果服务（走直连，不占用节点）',
    group: '常用服务',
    groupName: null,
    policy: 'DIRECT',
    providers: [rp('Microsoft'), rp('Apple')],
  },
  {
    id: 'ads',
    label: '去广告与追踪拦截',
    group: '其他',
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

// --- Custom user-defined rules ---------------------------------------------------------
// Users can define their own simple routing rules beyond the preset categories above.
// These are strictly allowlisted (type / policy / value shape) before ever reaching the
// generated Clash config, since they are user-supplied text that ends up in a YAML file
// served back out to a Clash client.

const CUSTOM_RULE_TYPES = ['DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'IP-CIDR'];
const CUSTOM_RULE_POLICIES = ['proxy', 'direct', 'reject'];
const MAX_CUSTOM_RULES = 20;
const MAX_RULE_VALUE_LENGTH = 253; // longest a DNS name can legally be

// Conservative shape check for the "value" column of a rule. We don't try to be a full
// domain/CIDR validator, just reject anything that could break YAML/Clash rule parsing
// (commas, whitespace, control characters, rule-injection via embedded newlines, etc).
const SAFE_VALUE_RE = /^[a-zA-Z0-9.:_/-]+$/;

// Validates and sanitizes a raw customRules array from a client request.
// Throws with a user-facing Chinese message on the first invalid entry.
// Returns a clean array of { type, value, policy } ready to feed into generateClashConfig.
function sanitizeCustomRules(raw) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error('自定义规则格式错误');
  if (raw.length > MAX_CUSTOM_RULES) {
    throw new Error(`自定义规则最多支持 ${MAX_CUSTOM_RULES} 条`);
  }

  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') throw new Error('自定义规则格式错误');
    const type = String(item.type || '').trim().toUpperCase();
    const value = String(item.value || '').trim();
    const policy = String(item.policy || '').trim().toLowerCase();

    if (!CUSTOM_RULE_TYPES.includes(type)) {
      throw new Error(`不支持的自定义规则类型：${type || '(空)'}`);
    }
    if (!CUSTOM_RULE_POLICIES.includes(policy)) {
      throw new Error(`不支持的自定义规则策略：${policy || '(空)'}`);
    }
    if (!value || value.length > MAX_RULE_VALUE_LENGTH || !SAFE_VALUE_RE.test(value)) {
      throw new Error(`自定义规则内容不合法：${value || '(空)'}`);
    }

    out.push({ type, value, policy });
  }
  return out;
}

module.exports = {
  CATEGORIES,
  BASELINE,
  CUSTOM_RULE_TYPES,
  CUSTOM_RULE_POLICIES,
  MAX_CUSTOM_RULES,
  sanitizeCustomRules,
};
