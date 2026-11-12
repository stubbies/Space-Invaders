var game = (function() {

    var
        // Statics
        colors = {
            helper: 0xff0000,
            green: 0x0fdb8c,
            fog: {
                color: 0xe4e4e4,
                step: 5
            },
            bg: 0xe4e4e4,
            purple: 0x9c27b0,
            ambient: 0x736a9d,
            player: {
                color: 0x989898,
                emissive: 0x1f1f1f
            },
            enemy: {
                color: 0x9c27b0,
                metalness: 0.16,
                roughness: 1
            },
            asteroids: {
                color: 0x686868,
                emissive: 0x2e2e2e
            },
            floor: {
                emissive: 0x55506f
            }
        },

        // Options
        opts = {
            helpers: false,
            gui: false
        },

        // ThreeJS
        camera, scene, renderer, world,
        ambient,
        mouse = new THREE.Vector3(),
        raycaster = new THREE.Raycaster(),

        WIDTH = window.innerWidth,
        HEIGHT = window.innerHeight,

        cannon = {
            timeStep: 1 / 60,
            init: function() {
                world = new CANNON.World();

                // High-performance broadphase with safe fallback
                if (typeof CANNON.SAPBroadphase !== 'undefined') {
                    world.broadphase = new CANNON.SAPBroadphase(world);
                } else {
                    world.broadphase = new CANNON.NaiveBroadphase();
                }

                world.gravity.set(0, -1000, 0);
                world.solver.tolerance = 0.001;
                world.allowSleep = true;

                // Ground plane
                var plane = new CANNON.Plane();
                var groundBody = new CANNON.Body({ mass: 0 });
                groundBody.addShape(plane);
                groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
                world.add(groundBody);
            },
            update: function() {
                world.step(cannon.timeStep);
                gun.update();
                enemies.update();
                explosion.update();
            }
        },

        explosion = {
            shape: new CANNON.Box(new CANNON.Vec3(4, 4, 4)),
            geo: new THREE.BoxGeometry(8, 8, 8),
            material: new THREE.MeshLambertMaterial({ color: colors.purple }),
            particles: [],
            group: new THREE.Object3D(),

            update: function() {
                var now = performance.now();
                for (var i = explosion.particles.length - 1; i >= 0; i--) {
                    var p = explosion.particles[i];
                    p.mesh.position.copy(p.body.position);
                    p.mesh.quaternion.copy(p.body.quaternion);

                    if (now >= p.expireAt) {
                        world.removeBody(p.body);
                        explosion.group.remove(p.mesh);
                        explosion.particles.splice(i, 1);
                    }
                }
            },

            trigger: function(position) {
                if (sounds.explosionSound && sounds.explosionSound.isPlaying) {
                    sounds.explosionSound.stop();
                }
                if (sounds.explosionSound) sounds.explosionSound.play();

                var dir = gun.shootDirection || new THREE.Vector3(0, 0, -1);
                var now = performance.now();

                for (var i = 0; i < 4; i++) {
                    var body = new CANNON.Body({ mass: 1 });
                    body.addShape(explosion.shape);
                    body.position.copy(position);
                    body.position.x -= 12 * i;
                    body.position.y -= 12 * i;
                    body.position.z -= 12 * i;
                    body.velocity.set(
                        dir.x * (Math.random() * 350),
                        Math.random() * 400,
                        dir.z * (Math.random() * 350)
                    );
                    world.add(body);

                    var mesh = new THREE.Mesh(explosion.geo, explosion.material);
                    mesh.castShadow = true;
                    mesh.position.copy(body.position);
                    explosion.group.add(mesh);

                    explosion.particles.push({
                        body: body,
                        mesh: mesh,
                        expireAt: now + 3000
                    });

                    TweenMax.to(mesh.scale, 3, { x: 0.1, y: 0.1, z: 0.1 });
                }
            }
        },

        gun = {
            shape: new CANNON.Box(new CANNON.Vec3(4, 4, 4)),
            velocity: 1500,
            geo: new THREE.BoxGeometry(6, 6, 6),
            material: new THREE.MeshLambertMaterial({ color: colors.purple }),
            bullets: [],
            shootDirection: new THREE.Vector3(0, 0, -1),

            update: function() {
                var now = performance.now();
                for (var i = gun.bullets.length - 1; i >= 0; i--) {
                    var item = gun.bullets[i];
                    item.mesh.position.copy(item.body.position);
                    item.mesh.quaternion.copy(item.body.quaternion);

                    if (item.isDead || (now - item.birth > 2500) || item.body.position.z < -3000) {
                        world.removeBody(item.body);
                        scene.remove(item.mesh);
                        gun.bullets.splice(i, 1);
                    }
                }
            },

            fire: function() {
                if (sounds.shootSound) sounds.shootSound.play();

                var body = new CANNON.Body({
                    mass: 1,
                    allowSleep: true,
                    sleepSpeedLimit: 2.1,
                    sleepTimeLimit: 1
                });

                body.addShape(gun.shape);
                body.position.copy(player.spaceship.position);
                body.position.y += 50;

                gun.shootDirection = player.spaceship.getWorldDirection(new THREE.Vector3());

                body.velocity.set(
                    gun.shootDirection.x * gun.velocity,
                    gun.shootDirection.y * gun.velocity,
                    gun.shootDirection.z * gun.velocity
                );

                world.add(body);

                var bullet = new THREE.Mesh(gun.geo, gun.material);
                bullet.castShadow = true;
                bullet.position.copy(body.position);
                scene.add(bullet);

                var bulletRecord = {
                    body: body,
                    mesh: bullet,
                    birth: performance.now(),
                    isDead: false
                };

                var onSleep = function() {
                    bulletRecord.isDead = true;
                    body.removeEventListener("sleep", onSleep);
                };
                body.addEventListener("sleep", onSleep);

                gun.bullets.push(bulletRecord);
            }
        },

        player = {
            controlKeys: {
                87: "forward",
                83: "backward",
                65: "left",
                68: "right"
            },
            mesh: null,
            spaceship: new THREE.Object3D(),
            spaceshipMesh: null,

            init: function() {
                var ObjectLoader = new THREE.ObjectLoader();
                ObjectLoader.load("assets/model.json", function(obj) {
                    var m = new THREE.Matrix4();
                    m.makeRotationY(Math.PI);
                    m.makeRotationX(Math.PI / 2);
                    obj.geometry.applyMatrix(m);
                    player.mesh = obj.geometry;
                    player.create();
                    enemies.create();
                });
            },

            create: function() {
                var material = new THREE.MeshPhongMaterial({
                    color: colors.player.color,
                    emissive: colors.player.emissive,
                    flatShading: true,
                    shininess: 0
                });

                var spaceshipMesh = new THREE.Mesh(player.mesh, material);
                spaceshipMesh.scale.set(25, 25, 25);
                spaceshipMesh.position.set(0, 50, 0);
                spaceshipMesh.castShadow = true;
                spaceshipMesh.name = "playerMesh";

                player.spaceship.add(spaceshipMesh);
                player.spaceshipMesh = spaceshipMesh;
                scene.add(player.spaceship);

                if (opts.helpers) {
                    var axisHelper = new THREE.AxisHelper(100);
                    axisHelper.position.y = 50;
                    player.spaceship.add(axisHelper);
                }

                player.spaceship.position.z = 1500;
                player.spaceship.rotation.y = Math.PI;

                TweenMax.to(player.spaceship.position, 1.2, {
                    z: 500,
                    ease: Power2.easeOut,
                    onComplete: function() {
                        player.events();
                    }
                });
            },

            events: function() {
                document.addEventListener("keydown", onKeyDown, false);
                document.addEventListener("keyup", onKeyUp, false);
                document.addEventListener("mousemove", onMouseMove, false);
                document.addEventListener("mousedown", onMouseDown, false);
            },

            fire: function() {
                gun.fire();

                TweenMax.to(player.spaceshipMesh.position, 0.06, {
                    z: -5,
                    onComplete: function() {
                        TweenMax.to(player.spaceshipMesh.position, 0.06, { z: 0 });
                    }
                });

                TweenMax.to(player.spaceshipMesh.rotation, 0.06, {
                    x: -0.15,
                    onComplete: function() {
                        TweenMax.to(player.spaceshipMesh.rotation, 0.06, { x: 0 });
                    }
                });
            }
        },

        enemies = {
            list: [],
            group: new THREE.Object3D(),
            formation: 'triangle',
            formations: {
                triangle: [
                    [0, 1, 2, 3],
                    [0.5, 1.5, 2.5],
                    [1.5]
                ],
                square: [
                    [0, 1, 2],
                    [0, 1, 2],
                    [0, 1, 2]
                ]
            },

            update: function() {
                for (var i = enemies.list.length - 1; i >= 0; i--) {
                    var item = enemies.list[i];

                    if (item.destroyed) {
                        world.removeBody(item.body);
                        TweenMax.killTweensOf(item.mesh.position);
                        TweenMax.killTweensOf(item.mesh.rotation);
                        enemies.group.remove(item.mesh);
                        enemies.list.splice(i, 1);
                        continue;
                    }

                    item.mesh.position.z += 0.5;
                    item.body.position.copy(item.mesh.position);
                    item.body.quaternion.copy(item.mesh.quaternion);
                }
            },

            create: function() {
                var distance = 160,
                    offset = (enemies.formations[enemies.formation][0].length * distance) / 2,
                    shape = new CANNON.Box(new CANNON.Vec3(20, 20, 20));

                var material = new THREE.MeshStandardMaterial({
                    color: colors.enemy.color,
                    flatShading: true,
                    roughness: colors.enemy.roughness,
                    metalness: colors.enemy.metalness
                });

                var _collideEvent = function(e) {
                    var body = e.target;
                    body.removeEventListener("collide", _collideEvent);
                    if (body.enemyRef) {
                        body.enemyRef.destroyed = true;
                        explosion.trigger(body.position);
                    }
                };

                for (var col in enemies.formations[enemies.formation]) {
                    var zPos = col * distance;
                    for (var row in enemies.formations[enemies.formation][col]) {
                        var xPos = enemies.formations[enemies.formation][col][row] * distance;
                        xPos -= offset - (150 / 2);

                        var body = new CANNON.Body({ mass: 0 });
                        body.addShape(shape);
                        world.add(body);

                        var mesh = new THREE.Mesh(player.mesh, material);
                        mesh.scale.set(18, 18, 18);
                        mesh.position.set(xPos - 100, -20, zPos - 400);
                        mesh.rotation.z = -1;
                        mesh.castShadow = true;

                        TweenMax.to(mesh.position, 0.5, { y: 50, delay: row * 0.2 });
                        TweenMax.to(mesh.rotation, 0.5, { z: 0 });
                        TweenMax.to(mesh.position, 1.2, {
                            delay: Math.random(),
                            x: mesh.position.x + 50,
                            yoyo: true,
                            repeat: -1,
                            ease: Sine.easeInOut
                        });

                        var enemyRecord = { body: body, mesh: mesh, destroyed: false };
                        body.enemyRef = enemyRecord;
                        body.addEventListener("collide", _collideEvent);

                        enemies.group.add(mesh);
                        enemies.list.push(enemyRecord);
                    }
                }

                scene.add(enemies.group);
            }
        },

        sounds = {
            shootSound: null,
            explosionSound: null,
            init: function() {
                var audioListener = new THREE.AudioListener();
                var audioLoader = new THREE.AudioLoader();

                sounds.shootSound = new THREE.Audio(audioListener);
                scene.add(sounds.shootSound);

                audioLoader.load('assets/sounds/shoot.wav', function(buffer) {
                    sounds.shootSound.setBuffer(buffer);
                    sounds.shootSound.setVolume(0.02);
                });

                sounds.explosionSound = new THREE.Audio(audioListener);
                scene.add(sounds.explosionSound);

                audioLoader.load('assets/sounds/explosion-01.wav', function(buffer) {
                    sounds.explosionSound.setBuffer(buffer);
                    sounds.explosionSound.setVolume(0.1);
                });

                var ambientSound = new THREE.Audio(audioListener);
                scene.add(ambientSound);

                audioLoader.load('assets/sounds/ambient-02.wav', function(buffer) {
                    ambientSound.setBuffer(buffer);
                    ambientSound.setVolume(0.4);
                    ambientSound.setLoop(true);
                    ambientSound.play();
                });
            }
        },

        level = {
            ground: null,
            texture: null,
            create: function() {
                var solidGroundGeo = new THREE.PlaneGeometry(10000, 10000, 1, 1);
                solidGroundGeo.rotateX(-Math.PI / 2);

                level.texture = new THREE.TextureLoader().load("assets/ground_01.png");
                level.texture.wrapS = level.texture.wrapT = THREE.RepeatWrapping;
                level.texture.repeat.set(45, 45);

                var floorMat = new THREE.MeshLambertMaterial({
                    map: level.texture,
                    emissive: colors.floor.emissive
                });

                level.ground = new THREE.Mesh(solidGroundGeo, floorMat);
                level.ground.receiveShadow = true;
                scene.add(level.ground);

                asteroids.init();
            },
            update: function() {
                level.texture.offset.y += 0.02;
            }
        },

        asteroids = {
            emitters: [],
            timer: 0,
            update: function() {
                asteroids.timer += 0.03;
                for (var e = 0; e < asteroids.emitters.length; e++) {
                    var emitter = asteroids.emitters[e];
                    var children = emitter.children;
                    var boxLength = emitter.boxLength;

                    for (var i = 0; i < children.length; i++) {
                        var c = children[i];
                        if (c.position.z < boxLength) {
                            c.position.z += 5;
                        } else {
                            c.position.z -= boxLength;
                        }
                        c.position.y = c.baseY + Math.sin(asteroids.timer + i) * 6;
                        c.rotation.x -= 0.02;
                        c.rotation.z -= 0.02;
                    }
                }
            },
            createEmitter: function(opts) {
                var parent = new THREE.Object3D();

                for (var i = 0; i < opts.count; i++) {
                    var mesh = opts.obj.mesh.clone();
                    mesh.position.x = randomRange(0, opts.size.x);
                    mesh.position.y = randomRange(0, opts.size.y);
                    mesh.position.z = randomRange(0, opts.size.z);
                    mesh.baseY = mesh.position.y;

                    var meshSize = randomRange(opts.obj.size[0], opts.obj.size[1]);
                    mesh.scale.set(meshSize, meshSize, meshSize);
                    parent.add(mesh);
                }

                parent.position.set(opts.pos.x, opts.pos.y, opts.pos.z);
                parent.boxLength = opts.size.z;
                scene.add(parent);
                return parent;
            },
            init: function() {
                var material = new THREE.MeshPhongMaterial({
                    color: colors.asteroids.color,
                    flatShading: true,
                    emissive: colors.asteroids.emissive,
                    shininess: 0
                });

                var mesh = new THREE.Mesh(new THREE.OctahedronGeometry(15, 1), material);

                var emitter1 = asteroids.createEmitter({
                    size: { x: 100, y: 100, z: 1800 },
                    pos: { x: -450, y: 100, z: -750 },
                    count: 70,
                    obj: { mesh: mesh, size: [0.2, 1] }
                });

                var emitter2 = asteroids.createEmitter({
                    size: { x: 100, y: 100, z: 2150 },
                    pos: { x: 450, y: 100, z: -1000 },
                    count: 90,
                    obj: { mesh: mesh, size: [0.2, 1] }
                });

                if (opts.helpers) {
                    scene.add(new THREE.BoxHelper(emitter1, colors.helper));
                    scene.add(new THREE.BoxHelper(emitter2, colors.helper));
                }

                asteroids.emitters.push(emitter1, emitter2);
            }
        },

        gui = {
            show: function() {
                var dGui = new dat.GUI();
                var params = {
                    fog_color: colors.fog.color,
                    fog_step: colors.fog.step,
                    ambient_color: colors.ambient,
                    enemy: {
                        color: colors.enemy.color,
                        roughness: colors.enemy.roughness,
                        metalness: colors.enemy.metalness
                    },
                    player: {
                        color: colors.player.color,
                        emissive: colors.player.emissive
                    },
                    floor: {
                        emissive: colors.floor.emissive
                    }
                };

                dGui.addColor(params, 'fog_color').name('Fog Color').onChange(function(val) {
                    scene.fog.color.setHex(val);
                });
                dGui.add(params, 'fog_step').min(0).max(15).step(0.1).name('Fog Step').onChange(function(val) {
                    scene.fog.density = val;
                });
                dGui.addColor(params, 'ambient_color').name('Ambient').onChange(function(val) {
                    ambient.color.setHex(val);
                });

                var enemy_env = dGui.addFolder('Enemies');
                enemy_env.addColor(params.enemy, 'color').name('Color').onChange(function(val) {
                    enemies.group.children.forEach(function(e) { e.material.color.setHex(val); });
                });
                enemy_env.add(params.enemy, 'roughness').min(0).max(1).step(0.05).name('Roughness').onChange(function(val) {
                    enemies.group.children.forEach(function(e) { e.material.roughness = val; });
                });
                enemy_env.add(params.enemy, 'metalness').min(0).max(1).step(0.05).name('Metalness').onChange(function(val) {
                    enemies.group.children.forEach(function(e) { e.material.metalness = val; });
                });

                var player_env = dGui.addFolder('Player');
                player_env.addColor(params.player, 'color').name('Color').onChange(function(val) {
                    if (player.spaceshipMesh) player.spaceshipMesh.material.color.setHex(val);
                });
                player_env.addColor(params.player, 'emissive').name('Emissive').onChange(function(val) {
                    if (player.spaceshipMesh) player.spaceshipMesh.material.emissive.setHex(val);
                });

                var floor_env = dGui.addFolder('Floor');
                floor_env.addColor(params.floor, 'emissive').name('Emissive').onChange(function(val) {
                    level.ground.material.emissive.setHex(val);
                });
            }
        };

    // Public API
    return {
        init: init
    };

    function init(options) {
        Object.assign(opts, options);

        scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(colors.fog.color, colors.fog.step);

        lights();
        cameraInit();

        // Optimized WebGL Renderer
        renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: "high-performance"
        });
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.setClearColor(colors.bg);

        // Cap pixel ratio to 1.5 to prevent high-DPI GPU overheating
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.setSize(WIDTH, HEIGHT);

        window.addEventListener('resize', handleWindowResize, false);
        document.body.appendChild(renderer.domElement);

        scene.add(explosion.group);

        level.create();
        player.init();
        cannon.init();
        sounds.init();

        if (opts.gui) {
            gui.show();
        }

        render();
    }

    function render() {
        level.update();
        asteroids.update();
        cannon.update();
        renderer.render(scene, camera);
        requestAnimationFrame(render);
    }

    function handleWindowResize() {
        HEIGHT = window.innerHeight;
        WIDTH = window.innerWidth;

        camera.left = WIDTH / -2;
        camera.right = WIDTH / 2;
        camera.top = HEIGHT / 2;
        camera.bottom = HEIGHT / -2;

        camera.aspect = WIDTH / HEIGHT;
        camera.updateProjectionMatrix();

        renderer.setSize(WIDTH, HEIGHT);
    }

    function lights() {
        ambient = new THREE.AmbientLight(colors.ambient);
        scene.add(ambient);

        var light = new THREE.DirectionalLight(0xffffff, 1);
        light.castShadow = true;
        light.shadow.camera.near = 250;
        light.shadow.camera.far = 1550;
        light.shadow.camera.left = -1200;
        light.shadow.camera.right = 1200;
        light.shadow.camera.top = 500;
        light.shadow.camera.bottom = -1200;

        // Clean 1024x1024 shadow resolution (saves huge GPU overhead)
        light.shadow.mapSize.width = 1024;
        light.shadow.mapSize.height = 1024;
        light.shadow.bias = -0.0005;

        light.position.set(-400, 800, 0);
        light.target.position.set(500, 0, -100);
        light.target.updateMatrixWorld();

        if (opts.helpers) {
            scene.add(new THREE.CameraHelper(light.shadow.camera));
            scene.add(new THREE.DirectionalLightHelper(light, 50));
        }

        scene.add(light);

        var hemiLight = new THREE.HemisphereLight(colors.bg, colors.green, 0.2);
        hemiLight.position.set(0, 0, -1);
        scene.add(hemiLight);
    }

    function cameraInit() {
        camera = new THREE.OrthographicCamera(WIDTH / -2, WIDTH / 2, HEIGHT / 2, HEIGHT / -2, -1000, 10000);
        camera.position.set(200, 190, 200);
        camera.lookAt(scene.position);
    }

    function onKeyUp(event) {
        if (player.spaceshipMesh) {
            TweenMax.to(player.spaceshipMesh.rotation, 0.3, { z: 0 });
        }
    }

    function onKeyDown(event) {
        if (!player.spaceshipMesh) return;

        var key = player.controlKeys[event.keyCode];
        if (key === 'left') {
            TweenMax.to(player.spaceshipMesh.rotation, 0.3, { z: -0.4 });
            TweenMax.to(player.spaceship.position, 2, {
                x: player.spaceship.position.x - 300,
                ease: Power2.easeOut,
                onComplete: function() {
                    TweenMax.to(player.spaceshipMesh.rotation, 0.3, { z: 0 });
                }
            });
        }

        if (key === 'right') {
            TweenMax.to(player.spaceshipMesh.rotation, 0.3, { z: 0.4 });
            TweenMax.to(player.spaceship.position, 2, {
                x: player.spaceship.position.x + 300,
                ease: Power2.easeOut,
                onComplete: function() {
                    TweenMax.to(player.spaceshipMesh.rotation, 0.3, { z: 0 });
                }
            });
        }

        if (key === 'forward') {
            TweenMax.to(player.spaceship.position, 2, {
                z: player.spaceship.position.z - 300,
                ease: Power2.easeOut
            });
        }

        if (key === 'backward') {
            TweenMax.to(player.spaceship.position, 2, {
                z: player.spaceship.position.z + 300,
                ease: Power2.easeOut
            });
        }
    }

    // Fully working mouse pointing via 3D point vector
    function onMouseMove(event) {
        event.preventDefault();

        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        mouse.z = -1;

        raycaster.setFromCamera(mouse, camera);

        if (level.ground) {
            var intersects = raycaster.intersectObject(level.ground, true);
            if (intersects.length > 0) {
                player.spaceship.lookAt(intersects[0].point);
            }
        }
    }

    function onMouseDown(event) {
        player.fire();
    }

    function randomRange(min, max) {
        return Math.random() * (max - min) + min;
    }

})();
