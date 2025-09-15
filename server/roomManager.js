const GameManager = require('./gameManager');

class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map(); // gameCode -> { gameManager, createdAt, lastActivity }
    this.maxRooms = process.env.MAX_ROOMS || 100;
    this.cleanupIntervalHours = process.env.ROOM_CLEANUP_HOURS || 4;

    // Start cleanup interval
    this.startCleanupInterval();
  }

  generateGameCode(customName = null) {
    if (customName) {
      // Sanitize custom name to create a code
      let code = customName.toUpperCase()
        .replace(/[^A-Z0-9]/g, '') // Remove special characters
        .substring(0, 10); // Limit length

      // If code is too short or already exists, add numbers
      if (code.length < 3 || this.rooms.has(code)) {
        const suffix = Math.floor(Math.random() * 100).toString().padStart(2, '0');
        code = (code || 'GAME') + suffix;
      }

      // Ensure uniqueness
      while (this.rooms.has(code)) {
        const suffix = Math.floor(Math.random() * 100).toString().padStart(2, '0');
        code = code.substring(0, 8) + suffix;
      }

      return code;
    } else {
      // Generate a random code like "RBL123"
      const prefix = 'RBL';
      const numbers = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      const code = prefix + numbers;

      // Ensure uniqueness
      if (this.rooms.has(code)) {
        return this.generateGameCode();
      }

      return code;
    }
  }

  createRoom(presenterId, customName = null) {
    if (this.rooms.size >= this.maxRooms) {
      throw new Error('Maximum number of rooms reached');
    }

    const gameCode = this.generateGameCode(customName);
    const gameManager = new GameManager(this.io, gameCode);

    this.rooms.set(gameCode, {
      gameManager,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      presenterId,
      gameName: customName || gameCode
    });

    console.log(`Created new game room: ${gameCode} (${customName || 'auto-generated'})`);
    return { gameCode, gameManager };
  }

  getRoom(gameCode) {
    const room = this.rooms.get(gameCode);
    if (room) {
      room.lastActivity = Date.now();
      return room;
    }
    return null;
  }

  deleteRoom(gameCode) {
    const room = this.rooms.get(gameCode);
    if (room) {
      // Notify all players in the room
      this.io.to(`game-${gameCode}`).emit('game-ended', {
        reason: 'Room deleted by admin'
      });

      // Clean up
      this.rooms.delete(gameCode);
      console.log(`Deleted game room: ${gameCode}`);
      return true;
    }
    return false;
  }

  getAdminStats() {
    const now = Date.now();
    const stats = {
      activeGames: this.rooms.size,
      maxRooms: this.maxRooms,
      games: []
    };

    for (const [code, room] of this.rooms.entries()) {
      const game = room.gameManager;
      stats.games.push({
        code,
        name: room.gameName || code,
        created: new Date(room.createdAt).toLocaleString(),
        lastActivity: new Date(room.lastActivity).toLocaleString(),
        hoursActive: Math.floor((now - room.createdAt) / (1000 * 60 * 60)),
        playerCount: game.players.size,
        status: this.getGameStatus(game),
        presenterConnected: !!game.presenterId,
        currentRound: this.getCurrentRound(game),
        scores: game.getScores()
      });
    }

    return stats;
  }

  getGameStatus(gameManager) {
    if (gameManager.finalJeopardy.active) {
      return 'Final Jeopardy';
    } else if (gameManager.currentQuestion) {
      return 'Question Active';
    } else if (gameManager.gameState === 'waiting') {
      return 'Waiting for Players';
    } else if (gameManager.usedQuestions.size === 0) {
      return 'Not Started';
    } else if (gameManager.usedQuestions.size === gameManager.questions.length) {
      return 'Game Complete';
    } else {
      return 'In Progress';
    }
  }

  getCurrentRound(gameManager) {
    const totalQuestions = gameManager.questions.length;
    const usedQuestions = gameManager.usedQuestions.size;

    if (totalQuestions === 0) return 'Setup';
    if (gameManager.finalJeopardy.active) return 'Final';

    const percentComplete = (usedQuestions / totalQuestions) * 100;
    if (percentComplete < 50) return 'Round 1';
    else if (percentComplete < 100) return 'Round 2';
    else return 'Complete';
  }

  startCleanupInterval() {
    // Run cleanup every hour
    setInterval(() => {
      this.cleanupInactiveRooms();
    }, 60 * 60 * 1000);
  }

  cleanupInactiveRooms() {
    const now = Date.now();
    const maxInactiveMs = this.cleanupIntervalHours * 60 * 60 * 1000;

    for (const [code, room] of this.rooms.entries()) {
      const inactiveTime = now - room.lastActivity;

      if (inactiveTime > maxInactiveMs) {
        console.log(`Auto-cleaning inactive room: ${code}`);
        this.deleteRoom(code);
      }
    }
  }

  getAllRoomCodes() {
    return Array.from(this.rooms.keys());
  }

  getRoomByPresenterId(presenterId) {
    for (const [code, room] of this.rooms.entries()) {
      if (room.presenterId === presenterId) {
        return { code, ...room };
      }
    }
    return null;
  }
}

module.exports = RoomManager;