const API_BASE = '';
const tokenKey = 'nairahash-token';

const elements = {
  authToggleButtons: [...document.querySelectorAll('[data-auth-toggle]')],
  authTabs: [...document.querySelectorAll('[data-auth-tab]')],
  loginForm: document.getElementById('loginForm'),
  registerForm: document.getElementById('registerForm'),
  authModule: document.getElementById('authModule'),
  accountPanel: document.getElementById('accountPanel'),
  adminPanel: document.getElementById('adminPanel'),
  dashboardBalancePreview: document.getElementById('dashboardBalancePreview'),
  dashboardBtcPreview: document.getElementById('dashboardBtcPreview'),
  accountName: document.getElementById('accountName'),
  userBtcBalance: document.getElementById('userBtcBalance'),
  userNgnBalance: document.getElementById('userNgnBalance'),
  transactionList: document.getElementById('transactionList'),
  withdrawalForm: document.getElementById('withdrawalForm'),
  logoutBtn: document.getElementById('logoutBtn'),
  calculatorButton: document.querySelector('.calc-btn'),
  btcResult: document.getElementById('btcResult'),
  nairaAmount: document.getElementById('nairaAmount'),
  adminRewardForm: document.getElementById('adminRewardForm'),
};

function setAuthTab(tabName) {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  const active = tabName === 'register';
  loginForm.classList.toggle('hidden', active);
  registerForm.classList.toggle('hidden', !active);

  document.querySelectorAll('[data-auth-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.authTab === tabName);
  });
}

function currency(value, type = 'NGN') {
  const number = Number(value || 0);
  if (type === 'BTC') {
    return `${number.toFixed(6)} BTC`;
  }
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 2,
  }).format(number);
}

function storeToken(token) {
  localStorage.setItem(tokenKey, token);
}

function getToken() {
  return localStorage.getItem(tokenKey);
}

function removeToken() {
  localStorage.removeItem(tokenKey);
}

async function apiRequest(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || payload.message || 'Request failed.');
  }

  return payload;
}

async function loadDashboard() {
  try {
    const data = await apiRequest('/api/user');
    const { user, transactions } = data;

    elements.accountName.textContent = user.name;
    elements.userBtcBalance.textContent = currency(user.btcBalance, 'BTC');
    elements.userNgnBalance.textContent = currency(user.ngnBalance, 'NGN');
    elements.dashboardBalancePreview.textContent = currency(user.ngnBalance, 'NGN');
    elements.dashboardBtcPreview.textContent = currency(user.btcBalance, 'BTC');

    renderTransactions(transactions || []);

    if (user.role === 'admin') {
      elements.adminPanel.classList.remove('hidden');
    }

    elements.authModule.classList.add('hidden');
    elements.accountPanel.classList.remove('hidden');
  } catch (error) {
    console.error('Dashboard load failed:', error.message);
    removeToken();
    elements.authModule.classList.remove('hidden');
    elements.accountPanel.classList.add('hidden');
  }
}

function renderTransactions(transactions) {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    elements.transactionList.innerHTML = '<li class="empty-state">No transactions yet.</li>';
    return;
  }

  elements.transactionList.innerHTML = transactions
    .map((transaction) => {
      const amount = transaction.currency === 'BTC'
        ? `${Number(transaction.amount).toFixed(6)} BTC`
        : currency(transaction.amount, 'NGN');
      return `
        <li>
          <div>
            <strong>${transaction.description}</strong>
            <small>${new Date(transaction.created_at).toLocaleString()}</small>
          </div>
          <span class="status-pill ${transaction.status}">${transaction.status}</span>
          <strong>${amount}</strong>
        </li>
      `;
    })
    .join('');
}

async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const result = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    storeToken(result.token);
    await loadDashboard();
  } catch (error) {
    alert(error.message);
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const name = document.getElementById('registerName').value;
  const email = document.getElementById('registerEmail').value;
  const password = document.getElementById('registerPassword').value;

  try {
    const result = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });

    storeToken(result.token);
    await loadDashboard();
  } catch (error) {
    alert(error.message);
  }
}

async function handleWithdrawal(event) {
  event.preventDefault();
  const amount = Number(document.getElementById('withdrawalAmount').value);
  const walletAddress = document.getElementById('withdrawalWallet').value.trim();
  const notes = document.getElementById('withdrawalNotes').value.trim();

  try {
    const result = await apiRequest('/api/withdrawals/request', {
      method: 'POST',
      body: JSON.stringify({ amountNgn: amount, walletAddress, notes }),
    });

    alert(result.message || 'Withdrawal request created.');
    await loadDashboard();
    elements.withdrawalForm.reset();
  } catch (error) {
    alert(error.message);
  }
}

async function handleAdminRewardSync(event) {
  event.preventDefault();

  const payload = {
    userId: document.getElementById('adminUserId').value.trim(),
    externalTxnId: document.getElementById('adminExternalTxnId').value.trim(),
    btcAmount: Number(document.getElementById('adminBtcAmount').value),
    ngnAmount: Number(document.getElementById('adminNgnAmount').value),
    source: document.getElementById('adminSource').value.trim(),
    exchangeRate: Number(process.env?.DEFAULT_BTC_TO_NGN_RATE || 8500000),
  };

  try {
    const result = await apiRequest('/api/rewards/sync', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    alert(result.duplicate ? 'Reward already recorded; duplicate ignored.' : 'Verified reward synced successfully.');
    await loadDashboard();
  } catch (error) {
    alert(error.message);
  }
}

function handleLogout() {
  removeToken();
  elements.authModule.classList.remove('hidden');
  elements.accountPanel.classList.add('hidden');
  elements.adminPanel.classList.add('hidden');
}

function updateRewardEstimate() {
  const amount = Number(elements.nairaAmount.value || 0);
  const rewardRate = 0.012;
  const btcToNgnRate = 8500000;
  const btcEstimate = (amount * rewardRate) / btcToNgnRate;
  elements.btcResult.textContent = `${btcEstimate.toFixed(6)} BTC`;
}

elements.authToggleButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const target = button.dataset.authToggle;
    setAuthTab(target === 'register' ? 'register' : 'login');
  });
});

elements.authTabs.forEach((button) => {
  button.addEventListener('click', () => {
    setAuthTab(button.dataset.authTab);
  });
});

elements.loginForm.addEventListener('submit', handleLogin);
elements.registerForm.addEventListener('submit', handleRegister);
elements.withdrawalForm.addEventListener('submit', handleWithdrawal);
elements.logoutBtn.addEventListener('click', handleLogout);
elements.calculatorButton.addEventListener('click', updateRewardEstimate);
elements.nairaAmount.addEventListener('input', updateRewardEstimate);
elements.adminRewardForm.addEventListener('submit', handleAdminRewardSync);

if (getToken()) {
  loadDashboard();
} else {
  elements.authModule.classList.remove('hidden');
  elements.accountPanel.classList.add('hidden');
}

updateRewardEstimate();
