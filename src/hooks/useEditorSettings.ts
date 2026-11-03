import { useState, useEffect } from 'react';
import type { EditorSettings } from '../types/note';

const SETTINGS_KEY = '7notpad_editor_settings';

const defaultSettings: EditorSettings = {
  fontFamily: 'sans',
  fontSize: 'base',
  editorWidth: 'normal',
  lineSpacing: 'normal'
};

export function useEditorSettings() {
  const [settings, setSettings] = useState<EditorSettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
    } catch {
      return defaultSettings;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (err) {
      console.error('Failed to save editor settings:', err);
    }
  }, [settings]);

  const updateSettings = (updates: Partial<EditorSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  };

  return { settings, updateSettings, defaultSettings };
}
