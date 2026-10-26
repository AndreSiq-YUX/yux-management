from __future__ import annotations
import json
import re
from dataclasses import dataclass
from typing import Any
from .company_strategy_context import canonical_hash

def project_memory_portfolio(tables, *, organization_id, contract_id, profile_key, audience, query, represented_business_ids, offset=0, limit=20):
    brands={str(row['id']):row for row in tables.get('company_represented_businesses',[]) if row.get('organization_id')==organization_id}
    if any(str(item) not in brands for item in represented_business_ids):
        raise ValueError('company_portfolio_selection_scope_forbidden')
    terms=set(re.findall(r'\w+',query.casefold()))
    candidates=[]
    for row in tables.get('marketing_products_services',[]):
        if row.get('organization_id')!=organization_id or row.get('status')!='active' or (contract_id and row.get('contract_id')!=contract_id):continue
        brand_id=str(row.get('represented_business_id') or '')
        brand=brands.get(brand_id,{})
        if brand_id and brand.get('status')!='active':continue
        if represented_business_ids and brand_id not in represented_business_ids:continue
        metadata=row.get('metadata') or {}
        item={'id':row['id'],'contractId':row.get('contract_id'),'representedBusinessId':brand_id or None,'representedBusinessName':brand.get('name'),'name':row.get('name'),'description':str(row.get('description') or '')[:800],'valueProposition':str(row.get('value_proposition') or '')[:500],'commercialAvailability':'confirmed' if metadata.get('commercialAvailability')=='confirmed' else 'unconfirmed','originStatus':'business_record_not_market_evidence','updatedAt':row.get('updated_at')}
        item.update({key:metadata[key] for key in ('sku','packaging','storageConditions','serviceRegions','sourceUrl') if key in metadata})
        item.update(targetAudience=row.get('target_audience'),proofPoints=row.get('proof_points',[]),objections=row.get('objections',[]),cta=row.get('cta'))
        item.update(authorizedLines=brand.get('authorized_lines',[]),brandServiceRegions=brand.get('service_regions',[]))
        score=len(terms.intersection(set(re.findall(r'\w+',str(row.get('name') or '').casefold()+' '+str(row.get('description') or '').casefold()))))
        candidates.append((score,item))
    candidates.sort(key=lambda pair:(-pair[0],str(pair[1].get('name')),str(pair[1]['id'])))
    visible=[]
    for brand in sorted(brands.values(),key=lambda row:(row['name'],row['id'])):
        if brand.get('status')!='active' or (represented_business_ids and brand['id'] not in represented_business_ids):continue
        item={'id':brand['id'],'name':brand['name'],'description':str(brand.get('description') or '')[:500],'authorizedLines':brand.get('authorized_lines',[]),'serviceRegions':brand.get('service_regions',[])}
        if audience!='external_contact':item['commercialConditions']=str(brand.get('commercial_conditions') or '')[:1000]
        visible.append(item)
    items=[item for _,item in candidates[offset:offset+limit]]
    return {'items':items,'total':len(candidates),'representedBusinesses':visible[:20],'offset':offset,'limit':limit,'coverage':{'selected':len(items),'hasMore':offset+len(items)<len(candidates)},'authority':'company_portfolio','deliveryAuthorization':'not_granted'}

@dataclass
class CompanyPortfolioContextService:
    store: Any
    max_chars: int = 10000

    def retrieve(self, *, organization_id, contract_id, profile_key, audience, query, represented_business_ids=None, offset=0, limit=20):
        context=self.store.retrieve_company_portfolio(organization_id=organization_id,contract_id=contract_id,profile_key=profile_key,audience=audience,query=query,represented_business_ids=represented_business_ids or [],offset=offset,limit=limit)
        context['coverage']['omittedForBudget']=0
        while len(json.dumps(context,ensure_ascii=False))>self.max_chars-100 and context['items']:
            context['items'].pop();context['coverage']['omittedForBudget']+=1
        while len(json.dumps(context,ensure_ascii=False))>self.max_chars-100 and context['representedBusinesses']:
            context['representedBusinesses'].pop();context['coverage']['omittedForBudget']+=1
        context['coverage']['selected']=len(context['items'])
        context['coverage']['hasMore']=offset+len(context['items'])<context['total']
        context['contextHash']=canonical_hash(context)
        return context
