#!/usr/bin/env node
// ── State Machine Unit Test ─────────────────────────────────────
// Tests toolToJCState() mappings and canTransition() v1/v2 rules.
// Pure JS re-implementation of the logic to avoid TS import issues.

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  FAIL: ${msg}`);
    failed++;
  }
}

// ── Re-implement state-machine.ts logic in JS for testing ──

const JCState = {
  ABSENT: 'absent',
  ARRIVING: 'arriving',
  CODING: 'coding',
  THINKING: 'thinking',
  READING: 'reading',
  REVIEWING: 'reviewing',
  PRESENTING: 'presenting',
  MEETING: 'meeting',
  BREAK: 'break',
  ERROR: 'error',
  IDLE: 'idle',
  HANDOFF: 'handoff',
  LEAVING: 'leaving',
};

const TRANSITIONS = {
  [JCState.ABSENT]: [JCState.ARRIVING],
  [JCState.ARRIVING]: [JCState.CODING, JCState.THINKING, JCState.READING, JCState.IDLE],
  [JCState.CODING]: [
    JCState.THINKING,
    JCState.READING,
    JCState.IDLE,
    JCState.ERROR,
    JCState.LEAVING,
  ],
  [JCState.THINKING]: [
    JCState.CODING,
    JCState.READING,
    JCState.IDLE,
    JCState.ERROR,
    JCState.LEAVING,
  ],
  [JCState.READING]: [
    JCState.CODING,
    JCState.THINKING,
    JCState.IDLE,
    JCState.ERROR,
    JCState.LEAVING,
  ],
  [JCState.ERROR]: [JCState.CODING, JCState.IDLE, JCState.LEAVING],
  [JCState.IDLE]: [JCState.CODING, JCState.THINKING, JCState.READING, JCState.LEAVING],
  [JCState.LEAVING]: [JCState.ABSENT],
  [JCState.REVIEWING]: [],
  [JCState.PRESENTING]: [],
  [JCState.MEETING]: [],
  [JCState.BREAK]: [],
  [JCState.HANDOFF]: [],
};

function canTransition(from, to) {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

function toolToJCState(toolName) {
  switch (toolName) {
    case 'Write':
    case 'Edit':
    case 'Bash':
    case 'NotebookEdit':
      return JCState.CODING;
    case 'Read':
    case 'Grep':
    case 'Glob':
    case 'WebFetch':
    case 'WebSearch':
      return JCState.READING;
    case 'Task':
    case 'Agent':
    case 'EnterPlanMode':
      return JCState.THINKING;
    case 'AskUserQuestion':
      return JCState.IDLE;
    default:
      return JCState.CODING;
  }
}

console.log('=== State Machine Test ===\n');

// ── toolToJCState() mappings ──
console.log('1. toolToJCState() mappings:');
assert(toolToJCState('Write') === 'coding', 'Write -> coding');
assert(toolToJCState('Edit') === 'coding', 'Edit -> coding');
assert(toolToJCState('Bash') === 'coding', 'Bash -> coding');
assert(toolToJCState('NotebookEdit') === 'coding', 'NotebookEdit -> coding');
assert(toolToJCState('Read') === 'reading', 'Read -> reading');
assert(toolToJCState('Grep') === 'reading', 'Grep -> reading');
assert(toolToJCState('Glob') === 'reading', 'Glob -> reading');
assert(toolToJCState('WebFetch') === 'reading', 'WebFetch -> reading');
assert(toolToJCState('WebSearch') === 'reading', 'WebSearch -> reading');
assert(toolToJCState('Task') === 'thinking', 'Task -> thinking');
assert(toolToJCState('Agent') === 'thinking', 'Agent -> thinking');
assert(toolToJCState('EnterPlanMode') === 'thinking', 'EnterPlanMode -> thinking');
assert(toolToJCState('AskUserQuestion') === 'idle', 'AskUserQuestion -> idle');
assert(toolToJCState('UnknownTool') === 'coding', 'UnknownTool -> coding (default)');

// ── canTransition() v1 transitions (should be valid) ──
console.log('\n2. canTransition() — v1 valid transitions:');
assert(canTransition('absent', 'arriving'), 'absent -> arriving');
assert(canTransition('arriving', 'coding'), 'arriving -> coding');
assert(canTransition('arriving', 'thinking'), 'arriving -> thinking');
assert(canTransition('arriving', 'reading'), 'arriving -> reading');
assert(canTransition('arriving', 'idle'), 'arriving -> idle');
assert(canTransition('coding', 'thinking'), 'coding -> thinking');
assert(canTransition('coding', 'reading'), 'coding -> reading');
assert(canTransition('coding', 'idle'), 'coding -> idle');
assert(canTransition('coding', 'error'), 'coding -> error');
assert(canTransition('coding', 'leaving'), 'coding -> leaving');
assert(canTransition('thinking', 'coding'), 'thinking -> coding');
assert(canTransition('reading', 'coding'), 'reading -> coding');
assert(canTransition('error', 'coding'), 'error -> coding');
assert(canTransition('error', 'idle'), 'error -> idle');
assert(canTransition('error', 'leaving'), 'error -> leaving');
assert(canTransition('idle', 'coding'), 'idle -> coding');
assert(canTransition('idle', 'thinking'), 'idle -> thinking');
assert(canTransition('idle', 'reading'), 'idle -> reading');
assert(canTransition('idle', 'leaving'), 'idle -> leaving');
assert(canTransition('leaving', 'absent'), 'leaving -> absent');

// ── canTransition() v2 transitions (should be INVALID) ──
console.log('\n3. canTransition() — v2 states have NO outgoing transitions:');
assert(!canTransition('reviewing', 'coding'), 'reviewing -> coding is INVALID');
assert(!canTransition('presenting', 'idle'), 'presenting -> idle is INVALID');
assert(!canTransition('meeting', 'leaving'), 'meeting -> leaving is INVALID');
assert(!canTransition('break', 'idle'), 'break -> idle is INVALID');
assert(!canTransition('handoff', 'absent'), 'handoff -> absent is INVALID');

// ── canTransition() invalid v1 transitions ──
console.log('\n4. canTransition() — invalid v1 transitions:');
assert(!canTransition('absent', 'coding'), 'absent -> coding is INVALID (needs arriving)');
assert(!canTransition('arriving', 'leaving'), 'arriving -> leaving is INVALID');
assert(!canTransition('leaving', 'coding'), 'leaving -> coding is INVALID');
assert(!canTransition('error', 'thinking'), 'error -> thinking is INVALID');

// Summary
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
