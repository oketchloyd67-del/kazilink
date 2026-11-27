import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const PrefsContext = createContext(null);
const STORAGE_KEY = 'kazilink:prefs';
const DEFAULTS = { largeText: false, reducedMotion: false, theme: 'light' };

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export const usePrefs = () => useContext(PrefsContext) || { ...DEFAULTS, toggle: () => {} };

export function PrefsProvider({ children }) {
  const [prefs, setPrefs] = useState(load);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.text = prefs.largeText ? 'large' : 'normal';
    root.dataset.motion = prefs.reducedMotion ? 'reduced' : 'full';
    root.dataset.theme = prefs.theme === 'dark' ? 'dark' : 'light';
    root.style.colorScheme = prefs.theme === 'dark' ? 'dark' : 'light';
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute('content', prefs.theme === 'dark' ? '#100c1d' : '#5b3df5');
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {}
  }, [prefs]);

  const toggle = useCallback((key) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const setTheme = useCallback((theme) => {
    setPrefs((prev) => ({ ...prev, theme: theme === 'dark' ? 'dark' : 'light' }));
  }, []);

  const value = useMemo(() => ({ ...prefs, toggle, setTheme }), [prefs, toggle, setTheme]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}
