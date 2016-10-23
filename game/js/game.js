var game = (function() {

    var
        colors = {
            black: 0x000000,
            white: 0xffffff,
            green: 0x0fdb8c,
            cyan: 0x38FDD9,
            fog: 0xe4e4e4,
            bg: 0xe4e4e4,
            purple: 0x9c27b0,
            ambient: 0x808080,
            gray: 0x8c8c8c,
            player: {
                color: 0x989898,
                emissive: 0x1f1f1f
            },
            asteroids: {
                color: 0x686868,
                emissive: 0x2e2e2e
            }
        },

        opts = {
            helpers: false
        },

        // ThreeJS
        camera, scene, renderer, world,
        mouse = new THREE.Vector2(),
        raycaster = new THREE.Raycaster(),

        WIDTH = window.innerWidth,
        HEIGHT = window.innerHeight,

        cannon = {
            timeStep: 1 / 60,
            body: null,
            init: function() {

                world = new CANNON.World();
                world.broadphase = new CANNON.NaiveBroadphase();
                world.gravity.set(0, -1000, 0);
                world.solver.tolerance = 0.001;
                world.allowSleep = true;

                // Ground plane
                var plane = new CANNON.Plane();
                var groundBody = new CANNON.Body({
                    mass: 0
                });
                groundBody.addShape(plane);
                groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
                world.add(groundBody);

            },
            update: function() {
                world.step(cannon.timeStep);
                gun.destroy();
                enemies.destroy();
                explosion.destroy();

                player.spaceship.updateMatrix();

                // update bullet positions
                for (var i = 0; i !== gun.bullets.length; i++) {
                    gun.bulletMeshes[i].position.copy(gun.bullets[i].position);
                    gun.bulletMeshes[i].quaternion.copy(gun.bullets[i].quaternion);
                }

                // update enemy positions
                for (var i = 0; i !== enemies.bodies.length; i++) {
                    enemies.group.children[i].position.z += 0.5;
                    enemies.bodies[i].position.copy(enemies.group.children[i].position);
                    enemies.bodies[i].quaternion.copy(enemies.group.children[i].quaternion);
                }

                // Update explosions
                for (var i = 0; i < explosion.meshes.length; i++) {
                    explosion.meshes[i][1].position.copy(explosion.meshes[i][0].position);
                    explosion.meshes[i][1].quaternion.copy(explosion.meshes[i][0].quaternion);
                }

            }
        },

        explosion = {
            shape: new CANNON.Box(new CANNON.Vec3(4, 4, 4)),
            geo: new THREE.BoxGeometry(8, 8, 8),
            material: new THREE.MeshLambertMaterial({
                color: colors.purple
            }),
            meshes: [],
            destroyed: [],
            group: new THREE.Object3D(),
            trigger: function(position) {

                sounds.explosionSound.play();

                var body, mesh;

                for (var i = 0; i < 4; i++) {


                    body = new CANNON.Body({
                        mass: 1
                    });

                    body.addShape(explosion.shape);
                    body.position.copy(position);
                    body.position.x -= 12 * i;
                    body.position.y -= 12 * i;
                    body.position.z -= 12 * i;
                    body.velocity.set(gun.shootDirection.x * (Math.random() * 350), Math.random() * 400, gun.shootDirection.z * (Math.random() * 350));
                    world.add(body);


                    mesh = new THREE.Mesh(explosion.geo, explosion.material);
                    mesh.castShadow = true;
                    mesh.position.copy(body.position);
                    explosion.group.add(mesh);
                    explosion.meshes.push([body, mesh]);

                    TweenMax.to(mesh.scale, 3, {
                        x: 0.1,
                        y: 0.1,
                        z: 0.1
                    });

                }

                var _destroy = setTimeout(function() {
                    explosion.destroyed = [0, 1, 2, 3];
                    clearTimeout(_destroy);
                }, 3000);

                scene.add(explosion.group);

            },
            destroy: function() {
                if (explosion.destroyed.length) {
                    explosion.destroyed.forEach(function(i) {
                        world.removeBody(explosion.meshes[i][0]);
                        explosion.group.remove(explosion.meshes[i][1]);
                    });
                    explosion.meshes.splice(0, 4);
                    explosion.destroyed.splice(0, 4);
                }
            }
        },

        gun = {
            shape: new CANNON.Box(new CANNON.Vec3(4, 4, 4)),
            velocity: 1500,
            geo: new THREE.BoxGeometry(6, 6, 6),
            material: new THREE.MeshLambertMaterial({
                color: colors.purple
            }),
            bullets: [],
            bulletMeshes: [],
            destroyed: [],
            shootDirection: null,
            destroy: function() {

                if (gun.destroyed.length) {
                    gun.destroyed.forEach(function(bullet, index) {
                        world.removeBody(bullet[0]);
                        scene.remove(bullet[1]);
                        gun.destroyed.splice(index, 1);
                    });
                }

            },
            fire: function() {

                sounds.shootSound.play();

                var body = new CANNON.Body({
                    mass: 1,
                    allowSleep: true,
                    sleepSpeedLimit: 2.1,
                    sleepTimeLimit: 1
                });

                body.addShape(gun.shape);
                body.position.copy(player.spaceship.position);
                body.position.y += 50;

                gun.shootDirection = player.spaceship.getWorldDirection();

                body.velocity.set(gun.shootDirection.x * gun.velocity, gun.shootDirection.y * gun.velocity, gun.shootDirection.z * gun.velocity)

                world.add(body);
                gun.bullets.push(body);

                var bullet = new THREE.Mesh(gun.geo, gun.material);

                bullet.castShadow = true;
                bullet.receiveShadow = true;
                bullet.position.copy(player.spaceship.position);

                bullet.position.y += 50;

                gun.bulletMeshes.push(bullet);
                scene.add(bullet);

                var _sleepEvent = function(e) {
                    gun.destroyed.push([body, bullet]);
                    body.removeEventListener("sleep", _sleepEvent);
                }

                body.addEventListener("sleep", _sleepEvent);

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
            physMesh: new THREE.BoxGeometry(40, 40, 40),
            spaceship: new THREE.Object3D(),
            spaceshipMesh: null,
            fireTarget: new THREE.Object3D(),
            spaceshipRotation: new THREE.Vector3(0, 0, 0),
            loadObj: function() {
                // Create player on json load
                var ObjectLoader = new THREE.ObjectLoader();
                ObjectLoader.load("assets/model.json", function(obj) {
                    var m = new THREE.Matrix4();
                    m.makeRotationY(Math.PI / 1);
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
                    shading: THREE.FlatShading,
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

                var fireTargetGeo = new THREE.BoxGeometry(20, 20, 20);
                var fireTargetMesh = new THREE.Mesh(fireTargetGeo);
                fireTargetMesh.visible = false;

                if (opts.helpers) {
                    fireTargetMesh.visible = true;

                    var axisHelper = new THREE.AxisHelper(100);
                    axisHelper.position.y = 50;
                    player.spaceship.add(axisHelper);
                }

                player.spaceship.position.z = 1500;
                player.spaceship.rotation.y = Math.PI / 1;

                TweenMax.to(player.spaceship.position, 1.2, {
                    z: 500,
                    ease: Power2.easeOut,
                    onComplete: function() {
                        player.events();
                    }
                });

                player.fireTarget.add(fireTargetMesh);
                scene.add(player.fireTarget);

            },
            events: function() {
                document.addEventListener("keydown", onKeyDown, false);
                document.addEventListener("keyup", onKeyUp, false);
                document.addEventListener("mousemove", onMouseMove, false);
                document.addEventListener("click", onMouseClick, false);
            },
            fire: function() {

                gun.fire();

                TweenMax.to(player.spaceshipMesh.position, 0.06, {
                    z: player.spaceshipMesh.position.z - 5,
                    onComplete: function() {
                        TweenMax.to(player.spaceshipMesh.position, 0.06, {
                            z: 0
                        });
                    }
                });

                TweenMax.to(player.spaceshipMesh.rotation, 0.06, {
                    x: player.spaceshipMesh.rotation.x - .15,
                    onComplete: function() {
                        TweenMax.to(player.spaceshipMesh.rotation, 0.06, {
                            x: player.spaceshipMesh.rotation.x + .15
                        });
                    }
                });
            }
        },

        enemies = {
            bodies: [],
            group: new THREE.Object3D(),
            formations: [
                [0, 1, 2, 3],
                [0.5, 1.5, 2.5],
                [1.5]
            ],
            destroyed: [],
            destroy: function() {
                if (enemies.destroyed.length) {
                    enemies.destroyed.forEach(function(body, index) {
                        world.removeBody(body);
                        enemies.destroyed.splice(index, 1);
                    });
                }
            },
            create: function() {

                var zPos = 0,
                    xPos = 0,
                    distance = 150,
                    offset = (enemies.formations[0].length * distance) / 2,
                    mesh,
                    body,
                    shape = new CANNON.Box(new CANNON.Vec3(20, 20, 20));

                var material = new THREE.MeshStandardMaterial({
                    color: colors.purple,
                    shading: THREE.FlatShading,
                    roughness: 1,
                    metalness: 0.16
                });

                var killedMesh = null;

                var _collideEvent = function(e) {
                    e.target.removeEventListener("collide", _collideEvent);
                    enemies.bodies.splice(e.target.index - 1, 1);
                    killedMesh = enemies.group.getObjectById(e.target.meshID);
                    TweenMax.killTweensOf(killedMesh.position);
                    enemies.group.remove(killedMesh);
                    enemies.destroyed.push(e.target);
                    explosion.trigger(e.target.position);

                }

                var _fireEvent = function() {

                }

                for (var col in enemies.formations) {

                    // Set Z position
                    zPos = col * distance;
                    for (var row in enemies.formations[col]) {

                        xPos = enemies.formations[col][row] * distance;
                        xPos -= offset - (150 / 2);

                        body = new CANNON.Body({
                            mass: 0
                        });
                        body.addShape(shape);

                        world.add(body);

                        enemies.bodies.push(body);

                        mesh = new THREE.Mesh(player.mesh, material);
                        mesh.scale.set(15, 15, 15);
                        mesh.position.set(0, -20, 0);
                        mesh.rotation.z = -1;
                        mesh.castShadow = true;
                        mesh.position.x = xPos;
                        mesh.position.z = zPos - 400;

                        TweenMax.to(mesh.position, 0.5, {
                            y: 50,
                            delay: row * 0.2
                        });
                        TweenMax.to(mesh.rotation, 0.5, {
                            z: 0
                        });

                        TweenMax.from(mesh.position, 0, {
                            x: mesh.position.x,
                            yoyo: true,
                            repeat: -1,
                            ease: Linear.easeNone
                        });
                        TweenMax.to(mesh.position, 2, {
                            x: mesh.position.x + 170,
                            yoyo: true,
                            repeat: -1,
                            ease: Linear.easeNone
                        });

                        body.meshID = mesh.id;

                        enemies.group.add(mesh);

                        body.addEventListener("collide", _collideEvent);

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
                    ambientSound.setLoop(99999);
                    ambientSound.play();
                });

            }
        },

        level = {
            ground: new THREE.Object3D(),
            texture: null,
            create: function() {

                var solidGroundGeo = new THREE.PlaneGeometry(10000, 10000, 1, 1);
                solidGroundGeo.rotateX(-Math.PI / 2);

                level.texture = new THREE.TextureLoader().load("assets/ground_01.png");
                level.texture.wrapS = level.texture.wrapT = THREE.RepeatWrapping;
                level.texture.repeat.set(45, 45);

                var floorMat = new THREE.MeshLambertMaterial({
                    color: 0xe4e4e4,
                    map: level.texture,
                    emissive: 0x9d9d9d
                });

                level.ground = new THREE.Mesh(solidGroundGeo, floorMat);
                level.ground.receiveShadow = true;
                scene.add(level.ground);

                asteroids.init();

            },
            update: function() {
                level.texture.offset.y += .02;
            }
        },

        asteroids = {
            material: new THREE.MeshPhongMaterial({
                color: colors.asteroids.color,
                shading: THREE.FlatShading,
                emissive: colors.asteroids.emissive,
                shininess: 0
            }),
            columns: new THREE.Group(),

            update: function() {},

            init: function() {

                asteroids.createBlock({
                    x: 700,
                    y: 150,
                    z: -1100
                });
                asteroids.createBlock({
                    x: -700,
                    y: 150,
                    z: -1100
                });

                scene.add(asteroids.columns);

            },

            createBlock: function(pos) {

                var
                    column = new THREE.Group(),
                    scale = 1,
                    mesh,
                    block;

                for (var i = 1; i < 4; i++) {

                    block = new THREE.Group();

                    for (var a = 0; a < 20; a++) {
                        mesh = new THREE.Mesh(new THREE.OctahedronGeometry(15, 1), asteroids.material);
                        mesh.position.set(Math.random() * 300, Math.random() * 100, Math.random() * 500);
                        scale = Math.random() * 1.5;
                        mesh.scale.set(scale, scale, scale);

                        TweenMax.from(mesh.position, 0, {
                            x: 0,
                            yoyo: true,
                            repeat: -1,
                            ease: Linear.easeNone
                        });
                        TweenMax.to(mesh.position, Math.floor((Math.random() * 12) + 9), {
                            x: Math.random() * 70,
                            yoyo: true,
                            repeat: -1,
                            ease: Linear.easeNone
                        });

                        block.add(mesh);
                    }

                    block.position.z += i * 500;
                    column.add(block);
                }

                column.position.set(pos.x, pos.y, pos.z);
                asteroids.columns.add(column);

            }

        };

    var _game = {
        init: init
    }

    return _game;


    // Methods
    function init(options) {

        Object.assign(opts, options);

        scene = new THREE.Scene();

        // Fog
        scene.fog = new THREE.FogExp2(colors.fog, 5);

        lights();
        camera();

        // Define default WebGL renderer
        renderer = new THREE.WebGLRenderer({
            antialias: true
        });
        renderer.shadowMap.enabled = true;
        renderer.shadowMapSoft = true;
        renderer.setClearColor(colors.bg);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(WIDTH, HEIGHT);

        window.addEventListener('resize', handleWindowResize, false);

        document.body.appendChild(renderer.domElement);

        level.create();
        player.loadObj();
        cannon.init();
        sounds.init();

        render();

    }

    function render() {
        level.update();
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

        renderer.setSize(WIDTH, HEIGHT);
        camera.aspect = WIDTH / HEIGHT;
        camera.updateProjectionMatrix();

    }


    function lights() {
        // Ambient light
        scene.add(new THREE.AmbientLight(colors.ambient));

        // Directional Light
        var light = new THREE.DirectionalLight(0xffffff, 1);
        light.castShadow = true;
        light.shadow.radius = 0.5;
        light.shadow.camera.near = 250;
        light.shadow.camera.far = 1550;
        light.shadow.camera.left = -1200;
        light.shadow.camera.right = 1200;
        light.shadow.camera.top = 500;
        light.shadow.camera.bottom = -1200;

        light.shadow.mapSize.width = 2024;
        light.shadow.mapSize.height = 2024;

        light.position.set(-400, 800, 0);
        light.target.position.set(500, 0, -100);
        light.target.updateMatrixWorld();


        if (opts.helpers) {
            var lightShadowHelper = new THREE.CameraHelper(light.shadow.camera);
            scene.add(lightShadowHelper);

            var dirHelper = new THREE.DirectionalLightHelper(light, 50);
            scene.add(dirHelper);
        }

        scene.add(light);

        // Hemisphere Light
        var hemiLight = new THREE.HemisphereLight(colors.bg, colors.green, 0.2);
        hemiLight.position.set(0, 0, -1);
        scene.add(hemiLight);

    }

    function camera() {
        camera = new THREE.OrthographicCamera(WIDTH / -2, WIDTH / 2, HEIGHT / 2, HEIGHT / -2, -1000, 10000);
        camera.position.x = 200;
        camera.position.y = 250;
        camera.position.z = 200;
        camera.lookAt(scene.position);
    }


    function onKeyUp(event) {
        TweenMax.to(player.spaceshipMesh.rotation, 0.3, {
            z: 0
        });
    }

    function onKeyDown(event) {

        if (player.controlKeys[event.keyCode] == 'left') {
            TweenMax.to(player.spaceshipMesh.rotation, 0.3, {
                z: -.4
            });
            TweenMax.to(player.spaceship.position, 2, {
                x: player.spaceship.position.x - 300,
                ease: Power2.easeOut,
                onComplete: function() {
                    TweenMax.to(player.spaceshipMesh.rotation, 0.3, {
                        z: 0
                    });
                }
            });
        }

        if (player.controlKeys[event.keyCode] == 'right') {
            TweenMax.to(player.spaceshipMesh.rotation, 0.3, {
                z: +.4
            });
            TweenMax.to(player.spaceship.position, 2, {
                x: player.spaceship.position.x + 300,
                ease: Power2.easeOut,
                onComplete: function() {
                    TweenMax.to(player.spaceshipMesh.rotation, 0.3, {
                        z: 0
                    });
                }
            });
        }

        if (player.controlKeys[event.keyCode] == 'forward') {
            TweenMax.to(player.spaceship.position, 2, {
                z: player.spaceship.position.z - 300,
                ease: Power2.easeOut
            });
        }

        if (player.controlKeys[event.keyCode] == 'backward') {
            TweenMax.to(player.spaceship.position, 2, {
                z: player.spaceship.position.z + 300,
                ease: Power2.easeOut
            });
        }

    }

    function onMouseMove(event) {
        event.preventDefault();

        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);

        var intersects = raycaster.intersectObject(level.ground, true);

        if (intersects.length > 0) {
            player.fireTarget.position.copy(intersects[0].point);
        }

        player.spaceship.lookAt(player.fireTarget.getWorldPosition());

    }

    function onMouseClick(event) {
        player.fire();
    }



})();
