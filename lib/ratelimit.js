'use strict';

// Minimal in-memory sliding-window rate limiter, keyed by IP.
const buckets = new Map();

function allow(key, max, windowMs) {
  const now = Date.now();
  let arr = buckets.get(key);
  if (!arr) {
    arr = [];
    buckets.set(key, arr);
  }
  while (arr.length && now - arr[0] > windowMs) arr.shift();
  if (arr.length >= max) return false;
  arr.push(now);
  return true;
}

// Periodic cleanup so the map doesn't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [key, arr] of buckets) {
    while (arr.length && now - arr[0] > 3600000) arr.shift();
    if (arr.length === 0) buckets.delete(key);
  }
}, 600000).unref();

module.exports = { allow };
