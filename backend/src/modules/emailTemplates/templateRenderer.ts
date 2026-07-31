import sanitizeHtml from 'sanitize-html'
import type { RenderTemplateInput, RenderTemplateOutput } from './types.js'

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

export function sanitizeEmailHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [
      'a',
      'b',
      'blockquote',
      'br',
      'div',
      'em',
      'h1',
      'h2',
      'h3',
      'i',
      'img',
      'li',
      'ol',
      'p',
      'span',
      'strong',
      'table',
      'tbody',
      'td',
      'th',
      'thead',
      'tr',
      'u',
      'ul',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel', 'style'],
      div: ['style'],
      h1: ['style'],
      h2: ['style'],
      h3: ['style'],
      img: ['alt', 'height', 'src', 'style', 'width'],
      p: ['style'],
      span: ['style'],
      table: ['cellpadding', 'cellspacing', 'role', 'style', 'width'],
      tbody: ['style'],
      td: ['align', 'colspan', 'rowspan', 'style', 'valign', 'width'],
      th: ['align', 'colspan', 'rowspan', 'style', 'valign', 'width'],
      thead: ['style'],
      tr: ['style'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedStyles: {
      '*': {
        'background-color': [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/],
        border: [/^[#(),.%\w\s-]+$/],
        'border-radius': [/^\d+(px|%)$/],
        color: [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/],
        display: [/^(block|inline|inline-block|none)$/],
        'font-size': [/^\d+(px|em|rem|%)$/],
        'font-weight': [/^(normal|bold|[1-9]00)$/],
        'line-height': [/^[\d.]+(px|em|rem|%)?$/],
        margin: [/^[\d\s.%pxremem-]+$/],
        padding: [/^[\d\s.%pxremem-]+$/],
        'text-align': [/^(left|right|center|justify)$/],
        'text-decoration': [/^(none|underline)$/],
      },
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }, true),
    },
  })
}

export function renderEmailTemplate(input: RenderTemplateInput): RenderTemplateOutput {
  const subject = renderVariables(input.subject, input.variables, { escapeHtmlValues: false })
  const html = sanitizeEmailHtml(renderVariables(input.bodyHtml, input.variables, { escapeHtmlValues: true }))
  const text = input.bodyText
    ? renderVariables(input.bodyText, input.variables, { escapeHtmlValues: false })
    : htmlToText(html)

  return { subject, html, text }
}

function renderVariables(
  value: string,
  variables: RenderTemplateInput['variables'],
  options: { escapeHtmlValues: boolean },
) {
  return value.replace(VARIABLE_PATTERN, (_match, variableName: string) => {
    const rawValue = variables[variableName]
    const renderedValue = rawValue === null || rawValue === undefined ? '' : String(rawValue)
    return options.escapeHtmlValues ? escapeHtml(renderedValue) : renderedValue
  })
}

function htmlToText(html: string) {
  return decodeHtmlEntities(
    html
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/\s*(p|div|h1|h2|h3|li|tr)\s*>/gi, '\n')
      .replace(/<\s*li[^>]*>/gi, '- ')
      .replace(/<[^>]*>/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  )
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}
