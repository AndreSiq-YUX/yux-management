import { createHash, randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { createIntegrationRig } from './support/rig.js'

it('recebe arquivos reais e recupera a ingestão sem publicar conteúdo não extraído', async () => {
  const rig = await createIntegrationRig()
  const packId = randomUUID()
  const text = Buffer.from('Guia público de integração.\n\nSempre validar os dados antes de executar a próxima ação.', 'utf8')
  try {
    await rig.sql(
      `INSERT INTO public.yux_strategy_packs (id,pack_key,name,description,scope,visibility,status,owner_organization_id)
       VALUES ($1,$2,'Pack de upload','Teste sem material privado','client','internal_only','draft',$3)`,
      [packId, `upload-${packId}`, rig.ids.organizationA],
    )

    const denied = await rig.request('client_admin_A', 'POST', `/api/strategy-engine/packs/${packId}/ingestions`, {
      fileName: 'guia.txt', mimeType: 'text/plain', byteSize: text.length,
    })
    expect(denied.statusCode).toBe(403)

    const created = await createIngestion(rig, packId, 'guia.txt', 'text/plain', text.length)
    expect(created).toMatchObject({ status: 'awaiting_upload', stage: 'upload', attempt: 0 })
    const uploaded = await rig.request(
      'yux_admin', 'PUT', `/api/strategy-engine/ingestions/${created.ingestionId}/file`, text,
      { 'content-type': 'application/octet-stream', 'x-content-sha256': createHash('sha256').update(text).digest('hex') },
    )
    expect(uploaded.statusCode).toBe(202)
    expect(uploaded.body).toMatchObject({ status: 'queued', duplicate: false })

    await rig.restartApi()
    const afterRestart = await rig.request('yux_admin', 'GET', `/api/strategy-engine/ingestions/${created.ingestionId}`)
    expect(afterRestart.body.status).toBe('queued')
    await rig.workerTick()
    const completed = await rig.request('yux_admin', 'GET', `/api/strategy-engine/ingestions/${created.ingestionId}`)
    expect(completed.body).toMatchObject({ status: 'completed', stage: 'proposals', attempt: 1 })
    const chunks = await rig.sql(`SELECT chunk_text FROM public.yux_strategy_source_chunks WHERE document_id=$1`, [uploaded.body.documentId])
    expect(chunks.rows.map(row => row.chunk_text).join(' ')).toContain('Sempre validar os dados')

    const duplicate = await createIngestion(rig, packId, 'guia-copia.txt', 'text/plain', text.length)
    const duplicateUpload = await rig.request(
      'yux_admin', 'PUT', `/api/strategy-engine/ingestions/${duplicate.ingestionId}/file`, text,
      { 'content-type': 'application/octet-stream' },
    )
    expect(duplicateUpload.body).toMatchObject({ status: 'queued', duplicate: true, documentId: uploaded.body.documentId })

    const interrupted = await createIngestion(rig, packId, 'interrompido.txt', 'text/plain', text.length)
    const partial = await rig.request(
      'yux_admin', 'PUT', `/api/strategy-engine/ingestions/${interrupted.ingestionId}/file`, text.subarray(0, 8),
      { 'content-type': 'application/octet-stream' },
    )
    expect(partial.statusCode).toBe(400)
    const interruptedState = await rig.request('yux_admin', 'GET', `/api/strategy-engine/ingestions/${interrupted.ingestionId}`)
    expect(interruptedState.body.recoverableError).toMatchObject({ recoverable: true })
    const retried = await rig.request(
      'yux_admin', 'PUT', `/api/strategy-engine/ingestions/${interrupted.ingestionId}/file`, text,
      { 'content-type': 'application/octet-stream' },
    )
    expect(retried.statusCode).toBe(202)

    const mismatch = await createIngestion(rig, packId, 'hash.txt', 'text/plain', text.length)
    const hashMismatch = await rig.request(
      'yux_admin', 'PUT', `/api/strategy-engine/ingestions/${mismatch.ingestionId}/file`, text,
      { 'content-type': 'application/octet-stream', 'x-content-sha256': '0'.repeat(64) },
    )
    expect(hashMismatch.statusCode).toBe(400)
    expect(hashMismatch.body.error).toBe('strategy_file_hash_mismatch')

    const invalidBytes = Buffer.from('não é PDF')
    const invalid = await createIngestion(rig, packId, 'invalido.pdf', 'application/pdf', invalidBytes.length)
    const invalidUpload = await rig.request(
      'yux_admin', 'PUT', `/api/strategy-engine/ingestions/${invalid.ingestionId}/file`, invalidBytes,
      { 'content-type': 'application/octet-stream' },
    )
    expect(invalidUpload.statusCode).toBe(400)

    const blankPdf = await PDFDocument.create()
    blankPdf.addPage()
    const blankBytes = Buffer.from(await blankPdf.save())
    const needsOcr = await createIngestion(rig, packId, 'digitalizado.pdf', 'application/pdf', blankBytes.length)
    expect((await rig.request(
      'yux_admin', 'PUT', `/api/strategy-engine/ingestions/${needsOcr.ingestionId}/file`, blankBytes,
      { 'content-type': 'application/octet-stream' },
    )).statusCode).toBe(202)
    await rig.workerTick()
    const ocrState = await rig.request('yux_admin', 'GET', `/api/strategy-engine/ingestions/${needsOcr.ingestionId}`)
    expect(ocrState.body).toMatchObject({ status: 'extraction_requires_ocr', stage: 'ocr' })
    expect(ocrState.body.status).not.toBe('completed')
  } finally {
    await rig.close()
  }
})

async function createIngestion(
  rig: Awaited<ReturnType<typeof createIntegrationRig>>,
  packId: string,
  fileName: string,
  mimeType: string,
  byteSize: number,
) {
  const response = await rig.request('yux_admin', 'POST', `/api/strategy-engine/packs/${packId}/ingestions`, {
    fileName, mimeType, byteSize, sourceName: `Fonte ${fileName}`, sourceKind: 'internal_playbook',
  })
  expect(response.statusCode).toBe(201)
  return response.body
}
