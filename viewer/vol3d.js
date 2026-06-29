// WebGL2 ray-marched volume renderer for the 4th pane.
// Loads downsampled int16 HU volume, uploads as a 3D R8 texture (windowed),
// ray-marches in the cube. Mouse drag rotates; slider sets bone threshold.
export async function initVolume(canvas, statusEl, getWL){
  const gl = canvas.getContext("webgl2");
  if(!gl){ statusEl.textContent="(no WebGL2)"; return null; }
  const r = await fetch("/api/volume3d?factor=3");
  const [z,y,x] = r.headers.get("X-Dims").split(",").map(Number);
  const raw = new Int16Array(await r.arrayBuffer());
  // window HU -> 8-bit once (bone-ish), keep raw range for shader threshold
  const u8 = new Uint8Array(raw.length);
  const lo=-1000, hi=3000;
  for(let i=0;i<raw.length;i++) u8[i]=Math.max(0,Math.min(255,(raw[i]-lo)/(hi-lo)*255));
  const tex=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_3D,tex);
  gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_R,gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
  gl.texImage3D(gl.TEXTURE_3D,0,gl.R8,x,y,z,0,gl.RED,gl.UNSIGNED_BYTE,u8);

  const vs=`#version 300 es
  in vec2 p; out vec2 uv; void main(){uv=p*0.5+0.5; gl_Position=vec4(p,0,1);}`;
  const fs=`#version 300 es
  precision highp float; precision highp sampler3D;
  in vec2 uv; out vec4 o; uniform sampler3D vol; uniform mat3 R;
  uniform float thr; uniform float mode; uniform vec3 dim;
  // ray-box intersect unit cube centered origin
  bool hit(vec3 ro,vec3 rd,out float t0,out float t1){
    vec3 i0=(-0.5-ro)/rd, i1=(0.5-ro)/rd, mn=min(i0,i1), mx=max(i0,i1);
    t0=max(max(mn.x,mn.y),mn.z); t1=min(min(mx.x,mx.y),mx.z); return t1>max(t0,0.0);}
  void main(){
    vec3 rd=normalize(R*vec3((uv*2.0-1.0),-2.0)); vec3 ro=R*vec3(0,0,1.6);
    float t0,t1; if(!hit(ro,rd,t0,t1)){o=vec4(0,0,0,1);return;}
    float t=max(t0,0.0); float acc=0.0,a=0.0; float mip=0.0;
    for(int i=0;i<256;i++){ if(t>t1)break; vec3 pp=ro+rd*t+0.5;
      float v=texture(vol,pp).r;
      if(mode>0.5){ mip=max(mip,v); }                       // MIP
      else if(v>thr){ float d=(v-thr)/(1.0-thr); float s=d*0.18*(1.0-a);
        acc+=s; a+=s; if(a>0.95)break; }                     // bone opacity
      t+=0.006; }
    float g = mode>0.5? mip : acc; g=clamp(g*1.05,0.0,1.0);
    o=vec4(g,g,g,1.0);}`;
  function sh(t,s){const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);return o;}
  const pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,vs));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(pr);gl.useProgram(pr);
  const vao=gl.createVertexArray();gl.bindVertexArray(vao);const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  const lp=gl.getAttribLocation(pr,"p");gl.enableVertexAttribArray(lp);gl.vertexAttribPointer(lp,2,gl.FLOAT,false,0,0);
  const uR=gl.getUniformLocation(pr,"R"),uThr=gl.getUniformLocation(pr,"thr"),uMode=gl.getUniformLocation(pr,"mode");
  gl.uniform3f(gl.getUniformLocation(pr,"dim"),x,y,z);
  let ax=-1.4, ay=0.3, thr=0.45, mode=0;
  function R(){const cx=Math.cos(ax),sx=Math.sin(ax),cy=Math.cos(ay),sy=Math.sin(ay);
    return [cy,0,sy, sx*sy,cx,-sx*cy, -cx*sy,sx,cx*cy];}
  function draw(){const w=canvas.clientWidth||300,h=canvas.clientHeight||300;canvas.width=w;canvas.height=h;
    gl.viewport(0,0,w,h);gl.uniformMatrix3fv(uR,false,R());gl.uniform1f(uThr,thr);gl.uniform1f(uMode,mode);
    gl.drawArrays(gl.TRIANGLES,0,3);}
  let dn=false,px,py;
  canvas.onmousedown=e=>{dn=true;px=e.clientX;py=e.clientY;};
  window.addEventListener("mouseup",()=>dn=false);
  window.addEventListener("mousemove",e=>{if(!dn)return;ax+=(e.clientX-px)*0.01;ay+=(e.clientY-py)*0.01;px=e.clientX;py=e.clientY;draw();});
  statusEl.textContent="drag=rotate";
  draw();
  return {setThr:v=>{thr=v;draw();},setMode:m=>{mode=m;draw();},draw};
}
