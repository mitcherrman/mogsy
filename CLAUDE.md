# Mogzy frontend — Claude Code rules

Read [AGENTS.md](AGENTS.md) before running tools or tests. Its local-browser safety rules apply to every task, every subagent, and every worktree. **Never run automated local Microsoft Edge/Google Chrome or visible browser sessions.** Use GitHub Actions for browser acceptance; request approval for any bundled headless Chromium locally. Respect branch isolation, test evidence and no unapproved deploy.
