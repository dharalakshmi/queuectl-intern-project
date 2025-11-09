const { exec } = require('child_process');
const { find_and_lock_job, update_job_status, update_job_for_retry } = require('./db.js');
const { load_config } = require('./config.js');
const config = load_config();

function run_worker_loop() {
  try {
    find_and_lock_job((err, job) => {
      if (err) {
        console.error('DB error:', err.message);
        return setTimeout(run_worker_loop, 5000);
      }
      if (!job) return setTimeout(run_worker_loop, 2000);

      console.log(`[Worker] Processing job: ${job.id} (Attempt ${job.attempts + 1}/${job.max_retries})`);
      exec(job.command, (error, stdout) => {
        const attempt = job.attempts + 1;

        if (error) {
          console.error(`[Worker] ❌ Job ${job.id} failed: ${error.message}`);
          if (attempt < job.max_retries) {
            const delay = Math.pow(config.backoff_base, attempt);
            const run_at = new Date(Date.now() + delay * 1000).toISOString();
            console.log(`[Worker] Retrying in ${delay}s...`);
            return update_job_for_retry(job.id, attempt, run_at, () => run_worker_loop());
          } else {
            console.log(`[Worker] 💀 Job ${job.id} moved to DLQ`);
            return update_job_status(job.id, 'dead', attempt, () => run_worker_loop());
          }
        }

        console.log(`[Worker] ✅ Job ${job.id} completed successfully.`);
        if (stdout.trim()) console.log(`[Output] ${stdout.trim()}`);
        update_job_status(job.id, 'completed', attempt, () => run_worker_loop());
      });
    });
  } catch (err) {
    console.error('Unexpected worker error:', err);
    setTimeout(run_worker_loop, 5000);
  }
}

module.exports = { run_worker_loop };
