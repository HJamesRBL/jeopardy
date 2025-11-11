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
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'RBL123';

const upload = multer({ dest: 'uploads/' });

const roomManager = new RoomManager(io);

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

// Admin endpoints
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
    res.json({ qrCode: qrCodeDataUrl, url: playerUrl, gameCode });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

app.post('/upload-questions', upload.single('questions'), async (req, res) => {
  try {
    const { gameCode } = req.body;

    if (!gameCode) {
      return res.status(400).json({ error: 'No game code provided' });
    }

    const room = roomManager.getRoom(gameCode);
    if (!room) {
      return res.status(404).json({ error: 'Game room not found' });
    }

    let questions;

    if (req.body.useDefault) {
      questions = QuestionLoader.loadDefaultQuestions();
    } else if (req.file) {
      questions = await QuestionLoader.loadFromCSV(req.file.path);
    } else {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    room.gameManager.loadQuestions(questions);

    res.json({
      success: true,
      message: `Loaded ${questions.length} questions`,
      categories: room.gameManager.getCategories(),
      gameCode
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  // Presenter creates a new game room
  socket.on('create-game', () => {
    try {
      const { gameCode, gameManager } = roomManager.createRoom(socket.id);
      gameManager.setPresenter(socket.id);

      // Join the room
      socket.join(`game-${gameCode}`);

      socket.emit('game-created', {
        gameCode,
        gameState: gameManager.getGameState()
      });

      console.log(`Presenter created game: ${gameCode}`);
    } catch (error) {
      socket.emit('error', error.message);
    }
  });

  // Presenter reconnects to existing game
  socket.on('presenter-connect', (gameCode) => {
    const room = roomManager.getRoom(gameCode);

    if (!room) {
      socket.emit('error', 'Game room not found');
      return;
    }

    room.gameManager.setPresenter(socket.id);
    socket.join(`game-${gameCode}`);

    // Send current state
    socket.emit('game-state', room.gameManager.getGameState());
    socket.emit('players-update', room.gameManager.getPlayers());

    console.log(`Presenter reconnected to game: ${gameCode}`);
  });

  // Player joins a game room
  socket.on('player-join', ({ playerName, gameCode }) => {
    const room = roomManager.getRoom(gameCode);

    if (!room) {
      socket.emit('join-error', 'Invalid game code');
      return;
    }

    const player = room.gameManager.addPlayer(socket.id, playerName);

    if (player) {
      socket.join(`game-${gameCode}`);
      socket.gameCode = gameCode; // Store for disconnect handling

      socket.emit('player-joined', player);
      io.to(`game-${gameCode}`).emit('players-update', room.gameManager.getPlayers());
      io.to(`game-${gameCode}`).emit('scores-updated', room.gameManager.getScores());

      if (room.gameManager.presenterId) {
        io.to(room.gameManager.presenterId).emit('player-connected', player);
      }
    } else {
      socket.emit('join-error', 'Game is full or invalid name');
    }
  });

  // Question selection (presenter only)
  socket.on('select-question', ({ gameCode, category, value }) => {
    const room = roomManager.getRoom(gameCode);

    if (!room || socket.id !== room.gameManager.presenterId) {
      return;
    }

    const question = room.gameManager.selectQuestion(category, value);

    if (question) {
      io.to(`game-${gameCode}`).emit('question-selected', question);
      io.to(`game-${gameCode}`).emit('game-state', room.gameManager.getGameState());
    }
  });

  // Player buzzes in
  socket.on('buzz', (gameCode) => {
    const room = roomManager.getRoom(gameCode);

    if (!room) return;

    const buzzTime = room.gameManager.recordBuzz(socket.id);

    if (buzzTime) {
      io.to(`game-${gameCode}`).emit('buzz-received', {
        playerId: socket.id,
        playerName: room.gameManager.getPlayer(socket.id)?.name,
        timestamp: buzzTime,
        position: room.gameManager.getBuzzQueue().length
      });
    }
  });

  // Answer grading (presenter only)
  socket.on('answer-response', ({ gameCode, playerId, correct }) => {
    const room = roomManager.getRoom(gameCode);

    if (!room || socket.id !== room.gameManager.presenterId) {
      return;
    }

    const points = room.gameManager.processAnswer(playerId, correct);

    io.to(`game-${gameCode}`).emit('answer-processed', {
      playerId,
      correct,
      points,
      scores: room.gameManager.getScores()
    });

    if (correct) {
      io.to(`game-${gameCode}`).emit('players-update', room.gameManager.getPlayers());
    }

    if (!correct && room.gameManager.getBuzzQueue().length > 0) {
      const nextPlayer = room.gameManager.getNextBuzzer();
      if (nextPlayer) {
        io.to(`game-${gameCode}`).emit('next-player-to-answer', nextPlayer);
        room.gameManager.startAnswerTimer();
      }
    } else if (!correct && room.gameManager.currentQuestion) {
      io.to(`game-${gameCode}`).emit('reopen-buzzing');
    } else {
      room.gameManager.clearBuzzQueue();
      io.to(`game-${gameCode}`).emit('question-complete');
      io.to(`game-${gameCode}`).emit('game-state', room.gameManager.getGameState());
    }
  });

  // Score adjustment (presenter only)
  socket.on('adjust-score', ({ gameCode, playerId, points }) => {
    const room = roomManager.getRoom(gameCode);

    if (!room || socket.id !== room.gameManager.presenterId) {
      return;
    }

    room.gameManager.adjustScore(playerId, points);
    io.to(`game-${gameCode}`).emit('scores-updated', room.gameManager.getScores());
  });

  // Final Jeopardy
  socket.on('start-final-jeopardy', (gameCode) => {
    const room = roomManager.getRoom(gameCode);

    if (!room || socket.id !== room.gameManager.presenterId) {
      return;
    }

    room.gameManager.startFinalJeopardy();
    io.to(`game-${gameCode}`).emit('final-jeopardy-started', room.gameManager.getFinalJeopardyState());
  });

  socket.on('final-jeopardy-wager', ({ gameCode, wager }) => {
    const room = roomManager.getRoom(gameCode);

    if (!room) return;

    if (room.gameManager.submitWager(socket.id, wager)) {
      socket.emit('wager-accepted', wager);

      if (room.gameManager.allWagersSubmitted()) {
        io.to(`game-${gameCode}`).emit('all-wagers-submitted');
      }
    } else {
      socket.emit('wager-error', 'Invalid wager amount');
    }
  });

  socket.on('final-jeopardy-answer', ({ gameCode, answer }) => {
    const room = roomManager.getRoom(gameCode);

    if (!room) return;

    if (room.gameManager.submitFinalAnswer(socket.id, answer)) {
      socket.emit('answer-submitted');

      if (room.gameManager.allAnswersSubmitted()) {
        if (room.gameManager.presenterId) {
          io.to(room.gameManager.presenterId).emit('review-final-answers',
            room.gameManager.getFinalAnswers());
        }
      }
    }
  });

  socket.on('grade-final-answer', ({ gameCode, playerId, correct }) => {
    const room = roomManager.getRoom(gameCode);

    if (!room || socket.id !== room.gameManager.presenterId) {
      return;
    }

    room.gameManager.gradeFinalAnswer(playerId, correct);

    if (room.gameManager.allAnswersGraded()) {
      const finalScores = room.gameManager.calculateFinalScores();
      io.to(`game-${gameCode}`).emit('game-over', finalScores);
    }
  });

  // Reset game (presenter only)
  socket.on('reset-game', (gameCode) => {
    const room = roomManager.getRoom(gameCode);

    if (!room || socket.id !== room.gameManager.presenterId) {
      return;
    }

    room.gameManager.resetGame();
    io.to(`game-${gameCode}`).emit('game-reset');
    io.to(`game-${gameCode}`).emit('game-state', room.gameManager.getGameState());
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);

    // Check if disconnected user was a presenter
    const presenterRoom = roomManager.getRoomByPresenterId(socket.id);
    if (presenterRoom) {
      presenterRoom.gameManager.presenterDisconnected();
    }

    // Check if disconnected user was a player
    if (socket.gameCode) {
      const room = roomManager.getRoom(socket.gameCode);
      if (room) {
        const player = room.gameManager.removePlayer(socket.id);
        if (player) {
          io.to(`game-${socket.gameCode}`).emit('player-disconnected', player);
          io.to(`game-${socket.gameCode}`).emit('players-update', room.gameManager.getPlayers());
          io.to(`game-${socket.gameCode}`).emit('scores-updated', room.gameManager.getScores());
        }
      }
    }
  });

  // Admin socket events
  socket.on('admin-connect', (password) => {
    if (password === ADMIN_PASSWORD) {
      socket.join('admin-room');
      socket.emit('admin-authenticated');
      socket.emit('admin-stats', roomManager.getAdminStats());
    } else {
      socket.emit('admin-auth-failed');
    }
  });

  socket.on('admin-delete-room', ({ password, gameCode }) => {
    if (password === ADMIN_PASSWORD) {
      const deleted = roomManager.deleteRoom(gameCode);
      if (deleted) {
        io.to('admin-room').emit('admin-stats', roomManager.getAdminStats());
        socket.emit('room-deleted', gameCode);
      }
    }
  });

  socket.on('admin-request-stats', (password) => {
    if (password === ADMIN_PASSWORD) {
      socket.emit('admin-stats', roomManager.getAdminStats());
    }
  });

  socket.on('admin-create-game', ({ password, gameName }) => {
    if (password === ADMIN_PASSWORD) {
      try {
        const { gameCode, gameManager } = roomManager.createRoom('admin', gameName);
        socket.emit('game-created-admin', { gameCode, gameName });
        io.to('admin-room').emit('admin-stats', roomManager.getAdminStats());
        console.log(`Admin created game: ${gameCode} (${gameName || 'auto'})`);
      } catch (error) {
        socket.emit('error', error.message);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`RBL-pardy game server running on port ${PORT}`);
  console.log(`Presenter view: http://localhost:${PORT}`);
  console.log(`Player view: http://localhost:${PORT}/player`);
  console.log(`Admin dashboard: http://localhost:${PORT}/admin`);
});