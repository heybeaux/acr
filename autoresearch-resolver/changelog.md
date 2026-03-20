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
**Change:** minScore 20 (post trigger fix)
**Recall:** 100.0% | Precision: 48.9% | Primary: 100.0%
**Avg tokens:** 2145

## Experiment 2 — keep
**Pass rate:** 100.0%
**Change:** minScore 25 (post trigger fix)
**Recall:** 100.0% | Precision: 50.0% | Primary: 100.0%
**Avg tokens:** 2061

## Experiment 3 — discard
**Pass rate:** 100.0%
**Change:** minScore 30 (post trigger fix)
**Recall:** 100.0% | Precision: 50.0% | Primary: 100.0%
**Avg tokens:** 2061

## Experiment 4 — keep
**Pass rate:** 100.0%
**Change:** minScore 35 (post trigger fix)
**Recall:** 100.0% | Precision: 64.7% | Primary: 100.0%
**Avg tokens:** 1626

## Experiment 5 — discard
**Pass rate:** 100.0%
**Change:** maxCaps 5 + minScore 25
**Recall:** 100.0% | Precision: 44.9% | Primary: 100.0%
**Avg tokens:** 2794

## Experiment 6 — discard
**Pass rate:** 100.0%
**Change:** maxCaps 6 + minScore 25
**Recall:** 100.0% | Precision: 44.0% | Primary: 100.0%
**Avg tokens:** 2827

## Experiment 7 — discard
**Pass rate:** 100.0%
**Change:** maxCaps 6 + minScore 30
**Recall:** 100.0% | Precision: 44.0% | Primary: 100.0%
**Avg tokens:** 2916

## Experiment 8 — discard
**Pass rate:** 100.0%
**Change:** maxCaps 8 + minScore 30
**Recall:** 100.0% | Precision: 43.1% | Primary: 100.0%
**Avg tokens:** 2940

## Experiment 9 — discard
**Pass rate:** 100.0%
**Change:** maxCaps 8 + minScore 35
**Recall:** 100.0% | Precision: 57.9% | Primary: 100.0%
**Avg tokens:** 2167

## Experiment 10 — discard
**Pass rate:** 100.0%
**Change:** minScore 22
**Recall:** 100.0% | Precision: 48.9% | Primary: 100.0%
**Avg tokens:** 2145

## Experiment 11 — discard
**Pass rate:** 100.0%
**Change:** minScore 28
**Recall:** 100.0% | Precision: 50.0% | Primary: 100.0%
**Avg tokens:** 2061

## Experiment 12 — discard
**Pass rate:** 100.0%
**Change:** maxCaps 3 + minScore 20
**Recall:** 100.0% | Precision: 53.7% | Primary: 100.0%
**Avg tokens:** 2018

## Experiment 13 — discard
**Pass rate:** 100.0%
**Change:** maxCaps 4 + minScore 20 + budget 8000
**Recall:** 100.0% | Precision: 44.9% | Primary: 100.0%
**Avg tokens:** 2685

