# Feature: MCP Servers

As a user
I want to manage MCP servers
So that Claude Code can reach my tools

---

## Background

Given the temp HOME is reset to the seed before the suite
And the seed `~/.claude.json` has user servers "local-echo" (stdio, node) and "broken-remote" (http, http://127.0.0.1:9/mcp)
And the stub `claude` CLI reports http servers as failed and all others as connected

---

## Scenario: MCP page lists installed servers with health

When I open "/user/mcp"
Then the heading "MCP Servers" is visible
And "local-echo" is listed as STDIO and connected
And "broken-remote" is listed as HTTP and failed

---

## Scenario: Adding a custom stdio server writes it to .claude.json

When I click "Add custom"
And I choose scope "User" and enter the name "e2e-custom"
And I enter the command "node" and the arguments "-e 0"
And I click "Add Server"
Then "e2e-custom" appears in the installed list
And `~/.claude.json` on the temp HOME has user server "e2e-custom" with command "node"

---

## Scenario: Removing a server deletes it from .claude.json

Given the custom server "e2e-custom" is installed
When I click "Remove" on "e2e-custom"
Then "e2e-custom" disappears from the installed list
And `~/.claude.json` on the temp HOME no longer has "e2e-custom"
And "local-echo" is still present

---

## Scenario: Installing a catalog server adds it to .claude.json

When I open the catalog entry "Memory" and click "Install"
Then the dialog shows "Installs as: server-memory"
When I click "Install Server"
Then `~/.claude.json` on the temp HOME has user server "server-memory"
