import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small';
const BATCH_SIZE = 20;
const RETRY_DELAYS = [1000, 2000, 4000];

export async function embedBatch(texts: string[]): Promise<number[][]> {
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const res = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: texts.map(t => t.slice(0, 8000)),
      });
      return res.data.map(d => d.embedding);
    } catch (err) {
      if (attempt < RETRY_DELAYS.length) {
        console.warn(`[Embedder] Retrying batch (attempt ${attempt + 1})...`);
        await sleep(RETRY_DELAYS[attempt]);
      } else {
        throw err;
      }
    }
  }
  throw new Error('Embedding failed after retries');
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    console.log(`[Embedder] Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(texts.length / BATCH_SIZE)}`);
    const embeddings = await embedBatch(batch);
    results.push(...embeddings);
    
    // Rate limit buffer
    if (i + BATCH_SIZE < texts.length) {
      await sleep(200);
    }
  }
  
  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
