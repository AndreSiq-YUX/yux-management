import {mkdir,writeFile} from 'node:fs/promises'
import {dirname,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {compileFromFile} from 'json-schema-to-typescript'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const schema='contracts/radar/v1/radar-research.schema.json'
const source=await compileFromFile(resolve(root,schema),{bannerComment:`/* Generated from ${schema}. Do not edit manually. */`,enableConstEnums:false,unknownAny:true,
 style:{singleQuote:true,semi:false,tabWidth:2,trailingComma:'all'}})
for(const target of ['backend/src/contracts/generated/radarResearch.ts','frontend/src/types/generated/radarResearch.ts']){
 const path=resolve(root,target)
 await mkdir(dirname(path),{recursive:true})
 await writeFile(path,source.replaceAll('\r\n','\n'),'utf8')
}
