
function createNewComp(sourceComp, templateComp, scaleFactor) {
    var newComp = sourceComp.duplicate();
    newComp.name = sourceComp.name.split(":")[2] + templateComp.name.split(":")[2];
    
    newComp.duration = sourceComp.duration * scaleFactor;
    newComp.workAreaStart = sourceComp.workAreaStart * scaleFactor;
    newComp.workAreaDuration = sourceComp.workAreaDuration * scaleFactor;
    
    newComp.frameRate = templateComp.frameRate;
    
    var newAVLayerEffects = [];    
    
    for (var i = 1; i <= newComp.layers.length; i++) {
        var layer = newComp.layers[i];
        if (layer instanceof AVLayer) {
            layer.inPoint = layer.inPoint * scaleFactor;
            layer.startTime = layer.startTime * scaleFactor;
            layer.outPoint = layer.outPoint * scaleFactor;
            var effectsGroup = layer.property("Effects");
            newAVLayerEffects.push(effectsGroup);
        }
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
                    if (templateProp instanceof Property) {
                        if (templateProp.propertyValueType !== PropertyValueType.NO_VALUE) {
                            newEffect[templateProp.name].setValue(templateProp.value);
                        }
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
            //for (var j = 1; j <= item.layers.length; j++) {
            //    item.workAreaDuration = item.workAreaDuration / 2;
            //    var layer = item.layers[j];
            //    var scaleFactor = 1.0;
            //    if (layer instanceof AVLayer) {
                   //layer.inPoint = layer.inPoint * scaleFactor;
                   //layer.outPoint = layer.outPoint * scaleFactor;
                   //layer.startTime = layer.startTime * scaleFactor;
            //    }
            //}
            sourceComps[item.name] = item;
        } else {
            itemsToRemove.push(item);
        }
    }
}

for (var i = 0; i < itemsToRemove.length; i++) {
    itemsToRemove[i].remove();
}

for (var key in sourceComps) {
    var sourceComp = sourceComps[key];
    var fullSpeedComp = createNewComp(sourceComp, templateComps["fullspeed"], 1);
    var primaryComp = createNewComp(sourceComp, templateComps["legacy"], 2);
    var slowMotionComp = createNewComp(sourceComp, templateComps["slowmotion"], 8);
}
