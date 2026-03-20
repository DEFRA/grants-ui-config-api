import neostandard from 'neostandard'
import prettier from 'eslint-config-prettier'
import jestPlugin from 'eslint-plugin-jest'

export default [
  ...neostandard({
    env: ['node'],
    // @ts-ignore
    jsx: false,
    style: false,
    ignores: ['.server', 'coverage', 'node_modules', '.idea', '.vscode']
  }),
  prettier,
  {
    rules: {
      'no-console': 'error',
      curly: ['error', 'all'],
      '@stylistic/space-before-function-paren': 'off',
      '@stylistic/quotes': 'off',
      '@stylistic/eol-last': 'off',
      '@stylistic/no-trailing-spaces': 'off',
      '@stylistic/indent': 'off'
    }
  },
  {
    files: ['**/*.test.{js,cjs,mjs}', '**/__stubs__/**/*.{js,cjs,mjs}', '**/__mocks__/**/*.{js,cjs,mjs}'],
    plugins: {
      jest: jestPlugin
    },
    languageOptions: {
      globals: {
        ...jestPlugin.environments.globals.globals
      }
    },
    rules: {
      ...jestPlugin.configs.recommended.rules,
      ...jestPlugin.configs.style.rules,
      curly: 'off'
    }
  },
  {
    files: ['scripts/**/*.{js,cjs,mjs}'],
    rules: {
      'no-console': 'off'
    }
  }
]
