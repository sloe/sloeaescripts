
"use strict";

var rateLimitLow = 15;
var rateLimitHigh = 50;

var g_templateMusic = {};
var g_musicRegexp = /\.(wav|mp3)$/;

function selectMusicForComp(templateName, sourceName, newCompName, compOutPoint) {
    var currentMusic = undefined;
    var currentCredit = -100;
    for (var i=0; i < g_templateMusic[templateName].length; i++) {
        var music = g_templateMusic[templateName][i];
        // Generate a repeateable pseudorandom number to add to the credit value
        var hashValue = 0;
        var hashSource = templateName + newCompName + music.name + compOutPoint.toFixed(1);
        for (var j = 0; j < hashSource.length; j++) {
            var chr   = hashSource.charCodeAt(j);
            hashValue  = ((hashValue << 5) - hashValue) + chr;
            hashValue |= 0;
        }

        // Calculate credit (higher is better).  A postive offset tends to choose music longer
        // than the Comp, negative shorter
        var credit = (hashValue % 30) - Math.abs(compOutPoint - music.outPoint + 10);
        if (credit > currentCredit) {
            currentMusic = music;
            currentCredit = credit;
        }
        // $.writeln("Credit for " + sourceName + " (outPoint " + compOutPoint.toFixed(2) + ") for " + music.name + " using " + templateName + " is " + credit.toFixed(2));
    }
    if (currentMusic) {
        currentMusic.useCount++;
    }
    return currentMusic;
}

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
                    time: endTime // The time point when we know what the rate is, based on the last n strokes
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


            // Set stretched based on the scale factor.  It's in a layer in templateComp but we'd have to find it.
            // Set this first as it changes later computations within AE
            newLayer.stretch = 100 * scaleFactor;
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
        }
        var effectsGroup = newLayer.property("Effects");
        newAVLayerEffects.push(effectsGroup);

        // $.writeln("New: "+sourceComp.name+">"+templateComp.name.split(":")[1]+
        //     "["+i+"]*"+scaleFactor+": inPoint "+newLayer.inPoint+" outPoint "+newLayer.outPoint+
        //     " startTime "+newLayer.startTime);
    }

    var music = selectMusicForComp(templateComp.name, sourceComp.name, newComp.name, newWorkAreaEnd);
    var musicName = undefined;
    if (music) {
        musicName = music.name;
    }

    // We copy some layers in templateComp to layers in newComp
    for (var i = 1; i <= templateComp.layers.length; i++) {
        var templateLayer = templateComp.layers[i];
        if (templateLayer instanceof TextLayer) {
            templateLayer.copyToComp(newComp);
            var newLayer = newComp.layer(1);
            var sourceText = newLayer.text.sourceText;
            if (newLayer.name === "text_crew_name") {
                newLayer.text.sourceText.setValueAtTime(0.0, newComp.name.replace(", Cambridge", "\nCambridge"));
            } else if (newLayer.name === "text_rate") {
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
                        var time = strokeRates[j].time * scaleFactor;
                        newLayer.text.sourceText.setValueAtTime(time, "Average " + strokeRates[j].avgRate.toFixed(2) + " from " + j + " stroke" + (j === 1 ? "" : "s"));
                    }
                }
            }
        } else if (templateLayer instanceof AVLayer) {
            if (g_musicRegexp.exec(templateLayer.name)) {
                if (templateLayer.name === musicName) {
                    templateLayer.copyToComp(newComp);
                    // $.writeln("Copied music layer " + templateLayer.name + " into Comp " + newComp.name);
                }
            } else if (medals[sourceComp.name].indexOf(templateLayer.name) >= 0) {
                templateLayer.copyToComp(newComp);
                // $.writeln("Copied layer " + templateLayer.name + " into Comp " + newComp.name);
            }
        }
    }

    // We copy some properties from layers in templateComp to layers in newComp, matching
    // up by the names of the layers
    for (var i = 1; i <= templateComp.layers.length; i++) {
        var templateLayer = templateComp.layers[i];
        for (var j = 1; j <= newComp.layers.length; j++) {
            var newLayer = newComp.layers[j];
            if (templateLayer.name === newLayer.name) {
                if (newLayer instanceof AVLayer && newLayer.audioActive) {
                    var templateProps = templateLayer.property("Audio");
                    var newProps = newLayer.property("Audio");

                    for (var k = 1; k <= templateProps.numProperties; k++) {
                        var templateProp = templateProps.property(k);
                        var newProp = newProps.property(templateProp.name);

                        if (templateProp.propertyValueType !== PropertyValueType.NO_VALUE) {
                            // There's a bunch more to copy here (see newProp.reflect.methods) but we'll add them as we need them
                            newProp.setValue(templateProp.value);
                            for (var m = 1; m <= templateProp.numKeys; m++) {
                                var keyTime = templateProp.keyTime(m);
                                var keyValue = templateProp.keyValue(m);
                                newProp.setValueAtTime(keyTime, keyValue);
                            }
                        }
                    }
                }
            }
        }
    }

    for (var i = 1; i <= templateComp.layers.length; i++) {
        var layer = templateComp.layers[i];

        // Copy effects to new Comp
        var effectsGroup = layer.property("Effects");
        // Not sure this works anymore
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
                            newEffect[templateProp.name].setValue(k + 1);
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

    if (strokeRates.length > 0) {
        // $.writeln("Stroke rates for " + newComp.name + " = " + strokeRates.map(function(x) {return x.spotRate}).join(", "));
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
    rateArray.sort(function (a, b) { return b.avgRate - a.avgRate });
    medals[rateArray[0].name].push("medal_rate_1st");
    medals[rateArray[1].name].push("medal_rate_2nd");
    medals[rateArray[2].name].push("medal_rate_3rd");
}


for (var key in templateComps) {
    var templateComp = templateComps[key];
    var musicForTemplate = [];
    for (var i = 1; i <= templateComp.layers.length; i++) {
        var templateLayer = templateComp.layers[i];
        if (templateLayer instanceof AVLayer) {
            var match = g_musicRegexp.exec(templateLayer.name);
            if (match) {
                var musicRecord = {
                    name: templateLayer.name,
                    outPoint: templateLayer.outPoint,
                    useCount: 0
                };
                musicForTemplate.push(musicRecord);
                // $.writeln("Added music: " + templateComp.name + "[" + templateLayer.name + "] " + JSON.stringify(musicRecord));
            }
        }
    }
    g_templateMusic[templateComp.name] = musicForTemplate;
}


for (var key in sourceComps) {
    var sourceComp = sourceComps[key];
    var strokeRates = calculateRates(sourceComp);
    var fullSpeedComp = createNewComp(sourceComp, templateComps["fullspeed"], 1, strokeRates, medals);
    // var primaryComp = createNewComp(sourceComp, templateComps["legacy"], 2, strokeRates, medals);
    // var slowMotionComp = createNewComp(sourceComp, templateComps["slowmotion"], 8, strokeRates, medals);
    var midSlowMotionComp = createNewComp(sourceComp, templateComps["midslow"], 8, strokeRates, medals);
}
app.endUndoGroup();

for (var key in templateComps) {
    var templateName = templateComps[key].name;
    $.writeln("Template name " + templateName);
    for (var i=0; i < g_templateMusic[templateName].length; i++) {
        var music = g_templateMusic[templateName][i];
        $.writeln("  Music " + music.name + " use count " + music.useCount);
    }
}

0;
