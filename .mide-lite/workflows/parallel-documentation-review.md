---
name: parallel-documentation-review
description: Multiple agents review and update different types of documentation in parallel
tags: [workflows, documentation, review, parallel, maintenance]
complexity: moderate
phases:
  - phase: api-documentation
    agent: documentation-specialist
    description: OpenAPI specifications and API endpoint documentation review
  - phase: user-documentation
    agent: documentation-specialist
    description: README files, guides, and user manuals review
  - phase: architecture-documentation
    agent: architect
    description: System design documents and architecture decision records
  - phase: deployment-documentation
    agent: devops-engineer
    description: Deployment guides and infrastructure documentation
  - phase: security-documentation
    agent: security-specialist
    description: Security policies and compliance documentation
  - phase: documentation-synthesis
    agent: supervisor
    description: Aggregate documentation review findings and create improvement plan
    dependsOn: [api-documentation, user-documentation, architecture-documentation, deployment-documentation, security-documentation]
    allowParallel: false
---

# Parallel Documentation Review

Comprehensive documentation review with multiple agents working on different documentation types simultaneously.

## Overview

This workflow leverages multiple specialized agents to review and update different types of documentation in parallel, ensuring comprehensive coverage and consistency across all documentation.

## When to Use

- Regular documentation audits
- Before major releases
- After significant code changes
- Documentation quality improvement
- Compliance documentation review

## Documentation Types

### API Documentation (Documentation Specialist)
- OpenAPI specifications
- Code comments and docstrings
- API endpoint documentation
- Integration examples

### User Documentation (Documentation Specialist)
- README files
- Getting started guides
- User manuals
- Tutorials and examples

### Architecture Documentation (Architect)
- System design documents
- Technical specifications
- Architecture decision records
- Component diagrams

### Deployment Documentation (DevOps Engineer)
- Deployment guides
- Infrastructure documentation
- Operational procedures
- Environment setup

### Security Documentation (Security Specialist)
- Security policies
- Compliance documentation
- Security procedures
- Vulnerability reports

## Expected Outcomes

- **Comprehensive Coverage**: All documentation types reviewed
- **Consistency Check**: Cross-reference documentation for consistency
- **Gap Analysis**: Identify missing documentation
- **Quality Improvement**: Enhanced documentation quality
- **Unified Plan**: Coordinated documentation strategy
