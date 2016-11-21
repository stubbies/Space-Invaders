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
        light, fog, ambient,
        mouse = new THREE.Vector3(),
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
                gun.update();
                enemies.update();
                explosion.update();
                player.spaceship.updateMatrix();
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
            update: function(){

              for (var i = 0; i < explosion.meshes.length; i++) {
                  explosion.meshes[i][1].position.copy(explosion.meshes[i][0].position);
                  explosion.meshes[i][1].quaternion.copy(explosion.meshes[i][0].quaternion);
              }

              if (explosion.destroyed.length) {
                  explosion.destroyed.forEach(function(i) {
                      world.removeBody(explosion.meshes[i][0]);
                      explosion.group.remove(explosion.meshes[i][1]);
                  });
                  explosion.meshes.splice(0, 4);
                  explosion.destroyed.splice(0, 4);
              }

            },
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
            update: function(){

              for (var i = 0; i !== gun.bullets.length; i++) {
                  gun.bulletMeshes[i].position.copy(gun.bullets[i].position);
                  gun.bulletMeshes[i].quaternion.copy(gun.bullets[i].quaternion);
              }

              if (gun.destroyed.length)
                gun.destroy();

            },
            destroy: function() {
              gun.destroyed.forEach(function(bullet, index) {
                  world.removeBody(bullet[0]);
                  scene.remove(bullet[1]);
                  gun.destroyed.splice(index, 1);
              });
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
            spaceship: new THREE.Object3D(),
            spaceshipMesh: null,
            init: function() {
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

                if (opts.helpers) {

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

            },
            events: function() {
                document.addEventListener("keydown", onKeyDown, false);
                document.addEventListener("keyup", onKeyUp, false);
                document.addEventListener("mousemove", onMouseMove, false);
                document.addEventListener("mousedown", onMouseDown, false);
                //document.addEventListener("mouseup", onMouseUp, false);
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

        // Enemy space ships
        enemies = {
            bodies: [],
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
            destroyed: [],
            destroy: function() {
                enemies.destroyed.forEach(function(body, index) {
                    world.removeBody(body);
                    enemies.destroyed.splice(index, 1);
                });
            },
            update: function(){

              if(enemies.destroyed.length){
                enemies.destroy();
              }

              for (var i = 0; i !== enemies.bodies.length; i++) {
                  enemies.group.children[i].position.z += 0.5;
                  enemies.bodies[i].position.copy(enemies.group.children[i].position);
                  enemies.bodies[i].quaternion.copy(enemies.group.children[i].quaternion);
              }


            },
            create: function() {

                var zPos = 0,
                    xPos = 0,
                    distance = 160,
                    offset = (enemies.formations[enemies.formation][0].length * distance) / 2,
                    mesh,
                    body,
                    shape = new CANNON.Box(new CANNON.Vec3(20, 20, 20));

                var material = new THREE.MeshStandardMaterial({
                    color: colors.enemy.color,
                    shading: THREE.FlatShading,
                    roughness: colors.enemy.roughness,
                    metalness: colors.enemy.metalness
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

                for (var col in enemies.formations[enemies.formation]) {

                    // Set Z position
                    zPos = col * distance;
                    for (var row in enemies.formations[enemies.formation][col]) {

                        xPos = enemies.formations[enemies.formation][col][row] * distance;
                        xPos -= offset - (150 / 2);

                        body = new CANNON.Body({
                            mass: 0
                        });
                        body.addShape(shape);

                        world.add(body);

                        enemies.bodies.push(body);

                        mesh = new THREE.Mesh(player.mesh, material);
                        mesh.scale.set(18, 18, 18);
                        mesh.position.set(0, -20, 0);
                        mesh.rotation.z = -1;
                        mesh.castShadow = true;
                        mesh.position.x = xPos - 100;
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
                            ease: Sine.easeOut
                        });
                        TweenMax.to(mesh.position, 1.2, {
                            delay: Math.random(),
                            x: mesh.position.x + 50,
                            yoyo: true,
                            repeat: -1,
                            ease: Sine.easeIn
                        });

                        body.meshID = mesh.id;

                        enemies.group.add(mesh);

                        body.addEventListener("collide", _collideEvent);

                    }

                }

                scene.add(enemies.group);

            }
        },

        // Game sounds
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

        // Game level
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
                level.texture.offset.y += .02;
            }
        },

        asteroids = {
            emitters: [],
            timer: 0,
            update: function() {

                asteroids.timer += 0.03;
                //console.log(Math.sin(asteroids.timer));
                asteroids.emitters.forEach(function(emitter) {

                  for (var i = 0; i < emitter.children.length; i++) {
                      // Moving loop
                      if (emitter.children[i].position.z < emitter.boxLength) {
                          emitter.children[i].position.z += 5;
                      } else {
                          emitter.children[i].position.z -= emitter.boxLength;
                      }
                      // Wobble
                    //  emitter.children[i].position.y += Math.cos(asteroids.timer + i);
                      emitter.children[i].position.y += Math.sin(asteroids.timer + i);
                      // Rotate
                      emitter.children[i].rotation.x -= 0.02;
                      emitter.children[i].rotation.z -= 0.02;
                  }

                });
            },
            createEmitter: function(opts) {
                var parent = new THREE.Object3D(), mesh;

                for (var i = 0; i < opts.count; i++) {
                    mesh = opts.obj.mesh.clone();
                    // Initial positions
                    mesh.position.x = randomRange(0, opts.size.x);
                    mesh.position.y = randomRange(0, opts.size.y);
                    mesh.position.z = randomRange(0, opts.size.z);
                    // Sizes
                    var meshSize = randomRange(opts.obj.size[0], opts.obj.size[1]);
                    mesh.scale.set(meshSize, meshSize, meshSize);
                    parent.add(mesh);
                }

                parent.position.set(opts.pos.x, opts.pos.y, opts.pos.z);
                parent.boxLength = opts.size.z;
                parent.boxheight = opts.size.y;

                scene.add(parent);
                return parent;
            },
            init: function() {

                var material = new THREE.MeshPhongMaterial({
                    color: colors.asteroids.color,
                    shading: THREE.FlatShading,
                    emissive: colors.asteroids.emissive,
                    shininess: 0
                });

                var mesh = new THREE.Mesh(new THREE.OctahedronGeometry(15, 1), material);

                var emitter1 = asteroids.createEmitter({
                    size: { x: 100, y: 100, z: 1800 },
                    pos: { x: -450, y: 100, z: -750 },
                    count: 70,
                    obj: { mesh: mesh, size: [0.2, 1]}
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
                var gui = new dat.GUI();
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

                gui.addColor(params, 'fog_color')
                    .name('Fog Color')
                    .onChange(function(val) {
                        scene.fog.color.setHex(val);
                    });

                gui.add(params, 'fog_step').min(0).max(15).step(0.1)
                    .name('Fog Step')
                    .onChange(function(val) {
                        scene.fog.density = val;
                    });

                gui.addColor(params, 'ambient_color')
                    .name('Ambient')
                    .onChange(function(val) {
                        ambient.color.setHex(val);
                    });

                var enemy_env = gui.addFolder('Enemies');

                enemy_env.addColor(params.enemy, 'color')
                    .name('Color')
                    .onChange(function(val) {
                        if (enemies.group.children.length) {
                            enemies.group.children.forEach(function(e) {
                                e.material.color.setHex(val);
                            });
                        }
                    });

                enemy_env.add(params.enemy, 'roughness').min(0).max(1).step(0.05)
                    .name('Roughness')
                    .onChange(function(val) {
                        if (enemies.group.children.length) {
                            enemies.group.children.forEach(function(e) {
                                e.material.roughness = val;
                            });
                        }
                    });

                enemy_env.add(params.enemy, 'metalness').min(0).max(1).step(0.05)
                    .name('Metalness')
                    .onChange(function(val) {
                        if (enemies.group.children.length) {
                            enemies.group.children.forEach(function(e) {
                                e.material.metalness = val;
                            });
                        }
                    });

                var player_env = gui.addFolder('Player');
                player_env.addColor(params.player, 'color')
                    .name('Color')
                    .onChange(function(val) {
                        player.spaceshipMesh.material.color.setHex(val);
                    });

                player_env.addColor(params.player, 'emissive')
                    .name('Emissive')
                    .onChange(function(val) {
                        player.spaceshipMesh.material.emissive.setHex(val);
                    });

                var floor_env = gui.addFolder('Floor');

                floor_env.addColor(params.floor, 'emissive')
                    .name('Emissive')
                    .onChange(function(val) {
                        level.ground.material.emissive.setHex(val);
                    });

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
        scene.fog = new THREE.FogExp2(colors.fog.color, colors.fog.step);

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

        renderer.setSize(WIDTH, HEIGHT);
        camera.aspect = WIDTH / HEIGHT;
        camera.updateProjectionMatrix();

    }


    function lights() {
        // Ambient light
        ambient = new THREE.AmbientLight(colors.ambient);
        scene.add(ambient);

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
        camera.position.y = 190;
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
        mouse.z = -1;

        raycaster.setFromCamera(mouse, camera);

        var intersects = raycaster.intersectObject(level.ground, true);

        if (intersects.length > 0) {
          player.spaceship.lookAt(intersects[0].point);
        }

    }

    function onMouseDown(event) {
        player.fire();
    }

    function randomRange(min, max) {
        return Math.random() * (max - min) + min;
    }


})();
