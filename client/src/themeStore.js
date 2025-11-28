import { create } from 'zustand';

// Get initial theme from localStorage or default to 'dark'
const getInitialTheme = () => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
  }
  return 'dark';
};

// Apply theme to document
const applyTheme = (theme) => {
  if (theme === 'light') {
    document.documentElement.classList.add('light');
    document.documentElement.classList.remove('dark');
  } else {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  }
};

// Apply initial theme immediately
const initialTheme = getInitialTheme();
applyTheme(initialTheme);

export const useThemeStore = create((set, get) => ({
  theme: initialTheme,
  
  toggleTheme: () => {
    const newTheme = get().theme === 'dark' ? 'light' : 'dark';
    set({ theme: newTheme });
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
  },
  
  setTheme: (theme) => {
    set({ theme });
    localStorage.setItem('theme', theme);
    applyTheme(theme);
  }
}));
