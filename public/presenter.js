const socket = io();
let gameState = null;
let currentQuestion = null;
let selectedPlayer = null;

socket.on('connect', () => {
  console.log('Connected to server');
  socket.emit('presenter-connect');
});

socket.on('game-state', (state) => {
  gameState = state;
  updateGameBoard();
  updateScores();
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
  timeUpMsg.textContent = 'Time expired!';
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

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  generateQRCode();

  document.addEventListener('click', () => {
    if (soundManager.context && soundManager.context.state === 'suspended') {
      soundManager.context.resume();
    }
  }, { once: true });

  // Add resize handler for category headers
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      // Readjust all category headers on resize
      const categoryHeaders = document.querySelectorAll('.category-header');
      categoryHeaders.forEach(header => {
        // Reset styles first
        header.style.fontSize = '';
        header.style.whiteSpace = '';
        header.style.wordBreak = '';
        header.style.hyphens = '';
        header.classList.remove('adjusted');
        // Readjust
        adjustCategoryFontSize(header);
      });
    }, 250); // Debounce resize events
  });
});

function setupEventListeners() {
  document.getElementById('upload-btn').addEventListener('click', showUploadModal);
  document.getElementById('qr-btn').addEventListener('click', showQRModal);
  document.getElementById('final-jeopardy-btn').addEventListener('click', startFinalJeopardy);
  document.getElementById('reset-btn').addEventListener('click', resetGame);
  document.getElementById('sound-toggle').addEventListener('click', () => {
    const enabled = soundManager.toggle();
    document.getElementById('sound-toggle').textContent = enabled ? '🔊 Sound' : '🔇 Sound';
  });

  document.getElementById('upload-submit').addEventListener('click', uploadQuestions);
  document.getElementById('show-answer').addEventListener('click', showAnswer);
  document.getElementById('correct-answer').addEventListener('click', () => processAnswer(true));
  document.getElementById('incorrect-answer').addEventListener('click', () => processAnswer(false));
  document.getElementById('close-question').addEventListener('click', closeQuestionModal);

  document.querySelectorAll('.close').forEach(closeBtn => {
    closeBtn.addEventListener('click', (e) => {
      e.target.closest('.modal').style.display = 'none';
    });
  });

  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
      e.target.style.display = 'none';
    }
  });
}

function adjustCategoryFontSize(element) {
  // Get the container width to check for overflow
  const containerWidth = element.offsetWidth;

  // Font size range (in rem)
  let maxSize = 1;     // 1rem max
  let minSize = 0.6;   // 0.6rem min
  let currentSize = maxSize;
  let step = 0.05;     // Adjustment step

  // Set initial max size
  element.style.fontSize = maxSize + 'rem';

  // Check if text overflows
  while (element.scrollWidth > containerWidth && currentSize > minSize) {
    currentSize -= step;
    element.style.fontSize = currentSize + 'rem';
  }

  // If we had to adjust, mark it and allow wrapping for very long text
  if (currentSize < maxSize) {
    element.classList.add('adjusted');

    // If even at min size it's still too wide, allow wrapping
    if (element.scrollWidth > containerWidth) {
      element.style.whiteSpace = 'normal';
      element.style.wordBreak = 'break-word';
      element.style.hyphens = 'auto';
    }
  }
}

function updateGameBoard() {
  const boardElement = document.getElementById('game-board');

  if (!gameState || !gameState.categories || gameState.categories.length === 0) {
    boardElement.innerHTML = `
      <div class="loading-message">
        <h2>Welcome to Jeopardy!</h2>
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
      const questionCell = document.createElement('div');
      questionCell.className = 'question-cell';

      const questionKey = `${category}-${value}`;
      if (gameState.usedQuestions.includes(questionKey)) {
        questionCell.classList.add('used');
        questionCell.textContent = '';
      } else {
        questionCell.textContent = `$${value}`;
        questionCell.addEventListener('click', () => selectQuestion(category, value));
      }

      boardElement.appendChild(questionCell);
    });
  });
}

function selectQuestion(category, value) {
  socket.emit('select-question', { category, value });
  soundManager.play('select');
}

function showQuestionModal(question) {
  const modal = document.getElementById('question-modal');
  document.getElementById('question-category').textContent = question.category;
  document.getElementById('question-value').textContent = `$${question.value}`;
  document.getElementById('question-text').textContent = question.question;
  document.getElementById('question-answer').textContent = question.answer;
  document.getElementById('question-answer').classList.add('hidden');
  document.getElementById('buzz-queue').innerHTML = '<p>Waiting for players to buzz in...</p>';

  if (question.isDaily) {
    document.getElementById('question-text').innerHTML = `
      <div style="color: #FFD700; font-size: 1.5em; margin-bottom: 20px;">DAILY DOUBLE!</div>
      ${question.question}
    `;
    soundManager.play('dailyDouble');
  } else {
    soundManager.play('reveal');
  }

  // Timer will start when someone buzzes in
  document.getElementById('timer-display').textContent = '';
  modal.style.display = 'block';
}

function closeQuestionModal() {
  document.getElementById('question-modal').style.display = 'none';
  currentQuestion = null;
  selectedPlayer = null;
}

function showAnswer() {
  document.getElementById('question-answer').classList.remove('hidden');
}

function processAnswer(correct) {
  if (selectedPlayer) {
    socket.emit('answer-response', { playerId: selectedPlayer, correct });
    soundManager.play(correct ? 'correct' : 'incorrect');
    stopTimer(); // Stop timer immediately when marking answer
  }
}

function addToBuzzQueue(data) {
  const queueElement = document.getElementById('buzz-queue');

  if (data.position === 1) {
    queueElement.innerHTML = '';
  }

  const buzzItem = document.createElement('div');
  buzzItem.className = 'buzz-item';
  buzzItem.textContent = `${data.position}. ${data.playerName}`;
  queueElement.appendChild(buzzItem);
}

let currentTimerInterval = null;

function startTimer(seconds) {
  // Clear any existing timer
  stopTimer();

  const timerDisplay = document.getElementById('timer-display');
  let timeLeft = seconds;

  timerDisplay.textContent = timeLeft;
  timerDisplay.classList.remove('warning');

  currentTimerInterval = setInterval(() => {
    timeLeft--;
    timerDisplay.textContent = timeLeft;

    if (timeLeft <= 5 && timeLeft > 0) {
      timerDisplay.classList.add('warning');
      if (timeLeft <= 3) soundManager.play('timer');
    }

    if (timeLeft <= 0) {
      stopTimer();
      // Timer expired - server will handle what happens next
    }
  }, 1000);
}

function stopTimer() {
  if (currentTimerInterval) {
    clearInterval(currentTimerInterval);
    currentTimerInterval = null;
  }
  const timerDisplay = document.getElementById('timer-display');
  timerDisplay.textContent = '';
  timerDisplay.classList.remove('warning');
}

function updatePlayersList(players) {
  const playersListElement = document.getElementById('players-list');
  const playerCountElement = document.getElementById('player-count');

  playerCountElement.textContent = players.length;

  playersListElement.innerHTML = players.map(player => `
    <div class="player-item ${player.hasControl ? 'has-control' : ''}">
      <span>
        ${player.hasControl ? '👑 ' : ''}${player.name}
        ${player.hasControl ? ' (Control)' : ''}
      </span>
      <span class="player-status"></span>
    </div>
  `).join('');
}

function updateScores(scores) {
  const scoresListElement = document.getElementById('scores-list');

  if (!scores) {
    scores = gameState?.scores || [];
  }

  const topScores = scores.slice(0, 10);

  scoresListElement.innerHTML = topScores.map((score, index) => `
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
}

async function uploadQuestions() {
  const fileInput = document.getElementById('csv-file');
  const statusElement = document.getElementById('upload-status');

  if (!fileInput.files[0]) {
    statusElement.textContent = 'Please select a file';
    return;
  }

  const formData = new FormData();
  formData.append('questions', fileInput.files[0]);

  try {
    const response = await fetch('/upload-questions', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (result.success) {
      statusElement.textContent = result.message;
      setTimeout(() => {
        document.getElementById('upload-modal').style.display = 'none';
        location.reload();
      }, 1500);
    } else {
      statusElement.textContent = `Error: ${result.error}`;
    }
  } catch (error) {
    statusElement.textContent = `Error uploading file: ${error.message}`;
  }
}

async function generateQRCode() {
  try {
    const response = await fetch('/qrcode');
    const data = await response.json();

    const qrCodeElement = document.getElementById('qr-code');
    const joinUrlElement = document.getElementById('join-url');

    qrCodeElement.innerHTML = `<img src="${data.qrCode}" alt="QR Code">`;
    joinUrlElement.textContent = data.url;
  } catch (error) {
    console.error('Error generating QR code:', error);
  }
}

function loadDefaultQuestions() {
  fetch('/upload-questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ useDefault: true })
  }).then(() => location.reload());
}

function startFinalJeopardy() {
  socket.emit('start-final-jeopardy');
  soundManager.play('finalJeopardy');
}

function resetGame() {
  if (confirm('Are you sure you want to reset the game? This will clear all scores.')) {
    socket.emit('reset-game');
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