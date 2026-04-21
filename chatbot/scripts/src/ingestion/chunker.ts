export interface Chunk {
  text: string;
  chunk_index: number;
  token_count: number;
}

const CHUNK_TARGET_TOKENS = 500;
const CHUNK_OVERLAP_TOKENS = 50;
// Rough approximation: 1 token ≈ 4 chars for Polish text
const CHARS_PER_TOKEN = 4;

const TARGET_CHARS = CHUNK_TARGET_TOKENS * CHARS_PER_TOKEN;   // 2000
const OVERLAP_CHARS = CHUNK_OVERLAP_TOKENS * CHARS_PER_TOKEN; // 200

export function chunkText(text: string): Chunk[] {
  if (!text || text.length < 30) return [];

  const chunks: Chunk[] = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    let end = start + TARGET_CHARS;

    if (end < text.length) {
      // Try to break at sentence boundary
      const periodIdx = text.lastIndexOf('.', end);
      const nlIdx = text.lastIndexOf('\n', end);
      const breakAt = Math.max(periodIdx, nlIdx);
      if (breakAt > start + TARGET_CHARS / 2) {
        end = breakAt + 1;
      }
    } else {
      end = text.length;
    }

    const chunk = text.slice(start, end).trim();
    if (chunk.length > 30) {
      chunks.push({
        text: chunk,
        chunk_index: index++,
        token_count: Math.ceil(chunk.length / CHARS_PER_TOKEN),
      });
    }

    start = Math.max(start + 1, end - OVERLAP_CHARS);
    if (start >= text.length) break;
  }

  return chunks;
}
