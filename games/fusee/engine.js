/* Moteur autonome : aucun accès au DOM, aucune dépendance Tujer. */
(function(root){
'use strict';
const KEYS=['carburant','eau','provisions','outils','oxygene'];
const TRANSPORT_STORIES=14;
const DIE_FACES=['rocket',2,3,4,5,'asteroid'];
const empty=()=>Object.fromEntries(KEYS.map(k=>[k,0]));
const weighted=(items,rng=Math.random)=>{let sum=items.reduce((s,x)=>s+x.weight,0),t=rng()*sum;for(const x of items){t-=x.weight;if(t<0)return x.value;}return items.at(-1)?.value;};
function board(n){if(!Number.isInteger(n)||n<2||n>8)throw Error('Il faut entre 2 et 8 joueurs.');const nodes={},edges=[];function add(id,type,a,r,owner){nodes[id]={id,type,owner,x:50+43*r*Math.cos(a),y:50+40*r*Math.sin(a),neighbors:[]};}function link(a,b){nodes[a].neighbors.push(b);nodes[b].neighbors.push(a);edges.push([a,b]);}add('c','center',0,0);for(let i=0;i<n;i++){const a=-Math.PI/2+2*Math.PI*i/n;add('p'+i,'planet',a,1,i);for(let j=1;j<=2;j++)add(`b${i}_${j}`,'neutral',a,j/3);link('c',`b${i}_1`);link(`b${i}_1`,`b${i}_2`);link(`b${i}_2`,'p'+i);for(let j=1;j<=3;j++)add(`r${i}_${j}`,j===2?'asteroid':'neutral',a+2*Math.PI/n*j/4,1);}for(let i=0;i<n;i++){link('p'+i,`r${i}_1`);link(`r${i}_1`,`r${i}_2`);link(`r${i}_2`,`r${i}_3`);link(`r${i}_3`,'p'+((i+1)%n));}return {nodes,edges};}

// Un même germe donne le même plateau, y compris après une reprise.
function createLayout(n,seed,width=1000,height=560,attempt=0){
 const b=board(n);let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const marginX=66,marginY=66,bottom=86,innerW=width-2*marginX,innerH=height-marginY-bottom;
 const perimeter=t=>{const s=(4*t+.5)%4;return s<1?[s,0]:s<2?[1,s-1]:s<3?[3-s,1]:[0,4-s];};
 const points={},jitter=(v,amount)=>v+(random()-.5)*2*amount;
 const add=(id,x,y)=>points[id]={x,y,r:b.nodes[id].type==='center'?112:b.nodes[id].type==='planet'?52:b.nodes[id].type==='asteroid'?33:24};
 add('c',width/2,height/2);
 for(let i=0;i<n;i++){
  const uv=perimeter(i/n),x=marginX+uv[0]*innerW,y=marginY+uv[1]*innerH;
  add('p'+i,jitter(x,42),jitter(y,42));
  for(let j=1;j<=2;j++)add(`b${i}_${j}`,jitter(width/2+(x-width/2)*j/3,48),jitter(height/2+(y-height/2)*j/3,48));
  for(let j=1;j<=3;j++){const v=perimeter((i+j/4)/n);add(`r${i}_${j}`,jitter(marginX+v[0]*innerW,42),jitter(marginY+v[1]*innerH,42));}
 }
 const ids=Object.keys(points),clamp=p=>{p.x=Math.max(marginX,Math.min(width-marginX,p.x));p.y=Math.max(marginY,Math.min(height-bottom,p.y));};
 // Écarter les cases voisines sans toucher au centre ou au graphe des chemins.
 for(let pass=0;pass<1800;pass++){
  let overlap=0;
  if(pass>0&&pass%150===0)for(const id of ids)if(id!=='c'){points[id].x=jitter(points[id].x,8);points[id].y=jitter(points[id].y,8);clamp(points[id]);}
  for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
   const a=points[ids[i]],c=points[ids[j]],dx=c.x-a.x,dy=c.y-a.y,d=Math.hypot(dx,dy),min=a.r+c.r+22;
   if(d>=min)continue;overlap=Math.max(overlap,min-d);
   const ux=d?dx/d:1,uy=d?dy/d:0,shift=(min-d+.05)/(ids[i]==='c'||ids[j]==='c'?1:2);
   if(ids[i]!=='c'){a.x-=ux*shift;a.y-=uy*shift;clamp(a);}
   if(ids[j]!=='c'){c.x+=ux*shift;c.y+=uy*shift;clamp(c);}
  }
  for(const id of ids)if(id!=='c')clamp(points[id]);
  if(overlap<.1)break;
 }
 let unresolved=0;for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){const a=points[ids[i]],c=points[ids[j]];unresolved=Math.max(unresolved,a.r+c.r+22-Math.hypot(c.x-a.x,c.y-a.y));}
 if(unresolved>.5&&attempt<24)return createLayout(n,(seed+2654435761)>>>0,width,height,attempt+1);
 return Object.fromEntries(ids.map(id=>[id,{x:points[id].x/width*100,y:points[id].y/height*100}]));
}

function validate(c,draft=false){if(!c||!Array.isArray(c.players)||c.players.length<2||c.players.length>8)throw Error('Choisis de 2 à 8 joueurs.');if(c.players.some(x=>typeof x!=='string'||!x.trim()||x.length>24))throw Error('Chaque joueur doit avoir un prénom (24 caractères maximum).');if(!Number.isFinite(c.duration)||c.duration<5||c.duration>120)throw Error('La durée doit être comprise entre 5 et 120 minutes.');if(!Number.isInteger(c.dust)||c.dust<0||c.dust>30)throw Error('La poussière doit être comprise entre 0 et 30.');if(!KEYS.every(k=>Number.isInteger(c.targets?.[k])&&c.targets[k]>=0&&c.targets[k]<=50)||(!draft&&!KEYS.some(k=>c.targets[k]>0)))throw Error('Prévois au moins une ressource (0 à 50 de chaque).');for(const k of KEYS){const assignment=c.activities?.[k];if(!draft&&c.targets[k]>0&&!assignment?.snapshot?.config_json?.tool_id)throw Error('Choisis une activité Tujer pour la ressource : '+k);if(assignment){if(!assignment.snapshot||typeof assignment.snapshot!=='object')throw Error('Configuration d’activité invalide : '+k);if(!String(assignment.snapshot?.config_json?.tool_id||'').trim())throw Error('Cette activité Tujer ne peut pas être lancée : '+k);const level=Math.trunc(Number(assignment.level)||3);if(level<1||level>5)throw Error('Le niveau de l’activité doit être compris entre 1 et 5.');}}return true;}
class Game{
constructor(config,rng=Math.random){validate(config);this.config=JSON.parse(JSON.stringify(config));this.rng=rng;this.board=board(config.players.length);this.layoutSeed=(Math.random()*4294967296)>>>0;this.arrivalKind=null;this.nextTurnReady=false;this.players=config.players.map(name=>({name,bag:empty(),rolls:0,questions:0,successes:0,helps:0}));this.stock=empty();this.active=0;this.position='c';this.dust=config.dust;this.phase='roll';this.remaining=0;this.visited=[];this.turn=0;this.consecutiveRolls=0;this.blocked={};this.elapsed=0;this.log=[];this.question=null;this.questionCheckpoint=null;this.helpUsed=false;this.lastEvent=null;this.pendingTravel=null;}
record(type,data={}){this.log.push({time:Math.round(this.elapsed),type,...data});}
roll(){if(this.phase!=='roll')throw Error('Le dé n’est pas disponible.');this.turn++;for(const id of Object.keys(this.blocked))if(this.blocked[id]<=this.turn)delete this.blocked[id];this.players[this.active].rolls++;this.consecutiveRolls++;const outcomes=DIE_FACES.filter(d=>(d!=='rocket'||(this.position!=='c'&&this.die!=='rocket'))&&(typeof d!=='number'||this.canFinish(this.position,d,[this.position])));this.die=outcomes[Math.floor(this.rng()*outcomes.length)];this.remaining=0;this.phase='die';this.arrivalKind=null;this.nextTurnReady=false;this.record('roll',{player:this.active,die:this.die});return this.die;}
acceptRoll(){if(this.phase!=='die')throw Error('Aucun dé à valider.');this.remaining=typeof this.die==='number'?this.die:0;this.visited=[this.position];this.arrivalKind=this.die==='asteroid'?'asteroid':null;if(this.die==='rocket')this.position='c';this.phase=this.remaining?'move':'arrive';this.record('acceptRoll',{die:this.die});return this.phase;}
canFinish(id,steps,seen){if(!steps)return true;return this.board.nodes[id].neighbors.some(next=>!seen.includes(next)&&!this.blocked[next]&&this.canFinish(next,steps-1,[...seen,next]));}
options(){if(this.phase!=='move')return [];return this.board.nodes[this.position].neighbors.filter(id=>!this.visited.includes(id)&&!this.blocked[id]&&this.canFinish(id,this.remaining-1,[...this.visited,id]));}
move(id){if(!this.options().includes(id))throw Error('Cette case n’est pas accessible.');this.position=id;this.visited.push(id);this.remaining--;if(!this.remaining)this.phase='arrive';this.record('move',{node:id});}
resolve(){if(this.phase!=='arrive')throw Error('Déplacement inachevé.');const node=this.arrivalKind?{type:this.arrivalKind}:this.board.nodes[this.position];this.arrivalKind=null;if(node.type==='planet'){this.nextTurnReady=false;this.setActivePlayer(node.owner);this.phase='resource';return {type:'planet',player:this.active};}if(node.type==='center'){let deposited=empty();for(const p of this.players)for(const k of KEYS){deposited[k]+=p.bag[k];this.stock[k]+=p.bag[k];p.bag[k]=0;}const won=KEYS.every(k=>this.stock[k]>=this.config.targets[k]);this.phase=won?'won':'notice';this.record('deposit',{deposited,won});return {type:won?'won':'deposit',deposited};}if(node.type==='asteroid'){this.phase='notice';const event=this.pickEvent();this.applyEvent(event);return {type:'event',event};}if(this.consecutiveRolls>=3)this.setActivePlayer(this.nextPlayer());this.nextTurnReady=true;this.phase='notice';return {type:'next',player:this.active};}
setActivePlayer(player){if(player!==this.active)this.consecutiveRolls=0;this.active=player;}
nextPlayer(){const ids=this.players.map((p,i)=>({i,p})).filter(x=>x.i!==this.active);const min=Math.min(...ids.map(x=>x.p.rolls));return weighted(ids.filter(x=>x.p.rolls===min).map(x=>({value:x.i,weight:1})),this.rng);}
continue(){if(this.phase!=='notice')throw Error('Impossible de continuer.');if(this.pendingTravel){this.position=this.pendingTravel;this.pendingTravel=null;this.phase='arrive';return this.active;}if(!this.nextTurnReady)this.setActivePlayer(this.nextPlayer());this.nextTurnReady=false;this.phase='roll';return this.active;}
questionFor(k){const assignment=this.config.activities?.[k];if(this.phase!=='resource'||!KEYS.includes(k)||!assignment?.snapshot?.config_json?.tool_id||!this.config.targets[k])throw Error('Ressource indisponible.');this.question={resource:k,activity:JSON.parse(JSON.stringify(assignment))};this.questionCheckpoint=null;this.helpUsed=false;this.nextTurnReady=false;this.players[this.active].questions++;this.phase='question';this.record('question',{player:this.active,resource:k,activityId:String(assignment.id||''),activityTitle:String(assignment.title||assignment.snapshot?.title||'')});return this.question;}
help(i){if(this.phase!=='question'||this.helpUsed||this.dust<1||i===this.active||!this.players[i])throw Error('Aide indisponible.');this.dust--;this.helpUsed=true;this.players[i].helps++;this.record('help',{player:this.active,helper:i});}
resolveQuestion(correct){if(this.phase!=='question')throw Error('Pas de question en cours.');const success=correct===true;const resource=this.question?.resource;if(success&&resource){this.players[this.active].bag[resource]++;this.players[this.active].successes++;}this.questionCheckpoint=null;this.phase='notice';this.nextTurnReady=true;this.record('answer',{player:this.active,resource,correct:success});return success;}
progress(){let total=0,loaded=0;for(const k of KEYS){total+=this.config.targets[k];loaded+=Math.min(this.config.targets[k],this.stock[k]+.6*this.players.reduce((s,p)=>s+p.bag[k],0));}return loaded/total;}
pickPlanet(){const ids=this.players.map((p,i)=>({p,i})).filter(x=>!this.blocked['p'+x.i]);const min=Math.min(...ids.map(x=>x.p.questions));return weighted(ids.map(x=>({value:x.i,weight:(x.i===this.active?.35:1)/Math.pow(1+x.p.questions-min,2)})),this.rng);}
pickEvent(){const expected=Math.min(1,this.elapsed/(this.config.duration*60)),gap=expected-this.progress(),boost=Math.exp(Math.max(-3,Math.min(3,gap*7))),late=expected>.85;const events=[];for(const k of KEYS){if(!this.config.targets[k])continue;const carried=this.players.reduce((s,p)=>s+p.bag[k],0),missing=Math.max(0,this.config.targets[k]-this.stock[k]-carried);events.push({value:{kind:'gain',resource:k},weight:boost*(missing+1)*(late?3:1)});if(carried>0)events.push({value:{kind:'loss',resource:k},weight:(1/boost)*(late?.12:1)});}events.push({value:{kind:'dustGain'},weight:1.2*boost});if(this.dust>0)events.push({value:{kind:'dustLoss'},weight:.5/boost});events.push({value:{kind:'calm'},weight:.7});const counts=this.players.map(p=>p.questions),min=Math.min(...counts);if(!Object.keys(this.blocked).length&&expected<.85){for(let i=0;i<counts.length;i++)if(counts[i]>=min+2)events.push({value:{kind:'block',player:i},weight:(counts[i]-min)*2});}if(Object.keys(this.blocked).length)events.push({value:{kind:'unblock'},weight:2*boost});if(late&&KEYS.some(k=>this.players.some(p=>p.bag[k]>0)))events.push({value:{kind:'return'},weight:6*boost});const otherWeight=events.reduce((sum,x)=>sum+x.weight,0);events.push({value:{kind:'transport'},weight:otherWeight*(late?.85:2.2)});const event=weighted(events,this.rng);if(event.kind==='transport'){event.player=this.pickPlanet();event.story=Math.floor(this.rng()*TRANSPORT_STORIES);}return event;}
applyEvent(e){if(e.kind==='gain')this.players[this.active].bag[e.resource]++;if(e.kind==='loss'){const max=Math.max(...this.players.map(p=>p.bag[e.resource]));const i=this.players.findIndex(p=>p.bag[e.resource]===max);if(max>0){this.players[i].bag[e.resource]--;e.player=i;}}if(e.kind==='dustGain')this.dust++;if(e.kind==='dustLoss')this.dust=Math.max(0,this.dust-1);if(e.kind==='block'){this.blocked['p'+e.player]=this.turn+4;}if(e.kind==='unblock')this.blocked={};if(e.kind==='return'){this.pendingTravel='c';this.phase='notice';}if(e.kind==='transport'){const id='p'+e.player;if(!this.board.nodes[id]||this.blocked[id])throw Error('Cette planète est inaccessible.');this.pendingTravel=id;this.phase='notice';}this.lastEvent=e;this.record('event',e);}
snapshot(){const {rng,...data}=this;return JSON.parse(JSON.stringify(data));}
static restore(snapshot,rng=Math.random){const game=new Game(snapshot.config,rng);Object.assign(game,snapshot);game.rng=rng;game.board=board(game.players.length);if(!Number.isInteger(snapshot.consecutiveRolls)){game.consecutiveRolls=0;for(let i=game.log.length-1;i>=0;i--){const entry=game.log[i];if(entry.type!=='roll')continue;if(entry.player!==game.active)break;game.consecutiveRolls++;}if(game.phase==='notice'&&game.log.at(-1)?.type==='answer')game.nextTurnReady=true;}return game;}
}
const api={Game,board,createLayout,validate,KEYS,DIE_FACES,TRANSPORT_STORIES,weighted};if(typeof module!=='undefined')module.exports=api;root.FuseeEngine=api;
})(typeof window==='undefined'?globalThis:window);
