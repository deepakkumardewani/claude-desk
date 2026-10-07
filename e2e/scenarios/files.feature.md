# Feature: Workspace Files

As a user
I want to browse and edit my skills, agents and CLAUDE.md
So that I can maintain my Claude configuration from the browser

---

## Background

Given the temp HOME is reset to the seed before the suite
And the seed has skills "release-notes", "code-review-helper" and "pdf-tools"
And the seed has agents "reviewer" and "planner"
And the seed has `~/.claude/CLAUDE.md` containing "Prefer small, reviewable changes."

---

## Scenario: Browse the skills tree and open a skill file

When I open "/user"
And I expand the "release-notes" skill in the sidebar tree
And I open "SKILL.md"
Then the heading "release-notes" is visible
And the description "Draft release notes from merged pull requests." is shown
And an "Edit" button is available

---

## Scenario: View an agent file

When I open "/user/agents/reviewer.md"
Then the heading "reviewer" is visible
And the description "Reviews pull requests for correctness and style." is shown

---

## Scenario: Cancelling an edit leaves the skill file unchanged

Given I am viewing "/user/skills/release-notes/SKILL.md"
When I click "Edit"
And I type extra text into the editor
Then "Unsaved changes" is shown
When I click "Cancel" and confirm "Discard"
Then the skill file on disk is byte-identical to the seed

---

## Scenario: Editing a skill file saves it to disk

Given I am viewing "/user/skills/release-notes/SKILL.md"
When I click "Edit"
And I append the line "Edited by e2e." at the end of the document
And I click "Save"
Then the view mode is shown again
And `~/.claude/skills/release-notes/SKILL.md` on the temp HOME ends with "Edited by e2e."
And the file still starts with its original frontmatter

---

## Scenario: Editing CLAUDE.md saves it to disk

Given I am viewing "/user/claude-md"
When I click "Edit"
And I append the line "Always add e2e coverage." at the end of the document
And I click "Save"
Then `~/.claude/CLAUDE.md` on the temp HOME contains "Always add e2e coverage."
And still contains "Prefer small, reviewable changes."

---

## Scenario: Opening a missing skill file shows an error

When I open "/user/skills/release-notes" without a file name
Then the page shows "Unable to load this file."
And the two expected 404 console errors are tolerated
