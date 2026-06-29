import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { NativeModules, Platform } from 'react-native'
import en from './en.json'
import ko from './ko.json'

// 네이티브 locale 감지 (expo-localization 네이티브 모듈 불필요)
const deviceLocale: string =
  Platform.OS === 'ios'
    ? NativeModules.SettingsManager?.settings?.AppleLocale ??
      NativeModules.SettingsManager?.settings?.AppleLanguages?.[0] ??
      'en'
    : NativeModules.I18nManager?.localeIdentifier ?? 'en'

const deviceLang = deviceLocale.startsWith('ko') ? 'ko' : 'en'

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ko: { translation: ko },
  },
  lng: deviceLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export function setLanguage(lang: 'ko' | 'en') {
  void i18n.changeLanguage(lang)
}

export default i18n
