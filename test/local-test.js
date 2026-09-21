'use strict';

const { parseSubscriptionBody } = require('../lib/parse');
const { generateClashConfig } = require('../lib/generate');
const { dump } = require('../lib/yaml');

const vmessJson = {
  v: '2', ps: '测试vmess-hk', add: '1.2.3.4', port: '443', id: '11111111-2222-3333-4444-555555555555',
  aid: '0', net: 'ws', type: 'none', host: 'hk.example.com', path: '/ray', tls: 'tls', sni: 'hk.example.com', scy: 'auto',
};
const vmessUri = 'vmess://' + Buffer.from(JSON.stringify(vmessJson)).toString('base64');

const lines = [
  vmessUri,
  'trojan://mypassword@2.3.4.5:443?sni=jp.example.com#测试trojan-jp',
  'ss://' + Buffer.from('aes-256-gcm:sspass').toString('base64') + '@3.4.5.6:8388#测试ss-sg',
  'vless://aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee@4.5.6.7:443?security=tls&sni=us.example.com&type=ws&path=%2Fv#测试vless-us',
  'hysteria2://hy2pass@5.6.7.8:443?sni=de.example.com#测试hy2-de',
];

const subBody = Buffer.from(lines.join('\n')).toString('base64');

console.log('=== parse test ===');
const parsed = parseSubscriptionBody(subBody);
console.log(JSON.stringify(parsed.proxies, null, 2));

if (!parsed.proxies || parsed.proxies.length !== 5) {
  console.error('FAIL: expected 5 proxies, got', parsed.proxies && parsed.proxies.length);
  process.exit(1);
}

console.log('\n=== generate test (categories: ai, streaming, ads) ===');
const config = generateClashConfig(parsed.proxies, ['ai', 'streaming', 'ads']);
const yamlText = dump(config);
console.log(yamlText);

// basic sanity checks
if (!yamlText.includes('proxies:')) throw new Error('missing proxies section');
if (!yamlText.includes('proxy-groups:')) throw new Error('missing proxy-groups section');
if (!yamlText.includes('rule-providers:')) throw new Error('missing rule-providers section');
if (!yamlText.includes('MATCH,')) throw new Error('missing final MATCH rule');
if (!yamlText.includes('AI 工具')) throw new Error('missing AI category group');
console.log('\nALL CHECKS PASSED');
