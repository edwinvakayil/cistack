import 'server-only'

const dictionaries = {
  en: () => import('../dictionaries/en.json').then((module) => module.default),
  fr: () => import('../dictionaries/fr.json').then((module) => module.default),
  es: () => import('../dictionaries/es.json').then((module) => module.default),
  pt: () => import('../dictionaries/pt.json').then((module) => module.default),
  br: () => import('../dictionaries/br.json').then((module) => module.default),
  de: () => import('../dictionaries/de.json').then((module) => module.default),
  cn: () => import('../dictionaries/cn.json').then((module) => module.default),
} as const;

export type Locale = keyof typeof dictionaries;

export const hasLocale = (locale: string): locale is Locale =>
  locale in dictionaries

export const getDictionary = async (locale: Locale) => dictionaries[locale]()
