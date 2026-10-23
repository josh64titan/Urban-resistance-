(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const $ = id => document.getElementById(id);
  let mode = "world", running = false, autoFire = false, aimAssist = true;
  let keys = {}, player, enemies = [], bullets = [], coins = 0, wave = 1;
  let lastShot = 0, lastSpawn = 0, health = 100;
  const mouse = { x: 650, y: 270 };
  const rand = (a,b) => Math.random()*(b-a)+a;

  function start(selected) {
    mode = selected; running = true;
    coins = 0; wave = 1; health = 100;
    player = {x:450,y:270,speed:3,angle:0};
    enemies = []; bullets = [];
    $("menu").classList.add("hidden");
    $("gamePanel").classList.remove("hidden");
    $("modeLabel").textContent = mode === "world" ? "OPEN WORLD" : "ZOMBIE WAVES";
    $("message").textContent = mode === "world"
      ? "Explore the city. WASD or arrow keys to move."
      : "Survive the waves. Aim and click to shoot. Defeated zombies earn coins.";
    if (mode === "zombies") spawnWave();
    requestAnimationFrame(loop);
  }

  function spawnWave() {
    for (let i=0; i<Math.min(3+wave*2,24); i++) {
      const side=Math.floor(rand(0,4));
      enemies.push({
        x:side===0?15:side===1?885:rand(15,885),
        y:side===2?15:side===3?525:rand(15,525),
        hp:2,speed:rand(.45,.8)+wave*.035
      });
    }
    lastSpawn=performance.now();
  }

  function shoot() {
    if (!running || performance.now()-lastShot<220) return;
    lastShot=performance.now();
    let angle=Math.atan2(mouse.y-player.y,mouse.x-player.x);
    if (aimAssist && enemies.length) {
      const nearest=enemies.reduce((a,b)=>
        Math.hypot(a.x-player.x,a.y-player.y)<
        Math.hypot(b.x-player.x,b.y-player.y)?a:b);
      if(Math.hypot(nearest.x-player.x,nearest.y-player.y)<230)
        angle=Math.atan2(nearest.y-player.y,nearest.x-player.x);
    }
    bullets.push({x:player.x,y:player.y,vx:Math.cos(angle)*8,
      vy:Math.sin(angle)*8,life:65});
  }

  function loop(now) {
    if(!running)return;
    update(now);draw();requestAnimationFrame(loop);
  }

  function update(now) {
    const dx=(keys.d||keys.ArrowRight?1:0)-(keys.a||keys.ArrowLeft?1:0);
    const dy=(keys.s||keys.ArrowDown?1:0)-(keys.w||keys.ArrowUp?1:0);
    const len=Math.hypot(dx,dy)||1;
    player.x=Math.max(12,Math.min(888,player.x+dx/len*player.speed));
    player.y=Math.max(12,Math.min(528,player.y+dy/len*player.speed));
    player.angle=Math.atan2(mouse.y-player.y,mouse.x-player.x);
    if(autoFire&&enemies.length)shoot();

    bullets.forEach(b=>{b.x+=b.vx;b.y+=b.vy;b.life--;});
    bullets=bullets.filter(b=>b.life>0&&b.x>0&&b.x<900&&b.y>0&&b.y<540);

    enemies.forEach(e=>{
      const a=Math.atan2(player.y-e.y,player.x-e.x);
      e.x+=Math.cos(a)*e.speed;e.y+=Math.sin(a)*e.speed;
      if(Math.hypot(player.x-e.x,player.y-e.y)<20&&now%12<1)
        health=Math.max(0,health-1);
    });

    for(const b of bullets) {
      for(const e of enemies) {
        if(e.hp>0&&Math.hypot(b.x-e.x,b.y-e.y)<17) {
          e.hp--;b.life=0;if(e.hp<=0)coins+=10;break;
        }
      }
    }
    enemies=enemies.filter(e=>e.hp>0);
    if(mode==="zombies"&&enemies.length===0&&now-lastSpawn>900) {
      wave++;spawnWave();
    }
    $("health").textContent=health;
    $("coins").textContent=coins;
    $("wave").textContent=mode==="world"?"—":wave;
    if(health<=0) {
      running=false;
      $("message").textContent="Mission failed. Return to menu to try again.";
    }
  }

  function draw() {
    ctx.fillStyle="#263331";ctx.fillRect(0,0,900,540);
    ctx.strokeStyle="#35433f";
    for(let x=0;x<900;x+=45)for(let y=0;y<540;y+=45)ctx.strokeRect(x,y,45,45);
    ctx.fillStyle="#394447";
    [[65,70,120,75],[260,55,145,95],[600,65,180,80],
     [90,350,145,110],[340,365,150,95],[650,340,130,120]]
      .forEach(r=>ctx.fillRect(...r));
    ctx.fillStyle="#ffd166";
    bullets.forEach(b=>{ctx.beginPath();ctx.arc(b.x,b.y,4,0,Math.PI*2);ctx.fill();});
    enemies.forEach(e=>{
      ctx.fillStyle="#85b96a";ctx.beginPath();ctx.arc(e.x,e.y,12,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#182018";ctx.fillRect(e.x-5,e.y-3,3,3);ctx.fillRect(e.x+3,e.y-3,3,3);
    });
    ctx.save();ctx.translate(player.x,player.y);ctx.rotate(player.angle);
    ctx.fillStyle="#64b5f6";ctx.fillRect(-10,-10,20,20);
    ctx.fillStyle="#eaf5ff";ctx.fillRect(2,-3,18,6);ctx.restore();
    ctx.fillStyle="#e6edf3";ctx.font="14px system-ui";
    ctx.fillText(mode==="world"?"CITY EXPLORATION":"SURVIVAL ZONE",16,24);
  }

  $("openWorld").onclick=()=>start("world");
  $("zombieMode").onclick=()=>start("zombies");
  $("backButton").onclick=()=>{
    running=false;$("gamePanel").classList.add("hidden");$("menu").classList.remove("hidden");
  };
  $("fireToggle").onclick=()=>{
    autoFire=!autoFire;$("fireToggle").textContent="AUTO FIRE: "+(autoFire?"ON":"OFF");
  };
  $("aimToggle").onclick=()=>{
    aimAssist=!aimAssist;$("aimToggle").textContent="AIM ASSIST: "+(aimAssist?"ON":"OFF");
  };
  document.addEventListener("keydown",e=>{
    if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key))e.preventDefault();
    keys[e.key.length===1?e.key.toLowerCase():e.key]=true;
    if(e.key===" "&&running)shoot();
  });
  document.addEventListener("keyup",e=>{
    keys[e.key.length===1?e.key.toLowerCase():e.key]=false;
  });
  canvas.addEventListener("mousemove",e=>{
    const r=canvas.getBoundingClientRect();
    mouse.x=(e.clientX-r.left)*canvas.width/r.width;
    mouse.y=(e.clientY-r.top)*canvas.height/r.height;
  });
  canvas.addEventListener("click",shoot);
})();
