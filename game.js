import * as THREE from 'three';
import { levels } from './levels.js?v=1';

class Game {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.getElementById('game-container').appendChild(this.renderer.domElement);

        // Create scenes for background and overlay
        this.bgScene = new THREE.Scene();
        this.overlayScene = new THREE.Scene();
        
        // Create cameras for background and overlay
        this.bgCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
        this.overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);

        // Load textures
        this.textureLoader = new THREE.TextureLoader();
        this.dashTexture = this.textureLoader.load('./assets/dash.png', () => this.createDashOverlay());
        this.bgTexture = this.textureLoader.load('./assets/bg_1.webp');

        // Game state
        this.ship = null;
        this.track = [];
        this.shipPosition = new THREE.Vector3(0, 0.2, 0); // Will be updated after track generation
        this.shipRotation = 0;
        this.shipVelocity = new THREE.Vector3(0, 0, 0);
        this.isJumping = false;
        this.jumpVelocity = 0;
        this.gameSpeed = 0.4;
        this.forwardSpeed = 0.2; // Speed at which the ship moves forward
        this.trackWidth = 7; // Updated to match actual track width
        this.gameOver = false;
        this.currentLevel = 0;
        this.segmentHeight = 0.2; // Normal track height
        this.raisedHeight = 1.0; // Height for raised blocks
        this.tunnelHeight = 0.1; // Height for tunnels
        this.dashOverlay = null;

        // Camera offset from ship (adjusted for better view)
        this.cameraOffset = new THREE.Vector3(0, 8, 15); // Increased height and distance

        this.init();
        this.setupControls();
        this.animate();
    }

    init() {
        // Set renderer clear color to black
        this.renderer.setClearColor(0x000000, 1);

        // Add ambient light (only for main game scene)
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        // Add directional light (only for main game scene)
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(0, 10, 0);
        this.scene.add(directionalLight);

        // Create background first
        this.createBackground();

        // Create ship
        this.createShip();

        // Generate track from level data
        this.generateTrackFromLevel();

        // Set initial ship position
        this.shipPosition.set(0, this.segmentHeight, 0);
        this.ship.position.copy(this.shipPosition);

        // Set initial camera position
        this.updateCamera();

        // Handle window resizing
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }
    createBackground() {
        // 1) Create an orthographic camera that spans -1..+1 in both axes
        //    This gives a 2×2 "screen" in camera space.
        this.bgCamera = new THREE.OrthographicCamera(
            -1,  // left
             1,  // right
             1,  // top
            -1,  // bottom
             0,  // near
             1   // far
        );
        this.bgScene = new THREE.Scene();
    
        // 2) Create a plane that is 2×2 in size, matching the camera's -1..+1 range
        const planeGeometry = new THREE.PlaneGeometry(2, 2);
    
        // Make sure depthTest/write are disabled so it stays behind everything
        const material = new THREE.MeshBasicMaterial({
            map: this.bgTexture,
            depthTest: false,
            depthWrite: false
        });
    
        const background = new THREE.Mesh(planeGeometry, material);
        this.bgScene.add(background);
    
        // 3) Whenever the texture or window size changes, recalc plane scale
        const updateBackgroundCover = () => {
            if (!this.bgTexture.image) return;
    
            // imageAspect = width / height
            const imageAspect = this.bgTexture.image.width / this.bgTexture.image.height;
            // screenAspect = window width / window height
            const screenAspect = window.innerWidth / window.innerHeight;
    
            // We will keep the plane's base size = 2×2, but scale it
            // so that in *camera space* it has the correct aspect ratio
            // and *covers* the entire -1..+1 range on both axes.
    
            // "Cover" logic:
            // - If image is 'wider' than the screen (imageAspect > screenAspect),
            //   fill the vertical dimension fully (height=2 in camera space),
            //   and let the width overflow (width=2*imageAspect).
            // - Else fill the horizontal dimension (width=2 in camera space),
            //   and let the height overflow (height=2*(1/imageAspect)).
    
            if (imageAspect > screenAspect) {
                // The limiting dimension is height => set plane height = 2
                // so plane extends from -1..+1 in Y
                // Then plane width = 2 * (imageAspect) => ratio = imageAspect
                background.scale.set(imageAspect, 1, 1);
            } else {
                // The limiting dimension is width => set plane width = 2
                // so plane extends from -1..+1 in X
                // Then plane height = 2 * (1/imageAspect) => ratio = imageAspect
                background.scale.set(1, 1 / imageAspect, 1);
            }
    
            // If you have changed your bgCamera in some other way, update it:
            this.bgCamera.updateProjectionMatrix();
        };
    
        // Update once texture is loaded
        if (this.bgTexture.image) {
            updateBackgroundCover();
        } else {
            // Some loaders let you listen for "load" or "update" events
            this.bgTexture.addEventListener('load', updateBackgroundCover);
        }
    
        // Update on window resize
        window.addEventListener('resize', updateBackgroundCover);
    }
    

    createDashOverlay() {
        const maxHeight = 0.25; // 1/4 of screen height
        const imageAspect = this.dashTexture.image.width / this.dashTexture.image.height;
        const screenAspect = window.innerWidth / window.innerHeight;
        
        // Always make width match screen width exactly
        const dashWidth = 2 * screenAspect; // Full screen width
        // Calculate height to maintain aspect ratio
        const dashHeight = dashWidth / imageAspect;
        
        const planeGeometry = new THREE.PlaneGeometry(dashWidth, dashHeight);
        const planeMaterial = new THREE.MeshBasicMaterial({
            map: this.dashTexture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            color: 0xffffff
        });
        this.dashOverlay = new THREE.Mesh(planeGeometry, planeMaterial);
        
        // Position at bottom of screen, allowing it to extend below if needed
        this.dashOverlay.position.y = -1 + Math.min(dashHeight/2, maxHeight);
        
        // Make camera match screen exactly
        this.overlayCamera.left = -screenAspect;
        this.overlayCamera.right = screenAspect;
        this.overlayCamera.updateProjectionMatrix();
        
        this.overlayScene.add(this.dashOverlay);

        // Update dash on window resize
        window.addEventListener('resize', () => {
            if (!this.dashOverlay) return;
            
            const newScreenAspect = window.innerWidth / window.innerHeight;
            
            // Always match screen width
            const newWidth = 2 * newScreenAspect;
            // Calculate height to maintain aspect ratio
            const newHeight = newWidth / imageAspect;
            
            // Update geometry
            this.dashOverlay.geometry.dispose();
            this.dashOverlay.geometry = new THREE.PlaneGeometry(newWidth, newHeight);
            
            // Update position, allowing extension below screen
            this.dashOverlay.position.y = -1 + Math.min(newHeight/2, maxHeight);
            
            // Update camera to match screen exactly
            this.overlayCamera.left = -newScreenAspect;
            this.overlayCamera.right = newScreenAspect;
            this.overlayCamera.updateProjectionMatrix();
        });
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
        const trackWidth = 3.5; // Width of each track segment (half of 7)
        const trackLength = 4.5; // Length of each track segment (increased from 3)
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
                
                // Position the segment - center it on the 7-unit wide track
                // x=3 should be at position 0 (middle of track)
                const xPos = (x - 3) * trackWidth;
                segment.position.set(
                    xPos,
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
            currentZ += trackLength; // Using new track length for Z positioning
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
        if (Math.abs(this.shipPosition.x) > this.trackWidth * 1.5) {
            this.gameOver = true;
            return;
        }

        // Check if ship has fallen too low
        if (this.shipPosition.y < -5) { // Allow falling below track but not too far
            this.gameOver = true;
            return;
        }

        // Check if ship is on a track segment
        if (!this.isJumping) {
            let isOnTrack = false;
            for (const segment of this.track) {
                // Check if ship is within the bounds of a track segment
                const dx = Math.abs(this.shipPosition.x - segment.position.x);
                const dz = Math.abs(this.shipPosition.z - segment.position.z);
                
                // Track width is 3.5, length is 4.5
                if (dx < 1.75 && dz < 2.25) { // Half of width and length
                    isOnTrack = true;
                    break;
                }
            }
            if (!isOnTrack) {
                // If not on track and not jumping, start falling
                this.isJumping = true;
                this.jumpVelocity = -0.1; // Start falling
            }
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
            if (confirm('Game Over! Click OK to restart or Cancel to quit.')) {
                this.restartGame();
            }
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

            // Only reset jumping if we hit a track segment
            let hitTrack = false;
            for (const segment of this.track) {
                // Check if ship is within the bounds of a track segment
                const dx = Math.abs(this.shipPosition.x - segment.position.x);
                const dz = Math.abs(this.shipPosition.z - segment.position.z);
                
                // Track width is 3.5, length is 4.5
                if (dx < 1.75 && dz < 2.25 && this.shipPosition.y <= segment.position.y + 0.2) {
                    this.shipPosition.y = segment.position.y + 0.2;
                    this.isJumping = false;
                    this.jumpVelocity = 0;
                    hitTrack = true;
                    break;
                }
            }

            // If we didn't hit a track and we're falling, keep falling
            if (!hitTrack && this.jumpVelocity < 0) {
                this.jumpVelocity -= 0.01; // Continue falling
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

    restartGame() {
        // Reset game state
        this.gameOver = false;
        this.shipRotation = 0;
        this.shipVelocity = new THREE.Vector3(0, 0, 0);
        this.isJumping = false;
        this.jumpVelocity = 0;

        // Clear existing track
        for (const segment of this.track) {
            this.scene.remove(segment.mesh);
        }
        this.track = [];

        // Generate new track
        this.generateTrackFromLevel();

        // Reset ship position
        this.shipPosition.set(0, this.segmentHeight, 0);
        this.ship.position.copy(this.shipPosition);

        // Reset camera
        this.updateCamera();
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.updateShip();
        
        // Clear with black
        this.renderer.setClearColor(0x000000, 1);
        this.renderer.clear();
        
        // Render background
        this.renderer.render(this.bgScene, this.bgCamera);
        
        // Render main scene
        this.renderer.autoClear = false;
        this.renderer.render(this.scene, this.camera);
        
        // Render overlay if it exists
        if (this.dashOverlay) {
            this.renderer.render(this.overlayScene, this.overlayCamera);
        }
        this.renderer.autoClear = true;
    }
}

// Start the game
new Game(); 