let initialized = false

const WORLD_SCALE = 1;
let cameraX = 0;
let cameraY = 0;
let zoomScale = 1;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
let baseWidth = 0;
let baseHeight = 0;
let worldWidth = 0;
let worldHeight = 0;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let cameraStartX = 0;
let cameraStartY = 0;
let clickStartX = 0;
let clickStartY = 0;
const DRAG_THRESHOLD = 4;
let threeState = null;
let objectMode = null;
let blockCounter = 0;
let avatarTouchedBlockId = null;
let followTargetId = null;
let followReturnCamera = null;
let followToggle = null;
let followMenu = null;
let followItems = new Map();
let followListSignature = "";
let followMode = "self";
const keyState = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    a: false,
    d: false,
    A: false,
    D: false,
    w: false,
    s: false,
    W: false,
    S: false,
    q: false,
    e: false,
    Q: false,
    E: false
};
let threeLoopRunning = false;
let tiltAngle = 0.22;
let yawAngle = 0;
let cameraHeight = 12;
const TERRAIN_SCALE = 0;
const AVATAR_GROUND_OFFSET = 0.4;

function getTerrainHeight(x, z) {
    const wave1 = Math.sin(x * 0.12) * 0.7;
    const wave2 = Math.cos(z * 0.1) * 0.6;
    const wave3 = Math.sin((x + z) * 0.08) * 0.5;
    return (wave1 + wave2 + wave3) * TERRAIN_SCALE;
}

function updateAvatarBlockTouch() {
    if (!threeState) {
        return;
    }
    const viewWidth = canvas.width / zoomScale;
    const viewHeight = canvas.height / zoomScale;
    const centerX = cameraX / pixel_size + viewWidth / (2 * pixel_size);
    const centerZ = cameraY / pixel_size + viewHeight / (2 * pixel_size);
    avatarTouchedBlockId = null;
    threeState.blockMeshes.forEach(mesh => {
        const size = mesh.userData.size || 1.2;
        const half = size / 2;
        if (Math.abs(centerX - mesh.position.x) <= half && Math.abs(centerZ - mesh.position.z) <= half) {
            avatarTouchedBlockId = mesh.userData.id || null;
        }
    });
    window.avatarTouchedBlockId = avatarTouchedBlockId;
}

let navHud = null;

function setFollowTarget(bodyId) {
    const nextId = bodyId != null ? String(bodyId) : null;
    if (nextId && nextId === followTargetId) {
        followTargetId = null;
        followMode = "self";
        if (followReturnCamera) {
            cameraX = followReturnCamera.x;
            cameraY = followReturnCamera.y;
            followReturnCamera = null;
            clampCamera();
        }
    } else {
        if (!followTargetId && nextId) {
            followReturnCamera = { x: cameraX, y: cameraY };
        }
        followTargetId = nextId;
        followMode = nextId ? "manual" : "self";
    }
    updateFollowMenuSelection();
    updateFollowToggleLabel();
}

function setFollowTop() {
    if (followMode === "top") {
        setFollowTarget(null);
        return;
    }
    if (!followTargetId) {
        followReturnCamera = { x: cameraX, y: cameraY };
    }
    followMode = "top";
    updateFollowMenuSelection();
    updateFollowToggleLabel();
}

function updateFollowMenuSelection() {
    if (!followItems.size) {
        return;
    }
    followItems.forEach((button, id) => {
        const isActive = id === "self"
            ? followMode === "self"
            : id === "top"
                ? followMode === "top"
                : id === followTargetId && followMode === "manual";
        button.classList.toggle("active", isActive);
    });
}

function updateFollowToggleLabel() {
    if (!followToggle) {
        return;
    }
    if (followMode === "top") {
        followToggle.textContent = "Follow: Top Fitness";
        return;
    }
    if (!followTargetId || followMode === "self") {
        followToggle.textContent = "Follow: My Avatar";
        return;
    }
    followToggle.textContent = `Follow: Body ${followTargetId}`;
}

function updateFollowMenu(bodiesList) {
    if (!followMenu || !Array.isArray(bodiesList)) {
        return;
    }
    const ids = bodiesList.map(body => body.body_id != null ? String(body.body_id) : `${body.pos_x}:${body.pos_y}`);
    ids.sort((a, b) => {
        const aNum = Number(a);
        const bNum = Number(b);
        if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
            return aNum - bNum;
        }
        return a.localeCompare(b);
    });
    const signature = ids.join("|");
    if (signature !== followListSignature) {
        followMenu.innerHTML = "";
        followItems = new Map();
        const selfButton = document.createElement("button");
        selfButton.type = "button";
        selfButton.textContent = "My Avatar";
        selfButton.addEventListener("click", () => setFollowTarget(null));
        followMenu.appendChild(selfButton);
        followItems.set("self", selfButton);
        const topButton = document.createElement("button");
        topButton.type = "button";
        topButton.textContent = "Top Fitness";
        topButton.addEventListener("click", () => setFollowTop());
        followMenu.appendChild(topButton);
        followItems.set("top", topButton);
        ids.forEach(id => {
            const button = document.createElement("button");
            button.type = "button";
            button.dataset.bodyId = id;
            button.addEventListener("click", () => setFollowTarget(id));
            followMenu.appendChild(button);
            followItems.set(id, button);
        });
        followListSignature = signature;
    }

    const bodyMap = new Map();
    bodiesList.forEach(body => {
        const id = body.body_id != null ? String(body.body_id) : `${body.pos_x}:${body.pos_y}`;
        bodyMap.set(id, body);
    });
    followItems.forEach((button, id) => {
        if (id === "self") {
            return;
        }
        if (id === "top") {
            return;
        }
        const body = bodyMap.get(id);
        if (!body) {
            return;
        }
        const fitnessText = formatFitnessValue(body.fitness);
        button.textContent = `Body ${id} · Fitness ${fitnessText}`;
    });
    updateFollowMenuSelection();
    updateFollowToggleLabel();
}

function updateFollowTargetPosition() {
    if (!Array.isArray(bodies)) {
        return false;
    }
    if (followMode === "top") {
        let bestBody = null;
        let bestFitness = -Infinity;
        bodies.forEach(body => {
            const value = Number(body.fitness);
            const score = Number.isNaN(value) ? -Infinity : value;
            if (score > bestFitness) {
                bestFitness = score;
                bestBody = body;
            }
        });
        if (!bestBody) {
            setFollowTarget(null);
            return false;
        }
        followTargetId = bestBody.body_id != null
            ? String(bestBody.body_id)
            : `${bestBody.pos_x}:${bestBody.pos_y}`;
    }
    if (!followTargetId) {
        return false;
    }
    const target = bodies.find(body => {
        const id = body.body_id != null ? String(body.body_id) : `${body.pos_x}:${body.pos_y}`;
        return id === followTargetId;
    });
    if (!target) {
        setFollowTarget(null);
        return false;
    }
    const viewWidth = canvas.width / zoomScale;
    const viewHeight = canvas.height / zoomScale;
    cameraX = target.pos_x * pixel_size - viewWidth / 2;
    cameraY = target.pos_y * pixel_size - viewHeight / 2;
    clampCamera();
    return true;
}

function updateWorldSize() {
    baseWidth = numCols * pixel_size;
    baseHeight = numRows * pixel_size;
    worldWidth = baseWidth * WORLD_SCALE;
    worldHeight = baseHeight * WORLD_SCALE;
    clampCamera();
}

function clampCamera() {
    const viewWidth = canvas.width / zoomScale;
    const viewHeight = canvas.height / zoomScale;
    const minX = -viewWidth * 0.5;
    const minY = -viewHeight * 0.5;
    const maxX = worldWidth - viewWidth * 0.5;
    const maxY = worldHeight - viewHeight * 0.5;
    cameraX = Math.min(Math.max(cameraX, minX), maxX);
    cameraY = Math.min(Math.max(cameraY, minY), maxY);
}

function screenToWorld(value, camera, baseSize, zoom) {
    return camera + value / zoom;
}

function isOnScreen(x, y, radius) {
    const screenX = x * zoomScale;
    const screenY = y * zoomScale;
    const screenRadius = radius * zoomScale;
    return (
        screenX + screenRadius >= 0 &&
        screenY + screenRadius >= 0 &&
        screenX - screenRadius <= canvas.width &&
        screenY - screenRadius <= canvas.height
    );
}

function getPointerPosition(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

function initThreeLayer() {
    if (typeof THREE === "undefined" || threeState) {
        return;
    }

    const layer = document.createElement("div");
    layer.id = "three-layer";
    document.body.appendChild(layer);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setClearColor(0x172554, 1);
    const gl = renderer.getContext();
    let gpuInfo = "WebGL renderer info unavailable";
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    if (debugInfo) {
        const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
        const rendererName = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        gpuInfo = `${vendor} - ${rendererName}`;
    }
    alert(`WebGL GPU: ${gpuInfo}`);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xb7c7d6, 60, 1200);

    const skyGeometry = new THREE.SphereGeometry(2000, 48, 32);
    const skyMaterial = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: {
            topColor: { value: new THREE.Color(0x9cc7f3) },
            bottomColor: { value: new THREE.Color(0xdbeafe) },
            offset: { value: 30 },
            exponent: { value: 0.6 }
        },
        vertexShader: `
            varying vec3 vWorldPosition;
            void main() {
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 topColor;
            uniform vec3 bottomColor;
            uniform float offset;
            uniform float exponent;
            varying vec3 vWorldPosition;
            void main() {
                float h = normalize(vWorldPosition + offset).y;
                float t = max(pow(max(h, 0.0), exponent), 0.0);
                gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
            }
        `
    });
    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    scene.add(sky);

    const cloudCanvas = document.createElement("canvas");
    cloudCanvas.width = 512;
    cloudCanvas.height = 512;
    const cctx = cloudCanvas.getContext("2d");
    const cloudGradient = cctx.createRadialGradient(256, 200, 40, 256, 200, 230);
    cloudGradient.addColorStop(0, "rgba(255, 255, 255, 0.9)");
    cloudGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    cctx.fillStyle = cloudGradient;
    cctx.fillRect(0, 0, cloudCanvas.width, cloudCanvas.height);
    for (let i = 0; i < 18; i++) {
        const x = 120 + Math.random() * 260;
        const y = 140 + Math.random() * 120;
        const r = 40 + Math.random() * 70;
        const g = cctx.createRadialGradient(x, y, r * 0.3, x, y, r);
        g.addColorStop(0, "rgba(255,255,255,0.85)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        cctx.fillStyle = g;
        cctx.beginPath();
        cctx.arc(x, y, r, 0, Math.PI * 2);
        cctx.fill();
    }
    const cloudTexture = new THREE.CanvasTexture(cloudCanvas);
    cloudTexture.wrapS = THREE.ClampToEdgeWrapping;
    cloudTexture.wrapT = THREE.ClampToEdgeWrapping;

    const cloudMaterial = new THREE.SpriteMaterial({
        map: cloudTexture,
        transparent: true,
        opacity: 0.75
    });
    const clouds = new THREE.Group();
    for (let i = 0; i < 12; i++) {
        const cloud = new THREE.Sprite(cloudMaterial);
        cloud.position.set((Math.random() - 0.5) * 200, 40 + Math.random() * 30, (Math.random() - 0.5) * 200);
        cloud.scale.set(60 + Math.random() * 50, 30 + Math.random() * 25, 1);
        cloud.userData.speed = 0.2 + Math.random() * 0.3;
        clouds.add(cloud);
    }
    scene.add(clouds);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 3000);
    const hemi = new THREE.HemisphereLight(0xfff3d6, 0x1b2a1c, 0.75);
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    const key = new THREE.DirectionalLight(0xffe2b5, 1.0);
    key.position.set(40, 60, 10);
    const rim = new THREE.PointLight(0xbad6ff, 0.8, 140);
    rim.position.set(-25, 35, -25);
    scene.add(hemi, ambient, key, rim);

    const terrainCanvas = document.createElement("canvas");
    terrainCanvas.width = 512;
    terrainCanvas.height = 512;
    const tctx = terrainCanvas.getContext("2d");
    tctx.fillStyle = "#2b5a32";
    tctx.fillRect(0, 0, terrainCanvas.width, terrainCanvas.height);
    for (let i = 0; i < 14000; i++) {
        const x = Math.random() * terrainCanvas.width;
        const y = Math.random() * terrainCanvas.height;
        const shade = 18 + Math.floor(Math.random() * 55);
        tctx.fillStyle = `rgba(${28 + shade}, ${75 + shade}, ${28 + Math.floor(shade * 0.3)}, 0.18)`;
        tctx.fillRect(x, y, 1.2, 1.2);
    }
    const terrainTexture = new THREE.CanvasTexture(terrainCanvas);
    terrainTexture.wrapS = THREE.ClampToEdgeWrapping;
    terrainTexture.wrapT = THREE.ClampToEdgeWrapping;
    terrainTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const terrainMaterial = new THREE.MeshStandardMaterial({
        map: terrainTexture,
        roughness: 0.95,
        metalness: 0.0
    });


    const reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.7, 0.78, 40),
        new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.75 })
    );
    reticle.rotation.x = -Math.PI / 2;
    reticle.position.y = -0.58;
    scene.add(reticle);

    const avatar = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: 0x2563eb,
        roughness: 0.25,
        metalness: 0.15
    });
    const headMaterial = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        roughness: 0.2,
        metalness: 0.05
    });
    const accentMaterial = new THREE.MeshStandardMaterial({
        color: 0x22d3ee,
        emissive: 0x22d3ee,
        emissiveIntensity: 0.7,
        roughness: 0.3,
        metalness: 0.2
    });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.85, 6, 12), bodyMaterial);
    torso.position.y = 0.8;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 18), headMaterial);
    head.position.y = 1.38;

    const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.6, 6, 12), bodyMaterial);
    leftArm.position.set(-0.46, 0.85, 0);
    leftArm.rotation.z = Math.PI / 12;
    const rightArm = leftArm.clone();
    rightArm.position.x = 0.46;
    rightArm.rotation.z = -Math.PI / 12;

    const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.7, 6, 12), bodyMaterial);
    leftLeg.position.set(-0.2, 0.2, 0);
    const rightLeg = leftLeg.clone();
    rightLeg.position.x = 0.2;

    const chestCore = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), accentMaterial);
    chestCore.position.y = 0.8;

    avatar.add(torso, head, leftArm, rightArm, leftLeg, rightLeg, chestCore);
    avatar.position.y = 0.05;
    scene.add(avatar);

    layer.appendChild(renderer.domElement);
    threeState = {
        layer,
        renderer,
        scene,
        camera,
        terrainMaterial,
        terrainMesh: null,
        gridLines: null,
        blockMeshes: [],
        reticle,
        avatar,
        sky,
        clouds,
        avatarParts: {
            leftArm,
            rightArm,
            leftLeg,
            rightLeg,
            head
        },
        bodyMeshes: new Map()
    };
    syncThreeGround();
    resizeThreeLayer();
    startThreeLoop();
}

function resizeThreeLayer() {
    if (!threeState) {
        return;
    }
    const rect = canvas.getBoundingClientRect();
    threeState.layer.style.left = `${rect.left}px`;
    threeState.layer.style.top = `${rect.top}px`;
    threeState.layer.style.width = `${rect.width}px`;
    threeState.layer.style.height = `${rect.height}px`;
    threeState.renderer.setSize(rect.width, rect.height, false);
    threeState.camera.aspect = rect.width / rect.height;
    threeState.camera.updateProjectionMatrix();
}

function updateThreeCamera() {
    if (!threeState) {
        return;
    }
    updateFollowTargetPosition();
    const viewWidth = canvas.width / zoomScale;
    const viewHeight = canvas.height / zoomScale;
    const centerX = cameraX / pixel_size + viewWidth / (2 * pixel_size);
    const centerZ = cameraY / pixel_size + viewHeight / (2 * pixel_size);
    const height = cameraHeight / zoomScale;
    const distance = 22 / zoomScale;
    const sinYaw = Math.sin(yawAngle);
    const cosYaw = Math.cos(yawAngle);
    const terrainY = getTerrainHeight(centerX, centerZ);
    threeState.camera.position.set(centerX + sinYaw * distance, terrainY + height, centerZ + cosYaw * distance);
    const cosTilt = Math.cos(tiltAngle);
    const dirX = -sinYaw * cosTilt;
    const dirZ = -cosYaw * cosTilt;
    const dirY = Math.sin(tiltAngle);
    threeState.camera.lookAt(
        threeState.camera.position.x + dirX * distance,
        threeState.camera.position.y + dirY * distance,
        threeState.camera.position.z + dirZ * distance
    );
    if (threeState.scene && threeState.scene.children) {
        const rim = threeState.scene.children.find(obj => obj.isPointLight);
        if (rim) {
            rim.position.set(centerX - 10 * cosYaw, height + 8, centerZ - 10 * sinYaw);
        }
    }
    if (threeState.sky) {
        threeState.sky.position.copy(threeState.camera.position);
    }

    if (threeState.reticle) {
        threeState.reticle.position.x = centerX;
        threeState.reticle.position.z = centerZ;
        threeState.reticle.position.y = terrainY + 0.03;
    }
    if (threeState.avatar) {
        threeState.avatar.visible = !followTargetId;
        threeState.avatar.position.x = centerX;
        threeState.avatar.position.z = centerZ;
        threeState.avatar.position.y = terrainY + AVATAR_GROUND_OFFSET;
        threeState.avatar.rotation.y = yawAngle + Math.PI;
        threeState.avatar.userData.baseY = terrainY + AVATAR_GROUND_OFFSET;
    }
}

function syncThreeGround() {
    if (!threeState) {
        return;
    }
    const width = Math.max(10, numCols);
    const height = Math.max(10, numRows);
    const segmentsX = Math.max(40, Math.floor(width));
    const segmentsY = Math.max(40, Math.floor(height));
    const terrainGeometry = new THREE.PlaneGeometry(width, height, segmentsX, segmentsY);
    const positions = terrainGeometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
        const localX = positions.getX(i);
        const localZ = positions.getY(i);
        const worldX = localX + width / 2;
        const worldZ = localZ + height / 2;
        const heightValue = getTerrainHeight(worldX, worldZ);
        positions.setZ(i, heightValue);
    }
    terrainGeometry.computeVertexNormals();
    terrainGeometry.rotateX(-Math.PI / 2);

    if (threeState.terrainMesh) {
        threeState.scene.remove(threeState.terrainMesh);
        threeState.terrainMesh.geometry.dispose();
    }
    threeState.terrainMesh = new THREE.Mesh(terrainGeometry, threeState.terrainMaterial);
    threeState.terrainMesh.position.x = width / 2;
    threeState.terrainMesh.position.z = height / 2;
    threeState.scene.add(threeState.terrainMesh);


    const step = Math.max(3, Math.floor(Math.max(width, height) / 30));
    const sample = Math.max(1, Math.floor(step / 2));
    const linePositions = [];
    for (let x = 0; x <= width; x += step) {
        for (let z = 0; z < height; z += sample) {
            const h1 = getTerrainHeight(x, z);
            const h2 = getTerrainHeight(x, Math.min(height, z + sample));
            linePositions.push(x, h1 + 0.02, z, x, h2 + 0.02, Math.min(height, z + sample));
        }
    }
    for (let z = 0; z <= height; z += step) {
        for (let x = 0; x < width; x += sample) {
            const h1 = getTerrainHeight(x, z);
            const h2 = getTerrainHeight(Math.min(width, x + sample), z);
            linePositions.push(x, h1 + 0.02, z, Math.min(width, x + sample), h2 + 0.02, z);
        }
    }
    const gridGeometry = new THREE.BufferGeometry();
    gridGeometry.setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3));
    const gridMaterial = new THREE.LineBasicMaterial({ color: 0xa3b18a, transparent: true, opacity: 0.55 });

    if (threeState.gridLines) {
        threeState.scene.remove(threeState.gridLines);
        threeState.gridLines.geometry.dispose();
        threeState.gridLines.material.dispose();
        threeState.gridLines = null;
    }
}

function startThreeLoop() {
    if (threeLoopRunning) {
        return;
    }
    threeLoopRunning = true;
    let lastTime = performance.now();
    const speed = 480;

    function tick(now) {
        const dt = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;
        let moved = false;
        let padForward = 0;
        let padRight = 0;
        let padYaw = 0;
        let padTilt = 0;
        let padHeight = 0;
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        const pad = pads && pads[0];
        if (pad) {
            const deadzone = 0.2;
            const axis0 = pad.axes[0] || 0;
            const axis1 = pad.axes[1] || 0;
            const axis2 = pad.axes[2] || 0;
            const axis3 = pad.axes[3] || 0;
            const normAxis0 = Math.abs(axis0) > deadzone ? axis0 : 0;
            const normAxis1 = Math.abs(axis1) > deadzone ? axis1 : 0;
            const normAxis2 = Math.abs(axis2) > deadzone ? axis2 : 0;
            const normAxis3 = Math.abs(axis3) > deadzone ? axis3 : 0;
            padRight = normAxis0;
            padForward = normAxis1;
            padYaw = -normAxis2;
            padTilt = normAxis3;
            const l1 = pad.buttons[4] && pad.buttons[4].pressed;
            const r1 = pad.buttons[5] && pad.buttons[5].pressed;
            const l2 = pad.buttons[6] && pad.buttons[6].pressed;
            const r2 = pad.buttons[7] && pad.buttons[7].pressed;
            if (l1) padYaw += 1;
            if (r1) padYaw -= 1;
            if (l2) padHeight -= 1;
            if (r2) padHeight += 1;
        }
        let moveForward = 0;
        let moveRight = 0;
        if (keyState.ArrowUp) moveForward -= 1;
        if (keyState.ArrowDown) moveForward += 1;
        if (keyState.ArrowRight) moveRight += 1;
        if (keyState.ArrowLeft) moveRight -= 1;
        moveForward += padForward;
        moveRight += padRight;
        const sinYaw = Math.sin(yawAngle);
        const cosYaw = Math.cos(yawAngle);
        const forwardX = sinYaw;
        const forwardY = cosYaw;
        const rightX = cosYaw;
        const rightY = -sinYaw;
        if (moveForward !== 0 || moveRight !== 0) {
            const len = Math.hypot(moveForward, moveRight) || 1;
            moveForward /= len;
            moveRight /= len;
            cameraX += (forwardX * moveForward + rightX * moveRight) * speed * dt;
            cameraY += (forwardY * moveForward + rightY * moveRight) * speed * dt;
            clampCamera();
            moved = true;
        }
        if (keyState.a || keyState.A) {
            yawAngle += dt * 1.2;
            moved = true;
        }
        if (keyState.d || keyState.D) {
            yawAngle -= dt * 1.2;
            moved = true;
        }
        if (padYaw !== 0) {
            yawAngle += padYaw * dt * 1.2;
            moved = true;
        }
        if (padTilt !== 0) {
            tiltAngle = Math.max(-1.2, Math.min(0.9, tiltAngle - padTilt * dt * 1.2));
            moved = true;
        }
        if (keyState.w || keyState.W) {
            cameraHeight = Math.min(40, cameraHeight + dt * 12);
            moved = true;
        }
        if (keyState.s || keyState.S) {
            cameraHeight = Math.max(6, cameraHeight - dt * 12);
            moved = true;
        }
        if (padHeight !== 0) {
            cameraHeight = Math.min(40, Math.max(6, cameraHeight + padHeight * dt * 12));
            moved = true;
        }
        if (keyState.q || keyState.Q) {
            tiltAngle = Math.min(0.9, tiltAngle + dt * 0.8);
            moved = true;
        }
        if (keyState.e || keyState.E) {
            tiltAngle = Math.max(-1.2, tiltAngle - dt * 0.8);
            moved = true;
        }
        if (threeState && threeState.avatarParts) {
            const basePulse = now * 0.002;
            const pace = (keyState.ArrowUp || keyState.ArrowDown || keyState.ArrowLeft || keyState.ArrowRight) ? 4 : 1;
            const pulse = basePulse * pace;
            const bob = Math.max(0, Math.sin(pulse)) * (pace > 1 ? 0.03 : 0.01);
            const terrainY = getTerrainHeight(threeState.avatar.position.x, threeState.avatar.position.z);
            const baseY = terrainY + AVATAR_GROUND_OFFSET;
            threeState.avatar.userData.baseY = baseY;
            threeState.avatar.position.y = Math.max(baseY, baseY + bob);
            threeState.avatarParts.leftArm.rotation.x = Math.sin(pulse) * (pace > 1 ? 0.6 : 0.25);
            threeState.avatarParts.rightArm.rotation.x = -Math.sin(pulse) * (pace > 1 ? 0.6 : 0.25);
            threeState.avatarParts.leftLeg.rotation.x = -Math.sin(pulse) * (pace > 1 ? 0.5 : 0.2);
            threeState.avatarParts.rightLeg.rotation.x = Math.sin(pulse) * (pace > 1 ? 0.5 : 0.2);
            threeState.avatarParts.head.rotation.y = Math.sin(basePulse * 0.6) * 0.08;
            moved = true;
        }
    if (threeState && threeState.bodyMeshes.size > 0) {
        const basePulse = now * 0.002;
        const pulse = basePulse * 4;
        const swing = Math.sin(pulse);
        threeState.bodyMeshes.forEach(group => {
            const terrainY = getTerrainHeight(group.position.x, group.position.z);
            const offset = group.userData.groundOffset || 0.95;
            const baseY = terrainY + offset;
            group.userData.baseY = baseY;
            group.traverse(child => {
                if (!child.isMesh) {
                    return;
                }
                    if (child.userData.limbType === "arm") {
                        child.rotation.x = swing * 0.45;
                    }
                    if (child.userData.limbType === "leg") {
                        child.rotation.x = -swing * 0.35;
                    }
                });
                group.position.y = baseY + Math.abs(Math.sin(pulse)) * 0.05;
            });
            moved = true;
        }
        if (threeState && threeState.clouds) {
            threeState.clouds.children.forEach(cloud => {
                cloud.position.x += cloud.userData.speed * dt * 20;
                if (cloud.position.x > 140) {
                    cloud.position.x = -140;
                }
            });
            moved = true;
        }
        updateAvatarBlockTouch();
        if (moved) {
            if (threeState) {
                updateThreeCamera();
                threeState.renderer.render(threeState.scene, threeState.camera);
                draw_host_cursor();
                updateNavHud();
            } else {
                renderFrame();
            }
        }
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

function syncThreeBodies() {
    if (!threeState || !Array.isArray(bodies)) {
        return;
    }
    const used = new Set();
    bodies.forEach(body => {
        const bodyId = body.body_id != null ? body.body_id : `${body.pos_x}:${body.pos_y}`;
        let group = threeState.bodyMeshes.get(bodyId);
        if (!group) {
            const hue = (Math.abs(parseInt(bodyId, 10)) || 1) * 47 % 360;
            group = buildRandomAvatar(hue + 13, hue);
            const badge = new THREE.Mesh(
                new THREE.TorusGeometry(0.35, 0.06, 12, 24),
                new THREE.MeshStandardMaterial({
                    color: 0xfacc15,
                    emissive: 0xf59e0b,
                    emissiveIntensity: 0.6,
                    roughness: 0.35,
                    metalness: 0.3
                })
            );
            badge.rotation.x = Math.PI / 2;
            badge.position.y = 1.8;
            badge.visible = false;
            badge.userData.isBadge = true;
            group.add(badge);
            const labelSprite = createAvatarLabelSprite();
            labelSprite.userData.isLabel = true;
            labelSprite.position.set(0, 2.25, 0);
            group.add(labelSprite);
            threeState.scene.add(group);
            threeState.bodyMeshes.set(bodyId, group);
        }
        const terrainY = getTerrainHeight(body.pos_x, body.pos_y);
        const offset = group.userData.groundOffset || 0.95;
        group.position.set(body.pos_x, terrainY + offset, body.pos_y);
        group.userData.baseY = terrainY + offset;
        if (group.children) {
            const badge = group.children.find(child => child.userData && child.userData.isBadge);
            if (badge) {
                badge.visible = !!body.isTopFitness;
            }
            const labelSprite = group.children.find(child => child.userData && child.userData.isLabel);
            if (labelSprite) {
                updateAvatarLabelSprite(labelSprite, body);
            }
        }
        used.add(bodyId);
    });

    updateFollowMenu(bodies);

    Array.from(threeState.bodyMeshes.entries()).forEach(([bodyId, mesh]) => {
        if (!used.has(bodyId)) {
            threeState.scene.remove(mesh);
            mesh.traverse(child => {
                if (child.geometry) {
                    child.geometry.dispose();
                }
                if (child.material) {
                    child.material.dispose();
                }
            });
            threeState.bodyMeshes.delete(bodyId);
        }
    });
}

function renderThree() {
    if (!threeState) {
        return false;
    }
    updateThreeCamera();
    syncThreeBodies();
    threeState.renderer.render(threeState.scene, threeState.camera);
    return true;
}


// class Simultation{
//     constructor(){
//         this.networks = {}
//         this.body_id = 0;
//     }
//     generate_inputs(row, col) {
//         let inputs = {0: 0, 1:0, 2:0, 3:0,4:0,5:0,6:0,7:0}
//         for (let i = -1; i <= 1; i++) {
//             for (let j = -1; j <= 1; j++) {
//                 const r = row + i;
//                 const c = col + j;
//                 if (r >= 0 && r < gol.numRows && c >= 0 && c < gol.numCols && !(i === 0 && j === 0)) {
//                     let val = 0
//                     let idx = 0;
//                     if (i == -1 && j == 0){
//                         // up
//                         idx = 0
//                     }
//                     else if (i == -1 && j == -1){
//                         // up-left
//                         idx = 1

//                     }
//                     else if (i == -1 && j == 1){
//                         // up right
//                         idx = 2

//                     }
//                     else if (i == 0 && j == -1){
//                         //left
//                         idx = 3
//                     }
//                     else if (i == 0 && j == 1){
//                         //right
//                         idx = 4
//                     }
//                     else if (i == 1 && j == 0){
//                         //down
//                         idx = 5
//                     }
//                     else if (i == 1 && j == -1){
//                         //down-left
//                         idx = 6
//                     }
//                     else if (i == 1 && j == 1){
//                         //down-right
//                         idx = 7
//                     }
//                      val= gol.grid[r][c];
//                      inputs[idx] = val

//                 }
//             }
//         }
//         return inputs;
//     }
//     generate(pop_size){
//          for (let i=0; i<pop_size; i++){
//             let rand_x = Math.floor(Math.random() * numCols);
//             let rand_y = Math.floor(Math.random() * numRows);
//             if (gol.grid[rand_y][rand_x] == 1 || gol.grid[rand_y][rand_x] == 2){
//                 continue
//             }
//                 gol.grid[rand_y][rand_x] = 2
//                 let inputs = this.generate_inputs(rand_y, rand_x)
//                 this.networks[this.body_id] = {
//                                             'body_id': this.body_id
//                                             ,'pos_x': rand_x
//                                             ,'pos_y': rand_y
//                                             ,'inputs': inputs
//                                         }
//                 this.body_id+=1
//         }

//     }
// }
// let sim = new Simultation()

function getCursorPosition(canvas, e) {
    const pointer = getPointerPosition(e);
    mouse_x = pointer.x;
    mouse_y = pointer.y;
    const worldX = screenToWorld(mouse_x, cameraX, baseWidth, zoomScale);
    const worldY = screenToWorld(mouse_y, cameraY, baseHeight, zoomScale);
    var current_x = Math.floor(worldX / pixel_size);
    var current_y = Math.floor(worldY / pixel_size);
    console.log(current_x, current_y)
    if (ws && typeof ws.send_payload === "function") {
        ws.send_payload({"mouse_x": current_x, 'mouse_y': current_y}, "", 'tcp')
    }
    if (typeof renderFrame === "function") {
        renderFrame();
    }

    // const rect = canvas.getBoundingClientRect()
    // var x = event.clientX - rect.left
    // var y = event.clientY - rect.top
    // var current_x = Math.floor(x/pixel_size)
    // var current_y = Math.floor(y/pixel_size)
    // let active_cells = []
    // console.log(current_x, current_y)
    // for (let i=0; i<mag_view_h*10; i++){
    //         for (let j=0; j<mag_view_w*10; j++){
    //             if (gol.grid[current_y+i][current_x + j] == 2){
    //                 continue
    //             }
    //             gol.grid[current_y+i][current_x + j] =1
    //             }
    //     }
}     

function mouseMove(e){
    const pointer = getPointerPosition(e);
    mouse_x = pointer.x;
    mouse_y = pointer.y;
    var current_x = Math.floor(mouse_x / pixel_size)
    var current_y = Math.floor(mouse_y / pixel_size)

}
function draw_host_cursor() {
    const worldX = screenToWorld(mouse_x, cameraX, baseWidth, zoomScale);
    const worldY = screenToWorld(mouse_y, cameraY, baseHeight, zoomScale);
    const drawX = (Math.floor(worldX / pixel_size) * pixel_size - cameraX) * zoomScale;
    const drawY = (Math.floor(worldY / pixel_size) * pixel_size - cameraY) * zoomScale;
    const size = pixel_size * zoomScale;

    ctx.beginPath();
    ctx.lineWidth = "1";
    ctx.strokeStyle = "red";
    ctx.rect(drawX, drawY, size, size);
    ctx.stroke();
    ctx.closePath();

}

function sendmouseCords() {
    // ws.send_payload({"mouse_x": Math.floor(mouse_x / pixel_size), 'mouse_y': Math.floor(mouse_y / pixel_size)}, "", 'tcp')

}

function bodyStyleForId(bodyId) {
    const seed = Math.abs(parseInt(bodyId || 0, 10)) || 1;
    const hue = (seed * 47) % 360;
    const eyeOffset = ((seed % 7) - 3) * 0.04;
    return {
        hue,
        eyeOffset
    };
}

function seededRandom(seed) {
    let t = seed + 0x6d2b79f5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function buildRandomAvatar(seed, hue) {
    const rand = index => seededRandom(seed * 997 + index * 1013);
    const baseColor = new THREE.Color(`hsl(${hue}, 60%, 55%)`);
    const accentColor = new THREE.Color(`hsl(${(hue + 30) % 360}, 70%, 55%)`);

    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: baseColor.clone(),
        roughness: 0.55,
        metalness: 0.05
    });
    const headMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0xf1f5f9),
        roughness: 0.4,
        metalness: 0.03
    });
    const accentMaterial = new THREE.MeshStandardMaterial({
        color: accentColor.clone(),
        emissive: accentColor.clone(),
        emissiveIntensity: 0.2,
        roughness: 0.5,
        metalness: 0.05
    });

    const torsoType = rand(1) > 0.5 ? "capsule" : "box";
    const heightScale = 0.9 + rand(20) * 2.8;
    let torso;
    let torsoWidth = (0.5 + rand(2) * 0.35) * (0.8 + heightScale * 0.2);
    let torsoHeight = (0.6 + rand(3) * 0.5) * heightScale;
    let torsoDepth = (0.3 + rand(4) * 0.3) * (0.85 + heightScale * 0.15);
    if (torsoType === "capsule") {
        const radius = (0.22 + rand(5) * 0.18) * (0.85 + heightScale * 0.15);
        const length = (0.45 + rand(6) * 0.55) * heightScale;
        torsoHeight = radius * 2 + length;
        torsoWidth = radius * 2;
        torsoDepth = radius * 2;
        torso = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 12), bodyMaterial);
    } else {
        torso = new THREE.Mesh(new THREE.BoxGeometry(torsoWidth, torsoHeight, torsoDepth), bodyMaterial);
    }
    torso.position.y = 0.35 + torsoHeight * 0.5;
    torso.userData.limbType = "torso";

    const headRadius = (0.22 + rand(7) * 0.18) * (0.9 + heightScale * 0.1);
    const head = new THREE.Mesh(new THREE.SphereGeometry(headRadius, 18, 18), headMaterial);
    head.position.y = torso.position.y + torsoHeight * 0.55 + headRadius * 0.9;
    head.userData.limbType = "head";

    const armRadius = (0.08 + rand(8) * 0.06) * (0.85 + heightScale * 0.15);
    const armLength = (0.45 + rand(9) * 0.45) * heightScale;
    const armOffsetX = torsoWidth * 0.7 + armRadius * 0.6;
    const armY = torso.position.y + torsoHeight * 0.2;
    const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(armRadius, armLength, 6, 12), bodyMaterial);
    leftArm.position.set(-armOffsetX, armY, 0);
    leftArm.rotation.z = Math.PI / 12;
    leftArm.userData.limbType = "arm";
    const rightArm = leftArm.clone();
    rightArm.position.x = armOffsetX;
    rightArm.rotation.z = -Math.PI / 12;

    const legRadius = (0.1 + rand(10) * 0.08) * (0.85 + heightScale * 0.15);
    const legLength = (0.5 + rand(11) * 0.6) * heightScale;
    const legOffsetX = torsoWidth * 0.25;
    const legY = 0.2 + legLength * 0.25;
    const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(legRadius, legLength, 6, 12), bodyMaterial);
    leftLeg.position.set(-legOffsetX, legY, 0);
    leftLeg.userData.limbType = "leg";
    const rightLeg = leftLeg.clone();
    rightLeg.position.x = legOffsetX;

    const chestCore = new THREE.Mesh(new THREE.SphereGeometry((0.12 + rand(12) * 0.1) * (0.85 + heightScale * 0.15), 16, 16), accentMaterial);
    chestCore.position.y = torso.position.y;
    chestCore.userData.limbType = "core";

    const avatar = new THREE.Group();
    avatar.add(torso, head, leftArm, rightArm, leftLeg, rightLeg, chestCore);
    avatar.userData.groundOffset = legLength * 0.35 + 0.05;
    avatar.userData.parts = [leftArm, rightArm, leftLeg, rightLeg, head];
    return avatar;
}


function formatFitnessValue(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return "n/a";
    }
    return value.toFixed(2);
}

function createAvatarLabelSprite() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 96;
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2.8, 1.05, 1);
    sprite.renderOrder = 10;
    sprite.userData.canvas = canvas;
    sprite.userData.texture = texture;
    return sprite;
}

function updateAvatarLabelSprite(sprite, body) {
    const bodyId = body.body_id != null ? body.body_id : "n/a";
    const fitnessText = formatFitnessValue(body.fitness);
    const labelText = `Body ${bodyId}\nFitness ${fitnessText}`;
    if (sprite.userData.labelText === labelText) {
        return;
    }
    sprite.userData.labelText = labelText;
    const canvas = sprite.userData.canvas;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
    ctx.strokeStyle = "rgba(148, 163, 184, 0.9)";
    ctx.lineWidth = 2;
    const radius = 14;
    const x = 8;
    const y = 8;
    const w = canvas.width - 16;
    const h = canvas.height - 16;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#f8fafc";
    ctx.font = "600 20px \"Space Grotesk\", \"Segoe UI\", sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`Body ${bodyId}`, canvas.width / 2, canvas.height * 0.38);
    ctx.font = "500 18px \"Space Grotesk\", \"Segoe UI\", sans-serif";
    ctx.fillStyle = "#cbd5f5";
    ctx.fillText(`Fitness ${fitnessText}`, canvas.width / 2, canvas.height * 0.68);
    sprite.userData.texture.needsUpdate = true;
}

function renderFrame() {
 ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!threeState) {
        initThreeLayer();
    }
    const threeActive = renderThree();
    if (threeActive) {
        draw_host_cursor();
        updateNavHud();
        return;
    }
    updateFollowTargetPosition();
    ctx.save();
    ctx.scale(zoomScale, zoomScale);


    if (Array.isArray(bodies)) {
        bodies.forEach(body => {
            const baseX = body.pos_x * pixel_size + pixel_size / 2;
            const baseY = body.pos_y * pixel_size + pixel_size / 2;
            const radius = pixel_size * 3.2;
            const centerX = baseX - cameraX;
            const centerY = baseY - cameraY;
            if (!isOnScreen(centerX, centerY, radius)) {
                return;
            }
            ctx.beginPath();
            ctx.fillStyle = body.isTopFitness ? "#22d3ee" : "#60a5fa";
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.fill();
        });
    }
    ctx.restore();
    draw_host_cursor();
    updateNavHud();
}

    canvas.addEventListener('mousedown', onPointerDown);
    canvas.addEventListener("mousemove", onPointerMove, false);
    canvas.addEventListener("mouseup", onPointerUp, false);
    canvas.addEventListener("mouseleave", onPointerUp, false);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    // canvas.addEventListener("mousedown", getCursorPosition, false);

    renderFrame()

function onPointerDown(e) {
    isPanning = true;
    const pointer = getPointerPosition(e);
    panStartX = pointer.x;
    panStartY = pointer.y;
    cameraStartX = cameraX;
    cameraStartY = cameraY;
    clickStartX = pointer.x;
    clickStartY = pointer.y;
}

function onPointerMove(e) {
    mouseMove(e);
    if (!isPanning) {
        return;
    }
    const pointer = getPointerPosition(e);
    const dx = pointer.x - panStartX;
    const dy = pointer.y - panStartY;
    cameraX = cameraStartX - dx / zoomScale;
    cameraY = cameraStartY - dy / zoomScale;
    clampCamera();
    renderFrame();
}

function onPointerUp(e) {
    if (!isPanning) {
        return;
    }
    const pointer = getPointerPosition(e);
    const moved = Math.hypot(pointer.x - clickStartX, pointer.y - clickStartY);
    isPanning = false;
    if (moved < DRAG_THRESHOLD) {
        if (objectMode === "block") {
            placeBlockFromClick(e);
            return;
        }
        getCursorPosition(canvas, e);
    }
}

function onWheel(e) {
    e.preventDefault();
    const pointer = getPointerPosition(e);
    const worldX = cameraX + pointer.x / zoomScale;
    const worldY = cameraY + pointer.y / zoomScale;
    const zoomFactor = Math.exp(-e.deltaY * 0.001);
    zoomScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomScale * zoomFactor));
    cameraX = worldX - pointer.x / zoomScale;
    cameraY = worldY - pointer.y / zoomScale;
    clampCamera();
    renderFrame();
}

function createBlock(position, size = 1.2) {
    if (!threeState || !threeState.scene) {
        return;
    }
    const blockGeometry = new THREE.BoxGeometry(size, size, size);
    const blockMaterial = new THREE.MeshStandardMaterial({
        color: 0xb45309,
        roughness: 0.7,
        metalness: 0.05
    });
    const blockMesh = new THREE.Mesh(blockGeometry, blockMaterial);
    blockMesh.position.set(position.x, position.y, position.z);
    blockMesh.castShadow = false;
    blockMesh.receiveShadow = false;
    threeState.scene.add(blockMesh);
    threeState.blockMeshes.push(blockMesh);

    blockMesh.userData.size = size;
    blockMesh.userData.id = `block-${blockCounter++}`;
}

function placeBlockFromClick(e) {
    if (!threeState || !threeState.terrainMesh) {
        return;
    }
    const rect = canvas.getBoundingClientRect();
    const pointer = getPointerPosition(e);
    const ndc = new THREE.Vector2(
        (pointer.x / rect.width) * 2 - 1,
        -(pointer.y / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, threeState.camera);
    const hits = raycaster.intersectObject(threeState.terrainMesh, true);
    if (hits.length === 0) {
        return;
    }
    const hit = hits[0];
    const pos = hit.point;
    createBlock({ x: pos.x, y: pos.y + 0.6, z: pos.z });
}


document.addEventListener("keydown", (event) => {
    if (event.key in keyState) {
        keyState[event.key] = true;
        event.preventDefault();
    }
});

document.addEventListener("keyup", (event) => {
    if (event.key in keyState) {
        keyState[event.key] = false;
        event.preventDefault();
    }
});

function updateNavHud() {
    if (!navHud) {
        return;
    }
    const viewWidth = canvas.width / zoomScale;
    const viewHeight = canvas.height / zoomScale;
    const centerWorldX = cameraX + viewWidth / 2;
    const centerWorldY = cameraY + viewHeight / 2;
    const cellX = Math.floor(centerWorldX / pixel_size);
    const cellY = Math.floor(centerWorldY / pixel_size);
    navHud.textContent = `view ${cellX}, ${cellY}`;
}



updateWorldSize();
window.addEventListener("resize", () => {
    updateWorldSize();
    resizeThreeLayer();
    syncThreeGround();
    renderFrame();
});


function setupModernUI() {
    if (typeof document === "undefined") {
        return;
    }

    const root = document.documentElement;
    root.style.setProperty("--sidebar-total", "0px");

    const styleId = "neat-modern-ui";
    if (!document.getElementById(styleId)) {
        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = `
:root {
  --ui-bg-1: #0b1a2a;
  --ui-bg-2: #0f2a3d;
  --ui-accent: #38bdf8;
  --ui-accent-2: #22d3ee;
  --ui-text: #e2e8f0;
  --ui-muted: #94a3b8;
  --ui-panel: rgba(15, 23, 42, 0.78);
  --ui-border: rgba(148, 163, 184, 0.35);
  --ui-glow: rgba(56, 189, 248, 0.45);
  --ui-grid: rgba(148, 163, 184, 0.08);
}

body {
  margin: 0;
  background: radial-gradient(1200px 700px at 15% 10%, rgba(125, 211, 252, 0.18), transparent 60%),
              radial-gradient(900px 900px at 90% 20%, rgba(94, 234, 212, 0.14), transparent 55%),
              linear-gradient(160deg, var(--ui-bg-1), var(--ui-bg-2));
  font-family: "Space Grotesk", system-ui, -apple-system, sans-serif;
  color: var(--ui-text);
  overflow: hidden;
}

body::before {
  content: "";
  position: fixed;
  inset: 0;
  background-image:
    linear-gradient(0deg, rgba(148, 163, 184, 0.06), rgba(148, 163, 184, 0.06)),
    radial-gradient(circle at 20% 20%, rgba(56, 189, 248, 0.18), transparent 45%),
    radial-gradient(circle at 80% 70%, rgba(34, 211, 238, 0.16), transparent 45%);
  opacity: 0.35;
  pointer-events: none;
  z-index: 0;
}

#visualizer {
  position: fixed;
  top: 16px;
  left: 16px;
  width: calc(100% - 32px);
  height: calc(100% - 32px);
  border-radius: 18px;
  background-color: transparent;
  background-image: none;
  opacity: 0;
  box-shadow:
    0 24px 50px rgba(2, 6, 23, 0.65),
    inset 0 0 0 1px var(--ui-border);
  z-index: 3;
}

#three-layer {
  position: fixed;
  top: 16px;
  left: 16px;
  width: calc(100% - 32px);
  height: calc(100% - 32px);
  border-radius: 18px;
  overflow: hidden;
  pointer-events: none;
  box-shadow:
    0 24px 50px rgba(2, 6, 23, 0.65),
    inset 0 0 0 1px var(--ui-border);
  background: radial-gradient(1200px 700px at 15% 10%, rgba(186, 230, 253, 0.35), transparent 60%),
              radial-gradient(900px 900px at 90% 20%, rgba(153, 246, 228, 0.28), transparent 55%),
              linear-gradient(160deg, rgba(23, 37, 84, 0.95), rgba(30, 64, 175, 0.85));
  z-index: 2;
}

#three-layer canvas {
  width: 100%;
  height: 100%;
  display: block;
}

#nav-hud {
  position: fixed;
  left: 24px;
  bottom: 24px;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid var(--ui-border);
  color: var(--ui-muted);
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  z-index: 4;
}

#object-fab {
  position: fixed;
  right: 24px;
  bottom: 24px;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: none;
  background: rgba(56, 189, 248, 0.9);
  color: #0f172a;
  font-size: 22px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 16px 30px rgba(2, 6, 23, 0.35);
  z-index: 5;
}

#object-menu {
  position: fixed;
  right: 24px;
  bottom: 86px;
  min-width: 160px;
  padding: 10px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid var(--ui-border);
  color: var(--ui-text);
  display: none;
  gap: 8px;
  flex-direction: column;
  z-index: 5;
}

#object-menu button {
  background: rgba(148, 163, 184, 0.15);
  border: 1px solid rgba(148, 163, 184, 0.3);
  color: var(--ui-text);
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
  text-align: left;
}

#object-menu button.active {
  background: rgba(56, 189, 248, 0.25);
  border-color: rgba(56, 189, 248, 0.55);
  color: #e2e8f0;
}

#follow-toggle {
  position: fixed;
  right: 24px;
  top: 24px;
  border-radius: 999px;
  border: 1px solid var(--ui-border);
  background: rgba(15, 23, 42, 0.85);
  color: var(--ui-text);
  padding: 8px 14px;
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  z-index: 5;
}

#follow-menu {
  position: fixed;
  right: 24px;
  top: 66px;
  width: 240px;
  max-height: 320px;
  overflow-y: auto;
  padding: 10px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid var(--ui-border);
  display: none;
  gap: 8px;
  flex-direction: column;
  z-index: 5;
}

#follow-menu button {
  background: rgba(148, 163, 184, 0.12);
  border: 1px solid rgba(148, 163, 184, 0.25);
  color: var(--ui-text);
  border-radius: 10px;
  padding: 8px 10px;
  cursor: pointer;
  text-align: left;
  font-size: 12px;
}

#follow-menu button.active {
  background: rgba(56, 189, 248, 0.25);
  border-color: rgba(56, 189, 248, 0.55);
  color: #e2e8f0;
}

.content-wrapper,
.content {
  margin-left: 0 !important;
  width: 100% !important;
  height: 100% !important;
}

#sidebar,
.sidebar,
#footer,
.footer,
#sidebarToggleFloating {
  display: none !important;
  opacity: 0 !important;
  pointer-events: none !important;
}

#sim-hud {
  position: fixed;
  top: 28px;
  left: 28px;
  display: grid;
  gap: 6px;
  padding: 12px 16px;
  border-radius: 12px;
  background: var(--ui-panel);
  border: 1px solid var(--ui-border);
  box-shadow: 0 10px 30px rgba(2, 6, 23, 0.45);
  backdrop-filter: blur(10px);
  z-index: 3;
}

#sim-hud .title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: var(--ui-muted);
}

#sim-hud .title .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ui-accent);
  box-shadow: 0 0 12px var(--ui-glow);
}

#sim-hud .headline {
  font-size: 16px;
  font-weight: 600;
  color: var(--ui-text);
}

#sim-hud .hint {
  font-size: 12px;
  color: var(--ui-muted);
}

#sim-hint {
  position: fixed;
  right: 28px;
  bottom: 28px;
  padding: 10px 14px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid var(--ui-border);
  color: var(--ui-muted);
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  backdrop-filter: blur(10px);
  z-index: 3;
}

@media (max-width: 720px) {
  #visualizer {
    top: 10px;
    left: 10px;
    width: calc(100% - 20px);
    height: calc(100% - 20px);
    border-radius: 14px;
  }

  #three-layer {
    top: 10px;
    left: 10px;
    width: calc(100% - 20px);
    height: calc(100% - 20px);
    border-radius: 14px;
  }

  #sim-hud {
    top: 18px;
    left: 18px;
    padding: 10px 12px;
  }

  #sim-hud .headline {
    font-size: 14px;
  }

  #sim-hint {
    right: 18px;
    bottom: 18px;
    font-size: 11px;
  }
}
        `;
        document.head.appendChild(style);
    }

    const hideSelectors = [
        "#sidebar",
        ".sidebar",
        "#footer",
        ".footer",
        "#sidebarToggleFloating"
    ];
    hideSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
            el.style.display = "none";
            el.style.pointerEvents = "none";
        });
    });

    const hudId = "sim-hud";
    const existingHud = document.getElementById(hudId);
    if (existingHud) {
        existingHud.remove();
    }

    const hintId = "sim-hint";
    const existingHint = document.getElementById(hintId);
    if (existingHint) {
        existingHint.remove();
    }

    navHud = document.getElementById("nav-hud");
    if (!navHud) {
        navHud = document.createElement("div");
        navHud.id = "nav-hud";
        navHud.textContent = "view 0, 0";
        document.body.appendChild(navHud);
    }

    let fab = document.getElementById("object-fab");
    if (!fab) {
        fab = document.createElement("button");
        fab.id = "object-fab";
        fab.type = "button";
        fab.textContent = "+";
        document.body.appendChild(fab);
    }
    let menu = document.getElementById("object-menu");
    if (!menu) {
        menu = document.createElement("div");
        menu.id = "object-menu";
        const blockBtn = document.createElement("button");
        blockBtn.type = "button";
        blockBtn.textContent = "Place Block";
        blockBtn.addEventListener("click", () => {
            objectMode = objectMode === "block" ? null : "block";
            blockBtn.classList.toggle("active", objectMode === "block");
        });
        menu.appendChild(blockBtn);
        document.body.appendChild(menu);
    }
    fab.addEventListener("click", () => {
        menu.style.display = menu.style.display === "flex" ? "none" : "flex";
    });

    followToggle = document.getElementById("follow-toggle");
    if (!followToggle) {
        followToggle = document.createElement("button");
        followToggle.id = "follow-toggle";
        followToggle.type = "button";
        document.body.appendChild(followToggle);
    }
    followToggle.addEventListener("click", () => {
        if (!followMenu) {
            return;
        }
        followMenu.style.display = followMenu.style.display === "flex" ? "none" : "flex";
    });

    followMenu = document.getElementById("follow-menu");
    if (!followMenu) {
        followMenu = document.createElement("div");
        followMenu.id = "follow-menu";
        document.body.appendChild(followMenu);
    }
    updateFollowToggleLabel();

    initThreeLayer();
    window.dispatchEvent(new Event("resize"));
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupModernUI);
} else {
    setupModernUI();
}

