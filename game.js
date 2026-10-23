cat > game.js <<'EOF'
(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const $ = id => document.getElementById(id);

  const cameras = ["third", "first", "overhead", "shoulder"];
  const cameraNames = {
    third: "THIRD-PERSON",
    first: "FIRST-PERSON",
    overhead: "TOP-DOWN",
    shoulder: "SHOULDER VIEW"
  };

  let mode = "world";
  let running = false;
  let autoFire = false;
  let aimAssist = true;
  let driveStyle = "realistic";
  let camera = "third";
  let pendingMode = "world";
  let keys = {};
  let player, enemies = [], bullets = [];
  let coins = 0, wave = 1, health = 100;
  let lastShot = 0, lastSpawn = 0, lastDamage = 0;
  let animationId = 0;
  let lastTime = 0;

  const WORLD_W = 3000;
  const WORLD_H = 2200;
  const mouse = { x: 650, y: 270 };
  const rand = (a,b) => Math.random() * (b-a) + a;

  // Generate a repeatable grid of city blocks and streets.
  const buildings = [];
  for (let x = 180; x < WORLD_W - 100; x += 300) {
    for (let y = 180; y < WORLD_H - 100; y += 300) {
      buildings.push({
        x: x + 25, y: y + 25,
        w: 155 + ((x+y) % 50), h: 145 + ((x*3+y) % 55)
      });
    }
  }

  function chooseMode(selected) {
    pendingMode = selected;
    $("menu").classList.add("hidden");
    $("gamePanel").classList.add("hidden");
    $("cameraSetup").classList.remove("hidden");

    let saved = null;
    try { saved = localStorage.getItem("ur-camera"); } catch {}
    camera = cameras.includes(saved) ? saved : "third";
    updateCameraUI();

    $("startGame").textContent =
      "START " + selected.toUpperCase().replace("ZOMBIES", "ZOMBIE WAVES") + " OPERATION";
  }

  function startGame() {
    mode = pendingMode;
    running = true;
    coins = 0;
    wave = 1;
    health = 100;
    enemies = [];
    bullets = [];
    lastTime = 0;

    player = {
      x: WORLD_W / 2,
      y: WORLD_H / 2,
      angle: 0,
      speed: 0,
      footSpeed: 190,
      radius: 13
    };

    $("cameraSetup").classList.add("hidden");
    $("gamePanel").classList.remove("hidden");
    $("modeLabel").textContent =
      mode === "world" ? "OPEN WORLD" :
      mode === "driving" ? "DRIVING" : "ZOMBIE WAVES";

    $("message").textContent = mode === "world"
      ? "Explore the city. Buildings block your path."
      : mode === "driving"
      ? "W/S accelerate and reverse. A/D steer. Switch driving style below."
      : "Survive the waves. Click or press Space to shoot.";

    updateCameraUI();
    if (mode === "zombies") spawnWave();

    cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(loop);
  }

  function updateCameraUI() {
    $("cameraButton").textContent =
      "CAMERA: " + cameraNames[camera] + " [C]";

    document.querySelectorAll("[data-camera]").forEach(button => {
      button.classList.toggle("selected", button.dataset.camera === camera);
    });

    $("driveStyle").textContent =
      "DRIVING: " + driveStyle.toUpperCase();
  }

  function cycleCamera() {
    camera = cameras[(cameras.indexOf(camera) + 1) % cameras.length];
    try { localStorage.setItem("ur-camera", camera); } catch {}
    updateCameraUI();
  }

  function spawnWave() {
    const count = Math.min(4 + wave * 2, 32);
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      enemies.push({
        x: player.x + Math.cos(a) * rand(320, 480),
        y: player.y + Math.sin(a) * rand(320, 480),
        hp: 2,
        speed: rand(38, 65) + wave * 3
      });
    }
    lastSpawn = performance.now();
  }

  function shoot() {
    if (!running || mode !== "zombies" ||
        performance.now() - lastShot < 220) return;

    lastShot = performance.now();
    let angle = Math.atan2(mouse.y - canvas.height/2,
                           mouse.x - canvas.width/2);

    if (aimAssist && enemies.length) {
      let nearest = null;
      let nearestDistance = Infinity;
      for (const e of enemies) {
        const d = Math.hypot(e.x-player.x, e.y-player.y);
        if (d < nearestDistance) {
          nearestDistance = d;
          nearest = e;
        }
      }
      if (nearest && nearestDistance < 320) {
        angle = Math.atan2(nearest.y-player.y, nearest.x-player.x);
      }
    }

    bullets.push({
      x: player.x, y: player.y,
      vx: Math.cos(angle) * 560,
      vy: Math.sin(angle) * 560,
      life: 1.4
    });
  }

  function blocked(x, y) {
    const r = player.radius;
    return buildings.some(b =>
      x+r > b.x && x-r < b.x+b.w &&
      y+r > b.y && y-r < b.y+b.h
    );
  }

  function movePlayer(dx, dy) {
    const nx = Math.max(20, Math.min(WORLD_W-20, player.x+dx));
    const ny = Math.max(20, Math.min(WORLD_H-20, player.y+dy));

    // Axis-separated movement allows sliding along building walls.
    if (!blocked(nx, player.y)) player.x = nx;
    if (!blocked(player.x, ny)) player.y = ny;
  }

  function update(dt, now) {
    if (mode === "driving") {
      const acceleration = driveStyle === "realistic" ? 145 : 300;
      const maxSpeed = driveStyle === "realistic" ? 260 : 420;
      const friction = driveStyle === "realistic" ? 0.94 : 0.985;

      if (keys.w || keys.ArrowUp)
        player.speed = Math.min(maxSpeed, player.speed + acceleration*dt);
      else if (keys.s || keys.ArrowDown)
        player.speed = Math.max(-maxSpeed*0.45, player.speed - acceleration*dt);
      else
        player.speed *= Math.pow(friction, dt*60);

      const steering = (keys.d || keys.ArrowRight ? 1 : 0) -
                       (keys.a || keys.ArrowLeft ? 1 : 0);
      const steeringFactor = driveStyle === "realistic" ? 1.5 : 2.5;
      player.angle += steering * steeringFactor * dt *
                      Math.min(1, Math.abs(player.speed)/75);

      const oldX = player.x, oldY = player.y;
      movePlayer(Math.cos(player.angle)*player.speed*dt,
                 Math.sin(player.angle)*player.speed*dt);
      if (player.x === oldX && player.y === oldY) player.speed *= -0.2;
    } else {
      let dx = (keys.d || keys.ArrowRight ? 1 : 0) -
               (keys.a || keys.ArrowLeft ? 1 : 0);
      let dy = (keys.s || keys.ArrowDown ? 1 : 0) -
               (keys.w || keys.ArrowUp ? 1 : 0);
      const length = Math.hypot(dx, dy) || 1;
      movePlayer(dx/length * player.footSpeed*dt,
                 dy/length * player.footSpeed*dt);

      if (mode === "zombies") {
        player.angle = Math.atan2(mouse.y-canvas.height/2,
                                  mouse.x-canvas.width/2);
        if (autoFire && enemies.length) shoot();
      }
    }

    for (const b of bullets) {
      b.x += b.vx*dt;
      b.y += b.vy*dt;
      b.life -= dt;
    }
    bullets = bullets.filter(b => b.life > 0);

    for (const e of enemies) {
      const a = Math.atan2(player.y-e.y, player.x-e.x);
      const d = Math.hypot(player.x-e.x, player.y-e.y);
      if (d > 22) {
        e.x += Math.cos(a)*e.speed*dt;
        e.y += Math.sin(a)*e.speed*dt;
      }
      if (d < 25 && now-lastDamage > 450) {
        health = Math.max(0, health-5);
        lastDamage = now;
      }
    }

    for (const b of bullets) {
      for (const e of enemies) {
        if (e.hp > 0 && Math.hypot(b.x-e.x,b.y-e.y) < 18) {
          e.hp--;
          b.life = 0;
          if (e.hp <= 0) coins += 10;
          break;
        }
      }
    }

    enemies = enemies.filter(e => e.hp > 0);

    if (mode === "zombies" && enemies.length === 0 &&
        now-lastSpawn > 900) {
      wave++;
      spawnWave();
    }

    $("health").textContent = health;
    $("coins").textContent = coins;
    $("wave").textContent = mode === "zombies" ? wave : "—";

    if (health <= 0) {
      running = false;
      $("message").textContent = "Mission failed. Return to the menu to try again.";
    }
  }

  function cameraPosition() {
    // Each camera is a different 2D presentation of the world.
    if (camera === "overhead") {
      return { x: player.x-canvas.width/2, y: player.y-canvas.height/2, zoom: 0.8 };
    }
    if (camera === "first") {
      return { x: player.x-canvas.width/2, y: player.y-canvas.height/2, zoom: 1.25 };
    }
    if (camera === "shoulder") {
      return {
        x: player.x-canvas.width/2-Math.cos(player.angle)*55,
        y: player.y-canvas.height/2-Math.sin(player.angle)*55,
        zoom: 1.05
      };
    }
    return {
      x: player.x-canvas.width/2-Math.cos(player.angle)*25,
      y: player.y-canvas.height/2-Math.sin(player.angle)*25,
      zoom: 1
    };
  }

  function draw() {
    ctx.fillStyle = "#25332f";
    ctx.fillRect(0,0,canvas.width,canvas.height);

    const cam = cameraPosition();
    ctx.save();
    ctx.translate(canvas.width/2,canvas.height/2);
    ctx.scale(cam.zoom,cam.zoom);
    ctx.translate(-canvas.width/2,-canvas.height/2);

    // Roads and pavement.
    ctx.fillStyle = "#343b40";
    for (let x = -100; x < WORLD_W; x += 300)
      ctx.fillRect(x-cam.x, -cam.y, 70, WORLD_H);
    for (let y = -100; y < WORLD_H; y += 300)
      ctx.fillRect(-cam.x, y-cam.y, WORLD_W, 70);

    // Road lane markings.
    ctx.strokeStyle = "#b8b7a0";
    ctx.lineWidth = 2;
    ctx.setLineDash([18,18]);
    for (let x = -100; x < WORLD_W; x += 300) {
      ctx.beginPath();
      ctx.moveTo(x+35-cam.x, -cam.y);
      ctx.lineTo(x+35-cam.x, WORLD_H-cam.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Buildings with simple shadows.
    for (const b of buildings) {
      const x = b.x-cam.x, y = b.y-cam.y;
      if (x > canvas.width+100 || y > canvas.height+100 ||
          x+b.w < -100 || y+b.h < -100) continue;

      ctx.fillStyle = "#101719";
      ctx.fillRect(x+8,y+9,b.w,b.h);
      ctx.fillStyle = "#596365";
      ctx.fillRect(x,y,b.w,b.h);
      ctx.fillStyle = "#414c50";
      ctx.fillRect(x+7,y+7,b.w-14,b.h-14);
      ctx.fillStyle = "#718080";
      ctx.fillRect(x+12,y+12,b.w-24,5);
    }

    // Zombies.
    for (const e of enemies) {
      ctx.fillStyle = "#8abf69";
      ctx.beginPath();
      ctx.arc(e.x-cam.x,e.y-cam.y,12,0,Math.PI*2);
      ctx.fill();
      ctx.fillStyle = "#1b2419";
      ctx.fillRect(e.x-cam.x-5,e.y-cam.y-3,3,3);
      ctx.fillRect(e.x-cam.x+3,e.y-cam.y-3,3,3);
    }

    // Projectiles.
    ctx.fillStyle = "#ffd166";
    for (const b of bullets) {
      ctx.beginPath();
      ctx.arc(b.x-cam.x,b.y-cam.y,4,0,Math.PI*2);
      ctx.fill();
    }

    // Player or vehicle.
    ctx.save();
    ctx.translate(player.x-cam.x,player.y-cam.y);
    ctx.rotate(player.angle);
    if (mode === "driving") {
      ctx.fillStyle = "#b83f35";
      ctx.fillRect(-23,-12,46,24);
      ctx.fillStyle = "#9bd5e7";
      ctx.fillRect(-10,-9,18,18);
      ctx.fillStyle = "#161b20";
      ctx.fillRect(-17,-15,10,4);
      ctx.fillRect(8,-15,10,4);
      ctx.fillRect(-17,11,10,4);
      ctx.fillRect(8,11,10,4);
    } else {
      ctx.fillStyle = "#64b5f6";
      ctx.fillRect(-10,-10,20,20);
      ctx.fillStyle = "#eaf5ff";
      ctx.fillRect(2,-3,18,6);
    }
    ctx.restore();
    ctx.restore();

    // Minimal first-person overlay to distinguish the perspective.
    if (camera === "first") {
      const gradient = ctx.createLinearGradient(0,0,0,canvas.height);
      gradient.addColorStop(0,"rgba(0,0,0,.24)");
      gradient.addColorStop(.5,"rgba(0,0,0,0)");
      gradient.addColorStop(1,"rgba(0,0,0,.35)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle = "#ffffff";
      ctx.font = "13px system-ui";
      ctx.fillText("FIRST-PERSON SIMULATION",16,22);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.font = "13px system-ui";
      ctx.fillText(cameraNames[camera],16,22);
    }
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min((now-lastTime)/1000 || 0, 0.04);
    lastTime = now;
    update(dt,now);
    draw();
    if (running) animationId = requestAnimationFrame(loop);
  }

  $("openWorld").onclick = () => chooseMode("world");
  $("drivingMode").onclick = () => chooseMode("driving");
  $("zombieMode").onclick = () => chooseMode("zombies");
  $("startGame").onclick = startGame;
  $("cameraButton").onclick = cycleCamera;

  document.querySelectorAll("[data-camera]").forEach(button => {
    button.onclick = () => {
      camera = button.dataset.camera;
      updateCameraUI();
    };
  });

  $("driveStyle").onclick = () => {
    driveStyle = driveStyle === "realistic" ? "arcade" : "realistic";
    updateCameraUI();
  };

  $("fireToggle").onclick = () => {
    autoFire = !autoFire;
    $("fireToggle").textContent = "AUTO FIRE: " + (autoFire ? "ON" : "OFF");
  };

  $("aimToggle").onclick = () => {
    aimAssist = !aimAssist;
    $("aimToggle").textContent = "AIM ASSIST: " + (aimAssist ? "ON" : "OFF");
  };

  $("backButton").onclick = () => {
    running = false;
    cancelAnimationFrame(animationId);
    $("gamePanel").classList.add("hidden");
    $("cameraSetup").classList.add("hidden");
    $("menu").classList.remove("hidden");
  };

  document.addEventListener("keydown", e => {
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key))
      e.preventDefault();

    const key = e.key.toLowerCase();
    if (key === "c" && running) {
      cycleCamera();
      return;
    }
    if (key === " " && running) shoot();
    keys[key.length === 1 ? key : e.key] = true;
  });

  document.addEventListener("keyup", e => {
    const key = e.key.toLowerCase();
    keys[key.length === 1 ? key : e.key] = false;
  });

  canvas.addEventListener("mousemove", e => {
    const r = canvas.getBoundingClientRect();
    mouse.x = (e.clientX-r.left)*canvas.width/r.width;
    mouse.y = (e.clientY-r.top)*canvas.height/r.height;
  });
  canvas.addEventListener("click", shoot);

  // First-launch camera selection. If storage is unavailable, use third-person.
  try {
    const saved = localStorage.getItem("ur-camera");
    if (cameras.includes(saved)) camera = saved;
  } catch {}

  updateCameraUI();
})();
EOF
