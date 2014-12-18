"use strict";

var FPS_ON = false;

var lofi = false;
var postprocess = true;

var canvasL = document.createElement('canvas');
canvasL.className = "fullSize";
document.getElementById('cesiumContainerLeft').appendChild(canvasL);

var canvasR = document.createElement('canvas');
canvasR.className = "fullSize";
document.getElementById('cesiumContainerRight').appendChild(canvasR);

var canvasCopy = new CanvasCopy(canvasR, false);

var ellipsoid = Cesium.Ellipsoid.WGS84;
var imageryUrl = 'lib/cesium/Source/Assets/Textures/';

function createImageryProvider() {
  if (lofi) {
    return new Cesium.TileMapServiceImageryProvider({
      url : imageryUrl + 'NaturalEarthII'
    });
  } else {
    return new Cesium.BingMapsImageryProvider({
      url : '//dev.virtualearth.net',
      mapStyle : Cesium.BingMapsStyle.AERIAL
    // mapStyle : Cesium.BingMapsStyle.AERIAL_WITH_LABELS
    });
  }
}

function createTerrainProvider() {
  if (lofi) {
    return new Cesium.EllipsoidTerrainProvider();
  } else {
    return new Cesium.CesiumTerrainProvider({
      url : '//cesiumjs.org/stk-terrain/tilesets/world/tiles'
    });
  }
}

function createScene(canvas) {
  var scene = new Cesium.Scene({canvas : canvas});
  scene.debugShowFramesPerSecond = true;

  var primitives = scene.primitives;

  var cb = new Cesium.Globe(ellipsoid);
  cb.imageryLayers.addImageryProvider(createImageryProvider());
  cb.terrainProvider = createTerrainProvider();

  scene.globe = cb;

  // Prevent right-click from opening a context menu.
  canvas.oncontextmenu = function() {
    return false;
  };

  scene.skyAtmosphere = new Cesium.SkyAtmosphere();

  var skyBoxBaseUrl = imageryUrl + 'SkyBox/tycho2t3_80';
  scene.skyBox = new Cesium.SkyBox({
    positiveX : skyBoxBaseUrl + '_px.jpg',
    negativeX : skyBoxBaseUrl + '_mx.jpg',
    positiveY : skyBoxBaseUrl + '_py.jpg',
    negativeY : skyBoxBaseUrl + '_my.jpg',
    positiveZ : skyBoxBaseUrl + '_pz.jpg',
    negativeZ : skyBoxBaseUrl + '_mz.jpg'
  });

  return scene;
}

var getCameraParams = function(camera) {
  return {
    "position" : camera.position,
    "right" : camera.right,
    "up" : camera.up,
    "direction" : camera.direction
  };
};

var setCameraParams = function(_, camera) {
  camera.position = _.position;
  camera.right = _.right;
  camera.up = _.up;
  camera.direction = _.direction;
};

var cesiumVR = new CesiumVR(100.0, run);
var vrEnabled = true;

var container = document.getElementById('container');

function run() {
  var scene = createScene(canvasL);
  var camera = scene.camera;

  var prevCameraRotation;

  var ellipsoid = Cesium.Ellipsoid.clone(Cesium.Ellipsoid.WGS84);

  var velocities = {
    forward  : 0.0,
    strafe   : 0.0,
    vertical : 0.0
  };

  var multiplier = 1.0;

  var lastTime = (new Date()).getTime();
  var currentTime = (new Date()).getTime();

  // update the camera position based on the dt (in secs) and the 2 velocities.
  var move = function(camera, dt, velocities, multiplier) {
    Cesium.Cartesian3.add(
      camera.position,
      Cesium.Cartesian3.multiplyByScalar(camera.direction, dt * velocities.forward * multiplier, new Cesium.Cartesian3()),
      camera.position);
    Cesium.Cartesian3.add(camera.position,
      Cesium.Cartesian3.multiplyByScalar(camera.right, dt * velocities.strafe * multiplier, new Cesium.Cartesian3()),
      camera.position);
    Cesium.Cartesian3.add(camera.position,
      Cesium.Cartesian3.multiplyByScalar(camera.up, dt * velocities.vertical * multiplier, new Cesium.Cartesian3()),
      camera.position);
  };

  var count = 0;
  var fps = 0;

  var tick = function() {
    // TODO: Doing this outside the vr rotation breaks mouse interaction etc
    scene.initializeFrame();

    if (vrEnabled) {
      // Take into account user head rotation
      cesiumVR.applyVRRotation(camera, CesiumVR.getCameraRotationMatrix(camera), cesiumVR.getRotation());
      var masterCam = camera.clone();

      // Render right eye
      cesiumVR.configureSlaveCamera(masterCam, camera, 'right');
      scene.render();

      canvasCopy.copy(canvasL);

      // Render left eye
      cesiumVR.configureSlaveCamera(masterCam, camera, 'left');
      scene.render();

      // Restore camera state
      cesiumVR.configureSlaveCamera(masterCam, camera);

      // Update the camera position based on the current velocity.
      currentTime = (new Date()).getTime();

      if (FPS_ON) {
        if(++count % 100 === 0){
          console.log(fps / 100.0);
          fps = 0;
        }
        fps += (1.0 / ((currentTime - lastTime) / 1000.0));      
      }

      move(camera, (currentTime - lastTime) / 1000.0, velocities, multiplier);
      lastTime = currentTime;
    } else {
      // No VR mode
      scene.render();
    }

    Cesium.requestAnimationFrame(tick);
  };

  tick();

  // Resize handler
  var onResizeScene = function(canvas, scene) {
    // Render at higher resolution so the result is still sharp
    // when magnified by the barrel distortion
    var supersample = 1.0; // Could increase this to >1 to increase VR resolution

    var width = canvas.clientWidth * supersample;
    var height = canvas.clientHeight * supersample;

    if (canvas.width === width && canvas.height === height) {
      return;
    }

    canvas.width = width;
    canvas.height = height;
  };

  var onResize = function() {
    onResizeScene(canvasL, scene);
    onResizeScene(canvasR, scene);
  };

  var velocity = 250

  // Basic WASD keys implemented w/ shift for speed up.
  var onKeyDown = function(e) {
    if (e.keyCode === 'W'.charCodeAt(0)) {
      // Move forward
      velocities.forward = velocity;
      e.preventDefault();
    }
    if (e.keyCode === 'S'.charCodeAt(0)) {
      // Move backwards
      velocities.forward = -velocity;
      e.preventDefault();
    }
    if (e.keyCode === 'D'.charCodeAt(0)) {
      // Move right
      velocities.strafe = velocity;
      e.preventDefault();
    }
    if (e.keyCode === 'A'.charCodeAt(0)) {
      // Move left
      velocities.strafe = -velocity;
      e.preventDefault();
    }
    if (e.keyCode === 'Q'.charCodeAt(0)) {
      // Move right
      velocities.vertical = velocity;
      e.preventDefault();
    }
    if (e.keyCode === 'E'.charCodeAt(0)) {
      // Move left
      velocities.vertical = -velocity;
      e.preventDefault();
    }
    if (e.keyCode === 'L'.charCodeAt(0)) {
      // Level the camera to the horizon
      cesiumVR.levelCamera(scene.camera);
    }
    // if (e.keyCode === 'C'.charCodeAt(0)) {
    //   // Alert the camera parameters.
    //   alert(JSON.stringify(getCameraParams(scene.camera)));
    // }
    if (e.keyCode === 16) { // Shift
      multiplier = 2.0;
    }
    if (e.keyCode === 13) { // Enter
      cesiumVR.goFullscreenVR(container);
    }
    if (typeof locations[e.keyCode] !== 'undefined') {
      // Go to a location and level the camera...
      setCameraParams(locations[e.keyCode], scene.camera);
    }
  };

  var onKeyUp = function(e) {
    if (e.keyCode === 'W'.charCodeAt(0) || e.keyCode === 'S'.charCodeAt(0)) {
      velocities.forward = 0;
      e.preventDefault();
    }
    if (e.keyCode === 'D'.charCodeAt(0) || e.keyCode === 'A'.charCodeAt(0)) {
      velocities.strafe = 0;
      e.preventDefault();
    }
    if (e.keyCode === 'Q'.charCodeAt(0) || e.keyCode === 'E'.charCodeAt(0)) {
      velocities.vertical = 0;
      e.preventDefault();
    }
    if (e.keyCode === 16) { // Shift
      multiplier = 1.0;
    }

  };

  window.addEventListener('resize', onResize, false);
  window.addEventListener('keydown', onKeyDown, false);
  window.addEventListener('keyup', onKeyUp, false);
  window.setTimeout(onResize, 60);
}
