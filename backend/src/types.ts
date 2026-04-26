export interface TransactionPayload {
  localId: string;
  name: string;
  amount: number;
  type: 'CREDIT' | 'DEBIT';
  reason: string;
  isSynced: boolean;
  createdAt: number;
}

export interface ParsedTransactionPayload {
  name: string;
  amount: number;
  type: 'CREDIT' | 'DEBIT';
  reason: string;
}
