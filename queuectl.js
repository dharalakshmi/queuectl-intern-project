#!/usr/bin/env node

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

yargs(hideBin(process.argv))
  .command(
    'hello',
    'A simple test command',
    (yargs) => {
    },
    (argv) => {
      console.log('Hello! The queuectl CLI is working!');
    }
  )
  .demandCommand(1, 'You must provide a command.')
  .help()
  .parse(); 