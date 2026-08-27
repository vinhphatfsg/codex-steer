---
name: codex-steer
description: Send a user-authorized steering message from the terminal to an existing local Codex Desktop thread.
---

# Codex Steer

Use the installed `codex-steer` command only when the user asks to send or queue a message to another local Codex task.

Start with:

```bash
command -v codex-steer
codex-steer --json doctor
```

Find recent desktop thread IDs:

```bash
codex-steer --json threads list --desktop-only --limit 20
```

Preview before sending when the message or destination is uncertain:

```bash
codex-steer --json send <thread-id> "message" --dry-run
```

Send only after the user has identified the destination and message:

```bash
codex-steer send <thread-id> "Focus on the failing tests first."
printf '%s\n' 'Multiline message' | codex-steer send <thread-id> -
codex-steer codex://threads/<thread-id> "Continue with the new constraint."
```

Rules:

- `send` is a live UI action that posts a user-visible message.
- Prefer `--json` when another agent will parse the result.
- Do not send to a guessed thread ID.
- Do not use UI scripting to bypass macOS permission prompts.
- The command briefly activates Codex Desktop and requires Accessibility permission for the calling terminal app.
