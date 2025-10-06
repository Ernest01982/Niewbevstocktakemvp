export function unitsSingles(units: number | null = 0, cases: number | null = 0, upc?: number) {
  const singles = typeof units === 'number' ? units : Number(units ?? 0);
  const caseQty = typeof cases === 'number' ? cases : Number(cases ?? 0);
  return singles + (upc ? caseQty * upc : 0);
}

export function unitsPickface(
  layers: number | null = 0,
  cases: number | null = 0,
  upc?: number,
  cpl?: number
) {
  const layerQty = typeof layers === 'number' ? layers : Number(layers ?? 0);
  const caseQty = typeof cases === 'number' ? cases : Number(cases ?? 0);
  const layerUnits = upc && cpl ? layerQty * upc * cpl : 0;
  const caseUnits = upc ? caseQty * upc : 0;
  return layerUnits + caseUnits;
}

export function unitsBulk(
  pallets: number | null = 0,
  layers: number | null = 0,
  cases: number | null = 0,
  upc?: number,
  cpl?: number,
  lpp?: number
) {
  const palletQty = typeof pallets === 'number' ? pallets : Number(pallets ?? 0);
  const layerQty = typeof layers === 'number' ? layers : Number(layers ?? 0);
  const caseQty = typeof cases === 'number' ? cases : Number(cases ?? 0);
  const palletUnits = upc && cpl && lpp ? palletQty * upc * cpl * lpp : 0;
  const layerUnits = upc && cpl ? layerQty * upc * cpl : 0;
  const caseUnits = upc ? caseQty * upc : 0;
  return palletUnits + layerUnits + caseUnits;
}
