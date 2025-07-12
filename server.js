// server.js
// Custom Express server to run Next.js and Socket.IO with Redis adapter

const express = require('express');
const next = require('next');
const http = require('http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
require('dotenv').config();
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
console.log(`Using Redis URL: ${REDIS_URL}`);
app.prepare().then(async () => {
  const server = express();
  const httpServer = http.createServer(server);

  // Initialize Socket.IO
  const io = new Server(httpServer, {
    cors: { origin: '*' }
  });

  // Set up Redis Pub/Sub for Socket.IO
  const pubClient = createClient({ url: REDIS_URL });
  const subClient = pubClient.duplicate();
  await pubClient.connect();
  await subClient.connect();
  io.adapter(createAdapter(pubClient, subClient));

  // --- In-memory game state ---
  // Structure: { [gameId]: { round: number, played: { [round]: { [userId]: card } }, nameMap: { [socketId]: name } } }
  const gameState = io.gameState || (io.gameState = {});

  // --- Helper: Determine round winner for Call Break ---
  function getRoundWinner(played, trumpSuit = '♠') {
    // played: { userId: cardString }
    // Returns userId of winner
    let leadSuit = null;
    let maxCard = null;
    let winner = null;
    for (const [user, card] of Object.entries(played)) {
      const match = card.match(/^(\d+|A|J|Q|K)([♠♥♦♣])$/);
      if (!match) continue;
      const [_, rank, suit] = match;
      if (!leadSuit) leadSuit = suit;
      // Rank order for Call Break
      const rankOrder = { A: 14, K: 13, Q: 12, J: 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };
      const value = rankOrder[rank] || parseInt(rank);
      // Trump beats all, else highest of lead suit
      if (!maxCard) {
        maxCard = { user, suit, value, card };
        winner = user;
      } else if (suit === trumpSuit && maxCard.suit !== trumpSuit) {
        maxCard = { user, suit, value, card };
        winner = user;
      } else if (suit === maxCard.suit && value > maxCard.value && (suit === leadSuit || suit === trumpSuit)) {
        maxCard = { user, suit, value, card };
        winner = user;
      }
    }
    return winner;
  }

  // Socket.IO event handlers
  // --- Card distribution logic as a function ---
  function distributeCardsToRoom(gameId) {
    console.log(`Distributing cards for game ${gameId}`);
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    let deck = [];
    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push(`${rank}${suit}`);
      }
    }
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const trumpSuit = suits[Math.floor(Math.random() * suits.length)];
    const clients = Array.from(io.sockets.adapter.rooms.get(gameId) || []);
    const numPlayers = clients.length;
    if (numPlayers === 0) return;
    const cardsPerPlayer = Math.floor(deck.length / numPlayers);
    const totalCardsToDeal = cardsPerPlayer * numPlayers;
    for (let idx = 0; idx < numPlayers; idx++) {
      const start = idx * cardsPerPlayer;
      const end = start + cardsPerPlayer;
      const userCards = deck.slice(start, end);
      console.log(`Distributing cards to ${clients[idx]}:`, userCards.length);
      io.to(clients[idx]).emit('cardsDistributed', userCards);
    }
    if (!gameState[gameId]) {
      gameState[gameId] = { round: 1, played: {}, nameMap: {}, totalRounds: cardsPerPlayer, results: null, trumpSuit, numPlayers };
    } else {
      gameState[gameId].round = 1;
      gameState[gameId].results = null;
      gameState[gameId].totalRounds = cardsPerPlayer;
      gameState[gameId].trumpSuit = trumpSuit;
      gameState[gameId].numPlayers = numPlayers;
    }
    // Reset roundsWon at the start of each game
    gameState[gameId].roundsWon = {};
    gameState[gameId].played = {};
    gameState[gameId].played[1] = {};
    io.to(gameId).emit('cardsDealt', { round: 1, totalRounds: cardsPerPlayer, trumpSuit });
    gameState[gameId].players = clients.map(id => ({ id, name: gameState[gameId].nameMap[id] || `User ${id}` }));
    io.to(gameId).emit('playerList', gameState[gameId].players);
  }

  io.on('connection', (socket) => {
    // Example: join room
    socket.on('joinRoom', ({ gameId, name }) => {
      socket.join(gameId);
      // Map socketId to name for this game
      console.log(gameState[gameId], "Joining room", gameId, "with name", name, "round", gameState[gameId]?.round);
      if (!gameState[gameId]) {
        gameState[gameId] = { round: 0, played: {}, nameMap: {}, players: [] };
      }
      if (!gameState[gameId].nameMap) gameState[gameId].nameMap = {};
      gameState[gameId].nameMap[socket.id] = name;
      // Broadcast to room
      console.log(`User ${socket.id} (${name}) joined room ${gameId}`);
      io.to(gameId).emit('userJoined', socket.id);
      io.to(gameId).emit('gameStatus', {
        round: gameState[gameId]?.round,
        trumpSuit: gameState[gameId]?.trumpSuit
      });
      const clients = Array.from(io.sockets.adapter.rooms.get(gameId) || []);
      io.to(gameId).emit('userList', clients.map(id => ({ id, name: gameState[gameId].nameMap[id] || `User ${id}` })));
      if(!gameState[gameId]?.round){
        gameState[gameId].players = clients.map(id => ({ id, name: gameState[gameId].nameMap[id] || `User ${id}` }))
      }
      io.to(gameId).emit('playerList', gameState[gameId].players);
    });

    // Handle playCard event
    socket.on('playCard', ({ gameId, card }) => {
      // Track played card for this round
      if (!gameState[gameId]) {
        gameState[gameId] = { round: 1, played: {}, nameMap: {}, totalRounds: 1, results: null };
      }
      const round = gameState[gameId].round;
      if (!gameState[gameId].played[round]) {
        gameState[gameId].played[round] = {};
      }
      gameState[gameId].played[round][socket.id] = card;
      console.log(`User ${socket.id} played card ${card} in game ${gameId}, round ${round}`);
      io.to(gameId).emit('cardPlayed', { user: socket.id, card, round });
      // Optionally: check if all players have played for this round, then emit 'roundEnd'
      const clients = Array.from(io.sockets.adapter.rooms.get(gameId) || []);
      if (Object.keys(gameState[gameId].played[round]).length === gameState[gameId].numPlayers) {
        // io.to(gameId).emit('roundEnd', { round });
        // --- Call Break round winner logic ---
        if (!gameState[gameId].roundsWon) gameState[gameId].roundsWon = {};
        const played = gameState[gameId].played[round];
        const winner = getRoundWinner(played);
        if (winner) {
          gameState[gameId].roundsWon[winner] = (gameState[gameId].roundsWon[winner] || 0) + 1;
        }
        // Emit roundResult after every round
        io.to(gameId).emit('roundResult', {
          round,
          played,
          winner,
          roundsWon: gameState[gameId].roundsWon
        });
        // If last round, emit game results and store them
        if (round >= (gameState[gameId].totalRounds || 1) || round == 2) {
          // Collect all played cards per user for all rounds
          const results = {};
          for (let r = 1; r <= round; r++) {
            const played = gameState[gameId].played[r] || {};
            for (const [user, card] of Object.entries(played)) {
              if (!results[user]) results[user] = [];
              results[user].push(card);
            }
          }
          gameState[gameId].results = results;
          io.to(gameId).emit('gameResults', {
            results,
            roundsWon: gameState[gameId].roundsWon
          });
        } else {
          // Start next round
          gameState[gameId].round += 1;
          gameState[gameId].played[gameState[gameId].round] = {};
          io.to(gameId).emit('cardsDealt', { round: gameState[gameId].round, totalRounds: gameState[gameId].totalRounds });
        }
      }
    });
    socket.on('distributeCards', (gameId) => {
      distributeCardsToRoom(gameId);
    });
    // Handle chatMessage event
    socket.on('chatMessage', (chat) => {
      // msg can be a string or { user, text }
      const { chat: msg, gameId } = chat
      let messageObj;
      console.log(`Received chat message from ${socket.id}:`, msg, chat);
      if (typeof msg === 'string') {
        // Try to get user name from mapping
        const name = gameState?.[gameId]?.nameMap?.[socket.id] ?? `User ${socket.id}`;
        console.log(`Using name for chat: ${name}`);
        messageObj = { user: name, text: msg };
      } else if (msg && typeof msg === 'object' && msg.text) {
        messageObj = msg;
      } else {
        messageObj = { user: `User ${socket.id}`, text: String(msg) };
      }
      // Broadcast to all in the room
      messageObj.userId  = socket.id; // Include socket ID for reference
      console.log(`Broadcasting chat message to game ${gameId}:`, messageObj);
      io.to(gameId).emit('chatMessage', messageObj);
    });

    // Clean up game state when all users leave a room
socket.on('disconnecting', () => {
  // Find the gameId (roomId) for this socket (excluding its own id)
  const joinedRooms = Array.from(socket.rooms).filter(r => r !== socket.id);
  for (const roomId of joinedRooms) {
    const gameId = roomId; // For clarity
    // Wait for next tick so socket is removed from room
    let timeout = setTimeout(() => {
      const room = io.sockets.adapter.rooms.get(gameId);
      if (!room || room.size === 0) {
        if (gameState[gameId]) {
          console.log(`Clearing game state for room ${gameId}`);
          delete gameState[gameId];
        }
      } else {
        // Remove name mapping for this socket from the room
        if (gameState[gameId] && gameState[gameId].nameMap) {
          delete gameState[gameId].nameMap[socket.id];
        }
        const clients = Array.from(io.sockets.adapter.rooms.get(gameId) || []);
        io.to(gameId).emit('userList', clients.map(id => ({ id, name: gameState[gameId].nameMap[id] || `User ${id}` })));
        const stillThere = io.sockets.adapter.rooms.get(gameId);
          // Check if the leaving user was a player
          const wasPlayer = Array.isArray(gameState[gameId]?.players) &&
            gameState[gameId].players.some(p => p.id === socket.id);
          if (stillThere && stillThere.size > 0 && wasPlayer) {
            console.log(`Restarting game in room ${gameId} after player left (was player).`);
            // Directly redistribute cards
            distributeCardsToRoom(gameId);
          } else if (stillThere && stillThere.size > 0) {
            console.log(`User left room ${gameId} but was not a player, not restarting game.`);
          }
      }
      clearTimeout(timeout);
    }, 0);
  }
});
  });

  // Let Next.js handle all other routes
  //   server.all('*', (req, res) => handle(req, res));
  server.use((req, res) => handle(req, res));

  // Start server
  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, () => {
    console.log(`> Ready on http://localhost:${PORT}`);
  });
});