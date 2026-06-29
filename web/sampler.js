// In-browser volume sampler — port of src/dentalct/sampler.py. vol: Int16Array,
// dims {z,y,x}. All slicers return ImageData (RGBA) for putImageData on a canvas.
export function makeSampler(vol, z, y, x){
  const at=(k,j,i)=>vol[(k*y+j)*x+i];
  function wl(v,wc,ww){ const lo=wc-ww/2; let t=(v-lo)/(ww||1); return t<0?0:t>1?255:t*255|0; }

  function slice(plane, idx, wc, ww){
    let w,h,get;
    if(plane==="axial"){ w=x;h=y;get=(c,r)=>at(idx,r,c); }
    else if(plane==="coronal"){ w=x;h=z;get=(c,r)=>at(z-1-r,idx,c); }
    else { w=y;h=z;get=(c,r)=>at(z-1-r,c,idx); }
    const img=new ImageData(w,h);
    for(let r=0,p=0;r<h;r++)for(let c=0;c<w;c++,p+=4){const g=wl(get(c,r),wc,ww);img.data[p]=img.data[p+1]=img.data[p+2]=g;img.data[p+3]=255;}
    return img;
  }
  const nslices={axial:z,coronal:y,sagittal:x};

  function resample(pts,n){ // pts:[[x,y]], even arc-length to n
    const s=[0]; for(let i=1;i<pts.length;i++)s.push(s[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
    const L=s[s.length-1],out=[]; for(let i=0;i<n;i++){const u=L*i/(n-1);let j=1;while(j<s.length-1&&s[j]<u)j++;const t=(u-s[j-1])/((s[j]-s[j-1])||1);out.push([pts[j-1][0]+t*(pts[j][0]-pts[j-1][0]),pts[j-1][1]+t*(pts[j][1]-pts[j-1][1])]);}return out;
  }
  function normals(pts){const nb=[];for(let i=0;i<pts.length;i++){const a=pts[Math.max(i-1,0)],b=pts[Math.min(i+1,pts.length-1)];let tx=b[0]-a[0],ty=b[1]-a[1];const l=Math.hypot(tx,ty)||1;nb.push([-ty/l,tx/l]);}return nb;}

  function panoramic(arch,wc,ww,thk=10,N=600){
    const pts=resample(arch,N),nm=normals(pts),img=new ImageData(N,z);
    for(let r=0;r<z;r++)for(let i=0;i<N;i++){let s=0,zc=z-1-r;for(let o=-thk;o<=thk;o++){const cx=pts[i][0]+nm[i][0]*o|0,cy=pts[i][1]+nm[i][1]*o|0;s+=at(zc,Math.min(Math.max(cy,0),y-1),Math.min(Math.max(cx,0),x-1));}const g=wl(s/(2*thk+1),wc,ww),p=(r*N+i)*4;img.data[p]=img.data[p+1]=img.data[p+2]=g;img.data[p+3]=255;}
    return img;
  }
  function cross(arch,wc,ww,pos=.5,half=70,N=600,canals){
    const pts=resample(arch,N),nm=normals(pts),i=Math.min(N-1,pos*(N-1)|0),[cx,cy]=pts[i],[nx,ny]=nm[i];const W=2*half,img=new ImageData(W,z);
    for(let r=0;r<z;r++)for(let o=0;o<W;o++){const off=o-half,sx=Math.min(Math.max(cx+nx*off|0,0),x-1),sy=Math.min(Math.max(cy+ny*off|0,0),y-1),g=wl(at(z-1-r,sy,sx),wc,ww),p=(r*W+o)*4;img.data[p]=img.data[p+1]=img.data[p+2]=g;img.data[p+3]=255;}
    if(canals){const a=pts[i],b=pts[Math.max(i-1,0)];let tx=a[0]-b[0],ty=a[1]-b[1];const tl=Math.hypot(tx,ty)||1;for(const cn of canals){const P=cn.points;for(let j=0;j<P.length-1;j++)for(let t=0;t<40;t++){const f=t/40,px=P[j][0]+f*(P[j+1][0]-P[j][0]),py=P[j][1]+f*(P[j+1][1]-P[j][1]),pz=P[j][2]+f*(P[j+1][2]-P[j][2]);const al=((px-cx)*tx+(py-cy)*ty)/tl,of=(px-cx)*nx+(py-cy)*ny;if(Math.abs(al)<4&&Math.abs(of)<half){const col=of+half|0,row=z-1-(pz|0),rr=8;for(let dy=-rr;dy<=rr;dy++)for(let dx=-rr;dx<=rr;dx++)if(dx*dx+dy*dy<=rr*rr){const rc=row+dy,cc=col+dx;if(rc>=0&&rc<z&&cc>=0&&cc<W){const p=(rc*W+cc)*4;img.data[p]=255;img.data[p+1]=128;img.data[p+2]=0;}}}}}}
    return img;
  }
  function oblique(wc,ww,az=0,el=0,depth=0,size=400){
    const a=az*Math.PI/180,e=el*Math.PI/180,nx=Math.cos(e)*Math.cos(a),ny=Math.cos(e)*Math.sin(a),nz=Math.sin(e);
    const ux=-Math.sin(a),uy=Math.cos(a),uz=0,vx=ny*uz-nz*uy,vy=nz*ux-nx*uz,vz=nx*uy-ny*ux;
    const cx=x/2+nx*depth,cy=y/2+ny*depth,cz=z/2+nz*depth,img=new ImageData(size,size);
    for(let r=0;r<size;r++)for(let c=0;c<size;c++){const gu=c-size/2,gv=r-size/2,xi=Math.min(Math.max(cx+gu*ux+gv*vx|0,0),x-1),yi=Math.min(Math.max(cy+gu*uy+gv*vy|0,0),y-1),zi=Math.min(Math.max(cz+gu*uz+gv*vz|0,0),z-1),g=wl(at(zi,yi,xi),wc,ww),p=((size-1-r)*size+c)*4;img.data[p]=img.data[p+1]=img.data[p+2]=g;img.data[p+3]=255;}
    return img;
  }
  return {slice,nslices,panoramic,cross,oblique};
}
