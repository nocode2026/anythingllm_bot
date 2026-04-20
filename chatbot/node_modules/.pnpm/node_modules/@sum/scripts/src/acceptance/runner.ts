/**
 * Acceptance test runner
 * Calls the running API server and checks responses against scenarios.
 *
 * Usage:
 *   ACCEPTANCE_API_URL=http://localhost:3001 pnpm --filter @sum/scripts test:acceptance
 */

import { scenarios, type AcceptanceScenario } from './scenarios';

const API_URL = process.env.ACCEPTANCE_API_URL ?? 'http://localhost:3001';

interface ApiResponse {
  session_id: string;
  answer: string;
  response_type: 'answer' | 'fallback' | 'clarification' | 'refusal';
  retrieval_confidence: number;
  final_answer_confidence: number;
  sources: { title: string; url: string }[];
  scope: 'general' | 'faculty';
  faculty_id: string | null;
}

interface Result {
  id: string;
  passed: boolean;
  description: string;
  failures: string[];
  response?: Partial<ApiResponse>;
}

async function runScenario(s: AcceptanceScenario): Promise<Result> {
  const failures: string[] = [];
  let response: Partial<ApiResponse> | undefined;

  try {
    const body: Record<string, unknown> = { message: s.input };
    if (s.session_faculty) body.faculty_override = s.session_faculty;

    const res = await fetch(`${API_URL}/api/chat/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      failures.push(`HTTP ${res.status}`);
      return { id: s.id, passed: false, description: s.description, failures };
    }

    response = (await res.json()) as ApiResponse;

    // ── check scope ────────────────────────────────────────────────────────
    if (response.scope !== s.expected_scope) {
      failures.push(
        `scope: expected "${s.expected_scope}", got "${response.scope}"`
      );
    }

    // ── check faculty_id ──────────────────────────────────────────────────
    const gotFaculty = response.faculty_id ?? null;
    if (gotFaculty !== s.expected_faculty_id) {
      failures.push(
        `faculty_id: expected "${s.expected_faculty_id}", got "${gotFaculty}"`
      );
    }

    // ── check behavior ────────────────────────────────────────────────────
    if (response.response_type !== s.expected_behavior) {
      failures.push(
        `response_type: expected "${s.expected_behavior}", got "${response.response_type}"`
      );
    }

    // ── check confidence range ────────────────────────────────────────────
    const conf = response.final_answer_confidence ?? response.retrieval_confidence ?? 0;
    const [minC, maxC] = s.expected_confidence_range;
    if (conf < minC || conf > maxC) {
      failures.push(
        `confidence ${conf.toFixed(2)} out of expected [${minC}, ${maxC}]`
      );
    }
  } catch (err) {
    failures.push(`Fetch error: ${String(err)}`);
  }

  return {
    id: s.id,
    passed: failures.length === 0,
    description: s.description,
    failures,
    response,
  };
}

async function main(): Promise<void> {
  console.log(`\n🔬 SUM Chatbot — Acceptance Tests (${API_URL})\n`);
  console.log(`Running ${scenarios.length} scenarios...\n`);

  const results: Result[] = [];

  for (const scenario of scenarios) {
    process.stdout.write(`  [${scenario.id}] ${scenario.description.substring(0, 60)}...`);
    const result = await runScenario(scenario);
    results.push(result);
    console.log(result.passed ? ' ✅' : ' ❌');
    if (!result.passed) {
      for (const failure of result.failures) {
        console.log(`         ↳ ${failure}`);
      }
    }
    // small delay to avoid overwhelming the server
    await new Promise((r) => setTimeout(r, 200));
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log('\n────────────────────────────────────────────────────────');
  console.log(`Results: ${passed}/${scenarios.length} passed, ${failed} failed`);

  if (failed > 0) {
    console.log('\nFailed scenarios:');
    for (const r of results.filter((x) => !x.passed)) {
      console.log(`  ❌ [${r.id}] ${r.description}`);
      for (const f of r.failures) console.log(`       • ${f}`);
    }
    process.exit(1);
  } else {
    console.log('\nAll scenarios passed. ✅');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Runner crashed:', err);
  process.exit(1);
});
