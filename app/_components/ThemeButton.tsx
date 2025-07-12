interface Props {
    setDarkMode: (darkMode: boolean) => void;
    darkMode: boolean;
}
export function ThemeButton({ darkMode, setDarkMode }: Props) {

    return (
        <button
            className={`z-10 px-4 py-2 rounded-full font-semibold border-2 transition-colors duration-200 cursor-pointer ${darkMode ? 'bg-orange-700 text-white border-orange-400 hover:bg-orange-800' : 'bg-white text-orange-700 border-orange-400 hover:bg-orange-100'} cursor-pointer`}
            onClick={() => setDarkMode(d => !d)}
            aria-label="Toggle dark mode"
        >
            {darkMode ? '☀️ Light' : '🌙 Dark' }
        </button>
    );
}