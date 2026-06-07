/**
 * @file i18n/index.ts
 * @description Initialises i18next for the app. The app is Spanish-only
 *   (there are no English-speaking users), so there is a single locale and
 *   no language detection or switching. The t() helper is kept purely so the
 *   existing translation keys resolve to their Spanish strings.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import es from './locales/es';

i18n
  .use(initReactI18next)
  .init({
    resources: { es },
    lng: 'es',
    fallbackLng: 'es',
    interpolation: {
      escapeValue: false, // React already escapes by default
    },
  });

export default i18n;
