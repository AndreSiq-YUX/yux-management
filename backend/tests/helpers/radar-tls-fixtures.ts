import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
export const radarTestOpenSsl=process.platform==='win32'?'C:/Program Files/Git/usr/bin/openssl.exe':'openssl'
export function createRadarTlsFixtures() {
  const dir=mkdtempSync(join(tmpdir(),'yux-radar-tls-test-'))
  const run=(...args:string[])=>execFileSync(radarTestOpenSsl,args,{cwd:dir,stdio:'pipe'})
  run('req','-x509','-newkey','rsa:2048','-nodes','-keyout','root.key','-out','root.pem','-days','3650','-subj','/CN=Radar Test Root')
  writeFileSync(join(dir,'index.txt'),'');writeFileSync(join(dir,'serial'),'1000\n')
  writeFileSync(join(dir,'ca.cnf'),`[ca]\ndefault_ca=default\n[default]\ndatabase=index.txt\nserial=serial\nnew_certs_dir=.\ncertificate=root.pem\nprivate_key=root.key\ndefault_md=sha256\npolicy=policy\nunique_subject=no\n[policy]\ncommonName=supplied\n[leaf]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:public.example\n[intermediate]\nbasicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\n`)
  run('req','-new','-newkey','rsa:2048','-nodes','-keyout','leaf.key','-out','leaf.csr','-subj','/CN=public.example')
  for(const [name,start,end,extension] of [
    ['expired','20200101000000Z','20200102000000Z','leaf'],
    ['future','20990101000000Z','20990102000000Z','leaf'],
    ['intermediate','20200101000000Z','20200102000000Z','intermediate'],
  ])run('ca','-batch','-config','ca.cnf','-in','leaf.csr','-out',`${name}.pem`,'-startdate',start,'-enddate',end,'-extensions',extension,'-notext')
  writeFileSync(join(dir,'index2.txt'),'');writeFileSync(join(dir,'serial2'),'2000\n')
  const config=readFileSync(join(dir,'ca.cnf'),'utf8').replace('database=index.txt','database=index2.txt').replace('serial=serial','serial=serial2').replace('certificate=root.pem','certificate=intermediate.pem').replace('private_key=root.key','private_key=leaf.key')
  writeFileSync(join(dir,'intermediate.cnf'),config)
  run('ca','-batch','-config','intermediate.cnf','-in','leaf.csr','-out','expired-chain-leaf.pem','-startdate','20200101000000Z','-enddate','20200102000000Z','-extensions','leaf','-notext')
  return {dir,root:readFileSync(join(dir,'root.pem'),'utf8'),key:readFileSync(join(dir,'leaf.key')),
    expired:readFileSync(join(dir,'expired.pem')),future:readFileSync(join(dir,'future.pem')),
    intermediate:readFileSync(join(dir,'intermediate.pem')),chainLeaf:readFileSync(join(dir,'expired-chain-leaf.pem'))}
}
