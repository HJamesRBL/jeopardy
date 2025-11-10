class GameManager {
  constructor(io, gameCode = null) {
    this.io = io;
    this.gameCode = gameCode;
    this.presenterId = null;
    this.players = new Map();
    this.questions = [];
    this.categories = [];
    this.currentQuestion = null;
    this.buzzQueue = [];
    this.scores = new Map();
    this.gameState = 'waiting';
    this.usedQuestions = new Set();
    this.questionTimer = null;
    this.controlPlayerId = null; // Track who has control of the board
    this.dailyDoubleWager = {
      active: false,
      playerId: null,
      wager: null,
      questionKey: null
    };
    this.finalJeopardy = {
      active: false,
      question: null,
      wagers: new Map(),
      answers: new Map(),
      grades: new Map()
    };
    this.maxPlayers = 50;
  }

  setPresenter(socketId) {
    this.presenterId = socketId;
    console.log('Presenter connected:', socketId);
  }

  addPlayer(socketId, name) {
    if (this.players.size >= this.maxPlayers) {
      return null;
    }

    if (!name || name.trim().length === 0) {
      return null;
    }

    const player = {
      id: socketId,
      name: name.trim(),
      score: 0,
      joinedAt: Date.now()
    };

    this.players.set(socketId, player);
    this.scores.set(socketId, 0);

    return player;
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (player) {
      this.players.delete(socketId);
      this.scores.delete(socketId);
      this.buzzQueue = this.buzzQueue.filter(b => b.playerId !== socketId);
    }
    return player;
  }

  getPlayer(socketId) {
    return this.players.get(socketId);
  }

  getPlayers() {
    const playersList = Array.from(this.players.values()).map(player => ({
      ...player,
      hasControl: player.id === this.controlPlayerId
    }));

    // Sort to put control player first
    return playersList.sort((a, b) => {
      if (a.hasControl) return -1;
      if (b.hasControl) return 1;
      return 0;
    });
  }

  loadQuestions(questions) {
    this.questions = questions;
    this.categories = [...new Set(questions.map(q => q.category))].slice(0, 6);
    this.gameState = 'ready';
    this.usedQuestions.clear();

    const dailyDoubleCount = Math.min(2, Math.floor(questions.length / 10));
    const questionIndices = questions.map((_, i) => i);

    for (let i = 0; i < dailyDoubleCount; i++) {
      const randomIndex = Math.floor(Math.random() * questionIndices.length);
      const questionIndex = questionIndices[randomIndex];
      this.questions[questionIndex].isDaily = true;
      questionIndices.splice(randomIndex, 1);
    }
  }

  getCategories() {
    return this.categories;
  }

  selectQuestion(category, value) {
    const questionKey = `${category}-${value}`;

    if (this.usedQuestions.has(questionKey)) {
      return null;
    }

    const question = this.questions.find(
      q => q.category === category && q.value === value
    );

    if (question) {
      this.currentQuestion = question;
      this.usedQuestions.add(questionKey);
      this.buzzQueue = [];

      // Check if this is a daily double
      if (question.isDaily) {
        this.gameState = 'daily-double-wager';
        this.dailyDoubleWager.active = true;
        this.dailyDoubleWager.playerId = this.controlPlayerId;
        this.dailyDoubleWager.questionKey = questionKey;
        return {
          ...question,
          questionKey,
          requiresWager: true,
          controlPlayerId: this.controlPlayerId
        };
      } else {
        this.gameState = 'question-active';
        return {
          ...question,
          questionKey
        };
      }
    }

    return null;
  }

  submitDailyDoubleWager(playerId, wagerAmount) {
    // Validate it's the correct player and a wager is active
    if (!this.dailyDoubleWager.active || playerId !== this.dailyDoubleWager.playerId) {
      return false;
    }

    const playerScore = this.scores.get(playerId) || 0;
    const maxWager = Math.max(playerScore, 1000); // Max of current score or $1000
    const wager = parseInt(wagerAmount);

    // Validate wager
    if (isNaN(wager) || wager < 0 || wager > maxWager) {
      return false;
    }

    // Store the wager
    this.dailyDoubleWager.wager = wager;
    this.gameState = 'question-active';
    return true;
  }

  getDailyDoubleWagerState() {
    if (!this.dailyDoubleWager.active) {
      return null;
    }

    const playerId = this.dailyDoubleWager.playerId;
    const playerScore = this.scores.get(playerId) || 0;
    const maxWager = Math.max(playerScore, 1000);

    return {
      playerId,
      playerName: this.players.get(playerId)?.name,
      currentScore: playerScore,
      maxWager
    };
  }

  startAnswerTimer(duration = 10) {
    if (this.questionTimer) {
      clearTimeout(this.questionTimer);
    }

    this.questionTimer = setTimeout(() => {
      this.io.emit('answer-time-up');

      // Remove the current answerer from the buzz queue
      if (this.buzzQueue.length > 0) {
        this.buzzQueue.shift();
      }

      // Check if there's another player in the queue
      if (this.buzzQueue.length > 0) {
        const nextPlayer = this.getNextBuzzer();
        if (nextPlayer) {
          this.io.emit('next-player-to-answer', nextPlayer);
          this.startAnswerTimer(); // Start timer for next player
        }
      } else {
        // No more players in queue, reopen buzzing
        this.io.emit('reopen-buzzing');
      }
    }, duration * 1000);
  }

  stopTimer() {
    if (this.questionTimer) {
      clearTimeout(this.questionTimer);
      this.questionTimer = null;
    }
  }

  recordBuzz(playerId) {
    if (!this.currentQuestion || !this.players.has(playerId)) {
      return null;
    }

    const alreadyBuzzed = this.buzzQueue.some(b => b.playerId === playerId);
    if (alreadyBuzzed) {
      return null;
    }

    const buzzEntry = {
      playerId,
      timestamp: Date.now()
    };

    this.buzzQueue.push(buzzEntry);
    this.buzzQueue.sort((a, b) => a.timestamp - b.timestamp);

    // Start timer only for the first buzz
    if (this.buzzQueue.length === 1) {
      this.startAnswerTimer();
    }

    return buzzEntry.timestamp;
  }

  getBuzzQueue() {
    return this.buzzQueue.map(b => ({
      ...b,
      playerName: this.players.get(b.playerId)?.name
    }));
  }

  getNextBuzzer() {
    if (this.buzzQueue.length > 0) {
      const next = this.buzzQueue.shift();
      return {
        playerId: next.playerId,
        playerName: this.players.get(next.playerId)?.name
      };
    }
    return null;
  }

  processAnswer(playerId, correct) {
    if (!this.currentQuestion || !this.players.has(playerId)) {
      return 0;
    }

    // Stop the timer when processing an answer
    this.stopTimer();

    let points = correct ? this.currentQuestion.value : -this.currentQuestion.value;

    // Apply daily double wager multiplier if applicable
    if (this.dailyDoubleWager.active && this.dailyDoubleWager.wager !== null) {
      if (correct) {
        // For correct answer, add the wager amount
        points = this.dailyDoubleWager.wager;
      } else {
        // For incorrect answer, subtract the wager amount
        points = -this.dailyDoubleWager.wager;
      }
    }

    const currentScore = this.scores.get(playerId) || 0;
    this.scores.set(playerId, currentScore + points);

    // Clear daily double wager state
    if (this.dailyDoubleWager.active) {
      this.dailyDoubleWager.active = false;
      this.dailyDoubleWager.playerId = null;
      this.dailyDoubleWager.wager = null;
      this.dailyDoubleWager.questionKey = null;
    }

    if (correct) {
      // This player now has control of the board
      this.controlPlayerId = playerId;
      this.clearBuzzQueue();
      this.currentQuestion = null;
      this.gameState = 'ready';
    } else {
      // Remove the player who just answered incorrectly from the queue
      this.buzzQueue = this.buzzQueue.filter(b => b.playerId !== playerId);

      // Don't automatically start timer - wait for next buzz or presenter action
      // The timer will start when the presenter selects the next player or someone new buzzes
    }

    return points;
  }

  clearBuzzQueue() {
    this.buzzQueue = [];
    if (this.questionTimer) {
      clearTimeout(this.questionTimer);
      this.questionTimer = null;
    }
  }

  adjustScore(playerId, points) {
    if (this.players.has(playerId)) {
      const currentScore = this.scores.get(playerId) || 0;
      this.scores.set(playerId, currentScore + points);
    }
  }

  getScores() {
    const scoreArray = Array.from(this.scores.entries()).map(([playerId, score]) => ({
      playerId,
      playerName: this.players.get(playerId)?.name,
      score
    }));

    return scoreArray.sort((a, b) => b.score - a.score);
  }

  startFinalJeopardy() {
    this.gameState = 'final-jeopardy';
    this.finalJeopardy.active = true;

    const finalQuestion = this.questions.find(q => q.category === 'Final Jeopardy') || {
      category: 'Final Jeopardy',
      question: 'This programming language was created by Brendan Eich in just 10 days in 1995',
      answer: 'What is JavaScript?'
    };

    this.finalJeopardy.question = finalQuestion;
    this.finalJeopardy.wagers.clear();
    this.finalJeopardy.answers.clear();
    this.finalJeopardy.grades.clear();

    return this.getFinalJeopardyState();
  }

  getFinalJeopardyState() {
    return {
      active: this.finalJeopardy.active,
      category: this.finalJeopardy.question?.category,
      eligiblePlayers: this.getScores().filter(s => s.score > 0)
    };
  }

  submitWager(playerId, wager) {
    const playerScore = this.scores.get(playerId) || 0;

    if (playerScore <= 0) {
      return false;
    }

    const wagerAmount = parseInt(wager);
    if (isNaN(wagerAmount) || wagerAmount < 0 || wagerAmount > playerScore) {
      return false;
    }

    this.finalJeopardy.wagers.set(playerId, wagerAmount);
    return true;
  }

  allWagersSubmitted() {
    const eligiblePlayers = Array.from(this.scores.entries())
      .filter(([_, score]) => score > 0);

    return eligiblePlayers.every(([playerId]) =>
      this.finalJeopardy.wagers.has(playerId)
    );
  }

  submitFinalAnswer(playerId, answer) {
    if (!this.finalJeopardy.wagers.has(playerId)) {
      return false;
    }

    this.finalJeopardy.answers.set(playerId, answer);
    return true;
  }

  allAnswersSubmitted() {
    return Array.from(this.finalJeopardy.wagers.keys()).every(playerId =>
      this.finalJeopardy.answers.has(playerId)
    );
  }

  getFinalAnswers() {
    return Array.from(this.finalJeopardy.answers.entries()).map(([playerId, answer]) => ({
      playerId,
      playerName: this.players.get(playerId)?.name,
      answer,
      wager: this.finalJeopardy.wagers.get(playerId),
      currentScore: this.scores.get(playerId)
    }));
  }

  gradeFinalAnswer(playerId, correct) {
    this.finalJeopardy.grades.set(playerId, correct);

    const wager = this.finalJeopardy.wagers.get(playerId) || 0;
    const currentScore = this.scores.get(playerId) || 0;
    const newScore = correct ? currentScore + wager : currentScore - wager;

    this.scores.set(playerId, newScore);
  }

  allAnswersGraded() {
    return Array.from(this.finalJeopardy.wagers.keys()).every(playerId =>
      this.finalJeopardy.grades.has(playerId)
    );
  }

  calculateFinalScores() {
    const finalScores = this.getScores();
    const winner = finalScores[0];

    return {
      scores: finalScores,
      winner: winner ? {
        name: winner.playerName,
        score: winner.score
      } : null
    };
  }

  resetGame() {
    this.currentQuestion = null;
    this.buzzQueue = [];
    this.usedQuestions.clear();
    this.controlPlayerId = null; // Clear control player on reset
    this.dailyDoubleWager = {
      active: false,
      playerId: null,
      wager: null,
      questionKey: null
    };
    this.gameState = this.questions.length > 0 ? 'ready' : 'waiting';
    this.finalJeopardy = {
      active: false,
      question: null,
      wagers: new Map(),
      answers: new Map(),
      grades: new Map()
    };

    this.scores.forEach((_, playerId) => {
      this.scores.set(playerId, 0);
    });

    if (this.questionTimer) {
      clearTimeout(this.questionTimer);
      this.questionTimer = null;
    }
  }

  getGameState() {
    return {
      state: this.gameState,
      categories: this.categories,
      usedQuestions: Array.from(this.usedQuestions),
      currentQuestion: this.currentQuestion,
      scores: this.getScores(),
      buzzQueue: this.getBuzzQueue(),
      playerCount: this.players.size,
      finalJeopardy: this.finalJeopardy.active,
      dailyDoubleWager: this.dailyDoubleWager.active ? this.getDailyDoubleWagerState() : null
    };
  }

  presenterDisconnected() {
    this.presenterId = null;
    console.log('Presenter disconnected');
  }
}

module.exports = GameManager;