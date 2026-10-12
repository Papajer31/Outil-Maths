/** Géométrie vectorielle commune (en millimètres physiques) aux tuiles, à l’aperçu et au PDF. */
export const PAPER_GENERATOR_ID = "printable-paper";

export const PAPER_PRESETS = Object.freeze([
  { id:"seyes", label:"Seyès classique", preview:{ kind:"seyes", redMargin:true } },
  { id:"bands", label:"Bandes Seyès", preview:{ kind:"bands", redMargin:true, bandGapMm:10 } },
  { id:"orthogonal", label:"Réseau orthogonal", preview:{ kind:"orthogonal", redMargin:true, orthogonalMode:"lines", orthStepMm:5 } },
  { id:"isometric", label:"Réseau isométrique 60°", preview:{ kind:"isometric", isometricMode:"lines", isoStepMm:10 } },
  { id:"graph", label:"Papier millimétré", preview:{ kind:"graph", graphColor:"blue" } },
  { id:"hexagonal", label:"Trame hexagonale", preview:{ kind:"hexagonal", hexStepMm:10 } }
]);

const PRESET_IDS = new Set(PAPER_PRESETS.map((preset) => preset.id));
const PALETTE = Object.freeze({
  blue:"#a7ddec", violet:"#817ab2", red:"#d84459", grid:"#adc5e5", dots:"#8397bf",
  gurvanMain:"#d6dff0", gurvanSide:"#e1f2f9",
  graphBlue1:"#d9edf8", graphBlue5:"#bcd8ec", graphBlue10:"#8fb4d9",
  graphOrange1:"#f3e6da", graphOrange5:"#e5c9ae", graphOrange10:"#bb8e63",
  graphBlack1:"#e6e6e6", graphBlack5:"#b8b8b8", graphBlack10:"#7a7a7a"
});
const STEP_EPSILON = 0.00001;
const round = (value) => Math.round(value * 1000) / 1000;
const clampStep = (value, min, max, step, fallback) => {
  const number = Number(value);
  const safe = Number.isFinite(number) ? number : fallback;
  return round(Math.min(max, Math.max(min, min + Math.round((safe-min)/step)*step)));
};

export function paperSupportsRedMargin(kind) {
  return kind === "seyes" || kind === "orthogonal" || kind === "bands";
}

function graphPalette(color){
  switch(color){
    case "orange": return {minor:PALETTE.graphOrange1, medium:PALETTE.graphOrange5, major:PALETTE.graphOrange10};
    case "black": return {minor:PALETTE.graphBlack1, medium:PALETTE.graphBlack5, major:PALETTE.graphBlack10};
    default: return {minor:PALETTE.graphBlue1, medium:PALETTE.graphBlue5, major:PALETTE.graphBlue10};
  }
}

export function normalizePaperConfig(raw = {}) {
  const legacyKind = String(raw.kind || "");
  let kind = PRESET_IDS.has(legacyKind) ? legacyKind : "seyes";
  let orthogonalMode = raw.orthogonalMode === "points" ? "points" : "lines";
  let isometricMode = raw.isometricMode === "points" ? "points" : "lines";
  if (legacyKind === "grid-5" || legacyKind === "grid-10") { kind = "orthogonal"; orthogonalMode = "lines"; }
  if (legacyKind === "dots-10") { kind = "orthogonal"; orthogonalMode = "points"; }
  if (legacyKind === "iso-10") { kind = "isometric"; isometricMode = "points"; }
  if (legacyKind === "bands-3") kind = "bands";
  const legacyGrid10 = legacyKind === "grid-10";
  const oldMargins = {standard:10, reduced:5, none:0};
  const marginFallback = Object.prototype.hasOwnProperty.call(oldMargins, raw.marginMode) ? oldMargins[raw.marginMode] : 10;
  return {
    kind,
    landscape:raw.landscape === true,
    marginMm:clampStep(raw.marginMm, 0, 30, 1, marginFallback),
    redMargin:raw.redMargin !== false,
    orthogonalMode,
    orthStepMm:clampStep(raw.orthStepMm ?? raw.gridStepMm ?? raw.dotStepMm, 5, 20, 1, legacyGrid10 ? 10 : 5),
    isometricMode,
    isoStepMm:clampStep(raw.isoStepMm, 5, 20, 1, 10),
    hexStepMm:clampStep(raw.hexStepMm, 5, 20, 1, 10),
    graphColor:["blue","orange","black"].includes(raw.graphColor) ? raw.graphColor : "blue",
    bandGapMm:clampStep(raw.bandGapMm, 0, 50, 1, 30),
    bandInterlineMm:clampStep(raw.bandInterlineMm, 2, 4, .5, 3),
    bandVerticalLines:raw.bandVerticalLines !== false,
    bandGurvan:raw.bandGurvan === true
  };
}

export function getPaperPageSize(config) {
  return config.landscape ? {width:297, height:210} : {width:210, height:297};
}

export function buildPaperGeometry(config = {}, { width = null, height = null, thumbnail = false } = {}) {
  const cfg = normalizePaperConfig(config);
  const page = getPaperPageSize(cfg);
  const w = Number(width) || page.width;
  const h = Number(height) || page.height;
  const margin = thumbnail ? 2 : cfg.marginMm;
  const x0 = margin, y0 = margin, x1 = w - margin, y1 = h - margin;
  const lines = [], dots = [], fills = [];
  if (x1 - x0 < 4 || y1 - y0 < 4) return { width:w, height:h, lines, dots, fills };
  const line = (ax, ay, bx, by, color, widthPt) => lines.push({x1:round(ax), y1:round(ay), x2:round(bx), y2:round(by), color, widthPt});
  const dot = (x,y,color,r) => dots.push({x:round(x), y:round(y), color, r});
  const fillRect = (x,y,width,height,color) => fills.push({x:round(x), y:round(y), width:round(width), height:round(height), color});

  const verticals = (step, color, widthPt, top=y0, bottom=y1, startIndex=0) => {
    for(let i=startIndex; x0+i*step <= x1+STEP_EPSILON; i++) {
      const x=x0+i*step;
      line(x,top,x,bottom,color,widthPt);
    }
  };
  const horizontals = (step, color, widthPt) => {
    for(let i=0; y0+i*step <= y1+STEP_EPSILON; i++) {
      const y=y0+i*step;
      line(x0,y,x1,y,color,widthPt);
    }
  };
  const redLineAtVertical = (step, top=y0, bottom=y1, index=null) => {
    const resolved = index == null ? Math.max(1, Math.round(18/step)) : index;
    const x = x0 + resolved * step;
    if (x <= x1+STEP_EPSILON) line(x,top,x,bottom,PALETTE.red,1.4);
  };

  if (cfg.kind === "seyes") {
    const firstVerticalIndex = cfg.redMargin ? 3 : 0;
    verticals(8, PALETTE.violet, .62, y0, y1, firstVerticalIndex);
    horizontals(2, PALETTE.blue, .42);
    for(let i=0; y0+i*8 <= y1+STEP_EPSILON; i++) {
      const y=y0+i*8;
      line(x0,y,x1,y,PALETTE.violet,1.05);
    }
    if(cfg.redMargin) redLineAtVertical(8, y0, y1, 3);
  } else if (cfg.kind === "orthogonal") {
    const step=cfg.orthStepMm;
    if (cfg.orthogonalMode === "lines") {
      verticals(step, PALETTE.grid, .58);
      horizontals(step, PALETTE.grid, .58);
    } else {
      for(let row=0; y0+row*step <= y1+STEP_EPSILON; row++) {
        const y=y0+row*step;
        for(let col=0; x0+col*step <= x1+STEP_EPSILON; col++) dot(x0+col*step,y,PALETTE.dots,thumbnail ? .9 : .31);
      }
    }
    if(cfg.redMargin) redLineAtVertical(step);
  } else if (cfg.kind === "isometric") {
    const step=cfg.isoStepMm;
    const dy = step * Math.sqrt(3)/2;
    if (cfg.isometricMode === "points") {
      for(let row=0; y0+row*dy <= y1+STEP_EPSILON; row++) {
        const y=y0+row*dy;
        const offset=row%2 ? step/2 : 0;
        for(let col=0; x0+offset+col*step <= x1+STEP_EPSILON; col++) dot(x0+offset+col*step,y,PALETTE.dots,thumbnail ? .9 : .31);
      }
    } else {
      // Les mêmes nœuds que dans le mode Points : chaque triangle a
      // trois côtés de longueur « step » et trois angles de 60°.
      // Les lignes sont découpées géométriquement au bord du plateau,
      // sans débordement ni découpe indépendante de leurs extrémités.
      const color = "#b9cae8";
      const height = y1 - y0;
      const width = x1 - x0;
      const slope = Math.sqrt(3);
      for(let row=0; y0+row*dy <= y1+STEP_EPSILON; row++) {
        const y = Math.min(y1, y0 + row*dy);
        line(x0,y,x1,y,color,.42);
      }
      // Chaque diagonale traverse les mêmes intersections que les
      // points du réseau (rangées alternées décalées d'un demi-pas).
      // Pour direction = +1 / -1, x = ancre + direction * t / √3.
      const reach = height/slope;
      const minK = Math.floor(-reach/step)-1;
      const maxK = Math.ceil((width+reach)/step)+1;
      for(let k=minK;k<=maxK;k++) {
        const anchor=x0+k*step;
        for(const direction of [-1,1]) {
          const limitA=(x0-anchor)*slope/direction;
          const limitB=(x1-anchor)*slope/direction;
          const t0=Math.max(0,Math.min(limitA,limitB));
          const t1=Math.min(height,Math.max(limitA,limitB));
          if(t1-t0<=STEP_EPSILON) continue;
          line(anchor+direction*t0/slope,y0+t0,
               anchor+direction*t1/slope,y0+t1,color,.42);
        }
      }
    }
  } else if (cfg.kind === "hexagonal") {
    // Pavage en hexagones réguliers à sommet gauche/droite.
    // Le pas désigne la longueur réelle d'un côté (5 à 20 mm).
    // Les centres de colonnes sont espacés de 3/2 côtés ; les colonnes
    // alternées sont décalées verticalement d'une demi-hauteur.
    const side=cfg.hexStepMm;
    const rowHeight=Math.sqrt(3)*side;
    const columnStep=1.5*side;
    const halfHeight=rowHeight/2;
    const seen=new Set();
    const vertices=Array.from({length:6},(_,i)=>({
      x:Math.cos(i*Math.PI/3)*side,
      y:Math.sin(i*Math.PI/3)*side
    }));
    // Coupure géométrique des segments dans la zone imprimable : les
    // hexagones restent continus aux bords, sans déborder sur les marges.
    const clippedLine=(ax,ay,bx,by)=>{
      const dx=bx-ax, dy=by-ay;
      let low=0, high=1;
      for(const [p,q] of [
        [-dx,ax-x0],[dx,x1-ax],[-dy,ay-y0],[dy,y1-ay]
      ]){
        if(Math.abs(p)<1e-12){ if(q<0) return; continue; }
        const t=q/p;
        if(p<0) low=Math.max(low,t);
        else high=Math.min(high,t);
        if(low>high) return;
      }
      const a={x:round(ax+low*dx),y:round(ay+low*dy)};
      const b={x:round(ax+high*dx),y:round(ay+high*dy)};
      if(Math.hypot(a.x-b.x,a.y-b.y)<.001) return;
      const pa=`${a.x},${a.y}`, pb=`${b.x},${b.y}`;
      const key=pa<pb?`${pa}|${pb}`:`${pb}|${pa}`;
      if(seen.has(key)) return; // Une arête commune ne se dessine qu'une fois.
      seen.add(key);
      line(a.x,a.y,b.x,b.y,PALETTE.grid,.58);
    };
    const columns=Math.ceil((x1-x0)/columnStep)+3;
    const rows=Math.ceil((y1-y0)/rowHeight)+3;
    for(let col=-2;col<=columns;col++){
      const cx=x0+side+col*columnStep;
      const shift=Math.abs(col%2)*halfHeight;
      for(let row=-3;row<=rows;row++){
        const cy=y0+halfHeight+shift+row*rowHeight;
        if(cx+side<x0 || cx-side>x1 || cy+halfHeight<y0 || cy-halfHeight>y1) continue;
        for(let i=0;i<6;i++){
          const a=vertices[i], b=vertices[(i+1)%6];
          clippedLine(cx+a.x,cy+a.y,cx+b.x,cy+b.y);
        }
      }
    }
  } else if (cfg.kind === "graph") {
    const palette = graphPalette(cfg.graphColor);
    // L'origine du quadrillage est le coin inférieur gauche de la zone
    // imprimable : les graduations 5/10 mm partent du bas, vers le haut.
    // Les lignes sont tracées de plus en plus fortes pour préserver la
    // hiérarchie 1 mm / 5 mm / 10 mm, aussi bien sur le PDF que le SVG.
    for (const [step,color,thickness] of [
      [1,palette.minor,.22],
      [5,palette.medium,.38],
      [10,palette.major,.60]
    ]) {
      for(let i=0; x0+i*step <= x1+STEP_EPSILON; i++) {
        const x=x0+i*step;
        line(x,y0,x,y1,color,thickness);
      }
      for(let i=0; y1-i*step >= y0-STEP_EPSILON; i++) {
        const y=y1-i*step;
        line(x0,y,x1,y,color,thickness);
      }
    }
  } else if (cfg.kind === "bands") {
    const interline=cfg.bandInterlineMm;
    const bandHeight=5*interline;
    const gap=cfg.bandGapMm;
    const count=Math.max(1, Math.floor((y1-y0+gap+STEP_EPSILON)/(bandHeight+gap)));
    const firstY=y0;
    for(let b=0;b<count;b++) {
      const top=firstY+b*(bandHeight+gap);
      if (cfg.bandGurvan) {
        const colors = [PALETTE.gurvanSide, PALETTE.gurvanSide, PALETTE.gurvanMain, PALETTE.gurvanSide, PALETTE.gurvanSide];
        for (let i=0;i<5;i++) fillRect(x0, top + i*interline, x1-x0, interline, colors[i]);
      }
      for(let j=0;j<=5;j++) {
        if (b>0 && gap===0 && j===0) continue;
        const y=top+j*interline;
        line(x0,y,x1,y,j===3?PALETTE.violet:PALETTE.blue,j===3?1.05:.46);
      }
      const verticalStep=4*interline;
      if(cfg.bandVerticalLines) verticals(verticalStep,PALETTE.violet,.58,top,top+bandHeight);
      if(cfg.redMargin) redLineAtVertical(verticalStep,top,top+bandHeight,1);
    }
  }
  return { width:w, height:h, lines, dots, fills };
}

export function renderPaperSvg(config = {}, { thumbnail = false } = {}) {
  const normalized = normalizePaperConfig(config);
  const thumbConfig = thumbnail
    ? {
        ...normalized,
        bandGapMm: normalized.kind === "bands" ? 10 : normalized.bandGapMm,
        redMargin: normalized.kind === "orthogonal" ? false : normalized.redMargin
      }
    : normalized;
  const geometry = buildPaperGeometry(thumbConfig, thumbnail ? {width:38,height:46,thumbnail:true} : {});
  const fillElements=(geometry.fills||[]).map((item)=>`<rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" fill="${item.color}"/>`).join("");
  const strokeElements=geometry.lines.map((item) => `<line x1="${item.x1}" y1="${item.y1}" x2="${item.x2}" y2="${item.y2}" stroke="${item.color}" stroke-width="${round(item.widthPt*25.4/72*(thumbnail ? 2.6 : 1))}"/>`).join("");
  const dotElements=geometry.dots.map((item) => `<circle cx="${item.x}" cy="${item.y}" r="${item.r}" fill="${item.color}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" class="dashboard-paper-svg" viewBox="0 0 ${geometry.width} ${geometry.height}" role="img" aria-label="Aperçu du papier imprimable" preserveAspectRatio="xMidYMid meet"><rect width="${geometry.width}" height="${geometry.height}" fill="#fff"/>${fillElements}${strokeElements}${dotElements}</svg>`;
}
