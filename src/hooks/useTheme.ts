import { useState, useEffect } from 'react';

export type Theme = 'dark' | 'light';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    localStorage.setItem('7notpad_theme', 'dark');
    return 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('dark');
    root.classList.remove('light');
    localStorage.setItem('7notpad_theme', 'dark');
  }, [theme]);

  const toggleTheme = () => {
    setTheme('dark');
  };

  return { theme: 'dark' as Theme, setTheme, toggleTheme, isDark: true };
}

