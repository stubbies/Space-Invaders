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
            gray: 0x929292
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
                gun.destroyBullets();

                player.spaceship.updateMatrix();

                for (var i = 0; i !== gun.bullets.length; i++) {
                    gun.bulletMeshes[i].position.copy(gun.bullets[i].position);
                    gun.bulletMeshes[i].quaternion.copy(gun.bullets[i].quaternion);
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
            deadBullets: [],
            destroyBullets: function() {
                gun.deadBullets.forEach(function(bullet) {
                    // Remove Cannon body
                    world.removeBody(bullet[0]);
                    // Remove THREE mesh
                    scene.remove(bullet[1]);
                });
            },
            fire: function() {

                var body = new CANNON.Body({
                    mass: 1,
                    allowSleep: true,
                    sleepSpeedLimit: 2.1,
                    sleepTimeLimit: 1
                });

                body.addShape(gun.shape);
                body.position.copy(player.spaceship.position);
                body.position.y += 50;

                var shootDirection = player.spaceship.getWorldDirection();

                body.velocity.set(shootDirection.x * gun.velocity, shootDirection.y * gun.velocity, shootDirection.z * gun.velocity)

                world.add(body);
                gun.bullets.push(body);

                var bullet = new THREE.Mesh(gun.geo, gun.material);

                bullet.castShadow = true;
                bullet.receiveShadow = true;
                bullet.position.copy(player.spaceship.position);

                bullet.position.y += 50;

                gun.bulletMeshes.push(bullet);
                scene.add(bullet);

                // Destroy bullet when asleep
                body.addEventListener("sleep", function(event) {
                    gun.deadBullets.push([body, bullet]);
                });

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
                    color: colors.green,
                    shading: THREE.FlatShading
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

                player.fireTarget.add(fireTargetMesh);
                scene.add(player.fireTarget);

                //rotationRadians.copy(player.spaceship.rotation);

                //  Events
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
            group: new THREE.Group(),
            formations: [
                [0, 1, 2, 3],
                [0.5, 1.5, 2.5],
                [1.5]
            ],
            create: function() {

                var zPos = 0,
                    xPos = 0,
                    distance = 150,
                    offset = (enemies.formations[0].length * distance) / 2;

                var material = new THREE.MeshStandardMaterial({
                    color: colors.purple,
                    shading: THREE.FlatShading,
                    roughness: 0.28,
                    metalness: 0.16
                });

                for (var col in enemies.formations) {

                    // Set Z position
                    zPos = col * distance;
                    for (var row in enemies.formations[col]) {

                        xPos = enemies.formations[col][row] * distance;

                        var enemy = new THREE.Mesh(player.mesh, material);
                        enemy.scale.set(15, 15, 15);
                        enemy.position.set(0, 50, 0);
                        //enemy.rotation.set(Math.PI / 2, Math.PI / 1, 0);
                        enemy.castShadow = true;
                        //  enemy.material.shading = THREE.FlatShading;

                        enemy.position.x = xPos;
                        enemy.position.z = zPos;
                        enemy.name = "enemy_" + col + row;
                        enemies.group.add(enemy);

                    }

                }

                enemies.group.position.z = -400;
                enemies.group.position.x -= offset - (150 / 2);

                scene.add(enemies.group);

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
            material: new THREE.MeshStandardMaterial({
                color: colors.gray,
                shading: THREE.FlatShading,
                roughness: 0.28,
                metalness: 0.16,
                emissive: 0x9d9d9d
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


            // var block1 = new THREE.Group();
            // var block2 = new THREE.Group();
            // var block3 = new THREE.Group();
            //
            // var blockHelpers = new THREE.Group();
            //
            // var parentBlock = new THREE.Group();
            // parentBlock.position.y = 50;
            //
            // var mesh;
            //
            // var material = new THREE.MeshStandardMaterial({
            //     color: colors.purple,
            //     shading: THREE.FlatShading,
            //     roughness: 0.28,
            //     metalness: 0.16
            // });
            //
            // var scale = 1;

            // for (var a = 0; a < 10; a++) {
            //   mesh = new THREE.Mesh(new THREE.OctahedronGeometry(15, 1), material);
            //   mesh.position.set(Math.random()*200,Math.random()*200,Math.random()*200);
            //   scale = Math.random()*1.2;
            //   mesh.scale.set(scale,scale,scale);
            //
            //   TweenMax.from(mesh.position, 0, { x:0, yoyo:true, repeat:-1, ease:Linear.easeNone } );
            //   TweenMax.to(mesh.position, 1, { x:100, yoyo:true, repeat:-1, ease:Linear.easeNone } );
            //
            //   block1.add(mesh);
            // }

            // block 1
            // parentBlock.add(block1);
            // blockHelpers.add( new THREE.BoxHelper( block1 ) );


            //var h2 = new THREE.BoxHelper( block2 );
            // block2.copy(block1);
            // block2.position.z = 200;
            // parentBlock.add(block2);
            // blockHelpers.add( new THREE.BoxHelper( block2 ) );

            // block 3
            // block3.copy(block1);
            // block3.position.z = block2.position.z+200;
            // parentBlock.add(block3);
            // blockHelpers.add( new THREE.BoxHelper( block3 ) );


            //  parentBlock.position.y = 50;


            // scene.add(blockHelpers);
            // scene.add(parentBlock);

            //TweenMax.to(parentBlock.position, 4, { z:1000, ease:Linear.easeNone } );
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
        scene.add(new THREE.AmbientLight(colors.ambient, 1));

        // Directional Light
        var light = new THREE.DirectionalLight(0xffffff, 1.2);
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
        var hemiLight = new THREE.HemisphereLight(colors.bg, colors.green, 0.3);
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
