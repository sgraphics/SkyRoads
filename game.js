import * as THREE from 'three';

class Game {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.getElementById('game-container').appendChild(this.renderer.domElement);

        // Game state
        this.ship = null;
        this.track = [];
        this.shipPosition = new THREE.Vector3(0, 0, 0);
        this.shipRotation = 0;
        this.shipVelocity = new THREE.Vector3(0, 0, 0);
        this.isJumping = false;
        this.jumpVelocity = 0;
        this.gameSpeed = 0.1;
        this.forwardSpeed = 0.2; // Speed at which the ship moves forward
        this.trackWidth = 2;
        this.trackLength = 100;
        this.gameOver = false;

        // Camera offset from ship (adjusted for better view)
        this.cameraOffset = new THREE.Vector3(0, 8, 15); // Increased height and distance

        this.init();
        this.setupControls();
        this.animate();
    }

    init() {
        // Add ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        // Add directional light
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(0, 10, 0);
        this.scene.add(directionalLight);

        // Create ship
        this.createShip();

        // Generate track
        this.generateTrack();

        // Set initial camera position
        this.updateCamera();
    }

    createShip() {
        const geometry = new THREE.ConeGeometry(0.5, 2, 8);
        const material = new THREE.MeshPhongMaterial({ color: 0x00ff00 });
        this.ship = new THREE.Mesh(geometry, material);
        this.ship.rotation.x = Math.PI / 2;
        this.scene.add(this.ship);
    }

    generateTrack() {
        let currentZ = 0;
        let gapProbability = 0.1; // 10% chance of a gap

        for (let i = 0; i < this.trackLength; i++) {
            // Skip creating track segment if it's a gap
            if (Math.random() < gapProbability) {
                currentZ += 1;
                continue;
            }

            const geometry = new THREE.BoxGeometry(this.trackWidth, 0.2, 1);
            const material = new THREE.MeshPhongMaterial({ color: 0x808080 });
            const segment = new THREE.Mesh(geometry, material);
            segment.position.z = -currentZ;
            this.scene.add(segment);
            this.track.push(segment);

            currentZ += 1;
        }
    }

    setupControls() {
        document.addEventListener('keydown', (event) => {
            if (this.gameOver) return;
            
            switch (event.key) {
                case 'ArrowLeft':
                    this.shipRotation = Math.max(this.shipRotation - 0.1, -0.5);
                    break;
                case 'ArrowRight':
                    this.shipRotation = Math.min(this.shipRotation + 0.1, 0.5);
                    break;
                case ' ':
                    if (!this.isJumping) {
                        this.isJumping = true;
                        this.jumpVelocity = 0.3;
                    }
                    break;
            }
        });

        document.addEventListener('keyup', (event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                this.shipRotation = 0;
            }
        });
    }

    checkCollisions() {
        // Check if ship is too far left or right
        if (Math.abs(this.shipPosition.x) > this.trackWidth / 2) {
            this.gameOver = true;
            return;
        }

        // Check if ship is too low (fell into gap)
        if (this.shipPosition.y < 0) {
            this.gameOver = true;
            return;
        }
    }

    updateCamera() {
        // Update camera position to follow ship horizontally and forward, but maintain fixed height
        this.camera.position.x = this.shipPosition.x + this.cameraOffset.x;
        this.camera.position.y = this.cameraOffset.y; // Fixed height
        this.camera.position.z = this.shipPosition.z + this.cameraOffset.z;
        
        // Set fixed camera rotation to look down at the track (less steep angle)
        this.camera.rotation.x = -Math.PI / 6; // 30-degree downward angle (was 45)
        this.camera.rotation.y = 0;
        this.camera.rotation.z = 0;
    }

    updateShip() {
        if (this.gameOver) {
            alert('Game Over! Refresh to play again.');
            return;
        }

        // Update ship position based on rotation and velocity
        this.shipVelocity.x = this.shipRotation * this.gameSpeed;
        this.shipPosition.x += this.shipVelocity.x;

        // Move ship forward
        this.shipPosition.z -= this.forwardSpeed;

        // Apply jumping physics
        if (this.isJumping) {
            this.shipPosition.y += this.jumpVelocity;
            this.jumpVelocity -= 0.01; // Gravity

            if (this.shipPosition.y <= 0) {
                this.shipPosition.y = 0;
                this.isJumping = false;
                this.jumpVelocity = 0;
            }
        }

        // Update ship position
        this.ship.position.copy(this.shipPosition);

        // Update camera to follow ship
        this.updateCamera();

        // Check for collisions
        this.checkCollisions();
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.updateShip();
        this.renderer.render(this.scene, this.camera);
    }
}

// Start the game
new Game(); 