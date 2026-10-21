import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {RadarFunnelReportPanel} from './RadarFunnelReportPanel';
import type {RadarFunnelReport} from '@/types/radarFunnel';

const getFunnelReport=vi.fn();
vi.mock('@/services/radarService',()=>({radarService:{getFunnelReport:(...args:unknown[])=>getFunnelReport(...args)}}));
const report={configurationRevision:1,operationId:null,lots:[],totals:{examined:1,outside:0,completed:0,completedWithGaps:0,technicalFailures:1},preview:{blocked:0,verifiedPositives:0,falseBlocks:0},costs:{knownActualBrl:'0',unknownActual:1,sources:[]},summary:{blocksByReason:[{stage:'qualification',reason:'radar_previous_request_uncertain',count:1}],classifications:[{gate:'g1',classification:'outside_profile',count:1}],counterfactual:{evaluable:0,notEvaluable:1,wouldBlock:0}},companies:[{id:'one',name:'=Empresa Alfa',runId:'run1',outcome:'technical_failure',reviewRequested:false,agentUsed:false,weakFit:false,historical:false,blocking:{stage:'qualification',reason:'radar_previous_request_uncertain'},registryPreview:{outcome:'pass',reasonPt:'Sem bloqueio cadastral',blocked:false,verifiedPositive:false},path:[{id:'event',gate:'g1',mode:'shadow',outcome:'outside_profile',reason:'outside_activity',requestId:'request1',evidenceIds:[],sampled:false,audit:null,probabilities:{outside_profile:.97,compatible:.03},selectedProbability:.97,outsideProbability:.97,threshold:null,wouldBlock:null}]}]} as RadarFunnelReport;

it('shows blocking totals, classification counts and raw probability without claiming an uncalibrated zero',async()=>{
 getFunnelReport.mockResolvedValue(report);const container=document.createElement('div'),root=createRoot(container);
 try{
  await act(async()=>root.render(<RadarFunnelReportPanel organizationId="org" campaignId="campaign"/>));
  expect(container.textContent).toContain('Bloqueios por motivo');
  expect(container.textContent).toContain('radar_previous_request_uncertain: 1');
  expect(container.textContent).toContain('outside_profile: 1');
  expect(container.textContent).toContain('Não avaliável');
  expect(container.textContent).toContain('97,0%');
  expect(container.textContent).not.toContain('0 empresas teriam sido bloqueadas');
  expect(getFunnelReport).toHaveBeenCalledTimes(1);
 }finally{act(()=>root.unmount());getFunnelReport.mockClear()}
});
it('exports the same summary, request-bound probabilities and explicit non-evaluability, escaping spreadsheet formulas',async()=>{
 const api=await import('@/lib/radar/radarFunnelReportCsv').catch(()=>({})) as {radarFunnelReportCsv?:(data:RadarFunnelReport)=>string};
 const csv=api.radarFunnelReportCsv?.(report);
 expect(csv).toContain('Resumo bloqueios');expect(csv).toContain('radar_previous_request_uncertain');expect(csv).toContain('Resumo IA');
 expect(csv).toContain('97,0%');expect(csv).toContain('Não avaliável');expect(csv).toContain('request1');expect(csv).toContain("'=Empresa Alfa");
});
