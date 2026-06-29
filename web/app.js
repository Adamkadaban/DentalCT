import {makeSampler} from "./sampler.js";
import {parseOverlays} from "./overlays.js";
import {initVolume} from "./vol3d.js";
const $=s=>document.querySelector(s);
const S={wc:1048,ww:4096,thk:1,idx:{},meta:null,smp:null,dims:null,ov:{arch:[],canals:[]}};

// ---- upload ------------------------------------------------------------
const drop=$("#drop"),file=$("#file");
$(".z").onclick=()=>file.click(); file.onchange=e=>load(e.target.files[0]);
;["dragover","drop"].forEach(ev=>drop.addEventListener(ev,e=>e.preventDefault()));
drop.addEventListener("drop",e=>{if(e.dataTransfer.files[0])load(e.dataTransfer.files[0]);});
function load(f){ $("#bar2").style.display="block"; $("#info").textContent="decoding "+f.name;
  const w=new Worker("./worker.js"); w.postMessage(f);
  w.onmessage=e=>{const d=e.data; if(d.error){$("#info").textContent=d.error;return;}
    if(d.progress){$("#bar2 i").style.width=(d.progress*100|0)+"%";return;}
    if(d.done) start(new Int16Array(d.vol), d.meta);};
}

function start(vol, meta){
  S.meta=meta; const[z,y,x]=meta.shape; S.dims={z,y,x}; S.smp=makeSampler(vol,z,y,x);
  S.wc=meta.window_center; S.ww=meta.window_width; $("#wc").value=S.wc; $("#ww").value=S.ww;
  S.idx={axial:z>>1,coronal:y>>1,sagittal:x>>1};
  if(meta.xml) S.ov=parseOverlays(meta.xml);
   drop.style.display="none"; document.body.classList.add("loaded"); $("#grid").style.display="grid";
  $("#info").textContent=`${meta.model} · ${x}×${y}×${z} · ${meta.spacing_mm.map(v=>v.toFixed(2)).join("×")}mm`;
  ["axial","coronal","sagittal"].forEach(p=>{const pane=document.querySelector(`.pane[data-plane="${p}"]`);
    pane._cv=pane.querySelector("canvas"); const sl=pane.querySelector(".sl"); sl.max=S.smp.nslices[p]-1; sl.value=S.idx[p];
    sl.oninput=()=>{S.idx[p]=+sl.value; draw(p);}; pane._sl=sl; link(pane._cv,p); drawWL(pane._cv);
    pane._cv.addEventListener("wheel",e=>{e.preventDefault();S.idx[p]=Math.max(0,Math.min(S.smp.nslices[p]-1,S.idx[p]+(e.deltaY>0?1:-1)));draw(p);},{passive:false});
    draw(p);});
  // downsample for 3D
  const f=2,dz=z+1>>1,dy=y+1>>1,dx=x+1>>1,d=new Int16Array(dz*dy*dx);
  for(let k=0;k<dz;k++)for(let j=0;j<dy;j++)for(let i=0;i<dx;i++)d[(k*dy+j)*dx+i]=vol[((k*2)*y+j*2)*x+i*2];
  initVolume(document.querySelector('.pane[data-plane="3d"] canvas'),$("#info"),{vol:d,z:dz,y:dy,x:dx})
    .then(r=>{S.r=r; $("#d3mode").onclick=e=>{const m=e.target.textContent==="Bone";e.target.textContent=m?"MIP":"Bone";r.setMode(m?1:0);};});
}
function paint(cv,img){cv.width=img.width;cv.height=img.height;cv.getContext("2d").putImageData(img,0,0);}
function draw(p){paint(document.querySelector(`.pane[data-plane="${p}"] canvas`),S.smp.slice(p,S.idx[p],S.wc,S.ww));
  const pane=document.querySelector(`.pane[data-plane="${p}"]`),sl=pane.querySelector(".sl"); if(sl)sl.value=S.idx[p];
  pane.querySelector(".lbl").textContent=`${S.idx[p]+1}/${S.smp.nslices[p]}`;}
function drawAll(){["axial","coronal","sagittal"].forEach(draw);
  if($("#pano").style.display!=="none")pano(); if($("#custom").style.display!=="none")cross(); if($("#oblique").style.display!=="none")ob();}

// ---- controls ----------------------------------------------------------
$("#wc").oninput=e=>{S.wc=+e.target.value;drawAll();}; $("#ww").oninput=e=>{S.ww=+e.target.value;drawAll();};
$("#thk").oninput=e=>{S.thk=+e.target.value;drawAll();};
document.querySelectorAll("button[data-wc]").forEach(b=>b.onclick=()=>{S.wc=+b.dataset.wc;S.ww=+b.dataset.ww;$("#wc").value=S.wc;$("#ww").value=S.ww;drawAll();});
function drawWL(cv){let on=0,x0,y0,wc0,ww0;cv.onmousedown=e=>{on=Date.now();x0=e.clientX;y0=e.clientY;wc0=S.wc;ww0=S.ww;};
  addEventListener("mousemove",e=>{if(!on)return;S.wc=wc0+(e.clientY-y0)*4;S.ww=Math.max(1,ww0+(e.clientX-x0)*8);drawAll();});addEventListener("mouseup",()=>on=0);}
function link(cv,p){let dn=0;cv.addEventListener("mousedown",()=>dn=Date.now());cv.addEventListener("click",e=>{if(Date.now()-dn>250)return;
  const r=cv.getBoundingClientRect(),fx=(e.clientX-r.left)/r.width,fy=(e.clientY-r.top)/r.height,m=S.smp.nslices;
  if(p==="axial"){S.idx.sagittal=fx*m.sagittal|0;S.idx.coronal=fy*m.coronal|0;}
  if(p==="coronal"){S.idx.sagittal=fx*m.sagittal|0;S.idx.axial=(1-fy)*m.axial|0;}
  if(p==="sagittal"){S.idx.coronal=fx*m.coronal|0;S.idx.axial=(1-fy)*m.axial|0;}["axial","coronal","sagittal"].forEach(draw);});}

// ---- tabs --------------------------------------------------------------
function pano(){paint($("#pc"),S.smp.panoramic(S.ov.arch,S.wc,S.ww,Math.max(6,S.thk*2)));}
function cross(){paint($("#cp"),S.smp.panoramic(S.ov.arch,S.wc,S.ww,8));paint($("#cc"),S.smp.cross(S.ov.arch,S.wc,S.ww,$("#cspos").value/100,70,600,S.ov.canals));}
function ob(){paint($("#oc"),S.smp.oblique(S.wc,S.ww,+$("#az").value,+$("#el").value,+$("#od").value));}
$("#cspos").oninput=cross;["#az","#el","#od"].forEach(s=>$(s).oninput=ob);
document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("on"));t.classList.add("on");
  const k=t.dataset.tab;$("#grid").style.display=k==="review"?"grid":"none";$("#pano").style.display=k==="curved"?"block":"none";
  $("#custom").style.display=k==="custom"?"flex":"none";$("#oblique").style.display=k==="oblique"?"flex":"none";
  if(k==="curved")pano();if(k==="custom")cross();if(k==="oblique")ob();});
