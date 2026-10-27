import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const architecturePlugin = {
  rules: {
    "feature-public-api": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          internalImport:
            "Import from another feature through its public index instead of '{{source}}'.",
        },
      },
      create(context) {
        const filename = context.filename.replaceAll("\\", "/")
        const feature = filename.match(/\/src\/features\/([^/]+)\//)?.[1]

        return {
          ImportDeclaration(node) {
            if (!feature || typeof node.source.value !== "string") return
            const match = node.source.value.match(/^@\/features\/([^/]+)\/.+/)
            if (match && match[1] !== feature) {
              context.report({
                node: node.source,
                messageId: "internalImport",
                data: { source: node.source.value },
              })
            }
          },
        }
      },
    },
  },
}

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/*', '@/app/*'],
              message: 'Shared code cannot depend on features or app internals.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/features/**/*.{ts,tsx}'],
    plugins: {
      architecture: architecturePlugin,
    },
    rules: {
      'architecture/feature-public-api': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/app/config/*',
                '@/app/providers/*',
                '@/app/router/*',
                '@/app/store/*',
              ],
              message: 'Features may only use app-level public APIs, not app internals.',
            },
          ],
        },
      ],
    },
  },
])
