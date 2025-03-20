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
        this.gameSpeed = 0.6; // Set to middle value (between 0.4 and 0.8)
        this.forwardSpeed = 0.3; // Set to middle value (between 0.2 and 0.4)
        this.trackWidth = 7;
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

        // Add this new property
        this.isInTunnel = false;

        // Add this new property for debris pieces
        this.explosionDebris = [];
        this.exhaustFlames = [];
        this.gameOverText = null; // Add this for the game over text
        this.gameOverFadeInterval = null; // Add this to track the fade animation

        // Add these properties for time-based movement
        this.lastTime = 0;
        this.fixedTimeStep = 16; // ~60fps
        this.timeAccumulator = 0;
        this.baseSpeed = {
            forward: 0.35,    // Middle ground between 0.2 and 0.5
            rotation: 0.35,   // Middle ground between 0.25 and 0.5
            jump: 0.4,        // Middle ground between 0.3 and 0.5
            gravity: 0.015    // Middle ground between 0.01 and 0.02
        };
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
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        // If you prefer manually controlling gamma
        this.renderer.gammaFactor = 2.2;
        this.renderer.gammaOutput = true; // Deprecated in newer Three.js, use outputEncoding

        // Disable tone mapping
        this.renderer.toneMapping = THREE.NoToneMapping;
        this.renderer.toneMappingExposure = 1; // or adjust as you like

        // Start animation loop with timestamp
        requestAnimationFrame((time) => this.animate(time));
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
        planeMaterial.map.colorSpace = THREE.SRGBColorSpace;
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
        
        // IMPORTANT FIX: Make sure the texture is properly loaded and scaled
        if (this.bgTexture.image) {
            // If image is already loaded, update the cover right away
            updateBackgroundCover();
        } else {
            // If image is not loaded yet, add an event listener
            this.bgTexture.addEventListener('load', () => {
                // When texture loads, force an immediate update
                updateOrthoCamera();
                updateBackgroundCover();
            });
        }

        // Also add a guaranteed update call with a slight delay
        setTimeout(() => {
            updateOrthoCamera();
            updateBackgroundCover();
        }, 100);  // 100ms should be enough for most texture loads

        // Create a more thorough retry mechanism for the background
        let retryCount = 0;
        const maxRetries = 10;
        const retryInterval = setInterval(() => {
            retryCount++;
            
            if (this.bgTexture.image && this.bgTexture.image.width > 0) {
                // Texture is properly loaded, update scaling
                updateOrthoCamera();
                updateBackgroundCover();
                clearInterval(retryInterval);
            } else if (retryCount >= maxRetries) {
                // Give up after max retries
                clearInterval(retryInterval);
                console.warn('Background texture did not load properly after multiple attempts');
            }
        }, 200);  // Check every 200ms

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
        planeMaterial.map.colorSpace = THREE.SRGBColorSpace;
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

        // Create game over text (hidden initially)
        this.createGameOverText();

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
        // Create a group to hold all ship parts
        this.ship = new THREE.Group();
        
        // Main body - elongated sphere
        const bodyGeometry = new THREE.SphereGeometry(0.4, 16, 16);
        bodyGeometry.scale(1.2, 0.7, 2.2); // Elongate it
        const bodyMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xffffff,  // White
            specular: 0x555555,
            shininess: 70
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        // Rotate the body 180 degrees to face forward
        body.rotation.y = Math.PI;
        
        // Wing - fatter triangle shape
        const wingShape = new THREE.Shape();
        wingShape.moveTo(0, 1.0);     // Point at front (now using positive Z as forward)
        wingShape.lineTo(-1.0, -0.5); // Back left
        wingShape.lineTo(1.0, -0.5);  // Back right
        wingShape.lineTo(0, 1.0);
        
        const wingGeometry = new THREE.ShapeGeometry(wingShape);
        const wingMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xffffff,  // White
            specular: 0x555555,
            shininess: 50
        });
        const wing = new THREE.Mesh(wingGeometry, wingMaterial);
        wing.position.set(0, 0.0, 0.2); // Raised to avoid clipping
        wing.rotation.x = -Math.PI / 2; // Lay flat
        
        // Create two side thrusters (elongated spheres)
        const thrusterGeometry = new THREE.SphereGeometry(0.25, 12, 12);
        thrusterGeometry.scale(1, 1, 1.7); // Elongate them
        const thrusterMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xffffff, // White
            specular: 0x555555,
            shininess: 80
        });
        
        // Left thruster
        const leftThruster = new THREE.Mesh(thrusterGeometry, thrusterMaterial);
        leftThruster.position.set(-0.45, 0, 0.3); // Position on left side
        
        // Right thruster
        const rightThruster = new THREE.Mesh(thrusterGeometry, thrusterMaterial);
        rightThruster.position.set(0.45, 0, 0.3); // Position on right side
        
        // Add details - small cockpit window
        const cockpitGeometry = new THREE.SphereGeometry(0.2, 12, 12);
        cockpitGeometry.scale(1, 0.7, 0.3); // Flatten it
        const cockpitMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x88ccff, // Blue window
            specular: 0xffffff,
            shininess: 100,
            transparent: true,
            opacity: 0.8
        });
        const cockpit = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
        cockpit.position.set(0, 0.1, -0.4); // Position at front-top
        
        // Add all parts to the ship group
        this.ship.add(body);
        this.ship.add(wing);
        this.ship.add(leftThruster);
        this.ship.add(rightThruster);
        this.ship.add(cockpit);
        
        // Don't rotate the entire ship - each part is positioned correctly
        // The main body is rotated individually instead
        
        this.scene.add(this.ship);
        
        // Save references to thrusters for flame effects
        this.leftThruster = leftThruster;
        this.rightThruster = rightThruster;
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
                    // Create a normal block for collision detection first (tunnel floor)
                    const floorSegment = new THREE.Mesh(
                        this.trackGeometry,
                        new THREE.MeshPhongMaterial({ 
                            color: new THREE.Color(this.getBlockColor(block)).multiplyScalar(0.6)
                        })
                    );
                    
                    // Position and scale the floor block
                    floorSegment.position.set(x * 3.5, this.getBlockHeight(block), z);
                    floorSegment.scale.set(3.5, this.getBlockHeight(block), 4.5);
                    
                    // Mark this as a tunnel floor for special handling
                    floorSegment.userData.isTunnelBlock = true;
                    
                    // Add the floor block to track for collision detection
                    this.track.push(floorSegment);
                    this.scene.add(floorSegment);
                    
                    // We still add the invisible top blocks, but we'll ignore them for collision
                    const tunnelTopBlock = new THREE.Mesh(
                        this.trackGeometry,
                        new THREE.MeshPhongMaterial({ 
                            color: 0xFF0000,  // Make it red for debugging (will be invisible in final)
                            transparent: true,
                            opacity: 0.0  // Completely invisible
                        })
                    );
                    
                    // Position the top block at the ceiling height of the tunnel
                    const tunnelFloorY = this.getBlockHeight(block);
                    const tunnelHeight = 1.75 * 2; // Diameter of tunnel
                    tunnelTopBlock.position.set(x * 3.5, tunnelFloorY + tunnelHeight, z);
                    tunnelTopBlock.scale.set(3.5, 0.1, 4.5);
                    tunnelTopBlock.userData.isTunnelTop = true;
                    
                    // We still add these to the track array so we can access them
                    this.track.push(tunnelTopBlock);
                    this.scene.add(tunnelTopBlock);
                    
                    // Now create the visual tunnel on top of the floor
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
                    
                    // Add all parts
                    tunnelGroup.add(outerTunnel);
                    tunnelGroup.add(innerTunnel);
                    tunnelGroup.add(rightRing);
                    
                    // Final group positioning
                    tunnelGroup.rotation.x = 0;
                    tunnelGroup.rotation.y = -Math.PI / 2;
                    tunnelGroup.rotation.z = Math.PI / 2;
                    tunnelGroup.position.set(x * 3.5, this.getBlockHeight(block), z);
                    
                    // Add tunnel visuals to scene (but not to track array since we don't need collision)
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
            // Handle controls differently if game is over
            if (this.gameOver) {
                if (event.key === ' ') {
                    // Restart the game when spacebar is pressed
                    this.restartGame();
                }
                return;
            }
            
            // Normal gameplay controls (don't apply if in tunnel)
            if (this.isInTunnel) return;
            
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
                        this.jumpVelocity = this.baseSpeed.jump; // Use our new middle ground value
                    }
                    break;
            }
        });

        document.addEventListener('keyup', (event) => {
            // Always capture key up events to prevent keys getting "stuck"
            switch (event.key) {
                case 'ArrowLeft':
                    this.leftKeyPressed = false;
                    if (!this.rightKeyPressed && !this.isInTunnel) {
                        this.shipRotation = 0;
                    } else if (!this.isInTunnel) {
                        this.shipRotation = 0.25; // If right is still pressed
                    }
                    break;
                case 'ArrowRight':
                    this.rightKeyPressed = false;
                    if (!this.leftKeyPressed && !this.isInTunnel) {
                        this.shipRotation = 0;
                    } else if (!this.isInTunnel) {
                        this.shipRotation = -0.25; // If left is still pressed
                    }
                    break;
            }
        });
    }

    checkCollisions(shipCenter) {
        // Check if ship is too far left or right
        if (Math.abs(this.shipPosition.x) > this.trackWidth * 1.5) {
            this.createExplosionEffect();  // Add explosion effect
            this.gameOver = true;
            return;
        }

        // Check if ship has fallen too low
        if (this.shipPosition.y < -5) {
            this.createExplosionEffect();  // Add explosion effect
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
            return;
        }

        // Calculate ship's center point (offset back by 1 unit since ship is 2 units long)
        const shipCenter = this.shipPosition.clone();
        shipCenter.z += 1;

        // Check if we're on a tunnel block
        let onTunnelBlock = false;
        let tunnelCenterX = 0;
        
        // Check if we're hitting a tunnel from above
        for (const segment of this.track) {
            const dx = Math.abs(shipCenter.x - segment.position.x);
            const dz = Math.abs(shipCenter.z - segment.position.z);
            
            if (dx < 1.75 && dz < 2.25) {
                // Check for tunnel floor collision
                if (segment.userData && segment.userData.isTunnelBlock) {
                    const tunnelFloorY = segment.position.y + segment.scale.y;
                    const tunnelHeight = 1.75 * 2; // Diameter of tunnel (2 * radius)
                    const tunnelTopY = tunnelFloorY + tunnelHeight;
                    
                    // COMPLETELY REVISED TUNNEL TOP COLLISION:
                    // 1. Check if the ship is directly above a tunnel (horizontally aligned)
                    // 2. Check if the ship is at or below the tunnel's top level
                    // 3. Check if the ship is falling (to ensure we're landing, not jumping up)
                    if (this.isJumping && 
                        this.jumpVelocity <= 0 && // Ship is falling or at zero velocity
                        this.shipPosition.y <= tunnelTopY + 0.5 && // Ship is at or slightly above tunnel top
                        this.shipPosition.y >= tunnelTopY - 0.5) { // Ship is not too far below tunnel top
                        
                        console.log(`Ship Y: ${this.shipPosition.y}, Tunnel Top Y: ${tunnelTopY}`);
                        console.log("Crashed into top of tunnel!");
                        this.createExplosionEffect();  // Add explosion effect
                        this.gameOver = true;
                        return;
                    }
                    
                    // Check if we should be inside the tunnel
                    if (Math.abs(this.shipPosition.y - tunnelFloorY) < 0.3) {
                        onTunnelBlock = true;
                        tunnelCenterX = segment.position.x;
                        
                        // Only check for edge collision when entering a tunnel
                        if (!this.isInTunnel) {
                            // Calculate width-wise edges
                            const tunnelWidth = 3.5;
                            const tunnelEdgeSize = tunnelWidth * 0.2; // 20% of tunnel width
                            
                            // Calculate distance from center to determine if at edge
                            const distFromCenter = Math.abs(shipCenter.x - segment.position.x);
                            const safeWidth = (tunnelWidth / 2) - tunnelEdgeSize;
                            
                            // If we're too close to the edge
                            if (distFromCenter > safeWidth) {
                                console.log("Crashed into tunnel side edge!");
                                this.createExplosionEffect();  // Add explosion effect
                                this.gameOver = true;
                                return;
                            }
                        }
                    }
                }
                
                // Skip tunnel top blocks for collision since we're handling top collision differently
                if (segment.userData && segment.userData.isTunnelTop) {
                    continue;
                }
            }
        }

        // Update tunnel state
        this.isInTunnel = onTunnelBlock;

        // Apply controls based on whether we're in a tunnel or not
        if (!this.isInTunnel) {
            // Update ship position based on rotation and velocity (normal controls)
            // Note that we now use the time factor to scale movement
            this.shipVelocity.x = this.shipRotation * this.gameSpeed;
            this.shipPosition.x += this.shipVelocity.x;
        } else {
            // In tunnel - force to center and disable controls
            // Smoothly move toward center (slow centering effect)
            this.shipPosition.x = this.shipPosition.x * 0.9 + tunnelCenterX * 0.1;
            
            // Ensure we're at floor level if inside tunnel
            const tunnelFloorY = this.tunnelHeight + 0.1; // Add small offset for the floor thickness
            this.shipPosition.y = tunnelFloorY;
            
            // Override ship rotation to face forward
            this.shipRotation = 0;
        }

        // Move ship forward (always happens)
        this.shipPosition.z -= this.forwardSpeed;

        // Apply jumping physics only when not in tunnel
        if (this.isJumping) {
            if (!this.isInTunnel) {
                this.shipPosition.y += this.jumpVelocity;
                this.jumpVelocity -= 0.01; // Gravity

                // Only reset jumping if we hit a track segment
                let hitTrack = false;
                for (const segment of this.track) {
                    // Skip tunnel top blocks for collision
                    if (segment.userData && segment.userData.isTunnelTop) {
                        continue;
                    }
                    
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
                // In tunnel - cancel any jumping
                this.isJumping = false;
                this.jumpVelocity = 0;
            }
        } else if (!this.isInTunnel) {
            // When not jumping and not in tunnel, check if we're on a track
            let isOnTrack = false;
            let currentHeight = this.segmentHeight;

            for (const segment of this.track) {
                // Skip tunnel top blocks for collision
                if (segment.userData && segment.userData.isTunnelTop) {
                    continue;
                }
                
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
        
        // Add horizontal turning effect (yaw) when turning
        if (!this.isInTunnel) {
            // Now the base orientation is 0 (not Math.PI)
            // Add a rotation offset when turning
            const turnAmount = -this.shipRotation * 1; // 50% less pronounced as requested
            
            // Apply the turn rotation directly (no need to add Math.PI)
            this.ship.rotation.y = turnAmount;
        } else {
            // In tunnel, face straight ahead
            this.ship.rotation.y = 0;
        }
        
        // Update camera to follow ship
        this.updateCamera();

        // Check for collisions using ship's center
        this.checkCollisions(shipCenter);

        // Add shadow update at the end
        this.updateShadow();
    }

    createExplosionEffect() {
        // Make sure explosionDebris exists
        if (!this.explosionDebris) {
            this.explosionDebris = [];
        }
        
        // Hide the ship
        this.ship.visible = false;
        
        // Create a flash of light
        const flashGeometry = new THREE.SphereGeometry(1, 16, 16);
        const flashMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xffff00,
            transparent: true,
            opacity: 1.0
        });
        const flash = new THREE.Mesh(flashGeometry, flashMaterial);
        flash.position.copy(this.shipPosition);
        this.scene.add(flash);
        
        // Create debris pieces
        const debrisCount = 20;
        const colors = [0xff0000, 0xff6600, 0xffff00, 0x00ff00]; // Red, orange, yellow, green
        
        for (let i = 0; i < debrisCount; i++) {
            // Create various shaped debris
            let geometry;
            const randomShape = Math.floor(Math.random() * 4);
            
            switch (randomShape) {
                case 0:
                    geometry = new THREE.TetrahedronGeometry(0.2 + Math.random() * 0.3);
                    break;
                case 1:
                    geometry = new THREE.BoxGeometry(0.2 + Math.random() * 0.3, 0.2 + Math.random() * 0.3, 0.2 + Math.random() * 0.3);
                    break;
                case 2:
                    geometry = new THREE.ConeGeometry(0.2 + Math.random() * 0.2, 0.4 + Math.random() * 0.3, 4);
                    break;
                default:
                    geometry = new THREE.SphereGeometry(0.1 + Math.random() * 0.2);
            }
            
            // Random color from the explosion palette
            const color = colors[Math.floor(Math.random() * colors.length)];
            const material = new THREE.MeshPhongMaterial({ 
                color: color,
                emissive: color,
                emissiveIntensity: 0.5,
                transparent: true,
                opacity: 1.0
            });
            
            const debris = new THREE.Mesh(geometry, material);
            
            // Position at ship's location
            debris.position.copy(this.shipPosition);
            
            // Random velocity in all directions
            const speed = 0.1 + Math.random() * 0.3;
            const direction = new THREE.Vector3(
                (Math.random() - 0.5) * 2,
                (Math.random() - 0.5) * 2,
                (Math.random() - 0.5) * 2
            ).normalize();
            
            // Store velocity and rotation info in the userData
            debris.userData = {
                velocity: direction.multiplyScalar(speed),
                rotationAxis: new THREE.Vector3(
                    Math.random() - 0.5,
                    Math.random() - 0.5,
                    Math.random() - 0.5
                ).normalize(),
                rotationSpeed: Math.random() * 0.2,
                age: 0,
                maxAge: 60 + Math.random() * 60, // 1-2 seconds at 60fps
            };
            
            this.explosionDebris.push(debris);
            this.scene.add(debris);
        }
        
        // Animate the flash fading out
        let flashFrames = 0;
        const flashAnimation = setInterval(() => {
            flashFrames++;
            flash.scale.set(1 + flashFrames * 0.2, 1 + flashFrames * 0.2, 1 + flashFrames * 0.2);
            flash.material.opacity = 1 - (flashFrames / 10);
            
            if (flashFrames >= 10) {
                clearInterval(flashAnimation);
                this.scene.remove(flash);
            }
        }, 16); // Roughly 60fps

        // Show game over text with fade-in animation
        if (this.gameOverText) {
            // Make sure the text is visible before fading in
            this.gameOverText.visible = true;
            
            // Clear any existing fade animation first
            if (this.gameOverFadeInterval) {
                clearInterval(this.gameOverFadeInterval);
                this.gameOverFadeInterval = null;
            }
            
            this.gameOverText.material.opacity = 0;
            
            // Animate fade-in after a short delay to let explosion be visible first
            setTimeout(() => {
                // Animate opacity from 0 to 1 over 1 second
                const fadeInSteps = 20;
                let step = 0;
                
                this.gameOverFadeInterval = setInterval(() => {
                    step++;
                    this.gameOverText.material.opacity = step / fadeInSteps;
                    
                    if (step >= fadeInSteps) {
                        clearInterval(this.gameOverFadeInterval);
                        this.gameOverFadeInterval = null;
                    }
                }, 50);
            }, 1500); // 1.5 second delay
        }
    }

    // Simplify the fixed update to avoid extra calculations
    fixedUpdate(deltaTime) {
        // Use a simple scaling factor
        const timeFactor = 1.0; 
        
        // Set speeds directly
        this.forwardSpeed = this.baseSpeed.forward;
        
        // Only update these if not in tunnel
        if (!this.isInTunnel) {
            if (this.leftKeyPressed) {
                this.shipRotation = -this.baseSpeed.rotation;
            } else if (this.rightKeyPressed) {
                this.shipRotation = this.baseSpeed.rotation;
            } else {
                this.shipRotation = 0;
            }
        }
        
        // Use fixed gravity value
        if (this.isJumping && !this.isInTunnel) {
            this.jumpVelocity -= this.baseSpeed.gravity;
        }
        
        // Update the ship
        this.updateShip();
    }

    // Simplify the animate function to reduce overhead
    animate(currentTime) {
        // Initialize lastTime on first call
        if (!this.lastTime) this.lastTime = currentTime;
        
        // Calculate time since last frame
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;
        
        // Run update directly for better performance
        this.fixedUpdate(deltaTime);
        
        // Animate exhaust flames if they exist and the ship is visible
        if (this.exhaustFlames && this.exhaustFlames.length > 0 && this.ship.visible) {
            const time = currentTime * 0.001; // Current time in seconds
            
            for (const flame of this.exhaustFlames) {
                // Create a pulsing effect for each flame
                const pulseValue = Math.sin(time * flame.userData.pulseSpeed + flame.userData.pulseOffset) * flame.userData.pulseFactor;
                
                // Scale the flame based on the pulse (1 ± pulseFactor)
                const scaleX = flame.userData.originalScale.x * (1 + pulseValue);
                const scaleY = flame.userData.originalScale.y * (1 + pulseValue * 0.5);
                flame.scale.set(scaleX, scaleY, 1);
            }
        }
        
        // Update explosion debris if any exists
        if (this.explosionDebris && this.explosionDebris.length > 0) {
            // Scale debris velocity by delta time
            const debrisTimeFactor = deltaTime / (1000/60);
            
            for (let i = this.explosionDebris.length - 1; i >= 0; i--) {
                const debris = this.explosionDebris[i];
                
                // Scale movement by time
                const scaledVelocity = debris.userData.velocity.clone().multiplyScalar(debrisTimeFactor);
                debris.position.add(scaledVelocity);
                
                // Apply gravity with time scaling
                debris.userData.velocity.y -= 0.005 * debrisTimeFactor;
                
                // Rotate the debris with time scaling
                debris.rotateOnAxis(
                    debris.userData.rotationAxis, 
                    debris.userData.rotationSpeed * debrisTimeFactor
                );
                
                // Age the debris
                debris.userData.age += debrisTimeFactor;
                
                // Fade out as it ages
                if (debris.userData.age > debris.userData.maxAge * 0.7) {
                    const fadeRatio = 1 - ((debris.userData.age - (debris.userData.maxAge * 0.7)) / (debris.userData.maxAge * 0.3));
                    debris.material.opacity = fadeRatio;
                }
                
                // Remove if too old
                if (debris.userData.age >= debris.userData.maxAge) {
                    this.scene.remove(debris);
                    this.explosionDebris.splice(i, 1);
                }
            }
        }
        
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
        
        // Continue animation loop
        requestAnimationFrame((time) => this.animate(time));
    }

    restartGame() {
        // Clear any ongoing fade animation
        if (this.gameOverFadeInterval) {
            clearInterval(this.gameOverFadeInterval);
            this.gameOverFadeInterval = null;
        }
        
        // Hide game over text
        if (this.gameOverText) {
            this.gameOverText.material.opacity = 0;
            this.gameOverText.visible = false; // Also set visibility to false
        }
        
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
        
        // Clear any remaining debris
        if (this.explosionDebris) {
            for (const debris of this.explosionDebris) {
                this.scene.remove(debris);
            }
            this.explosionDebris = [];
        } else {
            this.explosionDebris = [];
        }
        
        // Make ship visible again
        this.ship.visible = true;

        // Generate new track
        this.generateTrackFromLevel();

        // Reset ship position
        this.shipPosition.set(0, this.segmentHeight, 0);
        this.ship.position.copy(this.shipPosition);

        // Reset camera
        this.updateCamera();

        // Show game over text only when needed
        if (this.gameOverText) {
            this.gameOverText.visible = false;
        }
    }

    // Add this new method to create the game over text
    createGameOverText() {
        // Create a canvas to render text
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 1024;
        canvas.height = 256;
        
        // Draw background rectangle
        context.fillStyle = 'rgba(0, 0, 0, 0.7)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw border
        context.strokeStyle = '#FF0000';
        context.lineWidth = 8;
        context.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
        
        // Draw text
        context.font = 'bold 72px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = '#FF0000';
        context.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 40);
        
        context.font = 'bold 36px Arial';
        context.fillStyle = '#FFFFFF';
        context.fillText('Press SPACE to restart', canvas.width / 2, canvas.height / 2 + 40);
        
        // Create texture from canvas
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        
        // Create material and geometry
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 0,
            depthTest: false,
            depthWrite: false
        });
        
        // Size the text to look good on screen (adjust to fit your needs)
        const screenAspect = window.innerWidth / window.innerHeight;
        const width = 1.5;
        const height = width * (canvas.height / canvas.width);
        
        const geometry = new THREE.PlaneGeometry(width, height);
        this.gameOverText = new THREE.Mesh(geometry, material);
        
        // Position it center of screen
        this.gameOverText.position.set(0, 0, 0);
        
        // Add to overlay scene
        this.overlayScene.add(this.gameOverText);
    }

    // Update the exhaust flames method to attach flames to the thrusters
    createExhaustFlames() {
        // Initialize exhaustFlames if it doesn't exist
        if (!this.exhaustFlames) {
            this.exhaustFlames = [];
        }
        
        // Clean up any existing flames
        if (this.exhaustFlames.length > 0) {
            for (const flame of this.exhaustFlames) {
                flame.parent.remove(flame);
            }
            this.exhaustFlames = [];
        }

        // Create a material with the burn texture that is transparent
        const flameMaterial = new THREE.MeshBasicMaterial({
            map: this.burnTexture,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending, // Additive blending for a glow effect
            color: 0xffaa00 // Slightly orange tint
        });

        // Create flames for both thrusters
        if (this.leftThruster && this.rightThruster) {
            // Parameters for flames
            const flameParams = [
                { parent: this.leftThruster, posOffset: new THREE.Vector3(0, 0, 0.7) },
                { parent: this.rightThruster, posOffset: new THREE.Vector3(0, 0, 0.7) }
            ];
            
            for (const params of flameParams) {
                // Create crossed flame planes for a 3D effect
                for (let i = 0; i < 2; i++) {
                    const flameGeometry = new THREE.PlaneGeometry(0.4, 0.7);
                    const flame = new THREE.Mesh(flameGeometry, flameMaterial.clone());
                    flame.position.copy(params.posOffset);
                    flame.rotation.z = i * Math.PI / 2; // Rotate 0 and 90 degrees
                    
                    // Store the flame's original scale for animation
                    flame.userData = {
                        originalScale: new THREE.Vector3(1, 1, 1),
                        pulseFactor: 0.3,
                        pulseSpeed: 0.07 + (Math.random() * 0.05),
                        pulseOffset: Math.random() * Math.PI * 2
                    };
                    
                    params.parent.add(flame);
                    this.exhaustFlames.push(flame);
                }
            }
        }
    }
}

// Start the game
new Game(); 