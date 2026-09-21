'use strict';

const { parse: parseYamlDoc } = require('./yaml');

// ---- base64 helpers (url-safe tolerant) ----
function b64decode(str) {
  let s = String(str).trim().replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64').toString('utf8');
}

function looksLikeBase64(str) {
  const s = str.trim();
  if (s.length < 8) return false;
  return /^[A-Za-z0-9+/_=\-\s]+$/.test(s);
}

function safeDecodeURIComponent(s) {
  try { return decodeURIComponent(s); } catch (e) { return s; }
}

function parseQuery(qs) {
  const out = {};
  if (!qs) return out;
  for (const pair of qs.split('&')) {
    if (!pair) continue;
    const idx = pair.indexOf('=');
    const k = idx === -1 ? pair : pair.slice(0, idx);
    const v = idx === -1 ? '' : pair.slice(idx + 1);
    out[safeDecodeURIComponent(k)] = safeDecodeURIComponent(v);
  }
  return out;
}

function splitNameFromUri(uri) {
  const hashIdx = uri.indexOf('#');
  let name = '';
  let rest = uri;
  if (hashIdx !== -1) {
    name = safeDecodeURIComponent(uri.slice(hashIdx + 1));
    rest = uri.slice(0, hashIdx);
  }
  return { rest, name };
}

let anonCounter = 0;
function nextName(prefix) {
  anonCounter += 1;
  return `${prefix}-${anonCounter}`;
}

// ---- individual protocol parsers -> return a Clash proxy object, or null on failure ----

function parseVmess(uri) {
  try {
    const b64 = uri.slice('vmess://'.length);
    const json = JSON.parse(b64decode(b64));
    const name = (json.ps && String(json.ps).trim()) || nextName('vmess');
    const proxy = {
      name,
      type: 'vmess',
      server: json.add,
      port: Number(json.port),
      uuid: json.id,
      alterId: Number(json.aid || 0),
      cipher: json.scy || 'auto',
      udp: true,
      tls: (json.tls === 'tls' || json.tls === true) || undefined,
    };
    if (json.net === 'ws') {
      proxy.network = 'ws';
      proxy['ws-opts'] = {
        path: json.path || '/',
        headers: json.host ? { Host: json.host } : undefined,
      };
    } else if (json.net === 'grpc') {
      proxy.network = 'grpc';
      proxy['grpc-opts'] = { 'grpc-service-name': json.path || '' };
    } else if (json.net === 'h2') {
      proxy.network = 'h2';
      proxy['h2-opts'] = { host: json.host ? [json.host] : undefined, path: json.path || '/' };
    }
    if (proxy.tls && json.sni) proxy.servername = json.sni;
    if (proxy.tls && json.host && !proxy.servername) proxy.servername = json.host;
    return cleanup(proxy);
  } catch (e) {
    return null;
  }
}

function parseTrojan(uri) {
  try {
    const noScheme = uri.slice('trojan://'.length);
    const { rest, name } = splitNameFromUri(noScheme);
    const atIdx = rest.lastIndexOf('@');
    const password = safeDecodeURIComponent(rest.slice(0, atIdx));
    const hostPortQ = rest.slice(atIdx + 1);
    const qIdx = hostPortQ.indexOf('?');
    const hostPort = qIdx === -1 ? hostPortQ : hostPortQ.slice(0, qIdx);
    const query = parseQuery(qIdx === -1 ? '' : hostPortQ.slice(qIdx + 1));
    const [host, portStr] = splitHostPort(hostPort);
    const proxy = {
      name: name || nextName('trojan'),
      type: 'trojan',
      server: host,
      port: Number(portStr),
      password,
      udp: true,
      sni: query.sni || query.peer || host,
      'skip-cert-verify': query.allowInsecure === '1' || query.insecure === '1' || undefined,
    };
    if (query.type === 'ws') {
      proxy.network = 'ws';
      proxy['ws-opts'] = { path: query.path || '/', headers: query.host ? { Host: query.host } : undefined };
    } else if (query.type === 'grpc') {
      proxy.network = 'grpc';
      proxy['grpc-opts'] = { 'grpc-service-name': query.serviceName || '' };
    }
    return cleanup(proxy);
  } catch (e) {
    return null;
  }
}

function parseVless(uri) {
  try {
    const noScheme = uri.slice('vless://'.length);
    const { rest, name } = splitNameFromUri(noScheme);
    const atIdx = rest.lastIndexOf('@');
    const uuid = safeDecodeURIComponent(rest.slice(0, atIdx));
    const hostPortQ = rest.slice(atIdx + 1);
    const qIdx = hostPortQ.indexOf('?');
    const hostPort = qIdx === -1 ? hostPortQ : hostPortQ.slice(0, qIdx);
    const query = parseQuery(qIdx === -1 ? '' : hostPortQ.slice(qIdx + 1));
    const [host, portStr] = splitHostPort(hostPort);
    const proxy = {
      name: name || nextName('vless'),
      type: 'vless',
      server: host,
      port: Number(portStr),
      uuid,
      udp: true,
      tls: query.security === 'tls' || query.security === 'reality' || undefined,
      servername: query.sni || undefined,
      flow: query.flow || undefined,
    };
    if (query.security === 'reality') {
      proxy['reality-opts'] = { 'public-key': query.pbk || '', 'short-id': query.sid || '' };
      proxy['client-fingerprint'] = query.fp || 'chrome';
    }
    if (query.type === 'ws') {
      proxy.network = 'ws';
      proxy['ws-opts'] = { path: query.path || '/', headers: query.host ? { Host: query.host } : undefined };
    } else if (query.type === 'grpc') {
      proxy.network = 'grpc';
      proxy['grpc-opts'] = { 'grpc-service-name': query.serviceName || '' };
    }
    return cleanup(proxy);
  } catch (e) {
    return null;
  }
}

function parseShadowsocks(uri) {
  try {
    const noScheme = uri.slice('ss://'.length);
    const { rest, name } = splitNameFromUri(noScheme);
    let method, password, host, portStr;
    const atIdx = rest.lastIndexOf('@');
    if (atIdx !== -1) {
      // ss://base64(method:password)@host:port  OR  ss://method:password@host:port
      let userinfo = rest.slice(0, atIdx);
      if (!userinfo.includes(':')) userinfo = b64decode(userinfo);
      const sep = userinfo.indexOf(':');
      method = userinfo.slice(0, sep);
      password = userinfo.slice(sep + 1);
      const hostPortQ = rest.slice(atIdx + 1);
      const qIdx = hostPortQ.indexOf('?');
      const hostPort = qIdx === -1 ? hostPortQ : hostPortQ.slice(0, qIdx);
      [host, portStr] = splitHostPort(hostPort);
    } else {
      // fully base64 encoded: base64(method:password@host:port)
      const decoded = b64decode(rest.split('?')[0]);
      const atIdx2 = decoded.lastIndexOf('@');
      const userinfo = decoded.slice(0, atIdx2);
      const sep = userinfo.indexOf(':');
      method = userinfo.slice(0, sep);
      password = userinfo.slice(sep + 1);
      [host, portStr] = splitHostPort(decoded.slice(atIdx2 + 1));
    }
    const proxy = {
      name: name || nextName('ss'),
      type: 'ss',
      server: host,
      port: Number(portStr),
      cipher: method,
      password,
      udp: true,
    };
    return cleanup(proxy);
  } catch (e) {
    return null;
  }
}

function parseHysteria2(uri) {
  try {
    const scheme = uri.startsWith('hysteria2://') ? 'hysteria2://' : 'hy2://';
    const noScheme = uri.slice(scheme.length);
    const { rest, name } = splitNameFromUri(noScheme);
    const atIdx = rest.lastIndexOf('@');
    const password = safeDecodeURIComponent(rest.slice(0, atIdx));
    const hostPortQ = rest.slice(atIdx + 1);
    const qIdx = hostPortQ.indexOf('?');
    const hostPort = qIdx === -1 ? hostPortQ : hostPortQ.slice(0, qIdx);
    const query = parseQuery(qIdx === -1 ? '' : hostPortQ.slice(qIdx + 1));
    const [host, portStr] = splitHostPort(hostPort);
    const proxy = {
      name: name || nextName('hy2'),
      type: 'hysteria2',
      server: host,
      port: Number(portStr),
      password,
      sni: query.sni || host,
      'skip-cert-verify': query.insecure === '1' || undefined,
      obfs: query.obfs || undefined,
      'obfs-password': query['obfs-password'] || undefined,
    };
    return cleanup(proxy);
  } catch (e) {
    return null;
  }
}

function splitHostPort(hostPort) {
  if (hostPort.startsWith('[')) {
    // IPv6
    const end = hostPort.indexOf(']');
    const host = hostPort.slice(1, end);
    const port = hostPort.slice(end + 2);
    return [host, port];
  }
  const idx = hostPort.lastIndexOf(':');
  return [hostPort.slice(0, idx), hostPort.slice(idx + 1)];
}

function cleanup(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = v;
  }
  return out;
}

// Extracts a usable Clash `proxies` array out of an already-Clash-format subscription body.
// Airport-provided subs that are already Clash YAML (very common) used to be relayed
// completely untouched, which meant the airport's own proxy-groups (and no category
// splitting at all) showed up in the client. We now parse just the `proxies:` section out
// of that YAML so it can be fed into generateClashConfig() like any other subscription,
// which always rebuilds proxy-groups purely from the categories selected on this site.
function proxiesFromYamlDoc(doc) {
  if (!doc || !Array.isArray(doc.proxies)) return [];
  const out = [];
  for (const raw of doc.proxies) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const proxy = { ...raw };
    if (proxy.port !== undefined) proxy.port = Number(proxy.port);
    if (!proxy.name) proxy.name = nextName(proxy.type || 'node');
    if (!proxy.type || !proxy.server || !proxy.port) continue;
    out.push(cleanup(proxy));
  }
  return out;
}

const PARSERS = [
  { prefix: 'vmess://', fn: parseVmess },
  { prefix: 'trojan://', fn: parseTrojan },
  { prefix: 'vless://', fn: parseVless },
  { prefix: 'ss://', fn: parseShadowsocks },
  { prefix: 'hysteria2://', fn: parseHysteria2 },
  { prefix: 'hy2://', fn: parseHysteria2 },
];

function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  for (const { prefix, fn } of PARSERS) {
    if (trimmed.startsWith(prefix)) return fn(trimmed);
  }
  return null;
}

// Parse raw subscription body (already fetched as text) into an array of Clash proxy objects.
// Handles: whole-body base64 of newline-separated URIs, plain newline-separated URIs,
// and already-clash-yaml bodies (returns {alreadyYaml: true, raw} in that case).
function parseSubscriptionBody(body) {
  const text = body.trim();
  if (!text) return { proxies: [] };

  // Already a Clash YAML config: parse out just the proxy nodes so they can still be run
  // through generateClashConfig() and get this site's own category-based proxy-groups,
  // instead of relaying the airport's own groups/rules untouched.
  if (/^proxies:/m.test(text) || /^\s*-\s*\{?\s*name:/m.test(text)) {
    let doc = null;
    try {
      doc = parseYamlDoc(text);
    } catch (e) {
      doc = null;
    }
    const proxies = proxiesFromYamlDoc(doc);
    if (proxies.length > 0) {
      return { proxies };
    }
    // Couldn't extract any usable proxy from this Clash-format source (unusual formatting) —
    // fall back to relaying it untouched so the link still works, rather than breaking it.
    return { alreadyYaml: true, raw: text };
  }

  // Try treating content as newline list of URIs directly
  const directLines = text.split(/\r?\n/).filter((l) => l.trim());
  const anyDirectUri = directLines.some((l) => PARSERS.some((p) => l.trim().startsWith(p.prefix)));
  let lines = directLines;
  if (!anyDirectUri && looksLikeBase64(text)) {
    try {
      const decoded = b64decode(text);
      const decodedLines = decoded.split(/\r?\n/).filter((l) => l.trim());
      if (decodedLines.some((l) => PARSERS.some((p) => l.trim().startsWith(p.prefix)))) {
        lines = decodedLines;
      }
    } catch (e) {
      // fall through, keep direct lines
    }
  }

  const proxies = [];
  for (const line of lines) {
    const p = parseLine(line);
    if (p) proxies.push(p);
  }
  return { proxies };
}

module.exports = { parseSubscriptionBody, parseLine };
