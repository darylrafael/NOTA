import { ReviewReason } from '../types/receipt';
import { TOTAL_MATCH_TOLERANCE } from './receiptMath';

export interface ReviewQueueRow {
  merchant_name: string | null;
  total_amount: number;
  items_sum: number;
  tax: number;
  service_charge: number;
  discount: number;
  unassigned_items_count: number;
  duplicate_count: number;
}

export function evaluateReviewReasons(row: ReviewQueueRow): ReviewReason[] {
  const reasons: ReviewReason[] = [];
  
  if (!row.merchant_name || row.merchant_name.trim() === '') {
    reasons.push('missing_merchant');
  }
  
  if (row.unassigned_items_count > 0) {
    reasons.push('missing_category');
  }
  
  if (row.duplicate_count > 1) {
    reasons.push('potential_duplicate');
  }
  
  const calculated = row.items_sum + row.tax + row.service_charge - row.discount;
  if (Math.abs(calculated - row.total_amount) > TOTAL_MATCH_TOLERANCE) {
    reasons.push('math_mismatch');
  }
  
  return reasons;
}
