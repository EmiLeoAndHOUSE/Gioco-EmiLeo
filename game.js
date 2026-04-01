// ==========================================
// STICKMAN SURVIVAL: REBIRTH - CORE ENGINE
// ==========================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let width, height;

let world = null;
let player = null;

function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    
    // Invalida i cache del mondo al ridimensionamento
    if (world) {
        // Al momento non usiamo cache nel nuovo motore di parallasse
    }
}
window.addEventListener('resize', resize);
resize();

// --- SUPPORTO PERFORMANCE: CULLING VISIVO ---
// Verifica se un oggetto è all'interno della visuale della telecamera (con margine)
function inView(x, y, w, h, buffer = 150) {
    if (typeof camera === 'undefined') return true;
    return (x + w + buffer > camera.x && 
            x - buffer < camera.x + width &&
            y + h + buffer > camera.y &&
            y - buffer < camera.y + height);
}

// ==========================================
// MACCHINA A STATI E AUDIO SYNTH
// ==========================================
let gameState = 'MENU'; // 'MENU', 'PLAY'

let audioCtx = null;

function initAudio() {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    } catch (e) {
        console.warn("AudioContext failed to initialize:", e);
    }
}

// ==========================================
// AUDIO MUSIC MANAGER (Hyper-Arcade OST)
// ==========================================
let musicManager = null;

class MusicManager {
    constructor(ctx) {
        this.ctx = ctx;
        this.masterGain = ctx.createGain();
        this.masterGain.connect(ctx.destination);
        this.masterGain.gain.setValueAtTime(0.06, ctx.currentTime); 
        
        this.isPlaying = false;
        this.nextNoteTime = 0;
        this.tempo = 130; 
        this.lookahead = 0.1;
        this.scheduleInterval = 30;
        this.beat = 0;
        this.isIntro = true;

        // SCALA PENTATONICA MINORE (LA)
        this.notes = {
            A2: 110, C3: 130.81, D3: 146.83, E3: 164.81, G3: 196.00,
            A3: 220, C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.00, A4: 440
        };

        // --- PATTERNS (16 STEPS) ---
        // Intro: Eroico e sincopato
        this.introMelody = ['A3', '-', 'A3', 'E3', 'G3', '-', 'A3', '-', 'C4', '-', 'D4', 'C4', 'A3', 'G3', 'E3', '-'];
        this.introBass   = ['A2', '-', '-', '-', 'E2', '-', '-', '-', 'G2', '-', '-', '-', 'D2', '-', '-', '-'];
        
        // Gioco: Misterioso e costante
        this.gameMelody  = ['A3', '-', 'C4', '-', 'D4', '-', 'E4', 'G4', 'A4', '-', 'G4', '-', 'E4', '-', 'D4', 'C4'];
        this.gameBass    = ['A2', 'A2', 'E2', 'E2', 'G2', 'G2', 'D2', 'D2', 'A2', 'A1', 'E2', 'E1', 'G2', 'G1', 'D2', 'D1'];
    }

    setGameMode() {
        this.isIntro = false;
        this.tempo = 110; 
        this.beat = 0;
        // Fade leggero del volume globale del gioco
        this.masterGain.gain.exponentialRampToValueAtTime(0.04, this.ctx.currentTime + 2);
    }

    start() {
        if (this.isPlaying) return;
        this.isPlaying = true;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        this.nextNoteTime = this.ctx.currentTime;
        this.scheduler();
    }

    stop() {
        this.isPlaying = false;
        if (this.timeoutId) clearTimeout(this.timeoutId);
    }

    scheduler() {
        if (!this.isPlaying) return;
        while (this.nextNoteTime < this.ctx.currentTime + this.lookahead) {
            this.scheduleBeat(this.beat % 16, this.nextNoteTime);
            this.advanceBeat();
        }
        this.timeoutId = setTimeout(() => this.scheduler(), this.scheduleInterval);
    }

    advanceBeat() {
        const secondsPerBeat = 60 / this.tempo / 4; // Sedicesimi
        this.nextNoteTime += secondsPerBeat;
        this.beat++;
    }

    scheduleBeat(step, time) {
        const currentMelody = this.isIntro ? this.introMelody : this.gameMelody;
        const currentBass = this.isIntro ? this.introBass : this.gameBass;

        // 1. MELODIA (Square Pulse)
        const note = currentMelody[step];
        if (note !== '-') {
            const freq = this.notes[note] || this.notes['A3'];
            this.playPulse(freq, time, 0.1, 0.04);
        }

        // 2. BASSO (Triangle)
        const bassNote = currentBass[step];
        if (bassNote !== '-') {
            const freq = (this.notes[bassNote] || this.notes['A2']) * 0.5;
            this.playBass(freq, time, 0.2, 0.12);
        }

        // 3. BATTERIA (Intro Only or Game Subtle)
        if (this.isIntro || step % 4 === 0) {
            if (step % 8 === 0) this.playKick(time);
            if (step % 8 === 4) this.playSnare(time);
        }
        // Hi-Hat costante
        if (step % 2 === 0) this.playHiHat(time);
    }

    // --- SINTESI STRUMENTI ---

    playPulse(freq, time, duration, volume) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, time);
        // Effetto "Vibrato" Arcade veloce
        osc.frequency.exponentialRampToValueAtTime(freq * 1.01, time + duration * 0.5);
        
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(volume, time + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(time);
        osc.stop(time + duration);
    }

    playBass(freq, time, duration, volume) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, time);
        
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(volume, time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(time);
        osc.stop(time + duration);
    }

    playKick(time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(40, time + 0.1);
        gain.gain.setValueAtTime(0.3, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(time);
        osc.stop(time + 0.15);
    }

    playSnare(time) {
        const bufferSize = this.ctx.sampleRate * 0.1;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(1000, time);
        
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.15, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start(time);
        noise.stop(time + 0.1);
    }

    playHiHat(time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(10000, time);
        gain.gain.setValueAtTime(0.03, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(time);
        osc.stop(time + 0.02);
    }
}

// ==========================================
// VARIABILI GLOBALI (Stato del Mondo ed Entità)
// ==========================================
let playerStyle = 'CYBER'; // MODIFICA QUI: 'CYBER', 'RONIN', 'PALADIN'
let allies = [];
let enemies = [];
let particles = [];
let projectiles = []; // NUOVA LISTA PER SHURIKEN
let lastSpawnNight = -1;
let currentDay = 1;
let currentInteractable = null;
let timeOfDay = 5.0001;
let lastTime = 0;
let camera = { x: 0, y: 0 };
let gameOver = false;
let timeSpeedGlobal = 1.0;
let hitStopTimer = 0;   
let screenShake = 0;    
let activeBoss = null; 
let playerFragments = 0; 
let collectables = [];  
let humans = [];        
let gameVictory = false; 

function playSound(type, sourceX = null, sourceY = null) {
    if (!audioCtx || gameState !== 'PLAY') return;
    const masterEffectsVolume = 0.4; // Ridotto da 1.0 a 0.4
    let volumeMultiplier = masterEffectsVolume;
    if (sourceX !== null && sourceY !== null && typeof player !== 'undefined') {
        const dist = Math.sqrt(Math.pow(player.x - sourceX, 2) + Math.pow(player.y - sourceY, 2));
        const MAX_DIST = 1400; 
        const MIN_DIST = 300;  
        if (dist > MAX_DIST) return; 
        if (dist > MIN_DIST) volumeMultiplier = masterEffectsVolume * (1 - ((dist - MIN_DIST) / (MAX_DIST - MIN_DIST)));
    }
    let osc = audioCtx.createOscillator();
    let gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    let now = audioCtx.currentTime;

    if (type === 'slash') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
        gainNode.gain.setValueAtTime(0.15 * volumeMultiplier, now); // Da 0.3 a 0.15
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'zombie_hit') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, now);
        gainNode.gain.setValueAtTime(0.2 * volumeMultiplier, now); // Da 0.4 a 0.2
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
    } else if (type === 'player_hit') {
        osc.type = 'triangle'; // Suono più cupo e realistico
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.3);
        gainNode.gain.setValueAtTime(0.3 * volumeMultiplier, now); // Abbassato da 0.8 a 0.3
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    } else if (type === 'jump') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.linearRampToValueAtTime(600, now + 0.1);
        gainNode.gain.setValueAtTime(0.1 * volumeMultiplier, now); // Da 0.2 a 0.1
        gainNode.gain.linearRampToValueAtTime(0.01, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
    } else if (type === 'wake') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80, now);
        gainNode.gain.setValueAtTime(0.25 * volumeMultiplier, now); // Da 0.5 a 0.25
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc.start(now); osc.stop(now + 0.5);
    } else if (type === 'kill') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        gainNode.gain.setValueAtTime(0.15 * volumeMultiplier, now); // Da 0.3 a 0.15
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.start(now); osc.stop(now + 0.4);
    } else if (type === 'hit') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, now);
        gainNode.gain.setValueAtTime(0.1 * volumeMultiplier, now); // Da 0.2 a 0.1
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'break') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, now);
        gainNode.gain.setValueAtTime(0.3 * volumeMultiplier, now); // Da 0.6 a 0.3
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    }
}

// SETUP MENU (Ottimizzato per sblocco audio immediato)
const startBtn = document.getElementById('startBtn');

function startIntroMusic() {
    initAudio();
    if (audioCtx && !musicManager) {
        musicManager = new MusicManager(audioCtx);
        musicManager.start();
    }
    window.removeEventListener('click', startIntroMusic);
    window.removeEventListener('keydown', startIntroMusic);
}

// Sblocca musica al primo click o tasto ovunque
window.addEventListener('click', startIntroMusic);
window.addEventListener('keydown', startIntroMusic);

if (startBtn) {
    startBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        
        initAudio(); 
        if (audioCtx && !musicManager) {
            musicManager = new MusicManager(audioCtx);
            musicManager.start();
        }
        
        // Passa alla schermata di selezione invece di iniziare subito
        document.getElementById('mainMenu').style.opacity = '0';
        setTimeout(() => {
            document.getElementById('mainMenu').style.display = 'none';
            const charSelect = document.getElementById('charSelect');
            charSelect.style.display = 'flex';
            setTimeout(() => charSelect.style.opacity = '1', 50);
        }, 500);
    });
}

// Nuova funzione per la scelta del personaggio
function selectHero(style) {
    playerStyle = style;
    
    // --- RESET STATISTICHE PER CLASSE ---
    if (style === 'CYBER') {
        player.speed = 620;
        player.jumpPower = -850;
        player.health = 60;
        player.maxHealth = 60;
        player.attackDuration = 0.2; // Attacco fulmineo
    } else if (style === 'PALADIN') {
        player.speed = 260;        
        player.health = 120;       
        player.maxHealth = 120;
        player.jumpPower = -620;   
        player.attackDuration = 0.8; 
        
        // Portata ridotta per la Mazza Chiodata Pesante
        player.weaponRangeX = 65;
        player.weaponRangeY = 60;
        
        // --- ABILITÀ SPECIALE: EGIDA DIVINA ---
        player.hasShield = true;
        player.shieldDurability = 99999; // Indistruttibile
    } else { // RONIN
        player.speed = 350;
        player.health = 100;
        player.maxHealth = 100;
        player.jumpPower = -700;
        player.attackDuration = 0.4;
        
        // Portata standard superiore per la Katana/Spada
        player.weaponRangeX = 85;
        player.weaponRangeY = 70;
    }

    const charSelect = document.getElementById('charSelect');
    charSelect.style.opacity = '0';
    
    if (musicManager) {
        if (musicManager.isIntro) musicManager.setGameMode();
    }

    setTimeout(() => {
        charSelect.style.display = 'none';
        gameState = 'PLAY';
        showStyleTip(`PARTIAMO CON: ${style}! ⚔️`);
        
        // --- SUGGERIMENTO COMANDI PALADIN ---
        if (style === 'PALADIN') {
            setTimeout(() => {
                showStyleTip("TIENI 'SHIFT' O IL TASTO DESTRO PER PARARE E RIFLETTERE! 🛡️");
            }, 1500);
        }
    }, 500);
}

// ==========================================
// 1. ASSET LOADER (Gestione Immagini in Parallelo)
// ==========================================
const gfx = {
    grass: new Image(),
    dirt: new Image(),
    sky_day: new Image(),
    sky_night: new Image()
};

let loadedAssets = 0;
// Non importa se l'immagine carica o fallisce (error), incrementiamo e avviamo.
// Se un'immagine non viene trovata, il gioco userà i colori fallback impostati in drawForeground()
let gameStarted = false;
function tryBoot() {
    if (gameStarted) return;
    gameStarted = true;
    // Avviamo immediatamente: le immagini caricheranno in background o useranno i fallback
    requestAnimationFrame(gameLoop);
}

// Fallback di sicurezza: se le immagini non rispondono entro 1 secondo, avvia comunque!
setTimeout(tryBoot, 1000);

gfx.grass.onload = tryBoot; gfx.dirt.onload = tryBoot; gfx.sky_day.onload = tryBoot; gfx.sky_night.onload = tryBoot;
gfx.grass.onerror = tryBoot; gfx.dirt.onerror = tryBoot; gfx.sky_day.onerror = tryBoot; gfx.sky_night.onerror = tryBoot;

// Caricamento su disco (Asincrono, farà scattare gli eventi di cui sopra)
gfx.grass.src = 'grass.png';
gfx.dirt.src = 'dirt.png';
gfx.sky_day.src = 'sky_day.png';
gfx.sky_night.src = 'sky_night.png';

// ==========================================
// 2. INPUT SYSTEM (Con Switch Stili Arcade 1, 2, 3)
// ==========================================
const keys = {};

window.addEventListener('keydown', e => {
    keys[e.code] = true;
    
    // --- CAMBIO STILE RAPIDO ---
    if (e.code === 'Digit1') { playerStyle = 'CYBER'; showStyleTip('STILE: CYBER-SAMURAI ⚡'); }
    if (e.code === 'Digit2') { playerStyle = 'RONIN'; showStyleTip('STILE: CRIMSON-RONIN 👺'); }
    if (e.code === 'Digit3') { playerStyle = 'PALADIN'; showStyleTip('STILE: GOLD-PALADIN 🛡️'); }
});

window.addEventListener('keyup', e => keys[e.code] = false);

// Gestione Mouse per i combattimenti
window.addEventListener('mousedown', e => {
    if (e.button === 0) keys['MouseLeft'] = true;
    if (e.button === 2) keys['MouseRight'] = true;
});
window.addEventListener('mouseup', e => {
    if (e.button === 0) keys['MouseLeft'] = false;
    if (e.button === 2) keys['MouseRight'] = false;
});

// Disabilita Menu Contestuale per permettere la parata con tasto destro
window.addEventListener('contextmenu', e => e.preventDefault());

// Notifica visiva per il cambio stile
function showStyleTip(text) {
    const oldTip = document.getElementById('styleTip');
    if (oldTip) oldTip.remove();

    const tip = document.createElement('div');
    tip.id = 'styleTip';
    tip.style.position = 'fixed';
    tip.style.bottom = '120px';
    tip.style.left = '50%';
    tip.style.transform = 'translateX(-50%)';
    tip.style.padding = '12px 24px';
    tip.style.background = 'rgba(0,0,0,0.85)';
    tip.style.color = '#00FFFF';
    tip.style.fontFamily = "'Courier New', Courier, monospace";
    tip.style.fontSize = '20px';
    tip.style.fontWeight = 'bold';
    tip.style.border = '2px solid #00FFFF';
    tip.style.borderRadius = '4px';
    tip.style.boxShadow = '0 0 15px rgba(0,255,255,0.5)';
    tip.style.zIndex = '2000';
    tip.style.pointerEvents = 'none';
    tip.innerText = text;
    document.body.appendChild(tip);
    
    // Animazione di sparizione
    setTimeout(() => {
        tip.style.opacity = '0';
        tip.style.transition = 'opacity 0.5s';
        setTimeout(() => tip.remove(), 500);
    }, 1500);
}

// ==========================================
// 2. PROJECTILE SYSTEM (Shurikens per Cyber)
// ==========================================
class Projectile {
    constructor(x, y, vx, vy, owner) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.owner = owner;
        this.life = 2.0;
        this.rotation = 0;
        this.width = 20;
        this.height = 20;
    }

    update(dt, world, enemies) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        this.rotation += 15 * dt;

        // Collisione con Nemici
        for (let e of enemies) {
            if (e.hp > 0 && Math.abs(e.x - this.x) < 40 && Math.abs(e.y - this.y) < 60) {
                e.hp -= 0.9; // Ridotto ulteriormente del 15% (da 1.1 a 0.9)
                e.isHit = 0.2;
                e.vx += this.vx * 0.2;
                playSound('zombie_hit', e.x, e.y);
                createSparks(this.x, this.y);
                this.life = 0; // Distrutto all'impatto
                return;
            }
        }
    }

    draw(ctx, camera) {
        let sx = this.x - camera.x;
        let sy = this.y - camera.y;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(this.rotation);
        
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00FFFF';
        ctx.fillStyle = '#FFF';

        // Disegno Stella Ninja (Croce Cross)
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
            ctx.rotate(Math.PI / 2);
            ctx.moveTo(0, 0);
            ctx.lineTo(10, 0);
            ctx.lineTo(0, 15);
            ctx.lineTo(-10, 0);
        }
        ctx.fill();
        ctx.restore();
    }
}

// ==========================================
// 3. CLASSE WORLD (Generazione Procedurale e Strutture)
// ==========================================
class World {
    constructor() {
        this.platforms = [];
        this.backgrounds = [];
        this.interactables = [];
        this.decorations = [];
        this.mapWidth = 100000;
        
        // --- SISTEMA GRID PER OTTIMIZZAZIONE ---
        this.gridSize = 2000; // Dimensione cella grid
        this.grid = {}; // { index: { platforms: [], decorations: [], interactables: [] } }
        this.initPatterns(ctx);
        this.generateWorld();
    }

    getHillHeight(x, layer = 'mid') {
        // Genera un profilo collinare basato su onde sinusoidali sovrapposte
        if (layer === 'far') {
            return Math.sin(x * 0.0004) * 25 + Math.sin(x * 0.0011) * 10;
        } else {
            return Math.sin(x * 0.0008) * 20 + Math.sin(x * 0.0015) * 8;
        }
    }

    addToGrid(obj, type) {
        let startIdx = Math.floor(obj.x / this.gridSize);
        let endIdx = Math.floor((obj.x + (obj.width || 0)) / this.gridSize);
        
        for (let i = startIdx; i <= endIdx; i++) {
            if (!this.grid[i]) this.grid[i] = { platforms: [], decorations: [], interactables: [], backgrounds: [] };
            this.grid[i][type].push(obj);
        }
    }

    initPatterns(ctx) {
        if (!this.stonePattern) {
            // Pattern Pietra Grotta (Primo Piano)
            let sCanvas = document.createElement('canvas');
            sCanvas.width = 32; sCanvas.height = 32;
            let sCtx = sCanvas.getContext('2d');
            sCtx.fillStyle = '#1C1C24'; sCtx.fillRect(0, 0, 32, 32);
            sCtx.fillStyle = '#0D0D14';
            sCtx.fillRect(0, 15, 32, 2);
            sCtx.fillRect(15, 0, 2, 16);
            sCtx.fillStyle = '#26262E';
            sCtx.fillRect(2, 2, 12, 2); sCtx.fillRect(18, 2, 12, 2);
            this.stonePattern = ctx.createPattern(sCanvas, 'repeat');

            // Pattern Fondo Grotta (Parallasse Interno)
            let sbCanvas = document.createElement('canvas');
            sbCanvas.width = 64; sbCanvas.height = 64;
            let sbCtx = sbCanvas.getContext('2d');
            sbCtx.fillStyle = '#0A0A0F'; sbCtx.fillRect(0, 0, 64, 64);
            sbCtx.fillStyle = '#050508';
            for (let i = 0; i < 10; i++) {
                sbCtx.fillRect(Math.random() * 64, Math.random() * 64, 8, 8);
            }
            this.caveBgPattern = ctx.createPattern(sbCanvas, 'repeat');
        }
    }

    // Algoritmo Procedurale: Taverna Fantasy
    renderFantasyHouse(ctx, startX, startY, w, h, isBg, isLooted) {
        let wallColor = isBg ? '#352515' : '#5C4033';
        let woodPillar = isBg ? '#1A1105' : '#2A1810';
        let roofColor = isBg ? '#2E1111' : '#4A1C1C';
        let roofOutline = isBg ? '#110505' : '#220A0A';
        let winColor = isLooted ? '#1A1A1A' : (isBg ? '#886600' : '#FFCC00');

        let pWidth = 14;

        ctx.fillStyle = wallColor;
        ctx.fillRect(startX, startY, w, h);

        ctx.fillStyle = woodPillar;
        for (let i = 10; i < h; i += 20) {
            ctx.fillRect(startX, startY + i, w, 2);
        }

        ctx.fillStyle = woodPillar;
        ctx.fillRect(startX - 5, startY, pWidth, h);
        ctx.fillRect(startX + w - pWidth + 5, startY, pWidth, h);

        let steps = 6;
        let stepH = 80 / steps;
        let stepW = (w + 40) / 2 / steps;

        ctx.fillStyle = '#1A1105';
        ctx.fillRect(startX + w - 40, startY - 70, 20, 50);

        for (let s = 0; s < steps; s++) {
            let currentY = startY - (s + 1) * stepH;
            let currentW = (w + 40) - (s * 2 * stepW);
            let currentX = startX - 20 + (s * stepW);

            ctx.fillStyle = roofOutline;
            ctx.fillRect(currentX, currentY, currentW, stepH);

            ctx.fillStyle = roofColor;
            ctx.fillRect(currentX + 2, currentY + 2, currentW - 4, stepH - 2);
        }

        let doorW = 40;
        let doorH = 50;
        let doorX = startX + w / 2 - doorW / 2;
        ctx.fillStyle = '#1A1105';
        ctx.fillRect(doorX - 4, startY + h - doorH - 4, doorW + 8, doorH + 4);
        ctx.fillStyle = '#3E2723';
        ctx.fillRect(doorX, startY + h - doorH, doorW, doorH);
        ctx.fillStyle = '#111';
        ctx.fillRect(doorX + 10, startY + h - doorH, 4, doorH);
        ctx.fillRect(doorX + 26, startY + h - doorH, 4, doorH);
        ctx.fillStyle = '#000';
        ctx.fillRect(doorX + doorW - 12, startY + h - doorH / 2, 8, 8);

        let winW = 30;
        let winH = 30;
        ctx.fillStyle = '#111';
        ctx.fillRect(startX + 20 - 4, startY + 30 - 4, winW + 8, winH + 8);
        ctx.fillStyle = winColor;
        ctx.fillRect(startX + 20, startY + 30, winW, winH);
        ctx.fillStyle = '#111';
        ctx.fillRect(startX + 20 + winW / 2 - 2, startY + 30, 4, winH);
        ctx.fillRect(startX + 20, startY + 30 + winH / 2 - 2, winW, 4);

        ctx.fillStyle = '#111';
        ctx.fillRect(startX + w - 20 - winW - 4, startY + 30 - 4, winW + 8, winH + 8);
        ctx.fillStyle = winColor;
        ctx.fillRect(startX + w - 20 - winW, startY + 30, winW, winH);
        ctx.fillStyle = '#111';
        ctx.fillRect(startX + w - 20 - winW / 2 - 2, startY + 30, 4, winH);
        ctx.fillRect(startX + w - 20 - winW, startY + 30 + winH / 2 - 2, winW, 4);
    }

    // Algoritmo Procedurale: Castello Castlevania Premium
    renderCastlevania(ctx, startX, startY, w, h, isBg, isLooted) {

        if (!this.brickPattern) {
            let bCanvas = document.createElement('canvas');
            bCanvas.width = 32; bCanvas.height = 16;
            let bCtx = bCanvas.getContext('2d');

            bCtx.fillStyle = '#32323D'; bCtx.fillRect(0, 0, 32, 16);
            bCtx.fillStyle = '#1C1C24';
            bCtx.fillRect(0, 7, 32, 2); bCtx.fillRect(0, 15, 32, 2);
            bCtx.fillRect(15, 0, 2, 8); bCtx.fillRect(7, 8, 2, 8); bCtx.fillRect(23, 8, 2, 8);
            bCtx.fillStyle = '#454555';
            bCtx.fillRect(0, 0, 15, 2); bCtx.fillRect(17, 0, 15, 2);
            bCtx.fillRect(0, 8, 7, 2); bCtx.fillRect(9, 8, 14, 2); bCtx.fillRect(25, 8, 7, 2);
            this.brickPattern = ctx.createPattern(bCanvas, 'repeat');

            let bgCanvas = document.createElement('canvas');
            bgCanvas.width = 32; bgCanvas.height = 16;
            let bgCtx = bgCanvas.getContext('2d');
            bgCtx.fillStyle = '#181822'; bgCtx.fillRect(0, 0, 32, 16);
            bgCtx.fillStyle = '#0D0D14';
            bgCtx.fillRect(0, 7, 32, 2); bgCtx.fillRect(0, 15, 32, 2);
            bgCtx.fillRect(15, 0, 2, 8); bgCtx.fillRect(7, 8, 2, 8); bgCtx.fillRect(23, 8, 2, 8);
            bgCtx.fillStyle = '#22222E';
            bgCtx.fillRect(0, 0, 15, 2); bgCtx.fillRect(17, 0, 15, 2);
            bgCtx.fillRect(0, 8, 7, 2); bgCtx.fillRect(9, 8, 14, 2); bgCtx.fillRect(25, 8, 7, 2);
            this.bgBrickPattern = ctx.createPattern(bgCanvas, 'repeat');
        }

        let wallPattern = isBg ? this.bgBrickPattern : this.brickPattern;
        let shadowColor = isBg ? '#0D0D14' : '#1C1C24';
        let highlightColor = isBg ? '#22222E' : '#454555';
        let roofColor = isBg ? '#07070A' : '#111115';
        let windowBorder = isBg ? '#08080C' : '#111118';
        let glowColor = isLooted ? '#1A1A1A' : (isBg ? '#7A1111' : '#E62222');

        let keepWidth = w * 0.55;
        let keepX = startX + (w - keepWidth) / 2;
        let tWidth = w * 0.28;
        let tHeight = h * 1.35;
        let tY = startY - (tHeight - h);

        // Mura
        ctx.fillStyle = wallPattern;
        ctx.fillRect(keepX, startY, keepWidth, h);
        ctx.fillRect(startX, tY, tWidth, tHeight);
        ctx.fillRect(startX + w - tWidth, tY, tWidth, tHeight);

        // Colonne esterne (Volume prospettico 3D finto)
        ctx.fillStyle = shadowColor;
        ctx.fillRect(startX, tY, 6, tHeight);
        ctx.fillRect(startX + tWidth - 6, tY, 6, tHeight);
        ctx.fillRect(startX + w - tWidth, tY, 6, tHeight);
        ctx.fillRect(startX + w - 6, tY, 6, tHeight);
        ctx.fillStyle = highlightColor;
        ctx.fillRect(startX + 6, tY, 4, tHeight);
        ctx.fillRect(startX + w - tWidth + 6, tY, 4, tHeight);

        // Merlature blocky
        ctx.fillStyle = wallPattern;
        for (let i = 0; i < tWidth - 10; i += 16) {
            ctx.fillRect(startX + i + 4, tY - 14, 12, 14);
            ctx.fillRect(startX + w - tWidth + i + 4, tY - 14, 12, 14);
        }
        for (let i = 0; i < keepWidth - 10; i += 18) {
            ctx.fillRect(keepX + i + 5, startY - 14, 12, 14);
        }

        // Guglie voxel
        ctx.fillStyle = roofColor;
        function drawSpire(sx, sy, sw) {
            let steps = 14;
            let stepH = 90 / steps;
            let stepW = sw / 2 / steps;
            for (let s = 0; s < steps; s++) {
                ctx.fillRect(sx + (s * stepW), sy - (s * stepH) - stepH, sw - (s * 2 * stepW), stepH);
            }
        }
        drawSpire(startX - 5, tY - 14, tWidth + 10);
        drawSpire(startX + w - tWidth - 5, tY - 14, tWidth + 10);
        drawSpire(keepX, startY - 14, keepWidth);

        // Vetrate ad arco
        let renderGothicWindow = (wx, wy, ww, wh) => {
            ctx.fillStyle = windowBorder;
            ctx.beginPath();
            ctx.ellipse(wx + ww / 2, wy + ww / 2, ww / 2 + 4, ww / 2 + 4, 0, Math.PI, 0);
            ctx.fill();
            ctx.fillRect(wx - 4, wy + ww / 2, ww + 8, wh - ww / 2 + 4);

            ctx.fillStyle = glowColor;
            ctx.beginPath();
            ctx.ellipse(wx + ww / 2, wy + ww / 2, ww / 2, ww / 2, 0, Math.PI, 0);
            ctx.fill();
            ctx.fillRect(wx, wy + ww / 2, ww, wh - ww / 2);

            ctx.fillStyle = '#050505';
            ctx.fillRect(wx + ww / 2 - 2, wy, 4, wh);
            ctx.fillRect(wx, wy + wh / 2 - 2, ww, 4);
            ctx.fillRect(wx, wy + wh / 2 - 16, ww, 4);
        };
        renderGothicWindow(startX + tWidth / 2 - 10, tY + 50, 20, 50);
        renderGothicWindow(startX + w - tWidth / 2 - 10, tY + 50, 20, 50);
        renderGothicWindow(keepX + keepWidth / 2 - 18, startY + 50, 36, 70);

        // Portone Demoniaco in Ferro Nero
        let doorW = 70;
        let doorH = 70;
        let doorX = keepX + keepWidth / 2 - doorW / 2;
        let doorY = startY + h - doorH - 4;

        ctx.fillStyle = windowBorder;
        ctx.beginPath();
        ctx.ellipse(doorX + doorW / 2, doorY, doorW / 2 + 6, doorW / 2 + 6, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(doorX - 6, doorY, doorW + 12, doorH + 4);

        ctx.fillStyle = '#050505';
        ctx.beginPath();
        ctx.ellipse(doorX + doorW / 2, doorY, doorW / 2, doorW / 2, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(doorX, doorY, doorW, doorH + 4);

        // Cancello Spinato (sparisce se lo ispezioni)
        if (!isLooted) {
            ctx.fillStyle = '#333';
            for (let j = 0; j < 8; j++) {
                ctx.fillRect(doorX + 3 + (j * 9), doorY - 30, 4, doorH + 30);
            }
            ctx.fillStyle = '#111';
            for (let j = 0; j < 8; j++) {
                ctx.fillRect(doorX + 2 + (j * 9), doorY + doorH, 6, 12);
            }
        }
    }

    generateWorld() {
        let currentX = 0;
        const groundLevel = 600;

        // = Background Generation =
        let bgX = -1000;
        const MAP_SIZE = this.mapWidth;
        while (bgX < MAP_SIZE) {
            let choice = Math.random();
            let type = 'tree';
            let width = 100;

            if (choice > 0.8) {
                type = 'castle';
                width = 300;
            } else if (choice > 0.5) {
                type = 'house';
                width = 150;
            }

            let bgObj = {
                x: bgX,
                y: 0, // Non usato: la Y viene calcolata dinamicamente in drawParallax
                type: type,
                width: width
            };
            this.backgrounds.push(bgObj);
            this.addToGrid(bgObj, 'backgrounds');

            bgX += width + Math.random() * 400 + 100;
        }

        // = Foreground Platforms Generation =
        while (currentX < MAP_SIZE) {

            // 1. Pianura di base
            let plainLength = 600 + Math.random() * 800;
            let plat = { x: currentX, y: groundLevel, width: plainLength, height: 800 };
            this.platforms.push(plat);
            this.addToGrid(plat, 'platforms');

            // 2. Edifici fisici esplorabili
            if (plainLength > 800 && Math.random() > 0.6) {
                let isCastle = Math.random() > 0.7;
                let bWidth = isCastle ? 350 : 180;
                let bHeight = isCastle ? 250 : 150;
                let bX = currentX + (plainLength / 2) - (bWidth / 2);
                let bY = groundLevel - bHeight;

                // Hitbox del tetto
                let roof = { x: bX, y: bY, width: bWidth, height: 20 };
                this.platforms.push(roof);
                this.addToGrid(roof, 'platforms');

                let inter = {
                    x: bX, y: bY, width: bWidth, height: bHeight,
                    type: isCastle ? 'castle' : 'house',
                    doorX: bX + bWidth / 2 - 30,
                    doorWidth: 60,
                    looted: false
                };
                this.interactables.push(inter);
                this.addToGrid(inter, 'interactables');
            }

            // 3. Piattaforme fluttuanti (Jump challenge)
            if (Math.random() > 0.4) {
                let p1 = { x: currentX + 200, y: groundLevel - 150, width: 200, height: 20 };
                this.platforms.push(p1);
                this.addToGrid(p1, 'platforms');
                if (Math.random() > 0.5) {
                    let p2 = { x: currentX + 500, y: groundLevel - 280, width: 150, height: 20 };
                    this.platforms.push(p2);
                    this.addToGrid(p2, 'platforms');
                }
            }

            currentX += plainLength;            // 4. Crepacci sotterranei (Grotte Giganti & Esplorabili)
            if (currentX < MAP_SIZE - 1000 && Math.random() > 0.2) {
                let gapWidth = 600 + Math.random() * 600;
                let caveDepth = groundLevel + 280 + Math.random() * 200;

                // --- PIATTAFORME A MENSOLE SOVRAPPOSTE (SCALA FACILE) ---
                let cavePlatforms = [];
                let currentY = caveDepth - 120; // Partiamo dal basso verso l'alto
                let side = 1; // 1 = Sinistra, -1 = Destra

                while (currentY > groundLevel + 20) {
                    // Ogni piattaforma è larga poco più di metà grotta per garantire sovrapposizione al centro
                    let pw = (gapWidth / 2) + 40 + Math.random() * 40;
                    // Se side==1 si aggancia a sinistra, altrimenti a destra
                    let px = (side === 1) ? currentX : currentX + gapWidth - pw;

                    let plat = { x: px, y: currentY, width: pw, height: 20, isStairs: true };
                    cavePlatforms.push(plat);
                    this.platforms.push(plat);
                    this.addToGrid(plat, 'platforms');

                    currentY -= 110; // Salto verticale fisso, attraversabile dal basso grazie al motore pass-through
                    side *= -1;
                }

                // Ponte in legno per i crepacci molto larghi
                if (gapWidth > 800) {
                    let bridge = {
                        x: currentX + gapWidth / 2 - 200,
                        y: groundLevel - 40,
                        width: 400, height: 15,
                        isBridge: true
                    };
                    this.platforms.push(bridge);
                    this.addToGrid(bridge, 'platforms');
                }

                // --- SCALA A PIOLI MINERARIA ---
                let ladderX = currentX + 80 + Math.random() * (gapWidth - 160);
                let ladderY = groundLevel - 40; 
                // La scala termina ora esattamente al livello del fondo grotta (caveDepth)
                let ladderHeight = caveDepth - ladderY; 

                let ladder = {
                    type: 'ladder',
                    x: ladderX,
                    y: ladderY,
                    width: 40,
                    height: ladderHeight
                };
                this.interactables.push(ladder);
                this.addToGrid(ladder, 'interactables');

                // Pareti di Roccia rimosse per pulire visivamente e fisicamente la grotta

                // Soffitto Irregolare rimosso per permettere l'uscita in superficie

                // Pavimento Organico
                let stepW = 150;
                for (let ix = 0; ix < gapWidth; ix += stepW) {
                    let cPlat = {
                        x: currentX + ix, y: caveDepth + (Math.random() - 0.5) * 40,
                        width: stepW + 10, height: 800, isCave: true
                    };
                    this.platforms.push(cPlat);
                    this.addToGrid(cPlat, 'platforms');
                }

                // --- VITA & DECORAZIONI ---
                let numMinerals = Math.floor(gapWidth / 60);
                for (let i = 0; i < numMinerals; i++) {
                    let mColors = ['#444', '#CCC', '#FFD700'];
                    let deco = {
                        type: 'mineral', color: mColors[Math.floor(Math.random() * 3)],
                        x: currentX + Math.random() * gapWidth, y: caveDepth + Math.random() * 400, size: 4 + Math.random() * 6
                    };
                    this.decorations.push(deco);
                    this.addToGrid(deco, 'decorations');
                }

                let numCaveZombies = Math.floor(gapWidth / 300) + 1;
                for (let i = 0; i < numCaveZombies; i++) {
                    // Spawn Zombie Bianchi nelle grotte
                    enemies.push(new Zombie(currentX + 100 + Math.random() * (gapWidth - 200), caveDepth - 80, 'white'));
                }

                // Stalattiti agganciate alle nuove piattaforme procedurali
                cavePlatforms.forEach(plat => {
                    if (Math.random() > 0.4) {
                        let stala = {
                            type: 'stalactite', x: plat.x + 10 + Math.random() * (plat.width - 20), y: plat.y + plat.height, scale: 0.8 + Math.random()
                        };
                        this.decorations.push(stala);
                        this.addToGrid(stala, 'decorations');
                    }
                });

                // Cristalli extra nel profondo
                let numCrystals = Math.floor(gapWidth / 150) + 2;
                for (let i = 0; i < numCrystals; i++) {
                    let crystal = {
                        type: 'crystal', color: ['#00FFFF', '#FF00FF', '#7FFF00'][Math.floor(Math.random() * 3)],
                        x: currentX + Math.random() * gapWidth, y: caveDepth + (Math.random() - 0.5) * 100, scale: 0.7 + Math.random() * 1.3
                    };
                    this.decorations.push(crystal);
                    this.addToGrid(crystal, 'decorations');
                }

                // --- BAULI DEL TESORO (Chest Spawning) ---
                if (Math.random() > 0.6) {
                    let chest = {
                        type: 'chest',
                        looted: false,
                        x: currentX + Math.random() * (gapWidth - 60),
                        y: caveDepth - 50,
                        width: 60, height: 50,
                        doorX: currentX, doorWidth: gapWidth // Area di interazione
                    };
                    this.interactables.push(chest);
                    this.addToGrid(chest, 'interactables');
                }

                currentX += gapWidth;
            }
        }
    }


    drawParallax(ctx, camera) {
        let farFactor = 0.2;
        let midFactor = 0.5;
        let horizonY = 450 - camera.y;

        // Una sola layer di colline: cielo -> colline verdi, nessun layer grigio intermedio
        ctx.beginPath();
        ctx.moveTo(-1, canvas.height);
        for (let x = 0; x <= canvas.width; x += 20) {
            let worldX = (camera.x * midFactor) + x;
            let hillY = horizonY + this.getHillHeight(worldX, 'mid');
            ctx.lineTo(x, hillY);
        }
        ctx.lineTo(canvas.width + 1, canvas.height);
        ctx.closePath();

        // Pattern erba con tinta scura per differenziarsi dal primo piano
        if (typeof gfx !== 'undefined' && gfx.grass && gfx.grass.complete && gfx.grass.naturalWidth > 0) {
            ctx.save();
            let grassPattern = ctx.createPattern(gfx.grass, 'repeat');
            ctx.fillStyle = grassPattern;
            ctx.fill();
            ctx.fillStyle = 'rgba(20, 35, 20, 0.78)'; // Tinta verde scura per dare profondita'
            ctx.fill();
            ctx.restore();
        } else {
            ctx.fillStyle = '#3A4D3A';
            ctx.fill();
        }

        // Bordo netto in cima alle colline
        ctx.strokeStyle = '#4A7A4A';
        ctx.lineWidth = 3;
        ctx.stroke();


        // --- ENTITIES FROM GRID ---
        let startIdx = Math.floor((camera.x * midFactor) / this.gridSize);
        let endIdx = Math.floor(((camera.x * midFactor) + canvas.width) / this.gridSize);

        let seen = new Set();
        for (let i = startIdx; i <= endIdx; i++) {
            let cell = this.grid[i];
            if (cell && cell.backgrounds) {
                cell.backgrounds.forEach(bg => {
                    if (seen.has(bg)) return;
                    seen.add(bg);

                    let screenX = bg.x - (camera.x * midFactor);
                    // Calcolo la Y della collina ESATTAMENTE come viene disegnata,
                    // per garantire perfetta integrazione tra oggetto e terreno
                    let hillSurfaceY = horizonY + this.getHillHeight((camera.x * midFactor) + screenX, 'mid');
                    let screenY = hillSurfaceY; // L'oggetto poggia esattamente sulla superficie

                    if (screenX + bg.width > 0 && screenX < canvas.width) {
                        if (bg.type === 'tree') {
                            let cx = screenX + bg.width / 2;
                            let cy = screenY;

                            ctx.fillStyle = '#1A1100';
                            ctx.fillRect(cx - 14, cy - 112, 28, 114);
                            ctx.fillStyle = '#3E2723';
                            ctx.fillRect(cx - 12, cy - 110, 24, 110);
                            ctx.fillStyle = '#5D4037';
                            ctx.fillRect(cx - 12, cy - 110, 8, 110);
                            ctx.fillStyle = '#2A1810';
                            ctx.fillRect(cx - 2, cy - 90, 10, 8);
                            ctx.fillRect(cx - 8, cy - 50, 8, 8);
                            ctx.fillRect(cx, cy - 20, 10, 8);

                            let leavesPos = [
                                { x: -45, y: -130, w: 90, h: 40 },
                                { x: -65, y: -160, w: 130, h: 50 },
                                { x: -55, y: -190, w: 110, h: 50 },
                                { x: -35, y: -220, w: 70, h: 50 },
                                { x: -15, y: -240, w: 30, h: 30 }
                            ];

                            leavesPos.forEach(leaf => {
                                ctx.fillStyle = '#051A05';
                                ctx.fillRect(cx + leaf.x - 2, cy + leaf.y - 2, leaf.w + 4, leaf.h + 4);
                                ctx.fillStyle = '#1B5E20';
                                ctx.fillRect(cx + leaf.x, cy + leaf.y, leaf.w, leaf.h);
                                ctx.fillStyle = '#2E7D32';
                                ctx.fillRect(cx + leaf.x + 2, cy + leaf.y + 2, leaf.w - 10, leaf.h / 2.5);
                            });

                        } else if (bg.type === 'house') {
                            this.renderFantasyHouse(ctx, screenX, screenY - 120, bg.width, 120, true, false);
                        } else if (bg.type === 'castle') {
                            this.renderCastlevania(ctx, screenX, screenY - 250, bg.width, 250, true, false);
                        }
                    }
                });
            }
        }
    }

    drawForeground(ctx, camera) {
        let startIdx = Math.floor(camera.x / this.gridSize);
        let endIdx = Math.floor((camera.x + canvas.width) / this.gridSize);

        let visiblePlatforms = [];
        let visibleDecorations = [];
        let visibleInteractables = [];
        let seen = new Set();

        for (let i = startIdx - 1; i <= endIdx + 1; i++) {
            let cell = this.grid[i];
            if (cell) {
                cell.platforms.forEach(p => { if (!seen.has(p)) { seen.add(p); visiblePlatforms.push(p); } });
                cell.decorations.forEach(d => { if (!seen.has(d)) { seen.add(d); visibleDecorations.push(d); } });
                cell.interactables.forEach(it => { if (!seen.has(it)) { seen.add(it); visibleInteractables.push(it); } });
            }
        }

        // --- 1. FONDO GROTTA (PROFONDITÀ 3D E MASCHERAMENTO) ---
        visiblePlatforms.forEach(plat => {
            if (plat.isCave) {
                let maskX = plat.x - camera.x - 120;
                let maskY = (600 - camera.y);
                let maskW = plat.width + 240;
                let maskH = 2000;

                if (maskX + maskW > 0 && maskX < canvas.width) {
                    ctx.fillStyle = '#050505';
                    ctx.fillRect(maskX, maskY, maskW, maskH);

                    let screenX = plat.x - camera.x;
                    ctx.save();
                    ctx.fillStyle = this.caveBgPattern;
                    let offsetX = (plat.x - camera.x) * 0.05;
                    ctx.translate(offsetX, 0);
                    ctx.fillRect(screenX - offsetX, (600 - camera.y), plat.width, 2000);
                    ctx.restore();

                    let grad = ctx.createLinearGradient(0, (600 - camera.y), 0, plat.y - camera.y);
                    grad.addColorStop(0, 'rgba(0,0,0,0.9)');
                    grad.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = grad;
                    ctx.fillRect(maskX, (600 - camera.y), maskW, plat.y - 600);
                }
            }
        });

        // --- 2. PIATTAFORME E PARETI ---
        visiblePlatforms.forEach(plat => {
            let screenX = plat.x - camera.x;
            let screenY = plat.y - camera.y;

            if (screenX + plat.width > 0 && screenX < canvas.width) {
                if (plat.isCave || plat.isWall) {
                    ctx.save();
                    ctx.translate(screenX, screenY);
                    ctx.fillStyle = this.stonePattern;
                    ctx.fillRect(0, 0, plat.width, plat.height);
                    ctx.strokeStyle = '#0D0D14';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(0, 0, plat.width, plat.height);
                    ctx.restore();
                } else {
                    ctx.fillStyle = '#3E2723';
                    ctx.fillRect(screenX, screenY, plat.width, plat.height);
                }

                if (!plat.isCave && !plat.isWall) {
                    let grassThickness = Math.min(40, plat.height);
                    if (typeof gfx !== 'undefined' && gfx.grass && gfx.grass.complete && gfx.grass.naturalWidth > 0) {
                        let pattern = ctx.createPattern(gfx.grass, 'repeat');
                        ctx.fillStyle = pattern;
                        ctx.save();
                        ctx.translate(screenX, screenY);
                        ctx.fillRect(0, 0, plat.width, grassThickness);
                        ctx.restore();
                    } else {
                        ctx.fillStyle = '#4a7023';
                        ctx.fillRect(screenX, screenY, plat.width, grassThickness);
                    }
                }
            }
        });

        // --- 3. DECORAZIONI ---
        visibleDecorations.forEach(dec => {
            let screenX = dec.x - camera.x;
            let screenY = dec.y - camera.y;

            if (screenX > -200 && screenX < canvas.width + 200) {
                if (dec.type === 'stalactite') {
                    ctx.fillStyle = '#0F0F0F';
                    let steps = 4;
                    let stH = dec.scale * 15;
                    let stW = dec.scale * 20;
                    for (let i = 0; i < steps; i++) {
                        let currentW = stW - (i * (stW / steps));
                        let currentX = screenX - currentW / 2;
                        let currentY = screenY + (i * stH);
                        ctx.fillRect(currentX, currentY, currentW, stH);
                    }
                } else if (dec.type === 'mushroom') {
                    ctx.save();
                    ctx.translate(screenX, screenY);
                    ctx.scale(dec.scale, dec.scale);
                    ctx.shadowColor = '#00FFCC';
                    ctx.shadowBlur = 10 + Math.sin(Date.now() / 500) * 5;
                    ctx.fillStyle = '#DEDEDE';
                    ctx.fillRect(-1, -10, 2, 10);
                    ctx.fillStyle = '#00FFCC';
                    ctx.fillRect(-6, -14, 12, 4);
                    ctx.fillRect(-4, -16, 8, 2);
                    ctx.restore();
                } else if (dec.type === 'mineral') {
                    ctx.save();
                    ctx.translate(screenX, screenY);
                    ctx.rotate(Math.PI / 4);
                    ctx.fillStyle = dec.color;
                    ctx.fillRect(-dec.size / 2, -dec.size / 2, dec.size, dec.size);
                    ctx.fillStyle = 'white';
                    ctx.fillRect(-dec.size / 4, -dec.size / 4, dec.size / 4, dec.size / 4);
                    ctx.restore();
                } else if (dec.type === 'vine') {
                    ctx.save();
                    ctx.translate(screenX, screenY);
                    ctx.fillStyle = '#1A3311';
                    let segments = Math.floor(dec.length / 10);
                    for (let i = 0; i < segments; i++) {
                        let sway = Math.sin(Date.now() / 1000 + i / 5) * 5;
                        ctx.fillRect(sway, i * 10, 3, 10);
                        if (i % 3 === 0) {
                            ctx.fillStyle = '#2D5A27';
                            ctx.fillRect(sway - 4, i * 10 + 2, 5, 4);
                            ctx.fillStyle = '#1A3311';
                        }
                    }
                    ctx.restore();
                } else if (dec.type === 'crystal') {
                    ctx.save();
                    ctx.translate(screenX, screenY);
                    ctx.rotate(Math.sin(Date.now() / 500 + dec.x) * 0.2);
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = dec.color;
                    ctx.fillStyle = dec.color;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(-8 * dec.scale, -20 * dec.scale);
                    ctx.lineTo(0, -35 * dec.scale);
                    ctx.lineTo(8 * dec.scale, -20 * dec.scale);
                    ctx.closePath();
                    ctx.fill();
                    ctx.fillStyle = '#FFF';
                    ctx.globalAlpha = 0.5;
                    ctx.beginPath();
                    ctx.moveTo(-2 * dec.scale, -10 * dec.scale);
                    ctx.lineTo(0, -25 * dec.scale);
                    ctx.lineTo(2 * dec.scale, -10 * dec.scale);
                    ctx.fill();
                    ctx.restore();
                }
            }
        });

        // --- 4. INTERACTABLES ---
        visibleInteractables.forEach(b => {
            let screenX = b.x - camera.x;
            let screenY = b.y - camera.y;

            if (screenX + b.width > 0 && screenX < canvas.width) {
                if (b.type === 'house') {
                    this.renderFantasyHouse(ctx, screenX, screenY, b.width, b.height, false, b.looted);
                } else if (b.type === 'castle') {
                    this.renderCastlevania(ctx, screenX, screenY, b.width, b.height, false, b.looted);
                    ctx.fillStyle = b.looted ? '#331111' : '#800000';
                    ctx.fillRect(screenX + 35, screenY + 120, 25, 90);
                    ctx.fillRect(screenX + b.width - 60, screenY + 120, 25, 90);
                } else if (b.type === 'ladder') {
                    ctx.fillStyle = '#2A1810';
                    ctx.fillRect(screenX, screenY, 6, b.height);
                    ctx.fillRect(screenX + b.width - 6, screenY, 6, b.height);
                    ctx.fillStyle = '#3E2723';
                    for (let n = 10; n < b.height - 10; n += 30) {
                        ctx.fillRect(screenX + 6, screenY + n, b.width - 12, 6);
                    }
                } else if (b.type === 'chest') {
                    this.drawChest(ctx, screenX, screenY, b.looted);
                }
            }
        });
    }

    drawChest(ctx, x, y, isLooted) {
        let w = 60;
        let h = 45;

        // Corpo del Baule (Legno Scuro)
        ctx.fillStyle = '#4e342e';
        ctx.fillRect(x, y + 15, w, h - 15);

        // Coperchio Pixel Art
        ctx.fillStyle = '#6d4c41';
        if (isLooted) {
            ctx.fillRect(x, y - 5, w, 20);
            ctx.fillStyle = '#FFD700'; // Oro interno
            ctx.fillRect(x + 10, y + 5, w - 20, 8);
        } else {
            ctx.fillRect(x, y, w, 20);
            // Rinforzo orizzontale
            ctx.fillStyle = '#3e2723';
            ctx.fillRect(x, y + 8, w, 4);
        }

        // Rinforzi in Ferro (Pixel Bands)
        ctx.fillStyle = '#212121';
        ctx.fillRect(x + 10, y + (isLooted ? -5 : 0), 8, isLooted ? 20 : h);
        ctx.fillRect(x + w - 18, y + (isLooted ? -5 : 0), 8, isLooted ? 20 : h);

        // Serratura in Oro
        if (!isLooted) {
            ctx.fillStyle = '#fbc02d';
            ctx.fillRect(x + w / 2 - 6, y + 15, 12, 10);
            ctx.fillStyle = '#000';
            ctx.fillRect(x + w / 2 - 1, y + 18, 2, 4);
        }
    }

    // --- NUOVA FUNZIONE DI COLLISIONE PER IA ---
    isSolid(x, y) {
        // Controlla se il punto (x,y) si trova all'interno di una piattaforma solida (non pass-through)
        return this.platforms.some(p => {
            let isOneWay = p.height <= 30 || p.isStairs || p.isBridge;
            if (isOneWay) return false; // Le piattaforme sottili non bloccano il cammino laterale
            return x >= p.x && x <= p.x + p.width && y >= p.y && y <= p.y + p.height;
        });
    }
}

// ==========================================
// 4. CLASSE PLAYER (Meccanica, Fisica e rendering Anime-Spada)
// ==========================================
class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 40;
        this.height = 80;

        this.vx = 0;
        this.vy = 0;
        this.speed = 400;
        this.jumpPower = -700; // Bilanciato (prima -780)
        this.gravity = 1500;

        this.isGrounded = false;
        this.wasGrounded = false;
        this.coyoteTimer = 0; 
        this.hasDoubleJumped = false; 
        this.canDoubleJump = false; // Impedisce il doppio salto istantaneo se si tiene premuto Space

        // Meccaniche Combattimento Spada
        this.isAttacking = false;
        this.attackTimer = 0;
        this.attackDuration = 0.4; 
        this.hasLunged = false;
        this.direction = 1;

        this.health = 100;
        this.score = 0;

        // --- PROPRIETÀ ANIMAZIONE ---
        this.visualScaleX = 1;
        this.visualScaleY = 1;
        this.trail = []; // Scia della spada
        this.wasGrounded = false;

        // --- MECCANICHE DIFENSIVE (SCUDO & ARMATURA) ---
        this.hasShield = false;
        this.shieldDurability = 0;
        this.isParrying = false;
        this.hasArmor = false; // Riduce i danni del 50%
        this.hasSupportScroll = false;
        this.lastSupportDay = 0;

        // --- SISTEMA LEGENDARY BUFFS ---
        this.buffType = null; // 'OVERCLOCK', 'LIFESTEAL', 'HALO'
        this.buffTimer = 0;
        
        // --- PORTATA ATTACCO DINAMICA ---
        this.weaponRangeX = 85;
        this.weaponRangeY = 70;

        // --- MECCANICHE RONIN (Brezza del Guerriero) ---
        this.speedBoostTimer = 0; 
    }

    update(dt, world, enemies) {
        // --- LOGICA INPUT DIFENSIVA (PARATA) ---
        this.isParrying = (keys['ShiftLeft'] || keys['ShiftRight'] || keys['MouseRight']) && !this.isAttacking;

        // --- GESTIONE LEGENDARY BUFFS ---
        if (this.buffTimer > 0) {
            this.buffTimer -= dt;
            if (this.buffTimer <= 0) {
                this.buffType = null;
                showStyleTip("BONUS LEGENDARIO ESAURITO! ⏳");
            }

            // Effetti visivi continui
            if (this.buffType === 'OVERCLOCK') {
                createSparks(this.x + Math.random() * this.width, this.y + Math.random() * this.height, '#00FFFF');
                this.attackDuration = 0.1; // Cyber Velocissimo
            } else if (this.buffType === 'LIFESTEAL') {
                createDust(this.x + this.width/2, this.y + this.height/2, 1, '#FF0000');
            }
        } else {
            // Ripristino cooldown base
            if (playerStyle === 'CYBER') this.attackDuration = 0.2;
            else if (playerStyle === 'PALADIN') this.attackDuration = 0.8;
            else this.attackDuration = 0.4;
        }

        // --- OTTIMIZZAZIONE SPAZIALE: FILTRO DI PROSSIMITÀ (Culling) ---
        const scanRange = 1500;
        const localPlatforms = world.platforms.filter(p => Math.abs(p.x - this.x) < scanRange);
        const localInteractables = world.interactables.filter(i => Math.abs(i.x - this.x) < scanRange);

        // --- LOGICA SCALA A PIOLI ---
        let activeLadder = null;
        let pCenterX = this.x + this.width / 2;
        localInteractables.forEach(i => {
            if (i.type === 'ladder') {
                if (pCenterX > i.x && pCenterX < i.x + i.width &&
                    this.y + this.height + 10 > i.y && this.y < i.y + i.height) {
                    activeLadder = i;
                }
            }
        });

        // Aggancio intenzionale alla scala con W (Su) o S (Giù)
        if (activeLadder && (keys['KeyW'] || keys['ArrowUp'] || keys['KeyS'] || keys['ArrowDown']) && !this.isClimbing) {
            this.isClimbing = true;
            this.x = activeLadder.x + activeLadder.width / 2 - this.width / 2;
            
            // Se montiamo la scala da sopra premendo GIÙ, diamo una spinta iniziale per superare il bordo
            if (keys['KeyS'] || keys['ArrowDown']) {
                this.y += 12; // Scavalca il bordo della piattaforma
            }
        }

        // Sgancio forzato se non si tocca più la scala
        if (!activeLadder) {
            this.isClimbing = false;
        }

        // Loop Esclusivo dell'arrampicata (esclude la gravità e i controlli classici)
        if (this.isClimbing) {
            this.vx = 0;
            this.vy = 0; // Gravità disattivata sulla scala

            if (keys['KeyW'] || keys['ArrowUp']) {
                this.vy = -200; // Arrampicata in su
            } else if (keys['KeyS'] || keys['ArrowDown']) {
                this.vy = 200; // Calata in giù
            }

            // --- PROTEZIONE CADUTA SOTTO-MAPPA ---
            // Se scendiamo, controlliamo se tocchiamo un pavimento solido
            if (this.vy > 0) {
                world.platforms.forEach(p => {
                    if (this.x + this.width > p.x && this.x < p.x + p.width) {
                        // Atterriamo solo se siamo vicini alla fine della scala o NON stiamo premendo attivamente GIÙ
                        // Questo evita di bloccarsi sulla piattaforma di partenza quando si scende
                        let atBottom = this.y + this.height > activeLadder.y + activeLadder.height - 30;
                        let notPressingDown = !(keys['KeyS'] || keys['ArrowDown']);

                        if (this.y + this.height > p.y && this.y + this.height < p.y + 20 && (atBottom || notPressingDown)) {
                            this.isClimbing = false;
                            this.isGrounded = true;
                            this.y = p.y - this.height;
                            this.vy = 0;
                        }
                    }
                });
            }

            // Sbarco laterale dalla scala con A o D (Detaching)
            if (keys['KeyA'] || keys['ArrowLeft']) {
                this.isClimbing = false;
                this.vx = -this.speed * 0.5; // Piccolo balzo laterale per sbarcare
            } else if (keys['KeyD'] || keys['ArrowRight']) {
                this.isClimbing = false;
                this.vx = this.speed * 0.5;
            }

            // Lancio d'emergenza dalla scala con Spazio
            if (keys['Space']) {
                this.isClimbing = false;
                this.vy = this.jumpPower;
                // Se si premono anche direzioni laterali ci si lancia lontano
                if (keys['ArrowRight'] || keys['KeyD']) this.vx = this.speed;
                if (keys['ArrowLeft'] || keys['KeyA']) this.vx = -this.speed;
            }

            // Applica il solo movimento verticale e termina anticipatamente
            this.y += this.vy * dt;
            this.isGrounded = false;
            this.wasGrounded = false;

            // Ripristina l'elasticità visiva in caso fosse squashed e torna la forma originale
            this.visualScaleY += (1 - this.visualScaleY) * 0.15;
            this.visualScaleX += (1 - this.visualScaleX) * 0.15;

            return; // Interrompe il resto di update() evitando il conflitto con la fisica base
        }

        // Gestione Boost Velocità (Ronin)
        if (this.speedBoostTimer > 0) this.speedBoostTimer -= dt;

        // Calcola velocità in base alla parata e al possibile boost (Ronin)
        let boost = (this.speedBoostTimer > 0 && playerStyle === 'RONIN') ? 1.6 : 1.0; // Aumentato da 1.3 a 1.6 per maggior contrasto
        let currentMaxSpeed = (this.isParrying ? this.speed * 0.5 : this.speed) * boost;

        if (keys['ArrowRight'] || keys['KeyD']) {
            this.vx = currentMaxSpeed;
            this.direction = 1;
        } else if (keys['ArrowLeft'] || keys['KeyA']) {
            this.vx = -currentMaxSpeed;
            this.direction = -1;
        } else {
            // Più inerzia in aria per controllo fluido
            if (this.isGrounded) this.vx = 0;
            else this.vx *= 0.95;
        }

        // --- LOGICA SALTO & DOPPIO SALTO (FIXATA) ---
        // Gestione Coyote Time (permette il salto per 0.15s dopo aver lasciato una piattaforma)
        if (this.isGrounded) {
            this.coyoteTimer = 0.15; 
            this.canDoubleJump = false; // Reset dello stato
        } else {
            this.coyoteTimer -= dt;
            // Se rilasciamo Space in aria, abilitiamo la possibilità di fare il secondo salto
            if (!keys['Space']) {
                this.canDoubleJump = true;
            }
        }

        if (keys['Space'] && (this.isGrounded || this.coyoteTimer > 0)) {
            playSound('jump');
            this.vy = this.jumpPower;
            this.isGrounded = false;
            this.coyoteTimer = 0; 
            this.hasDoubleJumped = false;
            this.canDoubleJump = false; // Deve rilasciare Space per il prossimo salto
        } else if (keys['Space'] && this.canDoubleJump && !this.hasDoubleJumped && !this.isClimbing) {
            // --- DOPPIO SALTO OTTIMIZZATO ---
            playSound('jump');
            this.vy = this.jumpPower * 0.85; // Secondo salto leggermente ridotto per bilanciamento
            this.hasDoubleJumped = true;
            this.canDoubleJump = false; // Consumato
            createDust(this.x + this.width / 2, this.y + this.height, 5);
        }

        // Reset doppio salto quando si tocca terra (gestito nella collisione sotto)

        // --- SALTO VARIABILE (Controllo altezza) ---
        // Se il giocatore rilascia la barra spaziatrice mentre sta ancora salendo, 
        // freniamo bruscamente la salita per un salto più basso.
        if (this.vy < -100 && !keys['Space'] && !this.isClimbing) {
            this.vy *= 0.6; // Smorza la salita se hai rilasciato il tasto
        }

        // 1. FISICA ORIZZONTALE & COLLISIONE
        this.vy += this.gravity * dt; // Applica gravità
        this.x += this.vx * dt;
        if (this.x < 0) this.x = 0;

        world.platforms.forEach(p => {
            // "Piattaforme Unidirezionali" (One-Way): Tetti, Ponti, Mensole e Jump-pads
            // Sono attraversabili lateralmente e dal basso se sono sottili (height <= 30)
            let isOneWay = p.height <= 30 || p.isStairs || p.isBridge;
            if (isOneWay) return;

            // Controlla se siamo nell'area verticale della piattaforma
            if (this.y + this.height > p.y + 5 && this.y < p.y + p.height - 5) {
                // Collisione da sinistra (vado a destra)
                if (this.vx > 0 && this.x + this.width > p.x && this.x < p.x + 10) {
                    this.x = p.x - this.width;
                    this.vx = 0;
                }
                // Collisione da destra (vado a sinistra)
                else if (this.vx < 0 && this.x < p.x + p.width && this.x + this.width > p.x + p.width - 10) {
                    this.x = p.x + p.width;
                    this.vx = 0;
                }
            }
        });

        // 2. FISICA VERTICALE & COLLISIONE
        this.y += this.vy * dt;
        this.isGrounded = false;

        world.platforms.forEach(p => {
            // Controlla se siamo allineati orizzontalmente
            if (this.x < p.x + p.width - 5 && this.x + this.width > p.x + 5) {
                // Atterraggio (dall'alto)
                if (this.vy >= 0 && this.y + this.height >= p.y && this.y + this.height <= p.y + 20 + this.vy * dt) {
                    this.isGrounded = true;
                    this.vy = 0;
                    this.y = p.y - this.height;
                }
                // Urto soffitto (dal basso)
                else if (this.vy < 0 && this.y <= p.y + p.height && this.y >= p.y + p.height - 20) {
                    let isOneWay = p.height <= 30 || p.isStairs || p.isBridge;
                    if (!isOneWay) {
                        this.vy = 0;
                        this.y = p.y + p.height;
                    }
                }
            }
        });

        // --- GESTIONE SQUASH & STRETCH (Atterraggio) ---
        if (this.isGrounded && !this.wasGrounded) {
            this.visualScaleY = 0.7; // Si schiaccia
            this.visualScaleX = 1.3; // Si allarga
            createDust(this.x + this.width / 2, this.y + this.height);
            this.hasDoubleJumped = false; // Reset ufficiale del doppio salto!
        }
        this.wasGrounded = this.isGrounded;

        // Torna lentamente alla forma originale (Molla elastica)
        this.visualScaleY += (1 - this.visualScaleY) * 0.15;
        this.visualScaleX += (1 - this.visualScaleX) * 0.15;

        if (this.y > 2000 || this.x > world.mapWidth + 500) {
            this.health = 0;
        }

        let shieldStatus = this.hasShield ? " | ESCUDO DIVINO: ATTIVO 🛡️✨" : "";
        let hUI = document.getElementById('healthUI');
        if (hUI) hUI.innerText = `Salute: ${Math.floor(this.health)}${shieldStatus}`;

        // Sistema d'Attacco (Differenziato per Eroe)
        if ((keys['Enter'] || keys['MouseLeft']) && !this.isAttacking) {
            if (playerStyle === 'CYBER') {

                // ATTACCO A DISTANZA: Lancia Stella Ninja
                let shurikenVx = this.direction * 1000;
                projectiles.push(new Projectile(this.x + this.width/2, this.y + 40, shurikenVx, -100, this));
                playSound('slash');
                
                this.isAttacking = true;
                this.attackTimer = 0.2; // Cooldown rapido per shurikens
            } else {
                // ATTACCO CLASSICO: Spada
                playSound('slash');
                this.isAttacking = true;
                this.attackTimer = this.attackDuration;
            }

            keys['MouseLeft'] = false;
            keys['Enter'] = false;
        }

        if (this.isAttacking) {
            if (playerStyle !== 'CYBER') {
                let progress = (this.attackDuration - this.attackTimer) / this.attackDuration;
                if (progress > 0.25 && progress < 0.65) {
                    if (!this.hasLunged) {
                        this.vx += this.direction * (this.isGrounded ? 450 : 250);
                        this.hasLunged = true;
                    }
                }
            }

            this.attackTimer -= dt;
            if (this.attackTimer <= 0) {
                this.isAttacking = false;
                this.hasLunged = false;
            }

            // --- COLLISIONI SPADA (Solo per Non-Cyber) ---
            if (playerStyle !== 'CYBER') {
                enemies.forEach(z => {
                    if (z.state !== 'dead' && Math.abs(z.x - this.x) < this.weaponRangeX && Math.abs(z.y - this.y) < this.weaponRangeY) {
                        if (z.isHit <= 0) {
                            z.hp -= (this.hasArmor ? 2 : 1.5);
                            z.isHit = 0.4;
                            z.vx = this.direction * 400;
                            z.vy = -150;
                            playSound('zombie_hit', z.x, z.y);
                            hitStopTimer = 0.08;
                            screenShake = 12;

                            // --- TRIGGER BOOST RONIN ---
                            if (playerStyle === 'RONIN') {
                                this.speedBoostTimer = 0.5; // Brezza del Guerriero ultra-rapida (0.5s)
                                showStyleTip('FLOW ATTIVO: +30% VELOCITÀ 💨');
                                
                                // --- EFFETTO LIFESTEAL (HANNYA MASK) ---
                                if (this.buffType === 'LIFESTEAL' && this.health < this.maxHealth) {
                                    this.health = Math.min(this.maxHealth, this.health + 5);
                                    createPixelDissolve(this.x, this.y, this.width, 20, ['#FF0000', '#FF4444']);
                                    let hUI = document.getElementById('healthUI');
                                    if (hUI) hUI.innerText = `Salute: ${Math.floor(this.health)}`;
                                }
                            }

                            // --- DANNO EXTRA PALADINO ---
                            if (playerStyle === 'PALADIN') {
                                z.hp -= 2.5; // Danno massiccio (Totale ~4-5)
                                z.vx = this.direction * 700; // Forte knockback
                            }
                        }
                    }
                });
            }
        }
    }

    draw(ctx, camera) {
        let screenX = this.x - camera.x;
        let screenY = this.y - camera.y;

        // --- 1. RENDERING LOGICA ANIMAZIONE (Pre-calcoli) ---
        let bob = 0;
        let runAnim = 0;
        if (this.isGrounded && Math.abs(this.vx) > 10) {
            runAnim = Math.sin(Date.now() / 120);
            bob = Math.abs(runAnim) * 5;
        }

        let armAngle = -Math.PI * 0.15; // Braccio leggermente in avanti
        let swordAngle = -Math.PI * 0.45; // Spada puntata verso l'avversario
        let bodyRotation = 0;
        let attackLunge = 0;
        let slashOpacity = 0;
        let slashStartArg = 0;
        let slashEndArg = 0;

        if (this.isAttacking) {
            let progress = (this.attackDuration - this.attackTimer) / this.attackDuration;
            if (progress < 0.25) {
                // CARICAMENTO: Alza la spada sopra la testa (High Back)
                let p = progress / 0.25;
                armAngle = (-Math.PI * 0.15) - p * (Math.PI * 0.7);
                swordAngle = (-Math.PI * 0.45) - p * (Math.PI * 0.3);
                bodyRotation = -0.15 * p;
            } else if (progress < 0.65) {
                // FENDENTE: Dall'alto verso il basso (Overhead)
                let p = (progress - 0.25) / 0.4;
                let startArm = -Math.PI * 0.85;
                let endArm = Math.PI * 0.4;
                armAngle = startArm + p * (endArm - startArm);
                swordAngle = (-Math.PI * 0.75) + p * (Math.PI * 1.2);
                attackLunge = p * 25;
                bodyRotation = -0.15 + p * 0.45;
                slashOpacity = 0.8;
                slashStartArg = startArm;
                slashEndArg = armAngle;
            } else {
                let p = (progress - 0.65) / 0.35;
                armAngle = (Math.PI * 0.4) - p * (Math.PI * 0.55);
                swordAngle = (Math.PI * 0.45) + p * (Math.PI * 0.1);
                attackLunge = 25 * (1 - p);
                bodyRotation = 0.3 * (1 - p);
            }
        } else {
            // Movimento della guardia
            armAngle += (runAnim * 0.1); 
            swordAngle += (runAnim * 0.05);
        }

        let leg1Angle, leg2Angle;
        if (this.isGrounded) {
            leg1Angle = runAnim * 0.6;
            leg2Angle = -runAnim * 0.6;
        } else {
            if (this.vy < -50) {
                leg1Angle = Math.PI * 0.45;
                leg2Angle = -Math.PI * 0.15;
                bodyRotation -= 0.15;
            } else if (this.vy > 50) {
                leg1Angle = -Math.PI * 0.1;
                leg2Angle = Math.PI * 0.2;
                bodyRotation += 0.05;
            } else {
                leg1Angle = Math.PI * 0.2;
                leg2Angle = Math.PI * 0.2;
            }
        }

        // --- 2. TRASFORMAZIONI MONDO -> SCHERMO ---
        ctx.save();
        ctx.translate(screenX + this.width / 2 + (attackLunge * this.direction), screenY + this.height / 2 - bob);

        if (this.direction === -1) ctx.scale(-1, 1);
        ctx.rotate(bodyRotation);
        ctx.scale(this.visualScaleX, this.visualScaleY);

        let mainColor, shadowColor, accentColor, swordGlow;
        
        switch(playerStyle) {
            case 'RONIN':
                mainColor = '#800000'; // Dark Red
                shadowColor = '#400000';
                accentColor = '#FF0000'; // Headband
                swordGlow = '#FF4500'; // Fire
                break;
            case 'PALADIN':
                mainColor = '#FFD700'; // Gold
                shadowColor = '#B8860B';
                accentColor = '#FFFFFF'; // Cape/Plates
                swordGlow = '#FFFACD'; // Holy light
                break;
            case 'CYBER':
            default:
                mainColor = '#2C3E50'; // Dark Graphite
                shadowColor = '#1A252F';
                accentColor = '#00FFFF'; // Neon Cyan
                swordGlow = '#00FFFF';
                break;
        }
        const outline = '#000';
        
        // --- SCALING DINAMICO (Paladin = MASSICCIO) ---
        let sizeMult = (playerStyle === 'PALADIN') ? 1.4 : 1.0;

        const drawBlock = (bx, by, bw, bh, color) => {
            // Applica il moltiplicatore di stazza
            let s_bw = bw * sizeMult;
            let s_bh = bh * sizeMult;
            let s_bx = bx * sizeMult;
            let s_by = (by * sizeMult);

            if (this.hasArmor) {
                ctx.save();
                ctx.globalAlpha = 0.35 + Math.sin(Date.now() / 250) * 0.1;
                ctx.fillStyle = '#3498db';
                ctx.fillRect(s_bx - 6, s_by - 6, s_bw + 12, s_bh + 12);
                ctx.restore();
            }
            ctx.fillStyle = outline;
            ctx.fillRect(s_bx - 2, s_by - 2, s_bw + 4, s_bh + 4);
            ctx.fillStyle = color;
            ctx.fillRect(s_bx, s_by, s_bw, s_bh);
        };

        const drawLeg = (angle, color, isAura = false) => {
            ctx.save();
            ctx.translate(0, 10);
            ctx.rotate(angle);
            drawBlock(-4, 0, 8, 18, color);
            ctx.translate(0, 15 * sizeMult);
            ctx.rotate(angle * 0.5);
            drawBlock(-4, 0, 8, 18, color);
            ctx.restore();
        };

        // --- 3. DISEGNO EFFETTIVI ---
        
        // --- FUNZIONE PER L'AURA A PROFILO (RONIN) ---
        const drawBodyParts = (isAura = false, auraColor = '#F00') => {
            const auraW = isAura ? 8 : 0;
            const auraH = isAura ? 8 : 0;
            const color = isAura ? auraColor : mainColor;

            if (isAura) {
                const auraAlpha = 0.3 * (this.speedBoostTimer / 0.5);
                ctx.globalAlpha = auraAlpha + (Math.sin(Date.now() / 100) * 0.1);
            } else {
                ctx.globalAlpha = 1.0;
            }

            // ACCESSORI (Sciarpa/Fascia)
            ctx.save();
            let headX = -14, headY = -40, headW = 28, headH = 26;
            let flow = Math.sin(Date.now() / 150) * 5;
            let flowX = -this.vx * 0.08; 
            
            ctx.fillStyle = isAura ? color : accentColor;
            ctx.beginPath();
            ctx.moveTo(headX, headY + 10);
            
            if (playerStyle === 'PALADIN') {
                ctx.quadraticCurveTo(headX - 10 + flowX, headY + 40 + flow, headX - 60 + flowX, headY + 80 + flow);
                ctx.lineTo(headX - 30 + flowX, headY + 80);
            } else if (playerStyle === 'CYBER') {
                if (!isAura) ctx.globalAlpha = 0.6;
                ctx.lineWidth = 12 + auraW;
                ctx.strokeStyle = isAura ? color : accentColor;
                ctx.moveTo(headX - 5, headY + 15);
                ctx.bezierCurveTo(headX - 30 + flowX, headY + 15 + flow, headX - 50 + flowX, headY + 40, headX - 80 + flowX, headY + 40 + flow);
                ctx.stroke();
            } else {
                if (this.speedBoostTimer > 0 && !isAura) {
                    ctx.shadowBlur = 20;
                    ctx.shadowColor = '#FF0000';
                    ctx.fillStyle = '#FF4444'; 
                }
                ctx.quadraticCurveTo(headX - 15 + flowX, headY + flow, headX - 60 + flowX, headY + 10 + flow * 2);
                ctx.lineTo(headX - 60 + flowX, headY + 20 + flow * 2);
                ctx.quadraticCurveTo(headX - 15 + flowX, headY + 15 + flow, headX, headY + 15);
                ctx.fill();
            }
            ctx.restore();

            // GAMBA 1
            drawLeg(leg1Angle, isAura ? color : shadowColor, isAura);
            // CORPO
            drawBlock(-10, -15, 20, 32, color);
            
            // --- DETTAGLI ARMATURA (Solo Paladin) ---
            if (playerStyle === 'PALADIN' && !isAura) {
                ctx.fillStyle = '#FFF'; 
                ctx.fillRect(-15 * sizeMult, -18 * sizeMult, 30 * sizeMult, 8 * sizeMult); // Spalline massicce
            }

            // TESTA
            drawBlock(headX - auraW/2, headY - auraH/2, headW + auraW, headH + auraH, color);
            // GAMBA 2
            drawLeg(leg2Angle, color, isAura);
            
            // BRACCIO (Base)
            if (playerStyle === 'CYBER') {
                ctx.save();
                ctx.translate(0, -10);
                ctx.rotate(this.isAttacking ? -1.8 : 0.6); 
                drawBlock(-4 - auraW/2, 0, 8 + auraW, 22, color);
                ctx.restore();
            } else {
                ctx.save();
                ctx.translate(0, -10);
                ctx.rotate(armAngle);
                drawBlock(-4 - auraW/2, 0, 8 + auraW, 22, color);
                ctx.restore();
            }
        };

        // --- ESECUZIONE DISEGNO ---
        // --- RENDERING AUREE LEGENDARY ---
        if (this.buffType === 'OVERCLOCK') {
            // Scia elettrica azzurra costante
            if (Math.random() > 0.7) createSparks(this.x + Math.random()*40, this.y + Math.random()*80, '#00FFFF');
        } else if (this.buffType === 'LIFESTEAL') {
            // Fumo demoniaco rosso
            ctx.save();
            ctx.globalAlpha = 0.4 + Math.sin(Date.now()/200)*0.2;
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#FF0000';
            drawBodyParts(true, '#800000'); // Aura rossa cupa
            ctx.restore();
        } else if (this.buffType === 'HALO') {
            // --- AUREOLA DEL TITANO (RE-DESIGN PREMIUM) ---
            ctx.save();
            ctx.translate(0, -65 * sizeMult); // Posizionata sopra la testa
            
            // 1. EFFETTO BAGLIORE (GLOW)
            ctx.shadowBlur = 25;
            ctx.shadowColor = '#FFD700'; 
            
            // 2. ANELLO INTERNO (Rotazione Lenta)
            ctx.save();
            let rotIn = (Date.now() / 400) % (Math.PI * 2);
            ctx.rotate(rotIn);
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(0, 0, 16 * sizeMult, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
            
            // 3. ANELLO ESTERNO (Frammentato, Rotazione Veloce Opposta)
            ctx.save();
            let rotOut = -(Date.now() / 250) % (Math.PI * 2);
            ctx.rotate(rotOut);
            ctx.strokeStyle = '#FFFFFF'; // Luce Bianca per contrasto
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 12]);
            ctx.beginPath();
            ctx.arc(0, 0, 24 * sizeMult, 0, Math.PI * 2);
            ctx.stroke();
            
            // 4. PUNTE DEL TITANO (Simboli Cardinali)
            ctx.fillStyle = '#FFD700';
            for (let i = 0; i < 4; i++) {
                ctx.save();
                ctx.rotate(i * Math.PI / 2);
                ctx.beginPath();
                ctx.moveTo(-4, -20 * sizeMult);
                ctx.lineTo(4, -20 * sizeMult);
                ctx.lineTo(0, -32 * sizeMult); // Punta aguzza
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }
            ctx.restore();
            
            // 5. EMISSIONE SCINTILLE (Piccolo chance per frame)
            if (Math.random() > 0.92) {
                createSparks(this.x + 20, this.y - 40, '#FFD700');
            }
            ctx.restore();
        }

        if (playerStyle === 'RONIN' && this.speedBoostTimer > 0) {
            drawBodyParts(true, '#FF3300'); // Aura a profilo rossa
            drawBodyParts(true, '#FFD700'); // Sottile aura interna dorata
        }
        drawBodyParts(false);

        // VISIERA/OCCHI (Sempre sopra l'aura)
        if (playerStyle === 'CYBER') {
            ctx.fillStyle = '#00FFFF';
            ctx.fillRect(4 * sizeMult, -34 * sizeMult, 12 * sizeMult, 4 * sizeMult); // Visiera Ciclope
        } else {
            ctx.fillStyle = '#FFF'; ctx.fillRect(4 * sizeMult, -36 * sizeMult, 10 * sizeMult, 6 * sizeMult);
            ctx.fillStyle = '#000'; ctx.fillRect(10 * sizeMult, -36 * sizeMult, 4 * sizeMult, 6 * sizeMult);
        }

        // Disegno Slash Arc (DINAMICO PER STILE)
        if (slashOpacity > 0 && playerStyle !== 'CYBER') {
            ctx.save();
            ctx.globalAlpha = slashOpacity;
            ctx.shadowBlur = 30;
            ctx.shadowColor = swordGlow;
            
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 20;
            ctx.beginPath();
            ctx.arc(0, -10, 65, slashStartArg, slashEndArg);
            ctx.stroke();

            ctx.strokeStyle = swordGlow;
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.arc(0, -10, 60, slashStartArg, slashEndArg);
            ctx.stroke();
            ctx.restore();
        }

        // --- DISEGNO ARMA (Solo se NON Cyber) ---
        if (playerStyle !== 'CYBER') {
            ctx.save();
            ctx.translate(0, -10);
            ctx.rotate(armAngle);
            // Braccio
            drawBlock(-4, 0, 8, 22, mainColor);
            
            ctx.translate(0, 20);
            ctx.rotate(swordAngle);
    
            // 1. ELSA E POMOLO / IMPUGNATURA MAZZA
            const gold = '#FFD700';
            const goldShadow = '#B8860B';
            
            if (playerStyle === 'PALADIN') {
                // --- DISEGNO MAZZA CHIODATA DORATA (Pesante & Brutale) ---
                // Manico (Legno Scuro con rinforzi)
                ctx.fillStyle = '#4B2E1E'; 
                ctx.fillRect(-5 * sizeMult, -30 * sizeMult, 10 * sizeMult, 45 * sizeMult);
                
                // Anelli di rinforzo oro
                ctx.fillStyle = gold;
                ctx.fillRect(-6 * sizeMult, -10 * sizeMult, 12 * sizeMult, 3 * sizeMult);
                ctx.fillRect(-6 * sizeMult, 5 * sizeMult, 12 * sizeMult, 3 * sizeMult);
                
                // TESTA DELLA MAZZA (Grosso blocco dorato con gradienti)
                ctx.shadowBlur = 25;
                ctx.shadowColor = swordGlow;
                let maceGrad = ctx.createRadialGradient(0, 55 * sizeMult, 5, 0, 55 * sizeMult, 25 * sizeMult);
                maceGrad.addColorStop(0, gold);
                maceGrad.addColorStop(0.8, goldShadow);
                maceGrad.addColorStop(1, '#000');
                
                ctx.fillStyle = maceGrad;
                ctx.beginPath();
                ctx.arc(0, 55 * sizeMult, 18 * sizeMult, 0, Math.PI * 2);
                ctx.fill();
                
                // CHIODI (8 Punte dorate)
                ctx.fillStyle = gold;
                ctx.shadowBlur = 10;
                for (let i = 0; i < 8; i++) {
                    ctx.save();
                    ctx.translate(0, 55 * sizeMult);
                    ctx.rotate((i / 8) * Math.PI * 2);
                    ctx.beginPath();
                    ctx.moveTo(-4 * sizeMult, 15 * sizeMult);
                    ctx.lineTo(4 * sizeMult, 15 * sizeMult);
                    ctx.lineTo(0, 32 * sizeMult); // Punta del chiodo
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                }
                ctx.shadowBlur = 0;
            } else {
                // --- DISEGNO SPADA CLASSICA (Ronin) ---
                ctx.fillStyle = gold; ctx.fillRect(-4 * sizeMult, -40 * sizeMult, 8 * sizeMult, 8 * sizeMult); 
                ctx.fillStyle = '#4B2E1E'; ctx.fillRect(-3 * sizeMult, -36 * sizeMult, 6 * sizeMult, 30 * sizeMult);
                ctx.fillStyle = goldShadow; ctx.fillRect(-12 * sizeMult, -6 * sizeMult, 24 * sizeMult, 8 * sizeMult);
                ctx.fillStyle = gold; ctx.fillRect(-12 * sizeMult, -4 * sizeMult, 24 * sizeMult, 4 * sizeMult);
                
                const gemPulse = 0.5 + Math.sin(Date.now() / 200) * 0.5;
                ctx.fillStyle = `rgba(0, 255, 255, ${gemPulse})`;
                ctx.fillRect(-2 * sizeMult, -4 * sizeMult, 4 * sizeMult, 4 * sizeMult);
        
                // 2. LAMA
                ctx.shadowBlur = 20;
                ctx.shadowColor = swordGlow; 
                let bladeGrad = ctx.createLinearGradient(-8 * sizeMult, 0, 8 * sizeMult, 0);
                bladeGrad.addColorStop(0, '#FFFFFF');
                bladeGrad.addColorStop(0.5, swordGlow);
                bladeGrad.addColorStop(0.9, shadowColor);
                
                ctx.fillStyle = bladeGrad;
                ctx.beginPath();
                ctx.moveTo(-6 * sizeMult, 2 * sizeMult);
                ctx.lineTo(6 * sizeMult, 2 * sizeMult);
                ctx.lineTo(5 * sizeMult, 75 * sizeMult);
                ctx.lineTo(0, 85 * sizeMult);
                ctx.lineTo(-5 * sizeMult, 75 * sizeMult);
                ctx.closePath();
                ctx.fill();
        
                if (Math.random() > 0.6) {
                    ctx.fillStyle = accentColor;
                    ctx.fillRect((Math.random() - 0.5) * 10 * sizeMult, Math.random() * 80 * sizeMult, 2, 2);
                }
            }
            ctx.restore();
        } else {
            // Braccio Cyber (Senza spada, gesto lancio)
            ctx.save();
            ctx.translate(0, -10);
            ctx.rotate(this.isAttacking ? -1.8 : 0.6); 
            drawBlock(-4, 0, 8, 22, mainColor);
            ctx.restore();
        }

        // --- FORZA LOGICA SCUDO PER PALADIN ---
        if (playerStyle === 'PALADIN') this.hasShield = true;

        if (this.hasShield) {
            ctx.save();
            let shieldSway = (this.isGrounded && Math.abs(this.vx) > 5) ? Math.sin(Date.now() / 150) * 3 : 0;
            ctx.translate(this.direction === 1 ? shieldSway : -shieldSway, 0);
            
            // --- LOGICA SPECIALE: BARRIERA SACRA (PALADIN) ---
            if (this.isParrying) {
                // --- EFFETTO ONDA D'URTO (AUREOLA TITANO) ---
                if (this.buffType === 'HALO' && Math.random() > 0.95) {
                    enemies.forEach(z => {
                        let d = Math.abs(z.x - this.x);
                        if (d < 250 && Math.abs(z.y - this.y) < 100) {
                            z.vx = (z.x > this.x ? 1 : -1) * 800; // Spinta via fortissima
                            z.vy = -300;
                            createPixelDissolve(z.x, z.y, z.width, z.height, ['#FFD700', '#FFFACD']);
                        }
                    });
                    playSound('jump', this.x, this.y);
                    screenShake = 15;
                }

                if (playerStyle === 'PALADIN') {
                    ctx.save();
                    let pSize = 70 * sizeMult + Math.sin(Date.now() / 80) * 5;
                    let grad = ctx.createRadialGradient(40 * sizeMult, -5 * sizeMult, 10, 40 * sizeMult, -5 * sizeMult, pSize);
                    grad.addColorStop(0, 'rgba(255, 215, 0, 0.4)');
                    grad.addColorStop(0.7, 'rgba(255, 215, 0, 0.1)');
                    grad.addColorStop(1, 'rgba(255, 215, 0, 0)');
                    
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.arc(40 * sizeMult, -5 * sizeMult, pSize, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
                ctx.translate(35 * sizeMult, -10 * sizeMult); // Posizione parata (molto avanti)
                ctx.rotate(-0.15);
            } else {
                ctx.translate(12 * sizeMult, 8 * sizeMult); // Posizione FRONTALE a riposo per visibilità
                ctx.rotate(0.1); 
            }

            // --- DISEGNO ROYAL KITE SHIELD (Forma a Goccia) ---
            const shieldGold = '#F1C40F';
            
            // --- BAGLIORE DIVINO COSTANTE ---
            ctx.shadowBlur = 35;
            ctx.shadowColor = shieldGold;

            ctx.beginPath();
            ctx.moveTo(-18 * sizeMult, -20 * sizeMult);
            ctx.bezierCurveTo(-18 * sizeMult, -25 * sizeMult, 18 * sizeMult, -25 * sizeMult, 18 * sizeMult, -20 * sizeMult); // Top curvo
            ctx.lineTo(18 * sizeMult, 5 * sizeMult);
            ctx.quadraticCurveTo(18 * sizeMult, 25 * sizeMult, 0, 40 * sizeMult); // Punta
            ctx.quadraticCurveTo(-18 * sizeMult, 25 * sizeMult, -18 * sizeMult, 5 * sizeMult);
            ctx.closePath();

            // Fondo Scudo (Metallo Bluastro/Knightly)
            ctx.fillStyle = '#2c3e50';
            ctx.fill();
            
            // Bordo Oro Rinforzato con Neon
            ctx.strokeStyle = '#FFFFFF'; // Bordo bianco per contrasto
            ctx.lineWidth = 4 * sizeMult;
            ctx.stroke();
            
            ctx.strokeStyle = shieldGold;
            ctx.lineWidth = 2 * sizeMult;
            ctx.stroke();

            // Emblema Centrale (Sole/Stella Dorata)
            ctx.shadowBlur = 0; // Reset per l'emblema
            ctx.fillStyle = shieldGold;
            ctx.beginPath();
            for(let i=0; i<8; i++) {
                let ang = (i / 8) * Math.PI * 2;
                let r = (i % 2 === 0) ? 8 * sizeMult : 4 * sizeMult;
                ctx.lineTo(Math.cos(ang)*r, Math.sin(ang)*r + 2 * sizeMult);
            }
            ctx.closePath();
            ctx.fill();

            // Lucentezza Metallo (Vetro/Riflesso)
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.moveTo(-12 * sizeMult, -18 * sizeMult); ctx.lineTo(5 * sizeMult, -18 * sizeMult); ctx.lineTo(-12 * sizeMult, 10 * sizeMult); ctx.fill();
            ctx.restore();
        }

        ctx.restore(); // Restore finale del transform personaggio (iniziato a riga 1784)
    }
}

// ==========================================
// CLASSE ALLEATO: HERO ALLY (Eroe Stickman Intelligente)
// ==========================================
class HeroAlly {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 40;
        this.height = 80;
        this.vx = 0;
        this.vy = 0;
        this.speed = 120;
        this.gravity = 1500;
        this.jumpPower = -600; // --- AGGIUNTO: Potenza di salto per evitare NaN ---
        this.isGrounded = false;
        this.wasGrounded = false;
        this.isClimbing = false;
        this.ladderCooldown = 0; // --- AGGIUNTO: Cooldown scale ---
        this.visualScaleX = 1;
        this.visualScaleY = 1;

        this.hp = 200; 
        this.isHitTimer = 0;
        this.isAttacking = false;
        this.attackTimer = 0;
        this.attackDuration = 0.4; 
        this.hasLunged = false;
        this.attackCooldown = 0;
        this.state = 'follow';
        this.aiTimer = 0; // --- AGGIUNTO: Timer decisionale ---
        this.target = null;
        this.direction = 1; // --- AGGIUNTO: Direzione iniziale ---
        this.isSaluting = false;
        this.saluteTimer = 0;

        // -- COLORI RUSTICI (VILLANO/CONTADINO) --
        const browns = ['#8B4513', '#A0522D', '#D2B48C', '#BC8F8F'];
        const chosenBrown = browns[Math.floor(Math.random() * browns.length)];
        this.mainColor = chosenBrown; 
        this.shadowColor = '#4B2E1E'; // Marrone terra d'ombra
        this.equipmentColor = '#bdc3c7'; // Metallo ferroso per la forca
        this.color = this.mainColor; 
        this.isAlly = true; 
        this.hasShield = false; // I villani non hanno scudi ufficiali
        
        // --- NUOVI PARAMETRI DI COMPORTAMENTO (V2) ---
        this.followOffsetX = 0; 
        this.followSlack = 40 + Math.random() * 60; 
        this.lastSlotIndex = -1;
        
        // --- AUTONOMIA E LIBERTÀ (V3) ---
        this.wanderTargetX = x;
        this.wanderTimer = 0;
        this.leashRange = 650; // Massima distanza prima di tornare forzatamente dall'eroe
    }

    update(dt, world, player, enemies, allies) {
        // --- OTTIMIZZAZIONE SPAZIALE: FILTRO DI PROSSIMITÀ (Culling) ---
        const scanRange = 1300;
        const localPlatforms = world.platforms.filter(p => Math.abs(p.x - this.x) < scanRange);

        if (this.isSaluting) {
            this.saluteTimer -= dt;
            return;
        }

        if (this.aiTimer > 0) this.aiTimer -= dt;
        if (this.attackCooldown > 0) this.attackCooldown -= dt;
        if (this.isHitTimer > 0) this.isHitTimer -= dt;
        if (this.ladderCooldown > 0) this.ladderCooldown -= dt;

        // --- RECUPERO DALL'ABISSO (CADUTA FUORI MAPPA) ---
        if (this.y > 2500) {
            this.x = player.x + (Math.random() * 100 - 50);
            this.y = player.y - 120; 
            this.vx = 0;
            this.vy = 0;
            this.isClimbing = false;
            this.isHitTimer = 1.0; 
            createDust(this.x, this.y, 15);
            playSound('wake', this.x, this.y);
            return; 
        }

        // --- TELETRASPORTO DI EMERGENZA (SE LONTANO O CAMBIO LIVELLO) ---
        const dxFromPlayer = player.x - this.x;
        const dyFromPlayer = player.y - this.y;
        const distToPlayer = Math.sqrt(dxFromPlayer * dxFromPlayer + dyFromPlayer * dyFromPlayer);
        
        // Soglia verticale più sensibile (500px) per cambi di piano rapidi (Cava/Superficie)
        if (distToPlayer > 950 || Math.abs(dyFromPlayer) > 500) {
            // Feedback visivo
            createDust(this.x + this.width / 2, this.y + this.height / 2, 8);
            
            // Teletrasporto: Cerca di apparire SOPRA il giocatore per evitare di incastrarsi nel terreno e stabilizzarsi
            this.x = player.x + (Math.random() * 120 - 60);
            this.y = player.y - 120; // Teletrasporto in volo sicuro (più alto)
            this.vx = 0;
            this.vy = 0;
            this.isClimbing = false;
            this.ladderCooldown = 1.0; 
            this.isHitTimer = 0.8; // Protezione estesa post-teletrasporto

            // --- FIX FONDAMENTALE: RESET MEMORIA E STATO ---
            // Dimentica nemici lontani nel vecchio livello per evitare di rituffarsi subito giù/su
            this.state = 'follow';
            this.target = null;

            createDust(this.x + this.width / 2, this.y + this.height / 2, 12);
            playSound('wake', this.x, this.y);
            return; // Interrompe l'update per questo frame per permettere la stabilizzazione fisica
        }

        // --- SISTEMA DI ANTI-SOVRAPPOSIZIONE (SMORZATO) ---
        // 1. Forza di separazione rispetto ad altri alleati
        allies.forEach(other => {
            if (other === this || other.isSaluting) return;
            let dx = this.x - other.x;
            if (dx === 0) dx = (Math.random() - 0.5) * 2; 
            let minDist = this.width + 10; // Leggermente più largo della hitbox
            if (Math.abs(dx) < minDist) {
                // Forza di separazione ancora più dolce per stabilità assoluta
                let force = (minDist - Math.abs(dx)) * 1.5; 
                this.vx += (dx > 0 ? 1 : -1) * force;
                this.vx *= 0.9; // Forte attrito durante il contatto
            }
        });

        // 2. Forza di separazione rispetto al giocatore (Molto fluida)
        let dxPlayer = this.x - player.x;
        let playerMinDist = 110; 
        if (Math.abs(dxPlayer) < playerMinDist) {
            let force = (playerMinDist - Math.abs(dxPlayer)) * 2;
            this.vx += (dxPlayer > 0 ? 1 : -1) * force;
        }

        // --- LOGICA DI TARGETING: GUARDIAN MODE ---
        let priorityTarget = null;
        let pMinDist = 1100; // --- RAGGIO GUARDIANO RADDOPPIATO (1100px) ---
        
        // 1. Cerca nemici che minacciano direttamente l'Eroe
        enemies.forEach(z => {
            if (z.state !== 'dead' && z.state !== 'emerging') {
                let d = Math.hypot(z.x - player.x, z.y - player.y);
                if (d < pMinDist) {
                    pMinDist = d;
                    priorityTarget = z;
                }
            }
        });

        // --- SISTEMA DI TARGETING GERARCHICO (Normale > Boss) ---
        let nearestNormalToAlly = null;
        let nearestNormalOnSameFloor = null;
        let nearestBossToAlly = null;
        let nearestBossOnSameFloor = null;
        
        let normalMinDist = 2200; 
        let normalSameFloorMinDist = 800;
        let bossMinDist = 2200;
        let bossSameFloorMinDist = 800;

        enemies.forEach(z => {
            if (z.hp > 0 && z.state !== 'dead' && z.state !== 'emerging') {
                let dx = Math.abs(z.x - this.x);
                let dy = Math.abs(z.y - this.y);
                let d = Math.hypot(dx, dy);

                // --- CALCOLO PIANO: CONFRONTO AI PIEDI (Punto di contatto col suolo) ---
                // Importante per nemici giganti come l'Omega Zombie (220px)
                let df = Math.abs((z.y + (z.height || 80)) - (this.y + this.height));

                if (z.isBoss) {
                    // TIER 2: Boss
                    if (d < bossMinDist) { bossMinDist = d; nearestBossToAlly = z; }
                    if (df < 50 && dx < bossSameFloorMinDist) { bossSameFloorMinDist = dx; nearestBossOnSameFloor = z; }
                } else {
                    // TIER 1: Normali (Priorità Assoluta)
                    if (d < normalMinDist) { normalMinDist = d; nearestNormalToAlly = z; }
                    if (df < 50 && dx < normalSameFloorMinDist) { normalSameFloorMinDist = dx; nearestNormalOnSameFloor = z; }
                }
            }
        });

        // La Selezione del Bersaglio segue la gerarchia Normali -> Player Defense -> Boss
        let bestTarget = (nearestNormalOnSameFloor || nearestNormalToAlly) || (priorityTarget && !priorityTarget.isBoss ? priorityTarget : null) || nearestBossOnSameFloor || nearestBossToAlly;

        // --- LOGICA DI TARGETING AGGRESSIVA (Priorità Sterminio) ---
        // Se sta già combattendo, insegue implacabilmente fino a 1500px
        let detectionRange = (this.state === 'fight') ? 1500 : 1200;
        let finalTargetX = player.x;
        let finalTargetY = player.y;

        // Se il timer AI è attivo, mantiene lo stato precedente per stabilità
        if (this.aiTimer <= 0) {
            // --- LOGICA AGGRESSIVA: Cerca e Distruggi ---
            if (bestTarget) {
                // Decide se ingaggiare in base alla distanza del target scelto
                let targetDist = bestTarget.isBoss ? bossMinDist : normalMinDist;
                
                if (targetDist < detectionRange) {
                    this.state = 'fight';
                    this.target = bestTarget;
                } else {
                    this.state = 'follow';
                    this.target = player;
                }
            } else {
                // Ritorna dall'Eroe solo se l'area è pulita
                this.state = 'follow';
                this.target = player;
            }
        }

        // Calcola coordinate target finali in base allo stato consolidato
        if (this.state === 'fight' && this.target && this.target.hp > 0) {
            finalTargetX = this.target.x;
            finalTargetY = this.target.y;
        } else {
            // --- LOGICA DI COMPAGNIA LIBERA (NO SLOT / NO FORMAZIONE) ---
            let distToPlayerAbs = Math.abs(player.x - this.x);
            let safeRadius = 450; // Raggio di libertà intorno all'eroe

            if (distToPlayerAbs > this.leashRange || Math.abs(player.y - this.y) > 200) {
                // TROPPO LONTANO O ALTRO LIVELLO: Rientra nel raggio d'azione dell'eroe
                // Puntiamo all'eroe ma con un piccolo offset casuale per evitare sovrapposizioni
                finalTargetX = player.x + (this.x < player.x ? 60 : -60);
                this.wanderTargetX = finalTargetX;
            } else if (distToPlayerAbs > safeRadius) {
                // VICINO AL LIMITE: Si avvicina lentamente al raggio di sicurezza
                finalTargetX = player.x;
            } else {
                // DENTRO IL RAGGIO: Libero di muoversi autonomamente (Wander)
                this.wanderTimer -= dt;
                if (this.wanderTimer <= 0) {
                    // Sceglie un punto casuale DENTRO il raggio di protezione dell'eroe
                    this.wanderTargetX = player.x + (Math.random() - 0.5) * (safeRadius * 1.5);
                    this.wanderTimer = 3.0 + Math.random() * 5.0; 
                }
                
                // Se è vicino al suo punto di wandering, si ferma o guarda intorno
                if (Math.abs(this.wanderTargetX - this.x) < 60) {
                    finalTargetX = this.x; 
                    if (Math.random() < 0.01) this.direction *= -1;
                } else {
                    finalTargetX = this.wanderTargetX;
                }
            }
            finalTargetY = player.y;
        }

        // --- VINCOLO TARGET ALLO SCHERMO (Nuovo) ---
        // Impedisce all'IA di voler uscire dalla visuale
        const screenMargin = 40;
        finalTargetX = Math.max(camera.x + screenMargin, Math.min(camera.x + canvas.width - screenMargin, finalTargetX));

        // --- STABILIZZAZIONE NAVIGAZIONE SCALE (Fix Blocchi in Combattimento) ---
        if (this.isClimbing && !this.target) {
            // Segue il player solo se non ha un bersaglio prioritario
            finalTargetY = player.y; 
        }

        // --- SISTEMA DI NAVIGAZIONE INTELLIGENTE (LIVELLI E SCALE) ---
        let heightDiff = finalTargetY - this.y;
        let pCenterX = this.x + this.width / 2;

        // Se il target è sullo stesso piano (o quasi), cammina normalmente
        let isOnSameLevel = Math.abs(heightDiff) < 60;

        // Se il target è su un livello differente E non abbiamo minacce immediate sul piano attuale, cerchiamo il percorso
        if (!isOnSameLevel) {
            let bestPathX = null;
            let minPathDist = 3000;

            // 1. Cerca la scala più vicina che porti nella direzione verticale giusta
            world.interactables.forEach(i => {
                if (i.type === 'ladder') {
                    // La scala è utile se porta verso l'alto (se alto) o verso il basso (se basso)
                    let connectsToTarget = (heightDiff < 0) ? (i.y < this.y - 30) : (i.y + i.height > this.y + 30);
                    if (connectsToTarget) {
                        let d = Math.abs(i.x + i.width / 2 - pCenterX);
                        if (d < minPathDist) {
                            minPathDist = d;
                            bestPathX = i.x + i.width / 2;
                        }
                    }
                }
            });

            // 3. SE IL TARGET È SOTTO E NON CI SONO SCALE, CERCA IL BORDO (DROP-OFF)
            if (bestPathX === null) {
                // Troviamo la piattaforma su cui si trova l'alleato
                let currentPlat = null;
                world.platforms.forEach(p => {
                    if (this.x + this.width > p.x && this.x < p.x + p.width && Math.abs(this.y + this.height - p.y) < 20) {
                        currentPlat = p;
                    }
                });

                if (currentPlat) {
                    // Direzione verso la quale dobbiamo buttarci per raggiungere l'obiettivo
                    if (finalTargetX < currentPlat.x) {
                        bestPathX = currentPlat.x - 30; // Destinazione: Oltre il bordo sinistro
                    } else if (finalTargetX > currentPlat.x + currentPlat.width) {
                        bestPathX = currentPlat.x + currentPlat.width + 30; // Destinazione: Oltre il bordo destro
                    } else {
                        // Se l'obiettivo è ESATTAMENTE SOTTO di noi, ma non abbiamo scale: 
                        // Scegliamo il bordo più vicino
                        let distL = Math.abs(this.x - currentPlat.x);
                        let distR = Math.abs(this.x - (currentPlat.x + currentPlat.width));
                        bestPathX = (distL < distR) ? currentPlat.x - 30 : currentPlat.x + currentPlat.width + 30;
                    }
                }
            }

            // Se abbiamo trovato un punto di transizione (scala, salto o bordo), lo impostiamo
            if (bestPathX !== null) {
                finalTargetX = bestPathX;
            }
        }

        let nearLadder = null;
        world.interactables.forEach(i => {
            if (i.type === 'ladder' && Math.abs(i.x + i.width / 2 - this.x) < 60) {
                nearLadder = i;
            }
        });

        // heightDiff è già calcolato sopra
        if (nearLadder && Math.abs(heightDiff) > 50 && !this.isClimbing && this.ladderCooldown <= 0) {
            // Se il target è su un altro livello, usa la scala
            if ((heightDiff < 0 && nearLadder.y < this.y) || (heightDiff > 0 && nearLadder.y + nearLadder.height > this.y)) {
                this.isClimbing = true;
                // Snap preciso al centro della scala
                this.x = nearLadder.x + nearLadder.width / 2 - this.width / 2;
                this.vx = 0;
            }
        }

        // --- MANOVRA DI SALTO VERTICALE (Per raggiungere piattaforme senza scale) ---
        if (!this.isClimbing && this.isGrounded && heightDiff < -120) {
            // Se il target è sopra di noi, saltiamo ogni tanto per cercare di agganciare piattaforme superiori
            if (Math.random() < 0.02) { 
                this.vy = this.jumpPower;
                this.vx = (finalTargetX > this.x) ? 150 : -150; // Spinta verso il target durante il salto
            }
        }

        if (this.isClimbing) {
            this.vx = 0;
            this.vy = (heightDiff > 0) ? 200 : -220;

            // --- PROTEZIONE CADUTA SOTTO-MAPPA (ALLEATI) ---
            if (this.vy > 0) {
                world.platforms.forEach(p => {
                    if (this.x + this.width > p.x && this.x < p.x + p.width) {
                        if (this.y + this.height > p.y && this.y + this.height < p.y + 20) {
                            this.isClimbing = false;
                            this.ladderCooldown = 1.5; // AGGIUNTO: Cooldown anche sull'atterraggio floor
                            this.isGrounded = true;
                            this.y = p.y - this.height;
                            this.vy = 0;
                        }
                    }
                });
            }

            // --- LOGICA DI USCITA ROBUSTA (Antiloc-Loop) ---
            let reachedTop = (this.y + this.height < nearLadder.y + 5 && heightDiff < -20);
            let reachedBottom = (this.y > nearLadder.y + nearLadder.height - 5 && heightDiff > 20);
            let targetReached = Math.abs(heightDiff) < 30;

            if (reachedTop || reachedBottom || targetReached || !nearLadder) {
                this.isClimbing = false;
                this.ladderCooldown = 1.6; // Cooldown potenziato (1.6s)
                this.vy = -450; // Salto di sbarco più potente
                // Forza laterale incrementata per allontanarsi drasticamente dalla scala
                this.vx = (finalTargetX > this.x) ? 600 : -600; 
                this.x += (this.vx * 0.08); // Spostamento immediato di sicurezza più lungo
                this.y -= 8;
            }
        } else {
            // --- LOGICA DI CAMMINATA E COMBATTIMENTO ---
            let moveSpeed = (this.state === 'fight') ? this.speed * 1.6 : this.speed;
            if (this.x < finalTargetX - 15) {
                this.vx = moveSpeed;
            } else if (this.x > finalTargetX + 15) {
                this.vx = -moveSpeed;
            } else {
                // Attrito più forte quando è nel range del target per evitare jitter
                this.vx *= 0.7;
            }

            // --- ORIENTAMENTO INTELLIGENTE (Fix Shaking/Moonwalking) ---
            if (this.isAttacking && this.target) {
                // Durante l'attacco, guarda sempre il nemico
                this.direction = (this.target.x > this.x) ? 1 : -1;
            } else if (Math.abs(this.vx) > 55) {
                // Soglia alzata (da 20 a 55) per stabilità visiva durante le spinte
                this.direction = (this.vx > 0) ? 1 : -1;
            } else if (this.state === 'fight' && this.target) {
                // Se è in combattimento ma quasi fermo, guarda il bersaglio
                this.direction = (this.target.x > this.x) ? 1 : -1;
            } else if (Math.abs(this.vx) > 30) {
                // Soglia alzata anche per il fallback
                this.direction = (this.vx > 0) ? 1 : -1;
            }

            // Salto ostacoli (Muretti/Voxel)
            if (this.isGrounded && Math.abs(this.vx) > 10) {
                let wallCheck = (this.direction === 1) ? world.isSolid(this.x + this.width + 10, this.y + this.height - 10) : world.isSolid(this.x - 10, this.y + this.height - 10);
                if (wallCheck) this.vy = -550;
            }

            // Trigger Attacco (Portata della Forca - Stoccata)
            if (this.target && this.state === 'fight' && this.attackCooldown <= 0) {
                let dToTarget = Math.abs(this.target.x - this.x);
                if (dToTarget < 160) { // Aumentata portata (Forca)
                    this.isAttacking = true;
                    this.attackTimer = this.attackDuration;
                    this.attackCooldown = 0.4; // Colpi più lenti ma potenti
                    playSound('slash'); // Suono di fendente per ora
                }
            }
        }

        // --- SISTEMA FISICO UNIVERSALE ---
        // La gravità agisce solo se non stiamo scalando
        if (!this.isClimbing) {
            this.vy += this.gravity * dt;
        }

        // Aggiornamento coordinate (Ora corretti fuori dal blocco else!)
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // --- VINCOLO FISICO ALLO SCHERMO (Nuovo) ---
        // Forza l'alleato a stare in visuale (viene spinto dalla telecamera)
        const wallPadding = 20;
        const leftLimit = camera.x + wallPadding;
        const rightLimit = camera.x + canvas.width - this.width - wallPadding;
        
        if (this.x < leftLimit) {
            this.x = leftLimit;
            if (this.vx < 0) this.vx = 0;
        } else if (this.x > rightLimit) {
            this.x = rightLimit;
            if (this.vx > 0) this.vx = 0;
        }


        // Collisioni con il terreno (Solo se non stiamo scalando)
        if (!this.isClimbing) {
            this.isGrounded = false;
            world.platforms.forEach(p => {
                // --- OTTIMIZZAZIONE COLLISIONE: FILTRO PROSSIMITÀ ---
                if (Math.abs(p.x - this.x) > 700) return; 
                
                if (p.isOneWay && this.vy < 0) return;
                if (this.x + this.width > p.x && this.x < p.x + p.width) {
                    if (this.y + this.height > p.y && this.y + this.height < p.y + p.height + this.vy * dt + 10 && this.vy >= 0) {
                        this.y = p.y - this.height;
                        this.vy = 0;
                        this.isGrounded = true;
                    }
                }
            });
        }

        // --- GESTIONE SQUASH & STRETCH (Atterraggio Alleato) ---
        if (this.isGrounded && !this.wasGrounded) {
            this.visualScaleY = 0.7;
            this.visualScaleX = 1.3;
            createDust(this.x + this.width / 2, this.y + this.height, 5);
        }
        this.wasGrounded = this.isGrounded;

        this.visualScaleY += (1 - this.visualScaleY) * 0.15;
        this.visualScaleX += (1 - this.visualScaleX) * 0.15;


        if (this.isAttacking) {
            let progress = (this.attackDuration - this.attackTimer) / this.attackDuration;
            
            if (progress > 0.25 && progress < 0.65) {
                if (!this.hasLunged) {
                    this.vx += this.direction * 500; // Affondo potenziato
                    this.hasLunged = true;
                }
            }

            this.attackTimer -= dt;
            if (this.attackTimer <= 0) {
                this.isAttacking = false;
                this.hasLunged = false;
            }

            enemies.forEach(z => {
                // --- HITBOX DINAMICA PER L'ATTACCO ---
                // Se è un Boss gigante (220px), aumentiamo drasticamente la portata verticale dell'affondo
                let verticalReach = z.isBoss ? 160 : 65; 
                let horizontalReach = z.isBoss ? 120 : 85;

                if (z.state !== 'dead' && Math.abs(z.x - this.x) < horizontalReach && Math.abs(z.y - this.y) < verticalReach) {
                    if (z.isHit <= 0) {
                        z.hp -= 1;
                        z.isHit = 0.4;
                        z.vx = this.direction * 350;
                        if (!z.isBoss) z.vy = -120; // Non facciamo saltare il Boss!
                        playSound('zombie_hit', z.x, z.y);
                        
                        // Anche gli alleati causano un piccolo Hit-Stop e scossone
                        hitStopTimer = 0.04; 
                        screenShake = 6;
                    }
                }
            });
        }
    }

    draw(ctx, camera) {
        if (this.isSaluting && this.saluteTimer <= 0) return;

        let screenX = this.x - camera.x;
        let screenY = this.y - camera.y;

        // --- 1. RENDERING LOGICA ANIMAZIONE ---
        let bob = 0;
        let runAnim = 0;
        if (this.isGrounded && Math.abs(this.vx) > 10) {
            runAnim = Math.sin(Date.now() / 120);
            bob = Math.abs(runAnim) * 5;
        }

        let armAngle = -Math.PI * 0.15; 
        let swordAngle = -Math.PI * 0.45;
        let bodyRotation = 0;
        let attackLunge = 0;
        let slashOpacity = 0;
        let slashStartArg = 0;
        let slashEndArg = 0;

        if (this.isAttacking) {
            let progress = (this.attackDuration - this.attackTimer) / this.attackDuration;
            if (progress < 0.25) {
                let p = progress / 0.25;
                armAngle = (-Math.PI * 0.15) - p * (Math.PI * 0.7);
                swordAngle = (-Math.PI * 0.45) - p * (Math.PI * 0.3);
                bodyRotation = -0.15 * p;
            } else if (progress < 0.65) {
                let p = (progress - 0.25) / 0.4;
                let startArm = -Math.PI * 0.85;
                let endArm = Math.PI * 0.4;
                armAngle = startArm + p * (endArm - startArm);
                swordAngle = (-Math.PI * 0.75) + p * (Math.PI * 1.2);
                attackLunge = p * 25;
                bodyRotation = -0.15 + p * 0.45;
                slashOpacity = 0.8;
                slashStartArg = startArm;
                slashEndArg = armAngle;
            } else {
                let p = (progress - 0.65) / 0.35;
                armAngle = (Math.PI * 0.4) - p * (Math.PI * 0.55);
                swordAngle = (Math.PI * 0.45) + p * (Math.PI * 0.1);
                attackLunge = 25 * (1 - p);
                bodyRotation = 0.3 * (1 - p);
            }
        } else {
            armAngle += (runAnim * 0.1);
            swordAngle += (runAnim * 0.05);
        }

        let leg1Angle, leg2Angle;
        if (this.isGrounded) {
            leg1Angle = runAnim * 0.6;
            leg2Angle = -runAnim * 0.6;
        } else {
            leg1Angle = (this.vy < 0) ? Math.PI * 0.15 : -Math.PI * 0.1;
            leg2Angle = (this.vy < 0) ? -Math.PI * 0.1 : Math.PI * 0.15;
        }

        // --- 2. TRASFORMAZIONI MONDO -> SCHERMO ---
        ctx.save();
        ctx.translate(screenX + this.width / 2 + (attackLunge * this.direction), screenY + this.height / 2 - bob);

        if (this.direction === -1) ctx.scale(-1, 1);
        ctx.rotate(bodyRotation);
        ctx.scale(this.visualScaleX, this.visualScaleY);

        const outline = '#222';
        const drawBlock = (bx, by, bw, bh, color) => {
            ctx.fillStyle = outline; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
            ctx.fillStyle = color; ctx.fillRect(bx, by, bw, bh);
        };

        const drawLeg = (angle, color) => {
            ctx.save();
            ctx.translate(0, 10);
            ctx.rotate(angle);
            drawBlock(-4, 0, 8, 18, color);
            ctx.translate(0, 15);
            ctx.rotate(angle * 0.5);
            drawBlock(-4, 0, 8, 18, color);
            ctx.restore();
        };

        // --- 3. DISEGNO Stickman ---
        drawLeg(leg1Angle, this.shadowColor);
        drawBlock(-10, -15, 20, 32, this.mainColor); // Torso
        drawBlock(-14, -40, 28, 26, this.mainColor); // Testa
        
        // OCCHI (Corretti e visibili!)
        ctx.fillStyle = '#FFF'; ctx.fillRect(2, -34, 8, 8);
        ctx.fillStyle = '#000'; ctx.fillRect(6, -32, 4, 4);

        drawLeg(leg2Angle, this.mainColor);

        // Disegno Slash Arc
        if (slashOpacity > 0) {
            ctx.save();
            ctx.globalAlpha = slashOpacity;
            ctx.strokeStyle = '#FFFFFF';
            ctx.setLineDash([8, 4]); ctx.lineWidth = 15;
            ctx.beginPath(); ctx.arc(0, -10, 60, slashStartArg, slashEndArg); ctx.stroke();
            ctx.strokeStyle = this.mainColor; // Scia del colore dell'alleato
            ctx.lineWidth = 6;
            ctx.beginPath(); ctx.arc(0, -10, 56, slashStartArg, slashEndArg); ctx.stroke();
            ctx.restore();
        }

        // --- ARMA: LA FORCA (Pitchfork) ---
        ctx.save();
        ctx.translate(0, -5); // Centro di rotazione braccio/fianco
        
        let forkX = 0;
        let forkRot = armAngle;

        if (this.isAttacking) {
            let progress = (this.attackDuration - this.attackTimer) / this.attackDuration;
            // Animazione STOCCATA (In avanti)
            if (progress < 0.3) {
                forkX = -progress * 25; // Carica indietro breve
            } else if (progress < 0.7) {
                let lungeP = (progress - 0.3) / 0.4;
                forkX = -7.5 + (lungeP * 45); // Affondo rapido in avanti
                forkRot = 0; // Punta dritto durante l'affondo
            } else {
                let returnP = (progress - 0.7) / 0.3;
                forkX = 37.5 * (1 - returnP); // Ritorno alla posizione base
            }
        }

        ctx.translate(forkX, 0); // Applica l'affondo
        ctx.rotate(forkRot);
        
        // MANICO (Lungo Legno)
        ctx.fillStyle = '#4B2E1E';
        ctx.fillRect(-3, -15, 6, 95); // Lungo manico
        
        // TESTA DELLA FORCA (Ferro)
        ctx.translate(0, 80);
        ctx.fillStyle = '#bdc3c7';
        
        // Base traversale rinforzata
        ctx.fillRect(-14, 0, 28, 5);
        
        // 3 PUNTE (Denti della forca)
        ctx.fillRect(-14, 0, 3, 22); // Sinistra
        ctx.fillRect(-1.5, -2, 3, 30); // Centrale (più lunga e pronunciata)
        ctx.fillRect(11, 0, 3, 22); // Destra
        
        ctx.restore();

        // --- RIMOZIONE SCUDO (I villani combattono a due mani o senza scudo) ---

        ctx.restore(); // Fine Corpo

        // Barra Vita
        ctx.fillStyle = '#111';
        ctx.fillRect(screenX, screenY - 20, 40, 6);
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(screenX + 1, screenY - 19, (Math.max(0, this.hp) / 200) * 38, 4);
    }

}

// ==========================================
// CLASSE NEMICO: ZOMBIE (Fasi diurne, Scavo d'Alba, Salute a tacche)
// ==========================================
class Zombie {
    constructor(x, y, type = 'surface') {
        this.x = x;
        this.y = y;
        this.width = 40;
        this.height = 80;
        this.type = type; // 'surface' o 'cave'

        this.vx = 0;
        this.vy = 0;
        this.speed = (this.type === 'cave') ? 75 : 100;
        this.gravity = 1500;

        let isCaveType = (this.type === 'cave' || this.type === 'white');
        this.state = isCaveType ? 'dormant' : 'emerging';
        this.timer = 0.5; // RIDOTTO: Da 2.0 a 0.5s per reattività immediata

        this.hp = isCaveType ? 5 : 3;
        this.isHit = 0;

        this.direction = 1;
        this.isGrounded = false;
        this.isClimbing = false; // Permette agli zombie di usare le scale appena implementate
        this.climbTimer = 0; // Cooldown per non "balbettare" sulla scala


        // Meccaniche AI Avanzata
        this.jumpPower = -600;
        this.jumpDelay = 0;
        this.lungeTimer = 0;
        this.lungeCooldown = 2.0 + Math.random() * 3.0;
        this.targetOffset = (Math.random() - 0.5) * 60;
        this.isDodging = false;

        // --- MECCANICHE DIFENSIVE (ALLEATO) ---
        this.isAlly = false;
        this.targetEnemy = null;
        this.isSaluting = false;
        this.saluteTimer = 0;

        // --- PROPRIETÀ ANIMAZIONE ---
        this.visualScaleX = 1;
        this.visualScaleY = 1;
        this.wasGrounded = false;
        this.deadOpacity = 1;
        this.deathTimer = 0; 
        this.isBoss = false; // --- SICUREZZA PER TARGETING ---
    }

    update(dt, world, player) {
        if (this.isHit > 0) {
            this.isHit -= dt;
            // Se colpito mentre sale, cade dalla scala e ha un cooldown
            if (this.isClimbing) {
                this.isClimbing = false;
                this.climbTimer = 0.8;
            }
        }
        if (this.climbTimer > 0) this.climbTimer -= dt;

        if (this.isGrounded && Math.abs(this.vx) > this.speed) {
            this.vx *= 0.8; // Freno inerziale dopo uno sbalzo Knockback
        }


        switch (this.state) {
            case 'dormant':
                // Respira lentamente stando seduto / immobile
                // --- RILEVAMENTO LIMITATO (Fix Suicidio degli Zombie Bianchi) ---
                let d = Math.abs(player.x - this.x);
                let playerInCave = player.y > 650;

                // Se è uno zombie bianco, si sveglia solo se il giocatore entra nella grotta
                let shouldWake = (this.type === 'white') ? (d < 350 && playerInCave) : (d < 300);

                if (shouldWake) {
                    playSound('wake', this.x, this.y);
                    this.state = 'emerging';
                    this.timer = 0.5; // RIDOTTO: Da 1.0 a 0.5s
                }
                break;

            case 'emerging':
                this.timer -= dt;
                if (this.timer <= 0) this.state = 'chasing';
                break;

            case 'chasing':
                // --- VULNERABILITÀ AL SOLE (ZOMBIE BIANCHI) ---
                if (this.type === 'white' && timeOfDay > 5 && timeOfDay < 19 && this.y < 650) {
                    // Gli zombie bianchi evaporano all'istante sotto la luce solare
                    this.hp = 0;
                    this.state = 'dead';
                    playSound('zombie_hit', this.x, this.y);
                    // Effetto Dissoluzione Pixel Art Professional
                    createPixelDissolve(this.x, this.y, this.width, this.height, ['#FFFFFF', '#F0F0F0', '#CCCCCC']);
                    return;
                }

                if (this.isAlly) {
                    // --- IA ALLEATO (Protezione e Attacco) ---
                    let nearestEnemy = null;
                    let minDist = 450; // Range di avvistamento nemici

                    enemies.forEach(z => {
                        if (!z.isAlly && z.state !== 'dead' && z.state !== 'emerging') {
                            let dist = Math.abs(z.x - this.x);
                            if (dist < minDist) {
                                minDist = dist;
                                nearestEnemy = z;
                            }
                        }
                    });

                    let targetX = player.x; // Di default segue il player
                    if (nearestEnemy) {
                        targetX = nearestEnemy.x;
                        this.targetEnemy = nearestEnemy;
                    } else {
                        this.targetEnemy = null;
                        // Resta a distanza Sociale dal player per non intralciarlo
                        if (Math.abs(player.x - this.x) < 80) targetX = this.x;
                    }

                    // Logica di attacco alleato (Semplificata: si scaglia addosso)
                    if (nearestEnemy && minDist < 60 && !this.isClimbing) {
                        if (Math.random() > 0.95) { // Attacco casuale
                            nearestEnemy.hp -= 1;
                            nearestEnemy.isHit = 0.5;
                            playSound('hit', nearestEnemy.x, nearestEnemy.y);
                            createDust(nearestEnemy.x, nearestEnemy.y, 2);
                        }
                    }

                    // Movimento IA Alleato
                    if (this.x < targetX - 40) {
                        this.direction = 1;
                        this.vx = this.speed * 1.1;
                    } else if (this.x > targetX + 40) {
                        this.direction = -1;
                        this.vx = -this.speed * 1.1;
                    } else {
                        this.vx *= 0.8;
                    }

                } else if (this.type === 'surface' && timeOfDay > 5 && timeOfDay < 19 && this.y < 650) {
                    // Solo gli zombie di superficie scavano al sole (e solo se fuori)
                    this.state = 'digging';
                    this.timer = 2.5;
                    this.vx = 0;
                } else {
                    // --- SISTEMA DI NAVIGAZIONE INTELLIGENTE (Fix Ping-Pong) ---
                    let targetX = player.x;
                    let pCenterX = this.x + this.width / 2;
                    let distToPlayerY = Math.abs(player.y - this.y);
                    let isTrappedInCave = this.y > 650;

                    let playerInCave = player.y > 650;

                    let bestPathX = null;
                    if (distToPlayerY > 100) {
                        let minPathDist = 4000;

                        // 1. Cerca la scala più vicina che porti nella direzione giusta
                        world.interactables.forEach(i => {
                            if (Math.abs(i.x - this.x) > 700) return;
                            if (i.type === 'ladder') {
                                // SICUREZZA: Se è giorno e siamo sotto terra, non prendiamo scale verso l'alto (Suicidio)
                                let isSunlightDanger = (timeOfDay > 5 && timeOfDay < 19 && this.y > 650 && i.y < 650);
                                if (this.type === 'white' && isSunlightDanger && !playerInCave) return;

                                let connectsToPlayer = (player.y < this.y) ? (i.y < this.y - 40) : (i.y + i.height > this.y + 40);
                                if (connectsToPlayer) {
                                    let d = Math.abs(i.x + i.width / 2 - pCenterX);
                                    if (d < minPathDist) {
                                        minPathDist = d;
                                        bestPathX = i.x + i.width / 2;
                                    }
                                }
                            }
                        });

                        // 2. Se non ci sono scale o sono lontane, cerca mensole nelle grotte
                        if (isTrappedInCave && (!bestPathX || minPathDist > 800)) {
                            world.platforms.forEach(p => {
                                if (p.isStairs || (p.y < this.y - 20 && p.y > player.y - 50)) {
                                    let d = Math.abs(p.x + p.width / 2 - pCenterX);
                                    if (d < minPathDist) {
                                        minPathDist = d;
                                        bestPathX = p.x + p.width / 2;
                                    }
                                }
                            });
                        }

                        // Se abbiamo trovato un percorso, lo seguiamo ossessivamente finché non siamo vicini
                        if (bestPathX !== null) {
                            targetX = bestPathX;
                        }
                    }

                    // --- IA DI NAVIGAZIONE CON SCALE (Lancio Arrampicata) ---
                    let nearLadder = null;
                    world.interactables.forEach(i => {
                        if (Math.abs(i.x - this.x) > 150) return;
                        if (i.type === 'ladder') {
                            // Hitbox di aggancio scala leggermente più generosa per gli zombie
                            if (pCenterX > i.x - 30 && pCenterX < i.x + i.width + 30) {
                                if (this.y + this.height > i.y && this.y < i.y + i.height) {
                                    nearLadder = i;
                                }
                            }
                        }
                    });

                    // Decisione: Salire o camminare?
                    let heightDiff = player.y - this.y;
                    let nearTop = nearLadder && (this.y < nearLadder.y + 20 && heightDiff < 0);

                    // Se siamo vicini a una scala e dobbiamo cambiare livello verticale
                    if (nearLadder && !nearTop && this.climbTimer <= 0 && this.isHit <= 0 && Math.abs(heightDiff) > 20 && Math.abs(nearLadder.x + nearLadder.width / 2 - pCenterX) < 60) {
                        this.isClimbing = true;
                        this.x += (nearLadder.x + nearLadder.width / 2 - pCenterX) * 0.2; // Centratura
                        this.vx = 0;
                        this.vy = (heightDiff > 0) ? 160 : -180; // Salita leggermente più rapida
                    } else if (this.isClimbing) {
                        // --- LOGICA DI SBARCO (Hoping off) ---
                        // Se siamo arrivati in cima o vicini al target, facciamo un balzello per atterrare sulla piattaforma
                        if (nearTop || Math.abs(heightDiff) <= 25) {
                            this.vy = -350; // Piccolo salto verso l'alto
                            this.vx = (player.x > this.x) ? 250 : -250; // Salto verso il giocatore per sbarcare
                            this.isGrounded = false;
                        }
                        this.isClimbing = false;
                        this.climbTimer = 0.6; // Cooldown per evitare di riagganciarsi subito
                    }


                    if (this.isClimbing) {
                        this.y += this.vy * dt;
                        this.isGrounded = false;
                        return;
                    }

                    // Insegue il target scelto (Player o Scala) con sparpagliamento di gruppo
                    let finalTargetX = targetX + this.targetOffset;

                    // --- LOGICA ATTACCO A BALZO (LUNGE) ---
                    let distToPlayerX = Math.abs(player.x - pCenterX);
                    this.lungeCooldown -= dt; // Gestione cooldown globale del balzo

                    if (this.isGrounded && distToPlayerX > 150 && distToPlayerX < 350 && distToPlayerY < 100 && !this.isClimbing && this.lungeCooldown <= 0) {
                        this.lungeTimer += dt;
                        if (this.lungeTimer > 1.0) {
                            // BALZO!
                            this.vy = -450;
                            this.vx = this.direction * 450; // Scatto in avanti potente
                            this.isGrounded = false;
                            this.lungeTimer = 0;
                            this.lungeCooldown = 3.0 + Math.random() * 2.0; // Pausa tra un balzo e l'altro
                            playSound('jump', this.x, this.y);
                            this.visualScaleY = 1.6; // Si allunga nel balzo estremo
                        } else {
                            // CARICA (Si schiaccia a terra indicando l'attacco imminente)
                            this.visualScaleY = 0.55;
                            this.visualScaleX = 1.4;
                            this.vx *= 0.3; // Quasi si ferma mentre carica la molla
                        }
                    } else {
                        if (this.lungeTimer > 0) {
                            // Se il player esce dal range mentre carichiamo, resettiamo
                            this.lungeTimer = 0;
                        }
                        if (this.x < finalTargetX - 5) {
                            this.direction = 1;
                            if (this.vx < this.speed) this.vx += 25;
                        } else if (this.x > finalTargetX + 5) {
                            this.direction = -1;
                            if (this.vx > -this.speed) this.vx -= 25;
                        }
                    }

                    // --- SCHIVATA EVASIVA (Dopo essere stati colpiti) ---
                    if (this.isHit > 0.25 && this.isGrounded && !this.isDodging) {
                        if (Math.random() > 0.7) { // 30% di probabilità di schivata
                            this.isDodging = true;
                            this.vy = -350;
                            this.vx = -this.direction * 450; // Salto all'indietro
                            this.isGrounded = false;
                            playSound('jump', this.x, this.y);
                        }
                    }
                    if (this.isGrounded) this.isDodging = false;

                    // -- IA SMART (Salto) --
                    if (this.isGrounded) {
                        let lookAheadX = this.direction === 1 ? this.x + this.width + 40 : this.x - 40;
                        let hasFloor = false;
                        let obstacleAhead = false;

                        world.platforms.forEach(p => {
                            if (Math.abs(p.x - this.x) > 200) return;
                            if (lookAheadX >= p.x && lookAheadX <= p.x + p.width) {
                                if (p.y >= this.y + this.height - 30 && p.y <= this.y + this.height + 150) {
                                    hasFloor = true;
                                }
                            }
                            if (lookAheadX >= p.x && lookAheadX <= p.x + p.width) {
                                if (p.y < this.y + this.height - 10 && p.y > this.y - 50) {
                                    obstacleAhead = true;
                                }
                            }
                        });

                        let shouldJump = false;
                        if (!hasFloor && Math.abs(targetX - this.x) < 600) {
                            // Salta i buchi solo se necessario e con un pizzico di incertezza
                            if (Math.random() > 0.3) shouldJump = true;
                        }
                        if (obstacleAhead) shouldJump = true;

                        // Salta verso l'alto (piattaforme) solo se il target è decisamente sopra
                        if ((player.y < this.y - 120 && Math.abs(player.x - this.x) < 200) || (isTrappedInCave && targetX !== player.x)) {
                            shouldJump = true;
                        }

                        if (shouldJump) {
                            this.jumpDelay += dt;
                            // Aumentato il ritardo a 0.8s per farli "camminare" di più contro gli ostacoli
                            if (this.jumpDelay > 0.8) {
                                let finalPower = this.jumpPower * (0.85 + Math.random() * 0.2);
                                this.vy = finalPower;
                                this.vx = this.direction * (this.speed * 1.2 + (Math.random() * 30));
                                this.isGrounded = false;
                                playSound('jump', this.x, this.y);
                                this.jumpDelay = -0.5; // Cooldown dopo il salto
                            } else {
                                // Mentre decidono se saltare, rallentano invece di fermarsi del tutto
                                this.vx *= 0.6;
                            }
                        } else {
                            this.jumpDelay = 0;
                            if (!hasFloor) this.vx = 0; // Si fermano sull'orlo del baratro se decidono di non saltare
                        }
                    }
                }

                // --- SISTEMA DI COMBATTIMENTO ZOMBIE (Attacco vs Player & Alleati) ---
                if (!player.isHitTimer) player.isHitTimer = 0;
                
                // 1. Attacco vs Player (Inseguimento attivo)
                if (player.isHitTimer <= 0 && this.hp > 0 && this.isHit <= 0 && this.state === 'chasing') {
                    let pDx = Math.abs(player.x - (this.x + this.width/2));
                    let pDy = Math.abs(player.y - this.y);
                    if (pDx < 45 && pDy < 60) {
                        let facingEnemy = (this.x > player.x && player.direction === 1) || (this.x < player.x && player.direction === -1);
                        if (player.isParrying && facingEnemy) {
                            // PARATA SPECIALE ARCADE
                            if (playerStyle === 'PALADIN') {
                                playSound('hit', this.x, this.y);
                                this.hp -= 1.0; 
                                this.vx = -this.vx * 3.5;
                                this.vy = -200;
                                this.isHit = 0.5;
                                player.isHitTimer = 0.3;
                                createSparks(player.x + (40 * player.direction), player.y + 20, '#FFD700');
                            } else {
                                playSound('hit', this.x, this.y);
                                player.shieldDurability--;
                                this.vx = -this.vx * 1.5;
                                player.isHitTimer = 0.5;
                                createDust(player.x + 20 * player.direction, player.y + 20, 3);
                                if (player.shieldDurability <= 0) {
                                    player.hasShield = false;
                                    playSound('break', player.x, player.y);
                                    createPixelDissolve(player.x, player.y, 40, 80, ['#2c3e50', '#95a5a6', '#7f8c8d']);
                                }
                            }
                        } else {
                            // DANNO PIENO (Giocatore colpito)
                            playSound('player_hit');
                            let dmg = 15;
                            if (player.hasArmor) dmg *= 0.5;
                            player.health -= dmg;
                            player.vy = -350;
                            player.isHitTimer = 1.0;
                            
                            // Update HUD (Emergenza)
                            let hUI = document.getElementById('healthUI');
                            if (hUI) hUI.innerText = `Salute: ${Math.floor(player.health)}${player.hasShield ? " | ESCUDO DIVINO: ATTIVO 🛡️✨" : ""}`;
                        }
                    }
                }

                // 2. Attacco vs Alleati (Inseguimento attivo)
                allies.forEach(a => {
                    if (a.hp > 0 && a.isHitTimer <= 0 && this.hp > 0 && this.isHit <= 0 && this.state === 'chasing') {
                        let dAx = Math.abs(a.x - this.x);
                        let dAy = Math.abs(a.y - this.y);
                        if (dAx < 40 && dAy < 50) {
                            playSound('player_hit', a.x, a.y);
                            a.hp -= 10;
                            a.isHitTimer = 0.8;
                            a.vy = -200;
                            a.vx = (a.x > this.x ? 100 : -100);
                            createDust(a.x + a.width / 2, a.y + a.height, 5);
                        }
                    }
                });
                break;

            case 'digging':
                this.timer -= dt;
                // Costringerlo ad affondare ignorando il terreno duro per l'animazione mortale
                this.vy += this.gravity * dt;
                this.y += 12 * dt;
                if (this.timer <= 0) this.state = 'dead';
                break;

            case 'dead':
                this.vy += this.gravity * dt; // Cade preda dell'abisso
                break;
        }

        if (this.state !== 'dead' && this.state !== 'digging') {
            this.vy += this.gravity * dt;
        }

        // 1. FISICA ORIZZONTALE & COLLISIONE (Ottimizzata)
        this.x += this.vx * dt;
        world.platforms.forEach(p => {
            if (Math.abs(p.x - this.x) > 800) return;

            // "Piattaforme Unidirezionali" (One-Way) per Zombie
            let isOneWay = p.height <= 30 || p.isStairs || p.isBridge;
            if (isOneWay) return;

            if (this.y + this.height > p.y + 5 && this.y < p.y + p.height - 5) {
                if (this.vx > 0 && this.x + this.width > p.x && this.x < p.x + 10) {
                    this.x = p.x - this.width;
                    this.vx = 0;
                }
                else if (this.vx < 0 && this.x < p.x + p.width && this.x + this.width > p.x + p.width - 10) {
                    this.x = p.x + p.width;
                    this.vx = 0;
                }
            }
        });

        // 2. FISICA VERTICALE & COLLISIONE
        if (this.state !== 'digging') {
            this.y += this.vy * dt;
        }

        if (this.state !== 'digging' && this.state !== 'dead') {
            this.isGrounded = false;
            world.platforms.forEach(p => {
                if (Math.abs(p.x - this.x) > 800) return;

                if (this.x < p.x + p.width - 5 && this.x + this.width > p.x + 5) {
                    if (this.vy >= 0 && this.y + this.height >= p.y && this.y + this.height <= p.y + 20 + this.vy * dt) {
                        this.isGrounded = true;
                        this.vy = 0;
                        this.y = p.y - this.height;
                    }
                    else if (this.vy < 0 && this.y <= p.y + p.height && this.y >= p.y + p.height - 20) {
                        let isOneWay = p.height <= 30 || p.isStairs || p.isBridge;
                        if (!isOneWay) {
                            this.vy = 0;
                            this.y = p.y + p.height;
                        }
                    }
                }
            });

            // --- GESTIONE SQUASH & STRETCH (Atterraggio Zombie) ---
            if (this.isGrounded && !this.wasGrounded) {
                this.visualScaleY = 0.75;
                this.visualScaleX = 1.2;
                createDust(this.x + this.width / 2, this.y + this.height, 3);
            }
            this.wasGrounded = this.isGrounded;

            // Logica Morte Alleato (Saluto)
            if (this.isAlly && this.hp <= 0 && !this.isSaluting) {
                this.isSaluting = true;
                this.state = 'dead';
                this.saluteTimer = 2.0;
                this.vx = 0;
            }


            this.visualScaleY += (1 - this.visualScaleY) * 0.1;
            this.visualScaleX += (1 - this.visualScaleX) * 0.1;

        } else if (this.state === 'dead') {
            if (this.isSaluting) {
                this.saluteTimer -= dt;
                this.deadOpacity = Math.max(0, this.saluteTimer / 2.0);
                this.deadRotation = 0; // Sta dritto per salutare l'eroe
                if (this.saluteTimer <= 0) {
                    this.state = 'dead';
                }
            } else {
                this.deadRotation += (Math.PI / 2 - this.deadRotation) * 0.1;
                this.deadOpacity -= dt * 0.5;
            }
            this.vx *= 0.9;
        }
    }

    draw(ctx, camera) {
        if (this.state === 'dead') return;

        let screenX = this.x - camera.x;
        let screenY = this.y - camera.y;

        ctx.save();

        // --- ANIMAZIONE EMERSIONE DAL TERRENO ---
        if (this.state === 'emerging') {
            // progress va da 0 (appena nato) a 1 (pronto a correre)
            let progress = 1.0 - (this.timer / 0.5);
            let risingOffset = (1.0 - progress) * this.height;
            
            ctx.beginPath();
            ctx.rect(screenX - 40, screenY - 40, 120, 120 - risingOffset);
            ctx.clip();
            
            // Applica l'offset per la salita fluida
            ctx.translate(0, risingOffset);
        } else if (this.state === 'digging') {
            let perc = this.timer / 3.0;
            ctx.globalAlpha = Math.max(0, perc); // Si decompone nell'aria e nebbia
        }

        let bob = (this.isGrounded && this.state === 'chasing' && Math.abs(this.vx) > 5) ? Math.abs(Math.sin(Date.now() / 150)) * 4 : 0;

        if (this.state === 'dead') {
            ctx.globalAlpha = Math.max(0, this.deadOpacity);
            bob = 0;
        }

        ctx.translate(screenX + this.width / 2, screenY + this.height / 2 - bob);
        if (this.direction === -1) ctx.scale(-1, 1);

        // Applica Squash & Stretch e Rotazione Morte
        ctx.scale(this.visualScaleX, this.visualScaleY);
        if (this.state === 'dead') ctx.rotate(this.deadRotation);

        // Cromaticità Putrefatta Zombie (Variante Pallida per Grotte)
        let isWhite = this.type === 'white' || this.type === 'cave';
        let mainColor = (this.isHit > 0) ? '#FFFFFF' : (isWhite ? '#F5F5F7' : '#3E7D32');
        let shadowColor = (this.isHit > 0) ? '#FF4444' : (isWhite ? '#D0D0D5' : '#1B5E20');
        let eyeColor = (this.isHit > 0) ? '#000' : (isWhite ? '#FFFFFF' : '#DD0000');
        let outline = isWhite ? '#202025' : '#0A1C0A';

        function drawZBlock(bx, by, bw, bh, color) {
            ctx.fillStyle = outline;
            ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
            ctx.fillStyle = color;
            ctx.fillRect(bx, by, bw, bh);
        }

        // Gambe incerte (Unite in marcia trascinata)
        drawZBlock(-6, 15, 12, 28, shadowColor);

        // Braccio Dietro (Lanciato rigido parallelo alla terra!)
        ctx.save();
        ctx.translate(0, -10);
        ctx.rotate(-Math.PI / 2.5); // Braccio dritto da Infezione
        drawZBlock(-4, 0, 8, 34, shadowColor); // Allungate le braccia (da 22 a 34px)!
        ctx.restore();

        // Torso Rigonfio
        ctx.save();
        ctx.rotate(0.1);
        drawZBlock(-10, -15, 20, 32, mainColor);
        ctx.restore();

        // Cranio inclinato avido di cervelli
        ctx.save();
        ctx.rotate(0.25);
        drawZBlock(-14, -40, 28, 26, mainColor);
        // Occhio Infetto!
        ctx.fillStyle = eyeColor;
        ctx.fillRect(4, -34, 10, 8);
        ctx.restore();

        // Braccio Avanti Identico e Mostruoso
        // Braccio Avanti Identico (Saluto se l'alleato sta morendo)
        ctx.save();
        ctx.translate(0, -10);
        if (this.isSaluting) {
            ctx.rotate(-Math.PI * 0.8); // Braccio alzato verso l'alto (Saluto Finale)
        } else {
            ctx.rotate(-Math.PI / 2.2);
        }
        drawZBlock(-4, 0, 8, 34, mainColor);
        ctx.restore();

        // --- DISEGNO EQUIPAGGIAMENTO ALLEATO ---
        if (this.isAlly) {
            // DISEGNO SPADA
            ctx.save();
            ctx.translate(15, -15);
            ctx.rotate(Math.sin(Date.now() / 120) * 0.2 + 0.5);
            ctx.fillStyle = '#bdc3c7'; // Lama
            ctx.fillRect(0, -32, 6, 32);
            ctx.fillStyle = '#7f8c8d'; // Elsa
            ctx.fillRect(-2, -5, 10, 4);
            ctx.restore();

            // DISEGNO SCUDO
            ctx.save();
            ctx.translate(-15, -10);
            ctx.fillStyle = '#2980b9'; // Scudo Blu Reale
            ctx.fillRect(0, -20, 18, 32);
            ctx.strokeStyle = '#3498db';
            ctx.lineWidth = 2;
            ctx.strokeRect(0, -20, 18, 32);
            ctx.restore();
        }

        ctx.restore(); // Fine zona Effetti Voxel!

        // HUD - MicroBarra di Salute dello Zombie!
        if (this.state !== 'emerging' && this.state !== 'digging' && this.hp > 0) {
            ctx.fillStyle = '#111';
            ctx.fillRect(screenX, screenY - 20, 40, 8); // Base Oscura
            let maxHP = this.isAlly ? 10 : 3; // Gli alleati hanno più vita visiva? No, usiamo tacche diverse
            let barW = 36 / (this.isAlly ? 5 : 3);
            for (let b = 0; b < (this.isAlly ? 5 : 3); b++) {
                ctx.fillStyle = (b < (this.isAlly ? this.hp / 20 : this.hp)) ? (this.isAlly ? '#3498db' : '#DD0000') : '#440000';
                ctx.fillRect(screenX + 2 + (b * barW), screenY - 18, barW - 2, 4);
            }
        }
    }
}

// --- FUNZIONE UNIVERSALE DI SPAWN AL SUOLO (Anti Pioggia Zombie) ---
function spawnEnemyAtGround(x, preferredY, type = 'surface', forceBoss = false) {
    let spawnY = preferredY;
    let found = false;
    
    // Scansione piattaforme ottimizzata (Ciclo interruttibile)
    let bestDist = 10000;
    for (let p of world.platforms) {
        if (x + 10 > p.x && x < p.x + p.width - 10) {
            let dist = Math.abs(p.y - preferredY);
            if (dist < bestDist) {
                bestDist = dist;
                let targetH = forceBoss ? 220 : 80;
                spawnY = p.y - targetH;
                found = true;
                
                // Se abbiamo trovato un suolo vicinissimo (< 50px), possiamo fermarci!
                if (dist < 50) break;
            }
        }
    }

    if (forceBoss) {
        let boss = new BossZombie(x, spawnY);
        enemies.push(boss);
        activeBoss = boss;
        return boss;
    } else {
        let z = new Zombie(x, spawnY, type);
        enemies.push(z);
        return z;
    }
}

// ==========================================
// CLASSE BOSS: OMEGA ZOMBIE (Gigante, Attacchi ad Area, Summoning)
// ==========================================
class BossZombie {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 140; // Leggermente più largo
        this.height = 220; // Più alto
        this.vx = 0;
        this.vy = 0;
        this.speed = 45; // MOLTO LENTO (Richiesta)
        this.gravity = 1500;

        this.state = 'emerging';
        this.timer = 1.0; // Ridotto a 1.0s (Imponente ma rapido)
        this.hp = 40; 
        this.maxHealth = 40;
        this.isHit = 0;
        this.isBoss = true; 
        this.deathTimer = 0;
        this.isGrounded = false;

        this.attackCooldown = 6.0; // Meno agile
        this.isBoss = true;
        this.visualScaleX = 1;
        this.visualScaleY = 1;
        this.pulse = 0;
        
        // FX Boss
        this.slamVisualTimer = 0;
    }

    update(dt, world, player) {
        if (this.isHit > 0) this.isHit -= dt;
        if (this.slamVisualTimer > 0) this.slamVisualTimer -= dt;
        this.attackCooldown -= dt;
        this.pulse += dt;

        switch (this.state) {
            case 'emerging':
                this.timer -= dt;
                if (this.timer <= 0) {
                    this.state = 'chasing';
                    playSound('wake', this.x, this.y);
                    screenShake = 30;
                }
                break;

            case 'chasing':
                let dx = player.x - (this.x + this.width / 2);
                this.direction = dx > 0 ? 1 : -1;

                if (this.isHit > 0) {
                    this.vx = 0; 
                } else if (Math.abs(dx) > 80) {
                    this.vx = this.direction * this.speed;
                } else {
                    this.vx *= 0.85;
                }

                if (this.attackCooldown <= 0) {
                    let dist = Math.abs(dx);
                    if (dist < 220) {
                        this.state = 'slamming';
                        this.timer = 1.5; // Anticipazione molto lenta
                        this.vx = 0;
                    } else if (dist < 500) {
                        this.state = 'charging';
                        this.timer = 1.2;
                        this.vx = 0;
                    }
                }
                break;

            case 'slamming':
                this.timer -= dt;
                if (this.timer > 0.4) {
                    this.visualScaleY = 1.3;
                    this.visualScaleX = 0.85;
                } else if (this.timer > 0) {
                    if (this.visualScaleY > 1) {
                        this.visualScaleY = 0.5;
                        this.visualScaleX = 1.7;
                        this.slamVisualTimer = 0.5;
                        screenShake = 45; // Impatto devastante
                        playSound('break', this.x, this.y);
                        
                        let bossCenterX = this.x + this.width / 2;
                        let bossCenterY = this.y + this.height / 2;
                        let distToPlayer = Math.hypot(player.x - bossCenterX, player.y - bossCenterY);
                        let dy = Math.abs(player.y - bossCenterY);

                        // NUOVA HITBOX: Raggio 1.5x altezza (330px) ma solo LATERALMENTE (dy < 120)
                        if (distToPlayer < 330 && dy < 120) {
                            player.health -= 35; // Danni aumentati
                            player.vy = -600;
                            player.vx = (player.x > this.x ? 700 : -700);
                            player.isHitTimer = 1.2;
                            playSound('player_hit');
                        }
                        
                        // Summon support (solo se necessario)
                        if (enemies.length < 12) {
                            spawnEnemyAtGround(this.x - 120, this.y, 'surface');
                            spawnEnemyAtGround(this.x + this.width + 120, this.y, 'surface');
                        }
                    }
                } else {
                    this.state = 'chasing';
                    this.attackCooldown = 5.0 + Math.random() * 3.0; // Recupero lungo
                }
                break;

            case 'charging':
                this.timer -= dt;
                if (this.timer > 0) {
                    this.visualScaleX = 0.8;
                    this.direction = (player.x > this.x) ? 1 : -1;
                } else {
                    this.vx = this.direction * 500; // Carica un po' più lenta ma inarrestabile
                    
                    let dx = Math.abs(player.x - (this.x + this.width / 2));
                    let dy = Math.abs(player.y - (this.y + this.height / 2));

                    // COLPISCE SOLO LATERALMENTE (dy < 120) e nel raggio di carica
                    if (dx < 160 && dy < 120) {
                        player.health -= 25;
                        player.isHitTimer = 1.0;
                        player.vx = this.direction * 900;
                        player.vy = -400;
                        this.state = 'chasing';
                        this.attackCooldown = 6.0;
                        screenShake = 20;
                        playSound('zombie_hit');
                    }
                    if (Math.abs(this.timer) > 2.0) {
                        this.state = 'chasing';
                        this.attackCooldown = 4.0;
                    }
                }
                break;

            case 'dead':
                this.vx *= 0.9;
                this.visualScaleY *= 0.98;
                break;
        }

        if (this.state !== 'dead') {
            this.vy += this.gravity * dt;
        }

        // 1. COLLISIONI ORIZZONTALI (MURI)
        this.x += this.vx * dt;
        
        // Limiti Mappa
        if (this.x < 0) this.x = 0;
        if (this.x + this.width > world.mapWidth) this.x = world.mapWidth - this.width;

        world.platforms.forEach(p => {
            if (p.isOneWay || p.isBridge || p.isStairs) return; // Salta piattaforme passanti per i muri
            
            // AGGIUNTA: Se è in superficie, ignora solo i muri di terra (per il libero movimento).
            // MA se è in Grotte o il muro è di tipo grotta, lo deve rispettare.
            if (!p.isCave && this.y < 650) return; 

            // Check collisione laterale con Rilevamento "Sweep" (25px o velocità frame)
            let wallDetectSize = Math.max(25, Math.abs(this.vx * dt) + 5);
            if (this.y + this.height > p.y + 10 && this.y < p.y + p.height - 10) {
                if (this.vx > 0 && this.x + this.width > p.x && this.x < p.x + wallDetectSize) {
                    this.x = p.x - this.width;
                    this.vx = 0;
                } else if (this.vx < 0 && this.x < p.x + p.width && this.x + this.width > p.x + p.width - wallDetectSize) {
                    this.x = p.x + p.width;
                    this.vx = 0;
                }
            }
        });

        // 2. FISICA VERTICALE & COLLISIONI (FLOOR)
        this.y += this.vy * dt;

        // Limite inferiore di sicurezza (Abisso) - Teletrasporto di Recupero
        if (this.y > 2200) {
            this.x = player.x + (Math.random() * 200 - 100);
            this.y = player.y - 150; // Riappare dall'alto come per l'alleato
            this.vy = 0;
            this.vx = 0;
            this.visualScaleY = 1.5;
            playSound('wake', this.x, this.y);
            createDust(this.x, this.y, 20);
        }

        this.isGrounded = false;
        world.platforms.forEach(p => {
            // "Sweep" collision: usiamo + this.vy * dt + 20 come margine per prevenire tunneling ad alte velocità
            if (this.x + this.width > p.x + 5 && this.x < p.x + p.width - 5) {
                if (this.vy >= 0 && this.y + this.height >= p.y && this.y + this.height <= p.y + 25 + (this.vy * dt)) {
                    this.isGrounded = true;
                    this.vy = 0;
                    this.y = p.y - this.height;
                }
            }
        });

        this.visualScaleY += (1 - this.visualScaleY) * 0.08;
        this.visualScaleX += (1 - this.visualScaleX) * 0.08;
    }

    draw(ctx, camera) {
        if (this.state === 'dead') return; // Scompare all'istante per l'esplosione!
        
        let screenX = this.x - camera.x;
        let screenY = this.y - camera.y;

        // ONDA D'URTO (Shockwave Effect)
        if (this.slamVisualTimer > 0) {
            let radius = (1 - this.slamVisualTimer / 0.5) * 400;
            ctx.save();
            ctx.strokeStyle = `rgba(255, 255, 255, ${this.slamVisualTimer * 2})`;
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.ellipse(screenX + this.width/2, screenY + this.height, radius, radius * 0.3, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        ctx.save();
        // --- ANIMAZIONE EMERSIONE BOSS DAL TERRENO ---
        if (this.state === 'emerging') {
            // PROGRESS: da 0 (nascita) a 1 (battaglia)
            let progress = 1.0 - (this.timer / 1.0);
            let risingOffset = (1.0 - progress) * this.height;

            ctx.beginPath();
            ctx.rect(screenX - 100, screenY - 100, 350, (this.height + 100) - risingOffset);
            ctx.clip();
            
            // Applica la salita mastodontica
            ctx.translate(0, risingOffset);
        }

        ctx.translate(screenX + this.width / 2, screenY + this.height);
        if (this.direction === -1) ctx.scale(-1, 1);
        ctx.scale(this.visualScaleX, this.visualScaleY);

        // Ombra Massive
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.ellipse(0, 0, 80, 20, 0, 0, Math.PI * 2);
        ctx.fill();

        let mainColor = (this.isHit > 0) ? '#FFF' : '#2C3E50';
        let darkColor = '#1A1A1A';
        let armorColor = '#505050';
        let coreColor = `hsl(${20 + Math.sin(this.pulse * 2) * 20}, 100%, 50%)`; // Nucleo instabile

        // GAMBE (Massicce come pilastri)
        ctx.fillStyle = darkColor;
        ctx.fillRect(-50, -40, 40, 40);
        ctx.fillRect(10, -40, 40, 40);
        ctx.fillStyle = mainColor;
        ctx.fillRect(-45, -35, 30, 35);
        ctx.fillRect(15, -35, 30, 35);

        // TORSO (Voxel corazzato)
        ctx.fillStyle = darkColor;
        ctx.fillRect(-60, -160, 120, 125);
        ctx.fillStyle = mainColor;
        ctx.fillRect(-55, -155, 110, 115);

        // PIASTRA TORACICA E NUCLEO
        ctx.fillStyle = armorColor;
        ctx.fillRect(-40, -140, 80, 60);
        ctx.fillStyle = coreColor;
        ctx.shadowBlur = 20;
        ctx.shadowColor = coreColor;
        ctx.beginPath();
        ctx.arc(0, -110, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // SPALLACCI (Con punte)
        ctx.fillStyle = armorColor;
        // Spallaccio sinistro
        ctx.fillRect(-75, -175, 50, 45);
        ctx.beginPath();
        ctx.moveTo(-75, -175); ctx.lineTo(-90, -200); ctx.lineTo(-50, -175); ctx.fill();
        // Spallaccio destro
        ctx.fillRect(25, -175, 50, 45);
        ctx.beginPath();
        ctx.moveTo(75, -175); ctx.lineTo(90, -200); ctx.lineTo(50, -175); ctx.fill();

        // TESTA (Schiacciata nel torso per protezione)
        ctx.fillStyle = darkColor;
        ctx.fillRect(-35, -205, 70, 55);
        ctx.fillStyle = mainColor;
        ctx.fillRect(-31, -201, 62, 47);
        
        // Occhi (Fessure luminose)
        ctx.fillStyle = coreColor;
        ctx.shadowBlur = 10;
        ctx.shadowColor = coreColor;
        ctx.fillRect(8, -185, 18, 5);
        ctx.shadowBlur = 0;

        // BRACCIA E CATENE
        ctx.fillStyle = mainColor;
        let armY = (this.state === 'slamming' && this.timer < 0.4) ? -100 : -140;
        let armH = (this.state === 'slamming' && this.timer < 0.4) ? 140 : 120;
        
        // Braccio Sinistro
        ctx.fillRect(-90, armY, 40, armH);
        // Catena braccio sinistro
        ctx.fillStyle = '#777';
        ctx.fillRect(-85, armY + armH, 8, 30);
        ctx.fillRect(-75, armY + armH + 10, 8, 25);

        // Braccio Destro
        ctx.fillStyle = mainColor;
        ctx.fillRect(50, armY, 40, armH);
        // Catena braccio destro
        ctx.fillStyle = '#777';
        ctx.fillRect(55, armY + armH, 8, 25);
        ctx.fillRect(65, armY + armH + 15, 8, 35);

        ctx.restore();
    }
}

function createSparks(x, y) {
    for (let i = 0; i < 10; i++) {
        particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 400,
            vy: (Math.random() - 0.5) * 400,
            life: 0.2 + Math.random() * 0.2,
            color: '#FFD700',
            size: 2 + Math.random() * 3
        });
    }
}

function drawBossUI(ctx, boss) {
    if (!boss || boss.hp <= 0) return;

    const barW = 600;
    const barH = 20;
    const x = (canvas.width - barW) / 2;
    const y = 80;

    // Sfondo e Ombra
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x - 5, y - 5, barW + 10, barH + 40);
    
    // Nome Boss
    ctx.fillStyle = '#FF3333';
    ctx.font = 'bold 24px Consolas';
    ctx.textAlign = 'center';
    ctx.fillText("OMEGA ZOMBIE - IL DIVORATORE", canvas.width / 2, y + 55);

    // Barra Vita
    ctx.fillStyle = '#441111';
    ctx.fillRect(x, y, barW, barH);
    
    let hpPerc = boss.hp / boss.maxHealth;
    let grad = ctx.createLinearGradient(x, 0, x + barW, 0);
    grad.addColorStop(0, '#880000');
    grad.addColorStop(1, '#FF3333');
    
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, barW * hpPerc, barH);
    
    // Bordi Oro
    ctx.strokeStyle = '#F1C40F';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, barW, barH);
}

// ==========================================
// CLASSE: UMANO (Zombie Curato - Pacifico)
// ==========================================
class Human {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 30;
        this.height = 70;
        this.vx = (Math.random() - 0.5) * 50;
        this.vy = 0;
        this.gravity = 1500;
        this.speed = 40 + Math.random() * 30;
        this.isGrounded = false;
        this.color = `hsl(${Math.random() * 360}, 70%, 70%)`; // Vestiti colorati!
        this.saltoTimer = Math.random() * 2;
    }

    update(dt, world) {
        this.vy += this.gravity * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        this.saltoTimer -= dt;
        if (this.isGrounded && this.saltoTimer <= 0) {
            this.vy = -300 - Math.random() * 200;
            this.saltoTimer = 1 + Math.random() * 3;
            this.vx = (Math.random() - 0.5) * 100;
        }

        // Collisioni base
        this.isGrounded = false;
        world.platforms.forEach(p => {
            if (this.x + this.width > p.x && this.x < p.x + p.width) {
                if (this.vy >= 0 && this.y + this.height >= p.y && this.y + this.height <= p.y + 30) {
                    this.isGrounded = true;
                    this.vy = 0;
                    this.y = p.y - this.height;
                }
            }
        });
        
        // Limiti X Mondo (semplice)
        if (this.x < 0) this.vx = Math.abs(this.vx);
        if (this.x > world.mapWidth) this.vx = -Math.abs(this.vx);
    }

    draw(ctx, camera) {
        let sx = this.x - camera.x;
        let sy = this.y - camera.y;
        if (sx < -100 || sx > canvas.width + 100) return;

        ctx.save();
        ctx.translate(sx + this.width/2, sy + this.height);
        
        // Gambe
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-5, 0); ctx.lineTo(-8, -25);
        ctx.moveTo(5, 0); ctx.lineTo(8, -25);
        ctx.stroke();

        // Corpo (Vestito)
        ctx.fillStyle = this.color;
        ctx.fillRect(-10, -55, 20, 30);
        
        // Braccia al cielo (Esuberanza!)
        ctx.beginPath();
        ctx.moveTo(-10, -50); ctx.lineTo(-20, -70);
        ctx.moveTo(10, -50); ctx.lineTo(20, -70);
        ctx.stroke();

        // Testa (Pelle umana)
        ctx.fillStyle = '#ffdbac';
        ctx.beginPath();
        ctx.arc(0, -65, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }
}

// ==========================================
// CLASSE: OGGETTO COLLEZIONABILE (Frammento)
// ==========================================
class CollectibleItem {
    constructor(x, y, id) {
        this.x = x;
        this.y = y;
        this.id = id;
        this.width = 40;
        this.height = 40;
        this.rotation = 0;
        this.bob = 0;
        this.collected = false;
    }

    update(dt, player) {
        this.rotation += dt * 2;
        this.bob = Math.sin(Date.now() / 200) * 10;

        let dx = (player.x + player.width/2) - (this.x + this.width/2);
        let dy = (player.y + player.height/2) - (this.y + this.height/2);
        let dist = Math.sqrt(dx*dx + dy*dy);

        if (dist < 60 && !this.collected) {
            this.collected = true;
            collectShard();
            playSound('castle_loot');
            createPixelDissolve(this.x, this.y, 40, 40, ['#00ffcc', '#ffffff', '#0099ff']);
        }
    }

    draw(ctx, camera) {
        if (this.collected) return;
        let sx = this.x - camera.x;
        let sy = this.y - camera.y + this.bob;

        ctx.save();
        ctx.translate(sx + 20, sy + 20);
        
        // 1. EFFETTO ALONE SPIRITUALE (AURORA)
        ctx.save();
        let pulseGlow = 10 + Math.sin(Date.now() / 300) * 5;
        ctx.shadowBlur = pulseGlow;
        ctx.shadowColor = '#8E44AD'; // Viola Arcustico
        
        // 2. RENDERING GEMMA SFACCETTATA (CRYSTAL CUT)
        // Disegniamo la gemma come un solido con facce diverse
        const colors = ['#8E44AD', '#9B59B6', '#D2B4DE', '#5B2C6F'];
        const drawFace = (pts, color) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
            ctx.closePath();
            ctx.fill();
        };

        // Facce del cristallo (Coordinate relative al centro 0,0)
        drawFace([{x:0, y:-22}, {x:12, y:-8}, {x:0, y:0}], colors[1]); // Top Right
        drawFace([{x:0, y:-22}, {x:-12, y:-8}, {x:0, y:0}], colors[0]); // Top Left
        drawFace([{x:12, y:-8}, {x:16, y:8}, {x:0, y:0}], colors[3]); // Mid Right
        drawFace([{x:-12, y:-8}, {x:-16, y:8}, {x:0, y:0}], colors[2]); // Mid Left
        drawFace([{x:16, y:8}, {x:0, y:22}, {x:0, y:0}], colors[0]); // Bottom Right
        drawFace([{x:-16, y:8}, {x:0, y:22}, {x:0, y:0}], colors[1]); // Bottom Left

        // 3. NUCLEO LUMINOSO (CORE)
        let grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 10);
        grad.addColorStop(0, '#FFFFFF');
        grad.addColorStop(0.6, '#00E5FF');
        grad.addColorStop(1, 'rgba(0, 229, 255, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();

        // 4. ORBITALI SPIRITUALI (Fuochi fatui)
        for (let i = 0; i < 3; i++) {
            ctx.save();
            let ang = (Date.now() / (400 + i * 100)) + (i * Math.PI * 2 / 3);
            let rx = Math.cos(ang) * (20 + i * 5);
            let ry = Math.sin(ang) * (15 + i * 3);
            
            ctx.translate(rx, ry);
            ctx.fillStyle = (i === 1) ? '#FFFFFF' : '#00E5FF';
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#00E5FF';
            ctx.beginPath();
            ctx.arc(0, 0, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        
        ctx.restore();
    }
}

// ==========================================
// 5. THE GAME DIRECTOR (Logica e Game Loop)
// ==========================================

let isShopOpen = false;

// ==========================================
// 4.5 HELPER FUNCTIONS (Particle Systems & FX)
// ==========================================

function createDust(x, y, count = 12) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 120,
            vy: (Math.random() - 0.5) * 50 - 20,
            life: 0.8 + Math.random() * 0.4,
            size: 2 + Math.random() * 4,
            color: '#bdc3c7'
        });
    }
}

function createPixelDissolve(x, y, w, h, colors = ['#FFF', '#CCC', '#888'], count = 24) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x + Math.random() * w,
            y: y + Math.random() * h,
            vx: (Math.random() - 0.5) * 150,
            vy: (Math.random() - 0.5) * 150 - 50,
            life: 1.2 + Math.random() * 0.8,
            size: 3 + Math.random() * 5,
            color: colors[Math.floor(Math.random() * colors.length)]
        });
    }
}

function openShop() {
    isShopOpen = true;
    document.getElementById('shopMenu').style.display = 'flex';
}

function closeShop() {
    isShopOpen = false;
    document.getElementById('shopMenu').style.display = 'none';
}

function collectShard() {
    playerFragments++;
    // Attiva lo slot nell'UI
    let slot = document.getElementById(`slot-${playerFragments - 1}`);
    if (slot) slot.classList.add('active');

    if (playerFragments >= 4) {
        // TRIGGER MAGIA FINALE AUTOMATICO
        setTimeout(castFinalMagic, 1500);
    }
}

function castFinalMagic() {
    if (gameVictory) return;
    gameVictory = true;
    screenShake = 100;
    playSound('wake'); // Suono potente
    
    // TRASFORMAZIONE DI MASSA
    enemies.forEach(z => {
        humans.push(new Human(z.x, z.y));
    });
    enemies = [];
    activeBoss = null;

    // Mostra Schermata Vittoria
    document.getElementById('victoryScreen').style.display = 'flex';
    let victoryScore = document.getElementById('victoryScore');
    if (victoryScore) victoryScore.innerText = `Punteggio Finale: ${player.score + 1000}`;
}

// Rendiamo buyItem globale per l'onclick dell'HTML
window.buyItem = function (item) {
    let cost = 0;
    if (item === 'heal') cost = 40;
    if (item === 'shield') cost = 60;
    if (item === 'boots') cost = 120;
    if (item === 'armor') cost = 150;
    if (item === 'ally') cost = 200;
    if (item === 'scroll') cost = 100;

    if (player.score >= cost) {
        player.score -= cost;
        document.getElementById('scoreUI').innerText = `Punti: ${player.score}`;

        if (item === 'heal') {
            player.health = 100;
            document.getElementById('healthUI').innerText = `Salute: ${player.health}`;
            playSound('loot');
        } else if (item === 'shield') {
            player.hasShield = true;
            player.shieldDurability = 5;
            playSound('loot');
        } else if (item === 'boots') {
            player.speed *= 1.2;
            playSound('jump');
        } else if (item === 'armor') {
            player.hasArmor = true;
            playSound('castle_loot');
        } else if (item === 'ally') {
            let hero = new HeroAlly(player.x - 50, player.y);
            allies.push(hero);
            playSound('wake', player.x, player.y);
        } else if (item === 'scroll') {
            player.hasSupportScroll = true;
            playSound('loot');
        }
        closeShop();
    }
};



world = new World();
player = new Player(world.platforms && world.platforms[0] ? world.platforms[0].x + 50 : 100, 400);

function update(dt) {
    if (!world || !player || gameState === 'MENU') return;

    // Se lo shop è aperto, il tempo scorre al 20% (Effetto Slow-Mo)
    if (isShopOpen) dt *= 0.2;
    if (keys['Escape'] && isShopOpen) closeShop();

    // 1. MOTORE TEMPORALE DINAMICO (RICHIESTA FRENESIA ESTREMA V3)
    let timeSpeed = 0.1;
    if (timeOfDay > 5 && timeOfDay <= 19) {
        timeSpeed = 14 / 3;   // 3 sec per il giorno (Ultravolte)
    } else {
        timeSpeed = 10 / 12;  // 12 sec per la notte (Ultra-Frenetico)
    }

    let prevTime = timeOfDay;
    timeOfDay += dt * timeSpeed;
    if (timeOfDay >= 24) timeOfDay -= 24;
    
    // --- AVANZAMENTO GIORNO E REFRESH STRUTTURE ---
    if (prevTime <= 5 && timeOfDay > 5) {
        currentDay++;
        // Ogni giorno controlliamo se qualche castello o casa può essere riutilizzata (Cooldown 10 giorni)
        world.interactables.forEach(i => {
            if (i.looted && i.lootedDay && currentDay >= i.lootedDay + 10) {
                i.looted = false; // Torna disponibile!
                i.lootedDay = null; // Resetta il timer
            }
        });

        // --- LOGICA PERGAMENA DEL SUPPORTO ---
        if (player.hasSupportScroll && currentDay % 5 === 0 && player.lastSupportDay !== currentDay) {
            player.lastSupportDay = currentDay;
            let hero = new HeroAlly(player.x - 50, player.y);
            allies.push(hero);
            playSound('wake', player.x, player.y);
            // Feedback visivo
            createDust(player.x, player.y, 15);
        }
    }

    // 2. HUD Orologio e Statistiche
    let elapsedSecs = 0;
    let maxTimeStr = (timeOfDay > 5 && timeOfDay <= 19) ? "0:03" : "0:12";
    if (timeOfDay > 5 && timeOfDay <= 19) {
        elapsedSecs = ((timeOfDay - 5) / 14) * 3;
    } else {
        let nightHrs = (timeOfDay > 19) ? (timeOfDay - 19) : (timeOfDay + 5);
        elapsedSecs = (nightHrs / 10) * 12;
    }
    let timerMin = Math.floor(elapsedSecs / 60);
    let timerSec = Math.floor(elapsedSecs % 60).toString().padStart(2, '0');
    let timeUI = document.getElementById('timeUI');
    if (timeUI) timeUI.innerText = `Giorno ${currentDay} - Timer: ${timerMin}:${timerSec} / ${maxTimeStr}`;

    // 3. ESECUZIONE CORPO FISICO (Fix Freeze)
    player.update(dt, world, enemies);

    // 3.1 AGGIORNAMENTO ALLEATI
    for (let i = allies.length - 1; i >= 0; i--) {
        let a = allies[i];
        a.update(dt, world, player, enemies, allies);
        if (a.hp <= 0 && !a.isSaluting) {
            a.isSaluting = true;
            a.saluteTimer = 2.0;
        }
        if (a.isSaluting && a.saluteTimer <= 0) {
            allies.splice(i, 1);
        }
    }

    // 3. --- AGGIORNAMENTO PARTICELLE (Ottimizzato con Filter) ---
    particles.forEach(p => {
        p.life -= dt;
        p.opacity = p.life / 2.0;

        // Fisica base particelle
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += p.gravity * dt;
    });

    // Pulizia batch: molto più efficiente di splice interni
    if (particles.length > 300) {
        particles = particles.filter(p => p.life > 0);
    }

    // 3.3 AGGIORNAMENTO NEMICI (Il Grande Trito-ossa)
    // Genera l'ondata notturna
    if (timeOfDay >= 19 && currentDay > lastSpawnNight) {
        lastSpawnNight = currentDay;
        
        // --- SPAWNING BOSS (Ogni 5 Giorni) ---
        if (currentDay > 0 && currentDay % 5 === 0 && !activeBoss) {
            let spawnDir = Math.random() > 0.5 ? 1 : -1;
            let spawnX = player.x + (700 * spawnDir);
            
            spawnEnemyAtGround(spawnX, player.y, 'surface', true); 
            playSound('wake', spawnX, player.y);
            screenShake = 30;
        }

        // Ondata Normale
        let numZombies = Math.min(10, currentDay); 
        for (let i = 0; i < numZombies; i++) {
            let spawnDir = Math.random() > 0.5 ? 1 : -1;
            let spawnX = player.x + (550 * spawnDir) + (Math.random() * 200 - 100);
            
            spawnEnemyAtGround(spawnX, player.y, 'surface');
        }
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
        let z = enemies[i];

        // Logica Morte Universale
        if (z.hp <= 0 && z.state !== 'dead') {
            playSound('kill', z.x, z.y);
            z.state = 'dead';
            z.deathTimer = z.isBoss ? 1.0 : 4.0; // I cadaveri spariscono dopo 4 secondi (1s per il Boss che esplode)
            player.score += (z.type === 'white' || z.type === 'cave') ? 10 : 5;
            let scoreUI = document.getElementById('scoreUI');
            if (scoreUI) scoreUI.innerText = `Punti: ${player.score}`;
            
            if (z.isBoss) {
                // --- MEGA ESPLOSIONE OMEGA ZOMBIE ---
                let bossColors = ['#2C3E50', '#1A1A1A', '#505050', '#FF4400', '#FFD700'];
                createPixelDissolve(z.x, z.y, z.width, z.height, bossColors, 500);
                screenShake = 60; // Onda d'urto massiccia
                createDust(z.x + z.width / 2, z.y + z.height, 40);
            } else {
                createDust(z.x + z.width / 2, z.y + z.height, 8);
            }
        }

        z.update(dt, world, player);
        if (z.state === 'dead') {
            z.deathTimer -= dt;
            if (z === activeBoss) {
                // --- PREMIO VITTORIA BOSS ---
                player.score += 500;
                player.health = 100;
                if (player.hasShield) player.shieldDurability = 10; // Mega Scudo
                activeBoss = null;
                screenShake = 40;
                playSound('castle_loot');

                // DROP FRAMMENTO MAGICO
                collectables.push(new CollectibleItem(z.x, z.y, playerFragments));
            }
            continue;
        }

        // --- LOGICA DI COMBATTIMENTO E COLLISIONE (Centralizzata nelle Classi) ---
        // La collisione Player vs Zombie e Zombie vs Player è ora gestita in player.update() e z.update()
        // per massimizzare le performance ed eliminare il lag del ciclo principale.
        
        // Combattimento: Zombie vs Alleati
        allies.forEach(a => {
            if (z.state === 'chasing' && a.hp > 0 && a.isHitTimer <= 0 && z.hp > 0 && z.isHit <= 0) {
                let dAx = Math.abs(a.x - z.x);
                let dAy = Math.abs(a.y - z.y);
                if (dAx < 40 && dAy < 50) {
                    playSound('player_hit', a.x, a.y);
                    a.hp -= 10;
                    a.isHitTimer = 0.8;
                    a.vy = -200;
                    a.vx = (a.x > z.x ? 100 : -100);
                    createDust(a.x + a.width / 2, a.y + a.height, 5);
                }
            }
        });

        }

    if (player.isHitTimer > 0) player.isHitTimer -= dt;

    // 3.4 AGGIORNAMENTO COLLEZIONABILI E UMANI
    for (let i = collectables.length - 1; i >= 0; i--) {
        collectables[i].update(dt, player);
        if (collectables[i].collected) collectables.splice(i, 1);
    }
    humans.forEach(h => h.update(dt, world));

    // --- AGGIORNAMENTO PROIETTILI (SHURIKEN) ---
    for (let i = projectiles.length - 1; i >= 0; i--) {
        let p = projectiles[i];
        p.update(dt, world, enemies);
        if (p.life <= 0) projectiles.splice(i, 1);
    }

    // Pulizia cadaveri
    // --- PULIZIA MEMORIA OTTIMIZZATA (Anti-Freeze) ---
    enemies = enemies.filter(z => {
        if (z.state === 'dead' && z.deathTimer <= 0) return false;
        if (z.y > 2500) return false; // Caduti nell'abisso (zombie normali)
        return true;
    });

    // 4. CAMERAMAN DIGITALE
    camera.x = player.x - width / 2;
    camera.y = player.y - height / 1.5;

    // 5. INTERAZIONE CON IL MONDO
    currentInteractable = null;
    world.interactables.forEach(b => {
        // Area di interazione generale (vicinanza alla porta/edificio)
        const isNear = player.x + player.width / 2 > b.doorX &&
                       player.x + player.width / 2 < b.doorX + b.doorWidth &&
                       player.y + player.height > b.y + b.height - 20;

        if (isNear) {
            currentInteractable = b;

            // --- LOGICA AUTOMATICA: BAULI LEGENDARI ---
            if (b.type === 'chest' && !b.looted) {
                const onChest = player.x + player.width > b.x && player.x < b.x + b.width;
                if (onChest) {
                    // Determina il buff in base all'eroe
                    let buffName = "";
                    let colors = [];
                    
                    if (playerStyle === 'CYBER') {
                        player.buffType = 'OVERCLOCK';
                        buffName = "MODULO OVERCLOCK! ⚡";
                        colors = ['#00FFFF', '#FFFFFF', '#0099FF'];
                    } else if (playerStyle === 'RONIN') {
                        player.buffType = 'LIFESTEAL';
                        buffName = "MASCHERA HANNYA! 👺";
                        colors = ['#FF0000', '#440000', '#FF4444'];
                    } else if (playerStyle === 'PALADIN') {
                        player.buffType = 'HALO';
                        buffName = "AUREOLA DEL TITANO! 👑";
                        colors = ['#FFD700', '#FFFACD', '#F0E68C'];
                    }
                    
                    player.buffTimer = 25; // Durata 25 secondi
                    showStyleTip(`LEGGENDARIO: ${buffName}`);
                    playSound('castle_loot', player.x, player.y);
                    
                    // Feedback visivo massiccio
                    createPixelDissolve(b.x, b.y, b.width, b.height, colors, 40);
                    screenShake = 20;

                    b.looted = true;
                }
            }

            // --- LOGICA MANUALE: CASE E CASTELLI ---
            if (keys['KeyE'] && !b.looted) {
                if (b.type === 'house') {
                    // --- COSTO RECUPERO SALUTE (Richiesta) ---
                    if (player.score >= 50) {
                        player.score -= 50;
                        timeOfDay = 5.0001;
                        currentDay++;
                        player.health = 100;
                        
                        // --- CURA ALLEATI (25% della vita massima) ---
                        allies.forEach(a => {
                            if (a.hp > 0 && !a.isSaluting) {
                                a.hp = Math.min(200, a.hp + 50);
                                createDust(a.x + a.width / 2, a.y + a.height / 2, 8);
                            }
                        });
                        
                        let hUI = document.getElementById('healthUI');
                        if (hUI) hUI.innerText = `Salute: ${player.health}`;
                        let sUI = document.getElementById('scoreUI');
                        if (sUI) sUI.innerText = `Punti: ${player.score}`;
                        
                        b.looted = true;
                        b.lootedDay = currentDay; // Registra il giorno dell'acquisto
                        playSound('wake'); 
                    } else {
                        playSound('error'); 
                    }
                } else if (b.type === 'castle') {
                    player.score += 100;
                    let sUI = document.getElementById('scoreUI');
                    if (sUI) sUI.innerText = `Punti: ${player.score}`;
                    playSound('castle_loot');
                    openShop();
                    b.looted = true;
                    b.lootedDay = currentDay; // Registra il giorno dell'acquisto
                }
                keys['KeyE'] = false;
            }
        }
    });

    if (player.health <= 0) {
        gameOver = true;
        if (musicManager) musicManager.stop();
        
        let gOver = document.getElementById('gameOver');
        if (gOver) {
            gOver.style.display = 'block';
            document.getElementById('finalScore').innerText = `Punteggio: ${player.score}`;
            document.getElementById('finalDays').innerText = `Sopravvivenza: ${currentDay} Giorni`;
            
            // Focus automatico sull'input del nome
            setTimeout(() => {
                document.getElementById('playerNameInput').focus();
            }, 100);
        }
    }
}

// ==========================================
// 6. ARCADE LEADERBOARD SYSTEM
// ==========================================

function getHighScores() {
    const scores = localStorage.getItem('stickman_highscores');
    return scores ? JSON.parse(scores) : [];
}

function saveHighScore(name, score, days) {
    let scores = getHighScores();
    scores.push({ name: name.toUpperCase(), score: score, days: days });
    // Ordina per punteggio (primario) e giorni (secondario)
    scores.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.days - a.days;
    });
    // Tieni solo la Top 10
    scores = scores.slice(0, 10);
    localStorage.setItem('stickman_highscores', JSON.stringify(scores));
    updateMiniLeaderboard(); // Aggiorna anche la mini classifica live
}

function updateMiniLeaderboard() {
    const miniList = document.getElementById('miniLeaderboardList');
    if (!miniList) return;

    const scores = getHighScores().slice(0, 3); // Solo la Top 3 per un riquadro mini extra-slim
    
    if (scores.length === 0) {
        miniList.innerHTML = "<div style='color: #666; text-align: center;'>- Vuoto -</div>";
        return;
    }

    miniList.innerHTML = scores.map((s, index) => `
        <div class="mini-lb-item">
            <span class="mini-name">${index + 1}. ${s.name}</span>
            <span class="mini-days">GIORNO ${s.days}</span>
            <span class="mini-score">${s.score}</span>
        </div>
    `).join('');
}




function showLeaderboard() {
    const nameEntry = document.getElementById('nameEntry');
    const lbContainer = document.getElementById('leaderboardContainer');
    if (nameEntry) nameEntry.style.display = 'none';
    if (lbContainer) lbContainer.style.display = 'block';
    
    const list = document.getElementById('leaderboardList');
    if (!list) return;

    const scores = getHighScores();
    
    if (scores.length === 0) {
        list.innerHTML = "<p style='color: #666;'>Nessun record ancora!</p>";
    } else {
        list.innerHTML = scores.map((s, index) => `
            <div class="leaderboard-item">
                <span class="leaderboard-name">${index + 1}. ${s.name}</span>
                <span class="leaderboard-days">${s.days} GG</span>
                <span class="leaderboard-score">${s.score} PTS</span>
            </div>
        `).join('');
    }
}

// Event Listeners per il sistema di salvataggio
document.addEventListener('DOMContentLoaded', () => {
    const saveBtn = document.getElementById('saveScoreBtn');
    const nameInput = document.getElementById('playerNameInput');
    const restartBtn = document.getElementById('restartBtn');

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const name = nameInput.value.trim() || "???";
            saveHighScore(name, player.score, currentDay);
            showLeaderboard();
        });
    }

    if (restartBtn) {
        restartBtn.addEventListener('click', () => {
            location.reload();
        });
    }

    if (nameInput) {
        // Forza maiuscole e limita a 3 caratteri (Stile vecchio arcade)
        nameInput.addEventListener('input', (e) => {
            let val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (val.length > 3) val = val.slice(0, 3);
            e.target.value = val;
        });

        // Permetti l'invio con il tasto ENTER
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveBtn.click();
        });
    }

    // Inizializza la mini classifica live al caricamento
    updateMiniLeaderboard();
});



function drawDarkness(ctx) {
    let darknessAlpha = 0;

    // Buio Superficie
    if ((timeOfDay > 19 || timeOfDay < 5) && player.y < 800) {
        darknessAlpha = 0.6;
    }

    // Buio Cave Professo
    if (player.y >= 800) {
        darknessAlpha = 0.85;
    }

    if (darknessAlpha > 0) {
        let playerScreenX = player.x - camera.x + player.width / 2;
        let playerScreenY = player.y - camera.y + player.height / 2;

        let grad = ctx.createRadialGradient(
            playerScreenX, playerScreenY, 40,
            playerScreenX, playerScreenY, 350
        );

        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.5, `rgba(0,0,0, ${darknessAlpha * 0.4})`);
        grad.addColorStop(1, `rgba(0,0,0, ${darknessAlpha})`);

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

function draw() {
    if (!world || !player) return;
    let windSpeed = 25;
    let cloudOffset = ((Date.now() / 1000) * windSpeed) % width;

    let dayAlpha = 1;
    if (timeOfDay >= 5 && timeOfDay <= 7) {
        dayAlpha = (timeOfDay - 5) / 2;
    } else if (timeOfDay > 17 && timeOfDay <= 19) {
        dayAlpha = 1 - ((timeOfDay - 17) / 2);
    } else if (timeOfDay > 19 || timeOfDay < 5) {
        dayAlpha = 0;
    }
    dayAlpha = Math.max(0, Math.min(1, dayAlpha));

    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, width, height);

    if (gfx.sky_night.complete && gfx.sky_night.naturalWidth > 0) {
        ctx.globalAlpha = 1 - dayAlpha;
        if (ctx.globalAlpha > 0) {
            ctx.drawImage(gfx.sky_night, -cloudOffset, 0, width, height);
            ctx.drawImage(gfx.sky_night, width - cloudOffset, 0, width, height);
        }
    }

    if (gfx.sky_day.complete && gfx.sky_day.naturalWidth > 0) {
        ctx.globalAlpha = dayAlpha;
        if (ctx.globalAlpha > 0) {
            ctx.drawImage(gfx.sky_day, -cloudOffset, 0, width, height);
            ctx.drawImage(gfx.sky_day, width - cloudOffset, 0, width, height);
        }
    }

    ctx.globalAlpha = 1.0;

    // Composizione Ordine Elementi
    world.drawParallax(ctx, camera);
    world.drawForeground(ctx, camera);

    // 3.2 DISEGNO PARTICELLE
    particles.forEach(p => {
        let sx = p.x - camera.x;
        let sy = p.y - camera.y;
        if (sx > 0 && sx < canvas.width) {
            ctx.globalAlpha = p.life / 1.2;
            ctx.fillStyle = p.color;
            ctx.fillRect(sx, sy, p.size, p.size);
        }
    });
    ctx.globalAlpha = 1.0;

    allies.forEach(a => {
        if (inView(a.x, a.y, a.width, a.height)) a.draw(ctx, camera);
    });
    
    enemies.forEach(z => {
        if (inView(z.x, z.y, z.width, z.height)) z.draw(ctx, camera);
    });

    projectiles.forEach(p => {
        if (inView(p.x, p.y, 20, 20)) p.draw(ctx, camera);
    });

    collectables.forEach(c => {
        if (inView(c.x, c.y, 30, 30)) c.draw(ctx, camera);
    });

    humans.forEach(h => {
        if (inView(h.x, h.y, h.width, h.height)) h.draw(ctx, camera);
    });

    // Lampeggio visura Sofferenza (Quando lo Zombie morde l'oscurità sanguina!)
    if (player.isHitTimer && player.isHitTimer > 0) {
        ctx.globalAlpha = 0.5 + Math.abs(Math.sin(Date.now() / 60)) * 0.5;
    }
    player.draw(ctx, camera);
    ctx.globalAlpha = 1.0; // Sicurezza rientro

    drawDarkness(ctx);

    // Sistema HUD Overlay (Prompt Porta Casa/Castello)
    if (currentInteractable) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';

        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;

        if (!currentInteractable.looted) {
            let text = currentInteractable.type === 'house' ? "Premi E per Riposare in Taverna (50pt)" : "Premi E per Ispezionare il Tesoro Antico";
            ctx.fillText(text, player.x - camera.x + player.width / 2, player.y - camera.y - 50);
        } else if (currentInteractable.type === 'castle' || currentInteractable.type === 'house') {
            // Messaggio di Cooldown
            let remaining = (currentInteractable.lootedDay + 10) - currentDay;
            if (remaining > 0) {
                let text = `Struttura Vuota - Torna tra ${remaining} giorni`;
                ctx.fillStyle = '#FF4444';
                ctx.fillText(text, player.x - camera.x + player.width / 2, player.y - camera.y - 50);
            }
        }

        ctx.shadowColor = "transparent";
        ctx.textAlign = 'left';
    }

    // DISEGNO BOSS UI
    if (activeBoss) {
        drawBossUI(ctx, activeBoss);
    }
}

// IL GRANDE PULSANTE START (Loop a 60 FPS o Refresh Sync)
function gameLoop(timestamp) {
    if (gameOver) return;

    if (!lastTime) lastTime = timestamp;
    let dt = (timestamp - lastTime) / 1000;
    
    // --- SCUDO ANTI-FREEZE: PROTEZIONE NAN & CLAMP ---
    if (isNaN(dt) || dt < 0) dt = 0.016; 
    if (dt > 0.1) dt = 0.1; // Cap a 10 FPS per evitare teletrasporti fisici dopo lag
    
    lastTime = timestamp;

    update(dt);
    draw();

    requestAnimationFrame(gameLoop);
}
