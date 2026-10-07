# Feature: Discover

As a user
I want to search for and install skills
So that I can extend Claude Code from the browser

---

## Background

Given the temp HOME is reset to the seed before the suite
And the GitHub API, raw and skills.sh endpoints point at a loopback stub through environment variables
And the stub serves only the repository "anthropics/skills" with one skill "skill-creator"
And no skill "skill-creator" is installed yet

---

## Scenario: Exploring a GitHub repo lists its skills

When I open "/discover" and the "GitHub repo" tab
And I enter "anthropics/skills" and click "Explore"
Then the repository header "anthropics/skills" is shown
And the item "skill-creator" is listed under Skills (1)

---

## Scenario: Installing a skill to user scope writes it to disk

Given I explored "anthropics/skills"
When I select "skill-creator" and click "Install…"
And I keep the "User" target and continue through Changes and Trust review
And I click "Apply"
Then "Installed: skill-creator" is shown
And `~/.claude/skills/skill-creator/SKILL.md` exists on the temp HOME

---

## Scenario: Installed tab lists the installed skill

When I open the "Installed" tab
Then "1 installed item" is shown
And "skill-creator" is listed as a skill from "anthropics/skills" with status "Up to date"

---

## Scenario: Uninstalling a skill removes it from disk

Given "skill-creator" is installed
When I click "Uninstall skill-creator" and confirm "Uninstall"
Then `~/.claude/skills/skill-creator` no longer exists on the temp HOME
And the Installed tab no longer lists "skill-creator"

---

## Scenario: skills.sh search lists recorded results

When I open the "skills.sh" tab
And I type "skill" into "Search skills.sh"
Then recorded results such as "vercel-react-best-practices" are listed

---

## Scenario: Discover makes no outbound requests

Given the stub request log was recorded during the suite
Then the stub log has no unmatched entries
And the browser made no requests to hosts other than the local server
