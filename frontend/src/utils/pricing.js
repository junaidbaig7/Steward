/** Display-only estimate. The Order Service recomputes the real bill from the database. */
export const TAX_RATE = 0.05 // GST on restaurant food

export function estimateBill(subtotal, deliveryFee = 0) {
  const round = (n) => Math.round(n * 100) / 100
  const tax = round(subtotal * TAX_RATE)
  const fee = subtotal > 0 ? Number(deliveryFee) : 0
  return { subtotal: round(subtotal), deliveryFee: fee, tax, total: round(subtotal + fee + tax) }
}
