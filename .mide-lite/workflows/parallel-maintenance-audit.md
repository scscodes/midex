---
name: parallel-maintenance-audit
description: Multiple agents audit different aspects of codebase maintenance simultaneously
tags: [workflows, maintenance, audit, parallel, quality]
complexity: moderate
phases:
  - phase: code-hygiene
    agent: maintainer
    description: File organization, structure, and dead code identification
  - phase: dependency-audit
    agent: maintainer
    description: Dependency versions, security vulnerabilities, and license compliance
  - phase: test-maintenance
    agent: implementer
    description: Test coverage analysis and quality assessment
  - phase: documentation-maintenance
    agent: documentation-specialist
    description: Documentation currency and completeness review
  - phase: security-maintenance
    agent: security-specialist
    description: Security practice compliance and vulnerability assessment
  - phase: performance-maintenance
    agent: performance-engineer
    description: Performance pattern analysis and optimization opportunities
  - phase: maintenance-synthesis
    agent: supervisor
    description: Aggregate maintenance findings and create cleanup roadmap
    dependsOn: [code-hygiene, dependency-audit, test-maintenance, documentation-maintenance, security-maintenance, performance-maintenance]
    allowParallel: false
---

# Parallel Maintenance Audit

Comprehensive maintenance audit with multiple agents examining different aspects of codebase health simultaneously.

## Overview

This workflow leverages multiple specialized agents to audit different aspects of codebase maintenance simultaneously, providing comprehensive coverage of technical debt and maintenance needs.

## When to Use

- Regular maintenance audits
- Pre-release codebase health checks
- Technical debt assessment
- Codebase cleanup initiatives
- Maintenance planning

## Maintenance Aspects

### Code Hygiene (Maintainer)
- File organization and structure
- Import statements and dependencies
- Code formatting and style
- Dead code identification

### Dependency Audit (Maintainer)
- Dependency versions and updates
- Security vulnerabilities
- Unused dependencies
- License compliance

### Test Maintenance (Implementer)
- Test coverage analysis
- Test quality and reliability
- Test maintenance needs
- Test automation opportunities

### Documentation Maintenance (Documentation Specialist)
- Documentation currency
- Accuracy and completeness
- User experience quality
- Knowledge base gaps

### Security Maintenance (Security Specialist)
- Security practice compliance
- Vulnerability assessment
- Security documentation
- Compliance requirements

### Performance Maintenance (Performance Engineer)
- Performance pattern analysis
- Bottleneck identification
- Optimization opportunities
- Monitoring improvements

## Expected Outcomes

- **Comprehensive Audit**: All maintenance aspects covered
- **Technical Debt Inventory**: Prioritized list of maintenance needs
- **Cleanup Recommendations**: Actionable improvement suggestions
- **Maintenance Roadmap**: Phased maintenance implementation plan
- **Health Metrics**: Quantified codebase health assessment
