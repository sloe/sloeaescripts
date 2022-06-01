
"use strict";

var rateLimitLow = 15;
var rateLimitHigh = 50;

function rateFromMarkers(inPoint, markers) {
    if (markers.numKeys < 2) {
        $.writeln("Logic error in rateFromMarkers"); // Shouldn't be called with less than 2
        return 99;
    }
    
    var rates = [];
    
    for (var i = 1; i <= markers.numKeys - 1; i++) {
        var startTime = markers.keyTime(i);
        var endTime = markers.keyTime(i + 1);
        if (startTime === endTime) {
            $.writeln("Skipping duplicate markers");
        } else {
            var spotRate = 60.0 / (endTime - startTime);
            if (spotRate < rateLimitLow || spotRate > rateLimitHigh) {
                $.writeln("Skipping out of range spot rate: " + spotRate);
            } else {
                var avgRate = spotRate;
                for (var i = 0; i < rates.length; i++) {
                    avgRate += rates[i].spotRate;
                }
                avgRate = avgRate / (rates.length + 1);
                rates.push({
                    avgRate: avgRate,
                    spotRate: spotRate,
                    inPoint: inPoint,
                    time: endTime // The time we know what the rate is
                })
            }
            // $.writeln("Rate: " + spotRate);
        }
    }

    return rates;
}

function calculateRates(sourceComp) {
    const strokeRates = [];
    if (sourceComp.markerProperty.numKeys > 1) {
        strokeRates = strokeRates.concat(rateFromMarkers(0.0, sourceComp.markerProperty));
    }

    for (var i = 1; i <= sourceComp.layers.length; i++) {
        var sourceLayer = sourceComp.layers[i];
        
        if (sourceLayer instanceof AVLayer) {
            if (sourceLayer.marker.numKeys > 1) {
                strokeRates = strokeRates.concat(rateFromMarkers(sourceLayer.inPoint, sourceLayer.marker));
            }
        }
    }
    return strokeRates;
}

function createNewComp(sourceComp, templateComp, scaleFactor, strokeRates) {
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


            // Copy strecth value from the template's first layer
            newLayer.stretch = templateComp.layers[1].stretch
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

    for (var i = 1; i <= templateComp.layers.length; i++) {
        var templateLayer = templateComp.layers[i];
        if (templateLayer instanceof TextLayer) {
            templateLayer.copyToComp(newComp);
            var newLayer = newComp.layer(1);
            var sourceText = newLayer.text.sourceText;
            if (newLayer.name === "text_rate") {
                if (strokeRates.length == 0) {
                    newLayer.enabled = false;
                } else {
                    newLayer.text.sourceText.setValueAtTime(0.0, strokeRates[strokeRates.length - 1].avgRate.toFixed(2));
                }
            } else if (newLayer.name === "text_rate_subtitle") {
                if (strokeRates.length == 0) {
                    newLayer.enabled = false;
                } else {
                    for (var j = 0; j < strokeRates.length; j++) {
                        var time = strokeRates[j].time
                        newLayer.text.sourceText.setValueAtTime(time, "Average " + strokeRates[j].avgRate.toFixed(2) + " from " + j + " stroke" + (j === 1 ? "" : "s"));
                    }
                }
            } 
        } else {
            if (medals[sourceComp.name].indexOf(templateLayer.name) >= 0) {   
                templateLayer.copyToComp(newComp);
                $.writeln("Copied layer " + templateLayer.name + " in Comp " + newComp.name);
            }
        }
    }

    if (strokeRates.length > 0) {
        $.writeln("Stroke rates for " + newComp.name + " = " + strokeRates.map(function(x) {return x.spotRate}).join(", "));
    } else {
        $.writeln("Missing or faulty rate markers for " + newComp.name);
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
medals = {};

var rateArray = [];
for (var key in sourceComps) {
    var sourceComp = sourceComps[key];
    medals[sourceComp.name] = [];
    var strokeRates = calculateRates(sourceComp);
    if (strokeRates.length > 0) {
        var avgRate = strokeRates[strokeRates.length - 1].avgRate;
        rateArray.push({
            name: sourceComp.name,
            avgRate: avgRate
        });
    }
}

if (rateArray.length >= 3) {
    rateArray.sort(function(a, b) { return b.avgRate - a.avgRate });
    medals[rateArray[0].name].push("medal_rate_1st");
    medals[rateArray[1].name].push("medal_rate_2nd");
    medals[rateArray[2].name].push("medal_rate_3rd");
}

for (var key in sourceComps) {
    var sourceComp = sourceComps[key];
    var strokeRates = calculateRates(sourceComp);
    var fullSpeedComp = createNewComp(sourceComp, templateComps["fullspeed"], 1, strokeRates, medals);
    var primaryComp = createNewComp(sourceComp, templateComps["legacy"], 2, strokeRates, medals);
    var slowMotionComp = createNewComp(sourceComp, templateComps["slowmotion"], 8, strokeRates, medals);
}
app.endUndoGroup();
0;
