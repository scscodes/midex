---
name: component-performance-review
description: Parallel performance analysis across multiple system components
tags: [workflows, performance, analysis, parallel]
complexity: moderate
phases:
  - phase: database-performance
    agent: performance-engineer
    description: Query execution times and index effectiveness analysis
  - phase: api-performance
    agent: performance-engineer
    description: Response time analysis and throughput measurement
  - phase: frontend-performance
    agent: performance-engineer
    description: Page load times and bundle size analysis
  - phase: infrastructure-performance
    agent: devops-engineer
    description: Server resource utilization and scaling bottlenecks
  - phase: performance-synthesis
    agent: supervisor
    description: Aggregate performance metrics and create optimization roadmap
    dependsOn: [database-performance, api-performance, frontend-performance, infrastructure-performance]
    allowParallel: false
---

# Component Performance Review

Parallel performance analysis across multiple system components to identify optimization opportunities.

## Overview

This workflow analyzes performance across different system layers simultaneously, providing a comprehensive view of system performance and optimization opportunities.

## When to Use

- Regular performance audits
- Before major releases
- After performance regression reports
- System scaling planning
- Performance budget establishment

## Component Analysis

### Database Performance
- Query execution times
- Connection pool utilization
- Index effectiveness
- Data access patterns

### API Performance
- Response time analysis
- Throughput measurement
- Caching effectiveness
- Rate limiting impact

### Frontend Performance
- Page load times
- Bundle size analysis
- Rendering performance
- User experience metrics

### Infrastructure Performance
- Server resource utilization
- Scaling bottlenecks
- Deployment performance
- Monitoring and alerting

## Expected Outcomes

- **Performance Baseline**: Current performance metrics for all components
- **Bottleneck Identification**: Prioritized list of performance issues
- **Optimization Roadmap**: Actionable recommendations with impact estimates
- **Performance Budget**: Target metrics for future development
