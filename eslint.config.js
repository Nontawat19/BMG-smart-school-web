import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // NOTE: ESLint's flat-config `ignores` follows gitignore semantics — a file
    // cannot be re-included with `!pattern` if one of its *parent directories*
    // is already excluded by an earlier, non-negated pattern (e.g. '**/*').
    // That bug previously made every '!...' line below a no-op, so the entire
    // schedule subsystem was silently skipped by ESLint. Each parent directory
    // must be explicitly un-ignored on its own line for the negation to apply.
    ignores: [
      '**/*',
      '!src',
      '!src/pages',
      '!src/pages/AcademicDepartment',
      '!src/pages/AcademicDepartment/schedule',
      '!src/pages/AcademicDepartment/schedule/**',
      '!src/components',
      '!src/components/Schedule',
      '!src/components/Schedule/**',
      '!src/components/Pdf',
      '!src/components/Pdf/TeacherScheduleDocument.tsx',
      '!src/components/Pdf/StudentScheduleDocument.tsx',
      '!src/utils',
      '!src/utils/scheduleDisplayUtils.ts',
      '!eslint.config.js',
      'dist/**',
      'functions/**',
      'node_modules/**',
      'public/**',
      'scratch/**',
      'tsconfig.tsbuildinfo',
      'src/styles/postlist.zip'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: [
      'src/pages/AcademicDepartment/schedule/**/*.{ts,tsx}',
      'src/components/Schedule/**/*.{ts,tsx}',
      'src/components/Pdf/TeacherScheduleDocument.tsx',
      'src/components/Pdf/StudentScheduleDocument.tsx',
      'src/utils/scheduleDisplayUtils.ts',
      'eslint.config.js'
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'off',
      'no-console': 'off',
      'no-case-declarations': 'off',
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-require-imports': 'off'
    }
  }
);
