class Enemy {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 40;
        this.height = 80;
        
        this.vx = 0;
        this.vy = 0;
        this.speed = 40 + Math.random() * 30; // Velocità zombie MOLTO lenta (ridotta di molto)
        this.gravity = 1500;
        this.jumpPower = -650; // Aggiunto per permettere salti agli zombie
        this.jumpTimer = 0;    // Cooldown per i salti (non spammare)
        
        this.isGrounded = false;
        this.isDead = false;
        
        this.damageCooldown = 0;
    }

    update(dt, world, player) {
        if (this.isDead) return;

        // Insegue il giocatore se abbastanza vicino, altrimenti ozia
        let dist = player.x - this.x;
        
        if (Math.abs(dist) < 800) {
            if (dist > 0) this.vx = this.speed;
            else this.vx = -this.speed;
        } else {
            this.vx = 0;
        }

        // Gravità
        this.vy += this.gravity * dt;

        // Movimento asse X e Y
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Collisione mondo
        this.isGrounded = false;
        world.platforms.forEach(p => {
            if (this.x < p.x + p.width &&
                this.x + this.width > p.x &&
                this.y + this.height > p.y &&
                this.y + this.height < p.y + this.vy * dt + 10) { 
                
                this.isGrounded = true;
                this.vy = 0;
                this.y = p.y - this.height;
            }
        });

        if (this.jumpTimer > 0) this.jumpTimer -= dt;
        
        // IA Salto: Se vede il player sopra di sé, salta per inseguirlo sulle piattaforme
        if (this.isGrounded && this.jumpTimer <= 0) {
            if (player.y < this.y - 40 && Math.abs(player.x - this.x) < 300) {
                this.vy = this.jumpPower;
                this.jumpTimer = 0.5; // Breve pausa per non spammare il salto in loop visivo
                this.isGrounded = false;
            }
        }

        // Infligge danno al giocatore per contatto
        if (this.damageCooldown > 0) {
            this.damageCooldown -= dt;
        }

        if (this.damageCooldown <= 0 && 
            Math.abs(this.x - player.x) < 40 &&
            Math.abs(this.y - player.y) < 80) {
            
            player.health -= 20;
            this.damageCooldown = 1.0; // Colpisce ogni 1 secondo
        }
    }

    draw(ctx, camera) {
        if (this.isDead) return;
        
        let screenX = this.x - camera.x;
        let screenY = this.y - camera.y;

        // Corpo Zombi
        ctx.fillStyle = '#004d00'; // Verde Scuro Palude
        ctx.fillRect(screenX, screenY, this.width, this.height);

        // Testa Zombi
        ctx.fillStyle = '#006400';
        ctx.fillRect(screenX + 5, screenY - 20, 30, 30);
    }
}
