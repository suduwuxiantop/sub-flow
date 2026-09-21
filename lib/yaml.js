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

module.exports = { dump };
