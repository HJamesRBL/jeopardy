# RBL-pardy Game - Workshop Edition

A fully-featured, real-time RBL-pardy game designed for workshop presentations. Supports up to 50 simultaneous players with mobile-friendly buzzer system.

## Features

- **Real-time multiplayer** - Up to 50 players can join via QR code/link
- **Mobile-friendly buzzer system** - Players use their phones to buzz in
- **CSV question upload** - Easy question management without code changes
- **Daily Doubles** - Automatically placed in random questions
- **Final RBL-pardy** - Complete with wagering system
- **Live scoring** - Real-time leaderboard updates
- **Presenter controls** - Full game management interface

## Quick Start

### Local Development

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Access the game:
- Presenter view: http://localhost:3000
- Player view: http://localhost:3000/player

### Railway Deployment

1. Create a new project on [Railway](https://railway.app)

2. Connect your GitHub repository

3. Railway will automatically detect the Node.js app and deploy it

4. Set the PORT environment variable (Railway does this automatically)

5. Your app will be available at your Railway URL

## How to Play

### For Presenters

1. **Setup**:
   - Open the presenter view in your browser
   - Click "Upload Questions" to load a CSV file, or use sample questions
   - Click "Show QR Code" to display joining instructions for players

2. **During the Game**:
   - Click on question values to reveal questions
   - Players buzz in using their devices
   - Click "Correct" or "Incorrect" to award/deduct points
   - Use "Show Answer" to reveal the correct answer
   - Monitor the leaderboard on the right sidebar

3. **Final RBL-pardy**:
   - Click "Final RBL-pardy" when ready
   - Players with positive scores can wager
   - Review and grade answers
   - Game automatically calculates final scores

### For Players

1. **Joining**:
   - Scan the QR code or visit the player URL
   - Enter your name
   - Wait for the game to begin

2. **Playing**:
   - Watch for questions on the presenter's screen
   - Tap the big red BUZZ button (or press spacebar) to buzz in
   - Your position in the buzz queue will be shown
   - Your score updates automatically

3. **Final RBL-pardy**:
   - Enter your wager (if eligible)
   - Submit your answer when the question is revealed
   - Wait for final results

## CSV Question Format

Create a CSV file with the following columns:

```csv
Category,Points,Question,Answer,IsDaily
Science,200,This planet is known as the Red Planet,What is Mars?,false
Science,400,The chemical symbol for gold,What is Au?,true
History,200,The year Columbus arrived in the Americas,What is 1492?,false
```

- **Category**: Question category (max 6 categories will be used)
- **Points**: Point value (200, 400, 600, 800, 1000)
- **Question**: The question/clue text
- **Answer**: The answer (traditionally in question form)
- **IsDaily**: true/false for Daily Double (optional)

## Configuration

### Environment Variables

- `PORT` - Server port (default: 3000)

### Game Settings

Maximum players and timer durations can be adjusted in `server/gameManager.js`:

```javascript
this.maxPlayers = 50;  // Maximum number of players
```

## Technical Stack

- **Backend**: Node.js, Express, Socket.io
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Real-time**: WebSockets via Socket.io
- **QR Generation**: qrcode npm package
- **CSV Parsing**: csv-parser

## Troubleshooting

### Players can't connect
- Ensure all devices are on the same network (for local hosting)
- Check firewall settings
- Verify the correct URL is being used

### Questions not loading
- Verify CSV format matches the template
- Check for special characters in the CSV
- Ensure all required columns are present

### WebSocket connection issues
- Check that the PORT environment variable is set correctly
- Ensure Socket.io client and server versions are compatible
- Look for CORS issues in browser console

## Browser Compatibility

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support
- Mobile browsers: Optimized for iOS Safari and Chrome

## Performance Tips

- For workshops with many participants, ensure strong WiFi
- Close unnecessary browser tabs on the presenter machine
- Use a wired connection for the presenter if possible
- Test with expected number of players before the workshop

## License

This project is designed for educational and workshop use. Feel free to modify and distribute as needed for your presentations.

## Support

For issues or questions, please check the troubleshooting section above or create an issue in the repository.# jeopardy
