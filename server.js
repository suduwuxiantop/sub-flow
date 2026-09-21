'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const { fetchSubscription } = require('./lib/fetcher');
const { parseSubscriptionBody } = require('./lib/parse');
const { generateClashConfig } = require('./lib/generate');
const { dump } = require('./lib/yaml');
const { CATEGORIES, sanitizeCustomRules } = require('./lib/rules');
const { createToken, getToken } = require('./lib/storage');
const { allow } = require('./lib/ratelimit');

const PORT = process.env.PORT || 3721;
const PUBLIC_DIR = path.join(__dirname, 'public');

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return xf.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req, maxBytes = 200000) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function buildYamlFromSubUrl(subUrl, categories, customRules) {
  const body = await fetchSubscription(subUrl);
  const parsed = parseSubscriptionBody(body);
  if (parsed.alreadyYaml) {
    // Source already returns a Clash config; pass through proxies only if we can find them,
    // otherwise just relay the raw content untouched.
    return parsed.raw;
  }
  if (!parsed.proxies || parsed.proxies.length === 0) {
    throw new Error('未能从该订阅中解析出任何节点，请确认链接是否为标准机场订阅');
  }
  const config = generateClashConfig(parsed.proxies, categories, customRules);
  return dump(config);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function serveStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('not found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const ip = clientIp(req);

  try {
    if (req.method === 'GET' && url.pathname === '/api/categories') {
      return sendJson(
        res,
        200,
        CATEGORIES.map((c) => ({ id: c.id, label: c.label, group: c.group }))
      );
    }

    if (req.method === 'POST' && url.pathname === '/api/generate') {
      if (!allow(`gen:${ip}`, 20, 3600000)) {
        return sendJson(res, 429, { error: '请求过于频繁，请稍后再试' });
      }
      const bodyText = await readBody(req);
      let payload;
      try {
        payload = JSON.parse(bodyText);
      } catch (e) {
        return sendJson(res, 400, { error: '请求格式错误' });
      }
      const subUrl = String(payload.subUrl || '').trim();
      const categories = Array.isArray(payload.categories) ? payload.categories : [];
      if (!subUrl) return sendJson(res, 400, { error: '请提供订阅链接' });

      let customRules;
      try {
        customRules = sanitizeCustomRules(payload.customRules);
      } catch (e) {
        return sendJson(res, 400, { error: e.message || '自定义规则格式错误' });
      }

      // Validate once up-front so obviously-bad input fails fast with a clear message,
      // even though /sub/:token re-validates on every real fetch too.
      try {
        await buildYamlFromSubUrl(subUrl, categories, customRules);
      } catch (e) {
        return sendJson(res, 400, { error: e.message || '生成失败' });
      }

      const token = createToken({ subUrl, categories, customRules });
      return sendJson(res, 200, { token, subPath: `/sub/${token}` });
    }

    if (req.method === 'GET' && url.pathname.startsWith('/sub/')) {
      const token = url.pathname.slice('/sub/'.length);
      if (!allow(`sub:${ip}`, 60, 3600000)) {
        res.writeHead(429, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('请求过于频繁');
      }
      const record = getToken(token);
      if (!record) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('订阅不存在或已失效');
      }
      try {
        const yamlText = await buildYamlFromSubUrl(record.subUrl, record.categories, record.customRules);
        res.writeHead(200, {
          'Content-Type': 'text/yaml; charset=utf-8',
          'Content-Disposition': 'attachment; filename="sub-flow.yaml"',
          'Cache-Control': 'no-store',
        });
        return res.end(yamlText);
      } catch (e) {
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end(`源订阅拉取失败：${e.message || e}`);
      }
    }

    if (req.method === 'GET') {
      return serveStatic(req, res, url.pathname);
    }

    res.writeHead(405);
    res.end('method not allowed');
  } catch (e) {
    sendJson(res, 500, { error: '服务器内部错误' });
  }
});

server.listen(PORT, () => {
  console.log(`sub-flow listening on :${PORT}`);
});
