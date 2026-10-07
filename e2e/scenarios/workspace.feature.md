# Feature: Workspace Scopes

As a user
I want to switch between user and project scope
So that I can inspect each configuration separately

---

## Background

Given the server runs on a temp HOME seeded from `e2e/fixtures/claude-home`
And the only discovered project is "acme-app" under the temp HOME `workspace` folder
And the project has no skills, plans, commands, agents or plugins of its own

---

## Scenario: Workspace page shows user scope by default

When I open "/workspace"
Then the Context heading with subtitle "User (~/.claude)" is visible
And the "Refresh context summary" button is available

---

## Scenario: Switching to the project scope opens the project workspace

When I open the scope switcher and choose "acme-app"
Then the URL points at the project route
And the project home is shown for "acme-app"

---

## Scenario: Project workspace context names the project

Given I am in the "acme-app" scope
When I open its Workspace page
Then the Context subtitle is "acme-app"
And the user CLAUDE.md memory file is still counted at 1,000 tokens
