import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../core/api';
import { AuthService } from '../core/auth';
import { apiError } from './account';

@Component({selector:'app-outreach',imports:[FormsModule],template:`
<div class="mx-auto max-w-6xl space-y-5">
  <header><h1 class="text-3xl font-bold">AI Outreach</h1><p class="mt-2 text-sm text-slate-500">Research businesses, review relevant messages, and send through connected channels.</p></header>
  @if(error()){<p role="alert" class="rounded-xl bg-rose-50 p-4 text-rose-700">{{error()}}</p>}
  @if(notice()){<p role="status" class="rounded-xl bg-emerald-50 p-4">{{notice()}}</p>}
  @if(auth.can('settings.manage')){
    <details class="card"><summary class="cursor-pointer font-semibold">Company offer & channel connections</summary>
      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <label><span class="label">Company name</span><input class="input" [(ngModel)]="config.seller_name" /></label>
        <label><span class="label">Daily sending limit</span><input class="input" type="number" min="1" max="500" [(ngModel)]="config.daily_limit" /></label>
        <label class="sm:col-span-2"><span class="label">Your services / offer</span><textarea class="input" rows="3" [(ngModel)]="config.offer"></textarea></label>
        <label class="sm:col-span-2"><input type="checkbox" [(ngModel)]="config.enabled" /> Enable approved message sending</label>
      </div>
      <h2 class="mt-5 font-semibold">Email (SMTP)</h2><div class="mt-3 grid gap-3 sm:grid-cols-2">
        <label><span class="label">SMTP host</span><input class="input" [(ngModel)]="config.email.host" /></label>
        <label><span class="label">Port</span><select class="input" [(ngModel)]="config.email.port"><option [ngValue]="587">587 — STARTTLS</option><option [ngValue]="465">465 — TLS</option></select></label>
        <label><span class="label">Username</span><input class="input" autocomplete="off" [(ngModel)]="config.email.username" /></label>
        <label><span class="label">Password {{config.email.password_configured?'(saved)':''}}</span><input class="input" type="password" autocomplete="new-password" [(ngModel)]="config.email.password" placeholder="Blank keeps saved password" /></label>
        <label><span class="label">Sender email</span><input class="input" type="email" [(ngModel)]="config.email.from_address" /></label>
      </div>
      <h2 class="mt-5 font-semibold">WhatsApp Business Cloud API</h2><div class="mt-3 grid gap-3 sm:grid-cols-2">
        <label><span class="label">Phone number ID</span><input class="input" [(ngModel)]="config.whatsapp.phone_number_id" /></label>
        <label><span class="label">Graph API version</span><input class="input" [(ngModel)]="config.whatsapp.api_version" placeholder="Your supported version" /></label>
        @for(field of secretFields;track field.key){<label><span class="label">{{field.label}} {{config.whatsapp[field.key+'_configured']?'(saved)':''}}</span><input class="input" type="password" autocomplete="new-password" [(ngModel)]="config.whatsapp[field.key]" placeholder="Blank keeps saved value" /></label>}
      </div>
      <p class="mt-3 break-all text-sm text-slate-500">Webhook: {{webhook()}} — subscribe to messages in Meta.</p>
      <button class="btn-primary mt-4" [disabled]="busy()" (click)="saveConfig()">Save connections</button>
    </details>
  }
  <section class="card"><h2 class="section-title">1. Research & prepare</h2><div class="mt-4 grid gap-4 sm:grid-cols-2">
    <label><span class="label">Search leads</span><input class="input" [(ngModel)]="query" (ngModelChange)="searchLeads()" placeholder="Company name" /></label>
    <label><span class="label">Company lead</span><select class="input" [(ngModel)]="leadId" (ngModelChange)="selectLead()"><option [ngValue]="null">Select lead</option>@for(l of leads();track l.id){<option [ngValue]="l.id">{{l.company?.name_en}} — #{{l.id}}</option>}</select></label>
    <label><span class="label">Channel</span><select class="input" [(ngModel)]="channel" (ngModelChange)="recipient=''"><option value="email">Email</option><option value="whatsapp">WhatsApp</option></select></label>
    <label><span class="label">Business contact</span><select class="input" [(ngModel)]="recipient"><option value="">Select contact</option>@for(c of contacts();track c){<option [value]="c">{{c}}</option>}</select></label>
    <label><span class="label">Message language</span><select class="input" [(ngModel)]="language"><option value="en">English</option><option value="ar">Arabic</option><option value="ur">Urdu</option></select></label>
  </div><button class="btn-primary mt-4" [disabled]="busy() || !leadId || !recipient" (click)="generate()">{{busy()?'Working…':'Research & draft with AI'}}</button><p class="mt-2 text-xs text-slate-500">Uses the company website and your offer. AI analysis credits apply.</p></section>
  @if(selected();as m){<section class="card space-y-4"><h2 class="section-title">2. Review & approve</h2>
    <div class="rounded-xl bg-slate-50 p-3 text-sm"><p>{{m.research?.rationale}}</p><p class="mt-2">Research: {{m.research?.research_status}}</p>@if(m.research?.evidence_url){<a class="text-violet-700" target="_blank" rel="noopener noreferrer" [href]="m.research.evidence_url">View website evidence</a>}</div>
    <p>{{m.channel}} → {{m.recipient}}</p>
    <label class="block"><span class="label">Subject</span><input class="input" [(ngModel)]="m.subject" /></label>
    <label class="block"><span class="label">Message</span><textarea class="input" rows="6" [(ngModel)]="m.body"></textarea></label>
    @if(m.channel==='whatsapp'){<div class="rounded-xl border p-4 space-y-3"><p class="text-sm">WhatsApp sends the Meta-approved template using the values below. The AI draft is not sent as free text.</p>
      <label class="block"><span class="label">Approved template name</span><input class="input" [(ngModel)]="templateName" /></label>
      <label class="block"><span class="label">Template language code</span><input class="input" [(ngModel)]="templateLanguage" /></label>
      <label class="block"><span class="label">Body variable values — one per line, in template order</span><textarea class="input" rows="3" [(ngModel)]="templateValues"></textarea></label>
      <p class="text-xs text-slate-500">Use a template containing opt-out wording. Supports text body variables.</p></div>}
    <label class="block"><span class="label">Contact permission evidence</span><textarea class="input" [(ngModel)]="permissionEvidence" placeholder="When and how did this contact permit this channel?"></textarea></label>
    <button class="btn-primary" [disabled]="busy() || permissionEvidence.trim().length<10" (click)="approve()">Approve & queue message</button><button class="btn-ghost ms-2" (click)="selected.set(null)">Close</button>
  </section>}
  <section class="card"><div class="flex justify-between"><h2 class="section-title">Message history</h2><button class="btn-ghost" (click)="load()">Refresh</button></div><div class="mt-4 space-y-3">
    @for(m of messages();track m.id){<article class="rounded-xl border p-4"><div class="flex flex-wrap justify-between"><span class="font-semibold">{{m.lead?.company?.name_en}} · {{m.channel}}</span><span class="badge bg-slate-100">{{m.replied_at?'Replied':m.status}}</span></div><p class="mt-1 text-sm text-slate-500">{{m.recipient}} · {{m.subject}}</p>@if(m.error){<p class="mt-2 text-sm text-rose-700">{{m.error}}</p>}
      <div class="mt-3 flex flex-wrap gap-2">@if(m.status==='draft'){<button class="btn-ghost" (click)="edit(m)">Review</button>}@if(['draft','queued','blocked'].includes(m.status)){<button class="btn-ghost" (click)="stop(m)">Cancel</button>}<button class="btn-ghost" (click)="outcome(m,'replied')">Record reply</button><button class="btn-ghost" (click)="outcome(m,'opt_out')">Do not contact</button></div>
    </article>}@empty{<p class="text-sm text-slate-500">No outreach messages yet.</p>}
  </div><div class="mt-4 flex justify-between"><button class="btn-ghost" [disabled]="page===1" (click)="page=page-1;load()">Previous</button><span>Page {{page}} / {{lastPage}}</span><button class="btn-ghost" [disabled]="page>=lastPage" (click)="page=page+1;load()">Next</button></div><p class="mt-3 text-xs text-slate-500">Accepted means provider acceptance. WhatsApp delivery and replies update through webhooks. Record email replies manually.</p></section>
</div>`})
export class OutreachPage implements OnInit {
  private api=inject(Api); protected auth=inject(AuthService);
  messages=signal<any[]>([]); leads=signal<any[]>([]); selected=signal<any>(null); company=signal<any>(null);
  error=signal(''); notice=signal(''); busy=signal(false); webhook=signal('');
  query=''; leadId:number|null=null; channel='email'; recipient=''; language='en'; page=1; lastPage=1;
  permissionEvidence=''; templateName=''; templateLanguage='en_US'; templateValues='';
  config:any={enabled:false,seller_name:'',offer:'',daily_limit:50,email:{port:587},whatsapp:{}};
  secretFields=[{key:'token',label:'Access token'},{key:'app_secret',label:'App secret'},{key:'verify_token',label:'Webhook verify token'}];
  private searchSequence=0;
  ngOnInit(){this.load();this.searchLeads();if(this.auth.can('settings.manage'))this.api.outreachSettings().subscribe({next:r=>this.setConfig(r),error:e=>this.fail(e)});}
  setConfig(r:any){this.config={...this.config,...r.config,email:{port:587,...r.config.email},whatsapp:{...r.config.whatsapp}};this.webhook.set(r.webhook_url);}
  load(){this.api.outreach(this.page).subscribe({next:r=>{this.messages.set(r.data);this.lastPage=r.last_page;},error:e=>this.fail(e)});}
  searchLeads(){const seq=++this.searchSequence;this.api.leads({q:this.query,per_page:50}).subscribe({next:r=>{if(seq===this.searchSequence)this.leads.set(r.data);},error:e=>this.fail(e)});}
  selectLead(){this.company.set(null);this.recipient='';const id=this.leadId;if(id)this.api.lead(id).subscribe({next:l=>{if(id===this.leadId)this.company.set(l.company);},error:e=>this.fail(e)});}
  contacts():string[]{return this.channel==='email'?(this.company()?.emails??[]).map((x:any)=>x.email):(this.company()?.phones??[]).map((x:any)=>x.normalized).filter(Boolean);}
  fail(e:any){this.busy.set(false);this.error.set(apiError(e));}
  saveConfig(){this.busy.set(true);this.error.set('');this.api.saveOutreachSettings(this.config).subscribe({next:r=>{this.setConfig(r);this.busy.set(false);this.notice.set('Connections saved.');},error:e=>this.fail(e)});}
  generate(){this.busy.set(true);this.error.set('');this.notice.set('');this.api.draftOutreach({lead_id:this.leadId,channel:this.channel,recipient:this.recipient,language:this.language}).subscribe({next:m=>{this.edit(m);this.busy.set(false);this.load();},error:e=>this.fail(e)});}
  edit(m:any){this.selected.set(structuredClone(m));this.permissionEvidence='';this.templateName='';this.templateValues='';}
  approve(){const m=this.selected();const values=this.templateValues.split('\n').map(x=>x.trim()).filter(Boolean);const body:any={subject:m.subject,body:m.body,permission_evidence:this.permissionEvidence};if(m.channel==='whatsapp')body.template={name:this.templateName,language:{code:this.templateLanguage},...(values.length?{components:[{type:'body',parameters:values.map(text=>({type:'text',text}))}]}:{})};this.busy.set(true);this.error.set('');this.api.approveOutreach(m.id,body).subscribe({next:()=>{this.selected.set(null);this.busy.set(false);this.notice.set('Approved. Check message history for provider status.');this.load();},error:e=>this.fail(e)});}
  stop(m:any){this.api.stopOutreach(m.id).subscribe({next:()=>{if(this.selected()?.id===m.id)this.selected.set(null);this.load();},error:e=>this.fail(e)});}
  outcome(m:any,outcome:string){this.api.outreachOutcome(m.id,outcome).subscribe({next:()=>this.load(),error:e=>this.fail(e)});}
}
