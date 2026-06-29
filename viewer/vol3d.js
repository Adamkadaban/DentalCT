// WebGL2 ray-marched volume renderer (4th pane).
// Bone mode = gradient-shaded isosurface (lit, looks like real bone).
// MIP mode  = max-intensity X-ray. Aspect/box corrected so no stretch.
export async function initVolume(canvas, statusEl){
  const gl = canvas.getContext("webgl2");
  if(!gl){ statusEl.textContent="(no WebGL2)"; return null; }
  const r = await fetch("/api/volume3d?factor=3");
  const [z,y,x] = r.headers.get("X-Dims").split(",").map(Number);
  const raw = new Int16Array(await r.arrayBuffer());
  const u8 = new Uint8Array(raw.length), lo=-1000, hi=3000;
  for(let i=0;i<raw.length;i++) u8[i]=Math.max(0,Math.min(255,(raw[i]-lo)/(hi-lo)*255));
  const tex=gl.createTexture(); gl.bindTexture(gl.TEXTURE_3D,tex);
  for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_3D,p,gl.LINEAR);
  for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D,p,gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
  gl.texImage3D(gl.TEXTURE_3D,0,gl.R8,x,y,z,0,gl.RED,gl.UNSIGNED_BYTE,u8);
  // physical box: voxels isotropic -> box sides proportional to dims, normalized
  const mx=Math.max(x,y,z), bx=x/mx, by=y/mx, bz=z/mx;
  const vs=`#version 300 es
  in vec2 p; out vec2 uv; void main(){uv=p; gl_Position=vec4(p,0,1);}`;
  const fs=`#version 300 es
  precision highp float; precision highp sampler3D;
  in vec2 uv; out vec4 o; uniform sampler3D vol; uniform mat3 R;
  uniform float thr, mode, aspect; uniform vec3 box;
  bool hit(vec3 ro,vec3 rd,out float t0,out float t1){
    vec3 i0=(-box-ro)/rd,i1=(box-ro)/rd,mn=min(i0,i1),mx=max(i0,i1);
    t0=max(max(mn.x,mn.y),mn.z); t1=min(min(mx.x,mx.y),mx.z); return t1>max(t0,0.0);}
  float samp(vec3 p){ return texture(vol,(p/box)*0.5+0.5).r; }
  void main(){
    vec3 dir=normalize(vec3(uv.x*aspect,uv.y,-2.2));
    vec3 rd=R*dir, ro=R*vec3(0,0,2.2);
    float t0,t1; if(!hit(ro,rd,t0,t1)){o=vec4(0,0,0,1);return;}
    float t=max(t0,0.0), step=0.004, mip=0.0;
    for(int i=0;i<400;i++){ if(t>t1)break; vec3 p=ro+rd*t; float v=samp(p);
      if(mode>0.5){ mip=max(mip,v); }
      else if(v>thr){                                   // first surface -> shade
        vec3 e=vec3(0.01,0,0);
        vec3 n=normalize(vec3(samp(p-e.xyy)-samp(p+e.xyy),
                              samp(p-e.yxy)-samp(p+e.yxy),
                              samp(p-e.yyx)-samp(p+e.yyx)));
        vec3 L=normalize(vec3(0.4,0.6,0.8));
        float d=max(dot(n,L),0.0), amb=0.25;
        float g=amb+0.85*d; o=vec4(vec3(g)*vec3(1.0,0.97,0.9),1.0); return; }
      t+=step; }
    if(mode>0.5){float g=clamp(mip*1.1,0.0,1.0);o=vec4(g,g,g,1.0);} else o=vec4(0.04,0.05,0.06,1.0);}`;
  const sh=(t,s)=>{const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);return o;};
  const pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,vs));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(pr);gl.useProgram(pr);
  const vao=gl.createVertexArray();gl.bindVertexArray(vao);const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  const lp=gl.getAttribLocation(pr,"p");gl.enableVertexAttribArray(lp);gl.vertexAttribPointer(lp,2,gl.FLOAT,false,0,0);
  const U=n=>gl.getUniformLocation(pr,n);
  gl.uniform3f(U("box"),bx,by,bz);
  let yaw=0, pit=-1.4, thr=0.45, mode=0;     // start: looking at front, up=skull top
  function R(){const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pit),sp=Math.sin(pit);
    return [cy,0,sy, sy*sp,cp,-cy*sp, -sy*cp,sp,cy*cp];}
  function draw(){const w=canvas.clientWidth||300,h=canvas.clientHeight||300;canvas.width=w;canvas.height=h;
    gl.viewport(0,0,w,h);gl.uniformMatrix3fv(U("R"),false,R());gl.uniform1f(U("thr"),thr);
    gl.uniform1f(U("mode"),mode);gl.uniform1f(U("aspect"),w/h);gl.drawArrays(gl.TRIANGLES,0,3);}
  let dn=false,px,py;
  canvas.onmousedown=e=>{dn=true;px=e.clientX;py=e.clientY;};
  window.addEventListener("mouseup",()=>dn=false);
  window.addEventListener("mousemove",e=>{if(!dn)return;yaw-=(e.clientX-px)*0.01;pit-=(e.clientY-py)*0.01;px=e.clientX;py=e.clientY;draw();});
  statusEl.textContent="drag=rotate"; draw();
  return {setThr:v=>{thr=v;draw();},setMode:m=>{mode=m;draw();},draw};
}
