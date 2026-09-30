const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const TICK_RATE = 60;
const ARENA = 200;

// 서버 상태
const players = new Map();
let nextPlayerId = 1;
let bullets = [];
let bulletId = 1;
let chatHistory = [];
let items = [];
let itemId = 1;
let vehicles = [];
let vehicleId = 1;
let aiBots = [];
let aiBotId = 1;
let supplyDrops = [];
let supplyId = 1;
let planes = [];
let planeId = 1;

const TEAM_BLUE = 'blue';
const TEAM_RED = 'red';

const BUILDINGS = [
    { x: 40, z: 40, w: 12, h: 8, d: 10, name: '집 1' },
    { x: -50, z: -30, w: 15, h: 10, d: 12, name: '집 2' },
    { x: 80, z: -60, w: 10, h: 6, d: 8, name: '집 3' },
    { x: -80, z: 70, w: 14, h: 9, d: 10, name: '집 4' },
    { x: 0, z: -100, w: 20, h: 12, d: 15, name: '창고' },
    { x: 120, z: 50, w: 12, h: 7, d: 10, name: '집 5' },
    { x: -120, z: -80, w: 16, h: 10, d: 12, name: '집 6' },
    { x: 60, z: -120, w: 18, h: 14, d: 14, name: '본부' },
    { x: -150, z: 100, w: 14, h: 8, d: 12, name: '집 7' },
    { x: 150, z: -50, w: 12, h: 9, d: 10, name: '집 8' },
    { x: -30, z: 150, w: 16, h: 11, d: 13, name: '집 9' },
    { x: 100, z: 120, w: 14, h: 8, d: 11, name: '집 10' },
    { x: -100, z: -150, w: 20, h: 15, d: 16, name: '대형 창고' },
    { x: 180, z: 0, w: 10, h: 7, d: 9, name: '집 11' },
    { x: -180, z: -30, w: 12, h: 8, d: 10, name: '집 12' },
    { x: 30, z: -180, w: 14, h: 9, d: 12, name: '집 13' },
    { x: -60, z: 180, w: 16, h: 10, d: 14, name: '집 14' },
    { x: 140, z: -140, w: 12, h: 8, d: 10, name: '집 15' },
    { x: -140, z: 140, w: 14, h: 9, d: 12, name: '집 16' },
    { x: 0, z: 180, w: 18, h: 12, d: 14, name: '집 17' },
];

const ITEM_TYPES = {
    health: { name: '체력 키트', color: 0x44ff44, effect: 'heal', value: 50, respawnTime: 15000 },
    ammo: { name: '탄약 상자', color: 0xffaa00, effect: 'ammo', value: 30, respawnTime: 10000 },
    damage: { name: '데미지 부스트', color: 0xff4444, effect: 'damage', value: 2, respawnTime: 20000 },
    speed: { name: '속도 부스트', color: 0x44aaff, effect: 'speed', value: 1.5, respawnTime: 20000 },
    armor: { name: '방어구', color: 0xaaaaff, effect: 'armor', value: 50, respawnTime: 25000 },
    medkit: { name: '응급처치 세트', color: 0xff88cc, effect: 'medkit', value: 100, respawnTime: 30000 },
};

function getGroundHeight(x, z) {
    return Math.sin(x * 0.02) * Math.cos(z * 0.02) * 2 +
           Math.sin(x * 0.05 + 1) * Math.cos(z * 0.03) * 1 +
           Math.sin(x * 0.1) * Math.cos(z * 0.08) * 0.5;
}

function generateItems() {
    items = [];
    itemId = 1;
    BUILDINGS.forEach(b => {
        const count = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
            const types = Object.keys(ITEM_TYPES);
            const type = Math.random() < 0.3 ? 'medkit' : types[Math.floor(Math.random() * types.length)];
            items.push({ id: itemId++, type, x: b.x + (Math.random()-0.5)*(b.w-4), y: 0.5, z: b.z + (Math.random()-0.5)*(b.d-4), active: true, respawnAt: 0 });
        }
    });
    for (let i = 0; i < 40; i++) {
        const types = Object.keys(ITEM_TYPES);
        const type = types[Math.floor(Math.random() * types.length)];
        items.push({ id: itemId++, type, x: (Math.random()-0.5)*ARENA*1.6, y: 0.5, z: (Math.random()-0.5)*ARENA*1.6, active: true, respawnAt: 0 });
    }
}

function generateVehicles() {
    vehicles = [];
    vehicleId = 1;
    [
        { x: 20, z: 20, rot: 0 }, { x: -30, z: 40, rot: Math.PI / 4 },
        { x: 60, z: -20, rot: Math.PI / 2 }, { x: -60, z: -50, rot: -Math.PI / 4 },
        { x: 100, z: 80, rot: Math.PI }, { x: -100, z: 30, rot: Math.PI / 6 },
        { x: 0, z: 50, rot: 0 }, { x: -40, z: -100, rot: -Math.PI / 2 },
        { x: 150, z: -100, rot: Math.PI / 3 }, { x: -150, z: 50, rot: -Math.PI / 3 },
    ].forEach(v => {
        vehicles.push({ id: vehicleId++, x: v.x, y: 0, z: v.z, rot: v.rot, speed: 0, maxSpeed: 30, acceleration: 15, turnSpeed: 2.5, occupiedBy: null, health: 100 });
    });
}

// 적 AI만 5명 (팀원 없음)
function createAIBot() {
    const bot = {
        id: 'ai_' + aiBotId++,
        name: `적_${aiBotId - 1}`,
        team: TEAM_RED,
        x: (Math.random() - 0.5) * 150,
        y: 1.7,
        z: (Math.random() - 0.5) * 150,
        yaw: 0, pitch: 0,
        health: 100, maxHealth: 100,
        score: 0, kills: 0, deaths: 0,
        color: `hsl(0, 75%, 50%)`,
        isAlive: true, isAI: true,
        state: 'chase', targetX: 0, targetZ: 0,
        lastShot: 0, fireRate: 500 + Math.random() * 400, damage: 15 + Math.floor(Math.random() * 6), speed: 6 + Math.random() * 2,
        stateTimer: 0, stuckTimer: 0, lastX: 0, lastZ: 0, lastDamage: 0
    };
    aiBots.push(bot);
    return bot;
}

for (let i = 0; i < 5; i++) createAIBot();

// HTTP 서버
const server = http.createServer((req, res) => {
    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = path.join(__dirname, decodeURIComponent(filePath.split('?')[0]));
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css' };
    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not Found'); return; }
        res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
        res.end(data);
    });
});

// WebSocket 서버
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    const playerId = nextPlayerId++;
    const spawnX = (Math.random() - 0.5) * 50;
    const spawnZ = (Math.random() - 0.5) * 50;

    const player = {
        id: playerId, ws, x: spawnX, y: 1.7, z: spawnZ,
        yaw: 0, pitch: 0, health: 100, maxHealth: 100,
        score: 0, kills: 0, deaths: 0, name: `Player${playerId}`,
        color: `hsl(${Math.floor(Math.random() * 360)}, 70%, 50%)`,
        lastUpdate: Date.now(), isAlive: true, isAI: false,
        inVehicle: null, damageBoost: 1, speedBoost: 1, armor: 0,
        team: TEAM_BLUE, inventory: [], inventorySize: 10,
        fireRate: 150, recoilPattern: 'normal', autoFire: true
    };
    players.set(playerId, player);

    broadcast({ type: 'playerJoined', player: serializePlayer(player) });
    broadcast({ type: 'systemMessage', message: `${player.name}님이 게임에 입장하셨습니다.` });

    const existingPlayers = [];
    players.forEach(p => { if (p.id !== playerId) existingPlayers.push(serializePlayer(p)); });

    ws.send(JSON.stringify({
        type: 'init', playerId, players: existingPlayers,
        bullets, chatHistory: chatHistory.slice(-50),
        items, vehicles, aiBots: aiBots.map(serializeAIBot), buildings: BUILDINGS
    }));

    console.log(`[접속] ${player.name}. 접속자: ${players.size}명, 적 AI: ${aiBots.length}개`);

    ws.on('message', data => {
        try { handleMessage(playerId, JSON.parse(data.toString())); }
        catch (e) { console.error('메시지 오류:', e); }
    });

    ws.on('close', () => {
        if (player.inVehicle) { const v = vehicles.find(v => v.id === player.inVehicle); if (v) v.occupiedBy = null; }
        players.delete(playerId);
        broadcast({ type: 'playerLeft', playerId });
        broadcast({ type: 'systemMessage', message: `${player.name}님이 퇴장하셨습니다.` });
        console.log(`[퇴장] ${player.name}. 접속자: ${players.size}명`);
    });
});

function handleMessage(playerId, msg) {
    const player = players.get(playerId);
    if (!player) return;

    switch (msg.type) {
        case 'update':
            player.x = msg.x; player.y = msg.y; player.z = msg.z;
            player.yaw = msg.yaw; player.pitch = msg.pitch;
            player.lastUpdate = Date.now();
            break;

        case 'shoot':
            bullets.push({
                id: bulletId++, ownerId: playerId, ownerName: player.name, ownerTeam: player.team,
                x: msg.x, y: msg.y, z: msg.z, dx: msg.dx, dy: msg.dy, dz: msg.dz,
                speed: msg.speed || 100, life: 2, createdAt: Date.now(),
                damage: (msg.damage || 34) * (player.damageBoost || 1)
            });
            broadcast({ type: 'bulletSpawned', bullet: bullets[bullets.length - 1] });
            if (!player._shotLog || Date.now() - player._shotLog > 3000) { player._shotLog = Date.now(); console.log(`[사격] ${player.name} → #${bullets[bullets.length-1].id} (총알 수: ${bullets.length})`); }
            break;

        case 'hit': {
            // 플레이어 명중
            const target = players.get(msg.targetId);
            if (target && target.isAlive && player.isAlive && target.team !== player.team) {
                const dmg = (msg.damage || 34) * (player.damageBoost || 1);
                const actualDmg = Math.max(1, dmg - (target.armor || 0));
                target.health -= actualDmg;
                target.armor = Math.max(0, (target.armor || 0) - dmg);
                target.lastDamage = Date.now();
                const isHeadshot = !!msg.isHeadshot;
                broadcast({ type: 'playerHit', targetId: msg.targetId, damage: actualDmg, health: target.health, attackerId: playerId, isHeadshot });
                if (target.health <= 0) {
                    target.isAlive = false; target.deaths++;
                    player.kills++; player.score += isHeadshot ? 150 : 100;
                    broadcast({ type: 'playerKilled', killerId: playerId, killerName: player.name, victimId: msg.targetId, victimName: target.name, killerScore: player.score, killerKills: player.kills, isHeadshot });
                    setTimeout(() => {
                        target.health = target.maxHealth; target.isAlive = true;
                        target.armor = 0; target.damageBoost = 1; target.speedBoost = 1;
                        target.x = (Math.random()-0.5)*150; target.y = 1.7 + getGroundHeight(target.x, target.z); target.z = (Math.random()-0.5)*150;
                        target.lastDamage = 0;
                        broadcast({ type: 'playerRespawned', playerId: target.id, x: target.x, y: target.y, z: target.z, health: target.health });
                    }, 3000);
                }
            }
            // AI 봇 명중
            const bot = aiBots.find(b => b.id === msg.targetId);
            if (bot && bot.isAlive && player.isAlive) {
                const dmg = (msg.damage || 34) * (player.damageBoost || 1);
                bot.health -= dmg;
                const isHeadshot = !!msg.isHeadshot;
                broadcast({ type: 'playerHit', targetId: bot.id, damage: dmg, health: Math.max(0, bot.health), attackerId: playerId, isHeadshot });
                if (bot.health <= 0) {
                    bot.isAlive = false; bot.deaths++;
                    player.kills++; player.score += isHeadshot ? 150 : 100;
                    broadcast({ type: 'playerKilled', killerId: playerId, killerName: player.name, victimId: bot.id, victimName: bot.name, killerScore: player.score, killerKills: player.kills, isHeadshot });
                    setTimeout(() => {
                        bot.health = bot.maxHealth; bot.isAlive = true;
                        bot.x = (Math.random()-0.5)*150; bot.y = 1.7 + getGroundHeight(bot.x, bot.z); bot.z = (Math.random()-0.5)*150;
                        bot.state = 'patrol'; bot.stateTimer = 0;
                    }, 4000);
                }
            }
            break;
        }

        case 'chat': {
            const chatMsg = { type: 'chat', playerId, name: player.name, color: player.color, message: msg.message.substring(0, 200), timestamp: Date.now() };
            chatHistory.push(chatMsg);
            if (chatHistory.length > 100) chatHistory.shift();
            broadcast(chatMsg);
            break;
        }

        case 'setName': {
            const oldName = player.name;
            player.name = msg.name.substring(0, 20).trim() || player.name;
            broadcast({ type: 'playerRenamed', playerId, oldName, name: player.name });
            broadcast({ type: 'systemMessage', message: `${oldName} → ${player.name}으로 이름 변경` });
            break;
        }

        case 'enterVehicle': {
            const v = vehicles.find(v => v.id === msg.vehicleId);
            if (v && !v.occupiedBy) { v.occupiedBy = playerId; player.inVehicle = v.id; broadcast({ type: 'vehicleOccupied', vehicleId: v.id, playerId, playerName: player.name }); }
            break;
        }

        case 'exitVehicle': {
            if (player.inVehicle) {
                const v = vehicles.find(v => v.id === player.inVehicle);
                if (v) { v.occupiedBy = null; player.x = v.x + Math.cos(v.rot)*3; player.z = v.z - Math.sin(v.rot)*3; player.y = 1.7; }
                player.inVehicle = null;
                broadcast({ type: 'vehicleExited', vehicleId: msg.vehicleId, playerId });
            }
            break;
        }

        case 'vehicleUpdate': {
            const v = vehicles.find(v => v.id === msg.vehicleId);
            if (v && v.occupiedBy === playerId) { v.x = msg.x; v.y = msg.y; v.z = msg.z; v.rot = msg.rot; v.speed = msg.speed; player.x = msg.x; player.z = msg.z; }
            break;
        }

        case 'pickupItem': {
            const item = items.find(i => i.id === msg.itemId);
            if (item && item.active) {
                const dist = Math.sqrt((player.x - item.x) ** 2 + (player.z - item.z) ** 2);
                if (dist < 3 && player.inventory.length < player.inventorySize) {
                    item.active = false;
                    item.respawnAt = Date.now() + ITEM_TYPES[item.type].respawnTime;
                    player.inventory.push({ type: item.type, name: ITEM_TYPES[item.type].name });
                    broadcast({ type: 'itemPicked', itemId: item.id, playerId, playerName: player.name, itemType: item.type });
                }
            }
            break;
        }

        case 'useItem': {
            const idx = msg.inventoryIndex;
            if (idx >= 0 && idx < player.inventory.length) {
                const invItem = player.inventory[idx];
                const itemType = ITEM_TYPES[invItem.type];
                if (itemType) {
                    switch (itemType.effect) {
                        case 'heal': player.health = Math.min(player.maxHealth, player.health + itemType.value); break;
                        case 'medkit': player.health = player.maxHealth; break;
                        case 'ammo': break;
                        case 'damage': player.damageBoost = itemType.value; break;
                        case 'speed': player.speedBoost = itemType.value; break;
                        case 'armor': player.armor = itemType.value; break;
                    }
                    player.inventory.splice(idx, 1);
                    broadcast({ type: 'inventoryUpdate', playerId, inventory: player.inventory });
                }
            }
            break;
        }

        case 'dropItem': {
            const idx = msg.inventoryIndex;
            if (idx >= 0 && idx < player.inventory.length) { player.inventory.splice(idx, 1); broadcast({ type: 'inventoryUpdate', playerId, inventory: player.inventory }); }
            break;
        }

        case 'updateSettings': {
            if (msg.fireRate !== undefined) player.fireRate = Math.max(50, Math.min(500, msg.fireRate));
            if (msg.recoilPattern !== undefined) player.recoilPattern = msg.recoilPattern;
            if (msg.autoFire !== undefined) player.autoFire = msg.autoFire;
            break;
        }
    }
}

function serializePlayer(p) {
    return { id: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, health: p.health, maxHealth: p.maxHealth, score: p.score, kills: p.kills, deaths: p.deaths, name: p.name, color: p.color, isAlive: p.isAlive, isAI: p.isAI || false, inVehicle: p.inVehicle, damageBoost: p.damageBoost || 1, speedBoost: p.speedBoost || 1, armor: p.armor || 0, team: p.team, inventory: p.inventory, inventorySize: p.inventorySize, fireRate: p.fireRate, recoilPattern: p.recoilPattern, autoFire: p.autoFire };
}

function serializeAIBot(b) {
    return { id: b.id, x: b.x, y: b.y, z: b.z, yaw: b.yaw, pitch: b.pitch, health: b.health, maxHealth: b.maxHealth, score: b.score, kills: b.kills, deaths: b.deaths, name: b.name, color: b.color, isAlive: b.isAlive, isAI: true, team: b.team };
}

function broadcast(msg) {
    const data = JSON.stringify(msg);
    wss.clients.forEach(c => { if (c.readyState === 1) c.send(data); });
}

// ============ AI 봇 로직 (사격 빈도 감소) ============
function updateAIBots(dt) {
    const now = Date.now();
    aiBots.forEach(bot => {
        if (!bot.isAlive) return;

        // 가장 가까운 플레이어 찾기
        let nearestPlayer = null;
        let nearestDist = Infinity;
        players.forEach(p => {
            if (!p.isAlive) return;
            const dist = Math.sqrt((bot.x - p.x) ** 2 + (bot.z - p.z) ** 2);
            if (dist < nearestDist) { nearestDist = dist; nearestPlayer = p; }
        });

        // 상태 머신 - 더 공격적으로
        bot.stateTimer -= dt;

        if (bot.health < 25 && bot.state !== 'flee') {
            bot.state = 'flee'; bot.stateTimer = 3;
        } else if (nearestDist < 30) {
            bot.state = nearestDist < 15 ? 'attack' : 'chase';
        } else if (nearestDist < 60) {
            bot.state = 'chase';
        } else if (bot.state === 'patrol' && bot.stateTimer <= 0) {
            bot.targetX = (Math.random()-0.5)*ARENA*1.5; bot.targetZ = (Math.random()-0.5)*ARENA*1.5; bot.stateTimer = 3+Math.random()*3;
        } else if (bot.state !== 'patrol' && nearestDist > 80) {
            bot.state = 'patrol'; bot.stateTimer = 2+Math.random()*2;
        }

        switch (bot.state) {
            case 'patrol':
                moveToward(bot, bot.targetX, bot.targetZ, bot.speed*0.7, dt); break;
            case 'chase':
                if (nearestPlayer) { moveToward(bot, nearestPlayer.x, nearestPlayer.z, bot.speed, dt); bot.yaw = Math.atan2(nearestPlayer.x-bot.x, nearestPlayer.z-bot.z); } break;
            case 'attack':
                if (nearestPlayer) {
                    bot.yaw = Math.atan2(nearestPlayer.x-bot.x, nearestPlayer.z-bot.z);
                    // 사격 (적중률 일부 추가)
                    if (now - bot.lastShot > bot.fireRate) {
                        bot.lastShot = now;
                        const spread = 0.08;
                        const dir = { x: Math.sin(bot.yaw) + (Math.random()-0.5)*spread, y: (Math.random()-0.5)*spread*0.5 + 0.02, z: Math.cos(bot.yaw) + (Math.random()-0.5)*spread };
                        const len = Math.sqrt(dir.x*dir.x+dir.y*dir.y+dir.z*dir.z);
                        dir.x/=len; dir.y/=len; dir.z/=len;
                        const newBullet = { id: bulletId++, ownerId: bot.id, ownerName: bot.name, ownerTeam: bot.team, x: bot.x, y: bot.y, z: bot.z, dx: dir.x, dy: dir.y, dz: dir.z, speed: 80, life: 2, createdAt: now, damage: bot.damage };
                        bullets.push(newBullet);
                        broadcast({ type: 'bulletSpawned', bullet: newBullet });
                    }
                } break;
            case 'flee':
                if (nearestPlayer) moveToward(bot, bot.x+(bot.x-nearestPlayer.x), bot.z+(bot.z-nearestPlayer.z), bot.speed*1.3, dt);
                if (bot.stateTimer <= 0) bot.state = 'patrol'; break;
            case 'loot':
                moveToward(bot, bot.targetX, bot.targetZ, bot.speed*0.8, dt);
                items.forEach(item => { if (!item.active) return; const dist = Math.sqrt((bot.x-item.x)**2 + (bot.z-item.z)**2); if (dist < 2) { item.active = false; item.respawnAt = now + ITEM_TYPES[item.type].respawnTime; if (ITEM_TYPES[item.type].effect === 'heal' || ITEM_TYPES[item.type].effect === 'medkit') bot.health = Math.min(bot.maxHealth, bot.health + ITEM_TYPES[item.type].value); } });
                if (bot.stateTimer <= 0) bot.state = 'patrol'; break;
        }

        // 스틱 방지
        bot.stuckTimer += dt;
        if (bot.stuckTimer > 2) { const moved = Math.sqrt((bot.x-bot.lastX)**2 + (bot.z-bot.lastZ)**2); if (moved < 0.5) { bot.targetX = (Math.random()-0.5)*ARENA; bot.targetZ = (Math.random()-0.5)*ARENA; bot.state = 'patrol'; bot.stateTimer = 3; } bot.lastX = bot.x; bot.lastZ = bot.z; bot.stuckTimer = 0; }

        // 경계 + 지면 높이
        bot.x = Math.max(-ARENA+5, Math.min(ARENA-5, bot.x));
        bot.z = Math.max(-ARENA+5, Math.min(ARENA-5, bot.z));
        bot.y = 1.7 + getGroundHeight(bot.x, bot.z);
    });
}

function moveToward(bot, tx, tz, speed, dt) {
    const dx = tx-bot.x, dz = tz-bot.z, dist = Math.sqrt(dx*dx+dz*dz);
    if (dist > 0.5) {
        const nx = (dx/dist)*speed*dt, nz = (dz/dist)*speed*dt;
        let nx2 = bot.x + nx, nz2 = bot.z + nz;
        // 건물 충돌 회피
        for (const b of BUILDINGS) {
            const hw = b.w/2 + 0.6, hd = b.d/2 + 0.6;
            const bx = b.x, bz = b.z;
            if (nx2 > bx - hw && nx2 < bx + hw && nz2 > bz - hd && nz2 < bz + hd) {
                // 가장 가까운 가장자리로 밀어내기
                const ox1 = nx2 - (bx - hw), ox2 = (bx + hw) - nx2;
                const oz1 = nz2 - (bz - hd), oz2 = (bz + hd) - nz2;
                const m = Math.min(ox1, ox2, oz1, oz2);
                if (m === ox1) nx2 = bx - hw;
                else if (m === ox2) nx2 = bx + hw;
                else if (m === oz1) nz2 = bz - hd;
                else nz2 = bz + hd;
                break;
            }
        }
        bot.x = nx2; bot.z = nz2; bot.yaw = Math.atan2(dx, dz);
    }
}

// ============ 비행기 보급 ============
function spawnSupplyPlane() {
    const targetX = (Math.random() - 0.5) * ARENA * 1.2;
    const targetZ = (Math.random() - 0.5) * ARENA * 1.2;
    const startX = targetX + (Math.random() > 0.5 ? 300 : -300);
    const startZ = targetZ + (Math.random() - 0.5) * 200;

    const plane = { id: planeId++, x: startX, y: 80, z: startZ, targetX, targetZ, speed: 40, state: 'flying', dropTimer: 0 };
    planes.push(plane);
    broadcast({ type: 'planeSpawned', plane });
    console.log(`[보급] 비행기 출발! 목표: (${targetX.toFixed(0)}, ${targetZ.toFixed(0)})`);
}

function updatePlanes(dt) {
    for (let i = planes.length - 1; i >= 0; i--) {
        const p = planes[i];
        if (p.state === 'flying') {
            const dx = p.targetX - p.x, dz = p.targetZ - p.z;
            const dist = Math.sqrt(dx*dx + dz*dz);
            if (dist < 10) {
                p.state = 'dropping'; p.dropTimer = 0;
                const drop = { id: supplyId++, x: p.targetX, y: p.y, z: p.targetZ, vy: 0, state: 'falling', items: ['medkit', 'ammo', 'damage', 'armor'].sort(() => Math.random()-0.5).slice(0, 2+Math.floor(Math.random()*2)), landedAt: 0 };
                supplyDrops.push(drop);
                broadcast({ type: 'supplyDropped', drop });
                console.log(`[보급] 상자 투하! 위치: (${p.targetX.toFixed(0)}, ${p.targetZ.toFixed(0)})`);
            } else { p.x += (dx/dist)*p.speed*dt; p.z += (dz/dist)*p.speed*dt; }
        } else if (p.state === 'dropping') { p.dropTimer += dt; if (p.dropTimer > 2) p.state = 'leaving'; }
        else if (p.state === 'leaving') { p.y += 20*dt; p.x += 30*dt; if (p.y > 150) { planes.splice(i, 1); broadcast({ type: 'planeLeft', planeId: p.id }); } }
    }

    for (let i = supplyDrops.length - 1; i >= 0; i--) {
        const d = supplyDrops[i];
        if (d.state === 'falling') {
            d.vy += 30*dt; d.y -= d.vy*dt;
            const groundY = getGroundHeight(d.x, d.z) + 1;
            if (d.y <= groundY) { d.y = groundY; d.state = 'landed'; d.landedAt = Date.now(); broadcast({ type: 'supplyLanded', dropId: d.id, x: d.x, y: d.y, z: d.z }); console.log(`[보급] 상자 착지!`); }
        }
    }
}

function handleSupplyPickup(playerId, dropId) {
    const player = players.get(playerId);
    const drop = supplyDrops.find(d => d.id === dropId);
    if (!player || !drop || drop.state !== 'landed') return;
    const dist = Math.sqrt((player.x - drop.x) ** 2 + (player.z - drop.z) ** 2);
    if (dist > 4) return;

    const addedItems = [];
    for (const itemType of drop.items) {
        if (player.inventory.length < player.inventorySize) { player.inventory.push({ type: itemType, name: ITEM_TYPES[itemType].name }); addedItems.push(itemType); }
    }
    if (addedItems.length > 0) {
        supplyDrops = supplyDrops.filter(d => d.id !== dropId);
        broadcast({ type: 'supplyPicked', dropId, playerId, playerName: player.name, items: addedItems });
        broadcast({ type: 'inventoryUpdate', playerId, inventory: player.inventory });
        console.log(`[보급] ${player.name}님이 보급 획득: ${addedItems.join(', ')}`);
    }
}

const originalHandleMessage = handleMessage;
handleMessage = function(playerId, msg) {
    if (msg.type === 'supplyPickup') { handleSupplyPickup(playerId, msg.dropId); return; }
    originalHandleMessage(playerId, msg);
};

// ============ 게임 루프 ============
let lastBroadcast = 0;
let lastPlaneSpawn = Date.now();
const PLANE_SPAWN_INTERVAL = 60000;

setInterval(() => {
    const now = Date.now();
    const dt = 1 / TICK_RATE;

    // 총알 이동 + 충돌 판정
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.dx * b.speed * dt; b.y += b.dy * b.speed * dt; b.z += b.dz * b.speed * dt;
        b.life -= dt;
        let removed = b.life <= 0;

        // 충돌: 플레이어
        if (!removed) {
            players.forEach(p => {
                if (removed || !p.isAlive) return;
                if (p.id === b.ownerId) return;
                if (b.ownerTeam && p.team === b.ownerTeam) return;
                const dx = p.x - b.x, dy = p.y - b.y, dz = p.z - b.z;
                if (dx*dx + dz*dz < 0.81 && dy > -0.4 && dy < 1.9) {
                    removed = true;
                    const isHeadshot = dy > 0.9;
                    const finalDmg = b.damage * (isHeadshot ? 1.5 : 1);
                    const actualDmg = Math.max(1, finalDmg - (p.armor || 0));
                    p.health -= actualDmg;
                    p.armor = Math.max(0, (p.armor || 0) - finalDmg);
                    p.lastDamage = now;
                    broadcast({ type: 'playerHit', targetId: p.id, damage: Math.round(actualDmg), health: Math.max(0,p.health), attackerId: b.ownerId, attackerName: b.ownerName, isHeadshot });
                    if (p.health <= 0) {
                        p.isAlive = false; p.deaths++;
                        if (p.inVehicle) { const v = vehicles.find(v => v.id === p.inVehicle); if (v) v.occupiedBy = null; p.inVehicle = null; }
                        broadcast({ type: 'playerKilled', killerId: b.ownerId, killerName: b.ownerName, victimId: p.id, victimName: p.name, isHeadshot, weapon: b.ownerTeam });
                        if (typeof b.ownerId === 'number') {
                            const killer = players.get(b.ownerId);
                            if (killer) { killer.kills++; killer.score += isHeadshot ? 150 : 100; }
                        } else {
                            // AI가 처치한 경우 점수 없음
                        }
                        setTimeout(() => {
                            p.health = p.maxHealth; p.isAlive = true; p.armor = 0;
                            p.damageBoost = 1; p.speedBoost = 1; p.lastDamage = 0;
                            p.x = (Math.random()-0.5)*150; p.y = 1.7 + getGroundHeight(p.x, p.z); p.z = (Math.random()-0.5)*150;
                            broadcast({ type: 'playerRespawned', playerId: p.id, x: p.x, y: p.y, z: p.z, health: p.health });
                        }, 3000);
                    }
                }
            });
        }

        // 충돌: AI 봇
        if (!removed) {
            aiBots.forEach(bot => {
                if (removed || !bot.isAlive) return;
                if (bot.id === b.ownerId) return;
                if (b.ownerTeam && bot.team === b.ownerTeam) return;
                const dx = bot.x - b.x, dy = bot.y - b.y, dz = bot.z - b.z;
                if (dx*dx + dz*dz < 0.81 && dy > -0.4 && dy < 1.9) {
                    removed = true;
                    const isHeadshot = dy > 0.9;
                    const finalDmg = b.damage * (isHeadshot ? 1.5 : 1);
                    bot.health -= finalDmg;
                    broadcast({ type: 'playerHit', targetId: bot.id, damage: Math.round(finalDmg), health: Math.max(0,bot.health), attackerId: b.ownerId, attackerName: b.ownerName, isHeadshot });
                    if (bot.health <= 0) {
                        bot.isAlive = false; bot.deaths++;
                        broadcast({ type: 'playerKilled', killerId: b.ownerId, killerName: b.ownerName, victimId: bot.id, victimName: bot.name, isHeadshot, weapon: b.ownerTeam });
                        if (typeof b.ownerId === 'number') {
                            const killer = players.get(b.ownerId);
                            if (killer) { killer.kills++; killer.score += isHeadshot ? 150 : 100; }
                        }
                        setTimeout(() => {
                            bot.health = bot.maxHealth; bot.isAlive = true;
                            bot.x = (Math.random()-0.5)*150; bot.y = 1.7 + getGroundHeight(bot.x, bot.z); bot.z = (Math.random()-0.5)*150;
                            bot.state = 'patrol'; bot.stateTimer = 0;
                        }, 4000);
                    }
                }
            });
        }

        if (removed) bullets.splice(i, 1);
    }

    // 플레이어 체력 자연 회복 (5초 무피해 시)
    players.forEach(p => {
        if (p.isAlive && p.health > 0 && p.health < p.maxHealth && now - (p.lastDamage || 0) > 5000) {
            p.health = Math.min(p.maxHealth, p.health + 6 * dt);
        }
    });

    // 아이템 리스폰
    items.forEach(item => { if (!item.active && now > item.respawnAt) { item.active = true; broadcast({ type: 'itemRespawned', itemId: item.id }); } });

    // AI 봇 업데이트
    updateAIBots(dt);

    // 비행기
    if (now - lastPlaneSpawn > PLANE_SPAWN_INTERVAL) { lastPlaneSpawn = now; spawnSupplyPlane(); }
    updatePlanes(dt);

    // 상태 브로드캐스트 (30fps)
    if (now - lastBroadcast > 33) {
        lastBroadcast = now;
        const playerList = [];
        players.forEach(p => playerList.push(serializePlayer(p)));
        broadcast({
            type: 'state', players: playerList,
            aiBots: aiBots.map(serializeAIBot),
            bullets: bullets.map(b => ({ id: b.id, x: b.x, y: b.y, z: b.z, ownerId: b.ownerId })),
            items: items.map(i => ({ id: i.id, type: i.type, x: i.x, y: i.y, z: i.z, active: i.active })),
            vehicles: vehicles.map(v => ({ id: v.id, x: v.x, y: v.y, z: v.z, rot: v.rot, speed: v.speed, occupiedBy: v.occupiedBy })),
            supplyDrops: supplyDrops.map(d => ({ id: d.id, x: d.x, y: d.y, z: d.z, state: d.state, items: d.state === 'landed' ? d.items : [] }))
        });
    }
}, 1000 / TICK_RATE);

generateItems();
generateVehicles();

server.listen(PORT, () => {
    console.log('========================================');
    console.log('  FPS 게임 서버!');
    console.log(`  주소: http://localhost:${PORT}`);
    console.log(`  적 AI: ${aiBots.length}개`);
    console.log(`  자동차: ${vehicles.length}대 | 아이템: ${items.length}개`);
    console.log(`  건물: ${BUILDINGS.length}개`);
    console.log(`  비행기 보급: 60초마다`);
    console.log('========================================');
});
