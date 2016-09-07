'use strict';

function detectObjectDifferences(a,b){
    // Returns keys that appear in the difference a - b
    // http://stackoverflow.com/a/31686152/2747370
    var diffKeys = _.reduce(a, function(result, value, key) {
        return _.isEqual(value, b[key]) ? result : result.concat(key);
    }, []);
    return diffKeys
}

function isPureObject(arg){
    // Test if something is an object. 
    // OK, [1,2,3] is an object in JS. I mean test if something is an object like {a:1,b:[1,2,3],c:{aa:5}}.
    return arg !== null && typeof arg === 'object' && !Array.isArray(arg)
}

function deepObjectDiff(a, b){
    var diff = {}
    var keys = detectObjectDifferences(a,b);
    for (var j=0; j < keys.length; j++){
        var key = keys[j];
        var aValue = a[key];
        var bValue = b[key];
        if ( isPureObject(aValue) && isPureObject(bValue) ){
            diff[key] = deepObjectDiff(aValue, bValue);
        }
        else {
            diff[key] = aValue;
        }
    }
    return diff
}

function getQueryString() {
    // modified from http://stackoverflow.com/a/979995/2747370
    var query_string = {};
    var query = window.location.search.substring(1);
    if (query === ""){
        return query_string
    }
    var vars = query.split("&");
    for (var i=0;i<vars.length;i++) {
        var pair = vars[i].split("=");
        // If first entry with this name
        if (typeof query_string[pair[0]] === "undefined") {
            query_string[pair[0]] = decodeURIComponent(pair[1]);
            // If second entry with this name
        } else if (typeof query_string[pair[0]] === "string") {
            var arr = [ query_string[pair[0]],decodeURIComponent(pair[1]) ];
            query_string[pair[0]] = arr;
            // If third or later entry with this name
        } else {
            query_string[pair[0]].push(decodeURIComponent(pair[1]));
        }
    }
    return query_string;
}

function defaultVal(variable, defaultValue) {
    return typeof variable !== 'undefined' ? variable : defaultValue;
}

var MathBoxDemo = function(settings){
    if (typeof settings === 'string'){
        settings = this.decodeSettings64(settings);
    }
    this.swizzleOrder = settings.twoDimensional ? "xyz" : "yzx";
    settings = this.sanitizeSettings(settings);
    this.settings = settings;
    this.functions = {};
    this.animatedSliders = {};
    
    this.mathbox = this.initializeMathBox();
    this.scene = this.setupScene();
    
    this.drawAxes();
    this.drawGrids();
    
    this.redrawScene();
    this.makeGui();
    
    this.appendSaveUrlModal();

}

MathBoxDemo.prototype.sanitizeSettings = function(settings){
    this.defaultSettings = {
        containerId: null,
        frozen: Boolean(settings.twoDimensional),
        zoomEnabled: !settings.twoDimensional,
        twoDimensional:false,
        range: {
            xMin: settings.twoDimensional ? -10 : -5,
            xMax: settings.twoDimensional ? +10 : +5,
            yMin: -5,
            yMax: +5,
            zMin: -5,
            zMax: +5
        },
        scale: settings.twoDimensional ? [1,0.5,0.5] : [1, 1, 0.5],
        camera: {
            position: settings.twoDimensional ? [0,0,1.5] : [-0.75,-1.5,0.25],
        },
        grids: {
            xy: true,
            xz: false,
            yz: false
        },
        axes: {
            'x': genDefaultAxisSettings.call(this,'x', 'x'),
            'y': genDefaultAxisSettings.call(this,'y', 'y'),
            'z': genDefaultAxisSettings.call(this,'z', 'z'),
        }
    }
    
    settings = _.merge({}, this.defaultSettings, settings);

    function genDefaultAxisSettings(axisId, axisLabel) {
        // swizzle: user ---> mathbox
        // double swizzle: mathbox ---> user
        var mathboxAxes = this.swizzle(this.swizzle({x:'x', y:'y', z:'z'}))
        
        var tickLabelOffset = undefined;
        if (axisId === 'y' && settings.twoDimensional){
            tickLabelOffset = [20, 0, 0];
        }
        if (axisId === 'z') {
            tickLabelOffset = [20,0,0];
        }
        
        var defaultAxisSettings = {
            axisLabel: axisLabel,
            labelOffset: [0,25,0],
            axis: {width:2, axis: mathboxAxes[axisId]},
            scale: {divide:10, nice:true, zero:false, axis: mathboxAxes[axisId]},
            ticks: {width:2},
            ticksFormat: {digits:2},
            ticksLabel: {offset:tickLabelOffset}
        };
        
        return defaultAxisSettings
    }

    function setDefaultFocus(){
        if(settings.focus === undefined){
            var cameraVector3 = new THREE.Vector3(settings.camera.position[0], settings.camera.position[1], settings.camera.position[2])
            settings.focus = cameraVector3.length()
        }
    }
    
    setDefaultFocus();
    
    return settings
}

MathBoxDemo.prototype.swizzle = function(arg, swizzleOrder){
    // similar to mathbox swizzle operator, but for regular arrays and objects.
    // Example: swizzle([1,2,3], 'zyx') = [3,2,1]
    swizzleOrder = defaultVal(swizzleOrder, this.swizzleOrder);
    if (Array.isArray(arg)){
        return swizzleArray(arg, swizzleOrder)
    }
    else {
        return swizzleObject(arg, swizzleOrder)
    }
    function swizzleArray(array, swizzleOrder){
        var keys = {'x':0, 'y': 1, 'z': 2, 'w':3}
        return swizzleOrder.split('').map(function(elem){return array[keys[elem]] })
    }
    function swizzleObject(object, swizzleOrder){
        var newObject = {};
        var oldKeys = ['x','y','z','w'];
        var newKeys = swizzleOrder.split('');
        for (var j=0; j < newKeys.length; j++){
            newObject[ oldKeys[j] ] = object[ newKeys[j] ];
        }
        return newObject
    }
}

MathBoxDemo.prototype.initializeMathBox = function(){
    settings = this.settings
    
    //Add a container for mathbox
    if (settings.containerId === null){
        settings.containerId = _.uniqueId();
        this.container = $("<div class='mathbox-container'></div>");
        this.container.attr('id',settings.containerId);
        $('body').append(this.container);
    } else {
        this.container = $("#"+settings.containerId)
        this.container.addClass('mathbox-container');
    }
    if (settings.frozen){
        this.container.addClass('frozen')
    }
    
    var plugins = ['core', 'cursor','controls'];
    var controls = {klass:THREE.OrbitControls};
    var mathbox = mathBox({
        plugins: plugins,
        controls: controls,
        element: this.container[0]
    });
    
    // setup camera
    mathbox.camera({
        proxy: true,
        position: this.settings.fromURL ? settings.camera.position : this.swizzle(settings.camera.position),
    });
    mathbox.three.renderer.setClearColor(new THREE.Color(0xFFFFFF), 1.0);
    
    
    if (!settings.zoomEnabled){
        mathbox.three.controls.noZoom=true;
    }
    
    return mathbox;
}

MathBoxDemo.prototype.setupScene = function(){
    var settings = this.settings,
        range = this.settings.range;
    
    var scene = this.mathbox
        .set({
            focus: this.settings.focus,
        })
        .cartesian({
            // range: set during redrawScene
            scale: this.swizzle(this.settings.scale),
        });
    return scene
}

MathBoxDemo.prototype.drawAxes = function(){
    var axes = this.swizzle(this.settings.axes)
    
    var axesGroup = this.scene.group().set('classes', ['axes-group']);
    drawSingleAxis('x');
    drawSingleAxis('y');
    if (!this.settings.twoDimensional){
        drawSingleAxis('z');
    }
    
    function drawSingleAxis(axisId){
        var axisSettings = axes[axisId];
               
        axesGroup
            .group()
                .set('id','axis-' + axisId)
                .set('classes',['axis'])
                .axis(axisSettings.axis)
                .scale(axisSettings.scale)
                .ticks(axisSettings.ticks)
                .format(axisSettings.ticksFormat)
                .label(axisSettings.ticksLabel)
            .end();
    }

}

MathBoxDemo.prototype.drawAxesLabels = function(){
    // This is separate from drawAxes because end labels need to be redrawn when graph window range is updated.
    var axes = this.swizzle(this.settings.axes);
    var scene = this.scene;
   
    drawAxisLabel('x');
    drawAxisLabel('y');
    if (!this.settings.twoDimensional){
        drawAxisLabel('z');
    }
    
    function drawAxisLabel(axisId){
        // TODO: append labels to axis groups 
        // scene's range is a THREE.Vec2 object; its y-value is range maximum.
        var axisNums = {'x':0,'y':1,'z':2};
        var axisNum = axisNums[axisId];
        var labelPos = [0,0,0];
        labelPos[axisNum] = scene.get().range[axisNum].y;
        scene.group()
            .set('classes',['axis-label'])
            .array({
                data: [labelPos],
                channels: 3,
                live: false
            })
            .text({
                data: [ axes[axisId].axisLabel ]
            })
            .label({
                offset: axes[axisId].labelOffset
            })
        .end()
    }
}

MathBoxDemo.prototype.drawGrids = function(){
    // TODO: enable drawing of other grids
    var gridAxes = this.settings.twoDimensional ? [1,2] : [1,3];
    var divY = 10;
    var divX = divY * this.settings.scale[0]/this.settings.scale[1]
    
    this.scene
        .group()
            .grid({
                id: 'xy-grid',
                axes: gridAxes,
                width: 1,  
                divideX: divX,
                divideY: divY,
                opacity:0.5,
            })
        .end();
}

MathBoxDemo.prototype.redrawScene = function(){
    var range = this.settings.range;
    this.scene.set("range", this.swizzle([
        [range.xMin, range.xMax],
        [range.yMin, range.yMax],
        [range.zMin, range.zMax]
    ]));
    
    // Remove old axis labels, draw new ones
    this.mathbox.remove(".axis-label");
    this.drawAxesLabels();
}

MathBoxDemo.prototype.makeGui = function(){
	this.gui = new dat.GUI();
    this.gui.add( this, 'displaySavedUrl' ).name("Save Graph");
    
    this.customizeGui(this.gui);
    
    // The rest of GUI is common to all MathBoxDemos
    var folder = this.gui.addFolder('Window & Camera');
	var xMinGUI = folder.add( this.settings.range, 'xMin' );
	var xMaxGUI = folder.add( this.settings.range, 'xMax' );
	var yMinGUI = folder.add( this.settings.range, 'yMin' );
	var yMaxGUI = folder.add( this.settings.range, 'yMax' );
    if (!this.settings.twoDimensional){
    	var zMinGUI = folder.add( this.settings.range, 'zMin' );
    	var zMaxGUI = folder.add( this.settings.range, 'zMax' );
    }
    
    var zoomGUI = folder.add( this.settings, 'zoomEnabled' ).name("Zoom Enabled");
    zoomGUI.onChange(function(){
        this.noZoom = (!this.noZoom);
    }.bind(this.mathbox.three.controls) )
    
    var staticCameraGUI = folder.add(this.settings, 'frozen').name("Frozen");
    staticCameraGUI.onChange(function(){
        $('#'+settings.containerId).toggleClass("frozen");
    })
    
    this.gui.add( this, 'redrawScene' ).name("Redraw Display");
    
}

MathBoxDemo.prototype.customizeGui = function(gui, settings) {
    // To be customized by subclasses of MathBoxDemo
}

MathBoxDemo.prototype.animateDatGuiSlider = function(slider, rate){
    // TODO: Is this the right spot for this function? Yes.
    // slider should be a dat.GUI slider object with additional property "animate"
    rate = defaultVal(rate, 1.0);
    var property = slider.property;
    var object = slider.object;
    var sliderStep = slider.__step;
    var timeStep = sliderStep * 1000 / rate;
    
    console.log("Animating!")
    
    var intervalId = setInterval( function(){
        if (!slider.animate){
            clearInterval(intervalId);
        }
        object[property] += sliderStep;
        slider.updateDisplay();
        // slider onChange function always receives slider value
        slider.__onChange(object[property]);
        if (object[property] > slider.__max) {
            object[property] = slider.__min;
        }
        
    }, timeStep )
}

MathBoxDemo.prototype.lightenColor = function(color, amt){
    //color should be hex or named. First get hex color if it is named
    if (color[0] != "#"){
        //http://www.w3schools.com/colors/colors_names.asp
        color = color.toLowerCase();
        var namedColors = {
            aliceblue: '#F0F8FF', antiquewhite: '#FAEBD7', aqua: '#00FFFF', aquamarine: '#7FFFD4', azure: '#F0FFFF', beige: '#F5F5DC', bisque: '#FFE4C4', black: '#000000', blanchedalmond: '#FFEBCD', blue: '#0000FF', blueviolet: '#8A2BE2', brown: '#A52A2A', burlywood: '#DEB887', cadetblue: '#5F9EA0', chartreuse: '#7FFF00', chocolate: '#D2691E', coral: '#FF7F50', cornflowerblue: '#6495ED', cornsilk: '#FFF8DC', crimson: '#DC143C', cyan: '#00FFFF', darkblue: '#00008B', darkcyan: '#008B8B', darkgoldenrod: '#B8860B', darkgray: '#A9A9A9', darkgrey: '#A9A9A9', darkgreen: '#006400', darkkhaki: '#BDB76B', darkmagenta: '#8B008B', darkolivegreen: '#556B2F', darkorange: '#FF8C00', darkorchid: '#9932CC', darkred: '#8B0000', darksalmon: '#E9967A', darkseagreen: '#8FBC8F', darkslateblue: '#483D8B', darkslategray: '#2F4F4F', darkslategrey: '#2F4F4F', darkturquoise: '#00CED1', darkviolet: '#9400D3', deeppink: '#FF1493', deepskyblue: '#00BFFF', dimgray: '#696969', dimgrey: '#696969', dodgerblue: '#1E90FF', firebrick: '#B22222', floralwhite: '#FFFAF0', forestgreen: '#228B22', fuchsia: '#FF00FF', gainsboro: '#DCDCDC', ghostwhite: '#F8F8FF', gold: '#FFD700', goldenrod: '#DAA520', gray: '#808080', grey: '#808080', green: '#008000', greenyellow: '#ADFF2F', honeydew: '#F0FFF0', hotpink: '#FF69B4', indianred: '#CD5C5C', indigo: '#4B0082', ivory: '#FFFFF0', khaki: '#F0E68C', lavender: '#E6E6FA', lavenderblush: '#FFF0F5', lawngreen: '#7CFC00', lemonchiffon: '#FFFACD', lightblue: '#ADD8E6', lightcoral: '#F08080', lightcyan: '#E0FFFF', lightgoldenrodyellow: '#FAFAD2', lightgray: '#D3D3D3', lightgrey: '#D3D3D3', lightgreen: '#90EE90', lightpink: '#FFB6C1', lightsalmon: '#FFA07A', lightseagreen: '#20B2AA', lightskyblue: '#87CEFA', lightslategray: '#778899', lightslategrey: '#778899', lightsteelblue: '#B0C4DE', lightyellow: '#FFFFE0', lime: '#00FF00', limegreen: '#32CD32', linen: '#FAF0E6', magenta: '#FF00FF', maroon: '#800000', mediumaquamarine: '#66CDAA', mediumblue: '#0000CD', mediumorchid: '#BA55D3', mediumpurple: '#9370DB', mediumseagreen: '#3CB371', mediumslateblue: '#7B68EE', mediumspringgreen: '#00FA9A', mediumturquoise: '#48D1CC', mediumvioletred: '#C71585', midnightblue: '#191970', mintcream: '#F5FFFA', mistyrose: '#FFE4E1', moccasin: '#FFE4B5', navajowhite: '#FFDEAD', navy: '#000080', oldlace: '#FDF5E6', olive: '#808000', olivedrab: '#6B8E23', orange: '#FFA500', orangered: '#FF4500', orchid: '#DA70D6', palegoldenrod: '#EEE8AA', palegreen: '#98FB98', paleturquoise: '#AFEEEE', palevioletred: '#DB7093', papayawhip: '#FFEFD5', peachpuff: '#FFDAB9', peru: '#CD853F', pink: '#FFC0CB', plum: '#DDA0DD', powderblue: '#B0E0E6', purple: '#800080', rebeccapurple: '#663399', red: '#FF0000', rosybrown: '#BC8F8F', royalblue: '#4169E1', saddlebrown: '#8B4513', salmon: '#FA8072', sandybrown: '#F4A460', seagreen: '#2E8B57', seashell: '#FFF5EE', sienna: '#A0522D', silver: '#C0C0C0', skyblue: '#87CEEB', slateblue: '#6A5ACD', slategray: '#708090', slategrey: '#708090', snow: '#FFFAFA', springgreen: '#00FF7F', steelblue: '#4682B4', tan: '#D2B48C', teal: '#008080', thistle: '#D8BFD8', tomato: '#FF6347', turquoise: '#40E0D0', violet: '#EE82EE', wheat: '#F5DEB3', white: '#FFFFFF', whitesmoke: '#F5F5F5', yellow: '#FFFF00', yellowgreen: '#9ACD32'
        };
        color = namedColors[color];
    }
    
    if (color === undefined){
        return false
    }
    
    //Now that we have hex, let's darken it
    //http://stackoverflow.com/a/13532993/2747370
    var R = parseInt(color.substring(1,3),16),
        G = parseInt(color.substring(3,5),16),
        B = parseInt(color.substring(5,7),16);

    R = parseInt(R * (1 + amt) );
    G = parseInt(G * (1 + amt) );
    B = parseInt(B * (1 + amt) );

    R = (R<255)?R:255;  
    G = (G<255)?G:255;  
    B = (B<255)?B:255;  

    var RR = ((R.toString(16).length==1)?"0"+R.toString(16):R.toString(16));
    var GG = ((G.toString(16).length==1)?"0"+G.toString(16):G.toString(16));
    var BB = ((B.toString(16).length==1)?"0"+B.toString(16):B.toString(16));

    return "#"+RR+GG+BB;
}

// Save URL Methods

MathBoxDemo.prototype.saveSettingsAsUrl = function(settings){
    settings = defaultVal(settings, this.settings);
    // camera is a THREE js Vec3 object
    var camera = this.mathbox.three.camera.position;
    // Round camera positions to keep encoded settings small.
    settings.camera.position = [camera.x, camera.y, camera.z].map( function(x){return Math.round(x*100)/100; } );
    var settingsDiff64 = window.btoa(JSON.stringify(deepObjectDiff(settings, this.defaultSettings)));
    return window.location.href.split('?')[0] + "?settings=" + settingsDiff64
    return url;
}

MathBoxDemo.prototype.decodeSettings64 = function(encodedSettings){
    var settings = JSON.parse(window.atob(encodedSettings))
    settings.fromURL = true;
    return settings
}

MathBoxDemo.prototype.displaySavedUrl = function(){
    $("#save-url-modal textarea.default-saved-url").text(this.saveSettingsAsUrl());
    $("#save-url-modal").modal('show')
}

MathBoxDemo.prototype.appendSaveUrlModal = function(){
    var modalTemplate = [
        '<div id="save-url-modal" style="display:none;">',
        '   <p>Revisit this graph at:</p>',
        '   <textarea class="default-saved-url" style="min-width:320px;min-height:100px;width:90%;height:90%"></textarea>',
        '</div>',
    ].join('\n');
    $("body").append(modalTemplate);
}

// Drawing Methods

MathBoxDemo.prototype.parse = function(functionString, variables){
    if (functionString === "") {
        return null
    } else
    return Parser.parse( functionString ).toJSFunction( variables )
}

MathBoxDemo.prototype.parseParametricFunction = function(functionSettings){
    var func = {}
    func.xJS = this.parse( functionSettings.x, ['t'] );
    func.yJS = this.parse( functionSettings.y, ['t'] );
    func.zJS = this.parse( functionSettings.z, ['t'] );
    return func;
}

MathBoxDemo.prototype.drawParametricCurve = function(funcSettings, parentObject){
    //funcSettings has been parsed first.
    var funcId = funcSettings.id;
    var xJS = this.functions[funcId].xJS;
    var yJS = this.functions[funcId].yJS;
    var zJS = this.functions[funcId].zJS;
    var tMin = funcSettings.tMin;
    var tMax = funcSettings.tMax;
    var color = funcSettings.color;
    
    parentObject = defaultVal(parentObject, this.scene);
    var group = parentObject.group().set('classes', ['parametric-curve'])
    
    group.interval({
        id: "data-parametric-curve-" + funcId,
        range: [tMin, tMax],
        width: 64,
        expr: function (emit, u, i, time) {
            emit( xJS(u), yJS(u), zJS(u) );
      },
      channels: 3,
    }).swizzle({
      order: this.swizzleOrder
    }).line({
      color: color,
      width: 6,
    });
    
}

MathBoxDemo.prototype.drawPoint = function(pointSettings, parentObject) {
    var pointId = pointSettings.id;
    var x = pointSettings.x;
    var y = pointSettings.y;
    var z = pointSettings.z;
    var color = pointSettings.color;
    
    parentObject = defaultVal(parentObject, this.scene);
    var group = parentObject.group().set('classes', ['point'])
    
    group.array({
        id: "data-point-" + pointId,
        data: [x,y,z],
        live:true,
        items: 1,
        channels: 3,
    }).swizzle({
      order: this.swizzleOrder
    }).point({
        color: color,
        size: 12,
    });
    
}

MathBoxDemo.prototype.updatePoint = function(pointSettings) {
    var pointData = this.scene.select("#data-point-" + pointSettings.id);
    pointData.set("data", [pointSettings.x, pointSettings.y, pointSettings.z] );
}

MathBoxDemo.prototype.drawVector = function(vectorSettings, parentObject) {
    var tail = vectorSettings.tail;
    var tip = vectorSettings.tip;
    var vecId = vectorSettings.id;
    
    var color = vectorSettings.color;
    
    parentObject = defaultVal(parentObject, this.scene);
    var group = parentObject.group().set('classes', ['vector'])
    
    group.array({
        id: "data-vector-" + vecId,
        data: [tail, tip],
        live:true,
        items: 2,
        channels: 3,
    }).swizzle({
      order: this.swizzleOrder
    }).vector({
        color: color,
        width: 3,
        size: 3,
        end: true,
    });
    
}

MathBoxDemo.prototype.updateVector = function(vectorSettings) {
    var vectorData = this.scene.select("#data-vector-" + vectorSettings.id);
    vectorData.set("data", [vectorSettings.tail, vectorSettings.tip] );
}

var Demo_ParametricCurves = function(element_id, settings){
    MathBoxDemo.call(this, element_id, settings );
    $('body').on('keydown',this.onKeyDown.bind(this));
    // this.container.on('keydown',this.onKeyDown.bind(this));
}
// Next two lines for subclassing: http://stackoverflow.com/a/8460616/2747370
Demo_ParametricCurves.prototype = Object.create( MathBoxDemo.prototype );
Demo_ParametricCurves.prototype.constructor = Demo_ParametricCurves;

Demo_ParametricCurves.prototype.sanitizeSettings = function(settings) {
    settings = MathBoxDemo.prototype.sanitizeSettings.call(this, settings);
    // Add defaults specific to this subclass of MathBoxDemo
    // lodash merge does not deep merge arrays, so store function list as object instead
    var moreDefaultSettings = {
        functions: {
            a: {
                id: 'a',
                x:'3*cos(t)',
                y:'3*sin(t)',
                z: settings.twoDimensional ? '0' : 't/3.14',
                animate:true,
                displayEquation:true,
                t: 0.1,
                tMin: 0,
                tMax: +6.28,
                color: '#3090FF',
            },
            b: {
                id:'b',
                x:'',
                y:'',
                z: settings.twoDimensional ? '0' : '',
                animate:false,
                displayEquation:true,
                t: 0.1,
                tMin: -1,
                tMax: +3,
                color: 'orange'
            },
            c: {
                id:'c',
                x:'',
                y:'',
                z: settings.twoDimensional ? '0' : '',
                animate:false,
                displayEquation:true,
                t: 0.1,
                tMin: -1,
                tMax: +3,
                color: '#2db92d'
            },
        },
    }
    this.defaultSettings = _.merge({}, moreDefaultSettings, this.defaultSettings);
    settings = _.merge({}, moreDefaultSettings, settings);
    
    return settings
}

Demo_ParametricCurves.prototype.drawVis = function(funcSettings){
    this.functions[funcSettings.id] = this.parseParametricFunction(funcSettings);
    
    var group = this.scene.group().set('classes',['function-visualization'])
    
    this.drawParametricCurve(funcSettings, group);
    
    var t = funcSettings.t;
    var func = this.functions[funcSettings.id];
    var x = func.xJS(t);
    var y = func.yJS(t);
    var z = func.zJS(t);
    
    var pointSettings = {
        id:funcSettings.id,
        x:x,
        y:y,
        z:z,
        color:this.lightenColor(funcSettings.color, -0.33)
    }
    this.drawPoint(pointSettings, group);
    
    var posVectorSettings = {
        id: 'position-'+funcSettings.id,
        tail: [0,0,0],
        tip: [x,y,z],
        color: 'black',
    }
    this.drawVector(posVectorSettings, group);

}

Demo_ParametricCurves.prototype.updateVis_t = function(funcSettings) {

    var t = funcSettings.t;
    var func = this.functions[funcSettings.id];
    if (func===undefined){return}
    var x = func.xJS(t);
    var y = func.yJS(t);
    var z = func.zJS(t);
    
    var pointSettings = {
        id:funcSettings.id,
        x:x,
        y:y,
        z:z,
        color:this.lightenColor(funcSettings.color, -0.33)
    }
    this.updatePoint(pointSettings);
    
    var posVectorSettings = {
        id: 'position-'+funcSettings.id,
        tail: [0,0,0],
        tip: [x,y,z],
        color: 'black',
    }
    this.updateVector(posVectorSettings);
}

Demo_ParametricCurves.prototype.updateVis_tRange = function(funcId) {
    //TODO: This does not currently work. It updates the range property, but does not change curve.
    // var curve_data = this.scene.select("#curve-data-" + funcId);
    // var funcSettings = this.settings.functions[funcId]
    // curve_data.set("range", [funcSettings.tMin, funcSettings.tMax] );
}

Demo_ParametricCurves.prototype.customizeGui = function(gui){
    var settings = this.settings;
    
    var animatedSliders = this.animatedSliders; //for use below 
    var updateVis_t = this.updateVis_t.bind(this); //for use below 
    var updateVis_tRange = this.updateVis_tRange.bind(this); // for use below
    
    var folder0 = gui.addFolder("Functions");
    $(folder0.domElement).addClass("functions-folder");
    
    folder0.open();
    
    addFunctionFolder('a', "Function A", true)
    addFunctionFolder('b', "Function B", false)
    addFunctionFolder('c', "Function C", false)
    
    function addFunctionFolder(funcId, folderName, openFolder){
        var functionSettings = settings.functions[funcId]
        var funcFolder = folder0.addFolder(folderName);
        if (openFolder){ funcFolder.open(); }
        
        var xGUI =funcFolder.add(functionSettings, 'x').name("<span class='equation-LHS'>X(t) = </span>");
        var yGUI =funcFolder.add(functionSettings, 'y').name("<span class='equation-LHS'>Y(t) = </span>");
        if (!settings.twoDimensional){ 
            var zGUI = funcFolder.add(functionSettings, 'z').name("<span class='equation-LHS'>Z(t) = </span>"); 
        }
        
        if (!functionSettings.displayEquation){
            $(xGUI.domElement).closest('li').hide();
            $(yGUI.domElement).closest('li').hide();
            $(zGUI.domElement).closest('li').hide();
        }
              
        var tSlider = funcFolder.add(functionSettings, "t")
            .min(functionSettings.tMin)
            .max(functionSettings.tMax)
            .step(0.01);
        
        animatedSliders[funcId+"-t"] = tSlider;
        tSlider.onChange( function(e){
            updateVis_t(functionSettings);
        } );
        tSlider.animate = functionSettings.animate;
        if (tSlider.animate){
            MathBoxDemo.prototype.animateDatGuiSlider(tSlider);
        }
        
        var animateToggle = funcFolder.add(functionSettings, 'animate').onChange(function(e){
            tSlider.animate = functionSettings.animate;
            if (e) {
                MathBoxDemo.prototype.animateDatGuiSlider(tSlider);
            }
        });
        animateToggle.listen()
        
        funcFolder.add(functionSettings, 'tMin').onChange( function(){
            updateVis_tRange(funcId);
            tSlider.min( functionSettings.tMin );
        } );
        funcFolder.add(functionSettings, 'tMax').onChange( function(){
            updateVis_tRange(funcId);
            tSlider.max( functionSettings.tMax );
        } );
        
    }

}

Demo_ParametricCurves.prototype.onKeyDown = function(evt){
    var freezeSliderById = function(funcId){
        var func = this.settings.functions[funcId];
        var sliderId = funcId + "-t";
        var tSlider = this.animatedSliders[sliderId];
        if (func.x != '' && func.y != '' && func.z != 'z'){
            func.animate = (!func.animate)
            tSlider.animate = (!tSlider.animate);
            if (func.animate){
                MathBoxDemo.prototype.animateDatGuiSlider(tSlider);
            }
        }
    }.bind(this)
    
    if (evt.which===32){ //spacebar key
        for (var funcId in this.settings.functions){
            freezeSliderById(funcId);
        }
    } 

}

Demo_ParametricCurves.prototype.redrawScene = function() {
    MathBoxDemo.prototype.redrawScene.call(this);
    
    // Remove curves that are already drawn
    this.mathbox.remove(".function-visualization");
    
    for (var funcId in this.settings.functions) {
        var funcSettings = this.settings.functions[funcId];
        var isDrawable = (funcSettings.x != '') && (funcSettings.y != '') && (funcSettings.z != '')
        if (isDrawable){
            this.drawVis(funcSettings);
        }
    }
    
}

Demo_ParametricCurves.prototype.appendSaveUrlModal = function(settings) {
    MathBoxDemo.prototype.appendSaveUrlModal.call(this, settings);
    var custom = [
        '<p>...or with functions hidden:</p>',
        '<textarea class="custom-saved-url" style="min-width:320px;min-height:100px;width:90%;height:90%"></textarea>'
    ].join('\n');
    $('#save-url-modal').append(custom);
}

Demo_ParametricCurves.prototype.displaySavedUrl = function(settings) {
    MathBoxDemo.prototype.displaySavedUrl.call(this, settings);
    var modifiedSettings = _.merge({},this.settings);
    for (var key in modifiedSettings.functions){
        modifiedSettings.functions[key].displayEquation = false;
    }
    console.log(modifiedSettings)
    $('textarea.custom-saved-url').text(this.saveSettingsAsUrl(modifiedSettings));
}