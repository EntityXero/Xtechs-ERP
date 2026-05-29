import { ValidationError } from './errors.js';

export interface PriceLineInput {
  itemId: string;
  qty: number;
  rate: number;
  discountPercentage?: number;
}

export interface CalculatedPriceLine {
  itemId: string;
  qty: number;
  rate: number;
  discountPercentage: number;
  amount: number; // calculated as (qty * rate) * (1 - discountPercentage/100)
}

export class PricingService {
  /**
   * Calculates net amounts per line validating inputs.
   */
  public static calculatePrice(lines: PriceLineInput[]): CalculatedPriceLine[] {
    return lines.map((line) => {
      const discountPercentage = line.discountPercentage ?? 0;
      
      if (line.qty <= 0) {
        throw new ValidationError('Quantity must be greater than zero');
      }
      
      if (line.rate < 0) {
        throw new ValidationError('Rate cannot be negative');
      }
      
      if (discountPercentage < 0 || discountPercentage > 100) {
        throw new ValidationError('Discount percentage must be between 0 and 100');
      }

      const baseVal = line.qty * line.rate;
      const discountVal = baseVal * (discountPercentage / 100);
      const amount = baseVal - discountVal;

      return {
        itemId: line.itemId,
        qty: line.qty,
        rate: line.rate,
        discountPercentage,
        amount: parseFloat(amount.toFixed(4)),
      };
    });
  }

  /**
   * Rolls up sum of calculated lines into a single total value.
   */
  public static calculateTotalAmount(lines: CalculatedPriceLine[]): number {
    const total = lines.reduce((sum, line) => sum + line.amount, 0);
    return parseFloat(total.toFixed(4));
  }
}
