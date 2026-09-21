'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, '..', 'data', 'tokens.json');

function loadAll() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveAll(obj) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2));
}

function createToken(record) {
  const all = loadAll();
  const token = crypto.randomBytes(12).toString('hex');
  all[token] = { ...record, createdAt: Date.now() };
  saveAll(all);
  return token;
}

function getToken(token) {
  const all = loadAll();
  return all[token] || null;
}

module.exports = { createToken, getToken };
