# Feature: Usage Dashboard

As a user
I want to see token and cost usage from my transcripts
So that I understand what Claude Code spends

---

## Background

Given the server runs with TZ=UTC and the browser uses the UTC time zone
And the seed has 4 transcripts across projects "workspace/acme-app" and "workspace/billing-api"

<!-- Fixture totals (all time): cost $0.1728, 4 sessions, 2 projects, 23.5K tokens (16000 in, 7500 out, 5000 cache read, 1000 cache write) -->

And usage is read from the "All time" range with fixed dates in June 2026

---

## Scenario: Usage overview shows all-time totals

When I open "/usage"
And the usage data has finished loading
Then the cost "$0.1728" is shown
And "4" sessions and "2" projects are shown
And "23.5K" tokens are shown

---

## Scenario: Usage timeline lists the four seeded days

When I open "/usage" and select the "Timeline" tab
Then the days 2026-06-10, 2026-06-11, 2026-06-12 and 2026-06-14 are listed
And their costs are "$0.0455", "$0.0090", "$0.0865" and "$0.0318"

---

## Scenario: Usage models tab shows the per-model split

When I select the "Models" tab
Then "opus-4-7" shows "$0.0900" and "52.1%"
And "sonnet-4-6" shows "$0.0683" and "39.5%"
And "haiku-4-5" shows "$0.0145" and "8.4%"

---

## Scenario: Usage projects tab shows the per-project cost

When I select the "Projects" tab
Then "workspace/billing-api" shows "$0.0867"
And "workspace/acme-app" shows "$0.0860"

---

## Scenario: Usage sessions tab lists four sessions

When I select the "Sessions" tab
Then 4 session rows are listed
And the session costs include "$0.0813", "$0.0545", "$0.0315" and "$0.0055"

---

## Scenario: Usage prompts tab lists seven prompts

When I select the "Prompts" tab
Then 7 prompts are listed
And "Explain the ledger schema" is shown with "$0.0055"
And "Add retry logic to the fetch client" is shown with "$0.0105"
