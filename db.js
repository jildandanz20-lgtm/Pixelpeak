const fs   = require('fs');
const path = require('path');

const DATA_DIR   = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const TX_FILE    = path.join(DATA_DIR, 'transactions.json');

function ensureData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE))   fs.writeFileSync(USERS_FILE, '[]');
  if (!fs.existsSync(TX_FILE))      fs.writeFileSync(TX_FILE, '[]');
}

function readUsers()        { ensureData(); return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
function readTransactions() { ensureData(); return JSON.parse(fs.readFileSync(TX_FILE,    'utf8')); }
function writeUsers(data)        { fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2)); }
function writeTransactions(data) { fs.writeFileSync(TX_FILE,    JSON.stringify(data, null, 2)); }

module.exports = { readUsers, readTransactions, writeUsers, writeTransactions };
