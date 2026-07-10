/**
 * GRIDD Bites — illustrative pricing (tune in product).
 * Restaurant 15% commission, DoorDash Drive wholesale, customer service + delivery fees.
 */

export type BitePriceInputs = {
  subtotal: number; // USD
  deliveryFee: number; // GRIDD → customer
  serviceFeeRate: number; // 0.10 = 10% of subtotal
  restaurantCommissionRate: number; // 0.15
  doordashWholesaleEstimate: number; // flat per order for planning
  tip: number; // to Dasher
};

export function estimateSubtotalCents(subtotal: number) {
  return Math.round(subtotal * 100);
}

export function estimateOrderEconomics(
  subtotal: number,
  deliveryFee: number = 3.99,
  serviceFeeRate: number = 0.1,
  restaurantCommissionRate: number = 0.15,
  doordashWholesaleEstimate: number = 8,
  tip: number = 0,
) {
  const sub = subtotal;
  const serviceFee = sub * serviceFeeRate;
  const restaurantComm = sub * restaurantCommissionRate;
  const customerPays = sub + deliveryFee + serviceFee + tip;
  const griddGross = restaurantComm + serviceFee + deliveryFee;
  const griddNet = griddGross - doordashWholesaleEstimate;

  return {
    subtotal: sub,
    deliveryFee,
    serviceFee,
    restaurantCommission: restaurantComm,
    tip,
    customerPays,
    doordashWholesaleEstimate,
    griddNetPerOrder: griddNet,
  };
}

/** Example: $30 sub, $3.99 delivery, 10% service, 15% res comm, -$8 DD */
export function example30DollarOrder() {
  return estimateOrderEconomics(30, 3.99, 0.1, 0.15, 8, 2);
}
