const sqlite3 = require('sqlite3').verbose();
const DB_FILE = './queue.db';
let db;

function init_db() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_FILE, (err) => {
      if (err) return reject(err);

      db.serialize(() => {
        db.run(`
          CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            command TEXT NOT NULL,
            state TEXT NOT NULL DEFAULT 'pending',
            attempts INTEGER NOT NULL DEFAULT 0,
            max_retries INTEGER NOT NULL DEFAULT 3,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            run_at TEXT NOT NULL
          );
        `, (err) => {
          if (err) return reject(err);

          db.run('PRAGMA journal_mode = WAL;', (err2) => {
            if (err2) return reject(err2);
            resolve(db);
          });
        });
      });
    });
  });
}

function get_db() {
  return db;
}

function add_job(job, callback) {
  const now = new Date().toISOString();
  db.run('PRAGMA busy_timeout = 500;');
  const sql = `
    INSERT INTO jobs (id, command, state, attempts, max_retries, created_at, updated_at, run_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?);
  `;
  const params = [
    job.id, job.command, job.state, job.attempts,
    job.max_retries, job.created_at, job.updated_at, job.run_at,
  ];
  db.run(sql, params, (err) => callback(err));
}

function find_and_lock_job(callback) {
  const now = new Date().toISOString();
  db.run('PRAGMA busy_timeout = 500;');

  db.serialize(() => {
    db.run('BEGIN IMMEDIATE TRANSACTION;');
    db.get(`
      SELECT * FROM jobs WHERE state='pending' AND run_at <= ? 
      ORDER BY created_at LIMIT 1;
    `, [now], (err, job) => {
      if (err) return callback(err);
      if (!job) {
        db.run('COMMIT;');
        return callback(null, null);
      }

      db.run(`
        UPDATE jobs SET state='processing', updated_at=? 
        WHERE id=? AND state='pending';
      `, [now, job.id], function (err2) {
        if (err2 || this.changes === 0) {
          db.run('ROLLBACK;');
          callback(err2 || new Error('Lock failed'));
        } else {
          db.run('COMMIT;');
          job.state = 'processing';
          callback(null, job);
        }
      });
    });
  });
}

function update_job_status(id, state, attempts, callback) {
  const now = new Date().toISOString();
  db.run(`
    UPDATE jobs SET state=?, attempts=?, updated_at=? WHERE id=?;
  `, [state, attempts, now, id], callback);
}

function update_job_for_retry(id, attempts, run_at, callback) {
  const now = new Date().toISOString();
  db.run(`
    UPDATE jobs SET state='pending', attempts=?, updated_at=?, run_at=? WHERE id=?;
  `, [attempts, now, run_at, id], callback);
}

function get_jobs_by_state(state, callback) {
  db.all(`
    SELECT id, command, state, attempts, updated_at FROM jobs
    WHERE state=? ORDER BY updated_at DESC;
  `, [state], callback);
}

function get_status_summary(callback) {
  db.all(`SELECT state, COUNT(*) as count FROM jobs GROUP BY state;`, [], callback);
}

function retry_dead_job(id, callback) {
  const now = new Date().toISOString();
  db.run(`
    UPDATE jobs SET state='pending', attempts=0, updated_at=?, run_at=? 
    WHERE id=? AND state='dead';
  `, [now, now, id], function (err) {
    callback(err, this.changes);
  });
}

module.exports = {
  init_db,
  add_job,
  find_and_lock_job,
  update_job_status,
  update_job_for_retry,
  get_jobs_by_state,
  get_status_summary,
  retry_dead_job,
};
