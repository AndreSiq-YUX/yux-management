module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'react-hooks/exhaustive-deps': 'warn',
  },
  overrides: [
    {
      // Redesenho do portal (identidade visual): as telas e a biblioteca portal-ui exportam, junto do
      // componente, helpers pequenos de formatação/regra (ex.: clampPercent, matchesQueueFilter) usados
      // por testes e por outras telas. A regra só afeta o recarregamento a quente do Vite em desenvolvimento.
      files: [
        'src/components/portal-ui/**/*.{ts,tsx}',
        'src/pages/client-portal/**/*.{ts,tsx}',
        'src/components/navigation/testUtils.tsx',
        'src/components/action-engine/PortalMissionDashboard.tsx',
        'src/components/company-intelligence/formParts.tsx',
        'src/components/company-intelligence/KnowledgeLibrary.tsx',
        'src/components/crm/scoring/ScoringRuleEditor.tsx',
        'src/components/omnichannel/ConversationDetails.tsx',
        'src/components/work-items/WorkItemsDailyQueue.tsx',
      ],
      rules: { 'react-refresh/only-export-components': 'off' },
    },
    {
      // Fixtures do harness visual: linhas de banco em memória são dinâmicas por natureza.
      files: ['tests/visual/**/*.ts'],
      rules: { '@typescript-eslint/no-explicit-any': 'off' },
    },
  ],
}
