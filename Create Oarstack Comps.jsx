
function createNewComp(sourceComp, templateComp, scaleFactor) {
    var newComp = sourceComp.duplicate();
    newComp.name = sourceComp.name.split(":")[2] + templateComp.name.split(":")[2];
    
    newComp.duration = sourceComp.duration * scaleFactor;
    newComp.workAreaStart = sourceComp.workAreaStart * scaleFactor;
    newComp.workAreaDuration = sourceComp.workAreaDuration * scaleFactor;
    var newWorkAreaEnd = newComp.workAreaStart + newComp.workAreaDuration;
    
    newComp.frameRate = templateComp.frameRate;
    
    var newAVLayerEffects = [];
    
    // Remove and duplicate layers
    for (var i = newComp.layers.length; i >= 1; i--) {
        newComp.layers[i].remove();
    }

    for (var i = sourceComp.layers.length; i >= 1; i--) {
        sourceComp.layers[i].copyToComp(newComp);
    }

    for (var i = 1; i <= newComp.layers.length; i++) {
        var newLayer = newComp.layers[i];
        var sourceLayer = sourceComp.layers[i];
        // $.writeln("Orig: "+sourceComp.name+">"+templateComp.name.split(":")[1]+
        //     "["+i+"]: inPoint "+sourceLayer.inPoint+" outPoint "+sourceLayer.outPoint+
        //     " startTime "+sourceLayer.startTime);

        if (newLayer instanceof AVLayer) {
            // startTime must be changed first, since it moves inPoint and outPoint when it's changed
            newLayer.startTime = sourceLayer.startTime * scaleFactor;

            // The values inPoint and outPoint take will be trimmed to the size of the Comp
            newLayer.inPoint = Math.max(sourceLayer.inPoint * scaleFactor, newComp.workAreaStart);
            newLayer.outPoint = Math.min(sourceLayer.outPoint * scaleFactor, 10800, newWorkAreaEnd);

            // Trim overlap from hidden Comps to prevent multiple computation
            for (var j = 1; j < newComp.layers.length; j++) {
                frontLayer = newComp.layers[j];
                if ((newLayer.inPoint > frontLayer.inPoint) && (newLayer.inPoint < frontLayer.outPoint)) {
                    // frontLayer hides the start of the new Comp
                    newLayer.inPoint = frontLayer.outPoint;
                }
                if ((newLayer.inPoint < frontLayer.inPoint) && (newLayer.outPoint > frontLayer.inPoint)) {
                    // frontLayer hides the end of the new Comp
                    newLayer.outPoint = frontLayer.inPoint;
                }
            }

            var effectsGroup = newLayer.property("Effects");
            newAVLayerEffects.push(effectsGroup);
        } else {
            // $.writeln("Layer not AVLayer");
        }
        // $.writeln("New: "+sourceComp.name+">"+templateComp.name.split(":")[1]+
        //     "["+i+"]*"+scaleFactor+": inPoint "+newLayer.inPoint+" outPoint "+newLayer.outPoint+
        //     " startTime "+newLayer.startTime);
    }

    for (var i = 1; i <= templateComp.layers.length; i++) {
        var layer = templateComp.layers[i];
        var effectsGroup = layer.property("Effects");
        for (j = 1; j <= effectsGroup.numProperties; j++) {
            var templateEffect = effectsGroup.property(j);
            for (var k = 0; k < newAVLayerEffects.length; k++) {
                var destGroup = newAVLayerEffects[k];
                var newEffect = destGroup.addProperty(templateEffect.name);
                for (var l = 1; l <= templateEffect.numProperties; ++l) {
                    var templateProp = templateEffect.property(l);
                    if (templateProp.name == "Compositing Options") {
                        // $.writeln("Not duplicating Compositing Options");
                    } else if (templateProp instanceof Property) {
                        if (templateProp.name === "Color Source") {
                            // $.writeln("Overriding Color Source to " + (k+1));
                            newEffect[templateProp.name].setValue(k+1);
                            // $.writeln(i+" "+j+" "+k+" "+l+" Added property "+templateProp.name+" to "+newEffect.name+" value "+templateProp.value+"="+newEffect[templateProp.name].value);
                        } else if (templateProp.propertyValueType !== PropertyValueType.NO_VALUE) {
                            newEffect[templateProp.name].setValue(templateProp.value);
                            var newProp = newEffect[templateProp.name];
                            // $.writeln(i+" "+j+" "+k+" "+l+" Added property "+templateProp.name+" to "+newEffect.name+" value "+templateProp.value+"="+newEffect[templateProp.name].value);
                        } else {
                            // $.writeln("Skipped no value property '"+templateProp.name+"' for "+newEffect.name);
                        }
                    } else {
                        // $.writeln("Unknown property type: "+templateProp.type);
                    }
                }
            }
        }
    }

    return newComp;
}


var sourceComps = {};
var templateComps = {};
var itemsToRemove = [];
var projItems = app.project.items;

// projItems is ItemCollection, so like an array indexed from 1
for (var i = 1; i <= projItems.length; i++) {
    
    var item = projItems[i];
    if (item instanceof CompItem) {
        if (item.name.indexOf('_template:') == 0) {
            var templateId = item.name.split(":")[1];
            templateComps[templateId] = item;
        } else if (item.name.indexOf('_') == 0) {
            
        } else if (item.name.indexOf('Input Comp') >= 0) {
            
        } else if (item.name.indexOf('::') == 3) {        
            sourceComps[item.name] = item;
        } else {
            itemsToRemove.push(item);
        }
    }
}

app.beginUndoGroup("oarstackDelete")
for (var i = 0; i < itemsToRemove.length; i++) {
    itemsToRemove[i].remove();
}
app.endUndoGroup();

app.beginUndoGroup("oarstackCreate")
for (var key in sourceComps) {
    var sourceComp = sourceComps[key];
    var fullSpeedComp = createNewComp(sourceComp, templateComps["fullspeed"], 1);
    var primaryComp = createNewComp(sourceComp, templateComps["legacy"], 2);
    var slowMotionComp = createNewComp(sourceComp, templateComps["slowmotion"], 8);
}
app.endUndoGroup();
0;
