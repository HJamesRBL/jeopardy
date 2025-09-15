# Migration Guide: Multi-Game Room Support

## Overview
This update adds support for multiple simultaneous games using a room-based architecture. Each game gets a unique 6-character code (e.g., "RBL123") that players use to join the correct game.

## Key Changes

### 1. Server Architecture
- **Old**: Single GameManager instance for one game at a time
- **New**: RoomManager manages multiple GameManager instances
- **Server File**: Use `server/server-rooms.js` instead of `server/server.js`

### 2. Environment Variables
Add these to your `.env` file:
```env
ADMIN_PASSWORD=your-secure-password-here
MAX_ROOMS=100
ROOM_CLEANUP_HOURS=4
```

### 3. Running the New Server
Update your package.json or run directly:
```bash
node server/server-rooms.js
```

### 4. New Features
- **Multiple Games**: Run many games simultaneously
- **Admin Dashboard**: Access at `/admin` with password
- **Game Codes**: Each game has a unique code for players to join
- **Auto-Cleanup**: Inactive games are removed after configured hours

## Migration Steps

### Option 1: Full Migration (Recommended)
1. Stop current server
2. Add environment variables to `.env`
3. Update package.json:
   ```json
   "scripts": {
     "start": "node server/server-rooms.js",
     "dev": "nodemon server/server-rooms.js"
   }
   ```
4. Start new server: `npm start`

### Option 2: Test First
1. Keep existing setup
2. Run new server on different port:
   ```bash
   PORT=3001 node server/server-rooms.js
   ```
3. Test at `http://localhost:3001`
4. Migrate when ready

## Client Updates Needed

### Presenter (index.html/presenter.js)
The presenter flow needs these updates:
1. Add "Create New Game" button
2. Store and display game code
3. Include game code in all socket events

### Player (player.html/player.js)
The player flow needs:
1. Game code input field
2. Include game code when joining
3. Show error for invalid codes

## API Changes

### Socket Events
All socket events now need game code:
```javascript
// Old
socket.emit('player-join', playerName);

// New
socket.emit('player-join', { playerName, gameCode });
```

### QR Code Generation
Include game code in QR request:
```javascript
// Old
fetch('/qrcode')

// New
fetch(`/qrcode?gameCode=${gameCode}`)
```

## Admin Dashboard

Access the admin dashboard at `/admin` using the password from your `.env` file.

Features:
- View all active games
- See player counts and status
- Delete games manually
- Monitor server load

## Rollback Plan

If you need to rollback:
1. Change package.json back to use `server/server.js`
2. Restart server
3. Original single-game functionality is preserved

## Next Steps

To complete the migration, update the client files:
1. `public/presenter.js` - Add game creation flow
2. `public/player.js` - Add game code input
3. `public/index.html` - Add create game button
4. `public/player.html` - Add game code field

The server-side (`server-rooms.js`) is fully ready for multi-game support.