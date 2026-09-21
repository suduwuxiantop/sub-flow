'use strict';

// Minimal, dependency-free YAML serializer sufficient for Clash config output.
// Supports: objects, arrays, strings, numbers, booleans, null.

function needsQuote(str) {
  if (str === '') return true;
  if (/^[-?:,\[\]{}#&*!|>'"%@`]/.test(str)) return true;
  if (/[:#]\s/.test(str) || /\s#/.test(str)) return true;
  if (/^(true|false|null|yes|no|on|off|~)$/i.test(str)) return true;
  if (/^-?\d+(\.\d+)?$/.test(str)) return true;
  if (/[\n\t]/.test(str)) return true;
  if (str.trim() !== str) return true;
  return false;
}

function scalar(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  const s = String(v);
  if (needsQuote(s)) return JSON.stringify(s);
  return s;
}

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function dump(value, indent = 0) {
  const pad = '  '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]\n`;
    let out = '';
    for (const item of value) {
      if (isPlainObject(item)) {
        const entries = Object.entries(item).filter(([, v]) => v !== undefined);
        if (entries.length === 0) {
          out += `${pad}- {}\n`;
          continue;
        }
        entries.forEach(([k, v], idx) => {
          const prefix = idx === 0 ? `${pad}- ` : `${pad}  `;
          if (isPlainObject(v) || Array.isArray(v)) {
            out += `${prefix}${k}:\n${dump(v, indent + 2)}`;
          } else {
            out += `${prefix}${k}: ${scalar(v)}\n`;
          }
        });
      } else if (Array.isArray(item)) {
        out += `${pad}-\n${dump(item, indent + 1)}`;
      } else {
        out += `${pad}- ${scalar(item)}\n`;
      }
    }
    return out;
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return `${pad}{}\n`;
    let out = '';
    for (const [k, v] of entries) {
      if (isPlainObject(v) || Array.isArray(v)) {
        const isEmptyArr = Array.isArray(v) && v.length === 0;
        const isEmptyObj = isPlainObject(v) && Object.keys(v).length === 0;
        if (isEmptyArr) { out += `${pad}${k}: []\n`; continue; }
        if (isEmptyObj) { out += `${pad}${k}: {}\n`; continue; }
        out += `${pad}${k}:\n${dump(v, indent + 1)}`;
      } else {
        out += `${pad}${k}: ${scalar(v)}\n`;
      }
    }
    return out;
  }
  return `${pad}${scalar(value)}\n`;
}

// ---- Minimal, dependency-free YAML parser (subset sufficient for Clash configs) ----
// Supports block mappings/sequences, flow mappings {}/sequences [], quoted and plain
// scalars, and "- key: value" inline sequence-of-mapping items. Not a general YAML parser
// (no anchors/tags/multi-line flow/block scalars) but enough to read back a Clash config
// that this same file (or a typical subconverter/airport panel) would produce.

function stripComment(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === '#' && !inSingle && !inDouble) {
      if (i === 0 || /\s/.test(line[i - 1])) return line.slice(0, i);
    }
  }
  return line;
}

function indentOf(line) {
  return /^(\s*)/.exec(line)[1].length;
}

function convertPlainScalar(s) {
  if (s === '') return null;
  if (/^(true|True|TRUE)$/.test(s)) return true;
  if (/^(false|False|FALSE)$/.test(s)) return false;
  if (/^(null|Null|NULL|~)$/.test(s)) return null;
  if (/^-?\d+$/.test(s)) return Number(s);
  if (/^-?\d+\.\d+([eE][-+]?\d+)?$/.test(s)) return Number(s);
  return s;
}

function unquoteScalar(raw) {
  const s = raw.trim();
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') {
    try {
      return JSON.parse(s);
    } catch (e) {
      return s.slice(1, -1);
    }
  }
  if (s.length >= 2 && s[0] === "'" && s[s.length - 1] === "'") {
    return s.slice(1, -1).replace(/''/g, "'");
  }
  return convertPlainScalar(s);
}

function findSplitColon(s) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (c === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (c === ':' && !inSingle && !inDouble) {
      if (i === s.length - 1 || s[i + 1] === ' ' || s[i + 1] === '\t') return i;
    }
  }
  return -1;
}

function parseFlow(str) {
  let i = 0;
  function skipWs() {
    while (i < str.length && /\s/.test(str[i])) i++;
  }
  function parseValue() {
    skipWs();
    const c = str[i];
    if (c === '{') return parseMap();
    if (c === '[') return parseArr();
    if (c === '"' || c === "'") return parseQuoted();
    return parseBare();
  }
  function parseQuoted() {
    const quote = str[i];
    let j = i + 1;
    let out = '';
    while (j < str.length) {
      if (str[j] === quote) {
        if (quote === "'" && str[j + 1] === "'") {
          out += "'";
          j += 2;
          continue;
        }
        j++;
        break;
      }
      if (quote === '"' && str[j] === '\\') {
        out += str[j + 1];
        j += 2;
        continue;
      }
      out += str[j];
      j++;
    }
    i = j;
    return out;
  }
  function parseBare() {
    let j = i;
    let depth = 0;
    while (j < str.length) {
      const c = str[j];
      if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') {
        if (depth === 0) break;
        depth--;
      } else if (c === ',' && depth === 0) break;
      j++;
    }
    const raw = str.slice(i, j);
    i = j;
    return convertPlainScalar(raw.trim());
  }
  function parseMap() {
    i++; // consume '{'
    const obj = {};
    skipWs();
    if (str[i] === '}') {
      i++;
      return obj;
    }
    while (i < str.length) {
      skipWs();
      let key;
      if (str[i] === '"' || str[i] === "'") key = parseQuoted();
      else {
        let j = i;
        while (j < str.length && str[j] !== ':') j++;
        key = str.slice(i, j).trim();
        i = j;
      }
      skipWs();
      if (str[i] === ':') i++;
      const val = parseValue();
      obj[key] = val;
      skipWs();
      if (str[i] === ',') {
        i++;
        continue;
      }
      if (str[i] === '}') {
        i++;
        break;
      }
      break;
    }
    return obj;
  }
  function parseArr() {
    i++; // consume '['
    const arr = [];
    skipWs();
    if (str[i] === ']') {
      i++;
      return arr;
    }
    while (i < str.length) {
      arr.push(parseValue());
      skipWs();
      if (str[i] === ',') {
        i++;
        skipWs();
        continue;
      }
      if (str[i] === ']') {
        i++;
        break;
      }
      break;
    }
    return arr;
  }
  return parseValue();
}

function parseNode(lines, idx, indent) {
  while (idx < lines.length && lines[idx].trim() === '') idx++;
  if (idx >= lines.length) return [null, idx];
  const lineIndent = indentOf(lines[idx]);
  if (lineIndent < indent) return [null, idx];
  const content = lines[idx].slice(indent);
  if (content.startsWith('- ') || content === '-') return parseSequence(lines, idx, indent);
  return parseMapping(lines, idx, indent);
}

function parseSequence(lines, idx, indent) {
  const arr = [];
  while (idx < lines.length) {
    if (lines[idx].trim() === '') {
      idx++;
      continue;
    }
    const lineIndent = indentOf(lines[idx]);
    if (lineIndent !== indent) break;
    const content = lines[idx].slice(indent);
    if (!(content.startsWith('- ') || content === '-')) break;
    const rest = content === '-' ? '' : content.slice(2);
    const mapIndent = indent + 2;
    const restTrim = rest.trim();
    if (restTrim === '') {
      idx++;
      const [val, nextIdx] = parseNode(lines, idx, mapIndent);
      arr.push(val);
      idx = nextIdx;
      continue;
    }
    if (restTrim.startsWith('{') || restTrim.startsWith('[')) {
      arr.push(parseFlow(restTrim));
      idx++;
      continue;
    }
    const colonIdx = findSplitColon(rest);
    if (colonIdx === -1) {
      arr.push(unquoteScalar(rest));
      idx++;
      continue;
    }
    // "- key: value" — inline mapping start; subsequent keys of this item are
    // indented to align with where "key" started (indent + 2).
    const key = unquoteScalar(rest.slice(0, colonIdx).trim());
    const valuePart = rest.slice(colonIdx + 1).trim();
    const obj = {};
    idx++;
    if (valuePart === '') {
      const nextIndent = idx < lines.length ? indentOf(lines[idx]) : mapIndent + 2;
      if (idx < lines.length && lines[idx].trim() !== '' && nextIndent > mapIndent) {
        const [val, nextIdx] = parseNode(lines, idx, nextIndent);
        obj[key] = val;
        idx = nextIdx;
      } else {
        obj[key] = null;
      }
    } else if (valuePart.startsWith('{') || valuePart.startsWith('[')) {
      obj[key] = parseFlow(valuePart);
    } else {
      obj[key] = unquoteScalar(valuePart);
    }
    const [restObj, nextIdx2] = parseMapping(lines, idx, mapIndent, obj);
    arr.push(restObj);
    idx = nextIdx2;
  }
  return [arr, idx];
}

function parseMapping(lines, idx, indent, initial) {
  const obj = initial || {};
  while (idx < lines.length) {
    if (lines[idx].trim() === '') {
      idx++;
      continue;
    }
    const lineIndent = indentOf(lines[idx]);
    if (lineIndent !== indent) break;
    const content = lines[idx].slice(indent);
    if (content.startsWith('- ') || content === '-') break;
    const colonIdx = findSplitColon(content);
    if (colonIdx === -1) {
      idx++;
      continue;
    }
    const key = unquoteScalar(content.slice(0, colonIdx).trim());
    const valuePart = content.slice(colonIdx + 1).trim();
    idx++;
    if (valuePart === '') {
      const nextIndent = idx < lines.length ? indentOf(lines[idx]) : indent + 2;
      if (idx < lines.length && lines[idx].trim() !== '' && nextIndent > indent) {
        const [val, nextIdx] = parseNode(lines, idx, nextIndent);
        obj[key] = val;
        idx = nextIdx;
      } else {
        obj[key] = null;
      }
    } else if (valuePart.startsWith('{') || valuePart.startsWith('[')) {
      obj[key] = parseFlow(valuePart);
    } else {
      obj[key] = unquoteScalar(valuePart);
    }
  }
  return [obj, idx];
}

// Parses a YAML document (the subset described above) into plain JS objects/arrays.
function parse(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => stripComment(l))
    .filter((l) => l.trim() !== '---' && l.trim() !== '...');
  const [value] = parseNode(lines, 0, 0);
  return value;
}

module.exports = { dump, parse };
