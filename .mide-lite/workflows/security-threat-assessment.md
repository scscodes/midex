---
name: security-threat-assessment
description: Multi-agent security analysis with parallel threat modeling
tags: [workflows, security, threat-modeling, parallel]
complexity: high
phases:
  - phase: external-threats
    agent: security-specialist
    description: Attack surface analysis and external vulnerability scanning
  - phase: internal-threats
    agent: security-specialist
    description: Insider threat assessment and access control review
  - phase: code-vulnerabilities
    agent: debugger
    description: Static code analysis and common vulnerability patterns
  - phase: infrastructure-security
    agent: devops-engineer
    description: Server hardening and network security configuration review
  - phase: data-protection
    agent: security-specialist
    description: Data classification and privacy compliance assessment
  - phase: threat-synthesis
    agent: supervisor
    description: Aggregate security findings and create mitigation roadmap
    dependsOn: [external-threats, internal-threats, code-vulnerabilities, infrastructure-security, data-protection]
    allowParallel: false
---

# Security Threat Assessment

Comprehensive multi-agent security analysis with parallel threat modeling across all system layers.

## Overview

This workflow conducts a thorough security assessment by analyzing threats from multiple perspectives simultaneously, providing comprehensive coverage of potential security risks.

## When to Use

- Regular security audits
- Before major releases
- After security incidents
- Compliance requirements
- New feature security review

## Threat Analysis Perspectives

### External Threats (Security Specialist)
- Attack surface analysis
- External vulnerability scanning
- Threat intelligence assessment
- Public exposure evaluation

### Internal Threats (Security Specialist)
- Insider threat assessment
- Access control review
- Privilege escalation analysis
- Internal network security

### Code Vulnerabilities (Debugger)
- Static code analysis
- Common vulnerability patterns
- Input validation issues
- Authentication/authorization flaws

### Infrastructure Security (DevOps Engineer)
- Server hardening review
- Network security configuration
- Deployment security practices
- Monitoring and logging

### Data Protection (Security Specialist)
- Data classification review
- Privacy compliance assessment
- Encryption implementation
- Data retention policies

## Expected Outcomes

- **Threat Landscape**: Comprehensive map of potential threats
- **Vulnerability Inventory**: Prioritized list of security issues
- **Risk Assessment**: Risk levels and impact analysis
- **Mitigation Roadmap**: Actionable security improvements
- **Compliance Status**: Regulatory compliance assessment
