# Test Suite Documentation

Comprehensive integration and unit tests for the midex server, focusing on integration points and business logic rather than trivial getters/setters.

## Test Structure

### Integration Tests

#### `manager.integration.test.ts`
Tests ResourceManager orchestration:
- Plugin registration and discovery
- Sync orchestration across all plugins
- Query integration with database
- Cross-plugin integration
- Error handling

#### `pipeline.integration.test.ts`
Tests ETL pipeline flow:
- Complete extract → transform → load pipeline
- Stage-by-stage execution (extract, transform, load independently)
- Sync vs run behavior
- Error aggregation and graceful handling
- Transform and load error scenarios

#### `content-plugin.integration.test.ts`
Tests ContentPlugin integration:
- Multi-type extraction (agents, rules, workflows)
- Markdown parsing and validation
- Database persistence and upsert behavior
- Sync integration
- Frontmatter transformation (complexityHint → complexity mapping)

#### `conflict.integration.test.ts`
Tests conflict resolution strategies:
- Conflict detection (hash comparison, timestamp comparison)
- Resolution strategies (keep-filesystem, keep-database, keep-newest, manual)
- Edge cases (missing timestamps, identical timestamps)

### Test Utilities

#### `test-utils.ts`
Provides reusable test infrastructure:
- `createTestDatabase()` - In-memory SQLite database with schema
- `createTempDir()` - Temporary directory for filesystem tests
- `cleanupTempDir()` - Cleanup helper
- `createTestMarkdownFile()` - Create test markdown files with frontmatter
- `createTestStructure()` - Create directory structures
- `wait()` - Async wait utility

## Testing Philosophy

### What We Test
✅ Integration points between modules/plugins
✅ Business logic and workflows
✅ Error handling and edge cases
✅ Data transformation and validation
✅ Database persistence and queries
✅ Conflict resolution strategies

### What We Don't Test
❌ Simple getters/setters (should be typed)
❌ Trivial value assignments
❌ Type-only checks (handled by TypeScript)
❌ Mock implementations of simple functions

## Running Tests

```bash
# Run all tests
npm test

# Run tests once (CI mode)
npm run test:run

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- src/__tests__/manager.integration.test.ts
```

## Test Coverage

The test suite covers:
- **ResourceManager**: Plugin registration, sync orchestration, query operations
- **Pipeline**: Full ETL flow, stage-by-stage execution, error handling
- **ContentPlugin**: Multi-type extraction, markdown transformation, database persistence
- **Conflict Resolution**: All strategies, edge cases, timestamp handling

## Adding New Tests

When adding new tests:

1. **Focus on integration points** - Test how modules interact, not internal implementation
2. **Use test utilities** - Leverage `test-utils.ts` for database and filesystem setup
3. **Test error paths** - Ensure graceful error handling
4. **Avoid trivial tests** - Don't test simple property access or type-only checks
5. **Use descriptive names** - Test names should clearly describe what is being tested

## Example Test Pattern

```typescript
describe('Feature Integration', () => {
  let db: DB;
  let tempDir: string;

  beforeEach(() => {
    db = createTestDatabase();
    tempDir = createTempDir();
  });

  afterEach(() => {
    db.close();
    cleanupTempDir(tempDir);
  });

  it('should handle integration scenario', async () => {
    // Setup
    createTestMarkdownFile(tempDir, 'test.md', { name: 'test' }, 'Content');

    // Execute
    const result = await featureUnderTest.execute();

    // Verify integration points
    expect(result).toBeDefined();
    expect(result.errors).toEqual([]);
  });
});
```

