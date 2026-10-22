import {expect,it} from 'vitest'
import {radarTlsEvidencePages} from '../src/modules/radar/tls-evidence.js'
it('keeps an expired-certificate diagnostic from the exact public-read history until that URL is successfully read',()=>{
 const page={url:'https://company.example/',text:'',observedAt:'2026-10-22',limitation:'tls_expired',diagnostic:{kind:'tls_expired'},certificate:{hostname:'company.example',fingerprint256:'abc',validTo:'2026-07-29'}};
 const run:any={output:{pages:[]},calls:{old:{source:'public_read',status:'completed',result:[page]}}};
 expect(radarTlsEvidencePages(run)).toEqual([page]);
 run.output.pages=[{...page,text:'Valid public company page',limitation:undefined,diagnostic:undefined,certificate:undefined}];
 expect(radarTlsEvidencePages(run)).toEqual(run.output.pages);
});
