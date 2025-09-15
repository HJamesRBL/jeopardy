const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const multer = require('multer');
const QRCode = require('qrcode');
require('dotenv').config();

const RoomManager = require('./roomManager');
const QuestionLoader = require('./questionLoader');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

const upload = multer({ dest: 'uploads/' });

const roomManager = new RoomManager(io);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

app.use(express.static('public'));
app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/player', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/player.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

app.post('/admin/auth', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'Invalid password' });
  }
});

app.get('/admin/stats', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${ADMIN_PASSWORD}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json(roomManager.getAdminStats());
});

app.delete('/admin/room/:gameCode', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${ADMIN_PASSWORD}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { gameCode } = req.params;
  const deleted = roomManager.deleteRoom(gameCode);
  res.json({ success: deleted });
});

app.get('/qrcode', async (req, res) => {
  try {
    const { gameCode } = req.query;
    const host = req.get('host');
    const protocol = req.protocol;
    const playerUrl = gameCode
      ? `${protocol}://${host}/player?game=${gameCode}`
      : `${protocol}://${host}/player`;
    const qrCodeDataUrl = await QRCode.toDataURL(playerUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    res.json({ qrCode: qrCodeDataUrl, url: playerUrl });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

app.post('/upload-questions', upload.single('questions'), async (req, res) => {
  try {
    let questions;

    if (req.body.useDefault) {
      questions = QuestionLoader.loadDefaultQuestions();
    } else if (req.file) {
      questions = await QuestionLoader.loadFromCSV(req.file.path);
    } else {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    gameManager.loadQuestions(questions);

    res.json({
      success: true,
      message: `Loaded ${questions.length} questions`,
      categories: gameManager.getCategories()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  socket.on('presenter-connect', () => {
    gameManager.setPresenter(socket.id);
    // Always send the current game state when presenter connects/reconnects
    const currentState = gameManager.getGameState();
    socket.emit('game-state', currentState);
    socket.emit('players-update', gameManager.getPlayers());
    console.log('Presenter connected, sending game state with used questions:', currentState.usedQuestions);
  });

  socket.on('player-join', (playerName) => {
    const player = gameManager.addPlayer(socket.id, playerName);
    if (player) {
      socket.emit('player-joined', player);
      io.emit('players-update', gameManager.getPlayers());
      if (gameManager.presenterId) {
        io.to(gameManager.presenterId).emit('player-connected', player);
      }
    } else {
      socket.emit('join-error', 'Game is full or invalid name');
    }
  });

  socket.on('select-question', (data) => {
    if (socket.id === gameManager.presenterId) {
      const question = gameManager.selectQuestion(data.category, data.value);
      if (question) {
        io.emit('question-selected', question);
        // Send updated game state to mark question as used immediately
        io.emit('game-state', gameManager.getGameState());
        // Timer now starts only when someone buzzes in
      }
    }
  });

  socket.on('buzz', () => {
    const buzzTime = gameManager.recordBuzz(socket.id);
    if (buzzTime) {
      io.emit('buzz-received', {
        playerId: socket.id,
        playerName: gameManager.getPlayer(socket.id)?.name,
        timestamp: buzzTime,
        position: gameManager.getBuzzQueue().length
      });
    }
  });

  socket.on('answer-response', (data) => {
    if (socket.id === gameManager.presenterId) {
      const { playerId, correct } = data;
      const points = gameManager.processAnswer(playerId, correct);

      io.emit('answer-processed', {
        playerId,
        correct,
        points,
        scores: gameManager.getScores()
      });

      // Send updated players list with control player info
      if (correct) {
        io.emit('players-update', gameManager.getPlayers());
      }

      if (!correct && gameManager.getBuzzQueue().length > 0) {
        const nextPlayer = gameManager.getNextBuzzer();
        if (nextPlayer) {
          io.emit('next-player-to-answer', nextPlayer);
          // Start timer for the next player who already buzzed
          gameManager.startAnswerTimer();
        }
      } else if (!correct && gameManager.currentQuestion) {
        // Wrong answer and no one else in queue - reopen buzzing
        io.emit('reopen-buzzing');
      } else {
        gameManager.clearBuzzQueue();
        io.emit('question-complete');
        // Send updated game state so clients know which questions are used
        io.emit('game-state', gameManager.getGameState());
      }
    }
  });

  socket.on('adjust-score', (data) => {
    if (socket.id === gameManager.presenterId) {
      const { playerId, points } = data;
      gameManager.adjustScore(playerId, points);
      io.emit('scores-updated', gameManager.getScores());
    }
  });

  socket.on('start-final-jeopardy', () => {
    if (socket.id === gameManager.presenterId) {
      gameManager.startFinalJeopardy();
      io.emit('final-jeopardy-started', gameManager.getFinalJeopardyState());
    }
  });

  socket.on('final-jeopardy-wager', (data) => {
    const { wager } = data;
    if (gameManager.submitWager(socket.id, wager)) {
      socket.emit('wager-accepted', wager);

      if (gameManager.allWagersSubmitted()) {
        io.emit('all-wagers-submitted');
      }
    } else {
      socket.emit('wager-error', 'Invalid wager amount');
    }
  });

  socket.on('final-jeopardy-answer', (data) => {
    const { answer } = data;
    if (gameManager.submitFinalAnswer(socket.id, answer)) {
      socket.emit('answer-submitted');

      if (gameManager.allAnswersSubmitted()) {
        if (gameManager.presenterId) {
          io.to(gameManager.presenterId).emit('review-final-answers',
            gameManager.getFinalAnswers());
        }
      }
    }
  });

  socket.on('grade-final-answer', (data) => {
    if (socket.id === gameManager.presenterId) {
      const { playerId, correct } = data;
      gameManager.gradeFinalAnswer(playerId, correct);

      if (gameManager.allAnswersGraded()) {
        const finalScores = gameManager.calculateFinalScores();
        io.emit('game-over', finalScores);
      }
    }
  });

  socket.on('reset-game', () => {
    if (socket.id === gameManager.presenterId) {
      gameManager.resetGame();
      io.emit('game-reset');
      io.emit('game-state', gameManager.getGameState());
    }
  });

  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);

    if (socket.id === gameManager.presenterId) {
      gameManager.presenterDisconnected();
    } else {
      const player = gameManager.removePlayer(socket.id);
      if (player) {
        io.emit('player-disconnected', player);
        io.emit('players-update', gameManager.getPlayers());
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`RBL-pardy game server running on port ${PORT}`);
  console.log(`Presenter view: http://localhost:${PORT}`);
  console.log(`Player view: http://localhost:${PORT}/player`);
});