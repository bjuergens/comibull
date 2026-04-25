import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { readUserSettings, writeUserSettings } from './user-settings';
import type { UserSettings } from './shared-types';

interface SettingsContextValue {
  settings: UserSettings;
  setSetting: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<UserSettings>(() => readUserSettings());

  const setSetting = useCallback(<K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      writeUserSettings(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ settings, setSetting }), [settings, setSetting]);
  return <SettingsContext value={value}>{children}</SettingsContext>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
