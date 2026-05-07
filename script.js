const canvas = document.getElementById("gameCanvas");
const ctx    = canvas.getContext("2d");

const PTS_PER_LEVEL   = 300;
const FREEZE_DURATION = 3000;  
const MAX_COMBO       = 8;
const MAX_TARGETS     = 8;
const TARGET_LIFESPAN = 6200;  
const COMBO_WINDOW   = 2000;  
let score=0, lives=3, level=1;
let countdown=60, gameRunning=false, paused=false, nickname="";
let targets=[], particles=[], floatingTexts=[];
let gameTime=0, combo=0, bestCombo=1;
let streak=0, comboActive=false, comboTimer=0;
let shots=0, hits=0, misses=0, civiliansHit=0, enemiesHit=0, startStamp=0;
let crossKick=0;
let levelFlash=0;
let bgOffset=0, shakeMag=0;
let frozen=false, freezeEnd=0;

let lastTick=0;       
let lastFrame=0;      
let spawnAccum=0;     

let radarAngle=0;
const RADAR_SPD=0.022;
let radarBlips=[];

const trailCv = document.createElement("canvas");
trailCv.width=canvas.width; trailCv.height=canvas.height;
const trailCtx = trailCv.getContext("2d");

let mX=canvas.width/2, mY=canvas.height/2, mOnCanvas=false;
let rX=0, rY=0, rVX=0, rVY=0;

canvas.addEventListener("mouseenter", ()=> mOnCanvas=true);
canvas.addEventListener("mouseleave", ()=> mOnCanvas=false);
canvas.addEventListener("mousemove",  e=>{
    const r=canvas.getBoundingClientRect();
    mX=e.clientX-r.left; mY=e.clientY-r.top;
});

function updateRecoil(){
    rVX += -0.22*rX; rVY += -0.22*rY;
    rVX *= 0.58;     rVY *= 0.58;
    rX  += rVX;      rY  += rVY;
}
function triggerRecoil(){
    rVX += (Math.random()-0.5)*14;
    rVY += -Math.random()*12-5;
}

function drawCrosshair(){
    if(!mOnCanvas || !gameRunning) return;

    const cx=mX+rX, cy=mY+rY;
    const kick=Math.max(0,crossKick);

    ctx.save();
    ctx.translate(cx,cy);
    ctx.globalAlpha=.92;
    ctx.strokeStyle="#ffffff";
    ctx.fillStyle="#ffffff";
    ctx.lineWidth=1.1;
    ctx.shadowBlur=6;
    ctx.shadowColor="rgba(255,255,255,.65)";

    const r=7.5+kick*1.8;
    const gap=3.5;
    const len=5.5+kick*1.4;

    
    ctx.beginPath();
    ctx.arc(0,0,r,0,Math.PI*2);
    ctx.stroke();

    
    ctx.beginPath();
    ctx.moveTo(-r-len,0); ctx.lineTo(-gap,0);
    ctx.moveTo(gap,0);    ctx.lineTo(r+len,0);
    ctx.moveTo(0,-r-len); ctx.lineTo(0,-gap);
    ctx.moveTo(0,gap);    ctx.lineTo(0,r+len);
    ctx.stroke();

    
    ctx.beginPath();
    ctx.arc(0,0,1.15+kick*.45,0,Math.PI*2);
    ctx.fill();

    ctx.restore();
}

let audioCtx=null;
function getAudio(){
    if(!audioCtx) audioCtx=new(window.AudioContext||window.webkitAudioContext)();
    return audioCtx;
}
function playShot(type){
    try{
        const ac=getAudio(), osc=ac.createOscillator(), g=ac.createGain();
        osc.connect(g); g.connect(ac.destination);
        const now=ac.currentTime;
        const P={
            green: {wt:"square",   f0:440,  f1:80,   d:.18, v:.18},
            orange:{wt:"square",   f0:880,  f1:100,  d:.22, v:.20},
            red:   {wt:"sawtooth", f0:120,  f1:50,   d:.30, v:.25},
            blue:  {wt:"sine",     f0:523,  f1:1046, d:.20, v:.15},
            ice:   {wt:"sine",     f0:1200, f1:180,  d:.38, v:.18},
            miss:  {wt:"triangle", f0:200,  f1:50,   d:.08, v:.06}
        }[type]||{wt:"triangle",f0:200,f1:50,d:.08,v:.06};
        osc.type=P.wt;
        osc.frequency.setValueAtTime(P.f0,now);
        osc.frequency.exponentialRampToValueAtTime(P.f1,now+P.d);
        g.gain.setValueAtTime(P.v,now);
        g.gain.exponentialRampToValueAtTime(0.001,now+P.d);
        osc.start(now); osc.stop(now+P.d+0.05);
    }catch(e){}
}

function playCountdownBeep(secondsLeft){
    try{
        const ac=getAudio();
        const osc=ac.createOscillator(), g=ac.createGain();
        osc.connect(g); g.connect(ac.destination);
        const now=ac.currentTime;
        const urgent = secondsLeft<=3;
        osc.type = urgent ? "square" : "sine";
        const freq = urgent ? 880 : (secondsLeft<=5 ? 660 : 440);
        osc.frequency.setValueAtTime(freq, now);
        if(urgent) osc.frequency.exponentialRampToValueAtTime(freq*1.5, now+0.08);
        g.gain.setValueAtTime(urgent ? 0.22 : 0.13, now);
        g.gain.exponentialRampToValueAtTime(0.001, now+(urgent ? 0.18 : 0.12));
        osc.start(now); osc.stop(now+0.25);
    }catch(e){}
}

function playHighScoreFanfare(){
    try{
        const ac=getAudio();
        [523,659,784,1047].forEach((freq,i)=>{
            const osc=ac.createOscillator(), g=ac.createGain();
            osc.connect(g); g.connect(ac.destination);
            const t=ac.currentTime+i*0.12;
            osc.type="sine"; osc.frequency.setValueAtTime(freq,t);
            g.gain.setValueAtTime(0.18,t);
            g.gain.exponentialRampToValueAtTime(0.001,t+0.22);
            osc.start(t); osc.stop(t+0.25);
        });
    }catch(e){}
}

function activateFreeze(){
    frozen=true; freezeEnd=performance.now()+FREEZE_DURATION;
    document.getElementById("freezeOverlay").classList.remove("hidden");
    createExplosion(canvas.width/2, canvas.height/2, "#a0eeff", 50);
    spawnFloatingText(canvas.width/2, canvas.height/2-55, "❄  FREEZE!", "#a0eeff");
    document.querySelectorAll(".value").forEach(el=>el.parentElement.classList.add("hud-frozen"));
}
function deactivateFreeze(){
    frozen=false;
    lastTick=performance.now(); 
    document.getElementById("freezeOverlay").classList.add("hidden");
    document.querySelectorAll(".hud-frozen").forEach(el=>el.classList.remove("hud-frozen"));
}

function updateProgressBar(){
    const base = score-(level-1)*PTS_PER_LEVEL;
    const pct  = Math.min(100,Math.max(0,(base/PTS_PER_LEVEL)*100));
    const left = Math.max(0,PTS_PER_LEVEL-base);
    document.getElementById("progFill").style.width=pct+"%";
    document.getElementById("progLabel").textContent=`${score} pts  ·  ${left} to LV ${level+1}`;
}

function showComboFlash(c){
    if(c<3) return;
    const el=document.getElementById("comboFlash");
    const cols={3:"#ff9900",4:"#ff9900",5:"#ff3366",6:"#ff3366",7:"#bf44ff",8:"#bf44ff"};
    const col=cols[Math.min(c,8)]||"#ff9900";
    el.textContent=`×${c}`;
    el.style.color=col;
    el.style.fontSize=`${1.45+c*0.15}rem`;
    el.style.textShadow=`0 0 30px ${col},0 0 60px ${col}`;
    el.classList.remove("hidden","pop"); void el.offsetWidth; el.classList.add("pop");
    setTimeout(()=>el.classList.add("hidden"),580);
}

function updateRadar(){
    radarAngle=(radarAngle+RADAR_SPD)%(Math.PI*2);
    const cx=canvas.width/2, cy=canvas.height/2;
    targets.forEach(t=>{
        let ta=Math.atan2(t.y-cy,t.x-cx);
        if(ta<0) ta+=Math.PI*2;
        let diff=radarAngle-ta;
        if(diff<0) diff+=Math.PI*2;
        if(diff<RADAR_SPD*4){
            radarBlips.push({
                wx:t.x, wy:t.y, life:1.0,
                color:{green:"#00ff88",red:"#ff3366",blue:"#00d9ff",orange:"#ff9900",ice:"#a0eeff"}[t.type]
            });
        }
    });
}
function drawRadar(){
    const R=28, rx=canvas.width-R-10, ry=canvas.height-R-10;
    ctx.save(); ctx.translate(rx,ry);
    ctx.beginPath(); ctx.arc(0,0,R,0,Math.PI*2); ctx.clip();
    ctx.fillStyle="rgba(0,5,3,.9)";
    ctx.beginPath(); ctx.arc(0,0,R,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle="rgba(0,160,60,.13)"; ctx.lineWidth=.5;
    [.38,.72,1].forEach(f=>{ctx.beginPath();ctx.arc(0,0,R*f,0,Math.PI*2);ctx.stroke();});
    ctx.beginPath(); ctx.moveTo(-R,0); ctx.lineTo(R,0); ctx.moveTo(0,-R); ctx.lineTo(0,R); ctx.stroke();
    ctx.save(); ctx.rotate(radarAngle);
    const wg=ctx.createLinearGradient(0,0,R,0);
    wg.addColorStop(0,"rgba(0,255,80,.28)"); wg.addColorStop(.6,"rgba(0,255,80,.06)"); wg.addColorStop(1,"rgba(0,255,80,0)");
    ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,R,-Math.PI*.45,0); ctx.closePath();
    ctx.fillStyle=wg; ctx.fill();
    ctx.strokeStyle="rgba(0,255,80,.7)"; ctx.lineWidth=.8;
    ctx.shadowBlur=4; ctx.shadowColor="#00ff50";
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(R,0); ctx.stroke();
    ctx.shadowBlur=0; ctx.restore();
    for(let i=radarBlips.length-1;i>=0;i--){
        const b=radarBlips[i]; b.life-=.012;
        if(b.life<=0){radarBlips.splice(i,1);continue;}
        const bx=((b.wx/canvas.width)-.5)*2*R;
        const by=((b.wy/canvas.height)-.5)*2*R;
        ctx.save(); ctx.globalAlpha=b.life*.8;
        ctx.fillStyle=b.color; ctx.shadowBlur=3; ctx.shadowColor=b.color;
        ctx.beginPath(); ctx.arc(bx,by,1.8,0,Math.PI*2); ctx.fill();
        ctx.restore();
    }
    ctx.restore();
    ctx.save(); ctx.translate(rx,ry);
    ctx.strokeStyle="rgba(0,190,70,.25)"; ctx.lineWidth=.6;
    ctx.beginPath(); ctx.arc(0,0,R,0,Math.PI*2); ctx.stroke();
    ctx.restore();
}

function drawBackground(){
    const bg=ctx.createRadialGradient(canvas.width/2,canvas.height/2,0,canvas.width/2,canvas.height/2,canvas.width*.75);
    if(frozen){
        bg.addColorStop(0,"#0a1018"); bg.addColorStop(.6,"#050c12"); bg.addColorStop(1,"#020408");
    } else {
        bg.addColorStop(0,"#0a0d16"); bg.addColorStop(.6,"#050810"); bg.addColorStop(1,"#020308");
    }
    ctx.fillStyle=bg; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.save();
    ctx.strokeStyle=frozen?"rgba(100,200,220,.1)":"rgba(0,80,130,.11)"; ctx.lineWidth=.5;
    const gs=50, oy=bgOffset%gs;
    for(let y=-gs+oy;y<canvas.height+gs;y+=gs){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();}
    for(let x=0;x<canvas.width+gs;x+=gs){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke();}
    ctx.restore();
    const sy=(gameTime*1.4)%canvas.height;
    const sg=ctx.createLinearGradient(0,sy-18,0,sy+18);
    sg.addColorStop(0,"rgba(0,217,255,0)"); sg.addColorStop(.5,"rgba(0,217,255,.018)"); sg.addColorStop(1,"rgba(0,217,255,0)");
    ctx.fillStyle=sg; ctx.fillRect(0,sy-18,canvas.width,36);
}

function decayTrail(){
    trailCtx.save();
    trailCtx.globalCompositeOperation="destination-out";
    trailCtx.fillStyle="rgba(0,0,0,.13)";
    trailCtx.fillRect(0,0,canvas.width,canvas.height);
    trailCtx.restore();
}
function paintGhost(t){
    if(frozen) return;
    const c={green:"rgba(0,255,136,",red:"rgba(255,51,102,",blue:"rgba(0,217,255,",orange:"rgba(255,153,0,",ice:"rgba(160,238,255,"};
    trailCtx.save();
    trailCtx.beginPath(); trailCtx.arc(t.x,t.y,t.radius*.5,0,Math.PI*2);
    trailCtx.fillStyle=c[t.type]+"0.28)"; trailCtx.fill();
    trailCtx.restore();
}

function createTarget(forcedType=null){
    let type=forcedType;

    if(!type){
        
        
        const redChance    = Math.min(.18 + level*.036, .50);
        const blueChance   = .13;
        const orangeChance = Math.min(.10 + level*.007, .18);
        const iceChance    = .038;
        const r=Math.random();

        if(r < redChance) type="red";
        else if(r < redChance + blueChance) type="blue";
        else if(r < redChance + blueChance + orangeChance) type="orange";
        else if(r < redChance + blueChance + orangeChance + iceChance) type="ice";
        else type="green";
    }

    
    const base=1.65 + level*.38;
    let size, sm;

    switch(type){
        case "green":
            size=Math.max(11, 34 - level*1.45);
            sm=1.08 + level*.045;
            break;
        case "red":
            size=Math.min(82, 24 + level*3.2);
            sm=.76 + level*.072;
            break;
        case "blue":
            size=Math.max(15, 23 - level*.15);
            sm=2.72 + level*.070;
            break;
        case "orange":
            size=Math.max(9, 15 - level*.10);
            sm=4.45 + level*.095;
            break;
        case "ice":
            size=18;
            sm=2.05 + level*.040;
            break;
    }

    let dx=(Math.random()-.5)*base*sm;
    let dy=(Math.random()-.5)*base*sm;

    
    if(Math.abs(dx)<.45) dx += dx<0 ? -.55 : .55;
    if(Math.abs(dy)<.45) dy += dy<0 ? -.55 : .55;

    return{
        x:Math.random()*(canvas.width-160)+80,
        y:Math.random()*(canvas.height-160)+80,
        dx,dy,
        radius:size,
        type,
        angle:0,
        rotSpeed:(Math.random()-.5)*(.16+level*.01),
        pulsePhase:Math.random()*Math.PI*2,
        spawnTime:performance.now()
    };
}

function createExplosion(x,y,color,count=18){
    for(let i=0;i<count;i++){
        const a=(Math.PI*2/count)*i+(Math.random()-.5)*.5;
        const s=Math.random()*7+2;
        particles.push({x,y,dx:Math.cos(a)*s,dy:Math.sin(a)*s,
            life:1.0,decay:Math.random()*.025+.018,color,size:Math.random()*4+2,kind:"spark"});
    }
    particles.push({x,y,dx:0,dy:0,life:1.0,decay:.06,color,size:22,kind:"flash"});
}
function createRingBurst(x,y,color){
    particles.push({x,y,dx:0,dy:0,life:1.0,decay:.035,color,size:12,kind:"ring"});
}
function drawParticles(){
    ctx.save(); ctx.globalCompositeOperation="lighter";
    for(let i=particles.length-1;i>=0;i--){
        const p=particles[i];
        p.x+=p.dx; p.y+=p.dy; p.dx*=.93; p.dy*=.93; p.life-=p.decay;
        if(p.life<=0){particles.splice(i,1);continue;}
        ctx.globalAlpha=p.life;
        if(p.kind==="flash"){
            const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.size*p.life);
            g.addColorStop(0,p.color); g.addColorStop(.4,p.color+"88"); g.addColorStop(1,"transparent");
            ctx.fillStyle=g; ctx.beginPath(); ctx.arc(p.x,p.y,p.size*p.life,0,Math.PI*2); ctx.fill();
        } else if(p.kind==="ring"){
            ctx.strokeStyle=p.color; ctx.lineWidth=2*p.life;
            ctx.shadowBlur=10; ctx.shadowColor=p.color;
            ctx.beginPath(); ctx.arc(p.x,p.y,p.size*(1.2-p.life)*4,0,Math.PI*2); ctx.stroke();
        } else {
            ctx.fillStyle=p.color; ctx.shadowBlur=6; ctx.shadowColor=p.color;
            ctx.beginPath(); ctx.arc(p.x,p.y,p.size*p.life,0,Math.PI*2); ctx.fill();
        }
    }
    ctx.globalCompositeOperation="source-over"; ctx.globalAlpha=1; ctx.shadowBlur=0; ctx.restore();
}

const COLS={
    green: {main:"#00ff88",glow:"#00ff88",fill:"rgba(0,255,136,.08)",dim:"rgba(0,255,136,.03)"},
    red:   {main:"#ff3366",glow:"#ff3366",fill:"rgba(255,51,102,.08)",dim:"rgba(255,51,102,.03)"},
    blue:  {main:"#00d9ff",glow:"#00d9ff",fill:"rgba(0,217,255,.08)",dim:"rgba(0,217,255,.03)"},
    orange:{main:"#ff9900",glow:"#ffcc00",fill:"rgba(255,153,0,.10)",dim:"rgba(255,153,0,.03)"},
    ice:   {main:"#a0eeff",glow:"#c8f4ff",fill:"rgba(160,238,255,.10)",dim:"rgba(160,238,255,.03)"}
};

function drawTarget(t){
    const pulse = frozen ? 1.0 : Math.sin(gameTime*.06+t.pulsePhase)*.12+1.0;
    const c=COLS[t.type], r=t.radius;
    ctx.save();
    ctx.translate(t.x,t.y); ctx.rotate(t.angle); ctx.scale(pulse,pulse);

    
    const outerGlow=ctx.createRadialGradient(0,0,r*.4,0,0,r*2.2);
    outerGlow.addColorStop(0,c.dim); outerGlow.addColorStop(1,"transparent");
    ctx.globalAlpha=0.6;
    ctx.fillStyle=outerGlow; ctx.beginPath(); ctx.arc(0,0,r*2.2,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=1;

    
    const fg=ctx.createRadialGradient(0,0,0,0,0,r);
    fg.addColorStop(0,c.fill); fg.addColorStop(.5,c.fill); fg.addColorStop(1,"transparent");
    ctx.fillStyle=fg; ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill();

    
    ctx.shadowBlur=20+pulse*6; ctx.shadowColor=c.glow;
    ctx.strokeStyle=c.main; ctx.lineWidth=2.2;
    ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.stroke();

    
    if(t.type==="green"){
        
        ctx.shadowBlur=8; ctx.lineWidth=1; ctx.strokeStyle=c.main+"99";
        ctx.beginPath(); ctx.arc(0,0,r*.68,0,Math.PI*2); ctx.stroke();
        ctx.strokeStyle=c.main+"44"; ctx.lineWidth=0.8;
        ctx.beginPath(); ctx.arc(0,0,r*.36,0,Math.PI*2); ctx.stroke();
        
        ctx.save(); ctx.rotate(gameTime*0.04);
        for(let i=0;i<4;i++){
            ctx.save(); ctx.rotate(Math.PI/2*i);
            ctx.strokeStyle=c.main+"66"; ctx.lineWidth=1.2;
            ctx.beginPath(); ctx.arc(0,0,r*.85,-.22,.22); ctx.stroke();
            ctx.restore();
        }
        ctx.restore();

    } else if(t.type==="red"){
        
        ctx.shadowBlur=12; ctx.lineWidth=1.2; ctx.strokeStyle=c.main+"88";
        ctx.beginPath(); ctx.arc(0,0,r*.6,0,Math.PI*2); ctx.stroke();
        
        ctx.save(); ctx.rotate(Math.PI/4);
        ctx.strokeStyle=c.main+"66"; ctx.lineWidth=1.5;
        const xr=r*.35;
        ctx.beginPath(); ctx.moveTo(-xr,0); ctx.lineTo(xr,0); ctx.moveTo(0,-xr); ctx.lineTo(0,xr); ctx.stroke();
        ctx.restore();
        
        ctx.globalAlpha=0.25+Math.sin(gameTime*.1)*0.15;
        const tg=ctx.createRadialGradient(0,0,0,0,0,r*.9);
        tg.addColorStop(0,c.fill); tg.addColorStop(1,"transparent");
        ctx.fillStyle=tg; ctx.beginPath(); ctx.arc(0,0,r*.9,0,Math.PI*2); ctx.fill();
        ctx.globalAlpha=1;

    } else if(t.type==="blue"){
        
        ctx.shadowBlur=10; ctx.lineWidth=1; ctx.strokeStyle=c.main+"66";
        ctx.beginPath(); ctx.arc(0,0,r*.55,0,Math.PI*2); ctx.stroke();
        
        ctx.save(); ctx.rotate(gameTime*0.09);
        ctx.strokeStyle=c.main; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.arc(0,0,r*.75,0,Math.PI*1.5); ctx.stroke();
        
        const ax=r*.75, ay=0;
        ctx.fillStyle=c.main;
        ctx.beginPath(); ctx.moveTo(ax,ay-4); ctx.lineTo(ax+5,ay); ctx.lineTo(ax,ay+4); ctx.fill();
        ctx.restore();
        
        for(let i=0;i<12;i++){
            ctx.save(); ctx.rotate(Math.PI/6*i);
            ctx.fillStyle=c.main+(i%3===0?"cc":"44");
            ctx.fillRect(r*.88,-(i%3===0?2:1),r*.1,i%3===0?4:2);
            ctx.restore();
        }

    } else if(t.type==="orange"){
        
        ctx.shadowBlur=14; ctx.lineWidth=1; ctx.strokeStyle=c.main+"aa";
        ctx.beginPath(); ctx.arc(0,0,r*.55,0,Math.PI*2); ctx.stroke();
        
        ctx.save(); ctx.rotate(gameTime*0.07);
        ctx.strokeStyle=c.glow; ctx.lineWidth=1.2;
        for(let i=0;i<6;i++){
            ctx.save(); ctx.rotate(Math.PI/3*i);
            ctx.beginPath(); ctx.moveTo(0,r*.28); ctx.lineTo(0,r*.82); ctx.stroke();
            ctx.restore();
        }
        ctx.restore();
        
        ctx.strokeStyle=c.main+"55"; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(0,-r*.45); ctx.lineTo(r*.45,0); ctx.lineTo(0,r*.45); ctx.lineTo(-r*.45,0); ctx.closePath(); ctx.stroke();

    } else if(t.type==="ice"){
        
        ctx.shadowBlur=14; ctx.lineWidth=1;
        
        ctx.setLineDash([3,4]); ctx.strokeStyle=c.main+"88";
        ctx.beginPath(); ctx.arc(0,0,r*.8,0,Math.PI*2); ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.save(); ctx.rotate(-gameTime*0.025);
        for(let i=0;i<6;i++){
            ctx.save(); ctx.rotate(Math.PI/3*i);
            ctx.strokeStyle=c.main; ctx.lineWidth=1.5;
            ctx.shadowBlur=6;
            ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,r*.7); ctx.stroke();
            
            ctx.strokeStyle=c.main+"77"; ctx.lineWidth=0.8; ctx.shadowBlur=0;
            ctx.beginPath(); ctx.moveTo(0,r*.35); ctx.lineTo(r*.15,r*.2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0,r*.35); ctx.lineTo(-r*.15,r*.2); ctx.stroke();
            ctx.restore();
        }
        ctx.restore();
    }

    
    ctx.save();
    ctx.beginPath(); ctx.arc(0,0,r*1.3,0,Math.PI*2); ctx.clip();
    ctx.shadowBlur=6; ctx.shadowColor=c.glow; ctx.strokeStyle=c.main+"88"; ctx.lineWidth=1.5;
    ctx.beginPath();
    ctx.moveTo(-r*1.3,0); ctx.lineTo(-r*.6,0);
    ctx.moveTo( r*.6,0);  ctx.lineTo( r*1.3,0);
    ctx.moveTo(0,-r*1.3); ctx.lineTo(0,-r*.6);
    ctx.moveTo(0, r*.6);  ctx.lineTo(0, r*1.3);
    ctx.stroke();
    ctx.restore();

    
    ctx.shadowBlur=14; ctx.shadowColor=c.glow;
    ctx.fillStyle=c.main;
    ctx.beginPath(); ctx.arc(0,0,r*.13,0,Math.PI*2); ctx.fill();

    
    if(t.type==="blue"){
        ctx.shadowBlur=0; ctx.fillStyle="rgba(255,255,255,0.85)";
        ctx.font=`bold ${Math.max(7,r*.42)}px Rajdhani`;
        ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillText("TIME",0,0);
    } else if(t.type==="orange"){
        ctx.shadowBlur=0; ctx.fillStyle="rgba(255,255,255,0.85)";
        ctx.font=`bold ${Math.max(7,r*.48)}px Rajdhani`;
        ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillText("ELITE",0,0);
    } else if(t.type==="ice"){
        
    }

    
    if(frozen){
        ctx.globalAlpha=.22;
        const fi=ctx.createRadialGradient(0,0,0,0,0,r);
        fi.addColorStop(0,"rgba(160,238,255,.55)"); fi.addColorStop(1,"rgba(160,238,255,0)");
        ctx.fillStyle=fi; ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill();
        ctx.globalAlpha=1;
    }

    ctx.shadowBlur=0; ctx.setLineDash([]); ctx.restore();
}

function spawnFloatingText(x,y,text,color){floatingTexts.push({x,y,text,color,life:1.0,vy:-1.6});}
function drawFloatingTexts(){
    for(let i=floatingTexts.length-1;i>=0;i--){
        const f=floatingTexts[i]; f.y+=f.vy; f.life-=.02;
        if(f.life<=0){floatingTexts.splice(i,1);continue;}
        ctx.save(); ctx.globalAlpha=f.life; ctx.font="bold 15px Orbitron";
        ctx.fillStyle=f.color; ctx.textAlign="center";
        ctx.shadowBlur=10; ctx.shadowColor=f.color;
        ctx.fillText(f.text,f.x,f.y); ctx.restore();
    }
}

function displayCombo(){
    return Math.max(1, combo);
}

function resetCombo(){
    combo=0;
    comboActive=false;
    comboTimer=0;
    const ch=document.querySelector(".combo-hud");
    if(ch) ch.classList.remove("combo-ready","combo-hot");
}

function checkComboTimeout(){
    if(comboActive && comboTimer && performance.now()>comboTimer){
        resetCombo();
        updateHUD();
    }
}

function stepCombo(){
    combo=Math.min(combo+1,MAX_COMBO);
    comboActive=true;
    comboTimer=performance.now()+COMBO_WINDOW;
    bestCombo=Math.max(bestCombo,displayCombo());
    const ch=document.querySelector(".combo-hud");
    if(ch){
        ch.classList.add("combo-ready");
        if(combo>=5) ch.classList.add("combo-hot");
    }
    if(combo>=3) showComboFlash(displayCombo());
}

canvas.addEventListener("click",e=>{
    if(!gameRunning || paused) return;
    const r=canvas.getBoundingClientRect();
    const mx=e.clientX-r.left, my=e.clientY-r.top;
    let hit=false;
    shots++;

    for(let i=targets.length-1;i>=0;i--){
        const t=targets[i];
        if(Math.hypot(mx-t.x,my-t.y)<t.radius+6){
            hit=true; hits++;
            crossKick=1;
            createExplosion(t.x,t.y,COLS[t.type].main);
            createRingBurst(t.x,t.y,COLS[t.type].main);
            playShot(t.type); triggerRecoil();

            if(t.type==="green"){
                enemiesHit++;
                stepCombo();
                const pts=10*displayCombo(); score+=pts;
                spawnFloatingText(t.x,t.y-t.radius,`+${pts}${displayCombo()>1?` ×${displayCombo()}`:""}`, "#00ff88");

            } else if(t.type==="red"){
                civiliansHit++;
                score=Math.max(0,score-20); lives--;
                resetCombo();
                spawnFloatingText(t.x,t.y-t.radius,`-20 ✕`,"#ff3366");
                shakeCanvas();

            } else if(t.type==="blue"){
                if(comboActive) comboTimer=performance.now()+COMBO_WINDOW;
                score+=5; countdown+=5;
                spawnFloatingText(t.x,t.y-t.radius,"+5s ⏱","#00d9ff");
                if(countdown>10){
                    
                    document.getElementById("time").style.color="";
                    document.getElementById("time").style.textShadow="";
                }

            } else if(t.type==="orange"){
                enemiesHit++;
                stepCombo();
                const pts=50*displayCombo(); score+=pts;
                spawnFloatingText(t.x,t.y-t.radius,`+${pts} ELITE`,"#ff9900");

            } else if(t.type==="ice"){
                if(comboActive) comboTimer=performance.now()+COMBO_WINDOW;
                activateFreeze();
            }

            targets.splice(i,1);
            const nl=Math.floor(score/PTS_PER_LEVEL)+1;
            if(nl>level) showLevelUp(nl);
            level=nl;
            updateHUD(); updateProgressBar();
            if(lives<=0){ endGame(); return; }
            return;
        }
    }

    if(!hit){
        misses++;
        resetCombo();
        playShot("miss"); triggerRecoil();
        crossKick=1;
        document.getElementById("combo").textContent=`×${displayCombo()}`;
        createExplosion(mx,my,"#334455",5);
        spawnFloatingText(mx,my-12,"MISS","#667788");
    }
});

function shakeCanvas(){ shakeMag=8; }
function applyShake(){
    if(shakeMag<=0) return;
    ctx.translate((Math.random()-.5)*shakeMag,(Math.random()-.5)*shakeMag);
    shakeMag*=.7; if(shakeMag<.5) shakeMag=0;
}

function showLevelUp(n){
    const b=document.getElementById("levelUpBanner");
    b.textContent=`LEVEL ${n}`;
    b.classList.remove("hidden","show"); void b.offsetWidth; b.classList.add("show");
    levelFlash=.9;
    createRingBurst(canvas.width/2, canvas.height/2, "#ff9900");
    createExplosion(canvas.width/2, canvas.height/2, "#ff9900", 34);

    setTimeout(()=>b.classList.add("hidden"),1400);
}

function updateHUD(){
    if(comboActive && performance.now()>comboTimer) resetCombo();
    const ch=document.querySelector(".combo-hud");
    if(ch && !comboActive) ch.classList.remove("combo-ready","combo-hot");

    document.getElementById("score").textContent = score;
    document.getElementById("lives").textContent = "❤️".repeat(Math.max(0,lives));
    document.getElementById("level").textContent = level;
    document.getElementById("combo").textContent = `×${displayCombo()}`;
    document.getElementById("time").textContent  = countdown;
}

let menuTargets=[], menuTime=0, menuRafId=null;

function initMenuTargets(){
    menuTargets=[];
    ["green","red","blue","orange","ice","green","red","orange"].forEach((type,idx)=>{
        const spd=0.5+Math.random()*0.7;
        menuTargets.push({
            x:80+Math.random()*(canvas.width-160),
            y:80+Math.random()*(canvas.height-160),
            dx:(Math.random()-.5)*spd, dy:(Math.random()-.5)*spd,
            radius:type==="orange"?13:type==="ice"?18:type==="green"?20:type==="blue"?16:26,
            type, angle:Math.random()*Math.PI*2,
            rotSpeed:(Math.random()-.5)*.012,
            pulsePhase:Math.random()*Math.PI*2, spawnTime:0
        });
    });
}

function menuLoop(){
    menuTime++;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const bg=ctx.createRadialGradient(canvas.width/2,canvas.height/2,0,canvas.width/2,canvas.height/2,canvas.width*.75);
    bg.addColorStop(0,"#0a0d16"); bg.addColorStop(.6,"#050810"); bg.addColorStop(1,"#020308");
    ctx.fillStyle=bg; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.save(); ctx.strokeStyle="rgba(0,80,130,.09)"; ctx.lineWidth=.5;
    const gs=50, oy=(menuTime*.15)%gs;
    for(let y=-gs+oy;y<canvas.height+gs;y+=gs){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();}
    for(let x=0;x<canvas.width+gs;x+=gs){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke();}
    ctx.restore();
    ctx.save(); ctx.globalAlpha=0.28;
    const gt=gameTime; gameTime=menuTime;
    menuTargets.forEach(t=>{
        t.x+=t.dx; t.y+=t.dy; t.angle+=t.rotSpeed;
        if(t.x<t.radius){t.x=t.radius;t.dx*=-1;}
        if(t.x>canvas.width-t.radius){t.x=canvas.width-t.radius;t.dx*=-1;}
        if(t.y<t.radius){t.y=t.radius;t.dy*=-1;}
        if(t.y>canvas.height-t.radius){t.y=canvas.height-t.radius;t.dy*=-1;}
        drawTarget(t);
    });
    gameTime=gt;
    ctx.restore();
    menuRafId=requestAnimationFrame(menuLoop);
}

function drawEnergyGrid(){
    const speed = .25 + level*.035;
    const shift = (bgOffset*speed)%40;

    ctx.save();
    ctx.globalAlpha=.20;
    ctx.strokeStyle="rgba(0,217,255,.14)";
    ctx.lineWidth=1;

    for(let x=-40+shift;x<canvas.width;x+=40){
        ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke();
    }
    for(let y=-40+shift;y<canvas.height;y+=40){
        ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke();
    }

    
    ctx.globalAlpha=.18;
    ctx.strokeStyle="rgba(255,210,74,.25)";
    const sx=(bgOffset*2.1)%(canvas.width+260)-260;
    ctx.beginPath();
    ctx.moveTo(sx,0);
    ctx.lineTo(sx+260,canvas.height);
    ctx.stroke();

    if(levelFlash>0){
        ctx.globalAlpha=levelFlash*.20;
        ctx.fillStyle="#ff9900";
        ctx.fillRect(0,0,canvas.width,canvas.height);
        levelFlash=Math.max(0,levelFlash-.025);
    }

    ctx.restore();
}

function setPaused(state){
    if(!gameRunning) return;

    paused=state;
    const ps=document.getElementById("pauseScreen");
    if(ps) ps.classList.toggle("hidden", !paused);

    if(!paused){
        const now=performance.now();
        lastTick=now;
        lastFrame=now;
    }
}

function togglePause(){
    if(!gameRunning) return;
    setPaused(!paused);
}

document.addEventListener("keydown",e=>{
    const tag=(e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
    if(tag==="input" || tag==="textarea") return;

    if(e.code==="Space"){
        e.preventDefault();
        togglePause();
    }
});

function loop(now){
    if(!gameRunning) return;
    if(paused){ requestAnimationFrame(loop); return; }

    
    const dt = Math.min(lastFrame ? now-lastFrame : 16, 50);
    lastFrame = now;
    gameTime++; bgOffset += 0.4 * (dt/16.67);
    checkComboTimeout();
    if(crossKick>0) crossKick=Math.max(0,crossKick-dt/130);
    if(comboActive && now>comboTimer){
        resetCombo();
        updateHUD();
    }

    
    if(frozen && now >= freezeEnd) deactivateFreeze();

    
    if(!frozen){
        if(lastTick === 0) lastTick = now;
        if(now - lastTick >= 1000){
            lastTick += 1000;   
            countdown--;
            document.getElementById("time").textContent = countdown;
            if(countdown <= 10){
                document.getElementById("time").style.color="#ff3366";
                document.getElementById("time").style.textShadow="0 0 12px #ff3366";
                
                if(countdown > 0) playCountdownBeep(countdown);
                const timeEl=document.getElementById("time");
                timeEl.classList.remove("timer-pulse"); void timeEl.offsetWidth;
                timeEl.classList.add("timer-pulse");
            }
            if(countdown <= 0){ endGame(); return; }
        }
    } else {
        
        lastTick = now;
    }

    
    if(!frozen){
const spawnInterval = Math.max(285, 1220 - level*88);
        spawnAccum += dt;

        if(spawnAccum >= spawnInterval){
            spawnAccum = 0;
            const maxT = Math.min(22, MAX_TARGETS + Math.floor(level*1.28));
            if(targets.length < maxT) targets.push(createTarget());
        }
    }

    
    if(!targets.some(t=>t.type==="green")) targets.push(createTarget("green"));
const maxT = Math.min(22, MAX_TARGETS + Math.floor(level*1.28));
    const minRed = Math.min(7, 1 + Math.floor(level/2.6));
    const redCount = targets.filter(t=>t.type==="red").length;

    if(!frozen && redCount<minRed && targets.length<maxT){
        targets.push(createTarget("red"));
    }

    
    if(level>=2 && !targets.some(t=>t.type==="blue") && Math.random()<0.010 && targets.length<maxT){
        targets.push(createTarget("blue"));
    }
    if(level>=2 && !targets.some(t=>t.type==="orange") && Math.random()<0.014 && targets.length<maxT){
        targets.push(createTarget("orange"));
    }
    if(level>=3 && !targets.some(t=>t.type==="ice") && Math.random()<0.005 && targets.length<maxT){
        targets.push(createTarget("ice"));
    }

    
    if(!frozen){
        const now2 = performance.now();
        for(let i=targets.length-1; i>=0; i--){
            const t = targets[i];
            const age = now2 - t.spawnTime;
            const lifespan = TARGET_LIFESPAN - level*200; 
            const effective = Math.max(lifespan, 1200);
            if(age > effective){
                
                if(t.type==="green"){
                    misses++;
                    resetCombo();
                    document.getElementById("combo").textContent=`×${displayCombo()}`;
                    spawnFloatingText(t.x, t.y, "MISSED!", "#ff3366");
                    createExplosion(t.x, t.y, "#ff3366", 6);
                }
                targets.splice(i,1);
            }
        }
    }

    updateHUD();

    
    decayTrail();
    drawEnergyGrid();
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.save(); applyShake();

    updateRadar();
    drawBackground();

    ctx.save(); ctx.globalCompositeOperation="lighter"; ctx.globalAlpha=.55;
    ctx.drawImage(trailCv,0,0);
    ctx.globalAlpha=1; ctx.globalCompositeOperation="source-over"; ctx.restore();

    drawParticles();

    targets.forEach(t=>{
        if(!frozen){
            const spd = dt/16.67;  
            t.x+=t.dx*spd; t.y+=t.dy*spd; t.angle+=t.rotSpeed*spd;
            if(t.x<t.radius)               {t.x=t.radius;              t.dx*=-1;}
            if(t.x>canvas.width-t.radius)  {t.x=canvas.width-t.radius; t.dx*=-1;}
            if(t.y<t.radius)               {t.y=t.radius;              t.dy*=-1;}
            if(t.y>canvas.height-t.radius) {t.y=canvas.height-t.radius;t.dy*=-1;}
        }
        
        if(!frozen){
            const now2=performance.now();
            const age=now2-t.spawnTime;
            const effective=Math.max(TARGET_LIFESPAN-level*200,1200);
            const pct=age/effective;
            if(pct>0.75 && t.type==="green"){
                const flash=Math.sin(now2*0.018)*0.5+0.5;
                ctx.save();
                ctx.globalAlpha=flash*0.55;
                ctx.strokeStyle="#ff3366"; ctx.lineWidth=2;
                ctx.setLineDash([4,4]);
                ctx.beginPath(); ctx.arc(t.x,t.y,t.radius+6,0,Math.PI*2); ctx.stroke();
                ctx.setLineDash([]); ctx.restore();
            }
        }
        paintGhost(t);
        drawTarget(t);
    });

    drawFloatingTexts();
    drawRadar();
    updateRecoil();
    drawCrosshair();
    ctx.restore();

    requestAnimationFrame(loop);
}

function getRankNote(rankName){
    if(rankName==="ELITE") return "Elite performance: fast reactions, high accuracy, and strong target control.";
    if(rankName==="HUNTER") return "Hunter rank: solid score with good control under increasing difficulty.";
    if(rankName==="AGENT") return "Agent rank: good survival and basic consistency. Push for higher accuracy.";
    return "Rookie rank: keep practicing target priority, accuracy, and avoiding civilians.";
}

function endGame(){
    gameRunning=false;
    paused=false;
    document.body.classList.remove("in-game");
    const ps=document.getElementById("pauseScreen");
    if(ps) ps.classList.add("hidden");
    let scores=JSON.parse(localStorage.getItem("th_v9")||"[]");
    const prevBest=scores.length>0?scores[0].score:0;
    const isHigh=score>prevBest && score>0;
    const accuracy = shots>0 ? Math.round((hits/shots)*100) : 0;
    scores.push({name:nickname,score,lvl:level,combo:bestCombo,acc:accuracy});
    scores.sort((a,b)=>b.score-a.score);
    localStorage.setItem("th_v9",JSON.stringify(scores.slice(0,5)));

    const msg=document.getElementById("endMsg");
    const panel=document.querySelector(".go-panel");
    if(isHigh){
        msg.textContent="NEW HIGH SCORE!"; msg.style.color="#ff9900"; msg.style.textShadow="0 0 30px #ff9900,0 0 60px rgba(255,153,0,.5)";
        document.getElementById("hsBadge").classList.remove("hidden");
        panel.classList.add("new-high");
        playHighScoreFanfare();
    } else {
        const reason = lives<=0 ? "ELIMINATED" : "TIME'S UP";
        msg.textContent=reason; msg.style.color="var(--blue)"; msg.style.textShadow="0 0 20px #00d9ff";
        document.getElementById("hsBadge").classList.add("hidden");
        panel.classList.remove("new-high");
    }

    const rank = scores.findIndex(s=>s.name===nickname&&s.score===score)+1;
    const rankName = score>=3500 ? "ELITE" : score>=2200 ? "HUNTER" : score>=1200 ? "AGENT" : "ROOKIE";
    document.getElementById("finalStats").innerHTML=`
        <div class="stat-block"><div class="stat-val">${score}</div><div class="stat-label">SCORE</div></div>
        <div class="stat-block"><div class="stat-val">${level}</div><div class="stat-label">LEVEL</div></div>
        <div class="stat-block"><div class="stat-val">${accuracy}%</div><div class="stat-label">ACCURACY</div></div>
        <div class="stat-block"><div class="stat-val">${bestCombo}×</div><div class="stat-label">BEST COMBO</div></div>
        <div class="stat-block"><div class="stat-val">${enemiesHit}</div><div class="stat-label">TARGETS HIT</div></div>
        <div class="stat-block"><div class="stat-val">${misses}</div><div class="stat-label">MISSES</div></div>
        <div class="stat-block"><div class="stat-val">${civiliansHit}</div><div class="stat-label">CIVILIANS</div></div>
        <div class="stat-block"><div class="stat-val" style="color:var(--blue)">${rankName}</div><div class="stat-label">RANK</div></div>
        <div class="rank-note"><b>${rankName}</b> — ${getRankNote(rankName)}</div>
    `;
    document.getElementById("leaderboardList").innerHTML=
        "<h3>◈ LEADERBOARD ◈</h3>"+
        scores.slice(0,5).map((s,i)=>{
            const me=s.name===nickname&&s.score===score;
            return `<div class="lb-row${me?" me":""}"><span>${i===0?"🥇":i===1?"🥈":i===2?"🥉":(i+1)+"."} ${s.name} <small style="opacity:.35">(Lv${s.lvl})</small></span><strong>${s.score}</strong></div>`;
        }).join("");

    document.getElementById("gameOverScreen").classList.remove("hidden");
}

document.getElementById("startBtn").onclick=()=>{
    if(menuRafId){ cancelAnimationFrame(menuRafId); menuRafId=null; }

    nickname=document.getElementById("nicknameInput").value.trim()||"GHOST";
    document.getElementById("displayName").textContent=nickname;

    score=0; lives=3; level=1; countdown=60;
    gameTime=0; targets=[]; particles=[]; floatingTexts=[];
    combo=0; bestCombo=1; comboActive=false; comboTimer=0;
    shots=0; hits=0; misses=0; civiliansHit=0; enemiesHit=0; startStamp=performance.now();
    crossKick=0;
    levelFlash=0;
    shakeMag=0;
    radarAngle=0; radarBlips=[];
    frozen=false; freezeEnd=0;
    rX=0; rY=0; rVX=0; rVY=0;

    trailCtx.clearRect(0,0,canvas.width,canvas.height);
    document.getElementById("freezeOverlay").classList.add("hidden");
    
    document.getElementById("time").style.color="";
    document.getElementById("time").style.textShadow="";
    document.getElementById("startScreen").classList.add("hidden");
    document.body.classList.add("in-game");
    paused=false;
    const ps=document.getElementById("pauseScreen");
    if(ps) ps.classList.add("hidden");

    lastTick=0; lastFrame=0; spawnAccum=0; freezeEnd=0;
    updateHUD(); updateProgressBar();
    gameRunning=true; mOnCanvas=true;
    requestAnimationFrame(loop);
};

document.getElementById("restartBtn").onclick=()=>location.reload();

initMenuTargets();
menuLoop();

(function(){
    try{
        const scores=JSON.parse(localStorage.getItem("th_v9")||"[]");
        const el=document.getElementById("bestScoreDisplay");
        if(scores.length>0&&el){
            el.innerHTML=`🏆 &nbsp;BEST: <span style="color:var(--orange)">${scores[0].score} pts</span> &nbsp;— ${scores[0].name}`;
        }
    }catch(e){}
})();
