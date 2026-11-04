#!/usr/bin/env python3
# Dev-time tool: turns lucide icons (https://lucide.dev, ISC licence) into 9x9 LED glyphs for src/glyphs.json.
# Needs: lucide-static unpacked next to this script as ./package, Pillow, Google Chrome (headless) on macOS.
# usage: raster.py 2.0 0.28   (stroke width, coverage threshold)
import os, re, subprocess, json, sys
from PIL import Image
NAMES="server globe database cloud shield mail house cpu wifi lock heart star zap bot terminal camera music code-xml git-branch hard-drive router monitor smartphone activity bell box key-round radio rocket flame package".split()
K=10          # supersampling cell
N=9           # glyph size in LEDs
SW=sys.argv[1] if len(sys.argv)>1 else "2.6"
TH=float(sys.argv[2]) if len(sys.argv)>2 else 0.30
cell=N*K
html=['<html><body style="margin:0;background:#fff"><div style="display:grid;grid-template-columns:repeat(8,%dpx)">'%cell]
ok=[]
for n in NAMES:
    p=f"package/icons/{n}.svg"
    if not os.path.exists(p): print("missing",n); continue
    s=open(p).read()
    s=re.sub(r"<!--.*?-->","",s,flags=re.S)
    s=re.sub(r'stroke-width="2"',f'stroke-width="{SW}"',s)
    s=re.sub(r'width="24"\s+height="24"',f'width="{cell}" height="{cell}"',s)
    s=s.replace("currentColor","#000")
    html.append(f'<div style="width:{cell}px;height:{cell}px">{s}</div>')
    ok.append(n)
html.append("</div></body></html>")
open("sheet.html","w").write("".join(html))
rows=(len(ok)+7)//8
subprocess.run(["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome","--headless=new","--disable-gpu","--hide-scrollbars",f"--window-size={8*cell},{rows*cell}","--screenshot=sheet.png","file://"+os.path.abspath("sheet.html")],capture_output=True)
im=Image.open("sheet.png").convert("L")
out={}
for i,n in enumerate(ok):
    cx,cy=(i%8)*cell,(i//8)*cell
    rowsp=[]
    for gy in range(N):
        r=""
        for gx in range(N):
            tot=0
            for yy in range(K):
                for xx in range(K):
                    tot+= 255-im.getpixel((cx+gx*K+xx,cy+gy*K+yy))
            cov=tot/(255*K*K)
            r+="#" if cov>=TH else "."
        rowsp.append(r)
    out[n]=rowsp
json.dump({n:"".join(r) for n,r in out.items()},open("glyphs.json","w"),separators=(",",":"))
# preview
pv=Image.new("RGB",(8*(N+2)*6,((len(ok)+7)//8)*(N+2)*6),(20,20,20))
for i,n in enumerate(ok):
    for y,r in enumerate(out[n]):
        for x,c in enumerate(r):
            if c=="#":
                for dy in range(5):
                    for dx in range(5):
                        pv.putpixel(((i%8)*(N+2)*6+(x+1)*6+dx,(i//8)*(N+2)*6+(y+1)*6+dy),(61,220,132))
pv.save("preview.png"); print(len(ok),"icons")
