import * as THREE from 'three';
import { levels } from './levels.js';

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
        this.shipPosition = new THREE.Vector3(0, 0.2, 0); // Start at track height
        this.shipRotation = 0;
        this.shipVelocity = new THREE.Vector3(0, 0, 0);
        this.isJumping = false;
        this.jumpVelocity = 0;
        this.gameSpeed = 0.4;
        this.forwardSpeed = 0.2; // Speed at which the ship moves forward
        this.trackWidth = 3; // Match the track width
        this.gameOver = false;
        this.currentLevel = 0;
        this.segmentHeight = 0.2; // Normal track height
        this.raisedHeight = 1.0; // Height for raised blocks
        this.tunnelHeight = 0.1; // Height for tunnels

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

        // Generate track from level data
        this.generateTrackFromLevel();

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

    generateTrackFromLevel() {
        const level = levels[this.currentLevel];
        const lines = level.data.split('\n');
        const trackWidth = 3; // Width of each track segment (was 1)
        const trackLength = 3; // Length of each track segment (was 1)
        let currentZ = 0;

        // Find start position
        let startLine = lines.findIndex(line => line.includes('<start>'));
        if (startLine === -1) startLine = lines.length - 1;

        // Process each line from bottom to top
        for (let y = startLine - 1; y >= 0; y--) {
            const line = lines[y].trim();
            if (line === '<end>' || line === '<start>') continue;

            // Process each character in the line
            for (let x = 0; x < line.length; x++) {
                const char = line[x];
                if (char === '.') continue; // Skip empty space

                let height = this.segmentHeight;
                let color = level.colors[char] || 0x808080;

                // Determine track type and height
                if (char === '7' || char === '8') {
                    height = this.raisedHeight;
                } else if (char === '5' || char === '6') {
                    height = this.tunnelHeight;
                }

                // Create track segment
                const geometry = new THREE.BoxGeometry(trackWidth, height, trackLength);
                const material = new THREE.MeshPhongMaterial({ color: color });
                const segment = new THREE.Mesh(geometry, material);
                
                // Position the segment
                segment.position.set(
                    (x - line.length / 2) * trackWidth,
                    height / 2,
                    -currentZ
                );

                this.scene.add(segment);
                this.track.push({
                    mesh: segment,
                    type: char,
                    position: segment.position.clone()
                });
            }
            currentZ += trackLength;
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
        if (Math.abs(this.shipPosition.x) > this.trackWidth * 1.5) { // Adjusted for wider track
            this.gameOver = true;
            return;
        }

        // Check if ship is too low (fell into gap)
        if (this.shipPosition.y < this.segmentHeight) {
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

            if (this.shipPosition.y <= this.segmentHeight) {
                this.shipPosition.y = this.segmentHeight;
                this.isJumping = false;
                this.jumpVelocity = 0;
            }
        } else {
            // Keep ship on track when not jumping
            this.shipPosition.y = this.segmentHeight;
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