# Feature: Backups

As a user
I want automatic snapshots of files I save
So that I can restore a previous version

---

## Background

Given the temp HOME is reset to the seed before the suite
And no backups exist yet
And `~/.claude/settings.json` has model "sonnet"

---

## Scenario: Backups page is empty before any save

When I open "/backups"
Then "No backups yet. Saving a file creates a snapshot automatically." is shown

---

## Scenario: Saving settings creates a backup entry

Given I saved settings with model "opus"
When I open "/backups"
Then a "settings.json" entry with "1 backup" is listed

---

## Scenario: Restoring a backup restores the file content

Given a backup of settings.json exists from the earlier save
When I expand the "settings.json" entry
And I click "Restore" and accept the confirmation
Then "Restored backup from" is shown
And `~/.claude/settings.json` on the temp HOME has model "sonnet" again
