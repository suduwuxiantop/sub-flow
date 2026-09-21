'use strict';

const { CATEGORIES, BASELINE } = require('./rules');

const SELECT_GROUP = '🚀 节点选择'; // 🚀 节点选择
const AUTO_GROUP = '♻️ 自动选择'; // ♻️ 自动选择

function buildRuleProvider(p) {
  return {
    type: 'http',
    behavior: 'classical',
    url: p.url,
    path: `./rule-providers/${p.name}.yaml`,
    interval: 86400,
  };
}

// Maps a sanitized custom rule's policy keyword to the actual Clash target it resolves to.
function customRuleTarget(policy) {
  if (policy === 'proxy') return SELECT_GROUP;
  if (policy === 'direct') return 'DIRECT';
  if (policy === 'reject') return 'REJECT';
  return 'DIRECT';
}

// proxies: array of Clash proxy objects (already parsed)
// selectedIds: array of category ids the user ticked
// customRules: array of { type, value, policy } already sanitized by lib/rules.sanitizeCustomRules
function generateClashConfig(proxies, selectedIds, customRules) {
  const names = proxies.map((p) => p.name);
  const selected = new Set(selectedIds || []);
  const activeCategories = CATEGORIES.filter((c) => selected.has(c.id));

  const proxyGroups = [];
  proxyGroups.push({
    name: SELECT_GROUP,
    type: 'select',
    proxies: [AUTO_GROUP, ...names, 'DIRECT'],
  });
  proxyGroups.push({
    name: AUTO_GROUP,
    type: 'url-test',
    proxies: names,
    url: 'http://www.gstatic.com/generate_204',
    interval: 300,
    tolerance: 50,
  });

  for (const cat of activeCategories) {
    if (cat.policy === 'PROXY_GROUP') {
      proxyGroups.push({
        name: cat.groupName,
        type: 'select',
        proxies: [SELECT_GROUP, AUTO_GROUP, ...names, 'DIRECT'],
      });
    }
  }

  const ruleProviders = {};
  const rules = [];

  // Baseline: private network + China always direct, never proxied.
  ruleProviders[BASELINE.lan.name] = buildRuleProvider(BASELINE.lan);
  rules.push(`RULE-SET,${BASELINE.lan.name},DIRECT`);

  // User-defined custom rules take precedence over every preset category, so they're
  // inserted right after the LAN baseline and before any rule-set matching begins.
  for (const rule of customRules || []) {
    rules.push(`${rule.type},${rule.value},${customRuleTarget(rule.policy)}`);
  }

  for (const cat of activeCategories) {
    const target = cat.policy === 'PROXY_GROUP' ? cat.groupName : cat.policy;
    for (const provider of cat.providers) {
      ruleProviders[provider.name] = buildRuleProvider(provider);
      rules.push(`RULE-SET,${provider.name},${target}`);
    }
  }

  ruleProviders[BASELINE.chinaSite.name] = buildRuleProvider(BASELINE.chinaSite);
  ruleProviders[BASELINE.chinaIp.name] = buildRuleProvider(BASELINE.chinaIp);
  rules.push(`RULE-SET,${BASELINE.chinaSite.name},DIRECT`);
  rules.push(`RULE-SET,${BASELINE.chinaIp.name},DIRECT,no-resolve`);

  rules.push(`MATCH,${SELECT_GROUP}`);

  const config = {
    'mixed-port': 7890,
    'allow-lan': false,
    mode: 'rule',
    'log-level': 'info',
    ipv6: true,
    'unified-delay': true,
    'tcp-concurrent': true,
    'external-controller': '127.0.0.1:9090',
    proxies,
    'proxy-groups': proxyGroups,
    'rule-providers': ruleProviders,
    rules,
  };

  return config;
}

module.exports = { generateClashConfig, SELECT_GROUP, AUTO_GROUP };
