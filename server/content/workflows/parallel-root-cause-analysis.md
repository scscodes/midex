---
name: parallel-root-cause-analysis
description: Multiple agents analyze different aspects of the same issue in parallel
tags: [workflows, debugging, analysis, parallel]
complexity: moderate
phases:
  - phase: code-analysis
    agent: debugger
    description: Stack trace analysis and logic error identification
  - phase: performance-analysis
    agent: performance-engineer
    description: Bottleneck identification and resource utilization analysis
  - phase: security-analysis
    agent: security-specialist
    description: Vulnerability assessment and attack vector analysis
  - phase: architecture-analysis
    agent: architect
    description: Design pattern violations and component interaction issues
  - phase: correlation-analysis
    agent: supervisor
    description: Correlate findings and identify true root cause
    dependsOn: [code-analysis, performance-analysis, security-analysis, architecture-analysis]
    allowParallel: false
---

# Parallel Root Cause Analysis

Multi-agent approach to complex issue diagnosis with parallel analysis and correlation.

## Overview

This workflow leverages multiple specialized agents to analyze the same issue from different perspectives simultaneously, then correlates their findings to identify the true root cause.

## When to Use

- Complex bugs affecting multiple components
- System failures with unclear origins
- Performance issues with multiple potential causes
- Security incidents requiring comprehensive analysis
- Issues that have resisted single-agent diagnosis

## Analysis Perspectives

### Code Analysis (Debugger)
- Stack trace analysis
- Logic error identification
- Code path analysis
- Exception handling issues

### Performance Analysis (Performance Engineer)
- Bottleneck identification
- Resource utilization analysis
- Scalability issues
- Memory leaks and CPU spikes

### Security Analysis (Security Specialist)
- Vulnerability assessment
- Attack vector analysis
- Input validation issues
- Authentication/authorization problems

### Architecture Analysis (Architect)
- Design pattern violations
- Component interaction issues
- Data flow problems
- Integration failures

## Expected Outcomes

- **Comprehensive Coverage**: All potential causes examined
- **Correlated Findings**: Cross-referenced analysis results
- **Confidence Scoring**: Prioritized issues with confidence levels
- **Actionable Insights**: Clear next steps for resolution
