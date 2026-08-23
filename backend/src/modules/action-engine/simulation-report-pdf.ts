import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { SimulationReportSnapshot } from './simulation-reports.js'

const PAGE = { width: 595.28, height: 841.89, margin: 52 }
const colors = {
  ink: rgb(0.06, 0.09, 0.16), muted: rgb(0.36, 0.41, 0.49),
  blue: rgb(0.15, 0.39, 0.92), paleBlue: rgb(0.93, 0.96, 1),
  amber: rgb(0.72, 0.35, 0.02), paleAmber: rgb(1, 0.97, 0.88),
  line: rgb(0.86, 0.88, 0.91), white: rgb(1, 1, 1),
}

export async function renderSimulationReportPdf(snapshot: SimulationReportSnapshot): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  const regular = await document.embedFont(StandardFonts.Helvetica)
  const bold = await document.embedFont(StandardFonts.HelveticaBold)
  const fixedDate = new Date(snapshot.createdAt)
  document.setTitle(`Simulacao YUX - ${snapshot.missionTitle}`)
  document.setAuthor('YUX')
  document.setSubject('Relatorio imutavel de simulacao de Mission')
  document.setCreationDate(fixedDate)
  document.setModificationDate(fixedDate)

  let page = addPage(document, regular, bold)
  let y = PAGE.height - 82
  page.drawText('YUX MISSIONS', { x: PAGE.margin, y, size: 10, font: bold, color: colors.blue })
  y -= 34
  y = drawWrapped(page, sanitizePdfText(snapshot.missionTitle), PAGE.margin, y, PAGE.width - PAGE.margin * 2, 24, bold, colors.ink, 29)
  y -= 14
  y = drawWrapped(page, sanitizePdfText(snapshot.objective), PAGE.margin, y, PAGE.width - PAGE.margin * 2, 11, regular, colors.muted, 17)
  y -= 24
  page.drawRectangle({ x: PAGE.margin, y: y - 54, width: PAGE.width - PAGE.margin * 2, height: 54, color: colors.paleBlue })
  page.drawText('SIMULACAO - NENHUM EFEITO EXECUTADO', { x: PAGE.margin + 16, y: y - 23, size: 11, font: bold, color: colors.blue })
  page.drawText(`Valida ate ${formatDate(snapshot.expiresAt)} | Revisao ${snapshot.planRevision}`, { x: PAGE.margin + 16, y: y - 41, size: 9, font: regular, color: colors.muted })
  y -= 82

  ;({ page, y } = ensureSpace(document, page, y, 110, regular, bold))
  y = sectionTitle(page, 'O que sera criado ou alterado', y, bold)
  for (const change of snapshot.changes) {
    ;({ page, y } = ensureSpace(document, page, y, 42, regular, bold))
    page.drawText(String(change.quantity), { x: PAGE.margin, y, size: 16, font: bold, color: colors.blue })
    y = drawWrapped(page, sanitizePdfText(change.label), PAGE.margin + 36, y + 1, PAGE.width - PAGE.margin * 2 - 36, 10, regular, colors.ink, 14)
    y -= 8
  }

  ;({ page, y } = ensureSpace(document, page, y, 130, regular, bold))
  y = sectionTitle(page, 'Impacto e economia', y, bold)
  const facts = [
    ['Contatos existentes', String(snapshot.contactImpact.existingContacts)],
    ['Novos elegiveis', snapshot.contactImpact.futureEligibleContacts ? 'Sim' : 'Nao'],
    ['Canais', snapshot.contactImpact.channels.join(', ') || 'Nenhum envio externo'],
    ['Custo estimado', `R$ ${decimalPtBr(snapshot.economics.estimatedCostBrl)}`],
    ['Custo maximo', `R$ ${decimalPtBr(snapshot.economics.maximumCostBrl)}`],
    ['Trabalho humano', `${snapshot.economics.estimatedHumanMinutes} min`],
  ]
  for (let index = 0; index < facts.length; index += 1) {
    const column = index % 2
    const row = Math.floor(index / 2)
    const x = PAGE.margin + column * 245
    const factY = y - row * 42
    page.drawText(facts[index]![0], { x, y: factY, size: 8, font: bold, color: colors.muted })
    page.drawText(sanitizePdfText(facts[index]![1]), { x, y: factY - 16, size: 11, font: regular, color: colors.ink })
  }
  y -= 140

  if (snapshot.irreversibleEffects.length) {
    ;({ page, y } = ensureSpace(document, page, y, 100, regular, bold))
    page.drawRectangle({ x: PAGE.margin, y: y - 72, width: PAGE.width - PAGE.margin * 2, height: 72, color: colors.paleAmber })
    page.drawText('EFEITOS IRREVERSIVEIS', { x: PAGE.margin + 14, y: y - 20, size: 9, font: bold, color: colors.amber })
    let warningY = y - 39
    for (const effect of snapshot.irreversibleEffects) {
      warningY = drawWrapped(page, `- ${sanitizePdfText(effect.description)}`, PAGE.margin + 14, warningY, PAGE.width - PAGE.margin * 2 - 28, 9, regular, colors.amber, 13)
    }
    y -= 92
  }

  ;({ page, y } = ensureSpace(document, page, y, 120, regular, bold))
  y = sectionTitle(page, 'Premissas e prova tecnica', y, bold)
  if (snapshot.assumptions.length === 0) {
    page.drawText('Nenhuma premissa adicional declarada.', { x: PAGE.margin, y, size: 9, font: regular, color: colors.muted })
    y -= 22
  } else {
    for (const assumption of snapshot.assumptions) {
      y = drawWrapped(page, `- ${sanitizePdfText(assumption.key)}: ${sanitizePdfText(assumption.value)} (${sanitizePdfText(assumption.source)})`, PAGE.margin, y, PAGE.width - PAGE.margin * 2, 9, regular, colors.ink, 15)
      y -= 5
    }
  }
  const proofs = [
    `Pack: ${snapshot.technicalProof.packVersion}`,
    `Plano: ${snapshot.technicalProof.planHash}`,
    `Manifesto: ${snapshot.technicalProof.manifestHash}`,
    `Fontes registradas: ${snapshot.technicalProof.sourceCount}`,
    `Redaction: v${snapshot.redactionVersion}`,
  ]
  for (const proof of proofs) {
    ;({ page, y } = ensureSpace(document, page, y, 28, regular, bold))
    y = drawWrapped(page, proof, PAGE.margin, y, PAGE.width - PAGE.margin * 2, 8, regular, colors.muted, 11)
  }

  for (const [index, outputPage] of document.getPages().entries()) {
    outputPage.drawLine({ start: { x: PAGE.margin, y: 38 }, end: { x: PAGE.width - PAGE.margin, y: 38 }, thickness: 0.5, color: colors.line })
    outputPage.drawText(`YUX | Relatorio imutavel ${snapshot.reportHash.slice(0, 12)} | ${index + 1}/${document.getPageCount()}`, { x: PAGE.margin, y: 23, size: 7, font: regular, color: colors.muted })
  }
  return document.save({ useObjectStreams: false })
}

function addPage(document: PDFDocument, regular: PDFFont, bold: PDFFont) {
  const page = document.addPage([PAGE.width, PAGE.height])
  page.drawRectangle({ x: 0, y: PAGE.height - 9, width: PAGE.width, height: 9, color: colors.blue })
  page.drawText('SIMULACAO', { x: PAGE.width - PAGE.margin - 68, y: PAGE.height - 31, size: 8, font: bold, color: colors.blue, opacity: 0.65 })
  page.drawText('Documento de revisao - sem autoridade de execucao', { x: PAGE.margin, y: 51, size: 7, font: regular, color: colors.muted })
  return page
}

function ensureSpace(document: PDFDocument, page: PDFPage, y: number, needed: number, regular: PDFFont, bold: PDFFont) {
  if (y - needed > 68) return { page, y }
  return { page: addPage(document, regular, bold), y: PAGE.height - 64 }
}

function sectionTitle(page: PDFPage, title: string, y: number, font: PDFFont) {
  page.drawText(title, { x: PAGE.margin, y, size: 13, font, color: colors.ink })
  page.drawLine({ start: { x: PAGE.margin, y: y - 8 }, end: { x: PAGE.width - PAGE.margin, y: y - 8 }, thickness: 0.7, color: colors.line })
  return y - 28
}

function drawWrapped(page: PDFPage, text: string, x: number, y: number, width: number, size: number, font: PDFFont, color: ReturnType<typeof rgb>, lineHeight: number) {
  const words = text.split(/\s+/).filter(Boolean)
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= width || !line) line = candidate
    else { page.drawText(line, { x, y, size, font, color }); y -= lineHeight; line = word }
  }
  if (line) { page.drawText(line, { x, y, size, font, color }); y -= lineHeight }
  return y
}

function sanitizePdfText(value: string) { return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, ' ').trim() }
function decimalPtBr(value: string) { const [whole, decimals = '00'] = value.split('.'); return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${decimals.padEnd(2, '0').slice(0, 2)}` }
function formatDate(value: string) { return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date(value)) }
