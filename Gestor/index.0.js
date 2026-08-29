
const KEY='recibidos_3dcd_v1';
const COUNTER_KEY='recibidos_3dcd_counter_v1';
const PRICES_KEY='recibidos_3dcd_estampados_precios_v1';

const $=s=>document.querySelector(s);
const listEl=$('#list');
const modal=$('#modal');
const menu=$('#menu');

let records=[];
let undoStack=[];
let redoStack=[];
const HISTORY_LIMIT=5;
let activeFilter='received';
let editingId=null;
let draftPhoto='';
let draftItems=[];
let cameraStream=null;
const STAMP_TYPES=[
  '1 chico',
  '2 chicos',
  '3 chicos',
  '1 grande',
  '1 grande + 1 chico',
  '1 grande + 2 chicos'
];
let prices={};

const nowIso=()=>new Date().toISOString();
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function fmtDate(iso){
  const d=new Date(iso);
  if(Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d);
}
function nextNumber(){
  let n=Number(localStorage.getItem(COUNTER_KEY)||1);
  localStorage.setItem(COUNTER_KEY,String(n+1));
  return n;
}

function snapshot(){
  return JSON.stringify(records);
}
function restoreSnapshot(raw){
  try{
    const parsed=JSON.parse(raw);
    if(Array.isArray(parsed)){
      records=parsed;
      localStorage.setItem(KEY,JSON.stringify(records));
      render();
      return true;
    }
  }catch{}
  return false;
}
function pushHistory(){
  undoStack.push(snapshot());
  if(undoStack.length>HISTORY_LIMIT)undoStack.shift();
  redoStack=[];
  updateHistoryButtons();
}
function updateHistoryButtons(){
  const u=$('#undoBtn'),r=$('#redoBtn');
  if(u)u.disabled=undoStack.length===0;
  if(r)r.disabled=redoStack.length===0;
}
function undo(){
  if(!undoStack.length)return;
  redoStack.push(snapshot());
  if(redoStack.length>HISTORY_LIMIT)redoStack.shift();
  const prev=undoStack.pop();
  restoreSnapshot(prev);
  updateHistoryButtons();
}
function redo(){
  if(!redoStack.length)return;
  undoStack.push(snapshot());
  if(undoStack.length>HISTORY_LIMIT)undoStack.shift();
  const next=redoStack.pop();
  restoreSnapshot(next);
  updateHistoryButtons();
}

function save(){
  localStorage.setItem(KEY,JSON.stringify(records));
  render();
}
function load(){
  try{
    records=JSON.parse(localStorage.getItem(KEY)||'[]');
    if(!Array.isArray(records))records=[];
  }catch{records=[]}
  records.forEach(r=>{
    if(!r.receivedAt)r.receivedAt=r.createdAt||nowIso();
    (r.items||[]).forEach(i=>{if(!i.stamp)i.stamp='1 chico'});
  });
  const max=Math.max(0,...records.map(r=>Number(r.numero||0)));
  const stored=Number(localStorage.getItem(COUNTER_KEY)||1);
  if(stored<=max)localStorage.setItem(COUNTER_KEY,String(max+1));
  render();
}

function loadPrices(){
  try{
    const x=JSON.parse(localStorage.getItem(PRICES_KEY)||'{}');
    prices=x&&typeof x==='object'?x:{};
  }catch{prices={}}
  STAMP_TYPES.forEach(t=>{if(prices[t]==null)prices[t]=''});
}
function renderPrices(){
  $('#pricesList').innerHTML=STAMP_TYPES.map(type=>`
    <div class="priceRow">
      <label>${esc(type)}</label>
      <div class="priceInputWrap">
        <span>$</span>
        <input data-price="${esc(type)}" type="number" min="0" step="100" inputmode="numeric" value="${esc(prices[type]??'')}" placeholder="0">
      </div>
    </div>
  `).join('');
}
function openPrices(){
  loadPrices();
  renderPrices();
  $('#pricesModal').classList.add('show');
  menu.classList.remove('show');
}
function closePrices(){
  $('#pricesModal').classList.remove('show');
}
function savePrices(){
  const next={};
  $('#pricesList').querySelectorAll('[data-price]').forEach(inp=>{
    next[inp.dataset.price]=inp.value===''?'':Math.max(0,Number(inp.value||0));
  });
  prices=next;
  localStorage.setItem(PRICES_KEY,JSON.stringify(prices));
  render();
  updateDraftValue();
  closePrices();
}


function stampPrice(type){
  const v=Number(prices[type]||0);
  return Number.isFinite(v)?v:0;
}


function moneyAR(n){
  return '$ '+Math.round(Number(n||0)).toLocaleString('es-AR');
}
function recordValue(r){
  return (r.items||[]).reduce((sum,i)=>{
    return sum+(Math.max(0,Number(i.qty||0))*stampPrice(i.stamp));
  },0);
}
function statusWorkTotal(status){
  return records
    .filter(r=>status==='all' || r.status===status)
    .reduce((sum,r)=>sum+recordValue(r),0);
}
function currentViewMoney(){
  if(activeFilter==='received'){
    return {label:'TRABAJO EN CURSO',value:statusWorkTotal('received')};
  }
  if(activeFilter==='delivered'){
    return {label:'PARA COBRAR',value:statusWorkTotal('delivered')};
  }
  return {label:'TOTAL GENERAL',value:statusWorkTotal('all')};
}

function statusLabel(r){return r.status==='delivered'?'Entregado':'Recibido'}
function itemSummary(r){
  const items=Array.isArray(r.items)?r.items:[];
  if(!items.length)return 'Sin prendas detalladas';
  return items.map(i=>`${i.qty||1} ${i.type||'prenda'}${i.color?' · '+i.color:''}${i.stamp?' · '+i.stamp:''}`).join(' / ');
}
function totalUnits(r){
  return (r.items||[]).reduce((a,i)=>a+Number(i.qty||0),0);
}
function filtered(){
  if(activeFilter==='all')return [...records].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  return records.filter(r=>r.status===activeFilter).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
}
function render(){
  const received=records.filter(r=>r.status==='received').length;
  const delivered=records.filter(r=>r.status==='delivered').length;
  $('#receivedCount').textContent=received;
  $('#deliveredCount').textContent=delivered;
    const moneyState=currentViewMoney();
  $('#workTotalLabel').textContent=moneyState.label;
  $('#workTotalValue').textContent=moneyAR(moneyState.value);

  const data=filtered();
  $('#listCount').textContent=`${data.length} registro${data.length===1?'':'s'}`;
  $('#listTitle').textContent=activeFilter==='received'?'Prendas en mi poder':activeFilter==='delivered'?'Entregados':'Todos los movimientos';

  document.body.classList.remove('mode-received','mode-delivered','mode-all');
  document.body.classList.add(activeFilter==='received'?'mode-received':activeFilter==='delivered'?'mode-delivered':'mode-all');
  document.querySelectorAll('[data-state]').forEach(b=>b.classList.toggle('selected',b.dataset.state===activeFilter));
  $('#showAllBtn').classList.toggle('active',activeFilter==='all');
  $('#shareCurrent').style.display='inline-flex';

  if(!data.length){
    listEl.innerHTML=`<div class="empty">${activeFilter==='received'?'No tenés prendas pendientes registradas. Tocá ＋ cuando recibas una bolsa.':'No hay registros para mostrar.'}</div>`;
    return;
  }

  listEl.innerHTML=data.map(r=>`
    <article class="card ${r.status}" data-id="${r.id}">
      <div class="cardhead">
        <div class="thumb">${r.photo?`<img src="${r.photo}" alt="Foto">`:'📦'}</div>
        <div class="client">
          <h3>${esc(r.client||'Sin cliente')}</h3>
          <p>${esc(itemSummary(r))}<br>${fmtDate(r.status==='delivered'?(r.deliveredAt||r.createdAt):(r.receivedAt||r.createdAt))}</p>
        </div>
        <div class="cardStateBox">
          <b class="cardAmount">${moneyAR(recordValue(r))}</b>
          <span class="status ${r.status}">${statusLabel(r)}</span>
        </div>
      </div>
      <div class="cardbody">
        <div class="items">
          ${(r.items||[]).map(i=>`<div class="itemrow"><strong>${esc(i.type||'Prenda')}</strong><span>${esc(i.qty||1)} u.${i.color?' · '+esc(i.color):''}${i.stamp?' · '+esc(i.stamp):''}</span></div>`).join('')}
        </div>
        ${r.notes?`<div class="notes">${esc(r.notes)}</div>`:''}
        <div class="actions">
          
          <button class="action budgetAction" data-act="budget">Presupuesto</button>
          <button class="action" data-act="edit">Editar</button>
          ${r.status==='received'
            ?`<button class="action primary" data-act="deliver">Marcar entregado</button>`
            :`<button class="action gray" data-act="reopen">Volver a recibido</button>`}
          <button class="action danger" data-act="delete">Eliminar</button>
        </div>
      </div>
    </article>
  `).join('');
}

function newItem(){
  return {type:'Chomba',qty:'',color:'',stamp:'1 chico'};
}
function renderItemsEditor(){
  if(!draftItems.length)draftItems=[newItem()];
  $('#itemsEditor').innerHTML=draftItems.map((it,idx)=>`
    <div class="item-editor" data-idx="${idx}">
      <select data-k="type">
        ${['Chomba','Remera','Buzo','Buzo con capucha','Polar','Campera','Pantalón','Bombacha','Otra'].map(x=>`<option ${it.type===x?'selected':''}>${x}</option>`).join('')}
      </select>
      <input data-k="qty" type="number" min="1" step="1" value="${esc(it.qty??'')}" inputmode="numeric" placeholder="Cant.">
      <input data-k="color" value="${esc(it.color||'')}" placeholder="Color">
      <button class="removeitem" data-remove="${idx}" aria-label="Eliminar">×</button>
      <select class="stamp-select" data-k="stamp">
        ${STAMP_TYPES.map(x=>`<option ${it.stamp===x?'selected':''}>${x}</option>`).join('')}
      </select>
    </div>
  `).join('');
  updateDraftValue();
}

function draftValue(){
  return (draftItems||[]).reduce((sum,i)=>{
    if(!i)return sum;
    const raw=String(i.qty??'').trim();
    const effectiveQty=raw==='' ? 1 : Math.max(1,Number(raw)||1);
    return sum+(effectiveQty*stampPrice(i.stamp||'1 chico'));
  },0);
}
function updateDraftValue(){
  const el=$('#draftTotal');
  if(el)el.textContent=moneyAR(draftValue());
}

function renderDraftPhoto(){
  $('#photoBox').innerHTML=draftPhoto?`<img src="${draftPhoto}" alt="Foto">`:'Sin foto';
}
function openNew(){
  editingId=null;
  draftPhoto='';
  draftItems=[newItem()];
  $('#client').value='';
  $('#notes').value='';
  $('#sheetTitle').textContent='Nuevo ingreso';
  renderItemsEditor();
  renderDraftPhoto();
  modal.classList.add('show');
  setTimeout(()=>$('#client').focus(),120);
}
function openEdit(r){
  editingId=r.id;
  draftPhoto=r.photo||'';
  draftItems=(r.items||[]).map(i=>({...i}));
  $('#client').value=r.client||'';
  $('#notes').value=r.notes||'';
  $('#sheetTitle').textContent='Editar ingreso';
  renderItemsEditor();
  renderDraftPhoto();
  modal.classList.add('show');
}
function closeModal(){
  modal.classList.remove('show');
}
async function compressImage(file){
  const data=await new Promise((resolve,reject)=>{
    const fr=new FileReader();
    fr.onload=()=>resolve(fr.result);
    fr.onerror=reject;
    fr.readAsDataURL(file);
  });
  const img=await new Promise((resolve,reject)=>{
    const im=new Image();
    im.onload=()=>resolve(im);
    im.onerror=reject;
    im.src=data;
  });

  const size=720;
  const c=document.createElement('canvas');
  c.width=size;c.height=size;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);

  const scale=Math.max(size/img.width,size/img.height);
  const w=img.width*scale,h=img.height*scale;
  const x=(size-w)/2,y=(size-h)/2;
  ctx.drawImage(img,x,y,w,h);
  return c.toDataURL('image/jpeg',.78);
}
async function pickPhoto(file){
  if(!file)return;
  try{
    draftPhoto=await compressImage(file);
    renderDraftPhoto();
  }catch{
    alert('No se pudo leer esa imagen.');
  }
}
function collectDraft(){
  const client=$('#client').value.trim()||'Cliente';
  const items=draftItems
    .map(i=>({
      type:String(i.type||'Prenda').trim(),
      qty:Math.max(1,Number(i.qty||1)),
      color:String(i.color||'').trim(),
      stamp:String(i.stamp||'1 chico')
    }))
    .filter(i=>i.type);
  if(!items.length){alert('Agregá al menos una prenda.');return null}
  return {client,items,notes:$('#notes').value.trim(),photo:draftPhoto};
}
function saveDraft(){
  const data=collectDraft();
  if(!data)return null;

  pushHistory();
  let r=editingId?records.find(x=>x.id===editingId):null;
  if(!r){
    r={
      id:uid(),
      numero:nextNumber(),
      createdAt:nowIso(),
      receivedAt:nowIso(),
      deliveredAt:null,
      status:'received'
    };
    records.unshift(r);
  }
  Object.assign(r,data);
  save();
  return r;
}
function textForRecord(r){
  const lines=(r.items||[]).map(i=>`• ${i.qty} ${i.type}${i.color?' · '+i.color:''}${i.stamp?' · '+i.stamp:''}`);
  return `${r.status==='delivered'?'ENTREGADO':'RECIBIDO'}\nCliente: ${r.client}\n${lines.join('\n')}${r.notes?`\nObs.: ${r.notes}`:''}\n${new Intl.DateTimeFormat('es-AR',{dateStyle:'short',timeStyle:'short'}).format(new Date(r.status==='delivered'?(r.deliveredAt||r.createdAt):(r.receivedAt||r.createdAt)))}`;
}

function rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
function wrap(ctx,text,x,y,maxWidth,lineHeight,maxLines=3){const words=String(text||'').split(/\s+/).filter(Boolean);let line='',lines=0;for(const word of words){const test=line?line+' '+word:word;if(ctx.measureText(test).width>maxWidth&&line){ctx.fillText(line,x,y);line=word;y+=lineHeight;lines++;if(lines>=maxLines-1)break}else line=test}if(line&&lines<maxLines){ctx.fillText(line,x,y);y+=lineHeight}return y}
async function imgData(src){if(!src)return null;return await new Promise(res=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>res(null);im.src=src})}
async function recordCardBlob(r){
 const W=900,H=1280,c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d'),rec=r.status!=='delivered';
 ctx.clearRect(0,0,W,H);
 const accent=rec?'#087f73':'#7e2f3d',soft=rec?'#eefbf7':'#fff4f6';
 const x=34,y=34,w=832,h=1188,radius=42;
 ctx.save();ctx.shadowColor='rgba(0,0,0,.18)';ctx.shadowBlur=28;ctx.shadowOffsetY=10;ctx.fillStyle='#fff';rr(ctx,x,y,w,h,radius);ctx.fill();ctx.restore();
 ctx.strokeStyle=accent;ctx.lineWidth=4;rr(ctx,x,y,w,h,radius);ctx.stroke();

 ctx.fillStyle=soft;rr(ctx,x+18,y+18,w-36,150,30);ctx.fill();
 ctx.fillStyle=accent;ctx.font='900 32px Arial';ctx.fillText('Gestor',x+44,y+64);
 ctx.font='900 24px Arial';ctx.fillText(rec?'EN MI PODER':'ENTREGADO',x+44,y+101);
 ctx.font='700 18px Arial';ctx.fillStyle='#65706f';ctx.fillText(fmtDate(rec?(r.receivedAt||r.createdAt):(r.deliveredAt||r.createdAt)),x+44,y+132);

 let cy=y+205;
 const im=await imgData(r.photo);
 if(im){
   const ps=190,px=x+44,py=cy;
   ctx.fillStyle='#edf1f3';rr(ctx,px,py,ps,ps,26);ctx.fill();
   ctx.save();rr(ctx,px,py,ps,ps,26);ctx.clip();
   const sc=Math.max(ps/im.width,ps/im.height),iw=im.width*sc,ih=im.height*sc;
   ctx.drawImage(im,px+(ps-iw)/2,py+(ps-ih)/2,iw,ih);ctx.restore();
   ctx.fillStyle='#15171a';ctx.font='900 34px Arial';
   let nameY=wrap(ctx,r.client||'Sin cliente',px+220,py+38,520,38,3);
   ctx.fillStyle='#68717c';ctx.font='700 20px Arial';
   wrap(ctx,itemSummary(r),px+220,nameY+8,520,27,4);
   cy=py+220;
 }else{
   ctx.fillStyle='#15171a';ctx.font='900 36px Arial';
   cy=wrap(ctx,r.client||'Sin cliente',x+44,cy+10,w-88,40,3)+10;
   ctx.fillStyle='#68717c';ctx.font='700 20px Arial';
   cy=wrap(ctx,itemSummary(r),x+44,cy,w-88,28,4)+12;
 }

 const items=r.items||[];
 const boxH=Math.max(170,80+items.length*64);
 ctx.fillStyle='#f7f9fa';rr(ctx,x+34,cy,w-68,boxH,26);ctx.fill();
 ctx.strokeStyle='#dce3e7';ctx.lineWidth=2;rr(ctx,x+34,cy,w-68,boxH,26);ctx.stroke();
 let iy=cy+52;
 for(const it of items){
   ctx.fillStyle='#15171a';ctx.font='900 24px Arial';
   const label=`${it.type||'Prenda'}${it.color?' · '+it.color:''}`;
   const nextY=wrap(ctx,label,x+58,iy,510,29,2);
   ctx.fillStyle=accent;ctx.font='900 22px Arial';ctx.textAlign='right';
   ctx.fillText(`${it.qty||1} u.`,x+w-70,iy);ctx.textAlign='left';
   iy=Math.max(nextY,iy+44)+14;
 }
 cy=cy+boxH+28;
 if(r.notes){
   ctx.fillStyle='#68717c';ctx.font='800 17px Arial';ctx.fillText('OBSERVACIÓN',x+44,cy);
   ctx.fillStyle='#34383d';ctx.font='500 21px Arial';wrap(ctx,r.notes,x+44,cy+30,w-88,29,5);
 }
 ctx.fillStyle='#7b8388';ctx.font='700 16px Arial';ctx.fillText(`Registro N° ${String(r.numero).padStart(3,'0')}`,x+44,y+h-42);
 return await new Promise(res=>c.toBlob(res,'image/png',.96))
}

function shortStamp(v){
  if(!v)return '';
  try{
    return new Intl.DateTimeFormat('es-AR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(v));
  }catch{return ''}
}

async function currentCardBlob(){
 const data=viewRecords();
 const received=data.filter(r=>r.status==='received');
 const delivered=data.filter(r=>r.status==='delivered');

 const W=900,headH=190,recvH=230,recvGap=18,delH=120,delGap=12,totalH=150;
 const sectionsH=(received.length*(recvH+recvGap))+(delivered.length?(46+delivered.length*(delH+delGap)):0);
 const innerH=headH+42+sectionsH+totalH+92;
 const H=Math.max(760,innerH+56);
 const c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d');
 ctx.clearRect(0,0,W,H);

 const x=28,y=28,w=844,h=H-56;
 const isReceived=activeFilter==='received';
 const isDelivered=activeFilter==='delivered';
 const accent=isReceived?'#168c72':isDelivered?'#8e3549':'#285f8b';
 const headBg=isReceived?'#ddf4eb':isDelivered?'#f2dce1':'#e4f0f9';
 const headText=isReceived?'#0f6e5c':isDelivered?'#7d2f40':'#174f78';

 ctx.save();ctx.shadowColor='rgba(0,0,0,.18)';ctx.shadowBlur=26;ctx.shadowOffsetY=10;
 ctx.fillStyle='#fff';rr(ctx,x,y,w,h,42);ctx.fill();ctx.restore();
 ctx.strokeStyle=accent;ctx.lineWidth=4;rr(ctx,x,y,w,h,42);ctx.stroke();

 ctx.fillStyle=headBg;rr(ctx,x+16,y+16,w-32,headH,28);ctx.fill();
 ctx.fillStyle=headText;ctx.font='900 42px Arial';ctx.fillText('Gestor',x+38,y+66);
 ctx.font='900 34px Arial';ctx.fillText(viewTitle(),x+38,y+116);
 ctx.fillStyle='#586873';ctx.font='700 24px Arial';
 ctx.fillText(new Intl.DateTimeFormat('es-AR',{dateStyle:'short',timeStyle:'short'}).format(new Date()),x+38,y+158);

 let cy=y+headH+36;

 // EN MI PODER: photo + detail
 for(const r of received){
   ctx.fillStyle='#d8f3e8';rr(ctx,x+24,cy,w-48,recvH,26);ctx.fill();
   ctx.strokeStyle='#42ad92';ctx.lineWidth=4;rr(ctx,x+24,cy,w-48,recvH,26);ctx.stroke();

   const im=await imgData(r.photo),ps=126,px=x+44,py=cy+48;
   if(im){
     ctx.save();rr(ctx,px,py,ps,ps,18);ctx.clip();
     const sc=Math.max(ps/im.width,ps/im.height),iw=im.width*sc,ih=im.height*sc;
     ctx.drawImage(im,px+(ps-iw)/2,py+(ps-ih)/2,iw,ih);ctx.restore();
   }else{
     ctx.fillStyle='#edf1f1';rr(ctx,px,py,ps,ps,18);ctx.fill();
   }

   ctx.fillStyle='#15171a';ctx.font='900 34px Arial';
   let ty=wrap(ctx,r.client||'Sin cliente',px+150,cy+58,350,52,2);
   ctx.fillStyle='#53645f';ctx.font='700 24px Arial';
   wrap(ctx,itemSummary(r),px+150,ty+4,350,38,2);

   ctx.fillStyle='#168c72';ctx.font='900 22px Arial';ctx.textAlign='right';
   ctx.fillText('EN MI PODER',x+w-50,cy+48);
   ctx.font='900 22px Arial';ctx.fillText(moneyAR(recordValue(r)),x+w-50,cy+94);
   ctx.fillStyle='#52635f';ctx.font='700 19px Arial';
   ctx.fillText(shortStamp(r.receivedAt||r.createdAt),x+w-50,cy+132);
   ctx.textAlign='left';

   cy+=recvH+recvGap;
 }

 // ENTREGADOS: compact rows
 if(delivered.length){
   if(received.length)cy+=8;
   ctx.fillStyle='#8e3549';ctx.font='900 26px Arial';ctx.fillText('ENTREGADOS',x+30,cy+36);
   cy+=40;

   for(const r of delivered){
     ctx.fillStyle='#efd3d9';rr(ctx,x+24,cy,w-48,delH,20);ctx.fill();
     ctx.strokeStyle='#a94f62';ctx.lineWidth=3;rr(ctx,x+24,cy,w-48,delH,20);ctx.stroke();

     ctx.fillStyle='#2b1d20';ctx.font='900 22px Arial';
     let client=String(r.client||'Sin cliente');
     while(ctx.measureText(client).width>235&&client.length>5)client=client.slice(0,-1);
     if(client!==String(r.client||'Sin cliente'))client+='…';
     ctx.fillText(client,x+48,cy+42);

     ctx.fillStyle='#593c42';ctx.font='700 22px Arial';
     let summary=itemSummary(r);
     while(ctx.measureText(summary).width>330&&summary.length>8)summary=summary.slice(0,-1);
     if(summary!==itemSummary(r))summary+='…';
     ctx.fillText(summary,x+48,cy+84);

     ctx.fillStyle='#8e3549';ctx.font='900 22px Arial';ctx.textAlign='right';
     ctx.fillText(moneyAR(recordValue(r)),x+w-48,cy+42);
     ctx.font='800 19px Arial';
     ctx.fillText(shortStamp(r.deliveredAt||r.createdAt),x+w-48,cy+88);
     ctx.textAlign='left';

     cy+=delH+delGap;
   }
 }

 // TOTAL visible for the exact section being shared
 cy+=26;
 ctx.fillStyle=accent;rr(ctx,x+24,cy,w-48,totalH,26);ctx.fill();
 ctx.fillStyle='rgba(255,255,255,.76)';ctx.font='800 25px Arial';ctx.textAlign='left';
 ctx.fillText(viewTitle()+' · TOTAL',x+52,cy+52);
 ctx.fillStyle='#fff';ctx.font='900 52px Arial';ctx.textAlign='right';
 ctx.fillText(moneyAR(data.reduce((sum,r)=>sum+recordValue(r),0)),x+w-52,cy+112);
 ctx.textAlign='left';

 ctx.fillStyle='#6f777d';ctx.font='700 21px Arial';
 if(activeFilter==='received'){
   ctx.fillText(`En mi poder: ${received.length} registro${received.length===1?'':'s'}`,x+38,y+h-30);
 }else if(activeFilter==='delivered'){
   ctx.fillText(`Entregados: ${delivered.length} registro${delivered.length===1?'':'s'}`,x+38,y+h-30);
 }else{
   ctx.fillText(`En mi poder: ${received.length}   ·   Entregados: ${delivered.length}`,x+38,y+h-30);
 }
 return await new Promise(res=>c.toBlob(res,'image/png',.96))
}

async function budgetCardBlob(r){
  const W=900,H=1260,c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d');
  ctx.clearRect(0,0,W,H);

  const x=34,y=34,w=832,h=1188;
  const accent='#8a5a08',soft='#fff7e6';

  ctx.save();
  ctx.shadowColor='rgba(0,0,0,.18)';ctx.shadowBlur=28;ctx.shadowOffsetY=10;
  ctx.fillStyle='#fff';rr(ctx,x,y,w,h,42);ctx.fill();
  ctx.restore();
  ctx.strokeStyle=accent;ctx.lineWidth=4;rr(ctx,x,y,w,h,42);ctx.stroke();

  ctx.fillStyle=soft;rr(ctx,x+18,y+18,w-36,150,30);ctx.fill();
  ctx.fillStyle=accent;ctx.font='900 42px Arial';ctx.fillText('PRESUPUESTO',x+44,y+62);
  ctx.fillStyle='#15171a';ctx.font='900 40px Arial';
  wrap(ctx,r.client||'Cliente',x+44,y+103,w-88,34,2);
  ctx.fillStyle='#6d6251';ctx.font='700 24px Arial';
  ctx.fillText(new Intl.DateTimeFormat('es-AR',{dateStyle:'short'}).format(new Date()),x+44,y+139);

  let cy=y+205;
  const im=await imgData(r.photo);

  if(im){
    const ps=200,px=x+44,py=cy;
    ctx.fillStyle='#f1f1f1';rr(ctx,px,py,ps,ps,28);ctx.fill();
    ctx.save();rr(ctx,px,py,ps,ps,28);ctx.clip();
    const sc=Math.max(ps/im.width,ps/im.height),iw=im.width*sc,ih=im.height*sc;
    ctx.drawImage(im,px+(ps-iw)/2,py+(ps-ih)/2,iw,ih);ctx.restore();

    ctx.fillStyle='#54585d';ctx.font='700 27px Arial';
    ctx.fillText('Detalle del trabajo',px+230,py+38);
    ctx.fillStyle='#15171a';ctx.font='900 34px Arial';
    wrap(ctx,itemSummary(r),px+230,py+82,480,32,4);
    cy=py+230;
  }else{
    ctx.fillStyle='#54585d';ctx.font='700 27px Arial';ctx.fillText('Detalle del trabajo',x+44,cy);
    ctx.fillStyle='#15171a';ctx.font='900 34px Arial';
    cy=wrap(ctx,itemSummary(r),x+44,cy+40,w-88,32,4)+10;
  }

  const items=r.items||[];
  const rowH=142;
  const boxH=Math.max(250,110+items.length*rowH);
  ctx.fillStyle='#f8f9fa';rr(ctx,x+34,cy,w-68,boxH,28);ctx.fill();
  ctx.strokeStyle='#e0e3e6';ctx.lineWidth=2;rr(ctx,x+34,cy,w-68,boxH,28);ctx.stroke();

  let iy=cy+54;
  for(const it of items){
    const qty=Math.max(1,Number(it.qty||1));
    const lineTotal=qty*stampPrice(it.stamp);

    ctx.fillStyle='#15171a';ctx.font='900 32px Arial';
    wrap(ctx,`${it.type||'Prenda'}${it.color?' · '+it.color:''}`,x+58,iy,430,28,2);

    ctx.fillStyle='#6d7176';ctx.font='700 24px Arial';
    ctx.fillText(`${qty} u. · ${it.stamp||'1 chico'}`,x+58,iy+48);

    ctx.textAlign='right';
    ctx.fillStyle=accent;ctx.font='900 32px Arial';
    ctx.fillText(moneyAR(lineTotal),x+w-62,iy+28);
    ctx.textAlign='left';

    iy+=rowH;
  }

  const total=recordValue(r);
  const totalY=Math.min(y+h-190,cy+boxH+42);
  ctx.fillStyle='#15171a';rr(ctx,x+34,totalY,w-68,120,28);ctx.fill();
  ctx.fillStyle='rgba(255,255,255,.68)';ctx.font='800 25px Arial';
  ctx.fillText('TOTAL',x+62,totalY+46);
  ctx.fillStyle='#fff';ctx.font='900 56px Arial';ctx.textAlign='right';
  ctx.fillText(moneyAR(total),x+w-62,totalY+78);
  ctx.textAlign='left';

  ctx.fillStyle='#7b8388';ctx.font='700 21px Arial';
  ctx.fillText('Presupuesto generado con Gestor',x+44,y+h-32);

  return await new Promise(res=>c.toBlob(res,'image/png',.96));
}

async function shareBudget(r){
  const blob=await budgetCardBlob(r);
  const file=new File(
    [blob],
    `presupuesto-${String(r.numero||0).padStart(3,'0')}-${safeFilePart(r.client)}.png`,
    {type:'image/png'}
  );

  if(navigator.share){
    try{
      if(navigator.canShare?.({files:[file]})){
        await navigator.share({title:`Presupuesto - ${r.client||'Cliente'}`,files:[file]});
        return;
      }
    }catch(e){
      if(e?.name==='AbortError')return;
    }
  }

  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=file.name;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1200);
}

async function shareRecord(r){
 const text=textForRecord(r),blob=await recordCardBlob(r),file=new File([blob],`3dcd-${r.status}-${String(r.numero).padStart(3,'0')}.png`,{type:'image/png'});
 if(navigator.share){try{if(navigator.canShare?.({files:[file]}))await navigator.share({title:`${statusLabel(r)} - ${r.client}`,text,files:[file]});else await navigator.share({title:`${statusLabel(r)} - ${r.client}`,text});return}catch(e){if(e?.name==='AbortError')return}}
 try{await navigator.clipboard.writeText(text)}catch{}const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1200)
}
function viewRecords(){
  if(activeFilter==='all')return [...records].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  return records.filter(r=>r.status===activeFilter).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
}
function viewTitle(){
  return activeFilter==='received'?'EN MI PODER':activeFilter==='delivered'?'ENTREGADOS':'TODOS LOS MOVIMIENTOS';
}
function currentText(){
  const data=viewRecords();
  if(!data.length)return `${viewTitle()}\nSin registros.`;
  const rows=data.map(r=>{
    const when=r.status==='delivered'?`Entregado ${shortStamp(r.deliveredAt||r.createdAt)}`:`En mi poder ${shortStamp(r.receivedAt||r.createdAt)}`;
    return `• ${r.client}: ${(r.items||[]).map(i=>`${i.qty||1} ${i.type}${i.color?' '+i.color:''}${i.stamp?' · '+i.stamp:''}`).join(', ')} — ${moneyAR(recordValue(r))} — ${when}`;
  });
  const total=data.reduce((sum,r)=>sum+recordValue(r),0);
  return `${viewTitle()}\n\n${rows.join('\n')}\n\nTOTAL: ${moneyAR(total)}`;
}
async function shareCurrent(){
 const slug=activeFilter==='received'?'en-mi-poder':activeFilter==='delivered'?'entregados':'todos';
 const blob=await currentCardBlob(),file=new File([blob],`3dcd-${slug}-${new Date().toISOString().slice(0,10)}.png`,{type:'image/png'});
 if(navigator.share){
   try{
     if(navigator.canShare?.({files:[file]})){
       await navigator.share({title:viewTitle(),files:[file]});
     }else{
       const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1200);
     }
     return;
   }catch(e){if(e?.name==='AbortError')return}
 }
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1200)
}


async function openSquareCamera(){
  // Requires HTTPS (or localhost). Fallback to native capture if unavailable.
  if(!navigator.mediaDevices?.getUserMedia){
    $('#cameraInput').click();
    return;
  }
  try{
    cameraStream=await navigator.mediaDevices.getUserMedia({
      video:{facingMode:{ideal:'environment'}},
      audio:false
    });
    $('#cameraVideo').srcObject=cameraStream;
    $('#cameraModal').classList.add('show');
  }catch(err){
    $('#cameraInput').click();
  }
}
function closeSquareCamera(){
  $('#cameraModal').classList.remove('show');
  if(cameraStream){
    cameraStream.getTracks().forEach(t=>t.stop());
    cameraStream=null;
  }
  $('#cameraVideo').srcObject=null;
}
function captureSquarePhoto(){
  const v=$('#cameraVideo');
  if(!v.videoWidth||!v.videoHeight)return;
  const size=Math.min(v.videoWidth,v.videoHeight);
  const sx=(v.videoWidth-size)/2;
  const sy=(v.videoHeight-size)/2;
  const c=document.createElement('canvas');
  c.width=720;c.height=720;
  c.getContext('2d').drawImage(v,sx,sy,size,size,0,0,720,720);
  draftPhoto=c.toDataURL('image/jpeg',.82);

  // First return to the editor, then paint the captured square there.
  closeSquareCamera();
  requestAnimationFrame(()=>{
    renderDraftPhoto();
    const box=$('#photoBox');
    if(box){
      box.animate(
        [{transform:'scale(.96)',opacity:.55},{transform:'scale(1)',opacity:1}],
        {duration:180,easing:'ease-out'}
      );
    }
  });
}
$('#closeCameraBtn').onclick=closeSquareCamera;
$('#captureBtn').onclick=captureSquarePhoto;

$('#addBtn').onclick=openNew;
$('#closeBtn').onclick=closeModal;
$('#cameraBtn').onclick=openSquareCamera;
$('#galleryBtn').onclick=()=>$('#galleryInput').click();
$('#cameraInput').onchange=e=>{pickPhoto(e.target.files?.[0]);e.target.value=''};
$('#galleryInput').onchange=e=>{pickPhoto(e.target.files?.[0]);e.target.value=''};

$('#addItemBtn').onclick=()=>{
  draftItems.push(newItem());
  renderItemsEditor();
};
$('#itemsEditor').addEventListener('focusin',e=>{
  if(e.target.dataset.k==='qty'){
    setTimeout(()=>e.target.select(),0);
  }
});
$('#itemsEditor').addEventListener('input',e=>{
  const row=e.target.closest('.item-editor');
  if(!row)return;
  const idx=Number(row.dataset.idx);
  const k=e.target.dataset.k;
  if(!k || !draftItems[idx])return;
  draftItems[idx][k]=e.target.value;
  updateDraftValue();
});
$('#itemsEditor').addEventListener('click',e=>{
  if(e.target.dataset.k==='qty'){
    try{e.target.select()}catch{}
  }
});
$('#itemsEditor').addEventListener('change',e=>{
  const row=e.target.closest('.item-editor');
  if(!row)return;
  const idx=Number(row.dataset.idx);
  const k=e.target.dataset.k;
  if(!k || !draftItems[idx])return;
  draftItems[idx][k]=e.target.value;
  updateDraftValue();
});
$('#itemsEditor').addEventListener('click',e=>{
  const btn=e.target.closest('[data-remove]');
  if(!btn)return;
  const idx=Number(btn.dataset.remove);
  draftItems.splice(idx,1);
  renderItemsEditor();
});

$('#topSaveBtn').onclick=()=>{
  const r=saveDraft();
  if(!r)return;
  closeModal();
};

document.querySelectorAll('[data-state]').forEach(btn=>btn.onclick=()=>{
  activeFilter=btn.dataset.state;render();
});
$('#showAllBtn').onclick=()=>{activeFilter='all';render()};
$('#shareCurrent').onclick=shareCurrent;





function capturePositions(){
  const map=new Map();
  listEl.querySelectorAll('.card').forEach(el=>{
    map.set(el.dataset.id,el.getBoundingClientRect().top);
  });
  return map;
}
function animateReflow(before){
  if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  requestAnimationFrame(()=>{
    listEl.querySelectorAll('.card').forEach(el=>{
      const oldTop=before.get(el.dataset.id);
      if(oldTop==null)return;
      const newTop=el.getBoundingClientRect().top;
      const dy=oldTop-newTop;
      if(Math.abs(dy)<1)return;
      el.style.transition='none';
      el.style.transform=`translateY(${dy}px)`;
      el.offsetHeight;
      el.style.transition='transform .28s ease';
      el.style.transform='translateY(0)';
      setTimeout(()=>{
        el.style.transition='';
        el.style.transform='';
      },300);
    });
  });
}

listEl.addEventListener('click',async e=>{
  const btn=e.target.closest('[data-act]');
  if(!btn)return;
  const card=btn.closest('.card');
  const r=records.find(x=>x.id===card?.dataset.id);
  if(!r)return;
  const act=btn.dataset.act;

  if(act==='budget'){await shareBudget(r);return}
  if(act==='edit'){openEdit(r);return}
  if(act==='deliver'){
    pushHistory();
    const before=capturePositions();
    r.status='delivered';
    r.deliveredAt=nowIso();
    save();
    animateReflow(before);
    return;
  }
  if(act==='reopen'){
    pushHistory();
    const before=capturePositions();
    r.status='received';
    r.receivedAt=nowIso();
    r.deliveredAt=null;
    save();
    animateReflow(before);
    return;
  }
  if(act==='delete'){
    if(!confirm(`¿Eliminar el registro de ${r.client}?`))return;
    pushHistory();
    records=records.filter(x=>x.id!==r.id);
    save();
  }
});

$('#undoBtn').onclick=undo;
$('#redoBtn').onclick=redo;
updateHistoryButtons();
$('#pricesBtn').onclick=openPrices;
$('#closePricesBtn').onclick=closePrices;
$('#savePricesBtn').onclick=savePrices;
$('#menuBtn').onclick=()=>menu.classList.toggle('show');
document.addEventListener('click',e=>{
  if(!menu.contains(e.target) && e.target!==$('#menuBtn'))menu.classList.remove('show');
});


function backupPayload(){
  return {
    app:'recibidos-3dcd',
    version:5,
    exportedAt:nowIso(),
    records,
    prices,
    nextNumber:Number(localStorage.getItem(COUNTER_KEY)||1)
  };
}
function backupStamp(){
  const d=new Date();
  const pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}
function backupFileName(){return `gestor-respaldo-${backupStamp()}.zip`}

// Base compartida por todas las herramientas del ecosistema 3DCD.
// Mientras estén bajo el mismo dominio/origen, cualquier HTML puede verla.
const ECOSYSTEM_DB='3dcd_ecosistema_respaldos_v1';
const ECOSYSTEM_STORE='backups';
function ecosystemDb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(ECOSYSTEM_DB,1);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(ECOSYSTEM_STORE)){
        const st=db.createObjectStore(ECOSYSTEM_STORE,{keyPath:'id'});
        st.createIndex('appId','appId',{unique:false});
        st.createIndex('createdAt','createdAt',{unique:false});
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
async function ecosystemPut(item){
  const db=await ecosystemDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(ECOSYSTEM_STORE,'readwrite');
    tx.objectStore(ECOSYSTEM_STORE).put(item);
    tx.oncomplete=()=>{db.close();resolve(item)};
    tx.onerror=()=>{const e=tx.error;db.close();reject(e)};
  });
}
async function ecosystemGet(id){
  const db=await ecosystemDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(ECOSYSTEM_STORE,'readonly');
    const req=tx.objectStore(ECOSYSTEM_STORE).get(id);
    req.onsuccess=()=>{const v=req.result;db.close();resolve(v)};
    req.onerror=()=>{const e=req.error;db.close();reject(e)};
  });
}
function cleanAppUrl(){
  const u=new URL(location.href);u.search='';u.hash='';return u.href;
}

// ZIP "store" (sin compresión): mantiene el respaldo 100% local y autocontenido,
// sin depender de librerías externas ni conexión a Internet.
let _crcTable=null;
function crc32(bytes){
  if(!_crcTable){
    _crcTable=new Uint32Array(256);
    for(let n=0;n<256;n++){
      let c=n;
      for(let k=0;k<8;k++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);
      _crcTable[n]=c>>>0;
    }
  }
  let c=0xFFFFFFFF;
  for(const b of bytes)c=_crcTable[(c^b)&255]^(c>>>8);
  return (c^0xFFFFFFFF)>>>0;
}
function u16(n){return new Uint8Array([n&255,(n>>>8)&255])}
function u32(n){return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255])}
function concatBytes(parts){
  const len=parts.reduce((a,b)=>a+b.length,0),out=new Uint8Array(len);
  let o=0;for(const b of parts){out.set(b,o);o+=b.length}return out;
}
function zipStore(files){
  const enc=new TextEncoder(),locals=[],centrals=[];let offset=0;
  for(const f of files){
    const name=enc.encode(f.name),data=f.data instanceof Uint8Array?f.data:new Uint8Array(f.data),crc=crc32(data);
    const local=concatBytes([
      u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data
    ]);
    locals.push(local);
    const central=concatBytes([
      u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name
    ]);
    centrals.push(central);offset+=local.length;
  }
  const centralData=concatBytes(centrals);
  const end=concatBytes([u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(centralData.length),u32(offset),u16(0)]);
  return new Blob([...locals,centralData,end],{type:'application/zip'});
}
function readU16(a,o){return a[o]|(a[o+1]<<8)}
function readU32(a,o){return (a[o]|(a[o+1]<<8)|(a[o+2]<<16)|(a[o+3]<<24))>>>0}
function unzipStored(arrayBuffer){
  const a=new Uint8Array(arrayBuffer),files={};let o=0;
  while(o+30<=a.length && readU32(a,o)===0x04034b50){
    const method=readU16(a,o+8),compSize=readU32(a,o+18),nameLen=readU16(a,o+26),extraLen=readU16(a,o+28);
    const name=new TextDecoder().decode(a.slice(o+30,o+30+nameLen));
    const dataStart=o+30+nameLen+extraLen;
    if(method!==0)throw new Error('ZIP comprimido no compatible');
    files[name]=a.slice(dataStart,dataStart+compSize);o=dataStart+compSize;
  }
  return files;
}

function buildBackupZip(){
  const json=JSON.stringify(backupPayload(),null,2);
  const jsonBytes=new TextEncoder().encode(json);
  const info=new TextEncoder().encode('Respaldo de Gestor. El archivo gestor.json contiene todos los datos y las imágenes embebidas.');
  return zipStore([{name:'gestor.json',data:jsonBytes},{name:'LEEME.txt',data:info}]);
}
function downloadBlob(blob,name){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=name;a.style.display='none';document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}
async function restoreFromBackupBlob(blob,ask=true){
  const z=unzipStored(await blob.arrayBuffer());
  const entry=z['gestor.json']||z['recibidos.json'];
  if(!entry)throw new Error('Falta gestor.json');
  const x=JSON.parse(new TextDecoder().decode(entry));
  if(x.app!=='recibidos-3dcd' || !Array.isArray(x.records))throw new Error('Respaldo no válido');
  if(ask && !confirm('¿Reemplazar los datos actuales por este respaldo?'))return false;
  pushHistory();records=x.records;
  if(x.prices&&typeof x.prices==='object'){prices=x.prices;localStorage.setItem(PRICES_KEY,JSON.stringify(prices));}
  localStorage.setItem(COUNTER_KEY,String(Math.max(Number(x.nextNumber||1),Math.max(0,...records.map(r=>Number(r.numero||0)))+1)));
  save();
  return true;
}

$('#centralBackupBtn').onclick=async()=>{
  menu.classList.remove('show');
  try{
    const blob=buildBackupZip();
    const id='gestor-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);
    await ecosystemPut({
      id,appId:'gestor',appName:'Gestor',appUrl:cleanAppUrl(),createdAt:nowIso(),
      fileName:backupFileName(),mime:'application/zip',size:blob.size,blob,formatVersion:1
    });
    alert('Respaldo guardado en la aplicación Respaldos.');
  }catch(err){
    console.error(err);alert('No se pudo guardar en Respaldos. Verificá que esta herramienta esté abierta desde el mismo sitio.');
  }
};

$('#exportBtn').onclick=()=>{
  menu.classList.remove('show');
  try{downloadBlob(buildBackupZip(),backupFileName())}
  catch(err){console.error('No se pudo descargar el respaldo',err);alert('No se pudo generar el respaldo ZIP.')}
};

$('#importBtn').onclick=()=>$('#importFile').click();
$('#importFile').onchange=async e=>{
  const f=e.target.files?.[0];e.target.value='';if(!f)return;
  try{
    let x;
    if(/\.zip$/i.test(f.name)||f.type==='application/zip'){
      const z=unzipStored(await f.arrayBuffer());
      const entry=z['gestor.json']||z['recibidos.json'];
      if(!entry)throw new Error('Falta gestor.json');
      x=JSON.parse(new TextDecoder().decode(entry));
    }else{
      x=JSON.parse(await f.text());
    }
    if(x.app!=='recibidos-3dcd' || !Array.isArray(x.records))throw new Error();
    if(!confirm('¿Reemplazar los datos actuales por este respaldo?'))return;
    pushHistory();records=x.records;
    if(x.prices&&typeof x.prices==='object'){
      prices=x.prices;localStorage.setItem(PRICES_KEY,JSON.stringify(prices));
    }
    localStorage.setItem(COUNTER_KEY,String(Math.max(Number(x.nextNumber||1),Math.max(0,...records.map(r=>Number(r.numero||0)))+1)));
    save();
  }catch(err){
    console.error(err);alert('Ese archivo no parece ser un respaldo válido de Gestor.');
  }
  menu.classList.remove('show');
};
$('#clearDeliveredBtn').onclick=()=>{
  const n=records.filter(r=>r.status==='delivered').length;
  if(!n){alert('No hay entregados para eliminar.');return}
  if(!confirm(`¿Eliminar ${n} registro${n===1?'':'s'} entregado${n===1?'':'s'}?`))return;
  pushHistory();
  records=records.filter(r=>r.status!=='delivered');
  save();
  menu.classList.remove('show');
};

async function checkIncomingEcosystemRestore(){
  const u=new URL(location.href),id=u.searchParams.get('restoreBackup');
  if(!id)return;
  u.searchParams.delete('restoreBackup');
  history.replaceState({},'',u.pathname+(u.search||'')+u.hash);
  try{
    const item=await ecosystemGet(id);
    if(!item || item.appId!=='gestor' || !item.blob)throw new Error('No encontrado');
    if(confirm(`¿Restaurar en Gestor el respaldo del ${fmtDate(item.createdAt)}?`)){
      await restoreFromBackupBlob(item.blob,false);
      alert('Respaldo restaurado.');
    }
  }catch(err){console.error(err);alert('No se pudo abrir ese respaldo desde la aplicación Respaldos.')}
}

window.addEventListener('beforeunload',save);
load();loadPrices();render();updateHistoryButtons();
setTimeout(checkIncomingEcosystemRestore,120);
