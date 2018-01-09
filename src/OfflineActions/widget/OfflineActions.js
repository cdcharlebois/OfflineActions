/*
 * TODO: make a context and a non context version? and/or add entity parameters
 */
define([
    "dojo/_base/declare",
    "mxui/widget/_WidgetBase",

], function(declare, _WidgetBase) {
    "use strict";

    return declare("OfflineActions.widget.OfflineActions", [_WidgetBase], {

        _contextObj: null,

        _currentActionIndex: -1,

        //the object to use when editing or opening a page. default context object, but could also be a newly created object
        _actionContextObj: null,

        _onChangeSubscription: null,

        //id of progress bar
        _pid: null,

        constructor: function() {},

        postCreate: function() {
            this._setupTrigger();
        },

        update: function(obj, callback) {
            this._contextObj = obj;
            this._updateActionContext(obj);
            if (callback) {
                callback();
            }
            if (this.trigger == "onchange") {
                this._attachOnChange();
            } else if (this.trigger === "onupdate") {
                window.setTimeout(this._run.bind(this), 0);
            }
        },

        _setupTrigger: function() {
            if (this.trigger == "onclick") {
                window.setTimeout(this._setElementEventHandler.bind(this), 50);
            } else if (this.trigger == "onload") {
                //TODO: could also be in update but only if there is a context. introduce option or two widgets
                window.setTimeout(this._run.bind(this), 0);
            }
        },

        _updateActionContext: function(obj) {
            this._actionContextObj = obj;
        },

        _performNextAction: function() {
            this._currentActionIndex++;
            if (this._currentActionIndex + 1 > this.actions.length) {
                console.log("Done with all actions");
                return;
            }
            var action = this.actions[this._currentActionIndex];
            if (action.precondition && action.precondition != "") {
                try {
                    var result = eval(this._replaceVariables(action.precondition));
                    console.log("Result of " + action.precondition + ": " + result);
                    if (result === false) {
                        console.log("skipping", action);
                        this._performNextAction();
                        return;
                    }
                } catch (e) {
                    console.log("error while evaluating precondition: " + action.precondition);
                    this._onError(action, e);
                    this._reset();
                    return;
                }
            }
            console.log("performing action " + this._currentActionIndex, action, this._actionContextObj);
            if (action.actionType == "commitObject") {
                this._performCommitObject(action);
            } else if (action.actionType == "savePage") {
                this._performSavePage(action);
            } else if (action.actionType == "createObject") {
                this._performCreateObject(action);
            } else if (action.actionType == "getOrCreateObject") {
                this._performGetOrCreateObject(action);
            } else if (action.actionType == "changeObject") {
                this._performChangeObject(action);
            } else if (action.actionType == "openPage") {
                this._performOpenPage(action);
            } else if (action.actionType == "closePage") {
                this._performClosePage(action);
            } else if (action.actionType == "closePopup") {
                this._performClosePopup(action);
            } else if (action.actionType == "sync") {
                this._performSync(action);
            } else if (action.actionType == "showProgress") {
                this._performShowProgress(action);
            } else if (action.actionType == "hideProgress") {
                this._performHideProgress(action);
            } else if (action.actionType == "custom") {
                this._performCustom(action);
            } else {
                mx.ui.error("Unknown action: " + action.actionType);
            }
        },

        _onError: function(action, e) {
            console.log("Error while executing action: ", action);
            console.log("Error: ", e);
            if (this._pid) {
                mx.ui.hideProgress(this._pid);
            }
            var msg;
            if (action.errorMessage && action.errorMessage != "") {
                msg = action.errorMessage;
            } else {
                msg = "An unexpected error occured";
            }
            mx.ui.error(msg, true);
        },

        _performShowProgress: function(action) {
            this._pid = mx.ui.showProgress();
            this._performNextAction();
        },

        _performHideProgress: function(action) {
            if (this._pid) {
                mx.ui.hideProgress(this._pid);
            }
            this._performNextAction();
        },

        _performSavePage: function(action) {
            this.mxform.commit(function() {

                if (action.syncOnSavePage) {
                    mx.data.synchronizeOffline({
                        fast: true
                    }, function() {
                        this._performNextAction();
                    }.bind(this), function(e) {
                        this._onError(action, e);
                        this._reset();
                    }.bind(this));
                } else {
                    this._performNextAction();
                }

            }.bind(this), function(e) {
                this._onError(action, e);
                this._reset();
            }.bind(this));
        },

        _performCommitObject: function(action) {
            //TODO: use entity parameter (when implemented as dropdown field) to select the entity to commit
            mx.data.commit({
                mxobj: this._contextObj,
                callback: function() {
                    //console.log("Object committed");

                    if (action.syncOnCommitObject) {
                        //console.log("syncing")
                        mx.data.synchronizeOffline({
                            fast: true
                        }, function() {
                            this._performNextAction();
                        }.bind(this), function(e) {
                            this._onError(action, e);
                            this._reset();
                        }.bind(this));
                    } else {
                        this._performNextAction();
                    }
                },
                error: function(e) {
                    this._onError(action, e);
                    this._reset();
                }
            }, this);
        },

        //TODO: support filter parameter
        _performGetOrCreateObject: function(action) {
            this._getEntity(action.getOrCreateObjectEntity, function(obj) {
                if (obj != null) {
                    this._updateActionContext(obj);
                    this._performNextAction();
                } else {
                    mx.data.create({
                        entity: action.getOrCreateObjectEntity,
                        callback: function(obj) {
                            this._updateActionContext(obj);
                            this._performNextAction();
                        },
                        error: function(e) {
                            this._onError(action, e);
                            this._reset();
                        }
                    }, this);
                }
            }.bind(this), function(e) {
                this._onError(action, e);
                this._reset();
            }.bind(this));

        },

        //TODO: use mx.data.getOffline
        _getEntity: function(entity, /*guid, attribute, */ successCallback, errorCallback) {
            console.log("Entity: " + entity);
            if (mx.isOffline()) {
                mx.data.getSlice(entity, [
                        /*{
                                                attribute: attribute,
                                                operator: "equals",
                                                value: guid
                                            }*/
                    ], {}, false,
                    function(objs, count) {
                        if (count > 0) {
                            successCallback(objs[0]);
                        } else {
                            successCallback(null);
                        }
                    },
                    function(error) {
                        errorCallback(error)
                    });
            } else {
                try {
                    mx.data.get({
                        xpath: "//" + entity /* + "[" + attribute + "=" + guid + "]"*/ ,
                        callback: function(objs) {
                            if (objs.length > 0) {
                                successCallback(objs[0]);
                            } else {
                                successCallback(null);
                            }
                        }
                    }, this);
                } catch (e) {
                    errorCallback(e);
                }
            }


        },

        _performCreateObject: function(action) {
            //console.log("creating: " + action.newObjectEntity);
            mx.data.create({
                entity: action.newObjectEntity,
                callback: function(obj) {
                    this._updateActionContext(obj);
                    this._performNextAction();
                },
                error: function(e) {
                    this._onError(action, e);
                    this._reset();
                }
            }, this);
        },

        _performChangeObject: function(action) {
            var value = eval(this._replaceVariables(action.newAttributeValue));
            //console.log("setting" + action.newAttribute + " to " + value);
            this._actionContextObj.set(action.newAttribute, value);
            this._performNextAction();
        },

        _performSync: function(action) {
            //console.log("syncing")
            mx.data.synchronizeOffline({
                fast: this.syncDataOnly
            }, function() {
                this._performNextAction();
            }.bind(this), function(e) {
                this._onError(action, e);
                this._reset();
            }.bind(this));
        },

        _performOpenPage: function(action) {
            if (this._actionContextObj) {
                var context = new mendix.lib.MxContext();
                context.setContext(this._actionContextObj.getEntity(), this._actionContextObj.getGuid());
                mx.ui.openForm(action.openPage, {
                    location: action.openPageLocation,
                    context: context,
                    callback: function(form) {
                        this._performNextAction();
                    }
                }, this);
            } else {
                mx.ui.openForm(action.openPage, {
                    location: "content",
                    callback: function(form) {
                        this._performNextAction();
                    }
                }, this);
            }
        },

        _performClosePage: function(action) {
            mx.ui.back();
            this._performNextAction();
        },

        _performClosePopup: function(action) {
            this.mxform.close();
            this._performNextAction();
        },

        _performCustom: function(action) {
            //TODO: support Promises
            console.log("action.customAction", action.customAction)
            try {
                eval(this._replaceVariables(action.customAction));
                this._performNextAction();
            } catch (e) {
                this._onError(action, e);
                this._reset();
            }
        },

        _run: function(callback) {
            if (callback) {
                callback();
            }
            this._reset();
            this._performNextAction();
        },

        _reset: function() {
            this._currentActionIndex = -1;
        },

        _onclickAction: function() {
            this._run();
        },

        _setElementEventHandler: function() {
            var elements = document.getElementsByClassName("mx-name-" + this.elementName.trim());
            //console.log(elements);
            if (elements.length == 0) {
                //mx.ui.error("Found " + elements.length + " elements instead of 1");
                //TODO: sometimes happens after a close.
                console.log("Found " + elements.length + " elements instead of 1");
                return;
            }
            elements[0].addEventListener("click", this._onclickAction.bind(this));
        },

        _attachOnChange: function() {
            if (this._onChangeSubscription) {
                this.unsubscribe(this._onChangeSubscription);
            }
            this._onChangeSubscription = this.subscribe({
                guid: this._contextObj.getGuid(),
                attr: this.onChangeAttribute,
                callback: function(guid) {
                    mx.data.get({
                        guid: guid,
                        callback: function(obj) {
                            this._currentValue = obj.get(this.onChangeAttribute);
                            this._run();
                        }
                    }, this);
                }
            }, this);
        },

        _replaceVariables: function(code) {
            if (this._contextObj) {
                var attributes = this._contextObj.metaData.getAttributesWithoutReferences();
                for (var i = 0; i < attributes.length; i++) {
                    code = code.replace(new RegExp('\\$' + attributes[i], 'g'), '' + this._contextObj.get(attributes[i]) + '');
                    //code = code.replace(new RegExp('\\$currentObject/' + attributes[i], 'g'), '' + this._contextObj.get(attributes[i]) + '');
                }
            }

            if (this._currentValue) {
                code = code.replace(new RegExp('\\$value', 'g'), '' + this._currentValue + '');
            }
            return code;
        }

    });
});

require(["OfflineActions/widget/OfflineActions"]);