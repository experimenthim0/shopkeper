import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    localId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    amount: { type: Number, required: true },
    type: {
      type: String,
      required: true,
      enum: ['CREDIT', 'DEBIT'],
    },
    reason: { type: String, default: '' },
    isSynced: { type: Boolean, default: true },
    createdAt: { type: Date, required: true },
  },
  {
    versionKey: false,
  },
);

export const TransactionModel = mongoose.model('Transaction', transactionSchema);
