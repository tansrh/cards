"use client"
import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { ThemeButton } from "../../_components/ThemeButton";
import { getCookie } from "../../../utils";
export default function GamePage() {
  const params = useParams();
  const gameId = params.gameId;
  const [chat, setChat] = useState("");
  const [messages, setMessages] = useState<{ user: string; text: string, userId: string }[]>([]);
  const [users, setUsers] = useState<{ id: string, name: string }[]>([]);
  const [players, setPlayers] = useState<{ id: string, name: string }[]>([]);
  const [cards, setCards] = useState<string[]>([]);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [distributed, setDistributed] = useState(false);
  const [chatWidth, setChatWidth] = useState(320);
  const chatRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const [dragging, setDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(320);
  const [bottomRef, setBottomRef] = useState(0);
  const [playedCards, setPlayedCards] = useState<Record<string, string>>({});
  const [round, setRound] = useState(0);
  const [trumpSuit, setTrumpSuit] = useState<string | null>(null);
  const [showRoundModal, setShowRoundModal] = useState(false);
  const [roundModalText, setRoundModalText] = useState("");
  const [showLoaderModal, setShowLoaderModal] = useState(false);
  const [showGameResults, setShowGameResults] = useState(false);
  const [resetGame, setResetGame] = useState(true);
  const resetGameRef = useRef(true);
 useEffect(() => {
    console.log("Reset game effect triggered:", showGameResults, resetGameRef.current);
    if (!showGameResults) {
      if (resetGameRef.current) {
        setDistributed(false);
        setRound(0);
        setPlayedCards({});
        setCards([]);
        setTrumpSuit(null);
      }
    }
    resetGameRef.current = true;
  }, [showGameResults]);
  const [isPlayer, setIsPlayer] = useState(socketRef.current && players?.some(p => p.id === socketRef?.current?.id));
  const [gameResults, setGameResults] = useState<any>(null);
  const name = getCookie('cardsPlayerName');
  const theme = getCookie('cardsTheme');
  const submissionForRound = useRef(-1);
  const cardsDealtTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const theme = getCookie('cardsTheme');
      return theme === 'dark';
    }
    return true;
  });

  // Apply dark mode class to <html> for global theming
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const html = document.documentElement;
      if (darkMode) {
        html.classList.add('dark');
        document.cookie = 'cardsTheme=dark; path=/';
      } else {
        html.classList.remove('dark');
        document.cookie = 'cardsTheme=light; path=/';
      }
    }
  }, [darkMode]);
  // Connect socket only once, after gameId is available

  useEffect(() => {
    if (!gameId) return;
    // if (!socketRef.current && typeof window !== "undefined") {
    socketRef.current = io();

    socketRef.current?.emit("joinRoom", { gameId, name });

    // Listen for chat messages
    function chatMessageHandler(msg: { user: string; text: string, userId: string }) {
      setMessages((prev) => [...prev, msg]);
      if(socketRef?.current?.id !== msg.userId) {
      const audio = new Audio('/sounds/notification.mp3');
      audio.volume = 0.4;
      audio.play().catch(() => {});
      }
    }
    socketRef.current.on("chatMessage", chatMessageHandler);

    // Listen for user list updates
    function userListHandler(userList: { id: string, name: string }[]) {
      setUsers(userList);
    }
    function playerListHandler(playerList: { id: string, name: string }[]) {
      console.log("Player list updated:", playerList);
      setPlayers(playerList);
    }
    socketRef.current.on("userList", userListHandler);
    //playerList
    socketRef.current.on("playerList", playerListHandler);


    // Listen for game status updates
    function gameStatusHandler(data: any) {
      if (typeof data === 'object' && data !== null) {
        setRound(data.round);
        if (data.trumpSuit) setTrumpSuit(data.trumpSuit);
        console.log("Game status updated, current round:", data.round, "trumpSuit:", data.trumpSuit);
      } else {
        setRound(data);
        console.log("Game status updated, current round:", data);
      }
    }
    socketRef.current.on("gameStatus", gameStatusHandler);

    // Listen for cards distribution
    function cardsDistributedHandler(userCards: string[]) {
      console.log("Cards distributed:", userCards);
      setCards(userCards);
      setDistributed(true);
      setShowGameResults(false);
      resetGameRef.current = false;
      // Play victory sound (local file)
      const victoryAudio = new Audio('/sounds/victory.mp3');
      victoryAudio.volume = 0.4;
      victoryAudio.play().catch(() => {});
    }
    socketRef.current.on("cardsDistributed", cardsDistributedHandler);

    // Listen for cardsDealt (round start)
    function cardsDealtHandler(data: any) {
      if (cardsDealtTimeoutRef.current) clearTimeout(cardsDealtTimeoutRef.current);
      cardsDealtTimeoutRef.current = setTimeout(() => {
        setPlayedCards({});
        const newRound = data && data.round ? data.round : 1;
        setRound(newRound);
        setShowLoaderModal(false);
        setShowRoundModal(true);
        setRoundModalText(`Round ${newRound}`);
        setTimeout(() => setShowRoundModal(false), 1400);
        if (data?.trumpSuit) setTrumpSuit(data.trumpSuit);
      }, 1000);
    }
    socketRef.current.on("cardsDealt", cardsDealtHandler);

    return () => {
      socketRef.current?.off("chatMessage", chatMessageHandler);
      socketRef.current?.off("userList", userListHandler);
      socketRef.current?.off("gameStatus", gameStatusHandler);
      socketRef.current?.off("cardsDistributed", cardsDistributedHandler);
      socketRef.current?.off("cardsDealt", cardsDealtHandler);
      socketRef.current?.disconnect();
      if (cardsDealtTimeoutRef.current) clearTimeout(cardsDealtTimeoutRef.current);
    };
    // eslint-disable-next-line
  }, []);

  // Chat send handler
  const sendMessage = () => {
    if (chat.trim()) {
      console.log("Sending chat message:", chat);
      socketRef.current?.emit("chatMessage", { chat, gameId });
      setChat("");
    }
  };

  // Distribute cards handler
  const distributeCards = () => {
    setShowLoaderModal(true);
    socketRef.current?.emit("distributeCards", gameId);
    // Hide loader after a short delay (simulate server response)
    // setTimeout(() => setShowLoaderModal(false), 1800);
  };

  // Chat panel resize handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    setStartX(e.clientX);
    setStartWidth(chatWidth);
  };
  useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      setChatWidth(Math.max(320, Math.min(600, startWidth - (e.clientX - startX))));
    };
    const handleMouseUp = () => setDragging(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, startX, startWidth]);
  // --- Add state for played cards ---


  // --- Handler for submitting a card ---
  function submitCard(card: any) {
    setCards(prev => prev.filter(c => c !== card));
    setPlayedCards(prev => {
      const id = socketRef.current && socketRef.current.id ? socketRef.current.id : 'me';
      return { ...prev, [id]: card };
    });
    setSelectedCard(null);
    if (socketRef.current) {
      socketRef.current.emit('playCard', { gameId, card });
    }
    submissionForRound.current = round; // Store the round for which this card was submitted
  }

  // --- Listen for played cards from server ---
  useEffect(() => {
    if (!socketRef.current) return;
    function handler(data: any) {
      setPlayedCards(prev => ({ ...prev, [data.user]: data.card }));
    }
    socketRef.current.on('cardPlayed', handler);
    return () => {
      if (socketRef.current) socketRef.current.off('cardPlayed', handler);
    };
  }, []);

  const roundResultTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // --- Optionally, listen for round end and reset playedCards ---
  useEffect(() => {
    if (!socketRef.current) return;
    function handler() {
      if (roundResultTimeoutRef.current) clearTimeout(roundResultTimeoutRef.current);
      roundResultTimeoutRef.current = setTimeout(() => setPlayedCards({}), 2000);
    }
    socketRef.current.on('roundResult', handler);
    return () => {
      if (socketRef.current) socketRef.current.off('roundResult', handler);
      if (roundResultTimeoutRef.current) clearTimeout(roundResultTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!socketRef.current) return;
    function handler(data: any) {
      console.log("Game results received:", data);
      setGameResults(data);
      // Play victory sound (local file)
      const victoryAudio = new Audio('/sounds/victory.mp3');
      victoryAudio.volume = 0.4;
      victoryAudio.play().catch(() => {});
      const timeout = setTimeout(() => {
        setShowGameResults(true);
        clearTimeout(timeout);
      }, 1500);
    }
    socketRef.current.on('gameResults', handler);
    return () => {
      socketRef.current?.off('gameResults', handler);
    };
  }, [socketRef.current]);
  return (
    <div className={`flex h-screen w-screen max-h-screen max-w-screen overflow-hidden transition-colors duration-300 ${darkMode ? 'bg-gradient-to-br from-black to-orange-900' : 'bg-gradient-to-br from-amber-100 to-orange-200'}`}>
      {/* Main game area */}
      <div className="flex-1 flex flex-col relative max-h-screen max-w-[80vw] ">
        <div className="flex justify-between items-center p-4 border-b border-orange-900 bg-black/70 overflow-auto">
          <div className="text-orange-300 font-bold text-xl">Room: {gameId}</div>
          <div className="flex gap-4 items-center">
            <div className="text-orange-200">Active Users:</div>
            <ul className="flex gap-2">
              {Array.isArray(users) && users.map(u => (
                <li key={u.id} className="bg-orange-800 text-white px-2 py-1 rounded cursor-pointer">{u.name}</li>
              ))}
            </ul>
          </div>
          <div className="flex items-center gap-2">
            {!distributed && !round && (
              <button
                className="ml-4 px-4 py-2 rounded bg-orange-700 text-white font-semibold hover:bg-orange-800 cursor-pointer"
                onClick={distributeCards}
              >
                Shuffle & distribute
              </button>
            )}
            <ThemeButton darkMode={darkMode} setDarkMode={setDarkMode} />
          </div>
        </div>
        {/* Game table area: show played cards at center top and round modal */}
        <div className="flex-1 flex flex-col items-center justify-center relative border-amber-100">
          {/* Loader modal overlay for distributing cards */}
          {showLoaderModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm transition-all">
              <div className="px-12 py-8 rounded-2xl bg-black/80 border-4 border-yellow-400 shadow-2xl flex flex-col items-center gap-6">
                <span className="text-3xl font-bold text-yellow-200 mb-2">Shuffling & Dealing...</span>
                {/* Vertical bar loader */}
                <div className="flex gap-2 h-16 items-end">
                  <div className="w-3 h-8 bg-orange-400 rounded animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-3 h-12 bg-yellow-300 rounded animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-3 h-6 bg-orange-500 rounded animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  <div className="w-3 h-14 bg-yellow-400 rounded animate-bounce" style={{ animationDelay: '450ms' }}></div>
                  <div className="w-3 h-10 bg-orange-300 rounded animate-bounce" style={{ animationDelay: '600ms' }}></div>
                </div>
              </div>
            </div>
          )}
          {/* Round modal overlay */}
          {showRoundModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm transition-all">
              <div className="px-12 py-8 rounded-2xl bg-black/80 border-4 border-yellow-400 text-5xl font-extrabold text-yellow-300 shadow-2xl animate-fade-in-up animate-pulse">
                {roundModalText}
              </div>
            </div>
          )}
          {/* Trump suit display */}
          {(round && trumpSuit) ?  (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center">
              <span className="text-xs font-semibold text-orange-300 tracking-wider uppercase">Trump Suit</span>
              <span className="text-3xl font-extrabold" style={{
                color: trumpSuit === '♥' ? '#f87171' : trumpSuit === '♦' ? '#fbbf24' : trumpSuit === '♣' ? '#34d399' : '#60a5fa',
                textShadow: '0 2px 8px #0008'
              }}>{trumpSuit || "X"}</span>
            </div>
          ) : null}
          {/* Center top: played cards for this round */}
          {round>0  && (
            <div className="absolute top-14 left-1/2 -translate-x-1/2 flex gap-6 z-10">
              {Array.isArray(players) && players.length && players.map(u => (
                <div key={u.id} className="flex flex-col items-center">
                  <div className="w-16 h-24 rounded-lg border-2 border-orange-400 bg-black flex items-center justify-center text-3xl font-bold text-white">
                    {/* Show played card if submitted for this round, else empty */}
                    {playedCards && playedCards[u.id] ? playedCards[u.id] : ''}
                  </div>
                  <span className="mt-1 text-xs text-orange-200 max-w-[4rem] truncate scroll-auto">{u.name}</span>
                </div>
              ))}
            </div>
          )}
          {(!distributed && isPlayer) ? (
            <div className="text-orange-200 text-lg">Waiting for cards to be distributed...</div>
          ) : <></>}
        </div>

        {/* User's cards at the bottom */}
        {distributed && (() => {
          // Calculate tallest stack
          const suits = ['♠', '♥', '♦', '♣'];

          const cardHeight = 96; // px (h-24)
          const cardOffset = 40; // px (translateY per card)
          const maxStack = Math.max(...suits.map(suit => cards.filter(card => card.endsWith(suit)).length), 1);
          const stackHeight = maxStack > 1 ? ((maxStack - 1) * cardOffset + cardHeight) : cardHeight;
          // Convert 100vh to px and subtract stackHeight to get the top offset
          const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 700;
          const topPx = viewportHeight - (maxStack * 40) - 80;
          return (
            <div
              className="absolute left-0 w-full flex justify-center pb-8 bottom-0"
            // style={{ top: `${topPx}px`, height: `${stackHeight}px` }}
            >
              {/* Vertically stacked cards by suit */}

              <div
                className="flex gap-8 h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-orange-400 scrollbar-track-black/30"
              // ref={el => {
              //   if (el) {
              //     const maxScroll = el.scrollHeight - el.clientHeight;
              //     // If at top, scroll down. If at bottom, scroll up.
              //     if (maxScroll > 0) {
              //       const duration = 2000; // ms
              //       if (el.scrollTop === 0) {
              //         // Scroll down
              //         const stepDown = (timestamp: number, startTime: number) => {
              //           const elapsed = timestamp - startTime;
              //           const progress = Math.min(elapsed / duration, 1);
              //           el.scrollTop = progress * maxScroll;
              //           if (progress < 1) {
              //             requestAnimationFrame(ts => stepDown(ts, startTime));
              //           }
              //         };
              //         requestAnimationFrame(ts => stepDown(ts, ts));
              //       } else if (el.scrollTop >= maxScroll) {
              //         // Scroll up
              //         const startScroll = el.scrollTop;
              //         const stepUp = (timestamp: number, startTime: number) => {
              //           const elapsed = timestamp - startTime;
              //           const progress = Math.min(elapsed / duration, 1);
              //           el.scrollTop = startScroll - (progress * startScroll);
              //           if (progress < 1) {
              //             requestAnimationFrame(ts => stepUp(ts, startTime));
              //           }
              //         };
              //         requestAnimationFrame(ts => stepUp(ts, ts));
              //       }
              //     }
              //   }
              // }}
              >
                {suits.map((suit) => {
                  const suitCards = cards.filter(card => card.endsWith(suit));
                  // Check if any card in this stack is selected
                  const selectedInStack = suitCards.some(card => selectedCard === card);
                  // The selected card in this stack, if any
                  const selectedCardInStack = suitCards.find(card => selectedCard === card);
                  const isDisabled = (submissionForRound.current === round) ? true : (selectedCardInStack ? false : true);
                  return (
                    // <div key={suit} className="relative" style={{ height: `${stackHeight}px`, width: '5rem' }}>
                    <div key={suit} className="relative" style={{ height: '100%', width: '5rem' }}>
                      {/* Tick/Cross above the stack, enabled only if a card in this stack is selected */}
                      {/* <div className="absolute left-1/2 -translate-x-1/2 top-[-2.5rem] flex flex-row items-center gap-3 z-30"> */}
                      <div className=" flex flex-row items-center gap-3 z-30 mb-2">
                        <button
                          className={`rounded-full bg-green-600 hover:bg-green-700 text-white w-8 h-8 flex items-center justify-center text-xl shadow-lg focus:outline-none focus:ring-2 focus:ring-green-300 ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                          title="Submit this card"
                          disabled={isDisabled}
                          onClick={e => {
                            e.stopPropagation();
                            if (selectedCardInStack) submitCard(selectedCardInStack);
                          }}
                        >
                          ✓
                        </button>
                        <button
                          className={`rounded-full bg-red-600 hover:bg-red-700 text-white w-8 h-8 flex items-center justify-center text-xl shadow-lg focus:outline-none focus:ring-2 focus:ring-red-300 ${!selectedInStack ? 'opacity-50 cursor-not-allowed' : ''}`}
                          title="Cancel selection"
                          disabled={!selectedInStack}
                          onClick={e => {
                            e.stopPropagation();
                            if (selectedInStack) setSelectedCard(null);
                          }}
                        >
                          ✕
                        </button>
                      </div>
                      {suitCards.map((card, idx) => (
                        <div
                          key={card}
                          className={`w-16 h-24 bg-black text-white rounded-lg flex flex-col items-center justify-end text-2xl font-bold shadow-lg border-2 transition-all duration-150 cursor-pointer
                            ${selectedCard === card ? 'border-yellow-400 ring-4 ring-yellow-300 z-20' : 'border-orange-400'}
                            ${suit === '♥' ? 'bg-red-600' : suit === '♦' ? 'bg-orange-300 text-black' : suit === '♣' ? 'bg-green-700' : ''}`}
                          style={{
                            position: 'absolute',
                            left: '50%',
                            transform: `translateX(-50%) translateY(${idx * cardOffset}px)`,
                            zIndex: idx,
                          }}
                          onClick={() => setSelectedCard(card)}
                        >
                          {/* Show full card if top, else show only rank and suit at bottom */}
                          {idx === suitCards.length - 1 ? (
                            <div className="flex-1 flex flex-col items-center justify-center w-full h-full">
                              <span>{card}</span>
                            </div>
                          ) : (
                            <div className="flex-1 flex items-start justify-end w-full h-full pr-2 pt-2">
                              <span className="text-base font-bold pb-1">{card}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>
      {/* Chat panel */}
      <div
        ref={chatRef}
        style={{ width: chatWidth }}
        className="relative h-full bg-black/80 border-l border-orange-900 flex flex-col"
      >
        {/* Resize handle */}
        <div
          className="absolute left-0 top-0 h-full w-2 cursor-ew-resize z-20"
          onMouseDown={handleMouseDown}
        />
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {messages.map((msg, idx) => {
            const isCurrentUser = (msg.userId === socketRef.current?.id) || msg.user.split(" ")?.[1]?.includes(socketRef.current?.id || '');
            return (
              <div
                key={idx}
                className={`flex flex-col items-end ${isCurrentUser ? 'items-end' : 'items-start'}`}
              >
                <span
                  className={`text-orange-100 px-3 py-1 rounded-lg max-w-[70%] break-words ${isCurrentUser ? 'bg-orange-700 text-white self-end' : 'bg-black/60'}`}
                >
                  {msg.text}
                </span>{
                  ((messages.length > (idx + 1) && messages[idx + 1]?.userId !== msg.userId) || (messages.length === (idx + 1))) &&
                  <span
                    className={`text-xs text-orange-400 mt-1 ${isCurrentUser ? 'self-end' : 'self-start'}`}
                  >
                    {msg.user}
                  </span>
                }
              </div>
            );
          })}
        </div>
        <div className="p-3 border-t border-orange-900 flex items-center gap-2 bg-black/90">
          <input
            className="flex-1 rounded px-3 py-2 bg-black text-orange-100 border border-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
            type="text"
            value={chat}
            onChange={e => setChat(e.target.value)}
            placeholder="Type a message..."
            onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }}
          />
          <button
            className="rounded-full bg-orange-700 text-white w-10 h-10 flex items-center justify-center text-xl hover:bg-orange-800 cursor-pointer"
            onClick={sendMessage}
            aria-label="Send message"
          >
            &gt;
          </button>
        </div>
      </div>

      {/* Game Results Modal */}
      {showGameResults && gameResults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-black/90 border-4 border-yellow-400 rounded-2xl px-10 py-8 shadow-2xl flex flex-col items-center gap-6 min-w-[320px] max-w-[90vw]">
            <div className="text-3xl font-bold text-yellow-300 mb-2">Game Results</div>
            <div className="w-full flex flex-col gap-2">
              <div className="flex font-semibold text-orange-200 border-b border-orange-700 pb-1 mb-2">
                <span className="flex-1">Player</span>
                <span className="w-24 text-center">Rounds Won</span>
                <span className="flex-1 text-right">Cards Played</span>
              </div>
              {Object.entries(gameResults.results || {}).map(([userId, cards]: any) => {
                const user = users.find(u => u.id === userId);
                const name = user ? user.name : userId;
                const roundsWon = (gameResults.roundsWon && gameResults.roundsWon[userId]) || 0;
                return (
                  <div key={userId} className="flex items-center text-orange-100 border-b border-orange-800 last:border-b-0 py-1">
                    <span className="flex-1 font-bold text-orange-300">{name}</span>
                    <span className="w-24 text-center font-mono">{roundsWon}</span>
                    <span className="flex-1 text-right text-xs max-w-[12rem] truncate">{Array.isArray(cards) ? cards.join(", ") : ''}</span>
                  </div>
                );
              })}
            </div>
            <button
              className="mt-4 px-6 py-2 rounded bg-orange-700 text-white font-semibold hover:bg-orange-800 cursor-pointer"
              onClick={() => setShowGameResults(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
