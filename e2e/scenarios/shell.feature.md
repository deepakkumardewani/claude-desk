# Feature: Application Shell

As a user
I want a consistent shell around every page
So that I can navigate my Claude configuration safely

---

## Background

Given the server runs on a temp HOME seeded from `e2e/fixtures/claude-home`
And the seeded project "acme-app" exists under the temp HOME
And the stub `claude` CLI is first on the server PATH
And the browser holds a valid session token

---

## Scenario: Primary navigation links are visible

When I open the app root
Then the navigation shows "Home", "Backups", "MCP Servers", "Settings", "Usage", "Discover", "CLAUDE.md" and "Workspace" links

---

## Scenario: Scope switcher lists the seeded project

When I open the app root
And I open the "~/.claude" scope switcher
Then a menu item for "acme-app" is listed

---

## Scenario: User home summarizes the seeded configuration

When I open "/user"
Then the heading "Your user config" is visible
And the Browse region shows 3 skills, 0 plans, 2 commands, 2 agents and 1 plugin
And no "Needs attention" section is shown

---

## Scenario: Theme toggle switches between light and dark

Given the app is in light mode
When I click "Switch to dark mode"
Then the document root has the "dark" class
And the toggle is labelled "Switch to light mode"

---

## Scenario: Missing session token shows launch instructions

Given a fresh browser context with no session token
When I open the app root
Then the page shows "Open Claude Desk from the CLI"
And explains that the launch URL contains a session token
