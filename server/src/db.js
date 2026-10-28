'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS licenses (
  key            TEXT PRIMARY KEY,
  status         TEXT NOT NULL DEFAULT 'active',
  email          TEXT,
  stripe_session TEXT,
  max_activations INTEGER NOT NULL,
  created_at     INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS activations (
  license_key  TEXT NOT NULL REFERENCES licenses(key),
  instance_id  TEXT NOT NULL,
  activated_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  PRIMARY KEY (license_key, instance_id)
);
`;

function openDb(dbFile) {
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new DatabaseSync(dbFile);
  db.exec(SCHEMA);
  return {
    db,
    createLicense({ key, email, stripeSession, maxActivations }) {
      db.prepare(
        `INSERT INTO licenses (key, status, email, stripe_session, max_activations, created_at)
         VALUES (?, 'active', ?, ?, ?, ?)`
      ).run(key, email || null, stripeSession || null, maxActivations, Date.now());
      return key;
    },
    getLicense(key) {
      return db.prepare('SELECT * FROM licenses WHERE key = ?').get(key) || null;
    },
    setStatus(key, status) {
      db.prepare('UPDATE licenses SET status = ? WHERE key = ?').run(status, key);
    },
    countActivations(key) {
      return db.prepare('SELECT COUNT(*) AS n FROM activations WHERE license_key = ?').get(key).n;
    },
    listActivations(key) {
      return db.prepare('SELECT * FROM activations WHERE license_key = ? ORDER BY activated_at').all(key);
    },
    activate(key, instanceId) {
      const now = Date.now();
      db.prepare(
        `INSERT INTO activations (license_key, instance_id, activated_at, last_seen_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(license_key, instance_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`
      ).run(key, instanceId, now, now);
    },
    touch(key, instanceId) {
      db.prepare('UPDATE activations SET last_seen_at = ? WHERE license_key = ? AND instance_id = ?').run(
        Date.now(), key, instanceId
      );
    },
    deactivate(key, instanceId) {
      db.prepare('DELETE FROM activations WHERE license_key = ? AND instance_id = ?').run(key, instanceId);
    },
    listLicenses() {
      return db.prepare(
        `SELECT l.*, (SELECT COUNT(*) FROM activations a WHERE a.license_key = l.key) AS activation_count
         FROM licenses l ORDER BY l.created_at DESC`
      ).all();
    },
  };
}

module.exports = { openDb };
