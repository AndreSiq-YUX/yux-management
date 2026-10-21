import ts from 'typescript';

/** Architecture guard, not a runtime restriction: values must come from campaign
 * or catalog configuration. Regex syntax and unrelated phone/ID numbers are OK. */
export function findFixedRadarCnaes(source:string):Array<{line:number;value:string}>{
 const tree=ts.createSourceFile('radar.ts',source,ts.ScriptTarget.Latest,true),findings:Array<{line:number;value:string}>=[];
 function inCnaePolicy(node:ts.Node):boolean{
  for(let parent=node.parent;parent&&!ts.isSourceFile(parent);parent=parent.parent){
   if((ts.isVariableDeclaration(parent)||ts.isPropertyAssignment(parent)||ts.isPropertyDeclaration(parent))&&/cnae|activityCodes/i.test(parent.name.getText(tree)))return true;
   if(ts.isCallExpression(parent)&&/cnae|activityCodes/i.test(parent.expression.getText(tree)))return true;
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
