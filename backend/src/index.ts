import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import mongoose from 'mongoose';
import { TransactionModel } from './models/Transaction';
import { parseTranscriptWithGroq } from './services/parseTranscript';
import { TransactionPayload } from './types';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const port = Number(process.env.PORT || 4000);
const mongoUri = process.env.MONGODB_URI;

if (mongoUri) {
  mongoose
    .connect(mongoUri)
    .then(() => {
      console.log('MongoDB connected');
    })
    .catch((error) => {
      console.error('MongoDB connection failed:', error);
    });
} else {
  console.warn('MONGODB_URI not set. Sync will run without persistence.');
}

app.get('/health', (_request, response) => {
  response.json({
    ok: true,
    mongoConnected: mongoose.connection.readyState === 1,
    date: new Date().toISOString(),
  });
});

app.post('/sync', async (request, response) => {
  const transactions = (request.body?.transactions ?? []) as TransactionPayload[];

  if (!Array.isArray(transactions)) {
    response.status(400).json({ error: 'transactions must be an array' });
    return;
  }

  console.log('[Sync] Received sync request. Count:', transactions.length);
  console.log('[Sync] Mongoose connection state:', mongoose.connection.readyState);

  if (mongoose.connection.readyState !== 1) {
    console.error('[Sync] ERROR: MongoDB is not connected! State:', mongoose.connection.readyState);
    response.json({
      syncedLocalIds: [],
      failedLocalIds: transactions.map((transaction) => transaction.localId),
      error: 'Database not connected'
    });
    return;
  }

  const operations = transactions.map((transaction) => ({
    updateOne: {
      filter: { localId: transaction.localId },
      update: {
        $set: {
          localId: transaction.localId,
          name: transaction.name,
          amount: transaction.amount,
          type: (transaction.type.toUpperCase().includes('DEBIT') ? 'DEBIT' : 'CREDIT') as 'CREDIT' | 'DEBIT',
          reason: transaction.reason,
          isSynced: true,
          createdAt: new Date(transaction.createdAt),
        },
      },
      upsert: true,
    },
  }));

  try {
    if (operations.length > 0) {
      await TransactionModel.bulkWrite(operations);
    }

    response.json({
      syncedLocalIds: transactions.map((transaction) => transaction.localId),
      failedLocalIds: [],
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown sync error';
    console.error('[Sync] Bulk write FAILED:', errorMessage);
    response.status(500).json({
      syncedLocalIds: [],
      failedLocalIds: transactions.map((transaction) => transaction.localId),
      error: errorMessage,
    });
  }
});

app.post('/process-ai', async (request, response) => {
  const transcript = String(request.body?.transcript ?? '').trim();
  console.log('AI Processing:', transcript);

  if (!transcript) {
    response.status(400).json({ error: 'transcript is required' });
    return;
  }

  try {
    const transaction = await parseTranscriptWithGroq(transcript);
    console.log('AI Result:', transaction);
    response.json(transaction);
  } catch (error) {
    console.error('AI Error:', error);
    response.status(500).json({
      error: error instanceof Error ? error.message : 'AI processing failed',
    });
  }
});

app.get('/transactions', async (req, res) => {
  try {
    const transactions = await TransactionModel.find().sort({ createdAt: -1 });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

app.delete('/transaction/:localId', async (req, res) => {
  const { localId } = req.params;
  console.log('[Delete] Deleting transaction:', localId);

  if (!localId) {
    res.status(400).json({ error: 'localId is required' });
    return;
  }

  if (mongoose.connection.readyState !== 1) {
    console.warn('[Delete] MongoDB not connected, skipping cloud delete');
    res.json({ deleted: false, reason: 'Database not connected' });
    return;
  }

  try {
    const result = await TransactionModel.deleteOne({ localId });
    console.log('[Delete] Result:', result);
    res.json({ deleted: result.deletedCount > 0, localId });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Delete] Failed:', errorMessage);
    res.status(500).json({ error: errorMessage });
  }
});

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
