module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Type must be one of the following
    'type-enum': [
      2,
      'always',
      [
        'feat', // New feature
        'fix', // Bug fix
        'docs', // Documentation only changes
        'style', // Code style changes (formatting, semicolons, etc)
        'refactor', // Code refactoring (no functional changes)
        'perf', // Performance improvements
        'test', // Adding or updating tests
        'build', // Build system or external dependencies
        'ci', // CI/CD configuration
        'chore', // Other changes (maintenance tasks)
        'revert', // Revert a previous commit
      ],
    ],
    // Subject must not be empty
    'subject-empty': [2, 'never'],
    // Subject must be lowercase
    'subject-case': [2, 'always', 'lower-case'],
    // Type must not be empty
    'type-empty': [2, 'never'],
    // Type must be lowercase
    'type-case': [2, 'always', 'lower-case'],
    // Header max length
    'header-max-length': [2, 'always', 100],
    // Body max line length
    'body-max-line-length': [2, 'always', 200],
  },
};
