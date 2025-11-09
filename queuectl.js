#!/usr/bin/env node
const { fork } = require('child_process');
const path = require('path');
const crypto = require('crypto');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const { load_config, save_config } = require('./config.js');
const {
  init_db, add_job, get_jobs_by_state,
  get_status_summary, retry_dead_job
} = require('./db.js');

async function main() {
  await init_db();
  const config = load_config();

  yargs(hideBin(process.argv))
    .command('hello', 'Test command', {}, () => console.log('Hello from QueueCTL!'))
    
    .command('enqueue', 'Add job', (y) => {
      y.option('command', { alias: 'c', demandOption: true, type: 'string' })
       .option('id', { alias: 'i', type: 'string' })
       .option('max_retries', { alias: 'r', type: 'number', default: config.max_retries });
    }, (argv) => {
      const now = new Date().toISOString();
      const job = {
        id: argv.id || crypto.randomUUID(),
        command: argv.command,
        state: 'pending',
        attempts: 0,
        max_retries: argv.max_retries,
        created_at: now,
        updated_at: now,
        run_at: now,
      };
      add_job(job, (err) => {
        if (err) console.error('❌ Failed to enqueue job:', err.message);
        else console.log(`✅ Enqueued job ${job.id}`);
      });
    })
    
    .command('worker <action>', 'Start/stop workers', (y) => {
      y.positional('action', { choices: ['start', 'stop'] })
       .option('count', { alias: 'c', type: 'number', default: 1 });
    }, (argv) => {
      if (argv.action === 'start') {
        console.log(`🚀 Starting ${argv.count} worker(s)...`);
        const workerPath = path.join(__dirname, 'worker_process.js');
        for (let i = 0; i < argv.count; i++) fork(workerPath);
      } else {
        console.log('Stopping workers (manual Ctrl+C for now).');
      }
    })

    .command('list', 'List jobs', (y) => {
      y.option('state', {
        alias: 's', choices: ['pending', 'processing', 'completed', 'failed', 'dead'], default: 'pending'
      });
    }, (argv) => {
      get_jobs_by_state(argv.state, (err, jobs) => {
        if (err) return console.error('Error:', err.message);
        if (!jobs.length) return console.log(`No jobs in state: ${argv.state}`);
        console.table(jobs);
      });
    })

    .command('status', 'Job status summary', {}, () => {
      get_status_summary((err, summary) => {
        if (err) return console.error('Error:', err.message);
        console.table(summary);
      });
    })

    .command('dlq <action> [jobId]', 'Manage DLQ', (y) => {
      y.positional('action', { choices: ['list', 'retry'] });
    }, (argv) => {
      if (argv.action === 'list') {
        get_jobs_by_state('dead', (err, jobs) => {
          if (err) return console.error('Error:', err.message);
          if (!jobs.length) return console.log('DLQ is empty.');
          console.table(jobs);
        });
      } else if (argv.action === 'retry') {
        if (!argv.jobId) return console.error('Provide a jobId.');
        retry_dead_job(argv.jobId, (err, c) => {
          if (err) console.error('Error:', err.message);
          else if (!c) console.log('Job not found in DLQ.');
          else console.log(`♻️ Retried job ${argv.jobId}`);
        });
      }
    })

    .command('config <action> [key] [value]', 'Manage config', (y) => {
      y.positional('action', { choices: ['get', 'set'] });
    }, (argv) => {
      const cfg = load_config();
      if (argv.action === 'get') console.table(cfg);
      else if (argv.action === 'set') {
        if (!argv.key || !argv.value) return console.error('Need key and value.');
        const val = /^\d+$/.test(argv.value) ? parseInt(argv.value, 10) : argv.value;
        cfg[argv.key] = val;
        save_config(cfg);
        console.log(`✅ Updated config: ${argv.key}=${val}`);
      }
    })
    .demandCommand(1)
    .help()
    .parse();
}

main();
