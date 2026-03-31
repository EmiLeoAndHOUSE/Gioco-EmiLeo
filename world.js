class World {
    constructor() {
        this.platforms = [];
        this.backgrounds = []; // Per gli alberi, case e castelli
        this.generateWorld();
    }

    generateWorld() {
        let currentX = 0;
        const groundLevel = 600;

        // Generazione del background (Parallax layer)
        let bgX = -1000;
        const MAP_SIZE = 100000;
        while (bgX < MAP_SIZE) {
            let choice = Math.random();
            let type = 'tree';
            let width = 100;
            let offsetHeight = 0;

            if (choice > 0.8) {
                type = 'castle';
                width = 300;
            } else if (choice > 0.5) {
                type = 'house';
                width = 150;
            }

            this.backgrounds.push({
                x: bgX,
                y: groundLevel, 
                type: type,
                width: width
            });

            bgX += width + Math.random() * 400 + 100;
        }

        // Generazione del foreground (Piattaforme di gioco)
        while (currentX < MAP_SIZE) {
            // Pianura normale
            let length = 500 + Math.random() * 800;
            this.platforms.push({ x: currentX, y: groundLevel, width: length, height: 800 });
            currentX += length;

            // Possibilità di una grotta (Buco nel terreno)
            if (currentX < MAP_SIZE - 1000 && Math.random() > 0.3) {
                let caveWidth = 300 + Math.random() * 400;
                
                // Piattaforme per scendere nella grotta
                let caveDepth = groundLevel + 200;
                this.platforms.push({ x: currentX + 50, y: caveDepth, width: 100, height: 20 });
                this.platforms.push({ x: currentX + caveWidth - 150, y: caveDepth + 150, width: 100, height: 20 });
                
                // Fondo della grotta
                this.platforms.push({ x: currentX, y: caveDepth + 300, width: caveWidth, height: 500, isCave: true });
                
                currentX += caveWidth;
            }
        }
    }

    drawParallax(ctx, camera) {
        // Disegna lo sfondo (che si muove più lentamente)
        let parallaxFactor = 0.5; // Si muove a metà velocità

        this.backgrounds.forEach(bg => {
            let screenX = bg.x - (camera.x * parallaxFactor); // Calcolo parallasse
            let screenY = bg.y - camera.y;

            // Evitiamo di disegnare robe fuori schermo per performance
            if (screenX + bg.width > 0 && screenX < canvas.width) {
                if (bg.type === 'tree') {
                    // Tronco
                    ctx.fillStyle = '#5c4033';
                    ctx.fillRect(screenX + bg.width/2 - 10, screenY - 100, 20, 100);
                    // Chioma verde
                    ctx.fillStyle = '#228B22';
                    ctx.beginPath();
                    ctx.arc(screenX + bg.width/2, screenY - 120, 60, 0, Math.PI * 2);
                    ctx.fill();
                } else if (bg.type === 'house') {
                    // Stanza 
                    ctx.fillStyle = '#8B4513';
                    ctx.fillRect(screenX, screenY - 120, bg.width, 120);
                    // Tetto
                    ctx.fillStyle = '#A52A2A';
                    ctx.beginPath();
                    ctx.moveTo(screenX - 20, screenY - 120);
                    ctx.lineTo(screenX + bg.width/2, screenY - 200);
                    ctx.lineTo(screenX + bg.width + 20, screenY - 120);
                    ctx.fill();
                    // Finestra
                    ctx.fillStyle = '#FFD700'; // Luce interna
                    ctx.fillRect(screenX + 40, screenY - 80, 30, 30);
                } else if (bg.type === 'castle') {
                    // Mura castello
                    ctx.fillStyle = '#555';
                    ctx.fillRect(screenX, screenY - 250, bg.width, 250);
                    // Merli superiori
                    ctx.fillStyle = '#444';
                    for(let i=0; i<5; i++){
                        ctx.fillRect(screenX + (i * 60) + 10, screenY - 280, 40, 30);
                    }
                    // Portone
                    ctx.fillStyle = '#222';
                    ctx.beginPath();
                    ctx.arc(screenX + bg.width/2, screenY, 40, Math.PI, 0);
                    ctx.fill();
                    ctx.fillRect(screenX + bg.width/2 - 40, screenY, 80, 50); // bugfix per portone
                }
            }
        });
    }

    drawForeground(ctx, camera) {
        ctx.fillStyle = '#3a5f2e'; // Colore erba / terra
        this.platforms.forEach(plat => {
            let screenX = plat.x - camera.x;
            let screenY = plat.y - camera.y;
            
            // Disegniamo solo se nello schermo
            if (screenX + plat.width > 0 && screenX < canvas.width) {
                if (plat.isCave) {
                    ctx.fillStyle = '#444'; // Roccia per caverna profonda
                } else {
                    ctx.fillStyle = '#4a7023'; // Superfice erbosa
                }
                ctx.fillRect(screenX, screenY, plat.width, plat.height);
            }
        });
    }
}
