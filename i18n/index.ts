import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import vi from './locales/vi.json';

export type Language = 'vi' | 'en';

const STORAGE_KEY = 'spotway.language';

i18n.use(initReactI18next).init({
  resources: { vi: { translation: vi }, en: { translation: en } },
  lng: 'vi',
  fallbackLng: 'vi',
  interpolation: { escapeValue: false },
});

// Restore the language the user picked last time (overrides the device locale).
AsyncStorage.getItem(STORAGE_KEY)
  .then((saved) => {
    if (saved === 'vi' || saved === 'en') i18n.changeLanguage(saved);
  })
  .catch(() => {});

export function setLanguage(lang: Language) {
  AsyncStorage.setItem(STORAGE_KEY, lang).catch(() => {});
  return i18n.changeLanguage(lang);
}

export default i18n;
