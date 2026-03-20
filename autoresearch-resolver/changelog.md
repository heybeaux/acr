# Autoresearch Changelog — ACR Task Resolver

## Experiment 0 — baseline
**Pass rate:** 100.0%
**Recall:** 100.0%
**Precision:** 32.8%
**Primary:** 100.0%
**Avg tokens:** 3667
**Failures:** none

## Experiment 1 — discard
**Pass rate:** 100.0%
**Change:** Lower semantic threshold: 0.3 → 0.2
**Recall:** 100.0% | Precision: 32.8% | Primary: 100.0%
**Avg tokens:** 3667

## Experiment 2 — discard
**Pass rate:** 100.0%
**Change:** Raise semantic threshold: 0.3 → 0.4
**Recall:** 100.0% | Precision: 32.8% | Primary: 100.0%
**Avg tokens:** 3667

## Experiment 3 — discard
**Pass rate:** 100.0%
**Change:** Increase max capabilities: 8 → 12
**Recall:** 100.0% | Precision: 32.8% | Primary: 100.0%
**Avg tokens:** 3667

## Experiment 4 — discard
**Pass rate:** 100.0%
**Change:** Decrease max capabilities: 8 → 5
**Recall:** 100.0% | Precision: 36.7% | Primary: 100.0%
**Avg tokens:** 3364

## Experiment 5 — discard
**Pass rate:** 100.0%
**Change:** Increase budget: 15000 → 25000
**Recall:** 100.0% | Precision: 32.8% | Primary: 100.0%
**Avg tokens:** 3667

## Experiment 6 — discard
**Pass rate:** 100.0%
**Change:** Decrease budget: 15000 → 8000
**Recall:** 100.0% | Precision: 32.8% | Primary: 100.0%
**Avg tokens:** 3578

## Experiment 7 — discard
**Pass rate:** 100.0%
**Change:** Lower threshold + more caps
**Recall:** 100.0% | Precision: 32.8% | Primary: 100.0%
**Avg tokens:** 3667

## Experiment 8 — discard
**Pass rate:** 100.0%
**Change:** Higher budget + more caps
**Recall:** 100.0% | Precision: 32.8% | Primary: 100.0%
**Avg tokens:** 3667

## Experiment 9 — discard
**Pass rate:** 100.0%
**Change:** Tight: low budget, few caps, high threshold
**Recall:** 100.0% | Precision: 36.7% | Primary: 100.0%
**Avg tokens:** 3275

## Experiment 10 — discard
**Pass rate:** 100.0%
**Change:** Wide: high budget, many caps, low threshold
**Recall:** 100.0% | Precision: 32.8% | Primary: 100.0%
**Avg tokens:** 3667

