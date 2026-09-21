'use strict';

const http = require('http');
const https = require('https');
const { assertSafeUrl } = require('./ssrf-guard');

const MAX_BYTES = 3 * 1024 * 1024; // 3MB cap
const TIMEOUT_MS = 10000;
const MAX_REDIRECTS = 5;

function fetchOnce(urlStr) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(urlStr);
    } catch (e) {
      return reject(new Error('URL 无效'));
    }
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(
      u,
      {
        timeout: TIMEOUT_MS,
        headers: {
          'User-Agent': 'clash.meta/1.19.0 (sub-flow converter)',
          Accept: '*/*',
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ redirect: new URL(res.headers.location, u).toString() });
        }
        if (status < 200 || status >= 300) {
          res.resume();
          return reject(new Error(`订阅源返回状态码 ${status}`));
        }
        const chunks = [];
        let total = 0;
        res.on('data', (chunk) => {
          total += chunk.length;
          if (total > MAX_BYTES) {
            req.destroy();
            reject(new Error('订阅内容过大，已中止'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => resolve({ body: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', reject);
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error('请求超时'));
    });
    req.on('error', reject);
  });
}

async function fetchSubscription(urlStr) {
  let current = urlStr;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await assertSafeUrl(current);
    const result = await fetchOnce(current);
    if (result.redirect) {
      current = result.redirect;
      continue;
    }
    return result.body;
  }
  throw new Error('重定向次数过多');
}

module.exports = { fetchSubscription };
