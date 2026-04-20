/** IKnowledgeSource — abstraction for future FAQ/QA API connectors */
export interface SourceRecord {
  source_url: string;
  title: string;
  content_html: string;
  published_at?: string | null;
  metadata?: Record<string, unknown>;
}

export interface IKnowledgeSource {
  readonly name: string;
  readonly disabled: boolean;
  fetchAll(): Promise<SourceRecord[]>;
}

// ── Connector Registry ────────────────────────────────────────────────────────
// FaqApiSource — stub for future FAQ/QA API (DISABLED in MVP)
class FaqApiSource implements IKnowledgeSource {
  readonly name = 'faq_api';
  readonly disabled = true;

  async fetchAll(): Promise<SourceRecord[]> {
    throw new Error('FaqApiSource is disabled in MVP');
  }
}

export const CONNECTORS: IKnowledgeSource[] = [
  // Active connectors are added from run.ts
  // Disabled stubs listed here for architecture completeness:
  new FaqApiSource(),
];

export function getActiveConnectors(): IKnowledgeSource[] {
  return CONNECTORS.filter(c => !c.disabled);
}
