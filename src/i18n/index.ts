/**
 * @file i18n/index.ts
 * @description Initialises i18next for multilingual support (ES / EN).
 *   Spanish is the default language. Language preference is persisted
 *   in localStorage and auto-detected on first visit.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import es from './locales/es';
import en from './locales/en';

i18n
  .use(LanguageDetector)     // Auto-detect from localStorage or browser settings
  .use(initReactI18next)     // Bind to React via useTranslation()
  .init({
    resources: { es, en },
    lng: 'es',               // Default language
    fallbackLng: 'es',       // Fallback when a key is missing
    interpolation: {
      escapeValue: false,    // React already escapes by default
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

export default i18n;
