# Feature: Context Summary

As a user
I want to see how much of the context window my setup uses
So that I can trim what is always loaded

---

## Background

Given the stub `claude` CLI answers "/context" with fixed output
And the stub reports model "Sonnet 4.6" with 12k of 200k tokens used (6%)
And the seed has `~/.claude/CLAUDE.md` as the only memory file (1,000 tokens)

---

## Scenario: Context page shows the token summary

When I open "/workspace"
Then the heading "Context" and the subtitle "User (~/.claude)" are visible
And "12,000 tokens" and "Sonnet 4.6" are shown
And "12.0k / 200.0k (6%)" and "188.0k free" are shown

---

## Scenario: Context categories show fixed token counts

When I open "/workspace"
Then the category table lists "System prompt" with 3,000 tokens
And "System tools" with 8,000 tokens
And "Memory files" with 1,000 tokens
And "Free space" with 188,000 tokens

---

## Scenario: Memory files category expands to the CLAUDE.md entry

When I open "/workspace"
And I expand "Memory files"
Then "User · CLAUDE.md" is listed with 1,000 tokens
