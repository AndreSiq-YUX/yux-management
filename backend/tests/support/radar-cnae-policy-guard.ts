import ts from 'typescript';

/** Architecture guard, not a runtime restriction: values must come from campaign
 * or catalog configuration. Regex syntax and unrelated phone/ID numbers are OK. */
export function findFixedRadarCnaes(source:string):Array<{line:number;value:string}>{
 const tree=ts.createSourceFile('radar.ts',source,ts.ScriptTarget.Latest,true),findings:Array<{line:number;value:string}>=[];
 function referencesCnae(node:ts.Node):boolean{
  if(ts.isIdentifier(node)&&/cnae|activityCodes/i.test(node.text))return true;
  return ts.forEachChild(node,child=>referencesCnae(child)?true:undefined)===true;
 }
 function inCnaePolicy(node:ts.Node):boolean{
  for(let parent=node.parent;parent&&!ts.isSourceFile(parent);parent=parent.parent){
   if((ts.isVariableDeclaration(parent)||ts.isPropertyAssignment(parent)||ts.isPropertyDeclaration(parent))&&/cnae|activityCodes/i.test(parent.name.getText(tree)))return true;
   if(ts.isCallExpression(parent)&&/cnae|activityCodes/i.test(parent.expression.getText(tree)))return true;
   if(ts.isBinaryExpression(parent)&&referencesCnae(parent))return true;
   if(ts.isCallExpression(parent)&&ts.isPropertyAccessExpression(parent.expression)&&['includes','has','indexOf'].includes(parent.expression.name.text)&&parent.arguments.some(referencesCnae))return true;
   if(ts.isCaseClause(parent)&&ts.isCaseBlock(parent.parent)&&ts.isSwitchStatement(parent.parent.parent)&&referencesCnae(parent.parent.parent.expression))return true;
   if(ts.isFunctionLike(parent))break;
  }
  return false;
 }
 function visit(node:ts.Node){
  if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)||ts.isNumericLiteral(node)){
   const value=node.text;
   if(/\b\d{4}-\d\/\d{2}\b/.test(value)||/^\d{7}$/.test(value)&&inCnaePolicy(node))findings.push({line:tree.getLineAndCharacterOfPosition(node.getStart(tree)).line+1,value});
  }
  ts.forEachChild(node,visit);
 }
 visit(tree);return findings;
}
