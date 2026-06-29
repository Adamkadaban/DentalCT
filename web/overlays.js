// Parse CS 3D Imaging Analyses XML (from the zip) -> arch + canals. JS port.
export function parseOverlays(xmlText){
  const ctx=new DOMParser().parseFromString(xmlText,"text/xml").querySelector("VolumeContext");
  if(!ctx) return {available:false};
  const pts=n=>[...n.querySelectorAll(":scope > Point, Point")].map(p=>[+p.getAttribute("x"),+p.getAttribute("y"),+p.getAttribute("z")]);
  let arch=[];
  for(const t of ctx.querySelectorAll("ResamplesTool"))
    if(t.getAttribute("type")==="e_Arch"){const s=t.querySelector("CurveSurface");if(s)arch=pts(s);break;}
  const canals=[...ctx.querySelectorAll("Canals Canal")].map(c=>({
    color:[+ (c.getAttribute("R")||1),+(c.getAttribute("G")||0),+(c.getAttribute("B")||0)],
    radius:+(c.getAttribute("radius")||1), points:pts(c)}));
  return {available:true, arch:arch.map(p=>[p[0],p[1]]), canals};
}
