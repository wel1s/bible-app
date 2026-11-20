/** Texte d'un verset tel qu'il doit être lu à voix haute (sans les « -Pause. » des Psaumes). */
export function speechText(text) {
  return text
    .replace(/\s*-?Pause\.?\s*$/i, '')
    .replace(/\s-Pause\.\s/gi, ' ')
    .trim();
}
