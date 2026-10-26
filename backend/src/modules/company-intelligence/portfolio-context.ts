import {hashCanonical,type Queryable} from '../action-engine/repository.js'
export type CompanyPortfolioContext={items:Array<Record<string,unknown>>;total:number;representedBusinesses:Array<Record<string,unknown>>;coverage:Record<string,unknown>;[key:string]:unknown}
export async function getCompanyPortfolioContext(db:Queryable,input:{organizationId:string;contractId?:string|null;profileKey:string;audience:'internal_operator'|'client_user'|'external_contact';query:string;representedBusinessIds?:string[];offset?:number;limit?:number}){
 const result=await db.query<{context:CompanyPortfolioContext}>('SELECT private.get_company_portfolio_context_v1($1,$2,$3,$4,$5,$6::uuid[],$7,$8) AS context',[input.organizationId,input.contractId??null,input.profileKey,input.audience,input.query,input.representedBusinessIds??[],input.offset??0,input.limit??20])
 const context=result.rows[0]?.context
 if(!context)throw new Error('company_portfolio_context_unavailable')
 context.coverage.omittedForBudget=0
 context.coverage.omittedBrandsForBudget=0
 context.coverage.omittedProductsForBudget=0
 const necessaryBrands=new Set(context.items.map(item=>String(item.representedBusinessId??'')))
 while(JSON.stringify(context).length>9900&&context.representedBusinesses.length){
  let index=context.representedBusinesses.length-1
  while(index>=0&&necessaryBrands.has(String(context.representedBusinesses[index]?.id)))index--
  context.representedBusinesses.splice(index<0?context.representedBusinesses.length-1:index,1)
  context.coverage.omittedBrandsForBudget=Number(context.coverage.omittedBrandsForBudget)+1
 }
 while(JSON.stringify(context).length>9900&&context.items.length){context.items.pop();context.coverage.omittedProductsForBudget=Number(context.coverage.omittedProductsForBudget)+1}
 context.coverage.omittedForBudget=Number(context.coverage.omittedBrandsForBudget)+Number(context.coverage.omittedProductsForBudget)
 context.coverage.selected=context.items.length
 context.coverage.hasMore=(input.offset??0)+context.items.length<context.total
 context.contextHash=hashCanonical(context)
 return context
}
