import * as THREE from 'three';

class Game {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: true 
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.getElementById('game-container').appendChild(this.renderer.domElement);

        // Create scenes for background and overlay
        this.bgScene = new THREE.Scene();
        this.overlayScene = new THREE.Scene();
        
        // Create cameras for background and overlay
        this.bgCamera = new THREE.OrthographicCamera();
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
        this.currentLevel = 1;
        this.segmentHeight = 0.2; // Normal track height
        this.raisedHeight = 1.0; // Height for raised blocks
        this.tunnelHeight = 0.1; // Height for tunnels
        this.dashOverlay = null;
        this.leftKeyPressed = false;  // Track left key state
        this.rightKeyPressed = false; // Track right key state

        // Camera offset from ship (adjusted for better view)
        this.cameraOffset = new THREE.Vector3(0, 8, 15); // Increased height and distance

        this.currentLevel = 1;
        this.levelData = null;

        // Add this line to create the track geometry
        this.trackGeometry = new THREE.BoxGeometry(1, 1, 1);

        // Add shadow properties
        this.shadowMesh = null;
        this.createShadow();

        // Move ship creation and positioning after level load
        this.init();
        this.setupControls();
        this.loadLevel(); // This will now handle ship positioning
        this.animate();
    }

    async loadLevel() {
        try {
            const response = await fetch(`assets/${this.currentLevel}.txt`);
            this.levelData = await response.text();
            this.generateTrackFromLevel();
            
            // Position ship at start of track after generation
            this.shipPosition.set(0, this.segmentHeight, 0);
            this.ship.position.copy(this.shipPosition);
            this.updateCamera();
            
        } catch (error) {
            console.error('Error loading level:', error);
        }
    }

    init() {
        // Set renderer clear color to black
        this.renderer.setClearColor(0x000000, 1);

        // Add ambient light (only for main game scene)
        const ambient = new THREE.AmbientLight(0xffffff, 0.1);
        this.scene.add(ambient);

        // Add directional light (only for main game scene)
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(0, 10, 0);
        this.scene.add(directionalLight);

        // Create background first
        this.createBackground();

        // Create ship (but don't position it yet)
        this.createShip();

        // Remove ship positioning from here since track isn't loaded yet
        // The loadLevel() method will handle this after track generation

        // Handle window resizing
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // Adjust renderer output for sRGB
        this.renderer.outputEncoding = THREE.sRGBEncoding;

        // If you prefer manually controlling gamma
        this.renderer.gammaFactor = 2.2;
        this.renderer.gammaOutput = true; // Deprecated in newer Three.js, use outputEncoding

        // Disable tone mapping
        this.renderer.toneMapping = THREE.NoToneMapping;
        this.renderer.toneMappingExposure = 1; // or adjust as you like
    }
    createBackground() {
        // Create scene and camera
        this.bgScene = new THREE.Scene();
        this.bgCamera = new THREE.OrthographicCamera();

        // Create base 1x1 plane - we'll scale it to cover the view
        const planeGeometry = new THREE.PlaneGeometry(1, 1);
        const planeMaterial = new THREE.MeshBasicMaterial({
            map: this.bgTexture,
            depthTest: false,
            depthWrite: false
        });
        planeMaterial.map.encoding = THREE.sRGBEncoding;
        const backgroundMesh = new THREE.Mesh(planeGeometry, planeMaterial);
        this.bgScene.add(backgroundMesh);

        // Function to update orthographic camera to match window aspect
        const updateOrthoCamera = () => {
            const aspect = window.innerWidth / window.innerHeight;
            
            // Use height of 2 in camera space, width will be 2 * aspect
            const frustumHeight = 2;
            const frustumWidth = frustumHeight * aspect;

            this.bgCamera.left = frustumWidth / -2;
            this.bgCamera.right = frustumWidth / 2;
            this.bgCamera.top = frustumHeight / 2;
            this.bgCamera.bottom = frustumHeight / -2;
            this.bgCamera.near = 0;
            this.bgCamera.far = 1;
            this.bgCamera.updateProjectionMatrix();
        };

        // Function to update background scaling to achieve 'cover' behavior
        const updateBackgroundCover = () => {
            if (!this.bgTexture.image) return;

            // Get current camera dimensions
            const camWidth = this.bgCamera.right - this.bgCamera.left;
            const camHeight = this.bgCamera.top - this.bgCamera.bottom;
            const cameraAspect = camWidth / camHeight;

            // Get image aspect ratio
            const imageAspect = this.bgTexture.image.width / this.bgTexture.image.height;

            let planeWidth, planeHeight;

            if (imageAspect > cameraAspect) {
                // Image is wider than camera - fill vertically
                planeHeight = camHeight;
                planeWidth = planeHeight * imageAspect;
            } else {
                // Image is taller than camera - fill horizontally
                planeWidth = camWidth;
                planeHeight = planeWidth / imageAspect;
            }

            // Scale our 1x1 plane to the required dimensions
            backgroundMesh.scale.set(planeWidth, planeHeight, 1);
        };

        // Initial camera setup
        updateOrthoCamera();
        
        // Update when texture loads
        if (this.bgTexture.image) {
            updateBackgroundCover();
        } else {
            this.bgTexture.addEventListener('load', () => {
                updateOrthoCamera(); // Ensure camera is set up
                updateBackgroundCover(); // Then update background scaling
            });
        }

        // Force an immediate update after a short delay to ensure texture is loaded
        setTimeout(() => {
            updateOrthoCamera();
            updateBackgroundCover();
        }, 100);

        // Update on window resize
        window.addEventListener('resize', () => {
            updateOrthoCamera();
            updateBackgroundCover();
        });
    }
    

    createDashOverlay() {
        const maxHeight = 0.25; // 1/4 of screen height
        const imageAspect = this.dashTexture.image.width / this.dashTexture.image.height;
        const screenAspect = window.innerWidth / window.innerHeight;
        
        // Calculate max width in normalized coordinates
        const maxPixelWidth = 1300;
        const maxNormalizedWidth = (maxPixelWidth / window.innerWidth) * (2 * screenAspect);
        
        // Use the smaller of screen width or max width
        const dashWidth = Math.min(2 * screenAspect, maxNormalizedWidth);
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
        planeMaterial.map.encoding = THREE.sRGBEncoding;
        this.dashOverlay = new THREE.Mesh(planeGeometry, planeMaterial);
        
        // Position at bottom of screen, allowing it to extend below if needed
        this.dashOverlay.position.y = -1 + Math.min(dashHeight/2, maxHeight);
        
        // Center horizontally if narrower than screen
        if (dashWidth < 2 * screenAspect) {
            this.dashOverlay.position.x = 0;
        }
        
        // Make camera match screen exactly
        this.overlayCamera.left = -screenAspect;
        this.overlayCamera.right = screenAspect;
        this.overlayCamera.updateProjectionMatrix();
        
        this.overlayScene.add(this.dashOverlay);

        // Update dash on window resize
        window.addEventListener('resize', () => {
            if (!this.dashOverlay) return;
            
            const newScreenAspect = window.innerWidth / window.innerHeight;
            const newMaxNormalizedWidth = (maxPixelWidth / window.innerWidth) * (2 * newScreenAspect);
            
            // Use the smaller of screen width or max width
            const newWidth = Math.min(2 * newScreenAspect, newMaxNormalizedWidth);
            // Calculate height to maintain aspect ratio
            const newHeight = newWidth / imageAspect;
            
            // Update geometry
            this.dashOverlay.geometry.dispose();
            this.dashOverlay.geometry = new THREE.PlaneGeometry(newWidth, newHeight);
            
            // Update position, allowing extension below screen
            this.dashOverlay.position.y = -1 + Math.min(newHeight/2, maxHeight);
            
            // Center horizontally if narrower than screen
            if (newWidth < 2 * newScreenAspect) {
                this.dashOverlay.position.x = 0;
            }
            
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
        if (!this.levelData) return;
        
        // Split into rows and filter out any lines containing < > tags
        const rows = this.levelData.trim()
            .split('\n')
            .filter(row => !row.includes('<'))
            .reverse();
        
        const trackWidth = 7;
        
        rows.forEach((row, index) => {
            // Ensure row is exactly 7 characters, padding with spaces if shorter
            const paddedRow = row.padEnd(trackWidth, ' ');
            // Take only first 7 characters in case it's longer
            const blocks = paddedRow.slice(0, trackWidth).split('');
            
            blocks.forEach((block, columnIndex) => {
                // Skip if it's a space, dot, or any other non-track character
                if (block === ' ' || block === '.' || !/[0-9]/.test(block)) return;
                
                const x = columnIndex - 3;
                const z = -index * 4.5;
                
                if (block === '5' || block === '6') {
                    const tunnelGroup = new THREE.Group();
                    const tunnelColor = new THREE.Color(this.getBlockColor(block));
                    const tunnelMaterial = new THREE.MeshPhongMaterial({ 
                        color: tunnelColor,
                        side: THREE.DoubleSide 
                    });

                    // Create outer and inner half-pipes
                    const outerTunnelGeometry = new THREE.CylinderGeometry(1.75, 1.75, 4.5, 16, 1, true, 0, Math.PI);
                    const innerTunnelGeometry = new THREE.CylinderGeometry(1.55, 1.55, 4.5, 16, 1, true, 0, Math.PI);
                    const outerTunnel = new THREE.Mesh(outerTunnelGeometry, tunnelMaterial);
                    const innerTunnel = new THREE.Mesh(innerTunnelGeometry, tunnelMaterial);

                    // Create a single ring for each end using TorusGeometry
                    const ringGeometry = new THREE.TorusGeometry(1.65, 0.1, 8, 16, Math.PI);
                    const rightRing = new THREE.Mesh(ringGeometry, tunnelMaterial);

                    // Position and rotate rings correctly
                    rightRing.position.y = -2.25;
                    
                    // Rotate rings to match tunnel opening
                    rightRing.rotation.x = -Math.PI / 2;
                    rightRing.rotation.z = -Math.PI / 2;

                    // Create darker floor
                    const floorGeometry = new THREE.BoxGeometry(3.5, 0.2, 4.5);
                    const darkerColor = new THREE.Color(
                        tunnelColor.r * 0.6,
                        tunnelColor.g * 0.6,
                        tunnelColor.b * 0.6
                    );
                    const floorMaterial = new THREE.MeshPhongMaterial({ color: darkerColor });
                    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
                    
                    // Position floor
                    floor.rotation.x = Math.PI / 2;
                    floor.rotation.z = Math.PI / 2;
                    floor.position.y = -1.75;
                    
                    // Add all parts
                    tunnelGroup.add(outerTunnel);
                    tunnelGroup.add(innerTunnel);
                    tunnelGroup.add(rightRing);
                    tunnelGroup.add(floor);
                    
                    // Final group positioning
                    tunnelGroup.rotation.x = 0;
                    tunnelGroup.rotation.y = -Math.PI / 2;
                    tunnelGroup.rotation.z = Math.PI / 2;
                    tunnelGroup.position.set(x * 3.5, this.getBlockHeight(block), z);
                    
                    this.track.push(tunnelGroup);
                    this.scene.add(tunnelGroup);
                } else {
                    const segment = new THREE.Mesh(
                        this.trackGeometry,
                        new THREE.MeshPhongMaterial({ color: this.getBlockColor(block) })
                    );
                    
                    segment.position.set(x * 3.5, this.getBlockHeight(block), z);
                    segment.scale.set(3.5, this.getBlockHeight(block), 4.5);
                    
                    this.track.push(segment);
                    this.scene.add(segment);
                }
            });
        });
    }

    getBlockColor(block) {
        const colors = {
            '1': 0xFF69B4, // Hot pink (was FFB6C1)
            '2': 0x32CD32, // Lime green (was 98FB98)
            '3': 0x00CED1, // Dark turquoise (was AFEEEE)
            '4': 0xFFA500, // Orange (was FFDAB9)
            '5': 0x4169E1, // Royal blue for tunnel (was B0C4DE)
            '6': 0x1E90FF, // Dodger blue for tunnel (was 8794BF)
            '7': 0xFFD700, // Gold for raised block (was FFFACD)
            '8': 0xFF8C00, // Dark orange for raised block (was FFE4B5)
            '9': 0xFF4500, // Orange red for speed up (was FFB6B6)
            '0': 0x00FF00  // Pure green for slow down (was 98FB98)
        };
        return colors[block] || 0xFFFFFF;
    }

    getBlockHeight(block) {
        switch (block) {
            case '5':
            case '6':
                return 0.1; // Tunnel height
            case '7':
            case '8':
                return 1.0; // Raised block height
            default:
                return 0.2; // Normal track height
        }
    }

    setupControls() {
        document.addEventListener('keydown', (event) => {
            if (this.gameOver) return;
            
            switch (event.key) {
                case 'ArrowLeft':
                    this.leftKeyPressed = true;
                    this.shipRotation = -0.25;
                    break;
                case 'ArrowRight':
                    this.rightKeyPressed = true;
                    this.shipRotation = 0.25;
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
            switch (event.key) {
                case 'ArrowLeft':
                    this.leftKeyPressed = false;
                    if (!this.rightKeyPressed) {
                        this.shipRotation = 0;
                    } else {
                        this.shipRotation = 0.25; // If right is still pressed
                    }
                    break;
                case 'ArrowRight':
                    this.rightKeyPressed = false;
                    if (!this.leftKeyPressed) {
                        this.shipRotation = 0;
                    } else {
                        this.shipRotation = -0.25; // If left is still pressed
                    }
                    break;
            }
        });
    }

    checkCollisions(shipCenter) {
        // Check if ship is too far left or right
        if (Math.abs(this.shipPosition.x) > this.trackWidth * 1.5) {
            this.gameOver = true;
            return;
        }

        // Check if ship has fallen too low
        if (this.shipPosition.y < -5) {
            this.gameOver = true;
            return;
        }

        // Check if ship is on a track segment when not jumping
        if (!this.isJumping) {
            let isOnTrack = false;
            for (const segment of this.track) {
                if (segment.geometry instanceof THREE.CylinderGeometry) {
                    // Tunnel collision logic
                    const dx = Math.abs(shipCenter.x - segment.position.x);
                    const dz = Math.abs(shipCenter.z - segment.position.z);
                    
                    // Check if we're above the tunnel
                    if (dx < 1.75 && dz < 2.25 && this.shipPosition.y >= segment.position.y + 1.8) {
                        isOnTrack = true;
                        break;
                    }
                    
                    // Check if we're inside the tunnel curve
                    if (dx < 1.75 && dz < 2.25) {
                        const dy = Math.abs(this.shipPosition.y - segment.position.y);
                        const radius = 2;
                        if (dx * dx + dy * dy <= radius * radius) {
                            isOnTrack = true;
                            break;
                        }
                    }
                } else {
                    // Normal block collision logic
                    const dx = Math.abs(shipCenter.x - segment.position.x);
                    const dz = Math.abs(shipCenter.z - segment.position.z);
                    
                    if (dx < 1.75 && dz < 2.25) {
                        isOnTrack = true;
                        break;
                    }
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

    createShadow() {
        // Create a flat circle for the shadow
        const shadowGeometry = new THREE.CircleGeometry(0.5, 16);
        const shadowMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.3,
            depthWrite: false
        });
        this.shadowMesh = new THREE.Mesh(shadowGeometry, shadowMaterial);
        this.shadowMesh.rotation.x = -Math.PI / 2; // Lay flat
        this.scene.add(this.shadowMesh);
    }

    updateShadow() {
        if (!this.shadowMesh) return;

        // Start with shadow hidden
        this.shadowMesh.visible = false;

        // Check for blocks below the ship
        const shipCenter = this.shipPosition.clone();
        shipCenter.z += 1;

        for (const segment of this.track) {
            const dx = Math.abs(shipCenter.x - segment.position.x);
            const dz = Math.abs(shipCenter.z - segment.position.z);
            
            // If we're above a block
            if (dx < 1.75 && dz < 2.25) {
                const segmentTop = segment.position.y + segment.scale.y;
                
                // Show shadow only if ship is above the block
                if (this.shipPosition.y > segmentTop) {
                    this.shadowMesh.visible = true;
                    // Position shadow on top of the block
                    this.shadowMesh.position.x = this.shipPosition.x;
                    this.shadowMesh.position.y = segmentTop + 0.01; // Slightly above block to prevent z-fighting
                    this.shadowMesh.position.z = this.shipPosition.z;
                    break;
                }
            }
        }
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

        // Calculate ship's center point (offset back by 1 unit since ship is 2 units long)
        const shipCenter = this.shipPosition.clone();
        shipCenter.z += 1;

        // Apply jumping physics
        if (this.isJumping) {
            this.shipPosition.y += this.jumpVelocity;
            this.jumpVelocity -= 0.01; // Gravity

            // Only reset jumping if we hit a track segment
            let hitTrack = false;
            for (const segment of this.track) {
                const dx = Math.abs(shipCenter.x - segment.position.x);
                const dz = Math.abs(shipCenter.z - segment.position.z);
                
                const segmentTop = segment.position.y + segment.scale.y;
                if (dx < 1.75 && dz < 2.25 && 
                    this.shipPosition.y <= segmentTop + 0.2 && 
                    this.shipPosition.y > segmentTop - 0.5) {
                    this.shipPosition.y = segmentTop;
                    this.isJumping = false;
                    this.jumpVelocity = 0;
                    hitTrack = true;
                    break;
                }
            }

            if (!hitTrack && this.jumpVelocity < 0) {
                this.jumpVelocity -= 0.01; // Continue falling
            }
        } else {
            // When not jumping, check if we're on a track
            let isOnTrack = false;
            let currentHeight = this.segmentHeight;

            for (const segment of this.track) {
                const dx = Math.abs(shipCenter.x - segment.position.x);
                const dz = Math.abs(shipCenter.z - segment.position.z);
                
                if (dx < 1.75 && dz < 2.25) {
                    const segmentTop = segment.position.y + segment.scale.y;
                    if (Math.abs(this.shipPosition.y - segmentTop) < 0.3) {
                        currentHeight = segmentTop;
                        isOnTrack = true;
                        break;
                    }
                }
            }

            if (!isOnTrack) {
                this.isJumping = true;
                this.jumpVelocity = -0.1;
            } else {
                this.shipPosition.y = currentHeight;
            }
        }

        // Update ship position
        this.ship.position.copy(this.shipPosition);

        // Update camera to follow ship
        this.updateCamera();

        // Check for collisions using ship's center
        this.checkCollisions(shipCenter);

        // Add shadow update at the end
        this.updateShadow();
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
            this.scene.remove(segment);
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