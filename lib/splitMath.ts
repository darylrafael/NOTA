import { roundRupiah } from './money';
import { ReceiptDetail } from '../db/queries';

export interface SplitParticipant {
  id: string;
  name: string;
}

export interface SplitResult {
  participantId: string;
  name: string;
  items: {
    itemId: string;
    name: string;
    shareNumerator: number;
    shareDenominator: number;
    allocatedAmount: number;
  }[];
  subtotal: number;
  tax: number;
  serviceCharge: number;
  discount: number;
  grandTotal: number;
}

export interface SplitSummary {
  participants: SplitResult[];
  unassignedItemsCount: number;
  totalReconciled: boolean;
  totalCalculated: number;
}

export function calculateSplitBill(
  receipt: ReceiptDetail,
  participants: SplitParticipant[],
  assignments: Record<string, string[]>
): SplitSummary {
  const resultsMap = new Map<string, SplitResult>();
  for (const p of participants) {
    resultsMap.set(p.id, {
      participantId: p.id,
      name: p.name,
      items: [],
      subtotal: 0,
      tax: 0,
      serviceCharge: 0,
      discount: 0,
      grandTotal: 0,
    });
  }

  let unassignedItemsCount = 0;

  for (const item of receipt.items) {
    const assignedIds = assignments[item.id] || [];
    const validAssignedIds = assignedIds.filter(id => resultsMap.has(id));

    if (validAssignedIds.length === 0) {
      unassignedItemsCount++;
      continue;
    }

    const denominator = validAssignedIds.length;
    const itemTotal = roundRupiah(item.lineTotal);
    
    let allocatedSoFar = 0;
    
    validAssignedIds.forEach((pid, index) => {
      const isLast = index === validAssignedIds.length - 1;
      const shareAmount = isLast ? (itemTotal - allocatedSoFar) : roundRupiah(itemTotal / denominator);
      allocatedSoFar += shareAmount;

      const pResult = resultsMap.get(pid)!;
      pResult.items.push({
        itemId: item.id,
        name: item.name,
        shareNumerator: 1,
        shareDenominator: denominator,
        allocatedAmount: shareAmount,
      });
      pResult.subtotal += shareAmount;
    });
  }

  const totalSubtotal = Array.from(resultsMap.values()).reduce((sum, p) => sum + p.subtotal, 0);

  const distributeProportionally = (totalAdjustment: number, field: 'tax' | 'serviceCharge' | 'discount') => {
    if (totalAdjustment === 0) return;
    
    let adjustmentAllocatedSoFar = 0;
    const activeParticipants = Array.from(resultsMap.values()).filter(p => p.subtotal > 0);
    const targets = activeParticipants.length > 0 ? activeParticipants : Array.from(resultsMap.values());
    
    targets.forEach((p, index) => {
      const isLast = index === targets.length - 1;
      
      let share = 0;
      if (isLast) {
        share = totalAdjustment - adjustmentAllocatedSoFar;
      } else {
        if (totalSubtotal > 0) {
          share = roundRupiah((p.subtotal / totalSubtotal) * totalAdjustment);
        } else {
          share = roundRupiah(totalAdjustment / targets.length);
        }
      }
      
      adjustmentAllocatedSoFar += share;
      p[field] = share;
    });
  };

  distributeProportionally(roundRupiah(receipt.tax), 'tax');
  distributeProportionally(roundRupiah(receipt.serviceCharge), 'serviceCharge');
  distributeProportionally(roundRupiah(receipt.discount), 'discount');

  let totalCalculated = 0;
  for (const p of resultsMap.values()) {
    p.grandTotal = p.subtotal + p.tax + p.serviceCharge - p.discount;
    totalCalculated += p.grandTotal;
  }

  const expectedReceiptTotal = roundRupiah(receipt.totalAmount);
  const totalReconciled = unassignedItemsCount === 0 && totalCalculated === expectedReceiptTotal;

  return {
    participants: Array.from(resultsMap.values()),
    unassignedItemsCount,
    totalReconciled,
    totalCalculated,
  };
}
