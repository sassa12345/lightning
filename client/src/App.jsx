import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import './App.css';
import './Card.css';

const socket = io('http://localhost:3001');

function App() {
  const [game, setGame] = useState(null);
  const [player, setPlayer] = useState(null);
  const [gameIdInput, setGameIdInput] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [publicGames, setPublicGames] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [playerAnimations, setPlayerAnimations] = useState({}); // New state for animations
  const [cardChargeAnimations, setCardChargeAnimations] = useState({}); // New state for card charge animations

  useEffect(() => {
    socket.on('connect', () => {
      console.log('サーバーに接続しました');
    });

    socket.on('roomCreated', ({ gameId, player }) => {
      console.log('ルームが作成されました:', gameId);
      setGame({ gameId });
      setPlayer(player);
    });

    socket.on('roomJoined', ({ gameId, player }) => {
      console.log('ルームに参加しました:', gameId);
      setGame({ gameId });
      setPlayer(player);
    });

    socket.on('gameStateUpdate', (updatedGame) => {
      // Detect HP/Shield changes for animations
      if (game && updatedGame && updatedGame.players) {
        updatedGame.players.forEach(updatedP => {
          const oldP = game.players.find(p => p.id === updatedP.id);
          if (oldP) {
            const changes = {};
            if (updatedP.hp !== oldP.hp) {
              changes.hp = updatedP.hp - oldP.hp;
            }
            if (updatedP.shield !== oldP.shield) {
              changes.shield = updatedP.shield - oldP.shield;
            }
            if (Object.keys(changes).length > 0) {
              setPlayerAnimations(prev => ({
                ...prev,
                [updatedP.id]: changes
              }));
              // Clear animation after a short delay
              setTimeout(() => {
                setPlayerAnimations(prev => {
                  const newAnimations = { ...prev };
                  delete newAnimations[updatedP.id];
                  return newAnimations;
                });
              }, 1000); // Animation duration
            }
          }
        });
      }

      // Detect card charge animations
      if (game && updatedGame && updatedGame.players) {
        const oldPlayer = game.players.find(p => p.id === socket.id);
        const newPlayer = updatedGame.players.find(p => p.id === socket.id);

        if (oldPlayer && newPlayer) {
          const chargedCardInstanceIds = [];
          newPlayer.hand.forEach(newCard => {
            const oldCard = oldPlayer.hand.find(oc => oc.instanceId === newCard.instanceId);
            if (oldCard && newCard.currentValue > oldCard.currentValue) {
              chargedCardInstanceIds.push(newCard.instanceId);
            }
          });

          if (chargedCardInstanceIds.length > 0) {
            setCardChargeAnimations(prev => {
              const newAnimations = { ...prev };
              chargedCardInstanceIds.forEach(id => newAnimations[id] = true);
              return newAnimations;
            });
            setTimeout(() => {
              setCardChargeAnimations({});
            }, 500); // Animation duration
          }
        }
      }

      setGame(updatedGame);
      if (updatedGame && updatedGame.players) {
        const currentPlayer = updatedGame.players.find(p => p.id === socket.id);
        if (currentPlayer) {
          setPlayer(currentPlayer);
        }
      }
    });

    socket.on('publicGames', (games) => {
      setPublicGames(games);
    });

    socket.on('error', ({ message }) => {
      alert(message);
    });

    return () => {
      socket.off('connect');
      socket.off('roomCreated');
      socket.off('roomJoined');
      socket.off('gameStateUpdate');
      socket.off('publicGames');
      socket.off('error');
    };
  }, []);

  const createRoom = () => {
    console.log(`Attempting to create room with gameId: ${gameIdInput || null}, playerName: ${playerName}`);
    socket.emit('createRoom', { gameId: gameIdInput || null, playerName });
  };

  const joinRoom = () => {
    console.log(`Attempting to join room with gameId: ${gameIdInput}, playerName: ${playerName}`);
    socket.emit('joinRoom', { gameId: gameIdInput, playerName });
  };

  const startGame = () => {
    socket.emit('startGame', game.gameId);
  };

  const playCard = (targetPlayerId = null) => {
    if (selectedCard) {
      socket.emit('playCard', { 
        gameId: game.gameId, 
        cardInstanceId: selectedCard.instanceId, 
        targetPlayerId 
      });
      setSelectedCard(null);
    }
  };

  const playCardByType = (type) => {
    const card = player.hand.find(c => c.type === type);
    if (card) {
      socket.emit('playCard', { 
        gameId: game.gameId, 
        cardInstanceId: card.instanceId, 
        targetPlayerId: null
      });
    }
  };

  const handleCardClick = (card) => {
    if (game.currentTurnPlayerId === player.id) {
      if (selectedCard && selectedCard.instanceId === card.instanceId) {
        setSelectedCard(null); // Deselect if clicking the same card
      } else {
        setSelectedCard(card);
      }
    }
  };

  const handlePlayerClick = (p) => {
    if (selectedCard && selectedCard.type === 'attack' && p.id !== player.id) {
      playCard(p.id);
    }
  };

  return (
    <div className="App">
      <h1>カードバトルロイヤル</h1>
      {!game ? (
        <div>
          <input
            type="text"
            placeholder="名前を入力"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
          />
          <input
            type="text"
            placeholder="ルームIDを入力 (空で自動生成)"
            value={gameIdInput}
            onChange={(e) => setGameIdInput(e.target.value)}
          />
          <button onClick={createRoom}>ルームを作成</button>
          <button onClick={joinRoom}>ルームに参加</button>

          <h3>公開中のルーム:</h3>
          <ul>
            {publicGames.map((game) => (
              <li key={game.gameId} onClick={() => setGameIdInput(game.gameId)}>
                {game.gameId} ({game.players.length}人)
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div>
          <h2>ルームID: {game.gameId}</h2>
          {game.gamePhase === 'waiting' && (
            <button onClick={startGame}>ゲーム開始</button>
          )}
          {game.gamePhase === 'ended' && (
            <div>
              <h2>ゲーム終了！</h2>
              <h3>勝者: {game.winner ? game.winner.name : 'なし'}</h3>
            </div>
          )}
          <h3>プレイヤー一覧:</h3>
          <ul className="player-list">
            {game.players && game.players.map((p) => {
              const isTargetable = selectedCard && selectedCard.type === 'attack' && p.id !== player.id && p.hp > 0;
              return (
                <li 
                  key={p.id} 
                  onClick={() => handlePlayerClick(p)}
                  className={`
                    ${game.currentTurnPlayerId === p.id ? 'current-turn' : ''}
                    ${isTargetable ? 'targetable' : ''}
                    ${playerAnimations[p.id] && playerAnimations[p.id].hp < 0 ? 'player-hp-flash-red shake' : ''}
                    ${playerAnimations[p.id] && playerAnimations[p.id].hp > 0 ? 'player-hp-flash-green' : ''}
                    ${playerAnimations[p.id] && playerAnimations[p.id].shield > 0 ? 'player-shield-flash-blue' : ''}
                  `}
                >
                  {p.name} - HP: <span className="player-hp">{p.hp}</span>, シールド: <span className="player-shield">{p.shield}</span>
                  {p.hp === 0 && ' (脱落)'}
                  {playerAnimations[p.id] && playerAnimations[p.id].hp && (
                    <span className={`hp-change-animation ${playerAnimations[p.id].hp > 0 ? 'hp-change-plus' : 'hp-change-minus'}`}>
                      {playerAnimations[p.id].hp > 0 ? '+' : ''}{playerAnimations[p.id].hp}
                    </span>
                  )}
                  {playerAnimations[p.id] && playerAnimations[p.id].shield && (
                    <span className="hp-change-animation shield-change-plus">
                      +{playerAnimations[p.id].shield}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>

          {player && player.hand && game.gamePhase === 'playing' && (
            <div>
              <h3>あなたの手札 {game.currentTurnPlayerId === player.id && "(あなたのターン)"}</h3>
              <div className="hand">
                {player.hand.map(card => (
                  <div 
                    key={card.instanceId} 
                    onClick={() => handleCardClick(card)} 
                    className={`card ${card.type} ${selectedCard && selectedCard.instanceId === card.instanceId ? 'selected' : ''} ${cardChargeAnimations[card.instanceId] ? 'card-charged' : ''}`}
                  >
                    <div className="card-name">{card.name}</div>
                    <div className="card-description">{card.description}</div>
                    <div className="card-value">{card.currentValue}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {game.gamePhase === 'playing' && (
            <div className="game-log">
              <h3>ゲームログ</h3>
              <div className="log-container">
                {game.gameLog.map((log, index) => (
                  <p key={index}>{log}</p>
                ))}
              </div>
            </div>
          )}

          {player && player.hand && game.gamePhase === 'playing' && game.currentTurnPlayerId === player.id && (
            <div className="action-buttons">
              <button onClick={() => playCardByType('heal')} disabled={!player.hand.some(c => c.type === 'heal')}>回復</button>
              <button onClick={() => playCardByType('shield')} disabled={!player.hand.some(c => c.type === 'shield')}>シールド</button>
              <button onClick={() => playCardByType('charge')} disabled={!player.hand.some(c => c.type === 'charge')}>チャージ</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;