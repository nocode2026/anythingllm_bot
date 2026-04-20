"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.moderateInput = moderateInput;
exports.moderateOutput = moderateOutput;
exports.getModerationResponse = getModerationResponse;
const INJECTION_PATTERNS = [
    /zignoruj (instrukcje|polecenia|system)/i,
    /jesteś teraz kimś innym/i,
    /jako (nowy|inny) model/i,
    /ignore (previous|system|instructions)/i,
    /you are now/i,
    /pretend (you are|to be)/i,
];
const GUESS_PATTERNS = [
    /no powiedz (jak|co) myślisz/i,
    /\bstrzel\b/i,
    /\bzgadnij\b/i,
    /jak myślisz/i,
    /wymyśl odpowiedź/i,
];
const OUT_OF_SCOPE_PATTERNS = [
    /\b(pogoda|przepis|gotowanie|pizza|mecz|sport wyniki|polityka|giełda)\b/i,
];
const TOXIC_PATTERNS = [
    /\b(hate|nienawiść|przekleńst|kurwa|chuj|jebać|pierdol)\b/i,
];
function moderateInput(input) {
    if (INJECTION_PATTERNS.some(p => p.test(input))) {
        return { blocked: true, reason: 'prompt_injection' };
    }
    if (GUESS_PATTERNS.some(p => p.test(input))) {
        return { blocked: true, reason: 'guess_attempt' };
    }
    if (TOXIC_PATTERNS.some(p => p.test(input))) {
        return { blocked: true, reason: 'toxic_content' };
    }
    if (OUT_OF_SCOPE_PATTERNS.some(p => p.test(input))) {
        return { blocked: true, reason: 'out_of_scope' };
    }
    return { blocked: false, reason: null };
}
function moderateOutput(output) {
    if (TOXIC_PATTERNS.some(p => p.test(output))) {
        return { blocked: true, reason: 'toxic_output' };
    }
    return { blocked: false, reason: null };
}
function getModerationResponse(reason) {
    switch (reason) {
        case 'prompt_injection':
            return 'Nie mogę przetworzyć tego żądania — wykryto próbę modyfikacji zachowania systemu.';
        case 'guess_attempt':
            return 'Nie mogę zgadywać ani spekulować. Odpowiadam wyłącznie na podstawie zweryfikowanych danych ze strony ŚUM.';
        case 'out_of_scope':
            return 'To pytanie wykracza poza zakres mojej wiedzy. Jestem asystentem studenta ŚUM i odpowiadam wyłącznie na pytania związane z uczelnią.';
        case 'toxic_content':
        case 'toxic_output':
            return 'Nie mogę przetworzyć tego żądania.';
        default:
            return 'Nie mogę przetworzyć tego żądania.';
    }
}
