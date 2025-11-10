const socket = io();
let playerData = null;
let currentQuestion = null;
let hasBuzzed = false;
let canBuzz = false;
let gameCode = null;

socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('player-joined', (player) => {
  playerData = player;
  playerData.controlPlayerId = null; // Will be updated by scores-updated or players-update events
  showGameScreen();
});

socket.on('daily-double-ready', (data) => {
  // Wager was submitted, now show the question
  if (currentQuestion) {
    canBuzz = true;
    showQuestion(currentQuestion);
    enableBuzzer();
  }
});

socket.on('wager-error', (error) => {
  alert('Wager error: ' + error);
  // Re-enable the input and button
  const wagerInput = document.getElementById('daily-double-wager-input');
  if (wagerInput) {
    wagerInput.disabled = false;
  }
  const submitBtn = document.getElementById('submit-daily-wager');
  if (submitBtn) {
    submitBtn.disabled = false;
  }
});

socket.on('join-error', (error) => {
  document.getElementById('join-error').textContent = error;
});

socket.on('question-selected', (question) => {
  currentQuestion = question;
  hasBuzzed = false;

  if (question.requiresWager && socket.id === question.controlPlayerId) {
    // This is the player with control - show wager prompt
    canBuzz = false; // Don't allow buzzing during wager phase
    showDailyDoubleWagerPrompt(question);
  } else if (question.requiresWager) {
    // This is not the control player - show waiting message
    canBuzz = false; // Don't allow buzzing during wager phase
    showDailyDoubleWaitingScreen(question);
  } else {
    // Normal question
    canBuzz = true; // Enable buzzing for regular questions
    showQuestion(question);
    enableBuzzer();
  }
});

socket.on('buzz-received', (data) => {
  if (data.playerId === socket.id) {
    document.getElementById('buzz-status').textContent = `You buzzed in! Position: ${data.position}`;
    if (data.position === 1) {
      document.getElementById('buzz-status').textContent = 'You have control of the board!';
      document.getElementById('buzzer').classList.add('buzzed');
    }
  }
});

socket.on('answer-processed', (data) => {
  if (data.playerId === socket.id) {
    updateScore(data.scores);
    if (data.correct) {
      showFeedback('Correct!', true);
      soundManager.play('correct');
    } else {
      showFeedback('Incorrect', false);
      soundManager.play('incorrect');
    }
  }
});

socket.on('scores-updated', (scores) => {
  updateScore(scores);
});

socket.on('question-complete', () => {
  hideQuestion();
  canBuzz = false;
  hasBuzzed = false;
  document.getElementById('buzz-status').textContent = '';
  document.getElementById('buzzer').classList.remove('buzzed');
});

socket.on('time-up', () => {
  canBuzz = false;
  document.getElementById('buzz-status').textContent = 'Time\'s up!';
});

socket.on('final-jeopardy-started', (state) => {
  showFinalJeopardy(state);
});

socket.on('wager-accepted', (wager) => {
  document.getElementById('wager-section').classList.add('hidden');
  document.getElementById('waiting-section').classList.remove('hidden');
});

socket.on('all-wagers-submitted', () => {
  document.getElementById('waiting-section').classList.add('hidden');
  document.getElementById('answer-section').classList.remove('hidden');
  startFinalTimer(30);
});

socket.on('answer-submitted', () => {
  document.getElementById('answer-section').classList.add('hidden');
  document.getElementById('waiting-section').classList.remove('hidden');
  document.getElementById('waiting-section').innerHTML = '<p>Answer submitted! Waiting for grading...</p>';
});

socket.on('game-over', (results) => {
  showGameOver(results);
});

socket.on('game-reset', () => {
  location.reload();
});

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();

  // Check for game code in URL
  const urlParams = new URLSearchParams(window.location.search);
  const urlGameCode = urlParams.get('game');
  if (urlGameCode) {
    document.getElementById('game-code').value = urlGameCode.toUpperCase();
  }

  document.addEventListener('click', () => {
    if (soundManager.context && soundManager.context.state === 'suspended') {
      soundManager.context.resume();
    }
  }, { once: true });
});

function setupEventListeners() {
  document.getElementById('join-btn').addEventListener('click', joinGame);
  document.getElementById('player-name').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinGame();
  });

  document.getElementById('buzzer').addEventListener('click', buzzIn);

  document.getElementById('submit-wager').addEventListener('click', submitWager);
  document.getElementById('submit-answer').addEventListener('click', submitFinalAnswer);

  // Allow wager submission with Enter/Space key for daily doubles
  document.addEventListener('keydown', (e) => {
    const wagerInput = document.getElementById('daily-double-wager-input');
    const isWagerInputVisible = wagerInput && wagerInput.offsetParent !== null; // Check if element is visible

    if (isWagerInputVisible) {
      if (e.key === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        submitDailyDoubleWager();
      }
    } else if (e.code === 'Space' && canBuzz && !hasBuzzed) {
      e.preventDefault();
      buzzIn();
    }
  });
}

function joinGame() {
  const codeInput = document.getElementById('game-code');
  const nameInput = document.getElementById('player-name');
  const code = codeInput.value.trim().toUpperCase();
  const name = nameInput.value.trim();

  if (!code) {
    document.getElementById('join-error').textContent = 'Please enter a game code';
    return;
  }

  if (!name) {
    document.getElementById('join-error').textContent = 'Please enter your name';
    return;
  }

  gameCode = code;
  socket.emit('player-join', { playerName: name, gameCode: code });
}

function showGameScreen() {
  document.getElementById('join-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
  document.getElementById('player-display-name').textContent = playerData.name;
}

function buzzIn() {
  if (!canBuzz || hasBuzzed || !gameCode) return;

  hasBuzzed = true;
  socket.emit('buzz', gameCode);
  document.getElementById('buzzer').classList.add('buzzed');
  soundManager.play('buzz');

  navigator.vibrate && navigator.vibrate(200);
}

function enableBuzzer() {
  document.getElementById('buzzer').disabled = false;
  document.getElementById('buzzer').classList.remove('buzzed');
}

function showDailyDoubleWagerPrompt(question) {
  const questionDisplay = document.getElementById('question-display');
  document.getElementById('current-category').textContent = question.category;
  document.getElementById('current-value').textContent = `$${question.value}`;

  const currentScore = parseInt(document.getElementById('player-score').textContent) || 0;
  const maxWager = Math.max(currentScore, 1000);

  // Show the wager input form
  document.getElementById('current-question').innerHTML = `
    <div style="color: #FFD700; font-size: 1.5em; margin-bottom: 30px; font-weight: bold;">DAILY DOUBLE!</div>
    <p style="font-size: 1.2em; margin-bottom: 20px;">Your current score: $${currentScore}</p>
    <p style="font-size: 1.1em; margin-bottom: 20px;">
      Max wager: $${maxWager}
    </p>
    <div style="margin-bottom: 20px;">
      <input type="number" id="daily-double-wager-input" min="0" max="${maxWager}" value="${currentScore}"
             style="font-size: 1.2em; padding: 10px; width: 200px;">
      <button id="submit-daily-wager" class="buzzer-btn" style="margin-left: 10px; padding: 10px 20px; font-size: 1.1em;">Submit Wager</button>
      <p style="font-size: 0.9em; color: #ccc; margin-top: 10px;">Press Enter or click Submit to confirm</p>
    </div>
  `;

  // Add click listener to the submit button
  setTimeout(() => {
    const submitBtn = document.getElementById('submit-daily-wager');
    if (submitBtn) {
      submitBtn.addEventListener('click', submitDailyDoubleWager);
    }
  }, 0);

  questionDisplay.classList.remove('hidden');
}

function showDailyDoubleWaitingScreen(question) {
  const questionDisplay = document.getElementById('question-display');
  document.getElementById('current-category').textContent = question.category;
  document.getElementById('current-value').textContent = `$${question.value}`;

  document.getElementById('current-question').innerHTML = `
    <div style="color: #FFD700; font-size: 1.5em; margin-bottom: 30px; font-weight: bold;">DAILY DOUBLE!</div>
    <p style="font-size: 1.2em; margin-bottom: 20px;">Waiting for the player with control to place their wager...</p>
  `;

  questionDisplay.classList.remove('hidden');
}

function showQuestion(question) {
  const questionDisplay = document.getElementById('question-display');
  document.getElementById('current-category').textContent = question.category;
  document.getElementById('current-value').textContent = `$${question.value}`;
  document.getElementById('current-question').textContent = question.question;
  questionDisplay.classList.remove('hidden');

  if (question.isDaily) {
    document.getElementById('current-question').innerHTML = `
      <div style="color: #FFD700; font-size: 1.2em; margin-bottom: 10px;">DAILY DOUBLE!</div>
      ${question.question}
    `;
  }
}

function hideQuestion() {
  document.getElementById('question-display').classList.add('hidden');
}

function updateScore(scores) {
  const playerScore = scores.find(s => s.playerId === socket.id);
  if (playerScore) {
    document.getElementById('player-score').textContent = playerScore.score;
  }
}

function showFeedback(message, isCorrect) {
  const feedback = document.createElement('div');
  feedback.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: ${isCorrect ? 'rgba(0, 255, 0, 0.9)' : 'rgba(255, 0, 0, 0.9)'};
    color: white;
    padding: 30px 50px;
    border-radius: 10px;
    font-size: 2em;
    font-weight: bold;
    z-index: 3000;
    animation: fadeInOut 2s;
  `;
  feedback.textContent = message;

  document.body.appendChild(feedback);

  setTimeout(() => {
    feedback.remove();
  }, 2000);
}

function showFinalJeopardy(state) {
  document.getElementById('buzzer-container').classList.add('hidden');
  document.getElementById('question-display').classList.add('hidden');
  document.getElementById('final-jeopardy-container').classList.remove('hidden');

  document.getElementById('final-category').textContent = state.category;
  document.getElementById('final-score').textContent = document.getElementById('player-score').textContent;

  const maxWager = parseInt(document.getElementById('player-score').textContent);
  document.getElementById('wager-input').max = maxWager;

  const isEligible = state.eligiblePlayers.some(p => p.playerId === socket.id);
  if (!isEligible) {
    document.getElementById('wager-section').innerHTML = '<p>Sorry, you need a positive score to participate in Final RBL-pardy.</p>';
  }
}

function submitDailyDoubleWager() {
  const wagerInput = document.getElementById('daily-double-wager-input');
  if (!wagerInput) return;

  const wager = parseInt(wagerInput.value);
  const currentScore = parseInt(document.getElementById('player-score').textContent) || 0;
  const maxWager = Math.max(currentScore, 1000);

  if (isNaN(wager)) {
    alert('Please enter a valid wager amount');
    wagerInput.focus();
    return;
  }

  if (wager < 0 || wager > maxWager) {
    alert(`Wager must be between $0 and $${maxWager}`);
    wagerInput.focus();
    return;
  }

  // Disable input and button during submission
  wagerInput.disabled = true;
  const submitBtn = document.getElementById('submit-daily-wager');
  if (submitBtn) submitBtn.disabled = true;

  socket.emit('daily-double-wager', { gameCode, wager });
}

function submitWager() {
  const wager = document.getElementById('wager-input').value;

  if (!wager || wager < 0) {
    alert('Please enter a valid wager');
    return;
  }

  socket.emit('final-jeopardy-wager', { gameCode, wager: parseInt(wager) });
}

function submitFinalAnswer() {
  const answer = document.getElementById('final-answer').value.trim();

  if (!answer) {
    alert('Please enter an answer');
    return;
  }

  socket.emit('final-jeopardy-answer', { gameCode, answer });
}

function startFinalTimer(seconds) {
  const timerElement = document.getElementById('final-timer');
  let timeLeft = seconds;

  const timerInterval = setInterval(() => {
    timerElement.textContent = timeLeft;

    if (timeLeft <= 5) {
      timerElement.style.color = '#ff0000';
    }

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      const answer = document.getElementById('final-answer').value || 'No answer';
      socket.emit('final-jeopardy-answer', { gameCode, answer });
    }

    timeLeft--;
  }, 1000);
}

function showGameOver(results) {
  document.getElementById('final-jeopardy-container').classList.add('hidden');
  document.getElementById('buzzer-container').classList.add('hidden');
  document.getElementById('game-over-screen').classList.remove('hidden');

  const playerScore = results.scores.find(s => s.playerId === socket.id);
  const playerRank = results.scores.findIndex(s => s.playerId === socket.id) + 1;

  let resultsHTML = `
    <h3>Your Final Score: $${playerScore?.score || 0}</h3>
    <p>Your Rank: ${playerRank} out of ${results.scores.length}</p>
  `;

  if (results.winner) {
    resultsHTML += `<h2 style="color: #FFD700; margin-top: 30px;">Winner: ${results.winner.name} - $${results.winner.score}</h2>`;
  }

  resultsHTML += '<h3 style="margin-top: 30px;">Top 5 Players:</h3><ol>';
  results.scores.slice(0, 5).forEach(score => {
    resultsHTML += `<li>${score.playerName}: $${score.score}</li>`;
  });
  resultsHTML += '</ol>';

  document.getElementById('final-results').innerHTML = resultsHTML;
}