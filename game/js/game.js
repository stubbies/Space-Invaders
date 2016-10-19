var game = (function () {

  var
  // Colors
  colors = {
    black: 0x000000,
		white: 0xffffff,
		green: 0x0fdb8c,
		cyan: 0x38FDD9,
		fog: 0xe4e4e4,
		bg: 0xe4e4e4,
		ambient: 0x808080
  },

  // ThreeJS
  camera, scene, renderer,
  mouse = new THREE.Vector2(),
  raycaster = new THREE.Raycaster(),

  WIDTH = window.innerWidth,
  HEIGHT = window.innerHeight,

  world,

  cannon = {
    timeStep: 1/60,
    body: null,
    init: function(){

      world = new CANNON.World();
      world.broadphase = new CANNON.NaiveBroadphase();
      world.gravity.set(0,-1000,0);
      world.solver.tolerance = 0.001;

      // Ground plane
      var plane = new CANNON.Plane();
      var groundBody = new CANNON.Body({ mass: 0 });
      groundBody.addShape(plane);
      groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1,0,0),-Math.PI/2);
      world.add(groundBody);

    },
    update: function(){
      world.step(cannon.timeStep);

      player.spaceship.updateMatrix();

      for(var i=0; i !== gun.bullets.length; i++){
        gun.bulletMeshes[i].position.copy(gun.bullets[i].position);
        gun.bulletMeshes[i].quaternion.copy(gun.bullets[i].quaternion);
      }

    }
  },

  rotationRadians = new THREE.Vector3(0, 0, 0),
  rotationAngleX = null,
  rotationAngleZ = null,

  gun = {
    bullets: [],
    bulletMeshes: [],
    fire: function(){

      var boxShape = new CANNON.Box(new CANNON.Vec3(4,4,4));
      var boxBody = new CANNON.Body({ mass: 1 });
      boxBody.addShape(boxShape);
      boxBody.position.copy(player.spaceship.position);

      boxBody.position.y += 50;

      var shootDirection = player.spaceship.getWorldDirection(),
      shootVelo = 1500;

      boxBody.velocity.set( shootDirection.x * shootVelo, shootDirection.y * shootVelo, shootDirection.z * shootVelo)

      world.add(boxBody);
      gun.bullets.push(boxBody);

      var material = new THREE.MeshLambertMaterial();
      var bullet = new THREE.Mesh( new THREE.BoxGeometry(8, 8, 8), material );

      bullet.castShadow = true;
      bullet.receiveShadow = true;
      bullet.position.copy(player.spaceship.position);
      bullet.quaternion.copy(player.spaceship.quaternion);

      bullet.position.y += 50;

      gun.bulletMeshes.push(bullet);
      scene.add(bullet);


    }
  },

  player = {
    controlKeys: {
      87: "forward",
      83: "backward",
      65: "left",
      68: "right"
    },
    spaceship: new THREE.Object3D(),
    fireTarget: new THREE.Object3D(),
    spaceshipRotation: new THREE.Vector3(0, 0, 0),
    create: function(){
      var spaceshipGeo = new THREE.BoxGeometry( 50, 50, 50);
      spaceshipGeo.translate(0,50,0);

      var material = new THREE.MeshLambertMaterial( {color: 0x00ff00} );
      var spaceshipMesh = new THREE.Mesh( spaceshipGeo, material );
      spaceshipMesh.castShadow = true;
      player.spaceship.add(spaceshipMesh);

      var axisHelper = new THREE.AxisHelper( 100 );
      axisHelper.position.y = 50;
      player.spaceship.add(axisHelper);
      scene.add(player.spaceship);

      var fireTargetGeo = new THREE.BoxGeometry( 20, 20, 20);
      var fireTargetMesh = new THREE.Mesh( fireTargetGeo, material );

      player.fireTarget.add(fireTargetMesh);
      scene.add(player.fireTarget);
      
      rotationRadians.copy(player.spaceship.rotation);
      
      //  Events
      document.addEventListener("keydown", onKeyDown, false);
      document.addEventListener("keyup", onKeyUp, false);
      document.addEventListener("mousemove", onMouseMove, false);
      document.addEventListener("click", onMouseClick, false);
      
    },
    fire: function(){

      gun.fire();
      
      TweenMax.to(player.spaceship.children[0].position,0.06,{z: player.spaceship.children[0].position.z - 5, onComplete: function(){
        TweenMax.to(player.spaceship.children[0].position,0.06,{z: 0});
      }});

      TweenMax.to(player.spaceship.children[0].rotation,0.06,{x: player.spaceship.children[0].rotation.x - .1, onComplete: function(){
        TweenMax.to(player.spaceship.children[0].rotation,0.06,{x: 0});
      }});
    }
  },
  
  level = {
    ground: new THREE.Object3D(),
    texture: null,
    create: function(){
      var solidGroundGeo = new THREE.PlaneGeometry( 10000, 10000, 1, 1 );
      solidGroundGeo.rotateX(-Math.PI / 2);

      level.texture = new THREE.TextureLoader().load( "assets/ground_01.png" );
      level.texture.wrapS = level.texture.wrapT = THREE.RepeatWrapping;
      level.texture.repeat.set( 70, 70 );

      var floorMat = new THREE.MeshLambertMaterial( {
        color: 0xe4e4e4,
        map: level.texture
      } );

      level.ground = new THREE.Mesh( solidGroundGeo, floorMat );
      level.ground.receiveShadow = true;
      scene.add( level.ground );
    },
    update: function(){
      level.texture.offset.y += .02;
    }
  };

  var _game = {
     init: init
  }

  return _game;

  // Methods
  function init()
  {
    scene = new THREE.Scene();

    // Fog
    scene.fog = new THREE.FogExp2(colors.fog, 5);

    lights();
    camera();

    // Define default WebGL renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMapSoft = true;
    renderer.setClearColor( colors.bg );
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize(WIDTH, HEIGHT);

    window.addEventListener('resize', handleWindowResize, false);

    //var controls = new THREE.OrbitControls( camera, renderer.domElement );

    document.body.appendChild(renderer.domElement );

    level.create();
    player.create();
    cannon.init();

    render();



  }

  function render()
  {
    level.update();
    cannon.update();
    renderer.render(scene, camera);
    requestAnimationFrame(render);
  }


  function handleWindowResize()
  {
    HEIGHT = window.innerHeight;
    WIDTH = window.innerWidth;

    camera.left = WIDTH / - 2;
	camera.right = WIDTH / 2;
	camera.top = HEIGHT / 2;
	camera.bottom = HEIGHT / - 2;

    renderer.setSize(WIDTH, HEIGHT);
    camera.aspect = WIDTH / HEIGHT;
    camera.updateProjectionMatrix();

  }


  function lights()
  {
    // Ambient light
    scene.add( new THREE.AmbientLight( colors.ambient, 0.7 ) );

    // Directional Light
    var light = new THREE.DirectionalLight(0xffffff, 1);
    light.castShadow = true;
    light.shadow.camera.near = 350;
    light.shadow.camera.far = 550;
    light.shadow.camera.left = -700;
    light.shadow.camera.right = 700;
    light.shadow.camera.top = 700;
    light.shadow.camera.bottom = -700;
    light.position.set(0, 500, 0);

    scene.add(light);

    // Hemisphere Light
    var hemiLight = new THREE.HemisphereLight(colors.bg, colors.green, 0.3);
    hemiLight.position.set(0, 0, -1);
    scene.add(hemiLight);

  }

  function camera()
  {
    camera = new THREE.OrthographicCamera( WIDTH / - 2, WIDTH / 2, HEIGHT / 2, HEIGHT / - 2, - 1000, 10000 );
    camera.position.x = 200;
    camera.position.y = 250;
    camera.position.z = 200;

    camera.lookAt(scene.position);
  }


    function onKeyUp(event)
    {
        TweenMax.to(player.spaceship.children[0].rotation,0.3,{z: 0});
    }
      
    function onKeyDown(event)
    {
        
      if(player.controlKeys[event.keyCode] == 'left'){

        TweenMax.to(player.spaceship.children[0].rotation,0.3,{z: -0.2});

        TweenMax.to(player.spaceship.position,2,{
            x: player.spaceship.position.x - 300,
            ease:Power2.easeOut,
            onComplete: function(){
             TweenMax.to(player.spaceship.children[0].rotation,0.3,{z: 0});
            }
        });
      }

      if(player.controlKeys[event.keyCode] == 'right'){
          
        TweenMax.to(player.spaceship.children[0].rotation,0.3,{z: 0.2});

        TweenMax.to(player.spaceship.position,2,{
            x: player.spaceship.position.x + 300,
            ease:Power2.easeOut,
            onComplete: function(){
              TweenMax.to(player.spaceship.children[0].rotation,0.3,{z: 0});
            }
        });
      }

      if(player.controlKeys[event.keyCode] == 'forward'){
        TweenMax.to(player.spaceship.position,2,{z: player.spaceship.position.z - 300, ease:Power2.easeOut});
      }

      if(player.controlKeys[event.keyCode] == 'backward'){
        TweenMax.to(player.spaceship.position,2,{z: player.spaceship.position.z + 300, ease:Power2.easeOut});
      }

    }
    


    function onMouseMove(event)
    {
      event.preventDefault();

      mouse.x = ( event.clientX / window.innerWidth ) * 2 - 1;
  	  mouse.y = - ( event.clientY / window.innerHeight ) * 2 + 1;

      raycaster.setFromCamera( mouse, camera );

      var intersects = raycaster.intersectObject( level.ground, true );

      if ( intersects.length > 0 ) {
        player.fireTarget.position.copy(intersects[ 0 ].point);
      }
      
      player.spaceship.lookAt(player.fireTarget.getWorldPosition());

    }

    function onMouseClick(event)
    {
      player.fire();
    }



})();
