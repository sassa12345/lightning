
import { v4 as uuidv4 } from 'uuid';

// This will store all the ongoing games
let games = {};

// This will store the card definitions
let cards = [];

export const setCards = (cardData) => {
  cards = cardData;
};

export const createGame = (socket, { gameId, playerName }) => {
  console.log(`createGame called with gameId: ${gameId}, playerName: ${playerName}`);
  if (!gameId) {
    gameId = uuidv4();
  }
  if (games[gameId]) {
    throw new Error("そのルームIDは既に使用されています。");
  }
  games[gameId] = {
    gameId,
    players: [],
    currentTurnPlayerId: null,
    turnOrder: [],
    lastAttackedPlayerRecord: new Map(),
    gamePhase: "waiting", // waiting, playing, ended
    isPublic: true, // Add this line
    chatLog: [],
    gameLog: [],
    nextCardInstanceId: 1,
    turnCount: 0, // Add this line
    winner: null,
  };
  socket.join(gameId);
  const player = {
    id: socket.id,
    name: playerName || `プレイヤー${games[gameId].players.length + 1}`,
    hp: 30,
    shield: 0,
    hand: [],
    deck: [],
    discardPile: [],
    activeEffects: [],
    hasTakenFirstTurn: false,
  };
  games[gameId].players.push(player);
  console.log(`Player created in createGame: ${player.name}`);
  return { game: games[gameId], player };
};

export const joinGame = (gameId, socket, playerName) => {
  console.log(`joinGame called with gameId: ${gameId}, playerName: ${playerName}`);
  if (!games[gameId]) {
    throw new Error("指定されたルームは存在しません。");
  }
  if (games[gameId].gamePhase !== 'waiting') {
    throw new Error("ゲームは既に開始されています。");
  }
  socket.join(gameId);
  const player = {
    id: socket.id,
    name: playerName || `プレイヤー${games[gameId].players.length + 1}`,
    hp: 30,
    shield: 0,
    hand: [],
    deck: [],
    discardPile: [],
    activeEffects: [],
    hasTakenFirstTurn: false,
  };
  games[gameId].players.push(player);
  console.log(`Player created in joinGame: ${player.name}`);
  return { game: games[gameId], player };
};

export const leaveGame = (gameId, socket) => {
  if (!games[gameId]) {
    return null;
  }
  games[gameId].players = games[gameId].players.filter(p => p.id !== socket.id);
  if (games[gameId].players.length === 0) {
    delete games[gameId];
    return null;
  }
  return games[gameId];
};

export const startGame = (gameId) => {
  if (!games[gameId]) {
    throw new Error("ゲームが見つかりません");
  }
  const game = games[gameId];
  if (game.players.length < 2) {
    throw new Error("ゲームを開始するには2人以上のプレイヤーが必要です");
  }
  game.gamePhase = 'playing';
  game.gameLog.push(`ゲームが開始されました！`);

  // Create deck for each player
  game.players.forEach(player => {
    let deck = [];
    cards.forEach(card => {
      for (let i = 0; i < card.probability; i++) {
        deck.push(card.id);
      }
    });
    // Shuffle deck
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    player.deck = deck;

    // Draw initial hand
    player.deck = deck;

    // Draw initial hand
    for (let i = 0; i < 3; i++) {
      drawCard(game, player);
    }
  });

  // Set turn order
  game.turnOrder = game.players.map(p => p.id);
  for (let i = game.turnOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [game.turnOrder[i], game.turnOrder[j]] = [game.turnOrder[j], game.turnOrder[i]];
  }
  game.currentTurnPlayerId = game.turnOrder[0];
  // Mark the first player as having taken their first turn
  game.players.find(p => p.id === game.currentTurnPlayerId).hasTakenFirstTurn = true;

  return game;
};

const drawCard = (game, player) => {
  if (player.deck.length === 0) {
    // Reshuffle discard pile into deck
    player.deck = player.discardPile.map(c => c.id);
    player.discardPile = [];
    for (let i = player.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [player.deck[i], player.deck[j]] = [player.deck[j], player.deck[i]];
    }
  }
  const cardId = player.deck.pop();
  const card = cards.find(c => c.id === cardId);
  player.hand.push({ ...card, instanceId: game.nextCardInstanceId++, currentValue: card.baseValue });
};

export const playCard = (gameId, playerId, cardInstanceId, targetPlayerId) => {
  const game = games[gameId];
  if (!game) {
    throw new Error("ゲームが見つかりません");
  }
  if (game.currentTurnPlayerId !== playerId) {
    throw new Error("あなたのターンではありません");
  }
  const player = game.players.find(p => p.id === playerId);
  const cardIndex = player.hand.findIndex(c => c.instanceId === cardInstanceId);
  if (cardIndex === -1) {
    throw new Error("そのカードは手札にありません");
  }

  const card = player.hand[cardIndex];

  

  // Card effects
  switch (card.type) {
    case 'attack':
      if (game.players.filter(p => p.hp > 0).length >= 4 && game.lastAttackedPlayerRecord.get(targetPlayerId) === playerId) {
        throw new Error("同じプレイヤーに2回連続で攻撃することはできません");
      }
      const targetPlayer = game.players.find(p => p.id === targetPlayerId);
      if (!targetPlayer) {
        throw new Error("攻撃対象のプレイヤーが見つかりません");
      }
      let damage = card.currentValue;
      if (!card.isPiercing) {
        const shieldDamage = Math.min(targetPlayer.shield, damage);
        targetPlayer.shield -= shieldDamage;
        damage -= shieldDamage;
      }
      targetPlayer.hp -= damage;
      if (targetPlayer.hp <= 0) {
        targetPlayer.hp = 0;
        game.gameLog.push(`${player.name} の攻撃により、${targetPlayer.name} は脱落しました！`);
      } else {
        game.gameLog.push(`${player.name} は ${targetPlayer.name} に ${damage} ダメージを与えました！ (残りHP: ${targetPlayer.hp})`);
      }
      game.lastAttackedPlayerRecord.set(targetPlayerId, playerId);
      break;
    case 'shield':
      player.shield += card.currentValue;
      game.gameLog.push(`${player.name} はシールドを ${card.currentValue} 展開しました！ (合計シールド: ${player.shield})`);
      break;
    case 'heal':
      if (card.isPersistent) {
        player.activeEffects.push({ type: 'auto-heal', value: card.currentValue });
        game.gameLog.push(`${player.name} は自動回復を発動しました！ (毎ターンHP ${card.currentValue} 回復)`);
      } else if (card.isHpShare) {
        const otherPlayers = game.players.filter(p => p.id !== playerId && p.hp > 0);
        if (otherPlayers.length > 0) {
          const randomPlayer = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
          const oldHp = player.hp;
          player.hp = randomPlayer.hp;
          game.gameLog.push(`${player.name} は「なかよし」を使用し、${randomPlayer.name} のHP (${randomPlayer.hp}) と同じになりました！ (HP変化: ${oldHp} -> ${player.hp})`);
        } else {
          game.gameLog.push(`${player.name} は「なかよし」を使用しましたが、対象がいませんでした。`);
        }
      } else {
        const oldHp = player.hp;
        player.hp = Math.min(30, player.hp + card.currentValue);
        game.gameLog.push(`${player.name} はHPを ${card.currentValue} 回復しました！ (HP変化: ${oldHp} -> ${player.hp})`);
      }
      break;
    case 'charge':
      player.hand.forEach(c => {
        c.currentValue += card.currentValue;
      });
      game.gameLog.push(`${player.name} はチャージカードを使用し、手札のカードを ${card.currentValue} 強化しました！`);
      break;
  }

  player.hand.splice(cardIndex, 1);
  player.discardPile.push(card);

  // End turn
  endTurn(game, player);

  return game;
};

const endTurn = (game, player) => {
  game.turnCount++; // Add this line
  // Charge cards in hand
  player.hand.forEach(c => {
    c.currentValue += 2;
  });
  game.gameLog.push(`${player.name} の手札のカードが自動で2チャージされました。`);

  // Apply active effects
  player.activeEffects.forEach(effect => {
    if (effect.type === 'auto-heal') {
      const oldHp = player.hp;
      player.hp = Math.min(30, player.hp + effect.value);
      game.gameLog.push(`${player.name} は自動回復によりHPが ${effect.value} 回復しました！ (HP変化: ${oldHp} -> ${player.hp})`);
    }
  });

  // Check for winner
  const alivePlayers = game.players.filter(p => p.hp > 0);
  if (alivePlayers.length <= 1) {
    game.gamePhase = 'ended';
    game.winner = alivePlayers[0] || null;
    if (game.winner) {
      game.gameLog.push(`${game.winner.name} が勝利しました！`);
    } else {
      game.gameLog.push(`ゲームが終了しました。勝者はいません。`);
    }
    return;
  }

  // Next turn
  const currentPlayerIndex = game.turnOrder.indexOf(player.id);
  let nextPlayerIndex = (currentPlayerIndex + 1) % game.turnOrder.length;
  while (game.players.find(p => p.id === game.turnOrder[nextPlayerIndex]).hp === 0) {
    nextPlayerIndex = (nextPlayerIndex + 1) % game.turnOrder.length;
  }
  game.currentTurnPlayerId = game.turnOrder[nextPlayerIndex];

  // Draw card for next player
  const nextPlayer = game.players.find(p => p.id === game.currentTurnPlayerId);
  if (!nextPlayer.hasTakenFirstTurn) {
    nextPlayer.hasTakenFirstTurn = true;
  } else {
    drawCard(game, nextPlayer);
  }
};

export const getGames = () => games;

export const getPublicGames = () => {
  const publicGames = Object.values(games).filter(game => game.isPublic && game.gamePhase === 'waiting');
  console.log('Public games available:', publicGames.map(g => g.gameId));
  return publicGames;
};
