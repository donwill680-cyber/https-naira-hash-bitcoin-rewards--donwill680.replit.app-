const sqlite3 = require('sqlite3').verbose();
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const dbDir = path.join(__dirname, 'data');
const dbPath = process.env.DB_PATH || path.join(dbDir, 'nairahash.db');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new sqlite3.Database(dbPath);

function generateId(prefix = 'id') {
  return `${prefix}_${crypto.randomUUID()}`;
}

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function getOne(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function getMany(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

async function initializeDatabase() {
  const migrationSql = fs.readFileSync(path.join(__dirname, 'migrations', '001_init.sql'), 'utf8');
  await new Promise((resolve, reject) => {
    db.exec(migrationSql, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

  const rate = await getCurrentExchangeRate();
  if (!rate) {
    await runQuery(
      'INSERT INTO exchange_rates (id, btc_to_ngn, source, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
      ['default', Number(process.env.DEFAULT_BTC_TO_NGN_RATE || 8500000), 'config']
    );
  }

  return db;
}

async function getCurrentExchangeRate() {
  return getOne('SELECT * FROM exchange_rates ORDER BY updated_at DESC LIMIT 1');
}

async function setExchangeRate(rate, source = 'config') {
  const id = generateId('rate');
  await runQuery(
    'INSERT INTO exchange_rates (id, btc_to_ngn, source, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
    [id, Number(rate), source]
  );
  return getCurrentExchangeRate();
}

async function createUser({ email, passwordHash, name, role = 'user' }) {
  const id = generateId('user');
  await runQuery(
    'INSERT INTO users (id, email, name, password_hash, role, btc_balance, ngn_balance, total_btc_earned, total_ngn_earned, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, CURRENT_TIMESTAMP)',
    [id, email.toLowerCase(), name, passwordHash, role]
  );
  return getUserById(id);
}

async function findUserByEmail(email) {
  return getOne('SELECT * FROM users WHERE email = ?', [String(email).toLowerCase()]);
}

async function getUserById(id) {
  return getOne('SELECT * FROM users WHERE id = ?', [id]);
}

async function getUserSummary(id) {
  const user = await getUserById(id);
  if (!user) return null;
  return {
    ...user,
    transactions: await listTransactions(id),
    withdrawals: await listWithdrawals(id)
  };
}

async function listTransactions(userId) {
  return getMany(
    'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  );
}

async function listWithdrawals(userId) {
  return getMany(
    'SELECT * FROM withdrawal_requests WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  );
}

async function syncRewardEvent({ userId, externalTxnId, source, btcAmount, ngnAmount, exchangeRate, status = 'verified' }) {
  const existing = await getOne(
    'SELECT * FROM reward_events WHERE external_txn_id = ?',
    [externalTxnId]
  );

  if (existing) {
    return { duplicate: true, event: existing };
  }

  const id = generateId('reward');
  const user = await getUserById(userId);
  if (!user) {
    throw new Error('User not found for reward sync.');
  }

  await new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN IMMEDIATE');
      db.run(
        'INSERT INTO reward_events (id, user_id, external_txn_id, source, btc_amount, ngn_amount, exchange_rate, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
        [id, userId, externalTxnId, source, Number(btcAmount), Number(ngnAmount), Number(exchangeRate), status],
        (err) => {
          if (err) return db.run('ROLLBACK', () => reject(err));

          db.run(
            'INSERT INTO transactions (id, user_id, type, currency, amount, fiat_amount, reference, status, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
            [generateId('txn'), userId, 'credit', 'BTC', Number(btcAmount), Number(ngnAmount), externalTxnId, 'completed', 'Verified Bitcoin reward',],
            (insertErr) => {
              if (insertErr) return db.run('ROLLBACK', () => reject(insertErr));

              db.run(
                'UPDATE users SET btc_balance = btc_balance + ?, ngn_balance = ngn_balance + ?, total_btc_earned = total_btc_earned + ?, total_ngn_earned = total_ngn_earned + ? WHERE id = ?',
                [Number(btcAmount), Number(ngnAmount), Number(btcAmount), Number(ngnAmount), userId],
                (updateErr) => {
                  if (updateErr) return db.run('ROLLBACK', () => reject(updateErr));
                  db.run('COMMIT', (commitErr) => {
                    if (commitErr) return reject(commitErr);
                    resolve();
                  });
                }
              );
            }
          );
        }
      );
    });
  });

  const updatedUser = await getUserById(userId);
  return { duplicate: false, event: await getOne('SELECT * FROM reward_events WHERE id = ?', [id]), user: updatedUser };
}

async function createWithdrawalRequest({ userId, ngnAmount, btcAmount, walletAddress, notes = '' }) {
  const user = await getUserById(userId);
  if (!user) throw new Error('User not found.');
  if (Number(ngnAmount) > Number(user.ngn_balance)) {
    throw new Error('Requested withdrawal exceeds available balance.');
  }

  const id = generateId('withdrawal');
  await runQuery(
    'INSERT INTO withdrawal_requests (id, user_id, ngn_amount, btc_amount, wallet_address, status, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
    [id, userId, Number(ngnAmount), Number(btcAmount), walletAddress, 'pending', notes]
  );

  await runQuery(
    'INSERT INTO transactions (id, user_id, type, currency, amount, fiat_amount, reference, status, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
    [generateId('txn'), userId, 'withdrawal', 'NGN', Number(ngnAmount), Number(ngnAmount), id, 'pending', 'Withdrawal request submitted',]
  );

  return getOne('SELECT * FROM withdrawal_requests WHERE id = ?', [id]);
}

async function listPendingWithdrawals() {
  return getMany('SELECT * FROM withdrawal_requests WHERE status IN (\'pending\', \'processing\') ORDER BY created_at DESC');
}

async function updateWithdrawalStatus(id, status, provider = null, providerReference = null, notes = '') {
  await runQuery(
    'UPDATE withdrawal_requests SET status = ?, provider = COALESCE(?, provider), provider_reference = COALESCE(?, provider_reference), notes = COALESCE(?, notes), processed_at = CURRENT_TIMESTAMP WHERE id = ?',
    [status, provider, providerReference, notes, id]
  );
  const updated = await getOne('SELECT * FROM withdrawal_requests WHERE id = ?', [id]);
  return updated;
}

async function listAllTransactions() {
  return getMany('SELECT * FROM transactions ORDER BY created_at DESC');
}

module.exports = {
  db,
  initializeDatabase,
  generateId,
  getCurrentExchangeRate,
  setExchangeRate,
  createUser,
  findUserByEmail,
  getUserById,
  getUserSummary,
  listTransactions,
  listWithdrawals,
  listPendingWithdrawals,
  listAllTransactions,
  syncRewardEvent,
  createWithdrawalRequest,
  updateWithdrawalStatus,
  runQuery,
  getOne,
  getMany,
};

if (require.main === module) {
  initializeDatabase()
    .then(() => {
      console.log('Database initialized at', dbPath);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Database initialization failed:', error);
      process.exit(1);
    });
}
