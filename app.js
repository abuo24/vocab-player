window.addEventListener("error",e=>{try{const n=document.getElementById("notice");if(n){n.textContent="Error: "+(e.message||e)+" (line "+(e.lineno||"?")+")";n.style.display="block"}}catch(_){}});
(function(){
"use strict";
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const LS={get(k,d){try{const v=localStorage.getItem("vp:"+k);return v==null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem("vp:"+k,JSON.stringify(v))}catch(e){}}};
const ICON_PLAY='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>';
const ICON_PAUSE='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4.5v16H6zM13.5 4H18v16h-4.5z"/></svg>';
const DEFAULT_SHEET="https://docs.google.com/spreadsheets/d/1h5_GkOlQGnab_c-i8scsVCRWQguciDZ0d3EDSaKs99g/edit?usp=sharing";
const GD="Google Drive";
const XLSX_MIME="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const IS_IOS=/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
const defaults={rate:1,gap:1.5,repeat:1,sayWord:true,spell:false,sayMeaning:true,sayExample:true,wordAgain:false,wordVoice:"",meaningVoice:"auto",engine:"device",claudeVoice:"buttery",wakeLock:true,bg:IS_IOS,bgVoice:"natural",ttsG:"f",shuffle:false,loop:true,filter:"all",quiz:false,dir:"en",mode:"all",book:"all",unit:"all",sheetLink:DEFAULT_SHEET,synced:false,lastSync:0};
const savedS=LS.get("settings",{});
const S=Object.assign({},defaults,savedS);
if(!savedS.bgv3){S.bgVoice="natural";S.bgv2=true;S.bgv3=true}
if(!("mode" in savedS))S.mode=(S.book&&S.book!=="all")?"book":"all";
const saveS=()=>LS.set("settings",S);
const str=v=>String(v==null?"":v).trim();
const clean=a=>(Array.isArray(a)?a:[]).map(x=>({w:str(x&&x.w),m:str(x&&x.m),e:str(x&&x.e),b:str(x&&x.b),u:str(x&&x.u)})).filter(x=>x.w);
let words=clean(LS.get("words",[]));
let listAt=LS.get("listAt",0);
let known=new Set(LS.get("known",[])),star=new Set(LS.get("star",[]));
let progAt=LS.get("progAt",0);
const key=it=>it.w.toLowerCase();
let queue=[],pos=0,playing=false,runId=0,revealed=!S.quiz;
let sleepAt=0,sleepMins=0;
let claudeTTS=null,mcp=null;
const card=$("#card");
/* ---------- scope & queue ---------- */
let recentCache={};
const RECENT={last1:1,last3:3};
function recentSet(b,n){const k=b+"|"+n;if(!recentCache[k])recentCache[k]=new Set(units(b).slice(-n));return recentCache[k]}
function inRecent(it,n){const set=recentSet(it.b,n);return set.size?set.has(it.u):true}
function inScope(it){
const m=S.mode;
if(m==="all")return true;
if(RECENT[m])return inRecent(it,RECENT[m]);
if(it.b!==S.book)return false;
if(S.unit==="all")return true;
if(RECENT[S.unit])return inRecent(it,RECENT[S.unit]);
return it.u===S.unit;
}
function inStatus(it,f){const k=key(it);if(f==="learning")return !known.has(k);if(f==="star")return star.has(k);if(f==="known")return known.has(k);return true}
function inFilter(i){const it=words[i];return inScope(it)&&inStatus(it,S.filter)}
function shuffleArr(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function buildQueue(keepIdx){
const cur=keepIdx===undefined?queue[pos]:keepIdx;
queue=words.map((_,i)=>i).filter(inFilter);
if(S.shuffle)shuffleArr(queue);
let p=(cur==null||cur<0)?-1:queue.indexOf(cur);
if(S.shuffle&&p>0){queue.splice(p,1);queue.unshift(cur);p=0}
pos=p>=0?p:0;
}
function lastIdx(){const k=LS.get("last","");if(!k)return -1;return words.findIndex(it=>key(it)===k&&inScope(it))}
function advance(dir,auto){
if(!queue.length)return false;
let p=pos;
for(let n=0;n<=queue.length;n++){
p+=dir;
if(p>=queue.length){
if(!S.loop&&auto)return false;
buildQueue(-1);p=0;
if(!queue.length)return false;
if(inFilter(queue[0])){pos=0;afterMove();return true}
continue;
}
if(p<0)p=queue.length-1;
if(inFilter(queue[p])){pos=p;afterMove();return true}
}
return false;
}
function afterMove(){
revealed=!S.quiz;
const it=current();if(it)LS.set("last",key(it));
renderCard();markListCurrent(true);
}
const current=()=>queue.length?words[queue[pos]]:null;
function books(){const s=[];words.forEach(w=>{if(w.b&&!s.includes(w.b))s.push(w.b)});return s}
function units(b){const s=[];words.forEach(w=>{if(w.b===b&&w.u&&!s.includes(w.u))s.push(w.u)});return s}
function validateScope(){
recentCache={};
const bs=books();
if(!["all","last1","last3","book"].includes(S.mode))S.mode="all";
if(!bs.length&&S.mode!=="all")S.mode="all";
if(!bs.includes(S.book)){S.book=bs[0]||"all";S.unit="all"}
if(S.unit!=="all"&&!RECENT[S.unit]&&!units(S.book).includes(S.unit))S.unit="all";
}
function scopeInfo(){
const bs=books();
if(!bs.length)return "";
if(RECENT[S.mode]){
const n=RECENT[S.mode];
return bs.map(b=>{const us=units(b).slice(-n);return `${b}: ${us.length?(us.length>1?us[0]+" \u2013 "+us[us.length-1]:us[0]):"all"}`}).join(" \u00b7 ");
}
if(S.mode==="book"&&RECENT[S.unit]){const us=units(S.book).slice(-RECENT[S.unit]);return us.length?`${S.book}: ${us.join(", ")}`:""}
return "";
}
/* ---------- speech ---------- */
const hasSynth=("speechSynthesis" in window);
let voices=[];
function loadVoices(){try{voices=speechSynthesis.getVoices()||[]}catch(e){voices=[]}fillVoiceSelects()}
if(hasSynth){loadVoices();try{speechSynthesis.addEventListener("voiceschanged",loadVoices)}catch(e){speechSynthesis.onvoiceschanged=loadVoices}}
const vlang=v=>(v.lang||"").toLowerCase().replace("_","-");
function pickVoice(name,prefix){
if(name){const v=voices.find(v=>v.name===name);if(v)return v}
if(prefix){const m=voices.filter(v=>vlang(v).startsWith(prefix));return m.find(v=>v.default)||m.find(v=>/en-(us|gb)/i.test(v.lang))||m[0]||null}
return null;
}
function speakDevice(text,voice,lang){
return new Promise(res=>{
if(!hasSynth){setTimeout(res,700+text.length*55/S.rate);return}
let done=false,t;const fin=()=>{if(!done){done=true;clearTimeout(t);res()}};
try{
const u=new SpeechSynthesisUtterance(text);
if(voice){u.voice=voice;u.lang=voice.lang}else if(lang)u.lang=lang;
u.rate=S.rate;u.onend=fin;u.onerror=fin;
t=setTimeout(fin,3000+text.length*130/S.rate);
speechSynthesis.speak(u);
}catch(e){fin()}
});
}
function meaningVoice(text){
if(S.meaningVoice!=="auto"){const v=pickVoice(S.meaningVoice);if(v)return [v]}
if(/[\u0400-\u04ff]/.test(text)){const v=pickVoice("","ru");return [v,"ru-RU"]}
const uz=pickVoice("","uz");if(uz)return [uz];
const tr=pickVoice("","tr");if(tr)return [tr];
return [pickVoice(S.wordVoice,"en")];
}
async function say(text,kind){
if(!text)return;
if(S.engine==="claude"&&claudeTTS){
try{await claudeTTS.speak(text,{voice:S.claudeVoice,rate:Math.min(1.5,Math.max(0.7,S.rate))});return}
catch(e){
const c=e&&e.code;
if(c==="not_granted"){claudeTTS=null;S.engine="device";saveS();syncSettingsUI()}
if(!playing&&kind!=="tap")return;
if(c!=="rate_limited"&&c!=="not_granted"&&c!=="busy")return;
}
}
if(S.bgVoice==="natural"&&apiOK!==false&&!window.claude){
const ok=await playUrl(ttsURL(text.slice(0,200),ttsLang(text,kind)));
if(ok){apiOK=true;return}
if(apiOK===null)apiOK=false;
if(!playing&&kind!=="tap")return;
}
let voice=null,lang;
if(kind==="meaning")[voice,lang]=meaningVoice(text);
else if(kind==="example"&&/[\u0400-\u04ff]/.test(text)){voice=pickVoice("","ru");lang="ru-RU"}
else voice=pickVoice(S.wordVoice,"en");
await speakDevice(text,voice,lang);
}
let la=null,apiOK=null;
function playUrl(url){return new Promise(res=>{try{if(!la){la=new Audio();la.setAttribute("playsinline","");la.preload="auto"}let done=false,t;const fin=ok=>{if(done)return;done=true;clearTimeout(t);la.onended=la.onerror=null;la._fin=null;res(ok)};la._fin=fin;la.onended=()=>fin(true);la.onerror=()=>fin(false);la.src=url;try{la.playbackRate=S.rate}catch(e){}t=setTimeout(()=>fin(true),25000);const p=la.play();if(p&&p.catch)p.catch(()=>fin(false))}catch(e){res(false)}})}
function cancelSpeech(){try{if(la){la.pause();la._fin&&la._fin(false)}}catch(e){}try{hasSynth&&speechSynthesis.cancel()}catch(e){}try{claudeTTS&&claudeTTS.stop()}catch(e){}}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const alive=id=>playing&&id===runId;
const answerKind=()=>S.dir==="en"?"meaning":"word";
function stepsFor(it){
const word=[],meaning=[];
if(S.sayWord)word.push(["word",it.w]);
if(S.spell)word.push(["spell",it.w.replace(/\s+/g," ").split("").map(c=>c===" "?"space":c).join(", ")]);
if(S.sayMeaning&&it.m)meaning.push(["meaning",it.m]);
const ex=(S.sayExample&&it.e)?[["example",it.e]]:[];
let st=S.dir==="en"?[...word,...meaning,...ex]:[...meaning,...word,...ex];
if(S.wordAgain&&st.length>1){const first=S.dir==="en"?(S.sayWord?["word",it.w]:null):(meaning[0]||null);if(first)st.push(first)}
return st;
}
function setPart(k){card.dataset.part=k||""}
async function run(){
const id=++runId;playing=true;updatePlayBtn();requestWake();
while(alive(id)){
const it=current();
if(!it){pause();return}
renderCard();
const steps=stepsFor(it),ans=answerKind();
for(let r=0;r<S.repeat;r++){
for(const [kind,text] of steps){
if(!alive(id))return;
const isAns=(ans==="word"?(kind==="word"||kind==="spell"):kind==="meaning");
if(isAns&&S.quiz&&!revealed){await wait(2200);if(!alive(id))return;revealed=true;renderCard()}
setPart(kind);
await say(text,kind);
if(!alive(id))return;
await wait(kind==="word"?450:300);
}
if(r<S.repeat-1){await wait(700);if(!alive(id))return}
}
setPart("");
if(S.quiz&&!revealed){revealed=true;renderCard()}
await wait(S.gap*1000);
if(!alive(id))return;
if(sleepAt&&Date.now()>=sleepAt){setSleep(0);pause();toast("Sleep timer: stopped");return}
if(!advance(1,true)){pause();return}
}
}
function play(){if(!words.length){openSheet("importOv");return}if(!queue.length){toast("No words in this selection");return}if(S.bg){nativeBg()?playNativeQ():playBg();return}run()}
function pause(){if(S.bg&&isTrackSrc())audio.pause();if(NQ.active&&!NQ.paused){try{speechSynthesis.pause()}catch(e){}NQ.paused=true;keepAlive(false)}playing=false;runId++;if(!NQ.active)cancelSpeech();setPart("");updatePlayBtn();releaseWake();setMSState("paused")}
function toggle(){playing?pause():play()}
function jump(dir){
if(S.bg&&NQ.active){const was=playing||!NQ.paused;advance(dir,false);if(was)startNativeQ();else{invalidateBg()}return}
if(S.bg){
if(T.tracks.length){bgJump(dir);return}
if(T.building){invalidateBg();advance(dir,false);unlockAudio();playing=true;buildBg();return}
}
const was=playing;
if(was){runId++;cancelSpeech();setPart("")}
advance(dir,false);
if(was)run();
}
function playFrom(idx){
let p=queue.indexOf(idx);
if(p<0){buildQueue(idx);p=queue.indexOf(idx);if(p<0)return}
if(playing){runId++;cancelSpeech()}
if(S.bg&&nativeBg()){invalidateBg();pos=p;afterMove();keepAlive(true);startNativeQ();return}
if(S.bg){invalidateBg();pos=p;afterMove();unlockAudio();playing=true;buildBg();return}
pos=p;afterMove();run();
}
function updatePlayBtn(){
$("#playBtn").innerHTML=playing?ICON_PAUSE:ICON_PLAY;
$("#playBtn").setAttribute("aria-label",playing?"Pause":"Play");
document.body.classList.toggle("playing",playing);
}
/* ---------- screen-off mode: real audio track (keeps playing when locked) ---------- */
const JSD="https://cdn.jsdelivr.net/npm/mespeak@2.0.2/";
const SR=24000,BG_MAX=150;
let audio=null;
function A(){
if(audio)return audio;
audio=document.createElement("audio");
audio.preload="auto";audio.setAttribute("playsinline","");audio.setAttribute("webkit-playsinline","");audio.style.display="none";
document.body.appendChild(audio);
audio.addEventListener("timeupdate",onBgTime);
audio.addEventListener("ended",onTrackEnded);
audio.addEventListener("play",()=>{if(S.bg&&isTrackSrc()){playing=true;updatePlayBtn();setMSState("playing");const it=current();if(it)updateMeta(it)}});
audio.addEventListener("pause",()=>{if(S.bg&&isTrackSrc()&&!audio.ended){playing=false;setPart("");updatePlayBtn();setMSState("paused")}});
initMediaSession();
return audio;
}
const T={tracks:[],ti:0,done:false,waiting:false,building:false,valid:false,buildId:0,lastMarker:-1,unlocked:false};
const clipCache=new Map();
function wavBlob(segs,len){
const buf=new ArrayBuffer(44+len*2),v=new DataView(buf);
const ws=(o,t)=>{for(let i=0;i<t.length;i++)v.setUint8(o+i,t.charCodeAt(i))};
ws(0,"RIFF");v.setUint32(4,36+len*2,true);ws(8,"WAVE");ws(12,"fmt ");v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
v.setUint32(24,SR,true);v.setUint32(28,SR*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);ws(36,"data");v.setUint32(40,len*2,true);
let o=44;for(const c of segs){new Int16Array(buf,o,c.length).set(c);o+=c.length*2}
return new Blob([buf],{type:"audio/wav"});
}
let SILENT_URL=null;
function isTrackSrc(){const tr=T.tracks[T.ti];return !!(tr&&audio&&audio.src===tr.url)}
function unlockAudio(){
if(T.unlocked)return;T.unlocked=true;
try{A();if(!SILENT_URL)SILENT_URL=URL.createObjectURL(wavBlob([new Int16Array(SR/5)],SR/5));audio.src=SILENT_URL;const p=audio.play();if(p&&p.then)p.then(()=>{if(audio.src===SILENT_URL)audio.pause()}).catch(()=>{T.unlocked=false})}catch(e){T.unlocked=false}
}
function setBgStatus(msg,kind){const el=$("#bgStatus");el.textContent=msg||"";el.className="status"+(kind?" "+kind:"")}
function setMSState(st){try{if("mediaSession" in navigator)navigator.mediaSession.playbackState=st}catch(e){}}
function updateMeta(it){
if(!it||!("mediaSession" in navigator)||typeof MediaMetadata==="undefined")return;
try{navigator.mediaSession.metadata=new MediaMetadata({title:it.w,artist:it.m,album:"Vocab Player"+(it.b?" \u00b7 "+it.b:"")+(it.u?" \u00b7 "+it.u:"")})}catch(e){}
}
let msInit=false;
function initMediaSession(){
if(msInit||!("mediaSession" in navigator))return;msInit=true;
const h=(a,f)=>{try{navigator.mediaSession.setActionHandler(a,f)}catch(e){}};
h("play",()=>{if(S.bg&&T.tracks.length){playing=true;if(!isTrackSrc())startTrack(T.ti,0,true);else audio.play().catch(()=>{});updatePlayBtn()}else play()});
h("pause",()=>pause());
h("nexttrack",()=>jump(1));
h("previoustrack",()=>jump(-1));
}
/* engine: eSpeak (meSpeak) from jsDelivr, voices as modules */
let engP=null,dataP=null;
function loadScript(src){return new Promise((res,rej)=>{const s=document.createElement("script");s.src=src;s.onload=res;s.onerror=()=>rej({code:"engine"});document.head.appendChild(s)})}
function loadVoiceData(){
if(!dataP)dataP=Promise.all(["src/mespeak_config.json","voices/en/en-us.json","voices/tr.json"].map(p=>import(JSD+p+"/+esm").then(m=>m&&m.default?m.default:m)));
dataP.catch(()=>{dataP=null});
return dataP;
}
async function loadEngineClassic(){
const keys=["module","exports","require"],had=keys.map(k=>window[k]);
try{
window.module={exports:{}};window.exports=window.module.exports;
await loadScript(JSD+"src/ESpeak.js");
const ESpeakFn=window.module.exports;
if(typeof ESpeakFn!=="function")throw {code:"engine"};
window.module={exports:{}};window.exports=window.module.exports;
window.require=p=>{if(/ESpeak/.test(p))return ESpeakFn;throw new Error("module "+p)};
await loadScript(JSD+"src/index.js");
return window.module.exports;
}finally{
keys.forEach((k,i)=>{if(had[i]===undefined){try{delete window[k]}catch(e){window[k]=undefined}}else window[k]=had[i]});
}
}
function initEngine(ms,data){
if(!ms||typeof ms.speak!=="function")return null;
try{
ms.loadConfig(data[0]);ms.loadVoice(data[1]);ms.loadVoice(data[2]);ms.setDefaultVoice("en/en-us");
const t=ms.speak("test",{rawdata:"array",voice:"en/en-us"});
return (t&&t.length>100)?ms:null;
}catch(e){return null}
}
function loadEngine(){
if(engP)return engP;
engP=(async()=>{
const data=await loadVoiceData();
let ms=null;
try{const m=await import(JSD+"+esm");ms=initEngine(m&&m.default?m.default:m,data)}catch(e){ms=null}
if(!ms){try{ms=initEngine(await loadEngineClassic(),data)}catch(e){ms=null}}
if(!ms)throw {code:"engine"};
return ms;
})();
engP.catch(()=>{engP=null});
return engP;
}
function parseWav(a){
const u=a instanceof Uint8Array?a:Uint8Array.from(a);
if(u.length<44)return new Int16Array(0);
const dv=new DataView(u.buffer,u.byteOffset,u.byteLength);
let rate=22050,bits=16,ch=1,off=12,data=null;
while(off+8<=u.length){
const id=String.fromCharCode(u[off],u[off+1],u[off+2],u[off+3]);let size=dv.getUint32(off+4,true);const body=off+8;
if(id==="fmt "){ch=dv.getUint16(body+2,true)||1;rate=dv.getUint32(body+4,true)||22050;bits=dv.getUint16(body+14,true)||16}
else if(id==="data"){if(!size||size>u.length-body)size=u.length-body;data=[body,size];break}
off=body+size+(size&1);
}
if(!data)return new Int16Array(0);
const bps=bits/8,n=Math.floor(data[1]/bps/ch),src=new Float32Array(n);
for(let i=0;i<n;i++){const p=data[0]+i*ch*bps;src[i]=bits===16?dv.getInt16(p,true):(u[p]-128)*256}
const ratio=rate/SR,m=Math.floor(n/ratio),out=new Int16Array(m);
for(let i=0;i<m;i++){const x=i*ratio,j=Math.floor(x),f=x-j,a0=src[j]||0,a1=(j+1<n)?src[j+1]:a0;out[i]=Math.max(-32768,Math.min(32767,a0+(a1-a0)*f))}
return out;
}
function clipFor(ms,text,kind){
const voice=(kind==="meaning"&&!/[\u0400-\u04ff]/.test(text))?"tr":"en/en-us";
const speed=Math.max(80,Math.round(160*S.rate));
const k=voice+"|"+speed+"|"+(S.bgVoice||"")+"|"+text;
let c=clipCache.get(k);if(c)return c;
let arr=null;
try{arr=ms.speak(text,{rawdata:"array",voice,speed,variant:S.bgVoice||undefined})}catch(e){arr=null}
c=(arr&&arr.length)?parseWav(arr):new Int16Array(0);
if(clipCache.size>4000)clipCache.clear();
clipCache.set(k,c);return c;
}
function ttsURL(t,lang){return "/api/speak?lang="+lang+"&g="+(S.ttsG==="m"?"m":"f")+"&v=4&text="+encodeURIComponent(t)}
function ttsLang(text,kind){if(/[\u0400-\u04ff]/.test(text))return "ru";return kind==="meaning"?"uz":"en"}
function splitText(t,max){const out=[];let cur="";t.split(/\s+/).forEach(w=>{if(!w)return;if((cur+" "+w).trim().length>max){if(cur)out.push(cur);cur=w.slice(0,max)}else cur=(cur+" "+w).trim()});if(cur)out.push(cur);return out.length?out:[t.slice(0,max)]}
function decodeMp3(buf){
const OAC=window.OfflineAudioContext||window.webkitOfflineAudioContext;
return new Promise((res,rej)=>{
let ctx;try{ctx=new OAC(1,SR,SR)}catch(e){rej(e);return}
let done=false;
const ok=b=>{if(done)return;done=true;const f=b.getChannelData(0),o=new Int16Array(f.length);for(let i=0;i<f.length;i++){const v=f[i]<-1?-1:f[i]>1?1:f[i];o[i]=v*32767}res(o)};
const bad=e=>{if(done)return;done=true;rej(e||{code:"decode"})};
try{const pr=ctx.decodeAudioData(buf,ok,bad);if(pr&&pr.then)pr.then(ok,bad)}catch(e){bad(e)}
});
}
function concatI16(arrs){let n=0;arrs.forEach(a=>n+=a.length);const o=new Int16Array(n);let k=0;arrs.forEach(a=>{o.set(a,k);k+=a.length});return o}
function netClip(text,kind){
const lang=ttsLang(text,kind),k="net|"+lang+"|"+S.ttsG+"|"+text;
if(clipCache.has(k))return clipCache.get(k);
const p=(async()=>{
const outs=[];
for(const t of splitText(text,180)){
let r;
try{r=await fetch(ttsURL(t,lang))}catch(e){throw {code:"net"}}
if(!r.headers.get("x-vocab"))throw {code:"no_api"};
if(!r.ok)throw {code:"tts"};
outs.push(await decodeMp3(await r.arrayBuffer()));
}
return concatI16(outs);
})();
clipCache.set(k,p);p.catch(()=>clipCache.delete(k));
return p;
}
async function pool(items,n,fn){let i=0;const run=async()=>{while(i<items.length){const it=items[i++];await fn(it)}};await Promise.all(Array.from({length:Math.min(n,items.length)},run))}
async function getClip(ms,text,kind){
if(T.net){try{return await netClip(text,kind)}catch(e){return new Int16Array(0)}}
return clipFor(ms,text,kind);
}
async function renderTrack(ms,part,id){
const segs=[],marks=[],items=[];let len=0;
const sil=sec=>{const n=Math.round(sec*SR);if(n>0){segs.push(new Int16Array(n));len+=n}};
const ans=answerKind();
if(T.net){
const jobs=[];part.forEach(qi=>{const it=words[qi];if(it)stepsFor(it).forEach(s=>jobs.push(s))});
await pool(jobs,6,s=>netClip(s[1],s[0]).catch(()=>null));
if(id!==T.buildId)return null;
}
for(const qi of part){
const it=words[qi];if(!it)continue;
items.push({t:len/SR,qi});
marks.push({t:len/SR,qi,part:"",reveal:!S.quiz});
let shown=!S.quiz;
const steps=stepsFor(it);
for(let r=0;r<S.repeat;r++){
for(const [kind,text] of steps){
const isAns=(ans==="word"?(kind==="word"||kind==="spell"):kind==="meaning");
if(isAns&&!shown){sil(2.2);shown=true}
marks.push({t:len/SR,qi,part:kind,reveal:shown});
const c=await getClip(ms,text,kind);if(c.length){segs.push(c);len+=c.length}
await wait(0);if(id!==T.buildId)return null;
sil(kind==="word"?0.45:0.3);
}
if(r<S.repeat-1)sil(0.7);
}
marks.push({t:len/SR,qi,part:"",reveal:true});
sil(Math.max(0.3,S.gap));
}
if(!len)return null;
return {url:URL.createObjectURL(wavBlob(segs,len)),marks,items,dur:len/SR};
}
const fmtDur=sec=>{const m=Math.round(sec/60);return m<1?"under a minute":m+" min"};
async function buildBg(){
invalidateBg();
const id=T.buildId;
if(!queue.length)return;
let order=queue.slice(pos);if(S.loop)order=order.concat(queue.slice(0,pos));
const capped=order.length>BG_MAX;order=order.slice(0,BG_MAX);
T.valid=true;T.building=true;playing=true;updatePlayBtn();requestWake();
let ms=null;
T.net=false;
if(S.bgVoice==="natural"){
setBgStatus("Preparing the natural voice\u2026");
const it0=words[order[0]];
try{await netClip(it0.w,"word");T.net=true}catch(e){T.net=false}
if(id!==T.buildId)return;
}
if(!T.net){
if(S.bgVoice==="natural")toast("Natural voice unavailable here, using the offline voice");
setBgStatus("Loading the offline voice\u2026");
}
try{if(!T.net)ms=await loadEngine()}catch(e){
if(id!==T.buildId)return;
T.building=false;T.valid=false;playing=false;updatePlayBtn();
setBgStatus("Couldn\u2019t load the offline voice. Check your internet and try again, or turn off Screen-off.","err");return;
}
if(id!==T.buildId)return;
let i=0,first=true;
while(i<order.length){
const n=first?6:BG_MAX;first=false;
const part=order.slice(i,i+n);
const tr=await renderTrack(ms,part,id);
if(id!==T.buildId)return;
i+=part.length;
if(!tr)continue;
T.tracks.push(tr);
const dur=T.tracks.reduce((a,t)=>a+t.dur,0);
if(i<order.length)setBgStatus(`Preparing audio\u2026 ${i}/${order.length} words. Keep the screen on until it says Ready.`);
else setBgStatus(`Ready: ${order.length} words, ${fmtDur(dur)}. You can lock your phone now.${capped?" (Plays the next "+BG_MAX+" words.)":""}`,"ok");
if(T.tracks.length===1)startTrack(0,0,playing);
else if(T.waiting){T.waiting=false;startTrack(T.tracks.length-1,0,playing)}
}
T.done=true;T.building=false;
if(!T.tracks.length){T.valid=false;playing=false;updatePlayBtn();setBgStatus("Nothing to play.","err")}
}
function startTrack(i,at,auto){
const tr=T.tracks[i];if(!tr)return;
T.ti=i;T.lastMarker=-1;
A().src=tr.url;
const go=()=>{
if(at){try{audio.currentTime=at}catch(e){}}
if(auto){const p=audio.play();if(p&&p.catch)p.catch(()=>{playing=false;updatePlayBtn();setBgStatus("Tap play to start the audio.")})}
onBgTime();
};
if(at)audio.addEventListener("loadedmetadata",go,{once:true});else go();
}
function playBg(){
unlockAudio();
if(T.valid&&T.tracks.length){playing=true;updatePlayBtn();if(!isTrackSrc())startTrack(T.ti,0,true);else audio.play().catch(()=>{});return}
if(T.valid&&T.building){playing=true;updatePlayBtn();return}
buildBg();
}
function invalidateBg(){
const nq=stopNativeQ();
T.buildId++;
const had=nq||T.tracks.length||T.building;
if(isTrackSrc())audio.pause();
T.tracks.forEach(t=>{try{URL.revokeObjectURL(t.url)}catch(e){}});
T.tracks=[];T.ti=0;T.done=false;T.waiting=false;T.building=false;T.valid=false;T.lastMarker=-1;
if(S.bg&&had){playing=false;updatePlayBtn()}
setBgStatus("");
}
function bgSeek(i,t){
if(i===T.ti&&isTrackSrc()){try{audio.currentTime=t}catch(e){}T.lastMarker=-1;onBgTime()}
else startTrack(i,t,playing);
}
function bgJump(dir){
const tr=T.tracks[T.ti];if(!tr)return;
const t=isTrackSrc()?audio.currentTime:0,its=tr.items;
let k=0;while(k+1<its.length&&its[k+1].t<=t+0.01)k++;
if(dir>0){
if(k+1<its.length)bgSeek(T.ti,its[k+1].t);
else if(T.ti+1<T.tracks.length)startTrack(T.ti+1,0,playing);
else if(T.done&&S.loop)startTrack(0,0,playing);
}else{
if(t-its[k].t>1.5)bgSeek(T.ti,its[k].t);
else if(k>0)bgSeek(T.ti,its[k-1].t);
else if(T.ti>0){const pt=T.tracks[T.ti-1];startTrack(T.ti-1,pt.items[pt.items.length-1].t,playing)}
else bgSeek(T.ti,0);
}
}
function onBgTime(){
if(!isTrackSrc())return;
if(sleepAt&&Date.now()>=sleepAt){setSleep(0);pause();toast("Sleep timer: stopped");return}
const M=T.tracks[T.ti].marks,t=audio.currentTime||0;
let k=T.lastMarker<0?0:T.lastMarker;
if(k>=M.length||M[k].t>t)k=0;
while(k+1<M.length&&M[k+1].t<=t)k++;
if(k===T.lastMarker)return;
T.lastMarker=k;
const m=M[k],itemChanged=queue[pos]!==m.qi;
const p=queue.indexOf(m.qi);if(p>=0)pos=p;
revealed=m.reveal;setPart(m.part);
if(itemChanged){const it=words[m.qi];if(it){LS.set("last",key(it));updateMeta(it)}markListCurrent(true)}
renderCard();
}
function onTrackEnded(){
if(!isTrackSrc())return;
if(T.ti+1<T.tracks.length){startTrack(T.ti+1,0,true);return}
if(!T.done){T.waiting=true;setBgStatus("Preparing the next part\u2026");return}
if(S.loop&&T.tracks.length){startTrack(0,0,true);return}
playing=false;setPart("");updatePlayBtn();setMSState("paused");
}
/* ---------- screen-off with the iPhone's own voice: whole playlist queued natively + silent keep-alive track ---------- */
const NQ={id:0,active:false,paused:false};
const nativeBg=()=>S.bg&&S.bgVoice==="native"&&hasSynth;
let ka=null;
function K(){if(!ka){ka=document.createElement("audio");ka.loop=true;ka.preload="auto";ka.setAttribute("playsinline","");ka.style.display="none";document.body.appendChild(ka);initMediaSession()}return ka}
let kaURL=null;
function keepAlive(on){
try{
if(on){K();if(!kaURL)kaURL=URL.createObjectURL(wavBlob([new Int16Array(SR*2)],SR*2));if(ka.src!==kaURL)ka.src=kaURL;const p=ka.play();if(p&&p.catch)p.catch(()=>{})}
else if(ka)ka.pause();
}catch(e){}
}
function fillerText(sec){const n=Math.max(1,Math.round(sec*2.4));return Array(n).fill("one").join(" ")}
function nVoice(text,kind){
if(kind==="meaning")return meaningVoice(text);
if(kind==="example"&&/[\u0400-\u04ff]/.test(text))return [pickVoice("","ru"),"ru-RU"];
return [pickVoice(S.wordVoice,"en")];
}
function qUtter(text,kind,onstart,onend){
const u=new SpeechSynthesisUtterance(text);
const [v,lang]=nVoice(text,kind);
if(v){u.voice=v;u.lang=v.lang}else if(lang)u.lang=lang;
u.rate=S.rate;if(onstart)u.onstart=onstart;if(onend)u.onend=onend;
speechSynthesis.speak(u);return u;
}
function qSilence(sec,onstart,onend){
const u=new SpeechSynthesisUtterance(fillerText(sec));
const v=pickVoice(S.wordVoice,"en");if(v){u.voice=v;u.lang=v.lang}
u.volume=0;u.rate=1;if(onstart)u.onstart=onstart;if(onend)u.onend=onend;
speechSynthesis.speak(u);return u;
}
function stopNativeQ(){
if(!NQ.active)return false;
NQ.id++;NQ.active=false;NQ.paused=false;
try{speechSynthesis.cancel()}catch(e){}
keepAlive(false);
return true;
}
function playNativeQ(){
keepAlive(true);
if(NQ.active&&NQ.paused){try{speechSynthesis.resume()}catch(e){}NQ.paused=false;playing=true;updatePlayBtn();setMSState("playing");return}
startNativeQ();
}
function startNativeQ(){
stopNativeQ();
if(!queue.length)return;
const id=++NQ.id;NQ.active=true;NQ.paused=false;
try{speechSynthesis.cancel()}catch(e){}
let order=queue.slice(pos);if(S.loop)order=order.concat(queue.slice(0,pos));
const capped=order.length>BG_MAX;order=order.slice(0,BG_MAX);
playing=true;updatePlayBtn();keepAlive(true);setMSState("playing");
setBgStatus(`Playing ${order.length} words with your iPhone voice. You can lock the phone.${capped?" (Next "+BG_MAX+" words.)":""}`,"ok");
const ans=answerKind();
order.forEach((qi,n)=>{
const it=words[qi];if(!it)return;
const mark=(part,rev)=>()=>{
if(id!==NQ.id)return;
const p=queue.indexOf(qi);const changed=queue[pos]!==qi;if(p>=0)pos=p;
revealed=rev;setPart(part);
if(changed){LS.set("last",key(it));markListCurrent(true);updateMeta(it)}
renderCard();
if(sleepAt&&Date.now()>=sleepAt){setSleep(0);invalidateBg();playing=false;updatePlayBtn();toast("Sleep timer: stopped")}
};
let shown=!S.quiz;
const steps=stepsFor(it);
let firstDone=false;
for(let r=0;r<S.repeat;r++){
for(const [kind,text] of steps){
const isAns=(ans==="word"?(kind==="word"||kind==="spell"):kind==="meaning");
if(isAns&&!shown){qSilence(2.2,firstDone?null:mark("",false));firstDone=true;shown=true}
qUtter(text,kind,mark(kind,shown));firstDone=true;
}
if(r<S.repeat-1)qSilence(0.6);
}
const last=n===order.length-1;
if(S.gap>=0.3||last)qSilence(Math.max(0.3,S.gap),null,last?()=>{
if(id!==NQ.id)return;
NQ.active=false;
if(S.loop&&queue.length){pos=queue.indexOf(order[0]);if(pos<0)pos=0;startNativeQ()}
else{playing=false;setPart("");keepAlive(false);updatePlayBtn();setMSState("paused");setBgStatus("")}
}:null);
});
}
/* ---------- wake lock ---------- */
let wake=null;
async function requestWake(){if(!S.wakeLock||wake||!navigator.wakeLock)return;try{wake=await navigator.wakeLock.request("screen");wake.addEventListener("release",()=>{wake=null})}catch(e){wake=null}}
function releaseWake(){try{wake&&wake.release()}catch(e){}wake=null}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&playing)requestWake()});
/* ---------- rendering ---------- */
function renderCard(){
card.classList.toggle("is-empty",!words.length);
const it=current();
$("#wordEl").textContent=it?it.w:(words.length?"Nothing here":"");
$("#meaningEl").textContent=it?it.m:(words.length?"Pick another unit or filter below.":"");
$("#exampleEl").textContent=it?it.e:"";
$("#tagLbl").textContent=it?[it.b,it.u].filter(Boolean).join(" \u00b7 "):"";
const hide=!!(it&&S.quiz&&!revealed);
card.classList.toggle("hide-ans",hide&&S.dir==="en"&&!!(it.m||it.e));
card.classList.toggle("hide-word",hide&&S.dir!=="en");
$("#posLbl").textContent=queue.length?`${pos+1} / ${queue.length}`:"0 / 0";
$("#progFill").style.width=queue.length?((pos+1)/queue.length*100)+"%":"0";
$("#starBtn").classList.toggle("on",!!(it&&star.has(key(it))));
$("#knownBtn").classList.toggle("on",!!(it&&known.has(key(it))));
$("#countLbl").textContent=words.length?`${words.length} words \u00b7 ${known.size} known`:"No words yet";
}
function renderControls(){
$("#shuffleBtn").classList.toggle("on",S.shuffle);
$("#loopBtn").classList.toggle("on",S.loop);
$("#quizBtn").classList.toggle("on",S.quiz);
$("#dirBtn").textContent=S.dir==="en"?"EN \u2192 UZ":"UZ \u2192 EN";
$("#bgBtn").classList.toggle("on",!!S.bg);
document.querySelectorAll("#rateSeg button").forEach(b=>b.classList.toggle("on",Math.abs(+b.dataset.r-S.rate)<.001));
document.querySelectorAll("#tabs button").forEach(b=>b.classList.toggle("on",b.dataset.f===S.filter));
}
function renderScope(){
const bs=books(),bSel=$("#bookSel"),uSel=$("#unitSel");
$("#modeTabs").style.display=bs.length?"flex":"none";
document.querySelectorAll("#modeTabs button").forEach(b=>b.classList.toggle("on",b.dataset.m===S.mode));
bSel.innerHTML=bs.map(b=>`<option value="${esc(b)}">${esc(b)}</option>`).join("");
bSel.value=S.book;
const us=units(S.book);
uSel.innerHTML=`<option value="all">All units</option>`+(us.length?`<option value="last1">Latest unit</option><option value="last3">Last 3 units</option>`:"")+us.map(u=>`<option value="${esc(u)}">${esc(u)}</option>`).join("");
uSel.value=S.unit;uSel.disabled=!us.length;
$(".scope").style.display=(bs.length&&S.mode==="book")?"grid":"none";
$("#scopeInfo").textContent=scopeInfo();
}
function renderList(){
const q=$("#search").value.trim().toLowerCase();
const cur=queue[pos];
const counts={all:0,learning:0,star:0,known:0};
let html="",n=0,lastGroup=null;
words.forEach((it,i)=>{
if(!inScope(it))return;
const k=key(it),kn=known.has(k),st=star.has(k);
counts.all++;if(kn)counts.known++;else counts.learning++;if(st)counts.star++;
if(!inStatus(it,S.filter))return;
if(q&&!(it.w.toLowerCase().includes(q)||it.m.toLowerCase().includes(q)))return;
const g=it.b+"|"+it.u;
if(g!==lastGroup){lastGroup=g;const label=S.mode==="book"?[it.u]:[it.b,it.u];const t=label.filter(Boolean).join(" \u00b7 ");if(t)html+=`<li class="sec">${esc(t)}</li>`}
n++;
html+=`<li data-i="${i}"${i===cur?' class="cur"':""}><span class="num">${n}</span><div class="txt"><b>${esc(it.w)}</b><span>${esc(it.m)}</span></div><span class="marks">${st?'<span class="st">\u2605</span>':""}${kn?'<span class="ck">\u2713</span>':""}</span></li>`;
});
$("#list").innerHTML=n?html:`<li class="none">${words.length?"No matching words":"Your words will appear here"}</li>`;
document.querySelectorAll("#tabs button").forEach(b=>{b.querySelector("small").textContent=counts[b.dataset.f]});
}
function markListCurrent(scroll){
const cur=queue[pos];
document.querySelectorAll("#list li.cur").forEach(li=>li.classList.remove("cur"));
const li=document.querySelector(`#list li[data-i="${cur}"]`);
if(li){li.classList.add("cur");if(scroll&&window.innerWidth>=900)li.scrollIntoView({block:"nearest"})}
}
function renderAll(){renderScope();renderControls();renderCard();renderList()}
let toastT;
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove("show"),2600)}
/* ---------- marks ---------- */
function toggleMark(set){
const it=current();if(!it)return;const k=key(it);
set.has(k)?set.delete(k):set.add(k);
saveProgress();renderCard();renderList();
}
/* ---------- sleep ---------- */
const SLEEP_STEPS=[0,10,20,30,60];
function setSleep(m){sleepMins=m;sleepAt=m?Date.now()+m*60000:0;sleepLabel()}
function sleepLabel(){
if(!sleepAt){$("#sleepBtn").textContent="Sleep: off";$("#sleepBtn").classList.remove("on");return}
const left=Math.max(0,Math.ceil((sleepAt-Date.now())/60000));
$("#sleepBtn").textContent=`Sleep: ${left}m`;$("#sleepBtn").classList.add("on");
}
setInterval(sleepLabel,20000);
/* ---------- list replacement ---------- */
function applyNewList(list,msg){
const next=clean(list);
if(JSON.stringify(next)===JSON.stringify(words)){if(msg)toast("Already up to date \u00b7 "+words.length+" words");return false}
invalidateBg();const was=playing;if(was)pause();
const lastK=(current()&&key(current()))||LS.get("last","");
words=next;listAt=Date.now();
LS.set("words",words);LS.set("listAt",listAt);
validateScope();saveS();
buildQueue(words.findIndex(it=>key(it)===lastK&&inScope(it)));
revealed=!S.quiz;renderAll();markListCurrent(true);pushList();
if(msg)toast(msg);
if(was)play();
return true;
}
/* ---------- workbook parsing ---------- */
const RX_W=/^(word|words|term|vocab|vocabulary|english|eng|en|so['\u2018\u2019`]?z|\u0441\u043b\u043e\u0432\u043e)\s*$/i;
const RX_M=/^(meaning|meanings|definition|translation|uzbek|o['\u2018\u2019`]?zbek(cha)?|uz|uzb|russian|tarjima|ma['\u2018\u2019`]?no(si)?|\u043f\u0435\u0440\u0435\u0432\u043e\u0434|\u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0435)\s*$/i;
const RX_E=/^(example|examples|sentence|usage|misol|\u043f\u0440\u0438\u043c\u0435\u0440)\s*$/i;
const RX_UNIT=/^(unit|lesson|chapter|part|topic|day|week|module|dars|bo['\u2018\u2019`]?lim)\s*[\w.\-]{0,8}\s*$/i;
function prettyBook(name){
const n=String(name).replace(/^vocabulary[_\s-]*/i,"").replace(/[_-]+/g," ").trim()||String(name);
return n.replace(/\b\w/g,c=>c.toUpperCase());
}
function wordsFromRows(rows,book){
rows=rows.map(r=>(Array.isArray(r)?r:[]).map(str));
let wc=-1,mc=-1,ec=-1,start=0;
for(let i=0;i<Math.min(6,rows.length);i++){
const r=rows[i],fw=r.findIndex(c=>RX_W.test(c)),fm=r.findIndex(c=>RX_M.test(c));
if(fw>=0&&fm>=0&&fw!==fm){wc=fw;mc=fm;ec=r.findIndex(c=>RX_E.test(c));start=i+1;break}
}
if(wc<0){
const cnt=[];rows.forEach(r=>r.forEach((c,j)=>{if(c)cnt[j]=(cnt[j]||0)+1}));
const order=[];for(let j=0;j<cnt.length;j++)if(cnt[j])order.push([cnt[j],j]);
order.sort((a,b)=>b[0]-a[0]||a[1]-b[1]);
if(!order.length)return [];
const top=order.slice(0,2).map(x=>x[1]).sort((a,b)=>a-b);
wc=top[0];mc=top.length>1?top[1]:-1;
}
let unit="";const out=[];
for(let i=start;i<rows.length;i++){
const r=rows[i],w=r[wc]||"",m=mc>=0?(r[mc]||""):"",e=ec>=0?(r[ec]||""):"";
if(!w)continue;
if(!m&&RX_UNIT.test(w)){unit=w.replace(/\s+/g," ").replace(/^\w/,c=>c.toUpperCase());continue}
if(!m&&mc>=0)continue;
out.push({w,m,e,b:book,u:unit});
}
return out;
}
function wordsFromWorkbook(wb){
const X=window.XLSX;let out=[];
wb.SheetNames.forEach(name=>{
if(/random/i.test(name))return;
const rows=X.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:"",raw:false,blankrows:false});
out=out.concat(wordsFromRows(rows,prettyBook(name)));
});
if(!out.length&&wb.SheetNames.length){
const name=wb.SheetNames[0];
out=wordsFromRows(X.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:"",raw:false,blankrows:false}),prettyBook(name));
}
return out;
}
let xlsxP=null;
function loadXLSX(){
if(window.XLSX)return Promise.resolve(window.XLSX);
if(!xlsxP)xlsxP=new Promise((res,rej)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";s.onload=()=>res(window.XLSX);s.onerror=()=>{xlsxP=null;rej({code:"lib"})};document.head.appendChild(s)});
return xlsxP;
}
/* ---------- Google Sheet sync (Google Drive connector) ---------- */
function sheetId(link){const s=str(link);const m=s.match(/\/d\/([a-zA-Z0-9_-]{15,})/);if(m)return m[1];return /^[a-zA-Z0-9_-]{15,}$/.test(s)?s:""}
function findFileData(res){
const found=[];
const seen=new Set();
const walk=(v,d)=>{
if(v==null||d>7)return;
if(typeof v==="string"){
const t=v.trim();
if(t.length>40){
if((t[0]==="{"||t[0]==="[")&&!seen.has(t)){seen.add(t);try{walk(JSON.parse(t),d+1);return}catch(e){}}
found.push(t);
}
return;
}
if(typeof v!=="object")return;
if(Array.isArray(v)){v.forEach(x=>walk(x,d+1));return}
Object.keys(v).forEach(k=>walk(v[k],d+1));
};
walk(res&&res.payload,0);walk(res&&res.structuredContent,0);walk(res&&res.content,0);
const b64=found.map(s=>s.replace(/\s+/g,"")).find(s=>s.startsWith("UEsDB"));
if(b64)return {b64};
const csv=found.find(s=>s.includes("\n")&&(s.includes(",")||s.includes("\t")));
if(csv)return {csv};
const anyB64=found.map(s=>s.replace(/\s+/g,"")).filter(s=>/^[A-Za-z0-9+/=_-]+$/.test(s)&&s.length>200).sort((a,b)=>b.length-a.length)[0];
if(anyB64)return {b64:anyB64.replace(/-/g,"+").replace(/_/g,"/")};
return null;
}
function setSheetStatus(msg,kind){
["#sheetStatus","#emptyStatus"].forEach(sel=>{const el=$(sel);el.textContent=msg||"";el.className="status"+(kind?" "+kind:"")});
}
let syncing=false;
async function syncSheet(manual){
if(syncing)return;
const id=sheetId($("#sheetLink").value||S.sheetLink);
if(!id){setSheetStatus("That doesn\u2019t look like a Google Sheet link.","err");return}
syncing=true;$("#syncBtn").classList.add("spin");
if(manual)setSheetStatus("Loading your sheet\u2026");
let attempt=0;
while(true){
try{
let list;
if(mcp){
const res=await mcp.callTool(GD,"download_file_content",{fileId:id,exportMimeType:XLSX_MIME},{cache:false});
const data=findFileData(res);
if(!data)throw {code:"no_data"};
if(data.b64){const X=await loadXLSX();list=wordsFromWorkbook(X.read(data.b64,{type:"base64"}))}
else list=wordsFromRows(parseTable(data.csv),"");
}else{
const buf=await fetchSheetViaApi(id);
const X=await loadXLSX();list=wordsFromWorkbook(X.read(buf,{type:"array"}));
}
if(!list.length)throw {code:"empty"};
S.synced=true;S.lastSync=Date.now();saveS();
const changed=applyNewList(list,null);
const msg=changed?`Synced ${list.length} words from ${books().length||1} tab${books().length===1?"":"s"}`:`Up to date \u00b7 ${list.length} words`;
setSheetStatus(msg,"ok");if(manual||changed)toast(msg);
if(manual)setTimeout(closeSheets,700);
break;
}catch(e){
const c=e&&e.code;
if(e&&e.retryable&&attempt===0){attempt++;await wait((e.retryAfterMs||1200)+Math.random()*800);continue}
const msgs={
server_not_connected:"Google Drive isn\u2019t connected for this page. Add it in claude.ai Settings \u2192 Connectors, then try again.",
needs_reauth:"Google Drive needs to be reconnected: claude.ai Settings \u2192 Connectors.",
selection_required:"Choose which Google Drive account to use when claude.ai asks, then try again.",
approval_required:"Allow Google Drive for this page when claude.ai asks, then tap Sync again.",
not_in_manifest:"Google Drive access was turned off for this page. Allow it in the page\u2019s connector settings, then try again.",
blocked_by_policy:"Your organization blocks this Google Drive action.",
tool_error:"Google Drive couldn\u2019t open that file. Check the link and that your account can open it.",
server_unavailable:"Google Drive didn\u2019t respond. Try again in a moment.",
lib:"Couldn\u2019t load the spreadsheet reader. Check your connection and try again.",
no_data:"Google Drive answered, but no spreadsheet data came back.",
empty:"No words found. The sheet needs a word column and a meaning column.",
not_granted:"Connectors aren\u2019t available in this view. Open the page in the Claude app or on claude.ai.",
capability_disabled:"Connectors aren\u2019t available in this view. Open the page in the Claude app or on claude.ai.",
not_shared:"Google won\u2019t share the sheet. In Google Sheets: Share \u2192 General access \u2192 \u201cAnyone with the link\u201d (Viewer), then sync again.",
no_api:"Sheet sync isn\u2019t available on this copy of the page. Use \u201cImport a file\u201d instead.",
api:"Couldn\u2019t get the sheet from Google. Try again in a moment."
};
if(manual||!S.synced||words.length===0)setSheetStatus(msgs[c]||"Sync failed. Try again.","err");
if(manual)toast("Sync didn\u2019t finish");
break;
}
}
syncing=false;$("#syncBtn").classList.remove("spin");
}
async function fetchSheetViaApi(id){
let r;
try{r=await fetch("/api/sheet?id="+encodeURIComponent(id),{cache:"no-store"})}catch(e){throw {code:"api",retryable:true}}
if(!r.headers.get("x-vocab"))throw {code:"no_api"};
if(r.status===403)throw {code:"not_shared"};
if(!r.ok)throw {code:"api",retryable:r.status>=500};
return new Uint8Array(await r.arrayBuffer());
}
/* ---------- cloud store (phone \u21c4 computer) ---------- */
let db=null,progWriting=false,progDirty=false,progTimer=null,listChain=Promise.resolve();
function setSync(state){
const c=$("#syncChip");c.classList.toggle("ok",state==="synced");
c.textContent={synced:"Synced",connecting:"Syncing\u2026",slow:"Offline copy",local:"This device"}[state]||"This device";
c.title=state==="synced"?"Your list and progress sync between phone and computer":"Saved in this browser";
}
function pushList(){
if(!db)return;
const at=listAt,snapshot=words.slice(),chunks=[];
for(let i=0;i<snapshot.length;i+=700)chunks.push(snapshot.slice(i,i+700));
listChain=listChain.then(async()=>{
try{
for(let p=0;p<chunks.length;p++)await db.doc("lists/p"+p).set({words:chunks[p]});
const old=await db.doc("lists/meta").get();
const oldParts=old.exists?((old.data()||{}).parts||0):0;
await db.doc("lists/meta").set({parts:chunks.length,count:snapshot.length,at});
for(let p=chunks.length;p<oldParts;p++)await db.doc("lists/p"+p).delete();
setSync("synced");
}catch(e){setSync("local");if(e&&e.code==="quota_exceeded")toast("List too large to sync; saved on this device")}
});
}
function applyListSnap(snap){
const docs={};snap.docs.forEach(d=>{docs[d.id]=d.data()||{}});
const meta=docs.meta;
if(!meta){if(!snap.metadata.fromCache&&words.length)pushList();return}
const at=+meta.at||0;
if(at===listAt)return;
if(at<listAt){if(!snap.metadata.fromCache)pushList();return}
const all=[];
for(let p=0;p<(+meta.parts||0);p++){const d=docs["p"+p];if(!d)return;all.push(...(Array.isArray(d.words)?d.words:[]))}
const next=clean(all);
invalidateBg();const was=playing;if(was)pause();
const lastK=(current()&&key(current()))||LS.get("last","");
words=next;listAt=at;LS.set("words",words);LS.set("listAt",listAt);
validateScope();saveS();
buildQueue(words.findIndex(it=>key(it)===lastK&&inScope(it)));renderAll();
toast(`List updated \u00b7 ${words.length} words`);
if(was)play();
}
function saveProgress(){
progAt=Date.now();
LS.set("known",[...known]);LS.set("star",[...star]);LS.set("progAt",progAt);
if(!db)return;clearTimeout(progTimer);progTimer=setTimeout(flushProgress,1200);
}
async function flushProgress(){
if(!db)return;
if(progWriting){progDirty=true;return}
progWriting=true;
try{await db.doc("progress/main").set({known:[...known],star:[...star],at:progAt})}catch(e){}
progWriting=false;
if(progDirty){progDirty=false;flushProgress()}
}
function applyProgress(s){
if(s.metadata.hasPendingWrites)return;
if(!s.exists){if(!s.metadata.fromCache&&(known.size||star.size))flushProgress();return}
const d=s.data()||{},at=+d.at||0;
if(at===progAt)return;
if(at<progAt){if(!s.metadata.fromCache)flushProgress();return}
known=new Set((Array.isArray(d.known)?d.known:[]).map(String));
star=new Set((Array.isArray(d.star)?d.star:[]).map(String));
progAt=at;LS.set("known",[...known]);LS.set("star",[...star]);LS.set("progAt",progAt);
renderCard();renderList();
}
async function initCloud(){
const C=window.claude;
if(!C||typeof C.use!=="function"){
setSync("local");
if(!words.length||Date.now()-S.lastSync>30*60000)syncSheet(!words.length);
return;
}
C.use("tts").then(t=>{if(t){claudeTTS=t;syncSettingsUI()}}).catch(()=>{});
C.use("mcp").then(m=>{
mcp=m||null;
if(mcp&&S.synced&&Date.now()-S.lastSync>30*60000)syncSheet(false);
}).catch(()=>{});
try{db=await C.use("db")}catch(e){db=null}
if(!db){setSync("local");return}
setSync("connecting");
const timer=setTimeout(()=>setSync("slow"),10000);
try{
db.collection("lists").onSnapshot(snap=>{
if(!snap.metadata.fromCache){clearTimeout(timer);setSync("synced")}
applyListSnap(snap);
},()=>{clearTimeout(timer);setSync("local")});
db.doc("progress/main").onSnapshot(applyProgress,()=>{});
}catch(e){clearTimeout(timer);setSync("local")}
}
/* ---------- paste / file import ---------- */
let rawRows=[];
function parseTable(text){
text=String(text).replace(/^\ufeff/,"").replace(/\r\n?/g,"\n");
const lines=text.split("\n").filter(l=>l.trim());
if(!lines.length)return [];
const first=lines[0];
if(!text.includes("\t")&&!first.includes(",")&&!first.includes(";")){
const sep=/\s+[-\u2013\u2014:=]\s+/;
if(lines.filter(l=>sep.test(l)).length>=lines.length*0.6){
return lines.map(l=>{const m=l.match(sep);return m?[l.slice(0,m.index).trim(),l.slice(m.index+m[0].length).trim()]:[l.trim()]});
}
}
const delim=text.includes("\t")?"\t":((first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length?";":",");
const rows=[];let row=[],f="",q=false;
for(let i=0;i<text.length;i++){
const c=text[i];
if(q){if(c==='"'){if(text[i+1]==='"'){f+='"';i++}else q=false}else f+=c}
else if(c==='"'&&f==="")q=true;
else if(c===delim){row.push(f);f=""}
else if(c==="\n"){row.push(f);rows.push(row);row=[];f=""}
else f+=c;
}
if(f!==""||row.length){row.push(f);rows.push(row)}
return rows.map(r=>r.map(s=>s.trim())).filter(r=>r.some(Boolean));
}
function colName(i,hdr){let L="",n=i;do{L=String.fromCharCode(65+n%26)+L;n=Math.floor(n/26)-1}while(n>=0);return hdr&&rawRows[0]&&rawRows[0][i]?`${L}: ${rawRows[0][i]}`:`Column ${L}`}
function onParsed(){
if(!rawRows.length){$("#mapWrap").style.display="none";$("#loadBtn").disabled=true;$("#parseInfo").textContent="";return}
const ncol=Math.max(...rawRows.map(r=>r.length));
const h=rawRows[0];
const isHdr=h.some(c=>RX_W.test(c)||RX_M.test(c)||RX_E.test(c));
$("#hdrChk").checked=isHdr;
const cnt=[];rawRows.forEach(r=>r.forEach((c,j)=>{if(c)cnt[j]=(cnt[j]||0)+1}));
const filled=[];for(let j=0;j<ncol;j++)if(cnt[j])filled.push(j);
let w=filled[0]||0,m=filled.length>1?filled[1]:-1,e=filled.length>2?filled[2]:-1;
if(isHdr){
const fw=h.findIndex(c=>RX_W.test(c)),fm=h.findIndex(c=>RX_M.test(c)),fe=h.findIndex(c=>RX_E.test(c));
if(fw>=0)w=fw;if(fm>=0)m=fm;e=fe>=0?fe:-1;
}
if(m===w)m=filled.find(i=>i!==w)??-1;
if(e===w||e===m)e=-1;
fillColSelects(ncol,w,m,e);
$("#mapWrap").style.display="block";
updatePreview();
}
function fillColSelects(ncol,w,m,e){
const hdr=$("#hdrChk").checked;
const opts=none=>(none?'<option value="-1">\u2014 none \u2014</option>':"")+Array.from({length:ncol},(_,i)=>`<option value="${i}">${esc(colName(i,hdr))}</option>`).join("");
$("#colW").innerHTML=opts(false);$("#colM").innerHTML=opts(true);$("#colE").innerHTML=opts(true);
$("#colW").value=w;$("#colM").value=m;$("#colE").value=e;
}
function mapped(){
const w=+$("#colW").value,m=+$("#colM").value,e=+$("#colE").value;
const rows=$("#hdrChk").checked?rawRows.slice(1):rawRows;
let unit="";const out=[];
rows.forEach(r=>{
const W=(r[w]||"").trim(),M=m>=0?(r[m]||"").trim():"",E=e>=0?(r[e]||"").trim():"";
if(!W)return;
if(!M&&RX_UNIT.test(W)){unit=W;return}
out.push({w:W,m:M,e:E,b:unit?"Pasted":"",u:unit});
});
return out;
}
function updatePreview(){
const list=mapped();
$("#parseInfo").textContent=`${list.length} words found`;
$("#loadBtn").disabled=!list.length;
$("#loadBtn").textContent=list.length?`Load ${list.length} words`:"Load words";
$("#preview").innerHTML=`<table><tr><th>Word</th><th>Meaning</th><th>Example</th></tr>${list.slice(0,4).map(x=>`<tr><td>${esc(x.w)}</td><td>${esc(x.m)}</td><td>${esc(x.e)}</td></tr>`).join("")}</table>`;
}
let parseT;
$("#pasteBox").addEventListener("input",()=>{clearTimeout(parseT);parseT=setTimeout(()=>{rawRows=parseTable($("#pasteBox").value);onParsed()},200)});
$("#fileIn").addEventListener("change",e=>{
const f=e.target.files&&e.target.files[0];if(!f)return;e.target.value="";
const info=$("#fileInfo");info.textContent="Reading\u2026";
const r=new FileReader();
if(/\.(xlsx|xls)$/i.test(f.name)){
r.onload=async()=>{
try{const X=await loadXLSX();const list=wordsFromWorkbook(X.read(new Uint8Array(r.result),{type:"array"}));
if(!list.length){info.textContent="No words found in that file.";return}
applyNewList(list,`Loaded ${list.length} words`);info.textContent="";closeSheets();
}catch(err){info.textContent="Couldn\u2019t read that file."}
};
r.readAsArrayBuffer(f);
}else{
r.onload=()=>{info.textContent="";$("#pasteBox").value=String(r.result||"");rawRows=parseTable($("#pasteBox").value);onParsed()};
r.readAsText(f);
}
});
["colW","colM","colE"].forEach(id=>$("#"+id).addEventListener("change",updatePreview));
$("#hdrChk").addEventListener("change",()=>{
const ncol=Math.max(...rawRows.map(r=>r.length));
fillColSelects(ncol,+$("#colW").value,+$("#colM").value,+$("#colE").value);updatePreview();
});
$("#loadBtn").addEventListener("click",()=>{
const list=mapped();if(!list.length)return;
applyNewList(list,`Loaded ${list.length} words`);closeSheets();
});
$("#sheetLink").value=S.sheetLink;
$("#sheetLink").addEventListener("change",()=>{S.sheetLink=$("#sheetLink").value.trim();saveS()});
$("#sheetSyncBtn").onclick=()=>{S.sheetLink=$("#sheetLink").value.trim()||DEFAULT_SHEET;saveS();syncSheet(true)};
/* ---------- settings ---------- */
function fillVoiceSelects(){
const wv=$("#wordVoiceSel"),mv=$("#meaningVoiceSel");if(!wv)return;
const sorted=voices.slice().sort((a,b)=>{const ae=/^en/i.test(a.lang),be=/^en/i.test(b.lang);return ae!==be?(ae?-1:1):(a.lang+a.name).localeCompare(b.lang+b.name)});
const opt=v=>`<option value="${esc(v.name)}">${esc(v.name)} (${esc(v.lang)})</option>`;
wv.innerHTML='<option value="">Auto (English)</option>'+sorted.map(opt).join("");
const pref=voices.filter(v=>/^(uz|tr|ru)/i.test(v.lang)),rest=sorted.filter(v=>!pref.includes(v));
mv.innerHTML='<option value="auto">Auto</option>'+pref.map(opt).join("")+rest.map(opt).join("");
wv.value=S.wordVoice;if(wv.value!==S.wordVoice)wv.value="";
mv.value=S.meaningVoice;if(mv.value!==S.meaningVoice)mv.value="auto";
}
function syncSettingsUI(){
document.querySelectorAll("[data-s]").forEach(el=>{el.checked=!!S[el.dataset.s]});
document.querySelectorAll("input[data-r]").forEach(el=>{el.value=S[el.dataset.r]});
$("#repVal").textContent=S.repeat+"\u00d7";$("#gapVal").textContent=S.gap+" s";$("#rateVal").textContent=(+S.rate).toFixed(2)+"\u00d7";
$("#engineField").style.display=claudeTTS?"block":"none";
if(!claudeTTS&&S.engine==="claude")S.engine="device";
$("#bgVoiceSel").value=S.bgVoice||"";$("#ttsGSel").value=S.ttsG==="m"?"m":"f";
$("#engineSel").value=S.engine;$("#claudeVoiceSel").value=S.claudeVoice;
$("#claudeVoiceWrap").style.display=S.engine==="claude"?"block":"none";
$("#deviceVoiceField").style.display=S.engine==="claude"?"none":"block";
}
document.querySelectorAll("[data-s]").forEach(el=>el.addEventListener("change",()=>{if(el.dataset.s!=="wakeLock")invalidateBg();S[el.dataset.s]=el.checked;saveS();if(el.dataset.s==="wakeLock"){S.wakeLock&&playing?requestWake():releaseWake()}}));
document.querySelectorAll("input[data-r]").forEach(el=>el.addEventListener("input",()=>{invalidateBg();S[el.dataset.r]=+el.value;saveS();syncSettingsUI();renderControls();if(el.dataset.r==="rate")applyRateLive()}));
$("#engineSel").addEventListener("change",e=>{S.engine=e.target.value;saveS();syncSettingsUI()});
$("#bgVoiceSel").addEventListener("change",e=>{invalidateBg();S.bgVoice=e.target.value;saveS()});
$("#ttsGSel").addEventListener("change",e=>{invalidateBg();S.ttsG=e.target.value;saveS();if(!playing){const it=current();cancelSpeech();say(it&&it.m?it.m:"salom","meaning")}});
$("#bgBtn").onclick=()=>{pause();invalidateBg();S.bg=!S.bg;saveS();renderControls();toast(S.bg?"Screen-off on: keeps playing when you lock the phone":"Screen-off off: keep the screen on while playing")};
$("#claudeVoiceSel").addEventListener("change",e=>{S.claudeVoice=e.target.value;saveS()});
$("#wordVoiceSel").addEventListener("change",e=>{S.wordVoice=e.target.value;saveS();if(!playing){const it=current();cancelSpeech();say(it?it.w:"Hello","tap")}});
$("#meaningVoiceSel").addEventListener("change",e=>{S.meaningVoice=e.target.value;saveS();if(!playing){const it=current();cancelSpeech();say(it&&it.m?it.m:"salom","meaning")}});
function applyRateLive(){try{claudeTTS&&S.engine==="claude"&&claudeTTS.setRate(Math.min(1.5,Math.max(0.7,S.rate)))}catch(e){}}
let resetArm=0;
$("#resetBtn").addEventListener("click",()=>{
if(Date.now()-resetArm>3000){resetArm=Date.now();$("#resetBtn").textContent="Tap again to confirm";setTimeout(()=>{$("#resetBtn").textContent="Reset stars & known"},3000);return}
known.clear();star.clear();saveProgress();buildQueue();renderAll();$("#resetBtn").textContent="Reset stars & known";toast("Progress reset");
});
/* ---------- sheets ---------- */
function openSheet(id){if(id==="settingsOv"){fillVoiceSelects();syncSettingsUI()}$("#"+id).classList.add("open")}
function closeSheets(){document.querySelectorAll(".overlay.open").forEach(o=>o.classList.remove("open"))}
document.querySelectorAll(".overlay").forEach(o=>o.addEventListener("click",e=>{if(e.target===o||e.target.closest("[data-close]"))closeSheets()}));
$("#importBtn").onclick=()=>openSheet("importOv");
$("#emptyImport").onclick=e=>{e.stopPropagation();openSheet("importOv")};
$("#emptySync").onclick=e=>{e.stopPropagation();syncSheet(true)};
$("#syncBtn").onclick=()=>{if(!mcp){openSheet("importOv")}syncSheet(true)};
$("#settingsBtn").onclick=()=>openSheet("settingsOv");
/* ---------- controls ---------- */
$("#playBtn").onclick=toggle;
$("#prevBtn").onclick=()=>jump(-1);
$("#nextBtn").onclick=()=>jump(1);
$("#shuffleBtn").onclick=()=>{invalidateBg();S.shuffle=!S.shuffle;saveS();buildQueue();renderAll();toast(S.shuffle?"Shuffle on":"Shuffle off")};
$("#loopBtn").onclick=()=>{invalidateBg();S.loop=!S.loop;saveS();renderControls();toast(S.loop?"Repeat list on":"Stop at the end")};
$("#quizBtn").onclick=()=>{invalidateBg();S.quiz=!S.quiz;saveS();revealed=!S.quiz;renderControls();renderCard();toast(S.quiz?(S.dir==="en"?"Quiz: Uzbek hidden until read":"Quiz: English hidden until read"):"Quiz off")};
$("#dirBtn").onclick=()=>{invalidateBg();S.dir=S.dir==="en"?"uz":"en";saveS();revealed=!S.quiz;renderControls();renderCard();toast(S.dir==="en"?"English first":"Uzbek first: try to recall the English")};
$("#sleepBtn").onclick=()=>{const i=SLEEP_STEPS.indexOf(sleepMins);setSleep(SLEEP_STEPS[(i+1)%SLEEP_STEPS.length])};
$("#rateSeg").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;invalidateBg();S.rate=+b.dataset.r;saveS();renderControls();applyRateLive()});
$("#starBtn").onclick=e=>{e.stopPropagation();toggleMark(star)};
$("#knownBtn").onclick=e=>{e.stopPropagation();toggleMark(known)};
function rescope(){invalidateBg();if(playing)pause();buildQueue(-1);pos=0;revealed=!S.quiz;const it=current();if(it)LS.set("last",key(it));renderAll();if(window.innerWidth>=900)$("#list").scrollTop=0}
$("#bookSel").addEventListener("change",e=>{S.book=e.target.value;S.unit="all";saveS();rescope()});
$("#modeTabs").addEventListener("click",e=>{
const b=e.target.closest("button");if(!b||b.dataset.m===S.mode)return;
S.mode=b.dataset.m;
if(S.mode==="book"&&!books().includes(S.book)){S.book=books()[0]||"all";S.unit="all"}
saveS();rescope();
const n=queue.length,names={all:"All words",last1:"Latest unit of every book",last3:"Last 3 units of every book",book:S.book};
toast(`${names[S.mode]} \u00b7 ${n} words`);
});
$("#unitSel").addEventListener("change",e=>{S.unit=e.target.value;saveS();rescope()});
$("#tabs").addEventListener("click",e=>{
const b=e.target.closest("button");if(!b)return;
invalidateBg();S.filter=b.dataset.f;saveS();
if(playing)pause();
buildQueue();revealed=!S.quiz;renderAll();markListCurrent(true);
});
$("#search").addEventListener("input",()=>renderList());
$("#list").addEventListener("click",e=>{const li=e.target.closest("li[data-i]");if(li)playFrom(+li.dataset.i)});
let tx=0,ty=0,swiped=false;
card.addEventListener("touchstart",e=>{tx=e.touches[0].clientX;ty=e.touches[0].clientY},{passive:true});
card.addEventListener("touchend",e=>{
const dx=e.changedTouches[0].clientX-tx,dy=e.changedTouches[0].clientY-ty;
if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5){swiped=true;jump(dx<0?1:-1);setTimeout(()=>{swiped=false},350)}
},{passive:true});
card.addEventListener("click",()=>{
if(swiped||!words.length)return;
if(card.classList.contains("hide-ans")||card.classList.contains("hide-word")){revealed=true;renderCard();return}
if(!playing){const it=current();if(!it)return;cancelSpeech();say(it.w,"tap")}
});
document.addEventListener("keydown",e=>{
if(e.target.closest("input,textarea,select"))return;
if(document.querySelector(".overlay.open")){if(e.key==="Escape")closeSheets();return}
const k=e.key.toLowerCase();
if(e.code==="Space"){e.preventDefault();toggle()}
else if(e.key==="ArrowRight")jump(1);
else if(e.key==="ArrowLeft")jump(-1);
else if(k==="s")toggleMark(star);
else if(k==="k")toggleMark(known);
else if(k==="r"){revealed=true;renderCard()}
});
/* ---------- start ---------- */
function checkVoiceSupport(){
const n=$("#notice");
if(!hasSynth){n.innerHTML="Spoken audio isn\u2019t available in this view. For sound, open this page in <b>Chrome</b> or <b>Safari</b> (the player still works silently here).";n.style.display="block";return}
setTimeout(()=>{if(!voices.length){try{voices=speechSynthesis.getVoices()||[]}catch(e){}}if(!voices.length&&!claudeTTS){n.innerHTML="No speech voices found here. If you hear nothing, open this page in <b>Chrome</b> or <b>Safari</b>, and check your phone isn\u2019t on silent.";n.style.display="block"}},3500);
}
validateScope();
buildQueue(lastIdx());
updatePlayBtn();setSleep(0);renderAll();markListCurrent(true);
checkVoiceSupport();
initCloud();
})();
