'use strict';

window.eatThere = window.eatThere || {};

(function() {
    var Eatery = window.eatThere.models.Eatery;

    var ViewHelper = {
        getEateryDecrator: function(eatery) {
            var clazzes = ['eatery'];

            if(eatery.isWanted === true) {
                clazzes.push('involved');
            }

            return clazzes.join(' ');
        },
    };

    window.eatThere.EateryListViewController = EateryListViewController;

    function EateryListViewController() {
        this.init('eateries');
        this.initOnce();
    }

    EateryListViewController.prototype = window.eatThere.mix(
        window.eatThere._BaseViewController,
        {
            // overridden _BaseViewController methods

            initOnce: function initOnce() {
                var that = this;

                this.eateryStore = hoodie.store('eatery');
                this.initOnce    = false;

                hoodie.store.on('eatery:add', function(addedEatery) {
                    that.update();
                });

                hoodie.store.on('eatery:update', function(updatedEatery) {
                    that.update();
                });

                hoodie.store.on('eatery:remove', function(deletedEatery) {
                    that.update();
                });
            },

            initBindings: function() {
                var that = this;

                this.viewNode.find('li .name-eatery').click(function(evnt) {
                    that.handleEateryItemClicked(evnt);
                });

                this.viewNode.find('li .delete-eatery').click(function(evnt) {
                    that.handleEateryItemDelete(evnt);
                });

                this.viewNode.find('[data-js="create-eatery"]').keyup(function(evnt) {
                    var eateryTitle;

                    // on enter pressed
                    if(evnt.keyCode == 13) {
                        eateryTitle = $(evnt.target).val();

                        $(evnt.target).val(undefined);
                        that.createEatery(eateryTitle);
                    }
                });
            },

            fetchData: function fetchData(done) {
                var that     = this,
                    deferred = jQuery.Deferred();

                Eatery.allAscendingByName()
                    .then(function(eatery) {
                        // @TODO find a less nasty solution
                        // patch model a viewhelper
                        eatery.forEach(function(eatery) {
                          Object.defineProperty(eatery, 'states', {
                              get: function() {
                                  return ViewHelper.getEateryDecrator(this);
                              }
                          });
                        });

                        deferred.resolve({
                          viewName: that.viewName,
                          viewHelper: ViewHelper,
                          eatery:eatery
                        });
                    });

                return deferred.promise();
            },

            // helpers
            
            createEatery: function(eateryTitle) {
                Eatery.createEatery({
                    title: eateryTitle,
                    adress : '',
                    isWanted: true
                });
            },

            // event handlers
            
            handleEateryItemClicked: function(evnt) {
                var eateryItem,
                    eateryId,
                    eatery;

                eateryItem = $(evnt.currentTarget).parent();
                eateryId   = eateryItem.attr('data-id');
                eatery     = this.viewData.eatery.filter(function(o) { 
                    return o.id == eateryId; 
                })[0];

                if(eatery !== undefined) {
                    eatery.isWanted = eatery.isWanted === true ? false : true;
                    eatery.save();
                }
            },

            handleEateryItemDelete: function(evnt) {
                var eateryItem,
                    eateryId,
                    eatery;

                eateryItem = $(evnt.currentTarget).parent();
                eateryId   = eateryItem.attr('data-id');
                eatery     = this.viewData.eatery.filter(function(o) { 
                    return o.id == eateryId; 
                })[0];

                if(eatery !== undefined) {
                    Eatery.remove(eatery.id);
                }
            }
            
        }
    );

})();

