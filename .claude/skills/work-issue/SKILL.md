---
name: work-issue
description: Take a GitHub issue from the project board through branch, implementation, checks, commit, push and a PR that closes it. Use when the user types /work-issue <number>.
argument-hint: <issue-number>
disable-model-invocation: true
---

# Work on GitHub issue #$ARGUMENTS

Follow these steps in order. Stop and report to the user whenever a step fails. Do not loop on fixes.

## 1. Preconditions

- `gh auth status` must succeed. If `gh` is missing, tell the user to run `winget install --id GitHub.cli` and `gh auth login`, then stop.
- `git status --porcelain` must be empty. If there are uncommitted changes, list them and ask the user what to do. Never stash or discard them yourself.

## 2. Read the issue

```bash
gh issue view $ARGUMENTS --json number,title,body,labels,state,comments
```

- If the issue is closed, ask before continuing.
- Summarize the task in 2–3 lines and list the acceptance criteria you will work to. If the issue is too vague to implement, ask the user before writing code.

## 3. Branch from up-to-date main

```bash
git checkout main
git pull --ff-only
git checkout -b $ARGUMENTS-<short-kebab-title>
```

Keep the title part to 3–5 words taken from the issue title. If the branch already exists, check it out instead of creating it.

## 4. Implement

- Follow CLAUDE.md. Postgres/Drizzle only, never Firestore.
- For any new table or migration, follow the `/new-migration` skill.
- Keep the change scoped to this issue. If you notice other problems, mention them at the end instead of fixing them.

## 5. Run checks

Run the root checks:

```bash
npm run typecheck && npm run lint && npm test
```

If `backend/` was touched, also run:

```bash
cd backend && npm run typecheck && npm test
```

If anything fails, show the failing output, say whether the failure is caused by this change or already existed on `main`, and stop.

## 6. Commit

Stage only the files you changed for this issue, never `git add -A`. Then commit:

```
<Imperative summary of the change> (#$ARGUMENTS)

<1–3 lines on what changed and why>
```

## 7. Push and open the PR (ask first)

Show the user the branch name, the commit and the files changed, and ask for confirmation. Then run:

```bash
git push -u origin <branch>
gh pr create --base main --title "<issue title>" --body "<summary of the change>

Closes #$ARGUMENTS"
```

Report the PR URL. The project board moves the card to In Progress now and to Done when the PR is merged.
