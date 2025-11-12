---
name: feature-development
description: Complete feature development workflow from design to deployment
tags: [workflows, development, feature, full-cycle]
complexity: high
phases:
  - phase: design
    agent: architect
    description: System design and technical decisions
  - phase: implement
    agent: implementer
    description: Code implementation with tests
    dependsOn: [design]
  - phase: review
    agent: reviewer
    description: Quality and security validation
    dependsOn: [implement]
  - phase: fix-issues
    agent: implementer
    description: Address review feedback
    dependsOn: [review]
  - phase: final-review
    agent: reviewer
    description: Final validation before completion
    dependsOn: [fix-issues]
---

# Feature Development Workflow

Complete end-to-end workflow for implementing new features with proper architecture, implementation, and review cycles.

## Overview

This workflow orchestrates multiple agents to deliver production-ready features through five sequential phases:

1. **Architect** - System design and technical decisions
2. **Implementer** - Code implementation with tests
3. **Reviewer** - Quality and security validation
4. **Iterative refinement** - Address feedback and re-review

## When to Use

- Adding new user-facing features
- Implementing new API endpoints
- Building new modules or components
- Medium to large development tasks

## Expected Outcomes

- Well-architected solution
- Production-quality code
- Comprehensive tests
- Reviewed and approved changes
- Updated documentation
