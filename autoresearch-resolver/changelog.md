# Autoresearch Changelog — ACR Task Resolver

## Experiment 0 — baseline
**Pass rate:** 100.0%
**Recall:** 100.0%
**Precision:** 32.8%
**Primary:** 100.0%
**Avg tokens:** 3667
**Failures:** none

## Experiment 1 — keep
**Pass rate:** 100.0%
**Change:** Max 4 capabilities
**Recall:** 100.0% | Precision: 39.3% | Primary: 100.0%
**Avg tokens:** 3011

## Experiment 2 — discard
**Pass rate:** 95.0%
**Change:** Max 3 capabilities
**Recall:** 95.5% | Precision: 43.8% | Primary: 95.0%
**Avg tokens:** 2692

## Experiment 3 — discard
**Pass rate:** 95.0%
**Change:** Max 2 capabilities
**Recall:** 95.5% | Precision: 58.3% | Primary: 95.0%
**Avg tokens:** 2087

## Experiment 4 — discard
**Pass rate:** 100.0%
**Change:** Budget 5000 (tight)
**Recall:** 100.0% | Precision: 34.9% | Primary: 100.0%
**Avg tokens:** 2761

## Experiment 5 — discard
**Pass rate:** 95.0%
**Change:** Budget 3000 (very tight)
**Recall:** 95.5% | Precision: 34.4% | Primary: 95.0%
**Avg tokens:** 2252

## Experiment 6 — discard
**Pass rate:** 95.0%
**Change:** Budget 2000 (minimal)
**Recall:** 95.5% | Precision: 35.6% | Primary: 90.0%
**Avg tokens:** 1744

## Experiment 7 — discard
**Pass rate:** 95.0%
**Change:** Max 3 + budget 5000
**Recall:** 95.5% | Precision: 46.7% | Primary: 95.0%
**Avg tokens:** 2158

## Experiment 8 — keep
**Pass rate:** 100.0%
**Change:** Max 4 + budget 5000
**Recall:** 100.0% | Precision: 42.3% | Primary: 100.0%
**Avg tokens:** 2381

## Experiment 9 — discard
**Pass rate:** 90.0%
**Change:** Max 3 + budget 3000
**Recall:** 90.9% | Precision: 43.5% | Primary: 90.0%
**Avg tokens:** 2018

## Experiment 10 — discard
**Pass rate:** 100.0%
**Change:** Max 4 + budget 8000
**Recall:** 100.0% | Precision: 39.3% | Primary: 100.0%
**Avg tokens:** 2922

## Experiment 11 — discard
**Pass rate:** 100.0%
**Change:** Semantic threshold 0.4
**Recall:** 100.0% | Precision: 32.8% | Primary: 100.0%
**Avg tokens:** 3667

## Experiment 12 — discard
**Pass rate:** 100.0%
**Change:** Semantic threshold 0.5
**Recall:** 100.0% | Precision: 32.8% | Primary: 100.0%
**Avg tokens:** 3667

## Experiment 13 — discard
**Pass rate:** 100.0%
**Change:** Max 4 + budget 5000 + threshold 0.4
**Recall:** 100.0% | Precision: 42.3% | Primary: 100.0%
**Avg tokens:** 2381

## Experiment 14 — discard
**Pass rate:** 95.0%
**Change:** Max 3 + budget 5000 + threshold 0.4
**Recall:** 95.5% | Precision: 46.7% | Primary: 95.0%
**Avg tokens:** 2158

## Experiment 15 — discard
**Pass rate:** 100.0%
**Change:** Max 5 + budget 8000
**Recall:** 100.0% | Precision: 36.7% | Primary: 100.0%
**Avg tokens:** 3275

