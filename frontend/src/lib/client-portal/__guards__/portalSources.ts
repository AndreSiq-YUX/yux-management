import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const here = path.dirname(fileURLToPath(import.meta.url))
export const SRC_ROOT = path.resolve(here, '../../..')

const toPosix = (value: string) => value.split(path.sep).join('/')

const isSourceFile = (name: string) => /\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) && !name.endsWith('.d.ts')

function walk(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === '__guards__') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, found)
    else if (isSourceFile(entry.name)) found.push(toPosix(path.relative(SRC_ROOT, full)))
  }
  return found
}

/**
 * Telas reservadas ao trabalho do WhatsApp (Fase 8.4). Ficam fora dos guardas até a integração:
 * o arquivo é de outro fluxo de trabalho e não pode ser alterado nesta entrega.
 */
export const RESERVED_FILES: ReadonlySet<string> = new Set([
  // Fase 8.4 — aguarda integração do WhatsApp
  'pages/client-portal/PortalConnectedChannelsPage.tsx',
  'components/omnichannel/ConnectedChannelCard.tsx',
  'components/omnichannel/ConnectedChannelsWorkspace.tsx',
  'services/metaChannelService.ts',
])

/**
 * Arquivos-fonte renderizados no portal do cliente: `pages/client-portal/**`,
 * `components/{portal-ui,client-portal,navigation}/**` e qualquer `Portal*.tsx` em `components/`.
 * Testes e telas reservadas (`RESERVED_FILES`) ficam de fora.
 */
export function listPortalSourceFiles(): string[] {
  const files = new Set<string>()
  for (const dir of ['pages/client-portal', 'components/portal-ui', 'components/client-portal', 'components/navigation']) {
    walk(path.join(SRC_ROOT, dir)).forEach(file => files.add(file))
  }
  for (const file of walk(path.join(SRC_ROOT, 'components'))) {
    if (/\/Portal[^/]*\.tsx$/.test(file)) files.add(file)
    // Missões: as telas do portal montam estes componentes compartilhados (nova missão, plano, contexto, receitas).
    if (/^components\/action-engine\/Mission[^/]*\.tsx$/.test(file)) files.add(file)
  }
  return [...files].filter(file => !RESERVED_FILES.has(file)).sort()
}

/** Todos os arquivos-fonte (sem testes) em `src/`. */
export function listAllSourceFiles(): string[] {
  return walk(SRC_ROOT).sort()
}

export interface SourceToken {
  kind: 'string' | 'jsx-text' | 'identifier' | 'number'
  text: string
  line: number
  /** Nome do atributo JSX ou da propriedade que contém o literal, quando houver. */
  owner?: string
}

/**
 * Tokens relevantes do arquivo, sem comentários: literais de texto (strings, templates, texto JSX),
 * identificadores e números. Ignora os endereços de `import`/`export ... from`.
 */
export function readTokens(relativeFile: string): SourceToken[] {
  const text = readFileSync(path.join(SRC_ROOT, relativeFile), 'utf8')
  const source = ts.createSourceFile(relativeFile, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const tokens: SourceToken[] = []
  const lineOf = (node: ts.Node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
  const ownerOf = (node: ts.Node): string | undefined => {
    const parent = node.parent
    if (parent && ts.isJsxAttribute(parent)) return parent.name.getText(source)
    if (parent && ts.isPropertyAssignment(parent)) return parent.name.getText(source)
    return undefined
  }

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || (ts.isExportDeclaration(node) && node.moduleSpecifier)) return
    if (ts.isLiteralTypeNode(node)) return
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      tokens.push({ kind: 'string', text: node.text, line: lineOf(node), owner: ownerOf(node) })
    } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      tokens.push({ kind: 'string', text: node.text, line: lineOf(node) })
    } else if (ts.isJsxText(node)) {
      tokens.push({ kind: 'jsx-text', text: node.text, line: lineOf(node) })
    } else if (ts.isIdentifier(node)) {
      tokens.push({ kind: 'identifier', text: node.text, line: lineOf(node) })
    } else if (ts.isNumericLiteral(node)) {
      tokens.push({ kind: 'number', text: node.text, line: lineOf(node) })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return tokens
}
