(() => {
  const $ = (id) => document.getElementById(id);
  const CONFIG = window.VELOGO_CONFIG || {};
  const cloudReady = !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY && window.supabase);
  const db = cloudReady ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY) : null;
  const center = [51.6608, 39.2003];
  const demoScooters = [
    {id:"VG-101",lat:51.6608,lng:39.2003,battery:96,status:"available"},
    {id:"VG-102",lat:51.6682,lng:39.2075,battery:82,status:"available"},
    {id:"VG-103",lat:51.6548,lng:39.1904,battery:74,status:"available"},
    {id:"VG-104",lat:51.6721,lng:39.1845,battery:61,status:"available"},
    {id:"VG-105",lat:51.6489,lng:39.2142,battery:90,status:"available"},
    {id:"VG-106",lat:51.6651,lng:39.2220,battery:55,status:"available"},
    {id:"VG-107",lat:51.6560,lng:39.2260,battery:43,status:"available"},
    {id:"VG-108",lat:51.6750,lng:39.1990,battery:88,status:"available"},
    {id:"VG-109",lat:51.6450,lng:39.1990,battery:68,status:"available"},
    {id:"VG-110",lat:51.6625,lng:39.1770,battery:79,status:"available"}
  ];
  const state = {user:null, scooters:[], selected:null, authMode:"login", activeRide:null};
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem("velogo_"+key)) ?? fallback; } catch { return fallback; } };
  const write = (key, val) => localStorage.setItem("velogo_"+key, JSON.stringify(val));
  const toast = (msg) => { $("toast").textContent=msg; $("toast").classList.add("show"); setTimeout(()=>$("toast").classList.remove("show"),2600); };
  const esc = (s) => String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const map = L.map("map").setView(center,13);
  map.attributionControl.setPrefix(false); // убираем подпись Leaflet; авторство OpenStreetMap указано в примечании карты
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
  let markers=[];
  function saveDemo(){write("scooters",state.scooters);}
  async function loadScooters(){
    if(db){
      const {data,error}=await db.from("scooters").select("*").order("id");
      if(!error && data && data.length){state.scooters=data.map(s=>({id:s.code,lat:s.lat,lng:s.lng,battery:s.battery,status:s.status,dbid:s.id}));}
      else {state.scooters=demoScooters.map(s=>({...s}));}
    } else { state.scooters=read("scooters",demoScooters); }
    renderScooters();
  }
  function renderScooters(){
    $("scooter-list").innerHTML="";
    const filter=$("status-filter").value;
    const visible=state.scooters.filter(s=>filter==="all" || s.status==="available");
    visible.forEach(s=>{
      const card=document.createElement("article");card.className="scooter-card";
      card.innerHTML=`<div class="card-top"><div class="scooter-icon">🛴</div><span class="status ${s.status==="available"?"":"busy"}">${s.status==="available"?"Свободен":"Занят"}</span></div><h3>${esc(s.id)}</h3><div class="card-meta"><span>Заряд батареи</span><b>${s.battery}%</b></div><div class="battery"><span style="width:${s.battery}%"></span></div><div class="card-bottom"><span>45 ₽ + 8 ₽/мин</span><b>Открыть →</b></div>`;
      card.addEventListener("click",()=>openScooter(s.id));$("scooter-list").append(card);
    });
    markers.forEach(m=>map.removeLayer(m));markers=[];
    state.scooters.forEach(s=>{
      const color=s.status==="available"?"#78b936":"#969d97";
      const icon=L.divIcon({className:"",html:`<div style="width:30px;height:30px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 8px #0004;display:grid;place-items:center;font-size:15px">🛴</div>`,iconSize:[30,30],iconAnchor:[15,15]});
      const marker=L.marker([s.lat,s.lng],{icon}).addTo(map).bindPopup(`<b>${esc(s.id)}</b><br>${s.battery}% · ${s.status==="available"?"Свободен":"Занят"}`);
      marker.on("click",()=>openScooter(s.id));markers.push(marker);
    });
  }
  function openScooter(id){
    const s=state.scooters.find(x=>x.id===id);if(!s)return;state.selected=s;
    $("scooter-title").textContent=s.id;
    $("scooter-details").innerHTML=`Статус: <b>${s.status==="available"?"Свободен":"Занят"}</b><br>Заряд: <b>${s.battery}%</b><br>Старт: <b>45 ₽</b><br>Каждая минута: <b>8 ₽</b>`;
    const booking=read("bookings",[]).find(b=>b.user===userKey()&&b.scooter===id&&b.expires>Date.now());
    const ride=read("rides",[]).find(r=>r.user===userKey()&&r.scooter===id&&!r.end);
    $("reserve-btn").classList.toggle("hidden",s.status!=="available"||!!booking||!!ride);
    $("ride-btn").classList.toggle("hidden",!booking);
    $("finish-btn").classList.toggle("hidden",!ride);
    $("scooter-dialog").showModal();
  }
  function userKey(){return state.user?.id || state.user?.email || "guest";}
  async function refreshUser(){
    if(db){const {data}=await db.auth.getUser();state.user=data.user||null;}
    $("user-label").textContent=state.user?(state.user.email||"Вы вошли"):"";
    $("auth-open").classList.toggle("hidden",!!state.user);$("logout").classList.toggle("hidden",!state.user);
    renderHistory();
  }
  async function signIn(email,password,signup){
    if(db){
      const result=signup?await db.auth.signUp({email,password}):await db.auth.signInWithPassword({email,password});
      if(result.error)throw result.error;
      if(signup&&!result.data.session)throw new Error("Проверь почту и подтверди регистрацию, затем войди.");
      state.user=result.data.user;
    } else {
      const users=read("users",[]);
      if(signup){if(users.some(u=>u.email===email))throw new Error("Такой email уже зарегистрирован.");users.push({email,password});write("users",users);}
      else if(!users.some(u=>u.email===email&&u.password===password))throw new Error("Неверный email или пароль.");
      state.user={id:email,email};write("session",state.user);
    }
    await refreshUser();$("auth-dialog").close();toast(signup?"Аккаунт создан":"Вы вошли в аккаунт");
  }
  function renderHistory(){
    if(!state.user){$("history").innerHTML='<p class="muted">Войди в аккаунт, чтобы увидеть историю.</p>';return;}
    const rides=read("rides",[]).filter(r=>r.user===userKey()).sort((a,b)=>b.start-a.start);
    const bookings=read("bookings",[]).filter(b=>b.user===userKey()&&b.expires>Date.now());
    let html=bookings.map(b=>`<div class="history-item"><div><b>Бронь ${esc(b.scooter)}</b><small>Действует до ${new Date(b.expires).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</small></div><b>Ожидает</b></div>`).join("");
    html+=rides.map(r=>`<div class="history-item"><div><b>${esc(r.scooter)}</b><small>${new Date(r.start).toLocaleString("ru-RU")}${r.end?" · поездка завершена":" · поездка идёт"}</small></div><b>${r.cost!=null?r.cost+" ₽":"В процессе"}</b></div>`).join("");
    $("history").innerHTML=html||'<p class="muted">Пока поездок нет. Выбери самокат на карте!</p>';
  }
  async function reserve(){
    if(!state.user){toast("Сначала войди или зарегистрируйся");$("scooter-dialog").close();$("auth-dialog").showModal();return;}
    const s=state.selected;if(!s)return;
    if(db){const {error}=await db.from("reservations").insert({user_id:state.user.id,scooter_code:s.id,expires_at:new Date(Date.now()+10*60*1000).toISOString()});if(error){toast(error.message);return;}}
    else {const list=read("bookings",[]).filter(b=>b.expires>Date.now());list.push({user:userKey(),scooter:s.id,expires:Date.now()+600000});write("bookings",list);}
    toast("Самокат забронирован на 10 минут");$("scooter-dialog").close();renderHistory();openScooter(s.id);
  }
  async function startRide(){
    if(!state.user)return toast("Войди в аккаунт");
    const s=state.selected;if(!s)return;
    if(db){const {error}=await db.from("rides").insert({user_id:state.user.id,scooter_code:s.id,started_at:new Date().toISOString()});if(error){toast(error.message);return;}}
    else {const rides=read("rides",[]);rides.push({user:userKey(),scooter:s.id,start:Date.now(),end:null});write("rides",rides);const bs=read("bookings",[]).filter(b=>!(b.user===userKey()&&b.scooter===s.id));write("bookings",bs);}
    toast("Поездка началась!");$("scooter-dialog").close();renderHistory();openScooter(s.id);
  }
  async function finishRide(){
    const s=state.selected;if(!s)return;
    if(db){
      const {data}=await db.from("rides").select("*").eq("user_id",state.user.id).eq("scooter_code",s.id).is("ended_at",null).order("started_at",{ascending:false}).limit(1).maybeSingle();
      if(!data)return toast("Активная поездка не найдена");
      const mins=Math.max(1,Math.ceil((Date.now()-new Date(data.started_at).getTime())/60000)),cost=45+8*mins;
      const {error}=await db.from("rides").update({ended_at:new Date().toISOString(),duration_minutes:mins,cost}).eq("id",data.id);if(error)return toast(error.message);
      toast(`Поездка завершена. К оплате: ${cost} ₽`);
    } else {
      const rides=read("rides",[]);const r=[...rides].reverse().find(x=>x.user===userKey()&&x.scooter===s.id&&!x.end);if(!r)return toast("Активная поездка не найдена");
      r.end=Date.now();r.minutes=Math.max(1,Math.ceil((r.end-r.start)/60000));r.cost=45+8*r.minutes;write("rides",rides);toast(`Поездка завершена. К оплате: ${r.cost} ₽`);
    }
    $("scooter-dialog").close();renderHistory();
  }
  $("auth-open").addEventListener("click",()=>{$("auth-dialog").showModal();});
  $("logout").addEventListener("click",async()=>{if(db)await db.auth.signOut();else write("session",null);state.user=null;await refreshUser();toast("Вы вышли из аккаунта");});
  $("auth-form").addEventListener("submit",async e=>{e.preventDefault();$("auth-message").textContent="";try{await signIn($("auth-email").value.trim(),$("auth-password").value,state.authMode==="signup");}catch(err){$("auth-message").textContent=err.message||"Не удалось выполнить вход";}});
  $("switch-auth").addEventListener("click",()=>{state.authMode=state.authMode==="login"?"signup":"login";$("auth-title").textContent=state.authMode==="login"?"Войти в VeloGo":"Создать аккаунт";$("auth-submit").textContent=state.authMode==="login"?"Войти":"Зарегистрироваться";$("switch-text").textContent=state.authMode==="login"?"Нет аккаунта?":"Уже есть аккаунт?";$("switch-auth").textContent=state.authMode==="login"?"Зарегистрироваться":"Войти";$("auth-message").textContent="";});
  $("reserve-btn").addEventListener("click",reserve);$("ride-btn").addEventListener("click",startRide);$("finish-btn").addEventListener("click",finishRide);
  $("status-filter").addEventListener("change",renderScooters);
  if(db)db.auth.onAuthStateChange((_event,session)=>{state.user=session?.user||null;refreshUser();});
  else state.user=read("session",null);
  refreshUser();loadScooters();
  if(!cloudReady)console.info("VeloGo работает в локальном демо-режиме. Настройте Supabase в config.js для синхронизации между устройствами.");
})();
