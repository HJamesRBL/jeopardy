const socket = io();
let adminPassword = null;
let currentStats = null;
let deleteGameCode = null;

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  checkStoredAuth();
});

function setupEventListeners() {
  // Login
  document.getElementById('login-btn').addEventListener('click', login);
  document.getElementById('admin-password').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') login();
  });

  // Dashboard
  document.getElementById('refresh-btn').addEventListener('click', refreshStats);
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('create-game-btn').addEventListener('click', createNewGame);
  document.getElementById('upload-questions-btn').addEventListener('click', showUploadModal);

  // Modals
  document.getElementById('cancel-delete').addEventListener('click', closeModal);
  document.getElementById('confirm-delete').addEventListener('click', confirmDelete);
  document.getElementById('upload-cancel').addEventListener('click', closeUploadModal);
  document.getElementById('upload-submit').addEventListener('click', uploadQuestions);
  document.getElementById('use-default-btn').addEventListener('click', useDefaultQuestions);
  document.getElementById('close-created-modal').addEventListener('click', closeCreatedModal);
  document.getElementById('launch-game-btn').addEventListener('click', launchGame);
}

async function login() {
  const password = document.getElementById('admin-password').value;

  if (!password) {
    showError('Please enter a password');
    return;
  }

  try {
    const response = await fetch('/admin/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password })
    });

    const data = await response.json();

    if (data.success) {
      adminPassword = password;
      sessionStorage.setItem('adminPassword', password);
      showDashboard();
      connectAdmin();
    } else {
      showError('Invalid password');
    }
  } catch (error) {
    showError('Authentication failed');
  }
}

function checkStoredAuth() {
  const stored = sessionStorage.getItem('adminPassword');
  if (stored) {
    adminPassword = stored;
    showDashboard();
    connectAdmin();
  }
}

function connectAdmin() {
  socket.emit('admin-connect', adminPassword);

  socket.on('admin-authenticated', () => {
    console.log('Admin authenticated');
    refreshStats();
    // Auto-refresh every 10 seconds
    setInterval(refreshStats, 10000);
  });

  socket.on('admin-auth-failed', () => {
    showError('Authentication failed');
    logout();
  });

  socket.on('admin-stats', (stats) => {
    updateDashboard(stats);
  });

  socket.on('room-deleted', (gameCode) => {
    console.log(`Room ${gameCode} deleted`);
    refreshStats();
  });
}

function refreshStats() {
  socket.emit('admin-request-stats', adminPassword);
}

function updateDashboard(stats) {
  currentStats = stats;

  // Update summary stats
  document.getElementById('active-games-count').textContent = stats.activeGames;

  const totalPlayers = stats.games.reduce((sum, game) => sum + game.playerCount, 0);
  document.getElementById('total-players-count').textContent = totalPlayers;

  document.getElementById('room-capacity').textContent = `${stats.activeGames}/${stats.maxRooms}`;

  // Update last updated time
  document.getElementById('last-updated').textContent =
    `Last updated: ${new Date().toLocaleTimeString()}`;

  // Update games list
  const gamesContainer = document.getElementById('games-list');

  if (stats.games.length === 0) {
    gamesContainer.innerHTML = '<div class="no-games">No active games</div>';
    return;
  }

  gamesContainer.innerHTML = stats.games.map(game => `
    <div class="game-card">
      <div class="game-header">
        <h3>Game ${game.code}</h3>
        <span class="game-status ${getStatusClass(game.status)}">${game.status}</span>
      </div>
      <div class="game-info">
        <div class="info-row">
          <span class="info-label">Created:</span>
          <span>${game.created}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Last Activity:</span>
          <span>${game.lastActivity}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Duration:</span>
          <span>${game.hoursActive} hours</span>
        </div>
        <div class="info-row">
          <span class="info-label">Players:</span>
          <span>${game.playerCount}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Presenter:</span>
          <span class="${game.presenterConnected ? 'connected' : 'disconnected'}">
            ${game.presenterConnected ? '✓ Connected' : '✗ Disconnected'}
          </span>
        </div>
        <div class="info-row">
          <span class="info-label">Round:</span>
          <span>${game.currentRound}</span>
        </div>
      </div>
      ${game.scores.length > 0 ? `
        <div class="game-scores">
          <h4>Top Players:</h4>
          <div class="scores-list">
            ${game.scores.slice(0, 3).map(score => `
              <div class="score-item">
                ${score.playerName}: $${score.score}
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
      <div class="game-actions">
        <button class="btn-primary" onclick="launchPresenter('${game.code}')">
          Launch Presenter
        </button>
        <button class="btn-danger" onclick="showDeleteModal('${game.code}')">
          Delete
        </button>
      </div>
    </div>
  `).join('');
}

function getStatusClass(status) {
  const statusMap = {
    'Waiting for Players': 'status-waiting',
    'Not Started': 'status-waiting',
    'In Progress': 'status-active',
    'Question Active': 'status-active',
    'Final Jeopardy': 'status-final',
    'Game Complete': 'status-complete'
  };
  return statusMap[status] || 'status-default';
}

function showDeleteModal(gameCode) {
  deleteGameCode = gameCode;
  document.getElementById('delete-game-code').textContent = gameCode;
  document.getElementById('confirm-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('confirm-modal').classList.add('hidden');
  deleteGameCode = null;
}

function confirmDelete() {
  if (deleteGameCode) {
    socket.emit('admin-delete-room', {
      password: adminPassword,
      gameCode: deleteGameCode
    });
    closeModal();
  }
}

function showDashboard() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('dashboard-screen').classList.remove('hidden');
}

function showError(message) {
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = message;
  setTimeout(() => {
    errorEl.textContent = '';
  }, 3000);
}

function logout() {
  sessionStorage.removeItem('adminPassword');
  adminPassword = null;
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('dashboard-screen').classList.add('hidden');
  document.getElementById('admin-password').value = '';
}

function createNewGame() {
  socket.emit('admin-create-game', { password: adminPassword });
}

let newGameCode = null;
socket.on('game-created-admin', (data) => {
  newGameCode = data.gameCode;
  document.getElementById('new-game-code').textContent = data.gameCode;
  document.getElementById('game-created-modal').classList.remove('hidden');
  refreshStats();
});

function closeCreatedModal() {
  document.getElementById('game-created-modal').classList.add('hidden');
  newGameCode = null;
}

function launchGame() {
  if (newGameCode) {
    window.open(`/?game=${newGameCode}`, '_blank');
    closeCreatedModal();
  }
}

function launchPresenter(gameCode) {
  window.open(`/?game=${gameCode}`, '_blank');
}

function showUploadModal() {
  // Populate game select dropdown
  const select = document.getElementById('game-select');
  select.innerHTML = '<option value="">Select a game...</option>';

  if (currentStats && currentStats.games) {
    currentStats.games.forEach(game => {
      const option = document.createElement('option');
      option.value = game.code;
      option.textContent = `${game.code} - ${game.playerCount} players`;
      select.appendChild(option);
    });
  }

  document.getElementById('upload-modal').classList.remove('hidden');
}

function closeUploadModal() {
  document.getElementById('upload-modal').classList.add('hidden');
  document.getElementById('csv-file').value = '';
  document.getElementById('upload-status').textContent = '';
}

let uploadGameCode = null;

async function uploadQuestions() {
  const select = document.getElementById('game-select');
  const fileInput = document.getElementById('csv-file');

  uploadGameCode = select.value;
  if (!uploadGameCode) {
    document.getElementById('upload-status').textContent = 'Please select a game';
    return;
  }

  const formData = new FormData();
  formData.append('gameCode', uploadGameCode);

  if (fileInput.files[0]) {
    formData.append('questions', fileInput.files[0]);
  } else {
    document.getElementById('upload-status').textContent = 'Please select a file or use default questions';
    return;
  }

  try {
    const response = await fetch('/upload-questions', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (data.success) {
      document.getElementById('upload-status').textContent = data.message;
      setTimeout(() => {
        closeUploadModal();
        refreshStats();
      }, 1500);
    } else {
      document.getElementById('upload-status').textContent = `Error: ${data.error}`;
    }
  } catch (error) {
    document.getElementById('upload-status').textContent = `Error: ${error.message}`;
  }
}

async function useDefaultQuestions() {
  const select = document.getElementById('game-select');
  uploadGameCode = select.value;

  if (!uploadGameCode) {
    document.getElementById('upload-status').textContent = 'Please select a game first';
    return;
  }

  const formData = new FormData();
  formData.append('gameCode', uploadGameCode);
  formData.append('useDefault', 'true');

  try {
    const response = await fetch('/upload-questions', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (data.success) {
      document.getElementById('upload-status').textContent = data.message;
      setTimeout(() => {
        closeUploadModal();
        refreshStats();
      }, 1500);
    } else {
      document.getElementById('upload-status').textContent = `Error: ${data.error}`;
    }
  } catch (error) {
    document.getElementById('upload-status').textContent = `Error: ${error.message}`;
  }
}