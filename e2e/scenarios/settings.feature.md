# Feature: Settings Editor

As a user
I want to edit settings.json through a form
So that I can change Claude Code behaviour without hand-editing JSON

---

## Background

Given the temp HOME is reset to the seed before the suite
And the seed `~/.claude/settings.json` has model "sonnet" and effortLevel "medium"
And the seed enables plugin "acme-tools@acme-market"

---

## Scenario: Settings page lists sections and option count

When I open "/user/settings"
Then the heading "Configuration" is visible
And "settings.json" is shown with "83 options"
And the sections "General", "Permissions", "Hooks", "Plugins & Marketplaces" and "MCP Servers" are listed

---

## Scenario: Changing the model saves it to settings.json

When I open "/user/settings"
And I fill the "Model" field with "opus"
And I click "Save settings"
Then "Settings saved." is shown
And `~/.claude/settings.json` on the temp HOME has model "opus"
And the seeded env and permissions are still present

---

## Scenario: Invalid value blocks saving with a validation error

When I open "/user/settings"
And I fill the "Cleanup Period Days" field with "30"
And I click "Save settings"
Then "Invalid input" is shown
And `~/.claude/settings.json` is not changed by the rejected save
And "Fix 1 validation error before saving." is shown
When I click "Discard"
Then the validation error disappears
