"use client"

import { useEffect, useRef, useState } from "react"
import { saveSchedulingState } from "@/app/actions/scheduling-state"

// Bridge injected into the iframe (same-origin) so the standalone dashboard needs
// NO edits. It runs in the tool's global scope: builds the tool's export payload,
// hydrates from a saved payload, and autosaves via postMessage to this wrapper.
const BRIDGE_SRC = `(function(){
  if (window.__schedBridge) return; window.__schedBridge = true;
  var ORIGIN = window.location.origin;
  function g(id){ var el=document.getElementById(id); return el?el.value:undefined; }
  function buildPayload(){
    try{ syncProviders(); if(typeof syncStaff==='function')syncStaff(); syncIncoming(); saveScheduleFromGrid(); }catch(e){}
    var settings={targetPts:g('targetPts'),daysPerMonth:g('daysPerMonth'),growthPct:g('growthPct'),weeksProject:g('weeksProject'),orientDays:g('orientDays'),calWeeks:g('calWeeks'),startWeek:g('startWeek')};
    var extra=(typeof rawVolume!=='undefined')?rawVolume.filter(function(v){return v._added;}):[];
    return {version:9,exported:new Date().toISOString(),settings:settings,providers:providers,currentStaff:currentStaff,incomingInterns:incomingInterns,ptoEntries:ptoEntries,scheduleOverrides:scheduleOverrides,scheduleA:scheduleA,scheduleB:scheduleB,extraVolume:extra,iaPreferences:iaPreferences,iaExcludedClinics:iaExcludedClinics,iaRotationHistory:iaRotationHistory,clinicMeta:clinicMeta,clinicOrder:clinicOrder,surgLocations:surgLocations,surgAssignments:surgAssignments,surgLog:surgLog,staffingRules:staffingRules,staffingRulesExtra:staffingRulesExtra,xrtPreferences:xrtPreferences,xrtAssignments:xrtAssignments,xrtRotationHistory:xrtRotationHistory,dailyTasks:dailyTasks,recurringRules:recurringRules,clinicRegions:clinicRegions,staffRegions:staffRegions,onCallPASchedule:onCallPASchedule,pendingScheduleA:pendingScheduleA,pendingScheduleB:pendingScheduleB,pendingScheduleStartDate:pendingScheduleStartDate,scheduleLocks:scheduleLocks,optimizerRules:optimizerRules};
  }
  function hydrate(data){
    if(!data||typeof data!=='object'||!data.version)return;
    try{
      if(data.providers)providers=data.providers;
      if(data.currentStaff)currentStaff=data.currentStaff;
      try{migrateStaffDayAvail();}catch(e){}
      if(data.incomingInterns)incomingInterns=data.incomingInterns;
      if(data.ptoEntries)ptoEntries=data.ptoEntries;
      if(data.scheduleOverrides)scheduleOverrides=data.scheduleOverrides;
      if(data.scheduleA)scheduleA=data.scheduleA;
      if(data.scheduleB)scheduleB=data.scheduleB;
      if(data.extraVolume&&data.extraVolume.length){data.extraVolume.forEach(function(entry){var idx=rawVolume.findIndex(function(v){return v.month===entry.month&&v.year===entry.year&&v.clinic===entry.clinic;});if(idx>=0)rawVolume[idx]=entry;else rawVolume.push(entry);});}
      if(data.iaPreferences)iaPreferences=data.iaPreferences;
      if(data.iaExcludedClinics)iaExcludedClinics=data.iaExcludedClinics;
      if(data.iaRotationHistory)iaRotationHistory=data.iaRotationHistory;
      if(data.clinicMeta)clinicMeta=data.clinicMeta;
      if(data.clinicOrder)clinicOrder=data.clinicOrder;
      if(data.surgLocations)surgLocations=data.surgLocations;
      if(data.surgAssignments)surgAssignments=data.surgAssignments;
      if(data.surgLog)surgLog=data.surgLog;
      if(data.staffingRules)staffingRules=data.staffingRules;
      if(data.staffingRulesExtra!=null)staffingRulesExtra=data.staffingRulesExtra;
      if(data.xrtPreferences)xrtPreferences=data.xrtPreferences;
      if(data.xrtAssignments)xrtAssignments=data.xrtAssignments;
      if(data.xrtRotationHistory)xrtRotationHistory=data.xrtRotationHistory;
      if(data.dailyTasks)dailyTasks=data.dailyTasks;
      if(data.recurringRules)recurringRules=data.recurringRules;
      if(data.clinicRegions)clinicRegions=data.clinicRegions;
      if(data.staffRegions)staffRegions=data.staffRegions;
      if(data.onCallPASchedule)onCallPASchedule=data.onCallPASchedule;
      if(data.pendingScheduleA)pendingScheduleA=data.pendingScheduleA;
      if(data.pendingScheduleB)pendingScheduleB=data.pendingScheduleB;
      if(data.pendingScheduleStartDate!=null)pendingScheduleStartDate=data.pendingScheduleStartDate;
      if(data.scheduleLocks)scheduleLocks=data.scheduleLocks;
      if(data.optimizerRules)optimizerRules=data.optimizerRules;
      Object.keys(clinicMeta).forEach(function(code){if(clinicMeta[code].xrNeed===undefined)clinicMeta[code].xrNeed=false;});
      if(data.settings){Object.keys(data.settings).forEach(function(k){var el=document.getElementById(k);if(el&&data.settings[k]!=null)el.value=data.settings[k];});}
      renderProviders();recalc();populatePTOWho();updateClinicCodeCallout();
    }catch(e){ if(window.console)console.error('scheduling hydrate failed',e); }
  }
  var dirty=false;
  function postSave(){ try{ window.parent.postMessage({type:'scheduling:save',data:buildPayload()},ORIGIN); }catch(e){} }
  document.addEventListener('input',function(){dirty=true;},true);
  document.addEventListener('change',function(){dirty=true;},true);
  document.addEventListener('click',function(){dirty=true;},true);
  setInterval(function(){ if(dirty){dirty=false;postSave();} },12000);
  window.addEventListener('pagehide',function(){ if(dirty){dirty=false;postSave();} });
  document.addEventListener('visibilitychange',function(){ if(document.visibilityState==='hidden'&&dirty){dirty=false;postSave();} });
  window.addEventListener('message',function(e){
    if(e.origin!==ORIGIN)return;
    var m=e.data; if(!m||typeof m!=='object')return;
    if(m.type==='scheduling:load'){ hydrate(m.data); }
    else if(m.type==='scheduling:request-save'){ dirty=false; postSave(); }
  });
  try{ window.parent.postMessage({type:'scheduling:ready'},ORIGIN); }catch(e){}
})();`

// Hosts the self-contained scheduling dashboard (public/scheduling-planner.html) in
// an iframe and bridges its state to the DB: injects the bridge on load, feeds it the
// saved org-wide state, and debounce-saves the payload it posts back.
export default function SchedulingPlanner({ initialState }: { initialState: any }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle")
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef<any>(null)

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.origin !== window.location.origin) return
      if (iframeRef.current && e.source !== iframeRef.current.contentWindow) return
      const msg = e.data
      if (!msg || typeof msg !== "object") return
      if (msg.type === "scheduling:ready") {
        iframeRef.current?.contentWindow?.postMessage(
          { type: "scheduling:load", data: initialState ?? {} },
          window.location.origin,
        )
      } else if (msg.type === "scheduling:save") {
        latest.current = msg.data
        if (saveTimer.current) clearTimeout(saveTimer.current)
        setStatus("saving")
        saveTimer.current = setTimeout(async () => {
          try {
            await saveSchedulingState(latest.current)
            setStatus("saved")
            setSavedAt(new Date())
          } catch {
            setStatus("idle")
          }
        }, 1200)
      }
    }
    window.addEventListener("message", onMsg)
    return () => window.removeEventListener("message", onMsg)
  }, [initialState])

  function onIframeLoad() {
    try {
      const win = iframeRef.current?.contentWindow as any
      const doc = iframeRef.current?.contentDocument || win?.document
      if (!win || !doc || win.__schedBridge) return
      const s = doc.createElement("script")
      s.textContent = BRIDGE_SRC
      doc.body.appendChild(s)
    } catch {
      // cross-origin or file missing — planner will still render, just not persist
    }
  }

  function saveNow() {
    iframeRef.current?.contentWindow?.postMessage({ type: "scheduling:request-save" }, window.location.origin)
  }

  return (
    <div className="flex flex-col h-full min-h-[600px]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-white shrink-0">
        <div>
          <h1 className="text-base font-semibold text-slate-900">Operations Planner</h1>
          <p className="text-xs text-slate-500">Shared org-wide · autosaves</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="tabular-nums">
            {status === "saving" ? "Saving…" : status === "saved" && savedAt ? `Saved · ${savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
          </span>
          <button onClick={saveNow} className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:border-slate-400">Save now</button>
        </div>
      </div>
      <iframe ref={iframeRef} src="/scheduling-planner.html" onLoad={onIframeLoad} className="flex-1 w-full border-0" title="Operations Planner" />
    </div>
  )
}
