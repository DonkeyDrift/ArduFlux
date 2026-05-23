English | [中文](CONTRIBUTING.zh-CN.md)

# Contributing Guide

Thanks for your interest in contributing to ArduFlux! Please read the following guidelines before submitting changes.

## Documentation Requirements (Critical)

**Dual-language README synchronization is mandatory:**
- This project maintains two README files: `README.md` (English) and `README.zh-CN.md` (Chinese).
- Any content modification to one README **must** be applied to the other file immediately, with identical structure and technical accuracy.
- Do not add language-specific content to only one file unless explicitly marked as locale-specific.
- When adding new documentation files intended for both audiences, follow the same naming convention: `<name>.md` for English, `<name>.zh-CN.md` for Chinese.

## Development Workflow

1. Fork the repository and create your feature branch from `master`.
2. Set up the development environment:
   ```bash
   npm install
   npm run watch
   ```
3. Press `F5` in VS Code to launch the extension development host for testing.

## Code Standards

- TypeScript strict mode is enabled (`strict: true` in `tsconfig.json`); do not use `any` type without explicit justification.
- Keep functions small and single-responsibility.
- Use meaningful variable and function names; avoid ambiguous abbreviations.
- Write comments only to explain **why** a non-obvious decision was made, not **what** the code does.

## Testing

- All new features or bug fixes **must** include corresponding unit tests.
- Run the full test suite before submitting:
  ```bash
  npm test
  ```
- Test files are located in `src/test/`, grouped by module.

## Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) format, written in Chinese:

- `feat:` New feature
- `fix:` Bug fix
- `refactor:` Code refactoring (neither fixes a bug nor adds a feature)
- `test:` Adding or updating tests
- `chore:` Build tools or auxiliary tool changes
- `docs:` Documentation updates

Example:
```
feat(serial): add automatic baud rate detection
```

## Pull Requests

- Keep PRs focused and scoped to a single feature or fix.
- Include a clear description of what the change does and why it is needed.
- Make sure all CI checks pass before requesting review.
