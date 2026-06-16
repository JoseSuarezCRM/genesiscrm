import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const auto = await prisma.automation.findFirst({ where: { name: { contains: 'Post-Op' } } })
if (!auto) { console.log('no workflow'); process.exit() }
console.log('TRIGGER:', auto.triggerType)
console.log('triggerConfig:', JSON.stringify(auto.triggerConfig))
const graph = auto.graph
console.log('\nGRAPH nodes:')
for (const [id, n] of Object.entries(graph?.nodes ?? {})) {
  if (n.kind === 'action') console.log(`  action ${n.actionType} cfg=${JSON.stringify(n.config?.recipients ?? n.config?.toType ?? n.config)} next=${n.next}`)
  else if (n.kind === 'branch') console.log(`  branch then=${n.thenNext} else=${n.elseNext} groups=${JSON.stringify(n.groups ?? n.rules)}`)
  else console.log(`  multi arms=${n.arms?.map(a=>a.label+':'+JSON.stringify(a.groups??a.rules)+'->'+a.next).join(' | ')} else=${n.elseNext}`)
}
console.log('rootId:', graph?.rootId)
console.log('\nRECENT RUNS:')
const runs = await prisma.automationRun.findMany({ where: { automationId: auto.id }, orderBy: { createdAt: 'desc' }, take: 5 })
runs.forEach(r => console.log(`  ${r.createdAt.toISOString()} ${r.result} ctx=${r.contextType}:${r.contextId} detail=${r.detail}`))
// find the surgery case from the run
const lastRun = runs[0]
if (lastRun?.contextId) {
  const sc = await prisma.surgeryCase.findUnique({ where: { id: lastRun.contextId.split(':')[0] }, select: { patientName:true, email:true, procedure:true, status:true } })
  console.log('\nCASE from last run:', JSON.stringify(sc))
}
await prisma.$disconnect()
