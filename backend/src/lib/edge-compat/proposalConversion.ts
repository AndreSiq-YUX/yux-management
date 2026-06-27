export function selectConversionPreset<T>(blueprintPhases: T[], packagePhases: T[]) {
  return blueprintPhases.length ? blueprintPhases : packagePhases
}
