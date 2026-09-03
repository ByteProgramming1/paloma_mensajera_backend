// Normaliza tildes y mayusculas para que el filtro de palabras no dependa de la
// forma exacta en que el comprador escribio el texto.
const COMBINING_DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g');

export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(COMBINING_DIACRITICS, '').toLowerCase();
}
