# Running Tests

## Quick Start

Run all tests (frontend + backend) with pass percentage:

```bash
npm test
```

Or from the root directory:

```bash
npm run test:all
```

## Individual Test Commands

### Frontend Tests
```bash
cd frontend
npm test              # Run once
npm run test:watch    # Watch mode
npm run test:coverage # With coverage
```

### Backend Tests
```bash
cd backend
npm test              # Run once
npm run test:watch    # Watch mode
npm run test:coverage # With coverage
```

## Test Output

The `npm test` command will:
1. Run all frontend tests
2. Run all backend tests
3. Display a summary with:
   - Total test files and pass/fail counts
   - Total tests and pass/fail counts
   - **Pass percentage** for both test files and individual tests
   - Overall pass rate

Example output:
```
📊 TEST SUMMARY
============================================================

📁 Test Files:
   Total: 8
   ✅ Passed: 8
   ❌ Failed: 0
   📈 Pass Rate: 100.0%

🧪 Tests:
   Total: 45
   ✅ Passed: 45
   ❌ Failed: 0
   📈 Pass Rate: 100.0%

============================================================
🎯 Overall Pass Rate: 100.0%
============================================================

✅ All tests passed!
```

## Troubleshooting

If you get "command not found", make sure you've installed dependencies:

```bash
# Install root dependencies (if any)
npm install

# Install frontend dependencies
cd frontend && npm install

# Install backend dependencies
cd ../backend && npm install
```
