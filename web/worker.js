// Decode a CS 3D zip fully client-side: unzip -> parse DICOM -> JPEG-lossless
// decode every slice -> one Int16Array HU volume. Posts progress + result.
importScripts("./vendor/jszip.min.js", "./vendor/dicomParser.min.js");
let Decoder;

function num(name){ const m=name.match(/\d+/g); return m?+m[m.length-1]:0; }

onmessage = async (e) => {
  if(!Decoder) ({Decoder} = await import("./vendor/lossless-min.js"));
  const zip = await JSZip.loadAsync(e.data);
  let files = Object.values(zip.files).filter(f=>/\.dcm$/i.test(f.name));
  files.sort((a,b)=>num(a.name)-num(b.name));
  const n = files.length;
  if(!n){ postMessage({error:"no .dcm slices in zip"}); return; }

  let vol, rows, cols, meta, dec=new Decoder();
  for(let i=0;i<n;i++){
    const buf = await files[i].async("uint8array");
    const ds = dicomParser.parseDicom(buf);
    if(i===0){
      rows=ds.uint16("x00280010"); cols=ds.uint16("x00280011");
      const ps=(ds.string("x00280030")||"0.15\\0.15").split("\\").map(Number);
      const pz=+ (ds.string("x00180050")||ps[1]);
      meta={shape:[n,rows,cols],spacing_mm:[pz,ps[1],ps[0]],
        window_center:+(ds.string("x00281050")||1048),window_width:+(ds.string("x00281051")||4096),
        slope:+(ds.string("x00281053")||1),intercept:+(ds.string("x00281052")||0),
        model:ds.string("x00081090")||"?",patient:ds.string("x00100020")||""};
      vol=new Int16Array(n*rows*cols);
    }
    const f=ds.elements.x7fe00010.fragments[0];
    const out=new Int16Array(dec.decode(buf.buffer,buf.byteOffset+f.position,f.length).buffer);
    const sl=meta.slope, ic=meta.intercept;
    if(sl===1&&ic===0) vol.set(out,i*rows*cols);
    else { const o=i*rows*cols; for(let k=0;k<out.length;k++) vol[o+k]=out[k]*sl+ic; }
    if(i%20===0) postMessage({progress:(i+1)/n});
  }
  let mn=32767,mx=-32768; for(const v of vol){ if(v<mn)mn=v; if(v>mx)mx=v; }
  meta.hu_min=mn; meta.hu_max=mx;
  const xf=Object.values(zip.files).find(f=>/Analyses\/.*\.xml$/i.test(f.name));
  meta.xml = xf ? await xf.async("string") : null;
  postMessage({done:true, meta, vol}, [vol.buffer]);
};
