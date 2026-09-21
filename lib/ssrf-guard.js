'use strict';

const dns = require('dns').promises;
const net = require('net');

// IPs/hostnames of the server this app itself runs on, so the tool can never be pointed
// back at the host's own admin panels (e.g. BT panel) or internal services.
const SELF_HOSTS = new Set([
  '194.127.193.212',
  'localhost',
  'main.suduwuxian.top',
  'qaz.suduwuxian.top',
]);

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  return false;
}

function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::1') return true;
  if (lower.startsWith('fe80:')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
  if (lower.startsWith('::ffff:')) {
    const v4 = lower.slice('::ffff:'.length);
    if (net.isIPv4(v4)) return isPrivateIPv4(v4);
  }
  return false;
}

function isPrivateIP(ip) {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true; // unknown format -> treat as unsafe
}

// Throws if the URL is not safe to fetch server-side. Returns nothing on success.
async function assertSafeUrl(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch (e) {
    throw new Error('订阅链接格式不合法');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('只支持 http/https 订阅链接');
  }
  const hostname = u.hostname.replace(/^\[|\]$/g, '');
  if (SELF_HOSTS.has(hostname)) {
    throw new Error('不允许指向本服务自身地址');
  }
  if (net.isIP(hostname)) {
    if (isPrivateIP(hostname)) throw new Error('不允许访问内网地址');
    return;
  }
  let records;
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch (e) {
    throw new Error('无法解析该域名');
  }
  if (!records.length) throw new Error('无法解析该域名');
  for (const r of records) {
    if (isPrivateIP(r.address)) throw new Error('该域名解析到内网地址，已拒绝');
  }
}

module.exports = { assertSafeUrl };
