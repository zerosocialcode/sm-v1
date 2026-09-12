import React, { useEffect, useState, useRef } from 'react';

interface HeaderProps {
  onThemeToggleFlood?: (coords: { x: number; y: number }, nextTheme: 'day' | 'night') => void;
}

export const Header: React.FC<HeaderProps> = ({
  onThemeToggleFlood,
}) => {
  const [theme, setTheme] = useState<'day' | 'night'>('day');
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const savedTheme = (localStorage.getItem('workshop-theme') as 'day' | 'night') || 'day';
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  const handleToggle = () => {
    const nextTheme = theme === 'day' ? 'night' : 'day';
    if (toggleRef.current && onThemeToggleFlood) {
      const rect = toggleRef.current.getBoundingClientRect();
      const coords = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      onThemeToggleFlood(coords, nextTheme);
    } else {
      document.documentElement.setAttribute('data-theme', nextTheme);
      localStorage.setItem('workshop-theme', nextTheme);
    }
    setTheme(nextTheme);
  };

  return (
    <header className="border-b-2 border-[var(--ink)] bg-[var(--bg)] px-4 lg:px-8 py-3.5 transition-colors duration-400">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="pulse-dot" />
          <h1 className="spec-heading text-3xl sm:text-4xl text-[var(--ink)] m-0 leading-none tracking-tight font-extrabold">
            SPECTREMIRROR
          </h1>
        </div>

        <div className="flex items-center gap-4 sm:gap-6 self-end sm:self-auto">
          <div className="flex flex-col items-center select-none">
            <span className="spec-eyebrow text-[9px] mb-1 tracking-wider">LIGHTS</span>
            <button
              ref={toggleRef}
              id="themeToggle"
              type="button"
              onClick={handleToggle}
              aria-label={`Toggle lighting condition (current: ${theme})`}
              title={`Switch workshop lighting to ${theme === 'day' ? 'Night (Cyanotype Blueprint)' : 'Day (Drafting Paper)'}`}
            >
              <div className="rocker" />
            </button>
            <span className="spec-mono text-[10px] uppercase font-semibold text-[var(--ink-soft)] mt-1 tracking-wider">
              {theme === 'day' ? 'Day' : 'Night'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
