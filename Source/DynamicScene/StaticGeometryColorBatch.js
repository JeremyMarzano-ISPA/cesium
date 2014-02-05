/*global define*/
define(['../Core/Color',
        '../Core/ColorGeometryInstanceAttribute',
        '../Core/defined',
        '../Core/Map',
        '../Core/ShowGeometryInstanceAttribute',
        '../Scene/Primitive'
    ], function(
        Color,
        ColorGeometryInstanceAttribute,
        defined,
        Map,
        ShowGeometryInstanceAttribute,
        Primitive) {
    "use strict";

    var colorScratch = new Color();

    var Batch = function(primitives, translucent, appearanceType) {
        this.translucent = translucent;
        this.appearanceType = appearanceType;
        this.primitives = primitives;
        this.createPrimitive = false;
        this.primitive = undefined;
        this.geometry = new Map();
        this.updaters = new Map();
        this.updatersWithAttributes = new Map();
        this.attributes = new Map();
        this.itemsToRemove = [];
    };

    Batch.prototype.add = function(updater, instance) {
        var id = updater.id;
        this.createPrimitive = true;
        this.geometry.set(id, instance);
        this.updaters.set(id, updater);
        if (!updater.hasConstantFill || !updater.fillMaterialProperty.isConstant) {
            this.updatersWithAttributes.set(id, updater);
        }
    };

    Batch.prototype.remove = function(updater) {
        var id = updater.id;
        this.createPrimitive = this.geometry.remove(id) || this.createPrimitive;
        this.updaters.remove(id);
        this.updatersWithAttributes.remove(id);
    };

    Batch.prototype.update = function(time) {
        var removedCount = 0;
        var primitive = this.primitive;
        var primitives = this.primitives;
        if (this.createPrimitive) {
            this.attributes.removeAll();
            if (defined(primitive)) {
                primitives.remove(primitive);
            }
            var geometry = this.geometry.getValues();
            if (geometry.length > 0) {
                primitive = new Primitive({
                    asynchronous : false,
                    geometryInstances : geometry,
                    appearance : new this.appearanceType({
                        translucent : this.translucent,
                        closed : true
                    })
                });

                primitives.add(primitive);
            }
            this.primitive = primitive;
            this.createPrimitive = false;
        } else {
            var updatersWithAttributes = this.updatersWithAttributes.getValues();
            var length = updatersWithAttributes.length;
            for (var i = 0; i < length; i++) {
                var updater = updatersWithAttributes[i];
                var instance = this.geometry.get(updater.id);

                var attributes = this.attributes.get(instance.id.id);
                if (!defined(attributes)) {
                    attributes = primitive.getGeometryInstanceAttributes(instance.id);
                    this.attributes.set(instance.id.id, attributes);
                }

                if (!updater.fillMaterialProperty.isConstant) {
                    var colorProperty = updater.fillMaterialProperty.color;
                    colorProperty.getValue(time, colorScratch);
                    attributes.color = ColorGeometryInstanceAttribute.toValue(colorScratch, attributes.color);
                    if ((this.translucent && attributes.color[3] === 255) || (!this.translucent && attributes.color[3] !== 255)) {
                        this.itemsToRemove[removedCount++] = updater;
                    }
                }

                if (!updater.hasConstantFill) {
                    attributes.show = ShowGeometryInstanceAttribute.toValue(updater.isFilled(time), attributes.show);
                }
            }
        }
        this.itemsToRemove.length = removedCount;
    };

    Batch.prototype.removeAllPrimitives = function() {
        var primitive = this.primitive;
        if (defined(primitive)) {
            this.primitives.remove(primitive);
            this.primitive = undefined;
            this.geometry.removeAll();
            this.updaters.removeAll();
        }
    };

    var StaticGeometryColorBatch = function(primitives, appearanceType) {
        this._solidBatch = new Batch(primitives, false, appearanceType);
        this._translucentBatch = new Batch(primitives, true, appearanceType);
    };

    StaticGeometryColorBatch.prototype.add = function(time, updater) {
        var instance = updater.createGeometryInstance(time);
        if (instance.attributes.color.value[3] === 255) {
            this._solidBatch.add(updater, instance);
        } else {
            this._translucentBatch.add(updater, instance);
        }
    };

    StaticGeometryColorBatch.prototype.remove = function(updater) {
        if (!this._solidBatch.remove(updater)) {
            this._translucentBatch.remove(updater);
        }
    };

    StaticGeometryColorBatch.prototype.update = function(time) {
        var i;
        var updater;

        //Perform initial update
        this._solidBatch.update(time);
        this._translucentBatch.update(time);

        //If any items swapped between solid/translucent, we need to
        //move them between batches
        var itemsToRemove = this._solidBatch.itemsToRemove;
        var solidsToMoveLength = itemsToRemove.length;
        if (solidsToMoveLength > 0) {
            for (i = 0; i < solidsToMoveLength; i++) {
                updater = itemsToRemove[i];
                this._solidBatch.remove(updater);
                this._translucentBatch.add(updater, updater.createGeometryInstance(time));
            }
        }

        itemsToRemove = this._translucentBatch.itemsToRemove;
        var translucentToMoveLength = itemsToRemove.length;
        var removedTranslucentLength = itemsToRemove.length;
        if (translucentToMoveLength > 0) {
            for (i = 0; i < translucentToMoveLength; i++) {
                updater = itemsToRemove[i];
                this._translucentBatch.remove(updater);
                this._solidBatch.add(updater, updater.createGeometryInstance(time));
            }
        }

        //If we moved anything around, we need to re-build the primitive
        if (translucentToMoveLength > 0 || removedTranslucentLength > 0) {
            this._solidBatch.update(time);
            this._translucentBatch.update(time);
        }
    };

    StaticGeometryColorBatch.prototype.removeAllPrimitives = function() {
        this._solidBatch.removeAllPrimitives();
        this._translucentBatch.removeAllPrimitives();
    };

    return StaticGeometryColorBatch;
});
