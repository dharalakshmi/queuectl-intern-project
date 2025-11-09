const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_DIR = path.join(os.homedir(), '.queuectl');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULTS = {
  max_retries: 3,
  backoff_base: 3,
};

function ensure_config_dir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function load_config() {
  ensure_config_dir();
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      const config = JSON.parse(data);
      return { ...DEFAULTS, ...config };
    } catch {
      console.warn('⚠️ Config file corrupt, using defaults.');
      return DEFAULTS;
    }
  }
  save_config(DEFAULTS);
  return DEFAULTS;
}

function save_config(config) {
  ensure_config_dir();
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('Error saving config:', err.message);
  }
}

module.exports = { load_config, save_config };
