---
name: bug-fix
description: Systematic bug fixing workflow with diagnosis and verification
tags: [workflows, bugfix, debugging, maintenance]
complexity: moderate
phases:
  - phase: diagnose
    agent: debugger
    description: Root cause analysis through debugging and analysis
  - phase: fix
    agent: implementer
    description: Implement fix with regression tests
    dependsOn: [diagnose]
  - phase: verify
    agent: reviewer
    description: Verify fix resolves issue without side effects
    dependsOn: [fix]
---

# Bug Fix Workflow

Systematic approach to debugging and fixing issues with proper diagnosis and verification.

## Overview

This workflow ensures bugs are properly understood and fixed through three sequential phases:

1. **Debugger** - Root cause analysis
2. **Implementer** - Fix with regression tests
3. **Reviewer** - Verification and validation

## When to Use

- Fixing reported bugs
- Addressing test failures
- Resolving errors or crashes
- Quick to moderate complexity issues

## Expected Outcomes

- Root cause identified and documented
- Bug fix implemented with regression tests
- Verification that fix resolves issue without side effects
- All tests passing
