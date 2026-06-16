import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const auto = await prisma.automation.findFirst({ where: { name: { contains: 'Post-Op' } } })
const graph = auto.graph
// find all SEND_EMAIL action nodes and their recipients
let n = 0
for (const node of Object.values(graph.nodes)) {
  if (node.kind === 'action' && node.actionType === 'SEND_EMAIL') {
    n++
    console.log(`EMAIL node: recipients=${JSON.stringify(node.config?.recipients)} subject="${(node.config?.subject||'').slice(0,40)}" sender=${node.config?.sender} bodyLen=${(node.config?.body||'').length}`)
  }
}
console.log('total SEND_EMAIL nodes:', n)
// recent surgery run + case email
const run = await prisma.automationRun.findFirst({ where: { automationId: auto.id }, orderBy: { createdAt: 'desc' } })
console.log('\nlast run ctx:', run?.contextType, run?.contextId, 'detail:', run?.detail)
const caseId = (run?.contextId || '').split(':')[0]
if (caseId) {
  const rows = await prisma.$queryRaw`SELECT "patientName","email","procedure","status" FROM "SurgeryCase" WHERE id = ${caseId}`
  console.log('CASE:', JSON.stringify(rows))
}
await prisma.$disconnect()
