// WebGL2 cinematic-ish volume renderer (4th pane).
// Color transfer fn (ivory bone), front-to-back compositing, gradient-modulated
// opacity, local AO + soft shadow ray. Orbit drag / wheel zoom / right-drag pan.
export async function initVolume(canvas, statusEl){
  const gl = canvas.getContext("webgl2");
  if(!gl){ statusEl.textContent="(no WebGL2)"; return null; }
  const r = await fetch("/api/volume3d?factor=2");
  const [z,y,x] = r.headers.get("X-Dims").split(",").map(Number);
  const raw = new Int16Array(await r.arrayBuffer());
  const HLO=-1000, HHI=3071, span=HHI-HLO;
  const u8 = new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++) u8[i]=Math.max(0,Math.min(255,(raw[i]-HLO)/span*255));
  const tex=gl.createTexture(); gl.bindTexture(gl.TEXTURE_3D,tex);
  for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_3D,p,gl.LINEAR);
  for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D,p,gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
  gl.texImage3D(gl.TEXTURE_3D,0,gl.R8,x,y,z,0,gl.RED,gl.UNSIGNED_BYTE,u8);
  const mx=Math.max(x,y,z), bx=x/mx,by=y/mx,bz=z/mx;
  const vs=`#version 300 es
  in vec2 p; out vec2 uv; void main(){uv=p; gl_Position=vec4(p,0,1);}`;
  const fs=`#version 300 es
  precision highp float; precision highp sampler3D;
  in vec2 uv; out vec4 o; uniform sampler3D vol; uniform vec3 box;
  uniform mat3 R; uniform float dist,panx,pany,aspect,thr,mode;
  float den(vec3 p){return texture(vol,(p/box)*0.5+0.5).r;}
  bool hit(vec3 ro,vec3 rd,out float t0,out float t1){vec3 i0=(-box-ro)/rd,i1=(box-ro)/rd,mn=min(i0,i1),mxx=max(i0,i1);
    t0=max(max(mn.x,mn.y),mn.z);t1=min(min(mxx.x,mxx.y),mxx.z);return t1>max(t0,0.0);}
  vec4 tf(float v){ // HU->ivory bone color+opacity, v normalized 0..1 of [-1000,3071]
    float a=smoothstep(thr,thr+0.06,v); vec3 c=mix(vec3(.55,.42,.32),vec3(.95,.86,.66),smoothstep(.30,.55,v));
    c=mix(c,vec3(1.,.98,.92),smoothstep(.55,.8,v)); return vec4(c,a);}
  float rnd(vec2 s){return fract(sin(dot(s,vec2(12.9,78.2)))*43758.5);}
  void main(){vec3 L=normalize(vec3(.4,.6,.8)); vec3 pan=vec3(panx,pany,0);
    vec3 rd=R*normalize(vec3(uv.x*aspect+pan.x/dist,uv.y+pan.y/dist,-2.2)), ro=R*(vec3(0,0,dist)+pan);
    float t0,t1; if(!hit(ro,rd,t0,t1)){o=vec4(0,0,0,1);return;}
    float t=t0+rnd(uv)*0.01,st=0.006,mip=0.; vec4 acc=vec4(0);
    for(int i=0;i<420;i++){if(t>t1||acc.a>0.97)break; vec3 p=ro+rd*t; float v=den(p);
      if(mode>0.5){mip=max(mip,v);t+=st;continue;}
      vec4 c=tf(v); if(c.a>0.01){vec3 e=vec3(.01,0,0);
        vec3 n=normalize(vec3(den(p-e.xyy)-den(p+e.xyy),den(p-e.yxy)-den(p+e.yxy),den(p-e.yyx)-den(p+e.yyx)));
        float g=clamp(length(n)*6.,0.,1.); c.a*=g;                 // gradient-modulated
        float sh=1.; vec3 sp=p; for(int j=0;j<10;j++){sp+=L*0.03; sh*=1.-tf(den(sp)).a*.5;}
        float df=max(dot(n,L),0.), lit=.3+.7*df*sh; c.rgb*=lit;
        c.rgb*=c.a; acc+=c*(1.-acc.a);} t+=st;}
    if(mode>0.5){float gg=clamp(mip*1.1,0.,1.);o=vec4(gg,gg,gg,1.);}else o=vec4(acc.rgb+(1.-acc.a)*.04,1.);}`;
  const sh=(t,s)=>{const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))console.log(gl.getShaderInfoLog(o));return o;};
  const pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,vs));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(pr);gl.useProgram(pr);
  const vao=gl.createVertexArray();gl.bindVertexArray(vao);const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  const lp=gl.getAttribLocation(pr,"p");gl.enableVertexAttribArray(lp);gl.vertexAttribPointer(lp,2,gl.FLOAT,false,0,0);
  const U=n=>gl.getUniformLocation(pr,n); gl.uniform3f(U("box"),bx,by,bz);
  let dist=2.4,px2=0,py2=0,thr=.35,mode=0;
  // free-orbit orientation as column-major mat3 (M); incremental screen-axis spins
  let M=[1,0,0, 0,1,0, 0,0,1];
  function mul(a,b){const c=[0,0,0,0,0,0,0,0,0];for(let i=0;i<3;i++)for(let j=0;j<3;j++)c[i*3+j]=a[j]*b[i*3]+a[3+j]*b[i*3+1]+a[6+j]*b[i*3+2];return c;}
  function spin(dx,dy){const cx=Math.cos(dy),sx=Math.sin(dy),cy=Math.cos(dx),sy=Math.sin(dx);
    M=mul(M,[cy,0,-sy,0,1,0,sy,0,cy]); M=mul(M,[1,0,0,0,cx,sx,0,-sx,cx]);}    // yaw then pitch, no clamp -> 360
  // patient axes -> world: front view = looking -Y, sup=+Z up. base orientations:
  const VIEWS={front:[1,0,0,0,0,1,0,-1,0],back:[-1,0,0,0,0,1,0,1,0],left:[0,1,0,0,0,1,1,0,0],
    right:[0,-1,0,0,0,1,-1,0,0],top:[1,0,0,0,1,0,0,0,1],bottom:[1,0,0,0,-1,0,0,0,-1]};
  function setView(v){if(VIEWS[v]){M=VIEWS[v].slice();px2=py2=0;dist=2.4;draw();}}

  // --- orientation gizmo: tiny 2D overlay, bottom-right, rotates with volume ---
  const giz=document.createElement("canvas");giz.width=giz.height=84;
  Object.assign(giz.style,{position:"absolute",right:"6px",bottom:"6px",width:"84px",height:"84px",pointerEvents:"none",zIndex:5});
  if(getComputedStyle(canvas.parentNode).position==="static") canvas.parentNode.style.position="relative";
  canvas.parentNode.appendChild(giz); const gc=giz.getContext("2d");
  function gizmo(){const C=42,S=30;gc.clearRect(0,0,84,84);
    const ax=[[1,0,0,"L","R","#e8554e"],[0,1,0,"P","A","#5ed25e"],[0,0,1,"S","I","#5a9bff"]];
    const pj=v=>[C+(M[0]*v[0]+M[3]*v[1]+M[6]*v[2])*S, C-(M[1]*v[0]+M[4]*v[1]+M[7]*v[2])*S, M[2]*v[0]+M[5]*v[1]+M[8]*v[2]];
    const seg=ax.map(a=>{const p=pj(a),m=pj([-a[0],-a[1],-a[2]]);return{a,p,m,z:p[2]};}).sort((u,w)=>u.z-w.z);
    gc.font="bold 10px sans-serif";gc.textAlign="center";gc.textBaseline="middle";gc.lineWidth=2;
    for(const s of seg){gc.strokeStyle=s.a[5];gc.beginPath();gc.moveTo(s.m[0],s.m[1]);gc.lineTo(s.p[0],s.p[1]);gc.stroke();
      gc.fillStyle=s.a[5];gc.fillText(s.a[3],s.p[0],s.p[1]);gc.fillStyle="#888";gc.fillText(s.a[4],s.m[0],s.m[1]);}
  }
  function draw(){const w=canvas.clientWidth||300,h=canvas.clientHeight||300;canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);
    gl.uniformMatrix3fv(U("R"),false,M);gl.uniform1f(U("dist"),dist);gl.uniform1f(U("panx"),px2);gl.uniform1f(U("pany"),py2);
    gl.uniform1f(U("aspect"),w/h);gl.uniform1f(U("thr"),thr);gl.uniform1f(U("mode"),mode);gl.drawArrays(gl.TRIANGLES,0,3);gizmo();}
  let dn=0,mx0,my0;
  canvas.oncontextmenu=e=>e.preventDefault();
  canvas.onmousedown=e=>{dn=e.buttons;mx0=e.clientX;my0=e.clientY;};
  window.addEventListener("mouseup",()=>dn=0);
  window.addEventListener("mousemove",e=>{if(!dn)return;const dx=e.clientX-mx0,dy=e.clientY-my0;mx0=e.clientX;my0=e.clientY;
    if(dn&1){spin(-dx*.008,-dy*.008);}                                       // left: free 360 orbit
    else{px2-=dx*.003*dist;py2+=dy*.003*dist;}draw();});                     // right/middle: pan
  canvas.onwheel=e=>{dist=Math.max(.6,Math.min(8,dist*Math.exp(e.deltaY*.001)));e.preventDefault();draw();};
  canvas.ondblclick=()=>setView("front");
  window.addEventListener("keydown",e=>{const m={f:"front",1:"front",2:"back",3:"left",4:"right",5:"top",6:"bottom"};if(m[e.key.toLowerCase()])setView(m[e.key.toLowerCase()]);});
  setView("front");
  statusEl.textContent="orbit·wheel·pan·dbl=front·1-6";
  return {setThr:v=>{thr=v;draw();},setMode:m=>{mode=m;draw();},draw,setView};
}
