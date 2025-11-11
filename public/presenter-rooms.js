const socket = io();
let gameState = null;
let currentQuestion = null;
let selectedPlayer = null;
let gameCode = null;
let timerInterval = null;

socket.on('connect', () => {
  console.log('Connected to server');

  // Check for game code in URL
  const urlParams = new URLSearchParams(window.location.search);
  const urlGameCode = urlParams.get('game');

  if (urlGameCode) {
    gameCode = urlGameCode;
    sessionStorage.setItem('presenterGameCode', gameCode);
    socket.emit('presenter-connect', gameCode);
    showGameCode();
  } else {
    // Check if we have a stored game code (presenter reconnecting)
    const storedGameCode = sessionStorage.getItem('presenterGameCode');
    if (storedGameCode) {
      gameCode = storedGameCode;
      socket.emit('presenter-connect', gameCode);
      showGameCode();
    } else {
      // No game code - show message
      showNoGameMessage();
    }
  }
});

socket.on('game-created', (data) => {
  gameCode = data.gameCode;
  gameState = data.gameState;
  sessionStorage.setItem('presenterGameCode', gameCode);
  showGameCode();
  updateGameBoard();
});

socket.on('game-state', (state) => {
  gameState = state;
  updateGameBoard();
  if (state.scores) {
    updateScores(state.scores);
  }
});

socket.on('players-update', (players) => {
  updatePlayersList(players);
});

socket.on('player-connected', (player) => {
  showNotification(`${player.name} joined the game`);
  soundManager.play('join');
});

socket.on('player-disconnected', (player) => {
  showNotification(`${player.name} left the game`);
});

socket.on('question-selected', (question) => {
  currentQuestion = question;
  showQuestionModal(question);
});

socket.on('buzz-received', (data) => {
  addToBuzzQueue(data);
  if (data.position === 1) {
    selectedPlayer = data.playerId;
    soundManager.play('buzz');
    // Start timer only when first person buzzes
    startTimer(10);
  }
});

socket.on('answer-processed', (data) => {
  updateScores(data.scores);
  stopTimer(); // Stop timer when answer is marked
});

socket.on('scores-updated', (scores) => {
  console.log('Scores updated:', scores);
  updateScores(scores);
});

socket.on('question-complete', () => {
  closeQuestionModal();
  stopTimer();
  // Game board will be updated when we receive the game-state event
});

socket.on('answer-time-up', () => {
  stopTimer();
  const queueElement = document.getElementById('buzz-queue');
  const timeUpMsg = document.createElement('div');
  timeUpMsg.textContent = 'Time\'s up!';
  timeUpMsg.style.color = '#ff5555';
  queueElement.appendChild(timeUpMsg);
});

socket.on('next-player-to-answer', (player) => {
  selectedPlayer = player.playerId;
  const queueElement = document.getElementById('buzz-queue');
  const nextMsg = document.createElement('div');
  nextMsg.className = 'buzz-item';
  nextMsg.textContent = `${player.playerName} now has control`;
  queueElement.appendChild(nextMsg);
  startTimer(10); // Start new timer for next player
});

socket.on('reopen-buzzing', () => {
  selectedPlayer = null;
  document.getElementById('buzz-queue').innerHTML = '<p>Buzzing reopened - waiting for players...</p>';
  stopTimer();
});

socket.on('game-reset', () => {
  location.reload();
});

socket.on('error', (message) => {
  showNotification(`Error: ${message}`);
});

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  generateQRCode();

  document.addEventListener('click', () => {
    if (soundManager.context && soundManager.context.state === 'suspended') {
      soundManager.context.resume();
    }
  }, { once: true });

  // Simplified resize handler - just ensure proper text display
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      // Re-apply text settings to all category headers on resize
      const categoryHeaders = document.querySelectorAll('.category-header');
      categoryHeaders.forEach(header => {
        adjustCategoryFontSize(header);
      });
    }, 250); // Debounce resize events
  });
});

function showNoGameMessage() {
  const boardElement = document.getElementById('game-board');
  boardElement.innerHTML = `
    <div class="loading-message">
      <h2>No Game Selected</h2>
      <p>Please create a game from the Admin Dashboard</p>
      <p style="margin-top: 20px;">Go to <a href="/admin" style="color: #19A9FF;">Admin Dashboard</a> to create and manage games</p>
    </div>
  `;
}

function showGameCode() {
  // Remove the game code display - no longer needed
  const existingDisplay = document.getElementById('game-code-display');
  if (existingDisplay) {
    existingDisplay.remove();
  }
}

function setupEventListeners() {
  document.getElementById('qr-btn').addEventListener('click', showQRModal);
  document.getElementById('reset-btn').addEventListener('click', resetGame);
  document.getElementById('game-mode-btn').addEventListener('click', toggleGameMode);
  document.getElementById('sound-toggle').addEventListener('click', () => {
    const enabled = soundManager.toggle();
    document.getElementById('sound-toggle').textContent = enabled ? 'Sound On' : 'Sound Off';
  });

  document.getElementById('show-answer').addEventListener('click', showAnswer);
  document.getElementById('correct-answer').addEventListener('click', () => processAnswer(true));
  document.getElementById('incorrect-answer').addEventListener('click', () => processAnswer(false));
  document.getElementById('close-question').addEventListener('click', closeQuestionModal);

  document.querySelectorAll('.close').forEach(closeBtn => {
    closeBtn.addEventListener('click', (e) => {
      e.target.closest('.modal').style.display = 'none';
    });
  });

  // Set up Daily Double selection
  setupDailyDoubles();
}

function setupModals() {
  window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
      event.target.style.display = 'none';
    }
  };
}

function adjustCategoryFontSize(element) {
  // Simply set reasonable font size and allow natural word wrapping
  // Don't try to force everything on one line

  // Set a readable font size
  element.style.fontSize = '0.9rem';

  // Allow text to wrap naturally at word boundaries
  element.style.whiteSpace = 'normal';
  element.style.wordBreak = 'normal'; // Only break at word boundaries
  element.style.wordWrap = 'break-word'; // Wrap long words if needed
  element.style.hyphens = 'manual'; // Only hyphenate where explicitly marked

  // Ensure text is centered even when wrapped
  element.style.textAlign = 'center';
  element.style.lineHeight = '1.2';

  element.classList.add('adjusted');
}

function updateGameBoard() {
  const boardElement = document.getElementById('game-board');

  if (!gameState || !gameState.categories || gameState.categories.length === 0) {
    boardElement.innerHTML = `
      <div class="loading-message">
        <h2>Welcome to RBL-pardy!</h2>
        <p>Please upload questions to start the game</p>
        <button class="control-btn" onclick="loadDefaultQuestions()">Load Sample Questions</button>
      </div>
    `;
    return;
  }

  boardElement.innerHTML = '';

  gameState.categories.forEach(category => {
    const categoryHeader = document.createElement('div');
    categoryHeader.className = 'category-header';
    categoryHeader.textContent = category;
    boardElement.appendChild(categoryHeader);

    // Adjust font size after adding to DOM
    setTimeout(() => adjustCategoryFontSize(categoryHeader), 10);
  });

  const values = [200, 400, 600, 800, 1000];
  values.forEach(value => {
    gameState.categories.forEach(category => {
      const cell = document.createElement('div');
      cell.className = 'question-cell';

      const questionKey = `${category}-${value}`;
      if (gameState.usedQuestions && gameState.usedQuestions.includes(questionKey)) {
        cell.classList.add('used');
      } else {
        cell.textContent = `$${value}`;
        cell.addEventListener('click', () => selectQuestion(category, value));
      }

      boardElement.appendChild(cell);
    });
  });
}

function selectQuestion(category, value) {
  if (!gameCode) return;
  socket.emit('select-question', { gameCode, category, value });
}

function showQuestionModal(question) {
  const modal = document.getElementById('question-modal');
  document.getElementById('question-category').textContent = question.category;
  document.getElementById('question-value').textContent = `$${question.value}`;
  document.getElementById('question-text').textContent = question.question;
  document.getElementById('question-answer').textContent = question.answer;
  document.getElementById('question-answer').classList.add('hidden');
  document.getElementById('buzz-queue').innerHTML = '';
  document.getElementById('timer-display').textContent = '';

  if (question.isDaily) {
    document.getElementById('question-text').innerHTML = `
      <div style="color: #FFD700; font-size: 1.5em; margin-bottom: 20px; font-weight: bold;">
        DAILY DOUBLE!
      </div>
      ${question.question}
    `;
    soundManager.play('daily');
  }

  modal.style.display = 'block';
}

function closeQuestionModal() {
  document.getElementById('question-modal').style.display = 'none';
  currentQuestion = null;
  selectedPlayer = null;
  document.getElementById('buzz-queue').innerHTML = '';
  stopTimer();
}

function addToBuzzQueue(data) {
  const queueElement = document.getElementById('buzz-queue');
  const buzzItem = document.createElement('div');
  buzzItem.className = 'buzz-item';
  buzzItem.textContent = `${data.position}. ${data.playerName}`;
  queueElement.appendChild(buzzItem);
}

let timerValue = 0;
function startTimer(seconds) {
  stopTimer(); // Clear any existing timer
  timerValue = seconds;
  const timerDisplay = document.getElementById('timer-display');
  timerDisplay.textContent = timerValue;
  timerDisplay.classList.remove('warning');

  timerInterval = setInterval(() => {
    timerValue--;
    timerDisplay.textContent = timerValue;

    if (timerValue <= 5) {
      timerDisplay.classList.add('warning');
      soundManager.play('tick');
    }

    if (timerValue <= 0) {
      stopTimer();
      socket.emit('answer-time-up', gameCode);
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  const timerDisplay = document.getElementById('timer-display');
  if (timerDisplay) {
    timerDisplay.textContent = '';
    timerDisplay.classList.remove('warning');
  }
}

function showAnswer() {
  const answerElement = document.getElementById('question-answer');
  answerElement.classList.remove('hidden');
  soundManager.play('reveal');
}

function processAnswer(correct) {
  if (!selectedPlayer || !gameCode) return;

  socket.emit('answer-response', {
    gameCode,
    playerId: selectedPlayer,
    correct
  });

  if (correct) {
    soundManager.play('correct');
  } else {
    soundManager.play('incorrect');
  }
}

function updatePlayersList(players) {
  const playersContainer = document.getElementById('players-list');
  document.getElementById('player-count').textContent = players.length;

  const controlPlayer = players.find(p => p.hasControl);

  playersContainer.innerHTML = players
    .sort((a, b) => {
      // Control player first
      if (a.hasControl) return -1;
      if (b.hasControl) return 1;
      return 0;
    })
    .map(player => `
      <div class="player-item ${player.hasControl ? 'has-control' : ''}">
        <span>${player.hasControl ? '👑 ' : ''}${player.name}</span>
        <span class="player-status"></span>
      </div>
    `).join('');
}

function updateScores(scores = []) {
  const scoresContainer = document.getElementById('scores-list');

  if (scores.length === 0) {
    scoresContainer.innerHTML = '<div style="color: #888; padding: 10px;">No scores yet</div>';
    return;
  }

  const sortedScores = [...scores].sort((a, b) => b.score - a.score);

  scoresContainer.innerHTML = sortedScores.map((score, index) => `
    <div class="score-item">
      <span>${index + 1}. ${score.playerName}</span>
      <span>$${score.score}</span>
    </div>
  `).join('');
}

function showUploadModal() {
  document.getElementById('upload-modal').style.display = 'block';
}

function showQRModal() {
  document.getElementById('qr-modal').style.display = 'block';
  generateQRCode();
}

async function generateQRCode() {
  try {
    const response = await fetch(`/qrcode${gameCode ? '?gameCode=' + gameCode : ''}`);
    const data = await response.json();

    const qrContainer = document.getElementById('qr-code');
    qrContainer.innerHTML = `<img src="${data.qrCode}" alt="QR Code">`;

    document.getElementById('join-url').textContent = data.url;
  } catch (error) {
    console.error('Failed to generate QR code:', error);
  }
}

async function uploadQuestions() {
  const fileInput = document.getElementById('csv-file');
  const formData = new FormData();

  if (!gameCode) {
    document.getElementById('upload-status').textContent = 'Please create a game first';
    return;
  }

  formData.append('gameCode', gameCode);

  if (fileInput.files[0]) {
    formData.append('questions', fileInput.files[0]);
  } else {
    formData.append('useDefault', 'true');
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
        document.getElementById('upload-modal').style.display = 'none';
        location.reload();
      }, 1500);
    } else {
      document.getElementById('upload-status').textContent = `Error: ${data.error}`;
    }
  } catch (error) {
    document.getElementById('upload-status').textContent = `Error: ${error.message}`;
  }
}

function loadDefaultQuestions() {
  const fileInput = document.getElementById('csv-file');
  fileInput.value = '';
  document.getElementById('upload-modal').style.display = 'block';
  uploadQuestions();
}

function setupDailyDoubles() {
  // Daily doubles are handled server-side
}

function startFinalJeopardy() {
  if (!gameCode) return;
  socket.emit('start-final-jeopardy', gameCode);
}

function resetGame() {
  if (!gameCode) return;
  if (confirm('Are you sure you want to reset the game? This will clear all scores and questions.')) {
    socket.emit('reset-game', gameCode);
  }
}

function showNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'notificationSlide 0.3s ease-out reverse';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

function toggleGameMode() {
  const body = document.body;
  const isFullscreen = body.classList.contains('fullscreen-mode');

  if (!isFullscreen) {
    // Enter fullscreen mode
    body.classList.add('fullscreen-mode');

    // Try to enter browser fullscreen
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen();
    } else if (document.documentElement.webkitRequestFullscreen) {
      document.documentElement.webkitRequestFullscreen();
    } else if (document.documentElement.msRequestFullscreen) {
      document.documentElement.msRequestFullscreen();
    }

    // Show exit hint
    const hint = document.querySelector('.fullscreen-hint');
    if (hint) {
      hint.style.animation = 'none';
      setTimeout(() => {
        hint.style.animation = 'fadeInOut 5s ease-in-out';
      }, 10);
    }
  } else {
    // Exit fullscreen mode
    exitGameMode();
  }
}

function exitGameMode() {
  document.body.classList.remove('fullscreen-mode');

  // Exit browser fullscreen
  if (document.exitFullscreen) {
    document.exitFullscreen();
  } else if (document.webkitExitFullscreen) {
    document.webkitExitFullscreen();
  } else if (document.msExitFullscreen) {
    document.msExitFullscreen();
  }
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // F key toggles fullscreen
  if (e.key === 'f' || e.key === 'F') {
    // Don't toggle if user is typing in an input
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      toggleGameMode();
    }
  }

  // ESC key exits fullscreen
  if (e.key === 'Escape') {
    if (document.body.classList.contains('fullscreen-mode')) {
      exitGameMode();
    }
  }
});

// Handle browser fullscreen changes
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) {
    document.body.classList.remove('fullscreen-mode');
  }
});

document.addEventListener('webkitfullscreenchange', () => {
  if (!document.webkitFullscreenElement) {
    document.body.classList.remove('fullscreen-mode');
  }
});