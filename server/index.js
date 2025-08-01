
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import { setCards, createGame, joinGame, leaveGame, startGame, playCard, getGames, getPublicGames } from './game.js';

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // In production, you should restrict this to your client's origin
    methods: ["GET", "POST"]
  }
});

// Load card data
fs.readFile('../data/cards.json', 'utf8', (err, data) => {
  if (err) {
    console.error("Error reading cards.json:", err);
    return;
  }
  setCards(JSON.parse(data));
});

io.on('connection', (socket) => {
  console.log('a user connected:', socket.id);

  // Send the list of public games to the new client
  socket.emit('publicGames', getPublicGames());

  // Handle create room event
  socket.on('createRoom', ({ gameId, playerName }) => {
    try {
      const { game, player } = createGame(socket, { gameId, playerName });
      socket.emit('roomCreated', { gameId: game.gameId, player });
      io.to(game.gameId).emit('gameStateUpdate', game);
      // Broadcast the updated list of public games
      io.emit('publicGames', getPublicGames());
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Handle join room event
  socket.on('joinRoom', ({ gameId, playerName }) => {
    try {
      const { game, player } = joinGame(gameId, socket, playerName);
      socket.emit('roomJoined', { gameId, player });
      io.to(gameId).emit('gameStateUpdate', game);
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Handle leave room event
  socket.on('leaveRoom', (gameId) => {
    const updatedGame = leaveGame(gameId, socket);
    if (updatedGame) {
      io.to(gameId).emit('gameStateUpdate', updatedGame);
    }
    io.emit('publicGames', getPublicGames());
  });

  // Handle start game event
  socket.on('startGame', (gameId) => {
    try {
      const game = startGame(gameId);
      io.to(gameId).emit('gameStateUpdate', game);
      io.emit('publicGames', getPublicGames());
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Handle play card event
  socket.on('playCard', ({ gameId, cardInstanceId, targetPlayerId }) => {
    try {
      const game = playCard(gameId, socket.id, cardInstanceId, targetPlayerId);
      io.to(gameId).emit('gameStateUpdate', game);
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('disconnect', () => {
    console.log('user disconnected:', socket.id);
    // Find which game the user was in and remove them
    const games = getGames();
    for (const gameId in games) {
      const game = games[gameId];
      const player = game.players.find(p => p.id === socket.id);
      if (player) {
        const updatedGame = leaveGame(gameId, socket);
        if (updatedGame) {
          io.to(gameId).emit('gameStateUpdate', updatedGame);
        }
        io.emit('publicGames', getPublicGames());
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
