'use client'
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { getCookie } from '@/utils';
import { ThemeButton } from './_components/ThemeButton';

// Modern form status hook
function useFormStatus() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  return {
    isSubmitting,
    start: () => setIsSubmitting(true),
    stop: () => setIsSubmitting(false),
  };
}

export default function Home() {
  const [name, setName] = useState('');
  const [gameId, setGameId] = useState('');
  const [showNewGame, setShowNewGame] = useState(false);
  const [generatedId, setGeneratedId] = useState('');
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      // Try to get theme from cookie first
      const match = getCookie('cardsTheme');
      if (match) return match[1] === 'dark';
    }
    return true;
  });
  const socketRef = useRef<Socket | null>(null);
  const router = useRouter();
  const formStatus = useFormStatus();

  // Connect socket only once
  if (!socketRef.current && typeof window !== 'undefined') {
    socketRef.current = io();
  }

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    formStatus.start();
    if (!name || !gameId) {
      formStatus.stop();
      return;
    }
    // Emit joinRoom event
    // socketRef.current?.emit('joinRoom', gameId);
    // Optionally, listen for confirmation or errors
    // Set cookie for player name (for middleware)
    document.cookie = `cardsPlayerName=${encodeURIComponent(name)}; path=/`;
    // Redirect to game page
    router.push(`/game/${gameId}`);
    formStatus.stop();
  };

  const handleNewGame = () => {
    setShowNewGame(true);
    setGeneratedId('');
    setGameId('');
  };

  const generateGameId = () => {
    // Simple random ID generator
    const id = Math.random().toString(36).substring(2, 10).toUpperCase();
    setGeneratedId(id);
    setGameId(id);
  };

  return (
    <div className={`flex flex-col items-center justify-center min-h-screen transition-colors duration-300 ${darkMode ? 'bg-gradient-to-br from-black to-orange-900' : 'bg-gradient-to-br from-amber-100 to-orange-200' } p-8`}>
      <div className='absolute top-4 right-4'>
      <ThemeButton darkMode={darkMode} setDarkMode={setDarkMode} />
      </div>
      <div className={`rounded-xl shadow-xl p-8 w-full max-w-md transition-colors duration-300 ${darkMode ? 'bg-black/90' : 'bg-white/90'}`}>
        <h1 className={`text-3xl font-bold mb-6 text-center ${darkMode ? 'text-orange-400' : 'text-amber-800'}`}>Join a Card Game</h1>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className={`font-semibold ${darkMode ? 'text-orange-200' : 'text-amber-900'}`}>Name
            <input
              className={`mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 ${darkMode ? 'border-orange-400 bg-black text-orange-100 focus:ring-orange-500' : 'border-amber-300 bg-white text-black focus:ring-amber-500'}`}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Enter your name"
              required
            />
          </label>
          <label className={`font-semibold ${darkMode ? 'text-orange-200' : 'text-amber-900'}`}>Game ID
            <input
              className={`mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 ${darkMode ? 'border-orange-400 bg-black text-orange-100 focus:ring-orange-500' : 'border-amber-300 bg-white text-black focus:ring-amber-500'}`}
              type="text"
              value={gameId}
              onChange={e => setGameId(e.target.value)}
              placeholder="Enter game ID"
              required
              disabled={!!generatedId}
            />
          </label>
          {showNewGame && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className={`rounded px-3 py-2 transition cursor-pointer ${darkMode ? 'bg-orange-600 text-white hover:bg-orange-700' : 'bg-amber-600 text-white hover:bg-amber-700'}`}
                onClick={generateGameId}
              >
                Generate New Game ID
              </button>
              {generatedId && (
                <div className={`font-mono text-center ${darkMode ? 'text-green-400' : 'text-green-700'}`}>New Game ID: <span className="font-bold">{generatedId}</span></div>
              )}
            </div>
          )}
          <button
            type="submit"
            className={`rounded px-4 py-2 font-semibold transition disabled:opacity-60 cursor-pointer ${darkMode ? 'bg-orange-700 text-white hover:bg-orange-800' : 'bg-amber-700 text-white hover:bg-amber-800'}`}
            disabled={formStatus.isSubmitting}
          >
            {formStatus.isSubmitting ? 'Joining...' : 'Join Game'}
          </button>
        </form>
        <div className="mt-6 flex flex-col items-center gap-2">
          <span className={darkMode ? 'text-orange-200' : 'text-amber-900'}>or</span>
          <button
            className={`rounded px-4 py-2 font-semibold border transition cursor-pointer ${darkMode ? 'bg-black border-orange-400 text-orange-400 hover:bg-orange-900' : 'bg-white border-amber-400 text-amber-700 hover:bg-amber-100'}`}
            onClick={handleNewGame}
          >
            Start New Game
          </button>
        </div>
      </div>
    </div>
  );
}
