#!/usr/bin/env node
/* eslint-disable no-console */

const { spawnSync } = require('child_process');
const { join } = require('path');

const rootDir = join(__dirname, '..');

/**
 * Run a command and always capture BOTH stdout + stderr.
 */
function runCmd(cmd, args, cwd) {
  const res = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf-8',
    shell: process.platform === 'win32', // helps on Windows
    env: process.env,
  });

  const stdout = res.stdout || '';
  const stderr = res.stderr || '';
  const output = stdout + stderr;

  return {
    code: typeof res.status === 'number' ? res.status : 0,
    output,
  };
}

/**
 * Remove ANSI colors to make parsing stable.
 */
function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\u001b\[[0-9;]*m/g, '');
}

/**
 * Parse Vitest summary from pretty output.
 * Supports:
 *   - "Test Files  1 failed | 4 passed (5)"
 *   - "Test Files  5 passed (5)"
 *   - "Tests       2 failed | 9 passed (11)"
 *   - "Tests       9 passed (9)"
 */
function parseVitestSummary(rawOutput) {
  const output = stripAnsi(rawOutput);

  // Normalize weird spacing (Vitest uses alignment spaces)
  const o = output.replace(/\r\n/g, '\n');

  const result = {
    testFiles: { total: 0, passed: 0, failed: 0 },
    tests: { total: 0, passed: 0, failed: 0 },
  };

  // With failures: "Test Files  X failed | Y passed (T)"
  const tfFail = o.match(/Test\s+Files\s+(\d+)\s+failed\s+\|\s+(\d+)\s+passed\s+\((\d+)\)/);
  const tFail = o.match(/Tests\s+(\d+)\s+failed\s+\|\s+(\d+)\s+passed\s+\((\d+)\)/);

  if (tfFail) {
    result.testFiles.failed = Number(tfFail[1]);
    result.testFiles.passed = Number(tfFail[2]);
    result.testFiles.total = Number(tfFail[3]);
  }

  if (tFail) {
    result.tests.failed = Number(tFail[1]);
    result.tests.passed = Number(tFail[2]);
    result.tests.total = Number(tFail[3]);
  }

  // All passed: "Test Files  X passed (T)"
  if (result.testFiles.total === 0) {
    const tfPass = o.match(/Test\s+Files\s+(\d+)\s+passed\s*\((\d+)\)/);
    if (tfPass) {
      result.testFiles.failed = 0;
      result.testFiles.passed = Number(tfPass[1]);
      result.testFiles.total = Number(tfPass[2]);
    }
  }

  if (result.tests.total === 0) {
    const tPass = o.match(/Tests\s+(\d+)\s+passed\s*\((\d+)\)/);
    if (tPass) {
      result.tests.failed = 0;
      result.tests.passed = Number(tPass[1]);
      result.tests.total = Number(tPass[2]);
    }
  }

  const parsedAnything = result.testFiles.total > 0 || result.tests.total > 0;

  // Fallback heuristic
  const hasFailures =
    /\bFAIL\b/.test(o) ||
    /\bfailed\b/i.test(o) ||
    /\bError\b/.test(o);

  return {
    parsed: parsedAnything,
    success: parsedAnything
      ? (result.testFiles.failed === 0 && result.tests.failed === 0)
      : !hasFailures,
    ...result,
  };
}

function formatPercent(passed, total) {
  if (!total) return '0.0';
  return ((passed / total) * 100).toFixed(1);
}

function runTests(directory, name) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running ${name} tests...`);
  console.log('='.repeat(60));

  const cwd = join(rootDir, directory);

  // Run the package's test script (whatever it is)
  const { code, output } = runCmd('npm', ['test'], cwd);

  // Always print the raw output for debugging
  console.log(output);

  // Parse vitest summary (if present)
  const parsed = parseVitestSummary(output);

  return {
    directory,
    name,
    exitCode: code,
    output,
    parsed,
    testFiles: parsed.testFiles,
    tests: parsed.tests,
    success: parsed.success && code === 0,
  };
}

console.log('\n🧪 Running All Tests for Stockly\n');

const frontendResults = runTests('frontend', 'Frontend');
const backendResults = runTests('backend', 'Backend');

// Totals
const totalTestFiles =
  (frontendResults.testFiles.total || 0) + (backendResults.testFiles.total || 0);
const totalTestFilesPassed =
  (frontendResults.testFiles.passed || 0) + (backendResults.testFiles.passed || 0);
const totalTestFilesFailed =
  (frontendResults.testFiles.failed || 0) + (backendResults.testFiles.failed || 0);

const totalTests =
  (frontendResults.tests.total || 0) + (backendResults.tests.total || 0);
const totalTestsPassed =
  (frontendResults.tests.passed || 0) + (backendResults.tests.passed || 0);
const totalTestsFailed =
  (frontendResults.tests.failed || 0) + (backendResults.tests.failed || 0);

const testFilesPassPercent = formatPercent(totalTestFilesPassed, totalTestFiles);
const testsPassPercent = formatPercent(totalTestsPassed, totalTests);

// Summary
console.log('\n' + '='.repeat(60));
console.log('📊 TEST SUMMARY');
console.log('='.repeat(60));

console.log('\nFrontend:');
console.log(`   Exit code: ${frontendResults.exitCode}`);
if (frontendResults.parsed.parsed) {
  console.log(
    `   Test Files: ${frontendResults.testFiles.passed}/${frontendResults.testFiles.total} passed` +
    ` (${frontendResults.testFiles.failed} failed)`
  );
  console.log(
    `   Tests:      ${frontendResults.tests.passed}/${frontendResults.tests.total} passed` +
    ` (${frontendResults.tests.failed} failed)`
  );
} else {
  console.log('   (Could not parse Vitest summary from output)');
}

console.log('\nBackend:');
console.log(`   Exit code: ${backendResults.exitCode}`);
if (backendResults.parsed.parsed) {
  console.log(
    `   Test Files: ${backendResults.testFiles.passed}/${backendResults.testFiles.total} passed` +
    ` (${backendResults.testFiles.failed} failed)`
  );
  console.log(
    `   Tests:      ${backendResults.tests.passed}/${backendResults.tests.total} passed` +
    ` (${backendResults.tests.failed} failed)`
  );
} else {
  console.log('   (Could not parse Vitest summary from output)');
}

console.log('\n📁 Total Test Files:');
console.log(`   Total: ${totalTestFiles}`);
console.log(`   ✅ Passed: ${totalTestFilesPassed}`);
console.log(`   ❌ Failed: ${totalTestFilesFailed}`);
console.log(`   📈 Pass Rate: ${testFilesPassPercent}%`);

console.log('\n🧪 Total Tests:');
console.log(`   Total: ${totalTests}`);
console.log(`   ✅ Passed: ${totalTestsPassed}`);
console.log(`   ❌ Failed: ${totalTestsFailed}`);
console.log(`   📈 Pass Rate: ${testsPassPercent}%`);

console.log('\n' + '='.repeat(60));
console.log(`🎯 Overall Pass Rate: ${testsPassPercent}%`);
console.log('='.repeat(60));

// Decide final exit
if (frontendResults.exitCode !== 0 || backendResults.exitCode !== 0 || totalTestsFailed > 0) {
  console.log('\n⚠️  Some tests failed. Check the output above for details.');
  process.exit(1);
}

console.log('\n✅ All tests passed!');
process.exit(0);
