# Security Policy

## Supported versions

Only the latest `master` / newest release tag gets fixes.

## Scope

QueueC is a **single-operator, trusted-network app**: one queue master runs it
for their own gym session on a LAN or behind their own reverse proxy. It has
**no authentication and no multi-user model by design** — anyone who can reach
the server can drive the queue. That is the intended deployment posture, not a
vulnerability class we track, but it means:

- Don't expose a QueueC instance directly to the public internet without
  putting auth in front of it (reverse proxy + basic auth, Tailscale, VPN…).
- The SQLite database (`/data`) holds your player roster (names, skill
  levels) and session history — treat it as mildly sensitive personal data.

## Reporting a vulnerability

If you find something that matters *within that model* — injection, path
traversal, data corruption, a crash that loses session state — please open a
private security advisory via GitHub's **Report a vulnerability** on the
Security tab, or an issue if it's low severity. Include reproduction steps and
the image tag / commit. You'll hear back within a few days.
