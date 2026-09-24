-- Whether the last publish actually reached the live site.
--
-- The public surgeon sites bundle their content at build time, so publishing in
-- the CRM changes nothing out there until a deploy runs. A deploy hook asks for
-- one; a silently broken hook is the one bad failure mode of that design, since
-- content would quietly stop arriving and nobody would notice for weeks. These
-- columns make it visible in the editor.
--
-- All nullable: every existing row predates the hook and has no deploy to report.
ALTER TABLE "SurgeonSite" ADD COLUMN "lastDeployAt" TIMESTAMP(3);
ALTER TABLE "SurgeonSite" ADD COLUMN "lastDeployOk" BOOLEAN;
ALTER TABLE "SurgeonSite" ADD COLUMN "lastDeployError" TEXT;
