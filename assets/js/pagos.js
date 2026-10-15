/**
 * Simulador de pagos de GymGo.
 * Mantiene el carrito local, renderiza el checkout y conecta las órdenes
 * de prueba con la API del backend.
 */
const PRODUCTS=[
 {id:'esencial',title:'Básico',price:99,cobro:'/mes',rec:true,desc:'La base digital para operar tu gimnasio.'},
 {id:'pro',title:'Pro con Hardware IoT',price:199,cobro:'/mes',rec:true,desc:'Acceso inteligente y control operativo en tiempo real.'},
 {id:'hw',title:'Enterprise',price:250,cobro:' pago único',rec:false,desc:'Herramientas para redes y operaciones complejas.'}];
const isRec=pid=>PRODUCTS.find(q=>q.id==pid)?.rec, cobroOf=pid=>PRODUCTS.find(q=>q.id==pid)?.cobro||'';
const user=JSON.parse(localStorage.getItem('userData')||'null');
const token=localStorage.getItem('token');
if(!user||!token) {
 const returnTo=`pagos.html${location.search}`;
 location.href=`login.html?returnTo=${encodeURIComponent(returnTo)}`;
}
const K=`gg_pay_${user?.id||user?.email||'guest'}`;
let S=JSON.parse(localStorage.getItem(K)||'null')||{cart:[],orders:[]};
const guestState=JSON.parse(localStorage.getItem('gg_pay_guest')||'null');
if (guestState && K !== 'gg_pay_guest') {
 S={cart:[...(guestState.cart||[])],orders:[]};
 localStorage.removeItem('gg_pay_guest');
}
const $=s=>document.querySelector(s), money=n=>'$'+Number(n).toLocaleString('es-MX',{minimumFractionDigits:2})+' MXN';
const API=`${window.SIRID_API_URL}/api/payments`;
const paymentRequest=async(path='',options={})=>{let response;
 try{response=await fetch(API+path,{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`}})}
 catch(error){throw new Error('No se pudo conectar con Express. Verifica que el backend esté activo en http://localhost:3000.')}
 const data=await response.json().catch(()=>({}));
 if(response.status===401){localStorage.removeItem('token');localStorage.removeItem('userData');location.href=`login.html?returnTo=${encodeURIComponent(`pagos.html${location.search}`)}`;throw new Error(data.msg||'Tu sesión expiró. Inicia sesión nuevamente.')}
 if(!response.ok)throw new Error(`${data.msg||'El servidor rechazó la orden.'} (HTTP ${response.status})`);
 return data};
const sub=()=>S.cart.reduce((a,i)=>a+i.price*i.qty,0), tot=()=>+(sub()*1.16).toFixed(2), qtyN=()=>S.cart.reduce((a,i)=>a+i.qty,0);
const gm=new bootstrap.Modal('#gm'), modal=h=>{$('#gmb').innerHTML=h;gm.show()};
const toast=t=>{$('#toastB').textContent=t;bootstrap.Toast.getOrCreateInstance('#toast',{delay:1800}).show()};
const save=()=>{localStorage.setItem(K,JSON.stringify(S));render()};

function shareURL(){const b=location.origin+location.pathname;
 return `${b}?c=${encodeURIComponent(btoa(encodeURIComponent(JSON.stringify({cart:S.cart,orders:S.orders}))))}`}
async function boot(){
 const q=new URLSearchParams(location.search);
 try{ if(q.get('c')){const d=JSON.parse(decodeURIComponent(atob(decodeURIComponent(q.get('c')))));S.cart=d.cart||[];S.orders=d.orders||[]} }catch(e){toast('No se pudo recuperar el carrito')}
 try{S.orders=(await paymentRequest()).payments||S.orders}catch(e){toast(e.message)}
 const pl=q.get('plan');if(pl){const f=PRODUCTS.find(x=>x.id==pl||x.title.toLowerCase()==pl.toLowerCase());if(f)await add(f.id)}
 if(q.get('c')||pl)history.replaceState(null,'',location.pathname);
 save()}

function add(pid){const p=PRODUCTS.find(x=>x.id==pid);
 if(p.rec)S.cart=S.cart.filter(x=>!isRec(x.pid)||x.pid==pid);
 const i=S.cart.find(x=>x.id==pid);i?(p.rec||i.qty++):S.cart.push({id:pid,pid,title:p.title,price:p.price,qty:1});
 save();toast(p.title+' agregado')}
function chg(id,d){const i=S.cart.find(x=>x.id==id);if(!i)return;const n=i.qty+d;
 n<1?S.cart=S.cart.filter(x=>x.id!=id):i.qty=n;save()}

/* ===== Render ===== */
function render(){
 $('#prods').innerHTML=PRODUCTS.map(p=>`<div class="col-12 col-md-4"><div class="prod d-flex justify-content-between align-items-center gap-2">
  <div><div class="fw-semibold">${p.title}</div><div class="small text-white-50">${p.desc}</div><div class="fw-bold mt-1">${money(p.price)}${p.cobro}</div></div>
  <button class="btn btn-w btn-sm" onclick="add('${p.id}')"><i class="bi bi-plus-lg"></i></button></div></div>`).join('');
 $('#cnt').textContent=$('#cnt2').textContent=qtyN();
 $('#totTop').textContent=$('#totBar').textContent=money(tot());
 $('#items').innerHTML=S.cart.length?S.cart.map(i=>`<div class="d-flex justify-content-between align-items-center border-bottom py-2">
  <div><div class="fw-semibold">${i.title}</div><div class="small text-muted">${money(i.price)}${cobroOf(i.pid)}</div></div>
  <div class="d-flex align-items-center gap-2"><button class="btn btn-sm btn-outline-dark" onclick="chg('${i.id}',-1)">−</button><b>${i.qty}</b><button class="btn btn-sm btn-outline-dark" onclick="chg('${i.id}',1)">+</button></div></div>`).join(''):'<p class="text-muted text-center mt-4">Tu carrito está vacío</p>';
 const s=sub();$('#sum').innerHTML=`<div class="d-flex justify-content-between"><span>Subtotal</span><span>${money(s)}</span></div><div class="d-flex justify-content-between"><span>IVA 16%</span><span>${money(s*.16)}</span></div><div class="d-flex justify-content-between fw-bold fs-6 mt-1"><span>Total hoy</span><span>${money(tot())}</span></div>${S.cart.some(i=>isRec(i.pid))?'<div class="text-muted mt-1">Suscripción mensual: se renueva cada mes.</div>':''}`;
 $('#medNote').textContent=`Carrito asociado a ${user.nombre||user.email} y guardado en este navegador. Usa "Continuar en otro dispositivo" para moverlo.`;
 ['#payStripe','#payPaynet','#payPP'].forEach(b=>$(b).disabled=!S.cart.length);
 dash()}
function dash(){
 const paid=S.orders.filter(o=>o.status=='pagado'),pend=S.orders.filter(o=>o.status=='pendiente');
 const k=(t,v)=>`<div class="col-4"><div class="kpi"><div class="small text-muted">${t}</div><b>${v}</b></div></div>`;
 $('#kpis').innerHTML=k('Recibido',money(paid.reduce((a,o)=>a+o.total,0)))+k('Pendiente',money(pend.reduce((a,o)=>a+o.total,0)))+k('Operaciones',S.orders.length);
 const ic={stripe:'bi-credit-card',paynet:'bi-upc-scan',paypal:'bi-paypal'};
 $('#txs').innerHTML=S.orders.length?S.orders.map(o=>`<div class="d-flex justify-content-between align-items-center border-bottom py-2">
  <div><i class="bi ${ic[o.method]} me-2"></i><b>${o.id}</b><div class="small text-muted">${new Date(o.date).toLocaleString('es-MX')} · ${o.method}${o.last4?' ····'+o.last4:''}</div></div>
  <div class="text-end"><div class="fw-semibold">${money(o.total)}</div>
  ${o.status=='pagado'?'<span class="badge text-bg-success">Pagado</span>':`<button class="btn btn-sm btn-outline-dark" onclick="ficha('${o.id}')">Ver ficha</button>`}</div></div>`).join(''):'<p class="text-muted text-center">Aún no hay transacciones.</p>'}

/* ===== Órdenes ===== */
async function order(method,status,ex={}){const o={id:'GG-'+Date.now().toString(36).toUpperCase(),method,status,total:tot(),items:qtyN(),date:new Date().toISOString(),...ex};
 const subtotal=+sub().toFixed(2), tax=+(subtotal*.16).toFixed(2);
 const data=await paymentRequest('',{method:'POST',body:JSON.stringify({id:o.id,method,status,subtotal,tax,total:o.total,last4:o.last4,ref:o.ref,exp:o.exp,items:S.cart.map(item=>({productId:item.pid,title:item.title,unitPrice:item.price,quantity:item.qty}))})});
 S.orders.unshift(data.payment||o);S.cart=[];save();return data.payment||o}
const ok=(t,o)=>modal(`<div class="text-center"><i class="bi bi-check-circle-fill text-success" style="font-size:3rem"></i><h5 class="fw-bold mt-2">${t}</h5><p class="mb-1">Orden <b>${o.id}</b></p><p class="text-muted">${money(o.total)}</p><button class="btn btn-d w-100" data-bs-dismiss="modal">Listo</button></div>`);

/* ===== STRIPE ===== */
const luhn=n=>{let s=0,d=0;for(let i=n.length-1;i>=0;i--){let x=+n[i];if(d++%2){x*=2;if(x>9)x-=9}s+=x}return s%10==0};
const $n=$('#cNum'),$e=$('#cExp');
function pv(){const d=$n.value.replace(/\D/g,'');$('#pvNum').textContent=(d.padEnd(16,'•').match(/.{1,4}/g)||[]).join(' ');
 $('#pvName').textContent=($('#cName').value||'NOMBRE APELLIDO').toUpperCase();$('#pvExp').textContent=$e.value||'MM/AA';
 $('#brand').textContent=d[0]=='4'?'VISA':d[0]=='5'?'MASTERCARD':d[0]=='3'?'AMEX':'CARD'}
$n.oninput=()=>{$n.value=$n.value.replace(/\D/g,'').slice(0,16).replace(/(.{4})/g,'$1 ').trim();pv()};
$e.oninput=()=>{let v=$e.value.replace(/\D/g,'').slice(0,4);if(v.length>2)v=v.slice(0,2)+'/'+v.slice(2);$e.value=v;pv()};
$('#cName').oninput=pv;
document.querySelectorAll('[data-card]').forEach(b=>b.onclick=()=>{$n.value=b.dataset.card.replace(/(.{4})/g,'$1 ').trim();$e.value='12/30';$('#cCvc').value='123';if(!$('#cName').value)$('#cName').value='Cliente Prueba';pv()});
$('#payStripe').onclick=()=>{
 const d=$n.value.replace(/\D/g,''),m=+$e.value.slice(0,2),y=+('20'+$e.value.slice(3)),now=new Date(),er=$('#cErr');er.textContent='';
 if(d.length<13||!luhn(d))return er.textContent='El número de tarjeta no es válido.';
 if(!(m>=1&&m<=12)||y<now.getFullYear()||(y==now.getFullYear()&&m<now.getMonth()+1))return er.textContent='La fecha de vencimiento no es válida.';
 if($('#cCvc').value.length<3)return er.textContent='El CVC está incompleto.';
 const b=$('#payStripe');b.disabled=true;b.innerHTML='<span class="spinner-border spinner-border-sm"></span> Procesando…';
 setTimeout(()=>{b.innerHTML='Pagar con tarjeta';b.disabled=!S.cart.length;
  if(d=='4000000000000002')return er.textContent='Tu tarjeta fue rechazada.';
  if(d=='4000000000009995')return er.textContent='Fondos insuficientes.';
  const fin=async()=>{try{const saved=await order('stripe','pagado',{last4:d.slice(-4)});gm.hide();ok('Pago exitoso con Stripe',saved)}catch(error){er.textContent=error.message}};
  if(d=='4000002500003155')modal(`<div class="text-center"><i class="bi bi-shield-lock fs-1"></i><h5 class="fw-bold">Verificación 3D Secure</h5><p class="small text-muted">Tu banco (simulado) solicita autenticar ${money(tot())}.</p><button id="a3" class="btn btn-d w-100 mb-2">Autenticar</button><button class="btn btn-light w-100" data-bs-dismiss="modal">Cancelar</button></div>`),$('#a3').onclick=()=>setTimeout(fin,500);
  else fin()},1200)};

/* ===== PAYNET (Code 39 para el demo) ===== */
const C39={'0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn','4':'nnnwwnnnw','5':'wnnwwnnnn','6':'nnwwwnnnn','7':'nnnwnnwnw','8':'wnnwnnwnn','9':'nnwwnnwnn','*':'nwnnwnwnn'};
function barcode(t){let x=10,r='';for(const c of '*'+t+'*'){[...C39[c]].forEach((e,i)=>{const w=e=='w'?5:2;if(i%2==0)r+=`<rect x="${x}" y="0" width="${w}" height="64"/>`;x+=w});x+=2}
 return `<svg viewBox="0 0 ${x+10} 64" class="w-100" fill="#000" preserveAspectRatio="none" style="height:80px">${r}</svg>`}
$('#payPaynet').onclick=async()=>{const ref=Array.from({length:16},()=>Math.floor(Math.random()*10)).join('');
 try{const o=await order('paynet','pendiente',{ref,exp:Date.now()+72*36e5});ficha(o.id)}catch(error){toast(error.message)}};
function ficha(id){const o=S.orders.find(x=>x.id==id);if(!o)return;
 modal(`<div class="ficha"><div class="fw-bold">Paynet · Pago en tienda</div>${barcode(o.ref)}<div style="font-family:monospace;letter-spacing:2px">${o.ref.replace(/(.{4})/g,'$1 ').trim()}</div>
  <div class="mt-2">Monto: <b>${money(o.total)}</b></div><div class="small text-muted">Vence: ${new Date(o.exp).toLocaleString('es-MX')}</div></div>
  ${o.status=='pagado'?'<div class="alert alert-success mt-3 mb-0 text-center">Pagado</div>':`<button id="pn" class="btn btn-d w-100 mt-3">Simular pago en tienda</button>`}`);
 const b=$('#pn');if(b)b.onclick=async()=>{b.disabled=true;b.textContent='Validando en tienda…';setTimeout(async()=>{try{const data=await paymentRequest(`/${encodeURIComponent(o.id)}/status`,{method:'PATCH',body:JSON.stringify({status:'pagado'})});o.status=data.payment.status;save();gm.hide();ok('Pago Paynet recibido',o)}catch(error){b.disabled=false;b.textContent='Simular pago en tienda';toast(error.message)}},1200)}}

/* ===== PAYPAL ===== */
$('#payPP').onclick=()=>modal(`<div class="text-center"><i class="bi bi-paypal fs-1 text-primary"></i><h5 class="fw-bold">Inicia sesión en PayPal</h5></div>
 <input class="form-control mb-2" value="comprador@gymgo.test"><input class="form-control mb-3" type="password" value="sandbox123">
 <div class="small text-muted mb-3">Pagarás ${money(tot())} a Project-GymGo.</div><button id="ppo" class="pp w-100">Aprobar y pagar</button>`);
document.addEventListener('click',e=>{if(e.target.closest('#ppo')){const b=$('#ppo');b.innerHTML='<span class="spinner-border spinner-border-sm"></span>';setTimeout(async()=>{try{const saved=await order('paypal','pagado');gm.hide();ok('Pago aprobado en PayPal',saved)}catch(error){b.textContent=error.message;b.disabled=false}},1000)}});

/* ===== Varios ===== */
$('#share').onclick=async()=>{const u=shareURL();
 try{navigator.share?await navigator.share({title:'Mi carrito GymGo',url:u}):(await navigator.clipboard.writeText(u),toast('Enlace copiado: ábrelo en otro dispositivo'))}catch(e){prompt('Copia este enlace:',u)}};
$('#reset').onclick=()=>{if(confirm('¿Borrar carrito y transacciones de prueba?')){S={cart:[],orders:[]};save()}};
$('#sessionUser').textContent=`Sesión: ${user?.nombre||user?.email||''}`;
boot();
