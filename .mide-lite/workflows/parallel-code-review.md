---
name: parallel-code-review
description: Multiple agents review code from different perspectives simultaneously
tags: [workflows, code-review, quality, parallel, security]
complexity: high
phases:
  - phase: quality-review
    agent: reviewer
    description: Code standards compliance and best practices review
  - phase: security-review
    agent: security-specialist
    description: Vulnerability assessment and security validation
  - phase: performance-review
    agent: performance-engineer
    description: Algorithmic efficiency and resource utilization analysis
  - phase: maintainability-review
    agent: maintainer
    description: Code organization and technical debt assessment
  - phase: architecture-review
    agent: architect
    description: Design pattern compliance and system integration review
  - phase: review-synthesis
    agent: supervisor
    description: Aggregate findings and create unified action plan
    dependsOn: [quality-review, security-review, performance-review, maintainability-review, architecture-review]
    allowParallel: false
---

# Parallel Code Review

Comprehensive code review with multiple agents examining code from different perspectives simultaneously.

## Overview

This workflow leverages multiple specialized agents to review code from different angles simultaneously, providing comprehensive coverage and diverse perspectives on code quality.

## When to Use

- Major feature implementations
- Critical security-sensitive code
- Performance-critical components
- Architecture changes
- Pre-release code audits

## Review Perspectives

### Quality Review (Reviewer)
- Code standards compliance
- Best practices adherence
- Error handling quality
- Test coverage adequacy

### Security Review (Security Specialist)
- Vulnerability assessment
- Input validation
- Authentication/authorization
- Data protection

### Performance Review (Performance Engineer)
- Algorithmic efficiency
- Resource utilization
- Scalability considerations
- Bottleneck identification

### Maintainability Review (Maintainer)
- Code organization
- Technical debt
- Documentation quality
- Refactoring opportunities

### Architecture Review (Architect)
- Design pattern compliance
- Component interaction
- System integration
- Future extensibility

## Expected Outcomes

- **Comprehensive Coverage**: All aspects of code quality reviewed
- **Prioritized Issues**: Issues ranked by severity and impact
- **Diverse Perspectives**: Multiple expert viewpoints
- **Unified Action Plan**: Coordinated improvement strategy
- **Quality Metrics**: Quantified code quality assessment
