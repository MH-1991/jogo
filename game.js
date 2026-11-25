(() => {
      const canvas = document.getElementById("game");
      const ctx = canvas.getContext("2d");
      const W = canvas.width, H = canvas.height, WORLD = 5200, FLOOR = 454;
      const actions = [
        { id: "left", label: "Esquerda", keys: ["a", "4"] },
        { id: "right", label: "Direita", keys: ["d", "6"] },
        { id: "jump", label: "Pular", keys: ["w", "8"] },
        { id: "crouch", label: "Abaixar", keys: ["s", "2"] },
        { id: "fire", label: "Atirar", keys: ["j", " "] }
      ];
      const keysDown = new Set(), touchDown = new Set();
      const enemies = [], bullets = [], enemyBullets = [];
      const player = { x: 70, y: FLOOR - 48, w: 30, h: 48, vy: 0, facing: 1, onGround: true, invincible: 0 };
      let camera = 0, lives = 3, score = 0, level = 1, gameState = "playing", lastTime = 0, retreatSpawnTimer = 1.2;
      const platforms = [
        { x: 680, y: 380, w: 155 }, { x: 1210, y: 345, w: 170 },
        { x: 1900, y: 385, w: 190 }, { x: 2680, y: 350, w: 160 },
        { x: 3430, y: 380, w: 190 }, { x: 4200, y: 345, w: 175 }
      ];
      const hearts = platforms.map(platform => ({ x: platform.x + platform.w / 2 - 9, y: platform.y - 28, collected: false }));
      function populateEnemies() {
        enemies.length = 0;
        const count = 12 + level * 2;
        const spacing = (WORLD - 680) / (count - 1);
        for (let i = 0; i < count; i++) {
          const x = 420 + i * spacing;
          enemies.push({ x, y: FLOOR - 40, w: 28, h: 40, dir: Math.random() < .5 ? -1 : 1, alive: true, cooldown: Math.max(.4, 1.8 - level * .12) + Math.random() });
        }
      }
      populateEnemies();

      const controls = document.getElementById("key-controls");
      function keyName(key) {
        if (key === " ") return "ESPACO";
        if (key.length === 1) return key.toUpperCase();
        return key.toUpperCase();
      }
      function renderControls() {
        controls.replaceChildren();
        actions.forEach(action => {
          const item = document.createElement("div");
          item.className = "control";
          const label = document.createElement("span");
          label.textContent = action.label;
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = action.keys.map(keyName).join(" / ");
          button.setAttribute("aria-label", "Mudar a tecla para " + action.label);
          button.addEventListener("click", () => {
            document.querySelectorAll(".control button").forEach(el => el.classList.remove("listening"));
            button.classList.add("listening");
            document.getElementById("message").textContent = "Aperta una tecla para " + action.label.toLowerCase() + "… (Esc cancela)";
            waitingFor = action;
          });
          item.append(label, button);
          controls.append(item);
        });
      }
      let waitingFor = null;
      renderControls();

      function actionPressed(id) {
        const action = actions.find(item => item.id === id);
        return touchDown.has(id) || action.keys.some(key => keysDown.has(key));
      }
      function nightProgress() {
        return Math.max(0, Math.min(1, (player.x / (WORLD - 60) - .08) / .92));
      }
      function setMessage(text) { document.getElementById("message").textContent = text; }
      function updateHud() {
        document.getElementById("lives").textContent = lives ? Array(lives).fill("♥").join(" ") : "0";
        document.getElementById("score").textContent = score;
        document.querySelector("#progress strong").textContent = Math.min(100, Math.floor(player.x / (WORLD - 90) * 100)) + "%";
        document.getElementById("stage").textContent = "STAGE " + level + " · ZONA DE FRONTEIRA";
      }

      window.addEventListener("keydown", event => {
        const key = event.key.toLowerCase();
        if (waitingFor) {
          event.preventDefault();
          if (key === "escape") {
            waitingFor = null;
            renderControls();
            setMessage("Assinaçãon cancelada.");
            return;
          }
          waitingFor.keys = [key === "spacebar" ? " " : key];
          waitingFor = null;
          renderControls();
          setMessage("Tecla assinada. Segue avanzando!");
          return;
        }
        if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) event.preventDefault();
        keysDown.add(key === "spacebar" ? " " : key);
        if (gameState !== "playing" && key === "enter") gameState === "won" ? nextStage() : restart();
      });
      window.addEventListener("keyup", event => keysDown.delete(event.key.toLowerCase() === "spacebar" ? " " : event.key.toLowerCase()));
      window.addEventListener("blur", () => { keysDown.clear(); touchDown.clear(); });
      document.querySelectorAll(".screen-button").forEach(button => {
        const action = button.dataset.action;
        button.addEventListener("pointerdown", event => {
          event.preventDefault();
          button.setPointerCapture(event.pointerId);
          touchDown.add(action);
        });
        ["pointerup", "pointercancel", "lostpointercapture"].forEach(name => button.addEventListener(name, () => touchDown.delete(action)));
      });

      function shoot() {
        const height = actionPressed("crouch") ? 21 : 31;
        bullets.push({ x: player.x + (player.facing > 0 ? player.w : -7), y: player.y + height, vx: player.facing * 620, life: 1.5 });
      }
      let fireTimer = 0;
      function hurtPlayer() {
        if (player.invincible > 0 || gameState !== "playing") return;
        lives--;
        player.invincible = 1.6;
        player.vy = -260;
        if (lives <= 0) {
          gameState = "lost";
          setMessage("Fin do jogo. Aperta Reiniciar ou Enter para intentar denvo.");
        } else {
          setMessage("¡Cuidado! esta com " + lives + " vidas.");
        }
        updateHud();
      }
      function resetStage() {
        player.x = 70; player.y = FLOOR - player.h; player.vy = 0; player.facing = 1; player.onGround = true; player.invincible = 0;
        lives = 3; camera = 0; gameState = "playing"; fireTimer = 0;
        retreatSpawnTimer = 1.2;
        bullets.length = 0; enemyBullets.length = 0;
        hearts.forEach(heart => { heart.collected = false; });
        populateEnemies();
        document.getElementById("restart").textContent = "Reiniciar partida";
        updateHud();
      }
      function restart() {
        level = 1; score = 0;
        resetStage();
        setMessage("Boa sorte, soldado!");
      }
      function nextStage() {
        level++;
        resetStage();
        setMessage("¡Stage " + level + "Tem mais soldados e atiram más rápido.");
      }
      document.getElementById("restart").addEventListener("click", () => gameState === "won" ? nextStage() : restart());

      function update(dt) {
        if (gameState !== "playing") return;
        const left = actionPressed("left"), right = actionPressed("right");
        const crouching = actionPressed("crouch");
        if (left) { player.x -= 235 * dt; player.facing = -1; }
        if (right) { player.x += 235 * dt; player.facing = 1; }
        player.x = Math.max(0, Math.min(WORLD - 60, player.x));
        if (left && !right && player.x > 840) {
          retreatSpawnTimer -= dt;
          if (retreatSpawnTimer <= 0) {
            enemies.push({ x: Math.max(330, player.x - 520), y: FLOOR - 40, w: 28, h: 40, dir: 1, alive: true, cooldown: Math.max(.4, 1.8 - level * .12) + Math.random() });
            retreatSpawnTimer = 2.2;
          }
        } else {
          retreatSpawnTimer = 1.2;
        }
        const night = nightProgress();
        if (actionPressed("jump") && player.onGround && !crouching) {
          player.vy = -480; player.onGround = false;
        }
        const previousBottom = player.y + player.h;
        player.vy += 1150 * dt;
        player.y += player.vy * dt;
        player.onGround = false;
        let landing = FLOOR;
        if (player.vy >= 0) {
          platforms.forEach(platform => {
            if (player.x + player.w > platform.x && player.x < platform.x + platform.w &&
                previousBottom <= platform.y + 5 && player.y + player.h >= platform.y) landing = Math.min(landing, platform.y);
          });
          if (player.y + player.h >= landing) {
            player.y = landing - player.h; player.vy = 0; player.onGround = true;
          }
        }
        hearts.forEach(heart => {
          if (!heart.collected && lives < 3 && player.x < heart.x + 18 && player.x + player.w > heart.x &&
              player.y < heart.y + 18 && player.y + player.h > heart.y) {
            heart.collected = true;
            lives++;
            setMessage("Você recuperou uma vida!");
            updateHud();
          }
        });
        if (player.invincible > 0) player.invincible -= dt;
        fireTimer -= dt;
        if (actionPressed("fire") && fireTimer <= 0) { shoot(); fireTimer = .22; }

        enemies.forEach(enemy => {
          if (!enemy.alive) return;
          enemy.x += enemy.dir * (25 + level * 4 + night * 16) * dt;
          if (enemy.x < 330 || enemy.x > WORLD - 240) enemy.dir *= -1;
          enemy.cooldown -= dt;
          if (enemy.cooldown <= 0 && Math.abs(enemy.x - player.x) < 510 + night * 240) {
            enemyBullets.push({ x: enemy.x + (enemy.dir < 0 ? 0 : enemy.w), y: enemy.y + 18, vx: (player.x < enemy.x ? -1 : 1) * (250 + level * 15 + night * 60), life: 2.4 });
            enemy.cooldown = Math.max(.35, 1.8 - level * .1 - night * .7) + Math.random() * .8;
          }
          const playerH = crouching ? 32 : player.h;
          if (player.invincible <= 0 && player.x < enemy.x + enemy.w && player.x + player.w > enemy.x &&
              player.y + playerH > enemy.y + 3 && player.y < enemy.y + enemy.h) hurtPlayer();
        });
        bullets.forEach(bullet => {
          bullet.x += bullet.vx * dt; bullet.life -= dt;
          enemies.forEach(enemy => {
            if (enemy.alive && bullet.x > enemy.x - 3 && bullet.x < enemy.x + enemy.w + 3 && bullet.y > enemy.y && bullet.y < enemy.y + enemy.h) {
              enemy.alive = false; bullet.life = 0; score++; updateHud();
            }
          });
        });
        enemyBullets.forEach(bullet => {
          bullet.x += bullet.vx * dt; bullet.life -= dt;
          const playerH = crouching ? 32 : player.h;
          if (player.invincible <= 0 && bullet.x > player.x && bullet.x < player.x + player.w && bullet.y > player.y && bullet.y < player.y + playerH) {
            bullet.life = 0; hurtPlayer();
          }
        });
        for (let i = bullets.length - 1; i >= 0; i--) if (bullets[i].life <= 0) bullets.splice(i, 1);
        for (let i = enemyBullets.length - 1; i >= 0; i--) if (enemyBullets[i].life <= 0) enemyBullets.splice(i, 1);
        camera = Math.max(0, Math.min(WORLD - W, player.x - W * .35));
        if (player.x >= WORLD - 120) {
          gameState = "won";
          document.getElementById("restart").textContent = "Seguiente nivel";
          setMessage("¡Stage " + level + " completado! Aperta Seguinte nivel ou Enter.");
        }
        updateHud();
      }

      function drawBackground() {
        const sky = ctx.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, "#83b2ae"); sky.addColorStop(.64, "#c8c69a"); sky.addColorStop(1, "#77724f");
        ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#d8d09a"; ctx.beginPath(); ctx.arc(790 - camera * .035, 105, 42, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 9; i++) {
          const x = ((i * 170 - camera * .13) % (W + 220) + W + 220) % (W + 220) - 100;
          ctx.fillStyle = i % 2 ? "#708c78" : "#79937d";
          ctx.beginPath(); ctx.moveTo(x - 110, FLOOR); ctx.lineTo(x + 25, 190 + (i % 3) * 28); ctx.lineTo(x + 150, FLOOR); ctx.fill();
        }
        for (let i = 0; i < 22; i++) {
          const x = ((i * 97 - camera * .35) % (W + 100) + W + 100) % (W + 100) - 50;
          const y = 335 + (i % 4) * 18;
          ctx.fillStyle = "#445e4b"; ctx.fillRect(x, y, 7, FLOOR - y);
          ctx.fillStyle = "#59744f";
          ctx.beginPath(); ctx.moveTo(x - 22, y + 15); ctx.lineTo(x + 3, y - 32); ctx.lineTo(x + 29, y + 15); ctx.fill();
        }
        ctx.fillStyle = "#556248"; ctx.fillRect(0, FLOOR, W, H - FLOOR);
        ctx.fillStyle = "#8b8055"; ctx.fillRect(0, FLOOR, W, 9);
        for (let i = 0; i < 55; i++) {
          const x = ((i * 83 - camera * .8) % (W + 80) + W + 80) % (W + 80) - 40;
          ctx.fillStyle = i % 2 ? "#726e4a" : "#9b8b59";
          ctx.fillRect(x, FLOOR + 25 + (i % 6) * 12, 18 + i % 10, 3);
        }
        ctx.fillStyle = "rgba(8, 13, 30, " + (nightProgress() * .66) + ")";
        ctx.fillRect(0, 0, W, H);
      }
      function drawSoldier(x, y, w, h, color, facing) {
        ctx.save(); ctx.translate(Math.round(x), Math.round(y));
        if (facing < 0) { ctx.translate(w, 0); ctx.scale(-1, 1); }
        ctx.fillStyle = "#263c31"; ctx.fillRect(5, h - 13, 8, 13); ctx.fillRect(17, h - 13, 8, 13);
        ctx.fillStyle = color; ctx.fillRect(3, 13, w - 6, h - 25);
        ctx.fillStyle = "#c99868"; ctx.fillRect(8, 2, 14, 14);
        ctx.fillStyle = "#3b503b"; ctx.fillRect(6, 0, 18, 7);
        ctx.fillStyle = "#30352c"; ctx.fillRect(17, 18, 22, 5);
        ctx.fillStyle = "#d3d4b4"; ctx.fillRect(19, 18, 12, 2);
        ctx.restore();
      }
      function draw() {
        drawBackground();
        ctx.save(); ctx.translate(-Math.floor(camera), 0);
        platforms.forEach(platform => {
          ctx.fillStyle = "#665f43"; ctx.fillRect(platform.x, platform.y, platform.w, 12);
          ctx.fillStyle = "#9c8b59"; ctx.fillRect(platform.x, platform.y, platform.w, 4);
          ctx.fillStyle = "#46583e"; ctx.fillRect(platform.x + 10, platform.y + 12, platform.w - 20, 7);
        });
        hearts.forEach(heart => {
          if (!heart.collected) {
            ctx.fillStyle = "#f04d58";
            ctx.font = "24px Arial";
            ctx.fillText("♥", heart.x, heart.y + 20);
          }
        });
        enemies.forEach(enemy => { if (enemy.alive) drawSoldier(enemy.x, enemy.y, enemy.w, enemy.h, "#756443", enemy.dir); });
        bullets.forEach(b => { ctx.fillStyle = "#ffe078"; ctx.fillRect(b.x, b.y, 13, 4); });
        enemyBullets.forEach(b => { ctx.fillStyle = "#ff805c"; ctx.fillRect(b.x, b.y, 9, 4); });
        const crouching = actionPressed("crouch"), ph = crouching ? 34 : player.h;
        if (player.invincible <= 0 || Math.floor(player.invincible * 12) % 2 === 0) drawSoldier(player.x, player.y + (player.h - ph), player.w, ph, "#3b6680", player.facing);
        const exitX = WORLD - 105;
        ctx.fillStyle = "#eee1ae"; ctx.fillRect(exitX, FLOOR - 82, 4, 82);
        ctx.fillStyle = "#c74d3b"; ctx.beginPath(); ctx.moveTo(exitX + 4, FLOOR - 80); ctx.lineTo(exitX + 48, FLOOR - 66); ctx.lineTo(exitX + 4, FLOOR - 52); ctx.fill();
        ctx.fillStyle = "#f4e3a8"; ctx.font = "bold 12px Arial"; ctx.fillText("EXTRACCIÓN", exitX - 20, FLOOR - 91);
        ctx.restore();
        if (gameState !== "playing") {
          ctx.fillStyle = "#10191dcc"; ctx.fillRect(0, 0, W, H);
          ctx.textAlign = "center"; ctx.fillStyle = gameState === "won" ? "#f5d477" : "#ef9479";
          ctx.font = "bold 42px Trebuchet MS, Arial"; ctx.fillText(gameState === "won" ? "¡MISIÓN CUMPLIDA!" : "FIM DE JOGO", W / 2, H / 2);
          ctx.fillStyle = "#f1f0dc"; ctx.font = "18px Trebuchet MS, Arial"; ctx.fillText("Pulsa Reiniciar o Enter", W / 2, H / 2 + 38);
          ctx.textAlign = "start";
        }
      }
      function frame(time) {
        const dt = Math.min((time - lastTime) / 1000 || 0, .035);
        lastTime = time;
        update(dt); draw();
        requestAnimationFrame(frame);
      }
      updateHud();
      requestAnimationFrame(frame);
    })();
