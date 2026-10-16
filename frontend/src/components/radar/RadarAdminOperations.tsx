import type {ReactNode} from 'react'
export function RadarAdminOperations({children}:{children:ReactNode}){
 return <details className="rounded-md border bg-background p-4"><summary className="cursor-pointer text-sm font-medium">Operação técnica — Admin YUX</summary>
  <div className="mt-4 flex flex-col gap-4">{children}</div>
 </details>
}
