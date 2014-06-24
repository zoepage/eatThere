'use strict';

window.eatThere = window.eatThere || {};

(function() {

    var ViewHelper = {
        getPersonDecrator: function(person) {
            var clazzes = ['person'];

            if(person.isInvolved === true) {
                clazzes.push('involved');
            }

            return clazzes.join(' ');
        },
    };

    window.eatThere.PeopleListViewController = PeopleListViewController;

    function PeopleListViewController() {
        this.init('people');
        this.initOnce();
    }

    PeopleListViewController.prototype = window.eatThere.mix(
        window.eatThere._BaseViewController,
        {
            // overridden _BaseViewController methods
            
            initOnce: function initOnce() {
                var that = this;

                this.peopleStore = hoodie.store('people');
                this.initOnce    = false;

                hoodie.store.on('people:add', function(addedPerson) {
                    that.update();
                });

                hoodie.store.on('people:update', function(updatedPerson) {
                    that.update();
                });
            },

            initBindings: function() {
                var that = this;

                this.viewNode.find('li').click(function(evnt) {
                    that.handlePeopleItemClicked(evnt);
                });

                this.viewNode.find('[data-js="create-person"]').keyup(function(evnt) {
                    var personName;

                    // on enter pressed
                    if(evnt.keyCode == 13) {
                        personName = $(evnt.target).val();

                        $(evnt.target).val(undefined);
                        that.createPerson(personName);
                    }
                });
            },

            fetchData: function fetchData(done) {
                var that     = this,
                    deferred = jQuery.Deferred();

                this.peopleStore
                    .findAll()
                    .then(function(people) {

                        // @TODO create a more fancy model
                        people.forEach(function(person) {
                            Object.defineProperty(person, 'states', {
                                get: function() {
                                    return ViewHelper.getPersonDecrator(this);
                                }
                            });

                        })

                        people = people.sort(function(a, b) {
                            return a.name > b.name;
                        });

                        deferred.resolve({
                            viewName: that.viewName,
                            viewHelper: ViewHelper,
                            people:people
                        });
                    });
                

                return deferred.promise();
            },

            // helpers
            
            createPerson: function(personName) {
                this.peopleStore.add({
                    name: personName,
                    isInvolved: true
                });
            },

            // event handlers
            
            handlePeopleItemClicked: function(evnt) {
                var peopleItem,
                    peopleId,
                    peopleData;

                peopleItem = $(evnt.currentTarget);
                peopleId   = peopleItem.attr('data-id');
                peopleData = this.viewData.people.filter(function(o) { 
                    return o.id == peopleId; 
                })[0];

                if(peopleData !== undefined) {
                    console.log('clicked people item', peopleData);
                    peopleData.isInvolved = peopleData.isInvolved === true ? false : true;
                    this.peopleStore.update(peopleData.id, peopleData);
                }
            }
        }
    );

})();