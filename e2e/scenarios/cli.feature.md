# Feature: CLI Server

As a user
I want the CLI to start a protected local studio
So that only my browser session can read my config

---

## Background

Given a second instance of `apps/cli/dist/bin.mjs` is started
And it uses its own temp HOME created with `createTempHome` and the seed
And it listens on an ephemeral port via `--port 0`
And its environment is minimal: HOME, PATH with the stub bin, and `CC_STUDIO_NO_OPEN=1`
And the child process is always killed after the suite

---

## Scenario: Instance prints a tokenized launch URL

When the instance finishes starting
Then it prints a loopback URL with the form "http://127.0.0.1:<port>/#token=<token>"
And the port is not 0

---

## Scenario: Instance serves the static UI

When I request the root URL without a token
Then the response is 200 HTML that references the built assets

---

## Scenario: Unauthenticated API requests are rejected

When I request "/api/health" without credentials
Then the response status is 401

---

## Scenario: Authenticated API requests succeed

When I request "/api/health" with the Bearer token from the printed URL
Then the response status is 200
