const { init_db } = require('./db.js');
const { run_worker_loop } = require('./worker.js');

async function start_worker() {
  console.log(`[Worker ${process.pid}] started.`);
  try {
    await init_db();
    run_worker_loop();
  } catch (err) {
    console.error(`[Worker ${process.pid}] failed:`, err);
    process.exit(1);
  }
}

start_worker();
