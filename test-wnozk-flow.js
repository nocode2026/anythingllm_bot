#!/usr/bin/env node
/**
 * Test: WNoZK Harmonogram Clarification Flow
 * Validates that program clarification logic works correctly
 */

// Simulate classifyQuery logic
const FACULTIES = {
  wnozk: ['zdrowie katowice', 'wnozk', 'nauk o zdrowiu', 'zdrowiu w katowicach', 'zdrowiu katowice',
           'pielęgniarstwo katowice', 'nauk zdrowiu'],
};

const FACULTY_PROGRAMS = {
  wnozk: [
    { id: 'pielegniarstwo', name: 'Pielęgniarstwo', keywords: ['pielęgniarstwo', 'pielegniarstwo', 'pielęgniarstwa', 'pielegniarstwa'] },
    { id: 'fizjoterapia', name: 'Fizjoterapia', keywords: ['fizjoterapia', 'fizjoterapii'] },
    { id: 'poloznictwo', name: 'Położnictwo', keywords: ['położnictwo', 'poloznictwo', 'położnictwa', 'poloznictwa'] },
    { id: 'elektroradiologia', name: 'Elektroradiologia', keywords: ['elektroradiologia'] },
  ],
};

   const TOPIC_ALIASES = {
     harmonogram: ['harmonogarm', 'harmonogram', 'plan zajęć', 'plan zajec', 'rozkład', 'plan z', 'harmonogram z'],
   };

function classifyQuery(query) {
  const q = query.toLowerCase();
  
  let faculty_id = null;
  for (const [fid, keywords] of Object.entries(FACULTIES)) {
    if (keywords.some(k => q.includes(k))) {
      faculty_id = fid;
      break;
    }
  }
  
   let detected_program = null;
   // IMPORTANT: Try to detect program even if faculty not detected
   // This handles cases like "harmonogram fizjoterapii?" (program without explicit faculty mention)
   for (const [fid, programs] of Object.entries(FACULTY_PROGRAMS)) {
     for (const prog of programs) {
       if (prog.keywords.some(k => q.includes(k))) {
         detected_program = { faculty: fid, id: prog.id, name: prog.name };
         // If program is detected from a faculty but faculty wasn't explicitly mentioned, infer it
         if (!faculty_id && fid === 'wnozk') {
           faculty_id = fid;
         }
         break;
       }
     }
     if (detected_program) break;
   }
  
  const topic_tags = [];
  for (const [tag, aliases] of Object.entries(TOPIC_ALIASES)) {
    if (aliases.some(a => q.includes(a))) topic_tags.push(tag);
  }
  
  const needs_program_clarification = faculty_id === 'wnozk' && topic_tags.includes('harmonogram') && !detected_program;
  
  return {
    faculty_id,
    detected_program,
    topic_tags,
    needs_program_clarification,
  };
}

function buildResponse(classification) {
  if (classification.needs_program_clarification) {
    const programs = FACULTY_PROGRAMS['wnozk'] || [];
    const programLabels = programs.map(p => p.name);
    
    return {
      response_type: 'clarification',
      answer: 'Na Wydziale Nauk o Zdrowiu w Katowicach harmonogramy różnią się w zależności od kierunku. Który kierunek Cię interesuje?',
      clarification_question: 'Wybierz kierunek:',
      cta_buttons: programLabels,
      suggested_questions: programLabels.map(p => 'Harmonogram - ' + p),
    };
  }
  
  if (classification.detected_program) {
     const progName = typeof classification.detected_program === 'object' 
       ? classification.detected_program.name 
       : FACULTY_PROGRAMS['wnozk']?.find(p => p.id === classification.detected_program)?.name;
     return {
       response_type: 'direct_answer',
       answer: 'Harmonogram dla ' + progName + ' to: [LINK_TUTAJ]',
      clarification_question: null,
      cta_buttons: [],
      suggested_questions: [],
    };
  }
  
  return {
    response_type: 'general',
    answer: 'Harmonogram zajęć',
    clarification_question: null,
    cta_buttons: [],
    suggested_questions: [],
  };
}

// Test cases
const testCases = [
  {
    name: 'WNoZK harmonogram bez kierunku',
    input: 'Jaki jest harmonogram na WNoZK?',
    expectedType: 'clarification',
    expectedHasButtons: true,
  },
  {
    name: 'WNoZK harmonogram + pielęgniarstwo',
    input: 'Harmonogram pielęgniarstwa na zdrowiu w katowicach',
    expectedType: 'direct_answer',
    expectedHasButtons: false,
  },
  {
    name: 'WNoZK plan zajęć bez kierunku',
    input: 'Plan zajęć na wnozk',
    expectedType: 'clarification',
    expectedHasButtons: true,
  },
  {
    name: 'Fisio query',
    input: 'Harmonogram z fizjoterapii?',
    expectedType: 'direct_answer',
    expectedHasButtons: false,
  },
];

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  WNoZK Harmonogram Clarification Flow - Test Suite              ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

let passed = 0;
let failed = 0;

testCases.forEach((tc, i) => {
  const classification = classifyQuery(tc.input);
  const response = buildResponse(classification);
  
  const typeMatch = response.response_type === tc.expectedType;
  const buttonsMatch = (response.cta_buttons.length > 0) === tc.expectedHasButtons;
  const testPass = typeMatch && buttonsMatch;
  
  if (testPass) passed++;
  else failed++;
  
  console.log(`Test ${i+1}: ${tc.name}`);
  console.log(`  Input: "${tc.input}"`);
  console.log(`  Response type: ${response.response_type} (expected: ${tc.expectedType}) ${typeMatch ? '✓' : '✗'}`);
  console.log(`  Has buttons: ${response.cta_buttons.length > 0} (expected: ${tc.expectedHasButtons}) ${buttonsMatch ? '✓' : '✗'}`);
  if (response.cta_buttons.length > 0) {
    console.log(`  Buttons: ${response.cta_buttons.join(', ')}`);
  }
  console.log();
});

console.log(`\n═══════════════════════════════════════════════════════════════`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log(`✓ All tests passed! WNoZK clarification flow is working correctly.`);
} else {
  console.log(`✗ Some tests failed. Please review the logic.`);
  process.exit(1);
}
